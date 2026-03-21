"""
Database models and helper functions using SQLAlchemy async.
Plain PostgreSQL — no TimescaleDB, no extensions required.
Works on Supabase free tier, Railway, local Docker.
"""
from datetime import datetime, timezone
from typing import Optional, Any
import json

from sqlalchemy import (
    text, BigInteger, Boolean, Column, Float, Integer,
    String, DateTime, JSON, create_engine
)
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase

from .config import settings

# ─── Async engine ────────────────────────────────────────────────────────────

engine = create_async_engine(
    settings.DATABASE_URL,
    pool_size=10,
    max_overflow=20,
    pool_pre_ping=True,
    echo=False,
)

AsyncSessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db():
    async with AsyncSessionLocal() as session:
        yield session


# ─── Table creation ───────────────────────────────────────────────────────────

CREATE_TABLES_SQL = """
CREATE TABLE IF NOT EXISTS services (
    service_id    VARCHAR PRIMARY KEY,
    name          VARCHAR NOT NULL,
    environment   VARCHAR DEFAULT 'production',
    version       VARCHAR DEFAULT '1.0.0',
    health_status VARCHAR DEFAULT 'healthy',
    tags          JSONB DEFAULT '{}',
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS metrics (
    id            BIGSERIAL PRIMARY KEY,
    service_id    VARCHAR REFERENCES services(service_id),
    metric_name   VARCHAR NOT NULL,
    value         FLOAT NOT NULL,
    timestamp     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS anomalies (
    anomaly_id    VARCHAR PRIMARY KEY,
    service_id    VARCHAR REFERENCES services(service_id),
    anomaly_score FLOAT NOT NULL,
    anomaly_type  VARCHAR,
    metric_name   VARCHAR,
    features      JSONB,
    if_score      FLOAT,
    lstm_score    FLOAT,
    detected_at   TIMESTAMPTZ DEFAULT NOW(),
    status        VARCHAR DEFAULT 'active'
);

CREATE TABLE IF NOT EXISTS incidents (
    incident_id   VARCHAR PRIMARY KEY,
    service_id    VARCHAR REFERENCES services(service_id),
    severity      VARCHAR NOT NULL,
    summary       VARCHAR,
    status        VARCHAR DEFAULT 'active',
    anomaly_score_at_trigger FLOAT,
    affected_services JSONB DEFAULT '[]',
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    acknowledged_at   TIMESTAMPTZ,
    acknowledged_by   VARCHAR,
    resolved_at   TIMESTAMPTZ,
    resolution_note VARCHAR
);

CREATE TABLE IF NOT EXISTS forecasts (
    id            BIGSERIAL PRIMARY KEY,
    service_id    VARCHAR REFERENCES services(service_id),
    metric_name   VARCHAR NOT NULL,
    predicted_value FLOAT NOT NULL,
    confidence_lower FLOAT,
    confidence_upper FLOAT,
    predicted_at  TIMESTAMPTZ NOT NULL,
    generated_at  TIMESTAMPTZ DEFAULT NOW(),
    model_used    VARCHAR,
    mae           FLOAT,
    will_breach   BOOLEAN DEFAULT FALSE,
    breach_threshold FLOAT
);

CREATE TABLE IF NOT EXISTS model_registry (
    id            BIGSERIAL PRIMARY KEY,
    model_name    VARCHAR NOT NULL,
    model_type    VARCHAR NOT NULL,
    service_id    VARCHAR,
    mlflow_run_id VARCHAR,
    metrics       JSONB,
    is_champion   BOOLEAN DEFAULT FALSE,
    challenger_of VARCHAR,
    trained_at    TIMESTAMPTZ DEFAULT NOW(),
    promoted_at   TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS users (
    user_id       VARCHAR PRIMARY KEY,
    username      VARCHAR UNIQUE NOT NULL,
    email         VARCHAR UNIQUE NOT NULL,
    hashed_password VARCHAR NOT NULL,
    role          VARCHAR DEFAULT 'viewer',
    is_active     BOOLEAN DEFAULT TRUE,
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    last_login    TIMESTAMPTZ,
    failed_login_attempts INT DEFAULT 0,
    locked_until  TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS audit_log (
    id            BIGSERIAL PRIMARY KEY,
    user_id       VARCHAR,
    action        VARCHAR NOT NULL,
    resource      VARCHAR,
    resource_id   VARCHAR,
    ip_address    VARCHAR,
    user_agent    VARCHAR,
    success       BOOLEAN,
    details       JSONB,
    timestamp     TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS platform_settings (
    key           VARCHAR PRIMARY KEY,
    value         JSONB NOT NULL,
    updated_by    VARCHAR,
    updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_metrics_service_time
    ON metrics(service_id, metric_name, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_incidents_status_time
    ON incidents(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_anomalies_service_time
    ON anomalies(service_id, detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_user_time
    ON audit_log(user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_forecasts_breach
    ON forecasts(will_breach, predicted_at);
"""

DEFAULT_PLATFORM_SETTINGS = {
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


async def init_db() -> None:
    """Create tables and seed default settings."""
    async with engine.begin() as conn:
        for statement in CREATE_TABLES_SQL.split(";"):
            if statement.strip():
                await conn.execute(text(statement.strip()))
        # Insert default platform settings
        for key, value in DEFAULT_PLATFORM_SETTINGS.items() if isinstance(DEFAULT_PLATFORM_SETTINGS, dict) else []:
            pass
        # Insert all settings as one record
        await conn.execute(text("""
            INSERT INTO platform_settings (key, value)
            VALUES ('app_settings', CAST(:value AS jsonb))
            ON CONFLICT (key) DO NOTHING
        """), {"value": json.dumps(DEFAULT_PLATFORM_SETTINGS)})


# ─── Database helper functions ───────────────────────────────────────────────

async def get_user_by_username(db: AsyncSession, username: str) -> Optional[dict]:
    result = await db.execute(
        text("SELECT * FROM users WHERE username = :username"),
        {"username": username}
    )
    row = result.mappings().first()
    return dict(row) if row else None


async def get_user_by_id(db: AsyncSession, user_id: str) -> Optional[dict]:
    result = await db.execute(
        text("SELECT * FROM users WHERE user_id = :user_id"),
        {"user_id": user_id}
    )
    row = result.mappings().first()
    return dict(row) if row else None


async def get_all_services(db: AsyncSession) -> list[dict]:
    result = await db.execute(text("SELECT * FROM services ORDER BY name"))
    return [dict(r) for r in result.mappings().all()]


async def get_service_by_id(db: AsyncSession, service_id: str) -> Optional[dict]:
    result = await db.execute(
        text("SELECT * FROM services WHERE service_id = :sid"),
        {"sid": service_id}
    )
    row = result.mappings().first()
    return dict(row) if row else None


async def get_all_service_ids(db: AsyncSession) -> list[str]:
    result = await db.execute(text("SELECT service_id FROM services"))
    return [r[0] for r in result.all()]


async def get_incidents(db: AsyncSession, status: Optional[str] = None,
                        severity: Optional[str] = None, limit: int = 100) -> list[dict]:
    query = "SELECT * FROM incidents WHERE 1=1"
    params: dict = {}
    if status:
        query += " AND status = :status"
        params["status"] = status
    if severity:
        query += " AND severity = :severity"
        params["severity"] = severity
    query += " ORDER BY created_at DESC LIMIT :limit"
    params["limit"] = limit
    result = await db.execute(text(query), params)
    return [dict(r) for r in result.mappings().all()]


async def get_incident_by_id(db: AsyncSession, incident_id: str) -> Optional[dict]:
    result = await db.execute(
        text("SELECT * FROM incidents WHERE incident_id = :iid"),
        {"iid": incident_id}
    )
    row = result.mappings().first()
    return dict(row) if row else None


async def get_service_metrics(db: AsyncSession, service_id: str,
                              window_minutes: int = 60, metric: str = "all") -> list[dict]:
    query = """
        SELECT * FROM metrics
        WHERE service_id = :sid
        AND timestamp > NOW() - INTERVAL ':window minutes'
    """
    params: dict = {"sid": service_id, "window": window_minutes}
    if metric != "all":
        query += " AND metric_name = :metric"
        params["metric"] = metric
    query += " ORDER BY timestamp ASC"
    # Use string formatting for interval (safe as it's an int)
    safe_query = f"""
        SELECT * FROM metrics
        WHERE service_id = :sid
        AND timestamp > NOW() - INTERVAL '{window_minutes} minutes'
        {"AND metric_name = :metric" if metric != "all" else ""}
        ORDER BY timestamp ASC
    """
    result = await db.execute(text(safe_query), params)
    return [dict(r) for r in result.mappings().all()]


async def get_service_anomalies(db: AsyncSession, service_id: str,
                                 limit: int = 50, status: str = "active") -> list[dict]:
    result = await db.execute(
        text("""
            SELECT * FROM anomalies
            WHERE service_id = :sid AND status = :status
            ORDER BY detected_at DESC LIMIT :limit
        """),
        {"sid": service_id, "status": status, "limit": limit}
    )
    return [dict(r) for r in result.mappings().all()]


async def get_forecasts_for_service(db: AsyncSession, service_id: str,
                                     metric: str = "cpu_usage") -> list[dict]:
    result = await db.execute(
        text("""
            SELECT * FROM forecasts
            WHERE service_id = :sid AND metric_name = :metric
            ORDER BY predicted_at ASC
        """),
        {"sid": service_id, "metric": metric}
    )
    return [dict(r) for r in result.mappings().all()]


async def get_all_forecasts(db: AsyncSession) -> list[dict]:
    result = await db.execute(
        text("""
            SELECT DISTINCT ON (service_id, metric_name)
                *
            FROM forecasts
            ORDER BY service_id, metric_name, generated_at DESC
        """)
    )
    return [dict(r) for r in result.mappings().all()]


async def get_model_registry(db: AsyncSession) -> list[dict]:
    result = await db.execute(
        text("SELECT * FROM model_registry ORDER BY trained_at DESC")
    )
    return [dict(r) for r in result.mappings().all()]


async def get_platform_settings(db: AsyncSession) -> dict:
    result = await db.execute(
        text("SELECT value FROM platform_settings WHERE key = 'app_settings'")
    )
    row = result.first()
    if row:
        return row[0]
    return DEFAULT_PLATFORM_SETTINGS


async def write_audit_log(db: AsyncSession, user_id: Optional[str], action: str,
                           resource: Optional[str] = None, resource_id: Optional[str] = None,
                           ip_address: Optional[str] = None, user_agent: Optional[str] = None,
                           success: bool = True, details: Optional[dict] = None) -> None:
    await db.execute(
        text("""
            INSERT INTO audit_log
                (user_id, action, resource, resource_id, ip_address,
                 user_agent, success, details)
            VALUES
                (:user_id, :action, :resource, :resource_id, :ip_address,
                 :user_agent, :success, CAST(:details AS jsonb))
        """),
        {
            "user_id": user_id, "action": action, "resource": resource,
            "resource_id": resource_id, "ip_address": ip_address,
            "user_agent": user_agent, "success": success,
            "details": json.dumps(details or {})
        }
    )
    await db.commit()


async def update_user_login_success(db: AsyncSession, user_id: str) -> None:
    await db.execute(
        text("""
            UPDATE users SET
                last_login = NOW(),
                failed_login_attempts = 0,
                locked_until = NULL
            WHERE user_id = :uid
        """),
        {"uid": user_id}
    )
    await db.commit()


async def update_user_login_failure(db: AsyncSession, user_id: str) -> None:
    await db.execute(
        text("""
            UPDATE users SET
                failed_login_attempts = failed_login_attempts + 1,
                locked_until = CASE
                    WHEN failed_login_attempts + 1 >= 5
                    THEN NOW() + INTERVAL '15 minutes'
                    ELSE locked_until
                END
            WHERE user_id = :uid
        """),
        {"uid": user_id}
    )
    await db.commit()


async def create_anomaly_record(db: AsyncSession, anomaly: dict) -> None:
    await db.execute(
        text("""
            INSERT INTO anomalies
                (anomaly_id, service_id, anomaly_score, anomaly_type,
                 metric_name, features, if_score, lstm_score, status)
            VALUES
                (:anomaly_id, :service_id, :anomaly_score, :anomaly_type,
                 :metric_name, CAST(:features AS jsonb), :if_score, :lstm_score, 'active')
            ON CONFLICT (anomaly_id) DO NOTHING
        """),
        {
            **anomaly,
            "features": json.dumps(anomaly.get("features", {}))
        }
    )
    await db.commit()


async def create_incident_record(db: AsyncSession, incident: dict) -> None:
    await db.execute(
        text("""
            INSERT INTO incidents
                (incident_id, service_id, severity, summary, status,
                 anomaly_score_at_trigger, affected_services)
            VALUES
                (:incident_id, :service_id, :severity, :summary, 'active',
                 :anomaly_score_at_trigger, CAST(:affected_services AS jsonb))
            ON CONFLICT (incident_id) DO NOTHING
        """),
        {
            **incident,
            "affected_services": json.dumps(incident.get("affected_services", []))
        }
    )
    await db.commit()


async def get_all_users(db: AsyncSession) -> list[dict]:
    result = await db.execute(
        text("SELECT user_id, username, email, role, is_active, created_at, last_login, failed_login_attempts FROM users ORDER BY created_at")
    )
    return [dict(r) for r in result.mappings().all()]


async def get_recent_anomalies(db: AsyncSession, limit: int = 50) -> list[dict]:
    result = await db.execute(
        text("""
            SELECT a.*, s.name as service_name
            FROM anomalies a
            JOIN services s ON a.service_id = s.service_id
            ORDER BY a.detected_at DESC LIMIT :limit
        """),
        {"limit": limit}
    )
    return [dict(r) for r in result.mappings().all()]
