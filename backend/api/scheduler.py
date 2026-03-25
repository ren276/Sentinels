"""
APScheduler background jobs for Sentinel.
All jobs: max_instances=1, coalesce=True to prevent overlap.
"""
import asyncio
from datetime import datetime, timezone

import structlog
from apscheduler.schedulers.asyncio import AsyncIOScheduler

from .database import (
    get_db, 
    AsyncSessionLocal, 
    get_all_service_ids,
    get_service_metrics,
)
from .config import settings

log = structlog.get_logger()

_scheduler: AsyncIOScheduler | None = None


async def start_scheduler() -> AsyncIOScheduler:
    global _scheduler
    scheduler = AsyncIOScheduler(timezone="UTC")

    # Anomaly detection: every minute
    scheduler.add_job(
        anomaly_detection_job,
        "interval", minutes=1,
        id="anomaly_detection",
        max_instances=1,
        coalesce=True,
    )

    # Forecasting: every 15 minutes
    scheduler.add_job(
        forecast_job,
        "interval", minutes=15,
        id="forecast",
        max_instances=1,
        coalesce=True,
    )

    # Model retraining: every 24 hours at 2am UTC
    scheduler.add_job(
        model_retraining_job,
        "cron", hour=2, minute=0,
        id="model_retraining",
        max_instances=1,
    )

    # Data retention: every hour
    scheduler.add_job(
        data_retention_job,
        "interval", hours=1,
        id="data_retention",
        max_instances=1,
    )

    # Metric broadcast: every 5 seconds
    scheduler.add_job(
        broadcast_metrics_job,
        "interval", seconds=15,
        id="metric_broadcast",
        max_instances=1,
        coalesce=True,
    )

    # SLO snapshots: every 15 minutes
    scheduler.add_job(
        slo_snapshot_job,
        "interval", minutes=15,
        id="slo_snapshot",
        max_instances=1,
        coalesce=True,
    )

    # Real metrics collection: every 10 seconds
    scheduler.add_job(
        real_metrics_job_wrapper,
        "interval", seconds=30,
        id="real_metrics",
        max_instances=1,
        coalesce=True,
    )

    # Slack Alert Digest
    scheduler.add_job(
        alert_digest_job,
        "interval", minutes=15,
        id="alert_digest",
        max_instances=1,
    )

    scheduler.start()
    log.info("scheduler.started", jobs=[
        "anomaly_detection", "forecast", "model_retraining",
        "data_retention", "metric_broadcast", "slo_snapshot", "real_metrics", "alert_digest"
    ])
    _scheduler = scheduler
    return scheduler


async def anomaly_detection_job() -> None:
    """Run anomaly detection for all services."""
    try:
        from observability.tracing import tracer
        with tracer.start_as_current_span("job.anomaly_detection"):
            await _run_anomaly_detection()
    except Exception:
        # Tracing may not be set up
        await _run_anomaly_detection()


async def alert_digest_job() -> None:
    try:
        from alerting.slack import send_slack_digest
        from api.config import settings
        import redis.asyncio as aioredis
        import json
        r = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
        length = await r.llen("slack:digest:queue")
        if length > 0:
            raw_incidents = await r.lpop("slack:digest:queue", count=length)
            if raw_incidents:
                if isinstance(raw_incidents, str):
                    raw_incidents = [raw_incidents]
                incidents = [json.loads(i) for i in raw_incidents]
                await send_slack_digest(incidents, 15)
        await r.aclose()
    except Exception as exc:
        log.error("digest_job.failed", error=str(exc))


async def real_metrics_job_wrapper() -> None:
    try:
        from ingestion.real_collector import real_metrics_collection_job
        await real_metrics_collection_job()
    except Exception as exc:
        log.error("real_metrics.failed", error=str(exc))


async def _run_anomaly_detection() -> None:
    from .database import AsyncSessionLocal
    try:
        async with AsyncSessionLocal() as db:
            service_ids = await get_all_service_ids(db)

        for service_id in service_ids:
            try:
                async with AsyncSessionLocal() as db_session:
                    await _detect_anomaly_for_service(db_session, service_id)
            except Exception as exc:
                log.error(
                    "anomaly_job.service_failed",
                    service_id=service_id,
                    error=str(exc),
                )
    except Exception as exc:
        log.error("anomaly_detection_job.failed", error=str(exc))


async def _detect_anomaly_for_service(db, service_id: str) -> None:
    """Run inference for a single service."""
    from ml.anomaly import run_combined_detection, FEATURE_NAMES

    try:
        metrics_data = await get_service_metrics(db, service_id, 60)
        if not metrics_data:
            return

        import pandas as pd
        df = pd.DataFrame(metrics_data)
        if df.empty:
            return

        # Pivot long → wide format
        df_wide = df.pivot_table(
            index="timestamp",
            columns="metric_name",
            values="value",
            aggfunc="mean",
        ).reset_index().sort_values("timestamp")

        df_wide = df_wide.rename(columns={"error_rate": "error_rate_1m"})
        for col in FEATURE_NAMES:
            if col not in df_wide.columns:
                df_wide[col] = 0.0

        from ml.registry import get_champion_model
        
        if_model, if_scaler = None, None
        if_res = get_champion_model(service_id, "isolation_forest")
        if if_res and len(if_res) == 2:
            if_model, if_scaler = if_res
            
        lstm_model, lstm_threshold = None, 1.0
        lstm_res = get_champion_model(service_id, "lstm_ae")
        if lstm_res and len(lstm_res) == 2:
            lstm_model, lstm_threshold = lstm_res

        result = await run_combined_detection(
            service_id, df_wide,
            if_model=if_model,
            if_scaler=if_scaler,
            lstm_model=lstm_model,
            lstm_threshold=lstm_threshold
        )
        if not result:
            return

        anomaly_score = result.get("anomaly_score", 0)

        # 1. Save and Broadcast ALL potential anomalies above a low threshold (0.3)
        if anomaly_score > 0.3:
            # Save anomaly record for Anomaly Lab
            from .database import create_anomaly_record
            await create_anomaly_record(db, {
                "anomaly_id": result["anomaly_id"],
                "service_id": service_id,
                "anomaly_score": anomaly_score,
                "anomaly_type": "combined",
                "metric_name": "multi",
                "features": result.get("features", {}),
                "if_score": result.get("if_score", 0),
                "lstm_score": result.get("lstm_score", 0),
            })

            # Broadcast to real-time Anomaly Stream
            from .websocket_manager import ws_manager
            await ws_manager.broadcast({
                "type": "anomaly_detected",
                "anomaly_id": result["anomaly_id"],
                "service_id": service_id,
                "anomaly_score": anomaly_score,
                "anomaly_type": "combined",
                "detected_at": datetime.now(timezone.utc).isoformat(),
            })

        # 2. Critical Alerting / Incident Creation (> 0.7)
        if anomaly_score > 0.7:
            log.info("anomaly_job.detected", service_id=service_id, score=anomaly_score)

            # Auto-create incident
            import uuid
            from .database import create_incident_record
            from .websocket_manager import ws_manager

            severity = "critical" if anomaly_score > 0.85 else "warning"
            incident_id = str(uuid.uuid4())

            incident_data = {
                "incident_id": incident_id,
                "service_id": service_id,
                "severity": severity,
                "summary": f"Anomaly detected on {service_id}: score {anomaly_score:.2f}",
                "status": "active",
                "anomaly_score_at_trigger": anomaly_score,
                "affected_services": [service_id],
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
            await create_incident_record(db, incident_data)

            # Slack Alerting Hook
            try:
                from alerting.slack import send_slack_alert
                from api.config import settings
                if severity == "critical":
                    await send_slack_alert(incident_data, result)
                    
                    # Auto-trigger RCA for critical incidents
                    from ml.rca import rca_job_handler
                    loop = asyncio.get_event_loop()
                    loop.create_task(rca_job_handler(
                        incident_id,
                        service_id,
                        float(anomaly_score),
                    ))
                else:
                    import redis.asyncio as aioredis
                    import json
                    r = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
                    await r.lpush("slack:digest:queue", json.dumps(incident_data))
                    await r.aclose()
            except Exception as e:
                log.warning("slack_alert.hook_failed", error=str(e))

            # Broadcast to frontend
            await ws_manager.broadcast({
                "type": "incident_created",
                "incident_id": incident_id,
                "service_id": service_id,
                "severity": severity,
                "anomaly_score": anomaly_score,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            })

            log.info("incident.auto_created", incident_id=incident_id,
                     service_id=service_id, severity=severity, score=anomaly_score)

    except ImportError:
        pass

async def forecast_job() -> None:
    """Generate 30-minute forecasts for all services."""
    from .database import AsyncSessionLocal
    log.info("forecast_job.started")
    try:
        async with AsyncSessionLocal() as db:
            service_ids = await get_all_service_ids(db)
            
        for service_id in service_ids:
            try:
                async with AsyncSessionLocal() as db_session:
                    await _forecast_for_service(db_session, service_id)
            except Exception as exc:
                log.error(
                    "forecast_job.service_failed",
                    service_id=service_id,
                    error=str(exc),
                )
    except Exception as exc:
        log.error("forecast_job.failed", error=str(exc))
    log.info("forecast_job.completed")


async def _forecast_for_service(db, service_id: str) -> None:
    """Forecast metrics for a single service."""
    try:
        from ml.forecast import forecast_prophet
        from ml.registry import get_champion_model
        from sqlalchemy import text
        import pandas as pd
        import numpy as np
        from datetime import datetime, timezone, timedelta
        
        # We forecast CPU and Latency as key indicators
        metrics_to_forecast = ["cpu_usage", "p95_latency_ms"]
        generated_at = datetime.now(timezone.utc)
        
        for metric in metrics_to_forecast:
            try:
                # 1. Load context data (last 2 hours)
                recent_metrics = await get_service_metrics(db, service_id, 120, metric)
                if not recent_metrics:
                    continue
                    
                df = pd.DataFrame(recent_metrics)
                last_val = float(df["value"].iloc[-1])
                avg_val = float(df["value"].tail(10).mean())
                
                # 2. Try to use champion model
                model = get_champion_model(service_id, "prophet")
                
                thresh = 1000.0 if metric == "p95_latency_ms" else 0.85
                horizon = 30
                
                if model:
                    pass
                    res_df = forecast_prophet(model, horizon_minutes=horizon)
                    points = []
                    for _, row in res_df.iterrows():
                        val = float(row["yhat"])
                        points.append({
                            "sid": service_id, "metric": metric, "val": val,
                            "lo": float(row["yhat_lower"]), "hi": float(row["yhat_upper"]),
                            "ts": row["ds"], "wb": val > thresh, "thresh": thresh, "gen": generated_at,
                            "model": "prophet"
                        })
                else:
                    # Fallback: Simple trend + noise
                    pass
                    # Calculate simple slope
                    slope = (last_val - float(df["value"].iloc[0])) / len(df) if len(df) > 10 else 0
                    points = []
                    for h in range(1, horizon + 1):
                        pred_ts = generated_at + timedelta(minutes=h)
                        # Avoid runaway drift
                        val = avg_val + (slope * h * 0.5) + np.random.normal(0, avg_val * 0.05)
                        # Clamp to realistic values
                        val = float(np.clip(val, 0, 5000 if metric == "p95_latency_ms" else 1.0))
                        points.append({
                            "sid": service_id, "metric": metric, "val": val,
                            "lo": val * 0.85, "hi": val * 1.15, "ts": pred_ts,
                            "wb": val > thresh, "thresh": thresh, "gen": generated_at,
                            "model": "statistical_fallback"
                        })
                
                # 3. Batch save
                for p in points:
                    await db.execute(text("""
                        INSERT INTO forecasts 
                        (service_id, metric_name, predicted_value, confidence_lower, confidence_upper, 
                         predicted_at, model_used, mae, will_breach, breach_threshold, generated_at)
                        VALUES (:sid, :metric, :val, :lo, :hi, :ts, :model, 12.5, :wb, :thresh, :gen)
                    """), p)
                await db.commit()
                
            except Exception as exc:
                log.warning("forecast.metric_failed", service_id=service_id, metric=metric, error=str(exc))
                
    except Exception as exc:
        log.error("forecast_for_service.failed", service_id=service_id, error=str(exc))


async def model_retraining_job() -> None:
    """Retrain all ML models for all services."""
    log.info("model_retraining_job.started")
    try:
        from ml.train import train_all_services
        async with AsyncSessionLocal() as db:
            await train_all_services(db)
        log.info("model_retraining_job.completed")
    except Exception as exc:
        log.error("model_retraining_job.failed", error=str(exc))


async def data_retention_job() -> None:
    """Delete old metrics and audit log entries."""
    from .database import AsyncSessionLocal
    from sqlalchemy import text

    try:
        async with AsyncSessionLocal() as session:
            result = await session.execute(text("""
                DELETE FROM metrics
                WHERE timestamp < NOW() - INTERVAL '7 days'
            """))
            metrics_deleted = result.rowcount

            result = await session.execute(text("""
                DELETE FROM audit_log
                WHERE timestamp < NOW() - INTERVAL '90 days'
            """))
            audit_deleted = result.rowcount

            await session.commit()
            log.info(
                "retention_job.completed",
                metrics_deleted=metrics_deleted,
                audit_deleted=audit_deleted,
            )
    except Exception as exc:
        log.error("retention_job.failed", error=str(exc))


async def broadcast_metrics_job() -> None:
    """Broadcast current metrics to all WebSocket clients."""
    try:
        from .websocket_manager import ws_manager
        from .database import AsyncSessionLocal, get_all_services
        from sqlalchemy import text
        import json, random
        from datetime import datetime, timezone
        import redis.asyncio as aioredis

        async with AsyncSessionLocal() as db:
            services = await get_all_services(db)

            if not services:
                return

            r = aioredis.from_url(settings.REDIS_URL, decode_responses=True)

            for svc in services[:12]:
                service_id = svc["service_id"]

                # Check for active chaos events
                chaos_latency = await r.get(f"chaos:{service_id}:latency_spike")
                chaos_cpu     = await r.get(f"chaos:{service_id}:cpu_spike")
                chaos_error   = await r.get(f"chaos:{service_id}:error_rate_spike")

                cpu   = round(random.uniform(0.2, 0.7), 4)
                mem   = round(random.uniform(0.4, 0.8), 4)
                disk  = round(random.uniform(0.1, 0.3), 4)
                dlate = round(random.uniform(8, 25), 2)
                net_t = round(random.uniform(10, 800), 2)
                error = round(random.uniform(0, 0.01), 6)
                p95   = round(random.uniform(80, 200), 2)
                rps   = round(random.uniform(300, 600), 2)

                if chaos_latency:
                    p95 = round(random.uniform(800, 2000), 2)
                if chaos_cpu:
                    cpu = round(random.uniform(0.85, 0.99), 4)
                if chaos_error:
                    error = round(random.uniform(0.08, 0.20), 6)

                now = datetime.now(timezone.utc)

                # Write metrics to DB so anomaly detection picks them up
                await db.execute(text("""
                    INSERT INTO metrics (service_id, metric_name, value, timestamp)
                    VALUES 
                        (:sid, 'cpu_usage', :cpu, :ts),
                        (:sid, 'mem_usage', :mem, :ts),
                        (:sid, 'error_rate', :error, :ts),
                        (:sid, 'p95_latency_ms', :p95, :ts),
                        (:sid, 'req_per_second', :rps, :ts)
                """), {
                    "sid": service_id, "cpu": cpu, "mem": mem,
                    "error": error, "p95": p95, "rps": rps, "ts": now
                })

                # Broadcast to WebSocket
                await ws_manager.broadcast({
                    "type": "metric_update",
                    "service_id": service_id,
                    "metrics": {
                        "cpu_usage": cpu,
                        "mem_usage": mem,
                        "disk_usage": disk if service_id == "system-host" else 0,
                        "disk_latency": dlate if service_id == "system-host" else 0,
                        "net_throughput": net_t if service_id == "system-host" else 0,
                        "error_rate": error,
                        "p95_latency_ms": p95,
                        "req_per_second": rps,
                    },
                    "timestamp": now.isoformat(),
                })
            
            await db.commit()

        await r.aclose()

    except Exception as exc:
        log.error("broadcast_metrics_job.failed", error=str(exc))


async def slo_snapshot_job() -> None:
    """Compute and record SLO compliance snapshots for all active SLOs."""
    try:
        from .database import AsyncSessionLocal, get_all_active_slos, calculate_slo_compliance, save_slo_snapshot
        from datetime import timedelta
        async with AsyncSessionLocal() as db:
            slos = await get_all_active_slos(db)
            now = asyncio.get_event_loop().time()
            log.info("slo_snapshot_job.started", slo_count=len(slos))
            for slo in slos:
                try:
                    compliance = await calculate_slo_compliance(db, slo)
                    from datetime import datetime, timezone, timedelta as tdelta
                    window_end = datetime.now(timezone.utc)
                    window_start = window_end - tdelta(days=slo["window_days"])
                    await save_slo_snapshot(
                        db, slo["slo_id"], compliance, window_start, window_end
                    )
                except Exception as exc:
                    log.error(
                        "slo_snapshot_job.slo_failed",
                        slo_id=slo.get("slo_id"),
                        error=str(exc),
                    )
            log.info("slo_snapshot_job.completed", slo_count=len(slos))
    except Exception as exc:
        log.error("slo_snapshot_job.failed", error=str(exc))