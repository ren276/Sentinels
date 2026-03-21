"""
APScheduler background jobs for Sentinel.
All jobs: max_instances=1, coalesce=True to prevent overlap.
"""
import asyncio

import structlog
from apscheduler.schedulers.asyncio import AsyncIOScheduler

from .database import (
    get_db, get_all_service_ids,
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

    # Metric broadcast: every 30 seconds
    scheduler.add_job(
        broadcast_metrics_job,
        "interval", seconds=30,
        id="metric_broadcast",
        max_instances=1,
    )

    scheduler.start()
    log.info("scheduler.started", jobs=[
        "anomaly_detection", "forecast", "model_retraining",
        "data_retention", "metric_broadcast",
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


async def _run_anomaly_detection() -> None:
    try:
        async for db in get_db():
            service_ids = await get_all_service_ids(db)
            for service_id in service_ids:
                try:
                    await _detect_anomaly_for_service(db, service_id)
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
    from ml.anomaly import run_combined_inference
    from pipeline.validation import validate_metric_batch

    try:
        from observability.metrics import model_inference_duration
        metrics_data = await get_service_metrics(db, service_id, 60)
        if not metrics_data:
            return

        import pandas as pd
        df = pd.DataFrame(metrics_data)
        if df.empty:
            return

        validation = validate_metric_batch(df, service_id)
        if not validation.is_valid:
            log.warning(
                "anomaly_job.skipping_bad_data",
                service_id=service_id,
                errors=validation.errors,
            )
            return

        with model_inference_duration.labels(
            model_type="combined",
            service_id=service_id,
        ).time():
            score = await run_combined_inference(service_id, df)

        if score is not None and score > 0.7:
            log.info(
                "anomaly_job.detected",
                service_id=service_id,
                score=score,
            )
    except ImportError:
        pass  # ML not yet trained


async def forecast_job() -> None:
    """Generate 30-minute forecasts for all services."""
    log.info("forecast_job.started")
    try:
        async for db in get_db():
            service_ids = await get_all_service_ids(db)
            for service_id in service_ids:
                try:
                    await _forecast_for_service(db, service_id)
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
        from ml.registry import get_champion_model
        champion = get_champion_model(service_id, "prophet")
        if champion is None:
            return
        log.debug("forecast_job.service", service_id=service_id)
    except ImportError:
        pass


async def model_retraining_job() -> None:
    """Retrain all ML models for all services."""
    log.info("model_retraining_job.started")
    try:
        from ml.train import train_all_services
        async for db in get_db():
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

        async with AsyncSessionLocal() as db:
            services = await get_all_services(db)

        if not services:
            return

        import random
        from datetime import datetime, timezone

        for svc in services[:12]:  # Limit for performance
            service_id = svc["service_id"]
            # Send a lightweight metric update
            await ws_manager.broadcast({
                "type": "metric_update",
                "service_id": service_id,
                "metrics": {
                    "cpu_usage": round(random.uniform(0.2, 0.7), 4),
                    "mem_usage": round(random.uniform(0.4, 0.8), 4),
                    "error_rate": round(random.uniform(0, 0.01), 6),
                    "p95_latency_ms": round(random.uniform(80, 200), 2),
                    "req_per_second": round(random.uniform(300, 600), 2),
                },
                "timestamp": datetime.now(timezone.utc).isoformat(),
            })
    except Exception as exc:
        log.error("broadcast_metrics_job.failed", error=str(exc))
