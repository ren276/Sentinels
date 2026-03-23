"""
Post-mortem generation using Ollama llama3.2:3b.
Background job called via:
    loop = asyncio.get_event_loop()
    loop.create_task(postmortem_job_handler(incident_id, generated_by))
Positional args only — never keyword args from create_task.
"""
from __future__ import annotations
import json
from datetime import datetime, timezone
from typing import AsyncGenerator

import redis.asyncio as aioredis
import structlog

from api.config import settings

log = structlog.get_logger()
OLLAMA_MODEL = "llama3.2:3b"


def build_postmortem_prompt(
    incident: dict,
    timeline: list[dict],
    metrics_during: dict,
    rca_text: str,
) -> str:
    duration = incident.get("duration_minutes", "unknown")
    affected = incident.get("affected_services", [])
    return f"""You are writing a production incident post-mortem document for an engineering team.

INCIDENT DETAILS:
  ID: {incident["incident_id"]}
  Service: {incident["service_id"]}
  Severity: {incident["severity"]}
  Duration: {duration} minutes
  Affected services: {affected}

TIMELINE:
{chr(10).join(
    f"  {e['timestamp']} — {e['event']}"
    for e in timeline
)}

METRICS DURING INCIDENT:
  Peak P95 Latency: {metrics_during.get("peak_p95_latency_ms", "N/A")}ms
  Peak Error Rate: {metrics_during.get("peak_error_rate", 0) * 100 if metrics_during.get("peak_error_rate") else 0:.2f}%
  Peak CPU: {metrics_during.get("peak_cpu", 0) * 100 if metrics_during.get("peak_cpu") else 0:.1f}%

ROOT CAUSE ANALYSIS:
{rca_text or "Not yet generated."}

Write a professional post-mortem with these exact sections. Use plain text, no markdown headers with #. Use CAPS for section titles:

SUMMARY
One paragraph describing what happened, impact, and duration.

TIMELINE
List each event with timestamp and description. Include: detected, first alert, acknowledged, root cause identified, fix applied, resolved.

IMPACT
What was affected. Estimated user impact. Duration of degradation per service.

ROOT CAUSE
Technical explanation of what caused the incident. Include contributing factors.

CONTRIBUTING FACTORS
List 2-4 things that made this worse or allowed it to happen.

ACTION ITEMS
List 3-5 concrete preventive measures. Format: [OWNER] Action description (PRIORITY: High/Med/Low)

LESSONS LEARNED
One paragraph on what the team learned.

Be direct and technical. Write for an engineering audience. No corporate fluff."""


async def generate_postmortem_stream(
    incident: dict,
    timeline: list[dict],
    metrics_during: dict,
    rca_text: str,
) -> AsyncGenerator[str, None]:
    from openai import AsyncOpenAI

    ollama_client = AsyncOpenAI(
        base_url=settings.OLLAMA_BASE_URL,
        api_key="ollama",
    )

    try:
        stream = await ollama_client.chat.completions.create(
            model=settings.OLLAMA_MODEL,
            messages=[{
                "role": "user",
                "content": build_postmortem_prompt(
                    incident, timeline, metrics_during, rca_text,
                ),
            }],
            temperature=0.3,
            max_tokens=1000,
            stream=True,
        )
        log.info("postmortem.ollama_stream_started", model=settings.OLLAMA_MODEL)
        async for chunk in stream:
            delta = chunk.choices[0].delta.content
            if delta:
                yield delta
    except Exception as exc:
        log.error("postmortem.ollama_failed", error=str(exc))
        yield (
            f"Post-mortem generation unavailable.\n"
            f"Ensure Ollama is running: ollama serve\n"
            f"Error: {str(exc)}"
        )


async def postmortem_job_handler(
    incident_id: str,
    generated_by: str,
) -> None:
    """
    Background post-mortem job.
    Called ONLY via: loop.create_task(postmortem_job_handler(a, b))
    Positional args only. Never keyword args from create_task.
    """
    redis_client = await aioredis.from_url(settings.REDIS_URL, decode_responses=True)
    job_key = f"postmortem:job:{incident_id}"

    try:
        await redis_client.set(job_key, json.dumps({
            "status": "generating",
            "content": "Analyzing incident data...",
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }), ex=7200)

        # Gather all context using db session
        from api.database import (
            AsyncSessionLocal, get_incident_by_id,
            get_incident_timeline, get_metrics_during_incident,
        )

        log.info("postmortem.gathering_data", incident_id=incident_id)
        async with AsyncSessionLocal() as db:
            incident = await get_incident_by_id(db, incident_id)
            if not incident:
                log.error("postmortem.incident_not_found", incident_id=incident_id)
                raise ValueError(f"Incident {incident_id} not found")

            timeline = await get_incident_timeline(db, incident_id)
            metrics = await get_metrics_during_incident(
                db,
                incident["service_id"],
                incident["created_at"],
                incident.get("resolved_at"),
            )
        log.info("postmortem.data_gathered", timeline_count=len(timeline))

        # Get RCA from Redis if available
        rca_data = await redis_client.get(f"rca:job:{incident_id}")
        rca_text = ""
        if rca_data:
            rca_obj = json.loads(rca_data)
            rca_text = rca_obj.get("result", "")

        # Calculate duration
        if incident.get("resolved_at"):
            try:
                created = incident["created_at"]
                if isinstance(created, str):
                    created = datetime.fromisoformat(created.replace("Z", "+00:00"))
                
                resolved = incident["resolved_at"]
                if isinstance(resolved, str):
                    resolved = datetime.fromisoformat(resolved.replace("Z", "+00:00"))

                if created.tzinfo is None:
                    created = created.replace(tzinfo=timezone.utc)
                if resolved.tzinfo is None:
                    resolved = resolved.replace(tzinfo=timezone.utc)
                duration = int((resolved - created).total_seconds() / 60)
            except Exception as e:
                log.warning("postmortem.duration_calc_failed", error=str(e))
                duration = None
        else:
            duration = None

        incident["duration_minutes"] = duration

        # Stream generation
        accumulated = ""
        log.info("postmortem.starting_stream", incident_id=incident_id)
        async for chunk in generate_postmortem_stream(
            incident, timeline, metrics, rca_text
        ):
            accumulated += chunk
            await redis_client.set(job_key, json.dumps({
                "status": "generating",
                "content": accumulated,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }), ex=7200)
        log.info("postmortem.stream_finished", content_len=len(accumulated))

        # Save to DB
        pm_id = f"pm-{incident_id}"
        async with AsyncSessionLocal() as db:
            from api.database import save_postmortem
            await save_postmortem(
                db, pm_id, incident_id, generated_by,
                accumulated, duration,
                list(incident.get("affected_services", []) or []),
                timeline,
            )

        await redis_client.set(job_key, json.dumps({
            "status": "done",
            "content": accumulated,
            "postmortem_id": pm_id,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }), ex=7200)

        log.info("postmortem_job.done", incident_id=incident_id)

    except Exception as exc:
        log.error("postmortem_job.failed", incident_id=incident_id, error=str(exc))
        await redis_client.set(job_key, json.dumps({
            "status": "error",
            "content": f"Generation failed: {str(exc)}",
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }), ex=7200)
    finally:
        await redis_client.aclose()
