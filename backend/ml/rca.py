"""
Ollama llama3.2:3b RCA generation with streaming.
ALWAYS use llama3.2:3b — never llama3.1:8b.

Background job called via:
    loop = asyncio.get_event_loop()
    loop.create_task(rca_job_handler(incident_id, service_id, anomaly_score))
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
OLLAMA_MODEL = "llama3.2:3b"  # always 3b, never 8b


def build_rca_prompt(
    service: str,
    anomaly_score: float,
    metrics: dict,
    logs: list[str],
    graph: dict,
) -> str:
    upstream = graph.get("upstream", [])
    downstream = graph.get("downstream", [])
    return f"""You are a senior SRE analyzing a production incident.

Service Under Analysis: {service}
Anomaly Score: {anomaly_score:.2f}/1.00
  (0.00=normal, 0.70=warning threshold, 1.00=critical)

Service Dependencies:
  Upstream (callers): {upstream or "none"}
  Downstream (dependencies): {downstream or "none"}

Current Metrics:
  P95 Latency:  {metrics.get("p95_latency_ms","N/A")}ms
  P50 Latency:  {metrics.get("p50_latency_ms","N/A")}ms
  Error Rate:   {float(metrics.get("error_rate",0))*100:.2f}%
  CPU Usage:    {float(metrics.get("cpu_usage",0))*100:.1f}%
  Memory Usage: {float(metrics.get("mem_usage",0))*100:.1f}%
  Req/sec:      {metrics.get("req_per_second","N/A")}

Recent Log Lines (last 20):
{chr(10).join(f"  {line}" for line in logs[-20:])}

Provide a concise technical incident analysis:

SUMMARY: One paragraph describing what is happening.

ROOT CAUSES (rank by probability):
1. [Most likely cause with reasoning]
2. [Second most likely]
3. [Third possibility]

IMMEDIATE ACTIONS:
1. [First thing to do right now]
2. [Second action]
3. [Third action]

PREVENTION: One sentence on how to prevent recurrence.

Be direct and technical. No markdown formatting."""


async def generate_rca_stream(
    service: str,
    anomaly_score: float,
    metrics: dict,
    logs: list[str],
    graph: dict,
) -> AsyncGenerator[str, None]:
    from openai import AsyncOpenAI

    try:
        from observability.metrics import rca_generations_total, ollama_response_duration
    except ImportError:
        rca_generations_total = None
        ollama_response_duration = None

    ollama_client = AsyncOpenAI(
        base_url=settings.OLLAMA_BASE_URL,
        api_key="ollama",
    )

    start = datetime.now(timezone.utc)
    try:
        stream = await ollama_client.chat.completions.create(
            model=settings.OLLAMA_MODEL,
            messages=[{
                "role": "user",
                "content": build_rca_prompt(service, anomaly_score, metrics, logs, graph),
            }],
            temperature=0.3,
            max_tokens=600,
            stream=True,
        )
        async for chunk in stream:
            delta = chunk.choices[0].delta.content
            if delta:
                yield delta
        duration = (datetime.now(timezone.utc) - start).total_seconds()
        if ollama_response_duration:
            ollama_response_duration.observe(duration)
        if rca_generations_total:
            rca_generations_total.labels(status="success").inc()
    except Exception as exc:
        if rca_generations_total:
            rca_generations_total.labels(status="error").inc()
        yield (
            f"RCA unavailable. Ollama may not be running.\n\n"
            f"To fix:\n"
            f"  1. Run: ollama serve\n"
            f"  2. Run: ollama pull llama3.2:3b\n"
            f"  3. Retry RCA generation\n\n"
            f"Technical error: {str(exc)}\n\n"
            f"Manual analysis hint: anomaly score "
            f"{anomaly_score:.2f} on {service}. "
            f"Check the metrics charts above for the "
            f"time window around this incident."
        )


async def get_service_metrics_summary(service_id: str) -> dict:
    """Get latest metric snapshot for a service."""
    try:
        from api.database import AsyncSessionLocal, get_service_metrics
        from sqlalchemy import text
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                text("""
                    SELECT metric_name, value
                    FROM metrics
                    WHERE service_id = :sid
                    AND timestamp > NOW() - INTERVAL '5 minutes'
                    ORDER BY timestamp DESC
                """),
                {"sid": service_id}
            )
            rows = result.all()
        return {row[0]: row[1] for row in rows}
    except Exception:
        return {}


async def get_recent_log_lines(service_id: str, count: int = 20) -> list[str]:
    """Simulated log lines — in production these would come from log aggregator."""
    return [
        f"[INFO] {service_id}: Request processed in 245ms",
        f"[WARN] {service_id}: High memory allocation detected",
        f"[ERROR] {service_id}: Connection pool exhausted",
        f"[INFO] {service_id}: Health check responding slowly",
        f"[WARN] {service_id}: CPU throttling detected",
    ]


async def get_service_graph(service_id: str) -> dict:
    """Get service dependency graph context."""
    return {"upstream": [], "downstream": []}


async def rca_job_handler(
    incident_id: str,
    service_id: str,
    anomaly_score: float,
) -> None:
    """
    Background RCA job.
    Called ONLY via: loop.create_task(rca_job_handler(a, b, c))
    Positional args only. Never keyword args from create_task.
    """
    redis_client = await aioredis.from_url(settings.REDIS_URL, decode_responses=True)
    job_key = f"rca:job:{incident_id}"

    try:
        log.info("rca_job.started", incident_id=incident_id, service_id=service_id)
        
        # Initial status update
        initial_payload = {
            "status": "streaming",
            "result": "Initializing Ollama analysis engine...",
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        await redis_client.set(job_key, json.dumps(initial_payload), ex=3600)
        
        from api.websocket_manager import ws_manager
        await ws_manager.broadcast({
            "type": "rca_update",
            "incident_id": incident_id,
            **initial_payload
        })

        log.debug("rca_job.gathering_context", service_id=service_id)
        metrics = await get_service_metrics_summary(service_id)
        logs = await get_recent_log_lines(service_id, 20)
        graph = await get_service_graph(service_id)

        import time
        accumulated = ""
        last_broadcast_time = 0
        throttle_interval = 0.2  # 200ms throttle
        
        async for chunk in generate_rca_stream(
            service=service_id,
            anomaly_score=anomaly_score,
            metrics=metrics,
            logs=logs,
            graph=graph,
        ):
            accumulated += chunk
            now = time.perf_counter()
            
            # Throttle broadcasts to avoid over-whelming frontend
            if now - last_broadcast_time > throttle_interval:
                payload = {
                    "status": "streaming",
                    "result": accumulated,
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                }
                await redis_client.set(job_key, json.dumps(payload), ex=3600)
                await ws_manager.broadcast({
                    "type": "rca_update",
                    "incident_id": incident_id,
                    **payload
                })
                last_broadcast_time = now

        final_payload = {
            "status": "done",
            "result": accumulated,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        await redis_client.set(job_key, json.dumps(final_payload), ex=3600)
        
        await ws_manager.broadcast({
            "type": "rca_update",
            "incident_id": incident_id,
            **final_payload
        })

    except Exception as exc:
        log.error("rca_job.failed", incident_id=incident_id, error=str(exc))
        await redis_client.set(job_key, json.dumps({
            "status": "error",
            "result": f"Analysis failed: {str(exc)}",
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }), ex=3600)
    finally:
        await redis_client.aclose()
