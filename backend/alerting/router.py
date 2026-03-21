"""
Alert routing, deduplication, and runbook execution.
Channels: console log (always), Slack (optional), Email (optional).
"""
import json
import smtplib
import ssl
from datetime import datetime, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Any, Optional

import httpx
import structlog

log = structlog.get_logger()

SEVERITY_BANDS = {
    "critical": 0.9,
    "warning": 0.7,
    "info": 0.5,
}


def get_severity(anomaly_score: float) -> str:
    if anomaly_score >= SEVERITY_BANDS["critical"]:
        return "critical"
    elif anomaly_score >= SEVERITY_BANDS["warning"]:
        return "warning"
    elif anomaly_score >= SEVERITY_BANDS["info"]:
        return "info"
    return "info"


async def route_alert(
    service_id: str,
    anomaly_score: float,
    incident_id: str,
    metrics: dict,
    redis: Any,
) -> bool:
    """
    Route alert with deduplication.
    Returns True if alert was sent, False if deduplicated.
    """
    severity = get_severity(anomaly_score)

    # Deduplication key: 5-minute windows
    now_ts = int(datetime.now(timezone.utc).timestamp())
    window_bucket = now_ts // 300
    dedup_key = f"alert:dedup:{service_id}:{severity}:{window_bucket}"

    if await redis.exists(dedup_key):
        await redis.incr(f"{dedup_key}:count")
        log.debug(
            "alert.deduplicated",
            service_id=service_id,
            severity=severity,
        )
        return False

    await redis.setex(dedup_key, 300, "1")

    alert_data = {
        "service_id": service_id,
        "severity": severity,
        "anomaly_score": anomaly_score,
        "incident_id": incident_id,
        "metrics": metrics,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }

    # Console (always)
    log.warning(
        "alert.fired",
        service_id=service_id,
        severity=severity,
        anomaly_score=anomaly_score,
        incident_id=incident_id,
    )

    # Slack (optional)
    try:
        from api.config import settings
        if hasattr(settings, "SLACK_WEBHOOK_URL") and settings.SLACK_WEBHOOK_URL:
            await _send_slack_alert(alert_data, settings.SLACK_WEBHOOK_URL)
    except Exception as exc:
        log.warning("alert.slack.failed", error=str(exc))

    # Email (optional)
    try:
        from api.config import settings
        if hasattr(settings, "SMTP_FROM") and settings.SMTP_FROM:
            await _send_email_alert(alert_data)
    except Exception as exc:
        log.warning("alert.email.failed", error=str(exc))

    return True


async def _send_slack_alert(alert_data: dict, webhook_url: str) -> None:
    """Send Slack notification via webhook."""
    severity = alert_data["severity"]
    color_map = {"critical": "#EF4444", "warning": "#F59E0B", "info": "#3B82F6"}
    color = color_map.get(severity, "#8B8B8B")

    payload = {
        "text": f"[{severity.upper()}] {alert_data['service_id']}",
        "attachments": [{
            "color": color,
            "fields": [
                {"title": "Service", "value": alert_data["service_id"], "short": True},
                {"title": "Score", "value": f"{alert_data['anomaly_score']:.2f}", "short": True},
                {"title": "Incident", "value": alert_data["incident_id"], "short": True},
                {"title": "Time", "value": alert_data["timestamp"], "short": True},
            ],
        }],
    }

    async with httpx.AsyncClient(timeout=5.0) as client:
        await client.post(webhook_url, json=payload)


async def _send_email_alert(alert_data: dict) -> None:
    """Send email notification via SMTP."""
    from api.config import settings

    smtp_host = getattr(settings, "SMTP_HOST", "smtp.gmail.com")
    smtp_port = getattr(settings, "SMTP_PORT", 465)
    smtp_from = getattr(settings, "SMTP_FROM", "")
    smtp_password = getattr(settings, "SMTP_PASSWORD", "")

    if not smtp_from or not smtp_password:
        return

    severity = alert_data["severity"]
    subject = f"[SENTINEL] {severity.upper()} - {alert_data['service_id']}"
    body = f"""
    <html><body>
    <h2>Sentinel Alert: {severity.upper()}</h2>
    <p>Service: <strong>{alert_data["service_id"]}</strong></p>
    <p>Anomaly Score: <strong>{alert_data["anomaly_score"]:.2f}</strong></p>
    <p>Incident ID: {alert_data["incident_id"]}</p>
    <p>Time: {alert_data["timestamp"]}</p>
    </body></html>
    """

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = smtp_from
    msg["To"] = smtp_from
    msg.attach(MIMEText(body, "html"))

    context = ssl.create_default_context()
    with smtplib.SMTP_SSL(smtp_host, smtp_port, context=context) as server:
        server.login(smtp_from, smtp_password)
        server.sendmail(smtp_from, smtp_from, msg.as_string())


# ── Runbook definitions ─────────────────────────────────────────────────────

RUNBOOK_DEFINITIONS = {
    "high_cpu": {
        "id": "high_cpu",
        "name": "High CPU Response",
        "description": "Attempt to reduce CPU load via GC trigger or horizontal scaling.",
        "trigger": "cpu_usage > 0.85 for 5min",
        "risk_level": "low",
        "dry_run_default": False,
        "actions": [
            {"type": "http", "method": "POST", "url": "{service_url}/admin/gc", "timeout": 10},
        ],
    },
    "memory_pressure": {
        "id": "memory_pressure",
        "name": "Memory Pressure Response",
        "description": "Log memory stats and consider service restart.",
        "trigger": "mem_usage > 0.90",
        "risk_level": "medium",
        "dry_run_default": True,
        "actions": [
            {"type": "log", "message": "Memory pressure on {service} — consider restart"},
        ],
    },
    "circuit_breaker": {
        "id": "circuit_breaker",
        "name": "Circuit Breaker Activation",
        "description": "Enable circuit breaker to stop error cascade.",
        "trigger": "error_rate > 0.10 for 2min",
        "risk_level": "high",
        "dry_run_default": True,
        "requires_approval": True,
        "actions": [
            {
                "type": "http",
                "method": "POST",
                "url": "{service_url}/admin/circuit-breaker",
                "body": '{"enabled": true}',
                "timeout": 10,
            },
        ],
    },
}


async def execute_runbook(
    runbook_id: str,
    incident_id: Optional[str],
    dry_run: bool,
    executed_by: str,
    confirmed: bool = False,
    parameters: dict | None = None,
) -> dict:
    """Execute a runbook with audit logging."""
    runbook = RUNBOOK_DEFINITIONS.get(runbook_id)
    if not runbook:
        return {"status": "error", "message": f"Runbook {runbook_id!r} not found"}

    if runbook.get("requires_approval") and runbook["risk_level"] == "high" and not confirmed:
        return {
            "status": "requires_confirmation",
            "message": "High risk action requires confirmed=true in request body",
        }

    log.info(
        "runbook.execute",
        runbook_id=runbook_id,
        incident_id=incident_id,
        dry_run=dry_run,
        executed_by=executed_by,
        risk_level=runbook["risk_level"],
    )

    if dry_run:
        return {
            "status": "dry_run",
            "runbook": runbook["name"],
            "would_execute": runbook["actions"],
        }

    results = []
    for action in runbook.get("actions", []):
        if action["type"] == "http":
            result = await _execute_http_action(action, parameters or {})
        elif action["type"] == "log":
            message = action["message"].format(**{"service": incident_id or "unknown"})
            log.info("runbook.log_action", message=message)
            result = {"type": "log", "status": "done", "message": message}
        else:
            result = {"type": action["type"], "status": "unknown_action_type"}
        results.append(result)

    return {"status": "executed", "runbook": runbook["name"], "results": results}


async def _execute_http_action(action: dict, parameters: dict) -> dict:
    """Execute an HTTP action from a runbook."""
    url = action.get("url", "").format(**parameters)
    method = action.get("method", "POST")
    body = action.get("body")
    timeout = action.get("timeout", 10)

    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.request(
                method=method,
                url=url,
                content=body,
                headers={"Content-Type": "application/json"} if body else {},
            )
            return {
                "type": "http",
                "url": url,
                "status_code": response.status_code,
                "status": "success" if response.is_success else "failed",
            }
    except Exception as exc:
        return {"type": "http", "url": url, "status": "error", "error": str(exc)}
