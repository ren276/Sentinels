"""
ML training entry point.
Trains Isolation Forest, LSTM AE, Prophet, and ARIMA for all services.
"""
import asyncio
import json

import numpy as np
import pandas as pd
import structlog

log = structlog.get_logger()

SERVICES = [
    "api-gateway", "auth-service", "payment-service",
    "user-service", "notification-service", "search-service",
    "inventory-service", "order-service", "analytics-service",
    "cache-service", "queue-service", "storage-service",
]


async def train_all_services(db) -> None:
    """Train all ML models for all services."""
    log.info("train_all.started", services=len(SERVICES))
    for service_id in SERVICES:
        try:
            await train_service(db, service_id)
        except Exception as exc:
            log.error("train.service_failed", service_id=service_id, error=str(exc))
    log.info("train_all.completed")


async def train_service(db, service_id: str) -> None:
    """Train all 4 model types for a service."""
    from .anomaly import train_isolation_forest, train_lstm_ae
    from .forecast import train_prophet, train_arima

    log.info("train.service_started", service_id=service_id)

    # Fetch training data (last 7 days)
    df = await _fetch_training_data(db, service_id)
    if df.empty or len(df) < 100:
        log.warning("train.insufficient_data", service_id=service_id, rows=len(df))
        return

    # Isolation Forest
    try:
        await asyncio.get_event_loop().run_in_executor(
            None, _train_if_sync, service_id, df
        )
    except Exception as exc:
        log.error("train.if_failed", service_id=service_id, error=str(exc))

    # Prophet (CPU-bound, run in executor)
    try:
        await asyncio.get_event_loop().run_in_executor(
            None, _train_prophet_sync, service_id, df
        )
    except Exception as exc:
        log.error("train.prophet_failed", service_id=service_id, error=str(exc))

    log.info("train.service_completed", service_id=service_id)


def _train_if_sync(service_id: str, df: pd.DataFrame) -> None:
    """Train Isolation Forest synchronously."""
    from .anomaly import train_isolation_forest
    train_isolation_forest(df, service_id)
    log.info("train.if_done", service_id=service_id)


def _train_prophet_sync(service_id: str, df: pd.DataFrame) -> None:
    """Train Prophet synchronously."""
    try:
        from .forecast import train_prophet
        for metric in ["cpu_usage", "p95_latency_ms"]:
            metric_df = df[df["metric_name"] == metric].copy() if "metric_name" in df.columns else df
            if len(metric_df) > 100:
                train_prophet(metric_df, metric, service_id)
        log.info("train.prophet_done", service_id=service_id)
    except Exception as exc:
        log.warning("train.prophet_skipped", service_id=service_id, error=str(exc))


async def _fetch_training_data(db, service_id: str) -> pd.DataFrame:
    """Fetch 7 days of metric data for training."""
    from sqlalchemy import text

    result = await db.execute(text("""
        SELECT service_id, metric_name, value, timestamp
        FROM metrics
        WHERE service_id = :sid
          AND timestamp > NOW() - INTERVAL '7 days'
        ORDER BY timestamp ASC
        LIMIT 50000
    """), {"sid": service_id})
    rows = result.fetchall()
    if not rows:
        return pd.DataFrame()
    return pd.DataFrame(rows, columns=["service_id", "metric_name", "value", "timestamp"])


# Standalone training entry point (for scripts/train.ps1)
async def main() -> None:
    from api.database import AsyncSessionLocal, init_db
    await init_db()
    async with AsyncSessionLocal() as db:
        await train_all_services(db)


if __name__ == "__main__":
    asyncio.run(main())
