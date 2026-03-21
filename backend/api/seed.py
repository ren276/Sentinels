"""
Sentinel seed data — realistic 7-day dataset.
Run on startup if ENVIRONMENT=development.
Idempotent: INSERT ... ON CONFLICT DO NOTHING.
"""
import json
import math
import random
import uuid
from datetime import datetime, timedelta, timezone

import numpy as np
import structlog
from sqlalchemy import text

from .database import AsyncSessionLocal
from .security import hash_password

log = structlog.get_logger()

SERVICES = [
    "api-gateway", "auth-service", "payment-service",
    "user-service", "notification-service", "search-service",
    "inventory-service", "order-service", "analytics-service",
    "cache-service", "queue-service", "storage-service",
]

METRICS = [
    "p95_latency_ms", "p50_latency_ms", "error_rate",
    "cpu_usage", "mem_usage", "req_per_second",
]

BASE_VALUES = {
    "p95_latency_ms": (120.0, 15.0),
    "p50_latency_ms": (55.0, 8.0),
    "error_rate": (0.002, 0.001),
    "cpu_usage": (0.35, 0.08),
    "mem_usage": (0.55, 0.07),
    "req_per_second": (450.0, 80.0),
}

METRIC_CLAMPS = {
    "p95_latency_ms": (0, 30000),
    "p50_latency_ms": (0, 15000),
    "error_rate": (0, 1),
    "cpu_usage": (0, 1),
    "mem_usage": (0, 1),
    "req_per_second": (0, 1_000_000),
}


def _diurnal(hour: int, weekday: int) -> float:
    """Simulate realistic traffic patterns."""
    base = 1.4 if 9 <= hour <= 17 else 0.7
    if weekday >= 5:  # Weekend
        base *= 0.6
    return base


def _generate_metric_value(metric: str, ts: datetime, noise_scale: float = 1.0) -> float:
    mean, std = BASE_VALUES[metric]
    diurnal = _diurnal(ts.hour, ts.weekday())
    value = mean * diurnal + np.random.normal(0, std * noise_scale)
    lo, hi = METRIC_CLAMPS[metric]
    return float(np.clip(value, lo, hi))


def _anomaly_window(now: datetime) -> list[tuple[datetime, datetime]]:
    """4 anomaly windows per service spaced across 7 days."""
    windows = []
    for day_offset in [1, 2, 4, 6]:
        start = now - timedelta(days=day_offset, hours=random.randint(0, 20))
        duration = timedelta(minutes=random.randint(15, 45))
        windows.append((start, start + duration))
    return windows


async def seed_database() -> None:
    async with AsyncSessionLocal() as db:
        # ── Users ──────────────────────────────────────────────────────────────
        await db.execute(text("""
            INSERT INTO users (user_id, username, email, hashed_password, role, is_active)
            VALUES
              (:uid1, 'admin', 'admin@sentinel.local', :hp_admin, 'admin', TRUE),
              (:uid2, 'viewer', 'viewer@sentinel.local', :hp_viewer, 'viewer', TRUE)
            ON CONFLICT (username) DO NOTHING
        """), {
            "uid1": str(uuid.uuid4()),
            "uid2": str(uuid.uuid4()),
            "hp_admin": hash_password("Sentinel@Admin1"),
            "hp_viewer": hash_password("Sentinel@View1"),
        })

        # ── Services ───────────────────────────────────────────────────────────
        for svc in SERVICES:
            await db.execute(text("""
                INSERT INTO services (service_id, name, environment, version, health_status, tags)
                VALUES (:sid, :name, 'production', '1.0.0', 'healthy', CAST(:tags AS jsonb))
                ON CONFLICT (service_id) DO NOTHING
            """), {
                "sid": svc,
                "name": svc.replace("-", " ").title(),
                "tags": json.dumps({"team": "platform", "tier": "critical"}),
            })

        # ── Default platform settings ──────────────────────────────────────────
        settings_data = {
            "anomaly_threshold": 0.7,
            "forecast_horizon_minutes": 30,
            "ollama_model": "llama3.2:3b",
            "metric_retention_days": 7,
            "audit_retention_days": 90,
            "alert_throttle_minutes": 5,
            "thresholds": {
                "cpu_usage": 0.85,
                "mem_usage": 0.90,
                "p95_latency_ms": 1000,
                "error_rate": 0.05,
            },
        }
        for key, value in settings_data.items():
            await db.execute(text("""
                INSERT INTO platform_settings (key, value)
                VALUES (:key, CAST(:val AS jsonb))
                ON CONFLICT (key) DO NOTHING
            """), {"key": key, "val": json.dumps(value)})

        await db.commit()
        log.info("seed.users_services_settings.done")

        # ── Metrics (7 days, 5-min intervals) ─────────────────────────────────
        now = datetime.now(timezone.utc).replace(second=0, microsecond=0)
        start = now - timedelta(days=7)
        total_steps = int((now - start).total_seconds() // 300)

        log.info("seed.metrics.generating", steps=total_steps, services=len(SERVICES))

        batch: list[dict] = []
        anomaly_windows: dict[str, list[tuple[datetime, datetime]]] = {}

        for svc in SERVICES:
            anomaly_windows[svc] = _anomaly_window(now)

        for i in range(total_steps):
            ts = start + timedelta(minutes=5 * i)
            for svc in SERVICES:
                in_anomaly = any(s <= ts <= e for s, e in anomaly_windows[svc])
                noise = 3.0 if in_anomaly else 1.0
                for metric in METRICS:
                    val = _generate_metric_value(metric, ts, noise_scale=noise)
                    # Spike for anomaly windows
                    if in_anomaly:
                        if metric == "p95_latency_ms":
                            val = random.uniform(800, 1500)
                        elif metric == "error_rate":
                            val = random.uniform(0.08, 0.15)
                        elif metric == "cpu_usage":
                            val = random.uniform(0.85, 0.99)
                    batch.append({
                        "service_id": svc,
                        "metric_name": metric,
                        "value": round(val, 6),
                        "timestamp": ts.isoformat(),
                    })

            if len(batch) >= 5000:
                await _insert_metrics_batch(db, batch)
                batch.clear()

        if batch:
            await _insert_metrics_batch(db, batch)

        log.info("seed.metrics.done")

        # ── Anomalies & Incidents ──────────────────────────────────────────────
        severities = ["critical", "critical", "warning", "info"]
        incident_count = 0
        for svc in SERVICES:
            for idx, (a_start, a_end) in enumerate(anomaly_windows[svc]):
                anomaly_id = str(uuid.uuid4())
                anomaly_score = round(random.uniform(0.72, 0.97), 4)
                severity = severities[idx % len(severities)]
                incident_id = str(uuid.uuid4())

                await db.execute(text("""
                    INSERT INTO anomalies
                        (anomaly_id, service_id, anomaly_score, anomaly_type,
                         metric_name, if_score, lstm_score, detected_at, status)
                    VALUES
                        (:aid, :sid, :score, 'combined', 'p95_latency_ms',
                         :ifs, :lstms, :ts, 'active')
                    ON CONFLICT (anomaly_id) DO NOTHING
                """), {
                    "aid": anomaly_id,
                    "sid": svc,
                    "score": anomaly_score,
                    "ifs": round(anomaly_score * 1.1, 4),
                    "lstms": round(anomaly_score * 0.9, 4),
                    "ts": a_start.isoformat(),
                })

                status_map = {0: "active", 1: "acknowledged", 2: "resolved", 3: "active"}
                inc_status = status_map[incident_count % 4]
                resolved_at = (a_end + timedelta(hours=1)).isoformat() if inc_status == "resolved" else None
                ack_at = (a_start + timedelta(minutes=10)).isoformat() if inc_status in ("acknowledged", "resolved") else None

                await db.execute(text("""
                    INSERT INTO incidents
                        (incident_id, service_id, severity, summary, status,
                         anomaly_score_at_trigger, affected_services,
                         created_at, acknowledged_at, acknowledged_by, resolved_at)
                    VALUES
                        (:iid, :sid, :sev,
                         :summary, :status,
                         :score, CAST(:affected AS jsonb),
                         :created, :acked, :acked_by, :resolved)
                    ON CONFLICT (incident_id) DO NOTHING
                """), {
                    "iid": incident_id,
                    "sid": svc,
                    "sev": severity,
                    "summary": f"Anomaly detected on {svc}: score {anomaly_score:.2f}",
                    "status": inc_status,
                    "score": anomaly_score,
                    "affected": json.dumps([svc]),
                    "created": a_start.isoformat(),
                    "acked": ack_at,
                    "acked_by": "admin" if ack_at else None,
                    "resolved": resolved_at,
                })
                incident_count += 1

        await db.commit()
        log.info("seed.anomalies_incidents.done")

        # ── Forecasts ──────────────────────────────────────────────────────────
        breach_services = SERVICES[:2]
        at_risk_services = SERVICES[2:7]

        for svc in SERVICES:
            will_breach = svc in breach_services
            at_risk = svc in at_risk_services
            for metric in ["cpu_usage", "p95_latency_ms"]:
                base_mean, _ = BASE_VALUES[metric]
                for h in range(30):
                    pred_ts = now + timedelta(minutes=h)
                    if will_breach:
                        pred = base_mean * 1.15 + h * 0.01
                    elif at_risk:
                        pred = base_mean * 1.05
                    else:
                        pred = base_mean * 0.95
                    thresh = 1000 if metric == "p95_latency_ms" else 0.85
                    await db.execute(text("""
                        INSERT INTO forecasts
                            (service_id, metric_name, predicted_value,
                             confidence_lower, confidence_upper,
                             predicted_at, model_used, mae, will_breach, breach_threshold)
                        VALUES
                            (:sid, :metric, :pred,
                             :lo, :hi,
                             :ts, 'prophet', :mae, :wb, :thresh)
                    """), {
                        "sid": svc,
                        "metric": metric,
                        "pred": round(pred, 4),
                        "lo": round(pred * 0.9, 4),
                        "hi": round(pred * 1.1, 4),
                        "ts": pred_ts.isoformat(),
                        "mae": round(random.uniform(5, 20), 4),
                        "wb": will_breach and pred > thresh,
                        "thresh": thresh,
                    })

        await db.commit()
        log.info("seed.forecasts.done")

        # ── Model Registry ────────────────────────────────────────────────────
        for svc in SERVICES[:4]:  # Seed models for first 4 services
            for mtype in ["isolation_forest", "prophet"]:
                run_id = f"seed-{svc}-{mtype}-{uuid.uuid4().hex[:8]}"
                await db.execute(text("""
                    INSERT INTO model_registry
                        (model_name, model_type, service_id, mlflow_run_id,
                         metrics, is_champion, trained_at)
                    VALUES
                        (:name, :mtype, :sid, :rid, CAST(:metrics AS jsonb), TRUE, NOW())
                    ON CONFLICT DO NOTHING
                """), {
                    "name": f"{mtype}-{svc}",
                    "mtype": mtype,
                    "sid": svc,
                    "rid": run_id,
                    "metrics": json.dumps({"mae": round(random.uniform(5, 25), 3), "f1": round(random.uniform(0.78, 0.95), 3)}),
                })

        await db.commit()
        log.info("seed.model_registry.done")
        log.info("seed.complete", services=len(SERVICES))


async def _insert_metrics_batch(db, batch: list[dict]) -> None:
    await db.execute(text("""
        INSERT INTO metrics (service_id, metric_name, value, timestamp)
        SELECT
            d.service_id,
            d.metric_name,
            d.value::float,
            d.timestamp::timestamptz
        FROM json_to_recordset(CAST(:data AS json)) AS d(service_id text, metric_name text, value text, timestamp text)
        ON CONFLICT DO NOTHING
    """), {"data": json.dumps([
        {"service_id": r["service_id"], "metric_name": r["metric_name"],
         "value": str(r["value"]), "timestamp": r["timestamp"]}
        for r in batch
    ])})
    await db.commit()
