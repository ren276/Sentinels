from datetime import datetime
from typing import Any
from slack_sdk.webhook.async_client import AsyncWebhookClient
import structlog
from api.config import settings

log = structlog.get_logger()

async def send_slack_alert(
    incident: dict,
    anomaly: dict,
    rca_text: str | None = None,
) -> bool:
    if not settings.SLACK_ENABLED:
        return False
    if not settings.SLACK_WEBHOOK_URL:
        return False

    severity = incident["severity"]
    service = incident["service_id"]
    score = incident.get("anomaly_score_at_trigger", 0)

    if severity == "critical":
        emoji = "🔴"
        color = "#EF4444"
        mention = (
            f"<@{settings.SLACK_MENTION_ON_CRITICAL}> "
            if settings.SLACK_MENTION_ON_CRITICAL else ""
        )
    elif severity == "warning":
        emoji = "🟡"
        color = "#F59E0B"
        mention = ""
    else:
        emoji = "🔵"
        color = "#3B82F6"
        mention = ""

    blocks = [
        {
            "type": "header",
            "text": {
                "type": "plain_text",
                "text": f"{emoji} {severity.upper()} — {service}",
            },
        },
        {
            "type": "section",
            "fields": [
                {
                    "type": "mrkdwn",
                    "text": f"*Service*\n`{service}`",
                },
                {
                    "type": "mrkdwn",
                    "text": f"*Anomaly Score*\n`{score:.2f}`",
                },
                {
                    "type": "mrkdwn",
                    "text": f"*Incident ID*\n`{incident['incident_id']}`",
                },
                {
                    "type": "mrkdwn",
                    "text": (
                        f"*Detected*\n"
                        f"<!date^{int((incident['created_at'] if isinstance(incident['created_at'], datetime) else datetime.fromisoformat(incident['created_at'].replace('Z', '+00:00'))).timestamp())}^{{date_short_pretty}} {{time}}|just now>"
                    ),
                },
            ],
        },
    ]

    if incident.get("summary"):
        blocks.append({
            "type": "section",
            "text": {
                "type": "mrkdwn",
                "text": f"*Summary*\n{incident['summary']}",
            },
        })

    if rca_text:
        rca_snippet = rca_text[:300] + ("..." if len(rca_text) > 300 else "")
        blocks.append({
            "type": "section",
            "text": {
                "type": "mrkdwn",
                "text": f"*RCA Preview*\n{rca_snippet}",
            },
        })

    blocks.append({
        "type": "actions",
        "elements": [
            {
                "type": "button",
                "text": {
                    "type": "plain_text",
                    "text": "View Incident",
                },
                "url": f"http://localhost:3000/incidents?id={incident['incident_id']}",
                "style": "primary",
            },
            {
                "type": "button",
                "text": {
                    "type": "plain_text",
                    "text": "Acknowledge",
                },
                "url": f"http://localhost:3000/incidents?id={incident['incident_id']}&action=acknowledge",
            },
        ],
    })

    blocks.append({"type": "divider"})

    try:
        client = AsyncWebhookClient(settings.SLACK_WEBHOOK_URL)
        response = await client.send(
            text=(f"{mention}{emoji} {severity.upper()}: {service} anomaly detected (score: {score:.2f})"),
            attachments=[{"color": color, "blocks": blocks}],
        )
        success = response.status_code == 200
        log.info("slack.alert.sent", incident_id=incident["incident_id"], severity=severity, success=success)
        return success
    except Exception as exc:
        log.error("slack.alert.failed", incident_id=incident["incident_id"], error=str(exc))
        return False

async def send_slack_resolution(incident: dict) -> bool:
    if not settings.SLACK_ENABLED:
        return False

    service = incident["service_id"]
    duration = incident.get("duration_minutes", "?")

    blocks = [
        {
            "type": "section",
            "text": {
                "type": "mrkdwn",
                "text": (
                    f"✅ *RESOLVED* — `{service}`\n"
                    f"Incident `{incident['incident_id']}` resolved after {duration} minutes."
                ),
            },
        }
    ]

    if incident.get("resolution_note"):
        blocks.append({
            "type": "section",
            "text": {
                "type": "mrkdwn",
                "text": f"*Resolution note*\n{incident['resolution_note']}",
            },
        })

    try:
        client = AsyncWebhookClient(settings.SLACK_WEBHOOK_URL)
        await client.send(text=f"✅ Resolved: {service}", blocks=blocks)
        return True
    except Exception as exc:
        log.error("slack.resolution.failed", error=str(exc))
        return False

async def send_slack_digest(incidents: list[dict], period_minutes: int = 15) -> bool:
    if not settings.SLACK_ENABLED:
        return False
    if not incidents:
        return True

    blocks = [
        {
            "type": "header",
            "text": {
                "type": "plain_text",
                "text": f"🟡 Alert Digest — Last {period_minutes} minutes",
            },
        },
        {
            "type": "section",
            "text": {
                "type": "mrkdwn",
                "text": "\n".join([
                    f"• `{i['service_id']}` — {i['severity']} (score: {i['anomaly_score_at_trigger']:.2f})"
                    for i in incidents
                ]),
            },
        },
        {
            "type": "actions",
            "elements": [
                {
                    "type": "button",
                    "text": {"type": "plain_text", "text": "View All Incidents"},
                    "url": "http://localhost:3000/incidents",
                }
            ],
        },
    ]

    try:
        client = AsyncWebhookClient(settings.SLACK_WEBHOOK_URL)
        await client.send(
            text=f"🟡 {len(incidents)} alerts in last {period_minutes} minutes",
            blocks=blocks,
        )
        return True
    except Exception as exc:
        log.error("slack.digest.failed", error=str(exc))
        return False

async def test_slack_webhook(webhook_url: str) -> dict[str, Any]:
    try:
        client = AsyncWebhookClient(webhook_url)
        response = await client.send(
            text="",
            blocks=[
                {
                    "type": "section",
                    "text": {
                        "type": "mrkdwn",
                        "text": "✅ *Sentinel webhook test*\nYour Slack integration is working correctly!",
                    },
                }
            ],
        )
        return {"success": response.status_code == 200, "status_code": response.status_code}
    except Exception as exc:
        return {"success": False, "error": str(exc)}
