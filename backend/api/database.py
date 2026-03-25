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
    connect_args={"statement_cache_size": 0},
    # Supabase free-tier Session-mode pooler caps connections at ~10.
    # Keep pool_size + max_overflow well below that limit.
    pool_size=3,
    max_overflow=2,
    pool_timeout=30,
    pool_recycle=300,   # recycle connections every 5 min to avoid stale handles
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
    version       VARCHAR DEFAULT '1.0',
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
    resolved_by   VARCHAR,
    resolution_note VARCHAR,
    duration_minutes INT
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
    locked_until  TIMESTAMPTZ,
    reset_token_hash VARCHAR,
    reset_token_expires TIMESTAMPTZ
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

CREATE TABLE IF NOT EXISTS monitored_urls (
    id            VARCHAR PRIMARY KEY,
    service_id    VARCHAR UNIQUE NOT NULL,
    name          VARCHAR NOT NULL,
    url           VARCHAR NOT NULL,
    check_interval_seconds INT DEFAULT 60,
    expected_status_code INT DEFAULT 200,
    timeout_seconds INT DEFAULT 5,
    is_active     BOOLEAN DEFAULT TRUE,
    created_by    VARCHAR,
    created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS platform_settings (
    key           VARCHAR PRIMARY KEY,
    value         JSONB NOT NULL,
    updated_by    VARCHAR,
    updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS postmortems (
    id                      VARCHAR PRIMARY KEY,
    incident_id             VARCHAR REFERENCES incidents(incident_id),
    generated_by            VARCHAR,
    status                  VARCHAR DEFAULT 'generating',
    content                 TEXT,
    impact_duration_minutes INT,
    affected_services       JSONB DEFAULT '[]',
    timeline_events         JSONB DEFAULT '[]',
    created_at              TIMESTAMPTZ DEFAULT NOW(),
    updated_at              TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS deployments (
    deployment_id       VARCHAR PRIMARY KEY,
    service_id          VARCHAR REFERENCES services(service_id),
    version             VARCHAR NOT NULL,
    previous_version    VARCHAR,
    deployed_by         VARCHAR NOT NULL,
    environment         VARCHAR DEFAULT 'production',
    status              VARCHAR DEFAULT 'success',
    commit_hash         VARCHAR,
    deploy_notes        VARCHAR,
    deployed_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS slos (
    slo_id          VARCHAR PRIMARY KEY,
    service_id      VARCHAR REFERENCES services(service_id),
    name            VARCHAR NOT NULL,
    metric_name     VARCHAR NOT NULL,
    target_value    FLOAT NOT NULL,
    comparison      VARCHAR DEFAULT 'less_than',
    window_days     INT DEFAULT 30,
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    created_by      VARCHAR
);

CREATE TABLE IF NOT EXISTS slo_snapshots (
    id                              BIGSERIAL PRIMARY KEY,
    slo_id                          VARCHAR REFERENCES slos(slo_id),
    compliance_pct                  FLOAT NOT NULL,
    error_budget_remaining_pct      FLOAT NOT NULL,
    error_budget_consumed_minutes   FLOAT,
    good_minutes                    FLOAT,
    bad_minutes                     FLOAT,
    snapshot_at                     TIMESTAMPTZ DEFAULT NOW(),
    window_start                    TIMESTAMPTZ,
    window_end                      TIMESTAMPTZ
);

ALTER TABLE anomalies
    ADD COLUMN IF NOT EXISTS correlated_deployment_id VARCHAR,
    ADD COLUMN IF NOT EXISTS minutes_after_deployment INT;

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS oauth_provider VARCHAR,
    ADD COLUMN IF NOT EXISTS display_name VARCHAR,
    ADD COLUMN IF NOT EXISTS avatar_url VARCHAR;

CREATE TABLE IF NOT EXISTS incident_comments (
    id            BIGSERIAL PRIMARY KEY,
    incident_id   VARCHAR REFERENCES incidents(incident_id),
    user_id       VARCHAR,
    username      VARCHAR,
    comment       TEXT NOT NULL,
    created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_incident_comments_iid
    ON incident_comments(incident_id, created_at ASC);

ALTER TABLE incidents
    ADD COLUMN IF NOT EXISTS resolved_by VARCHAR,
    ADD COLUMN IF NOT EXISTS duration_minutes INT;

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
CREATE INDEX IF NOT EXISTS idx_deployments_service_time
    ON deployments(service_id, deployed_at DESC);
CREATE INDEX IF NOT EXISTS idx_slo_snapshots_slo_time
    ON slo_snapshots(slo_id, snapshot_at DESC);
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


async def get_user_by_email(db: AsyncSession, email: str) -> Optional[dict]:
    result = await db.execute(
        text("SELECT * FROM users WHERE email = :email"),
        {"email": email}
    )
    row = result.mappings().first()
    return dict(row) if row else None


async def create_oauth_user(
    db: AsyncSession,
    username: str,
    email: str,
    name: str,
    provider: str,
    role: str = "viewer",
    user_id: str = None,
) -> dict:
    import uuid
    user_id = user_id or str(uuid.uuid4())
    hp = "oauth_no_password"
    # ON CONFLICT (email) keeps existing user row intact but updates
    # oauth metadata. This prevents repeat GitHub/OAuth logins from
    # crashing with a UniqueViolation → silent 401.
    await db.execute(
        text("""
            INSERT INTO users (user_id, username, email, hashed_password, role, display_name, oauth_provider)
            VALUES (:uid, :username, :email, :hp, :role, :name, :provider)
            ON CONFLICT (email) DO UPDATE SET
                oauth_provider = EXCLUDED.oauth_provider,
                display_name   = COALESCE(EXCLUDED.display_name, users.display_name),
                last_login     = NOW()
        """),
        {"uid": user_id, "username": username[:50],
         "email": email[:255], "hp": hp,
         "role": role, "name": name[:255], "provider": provider}
    )
    await db.commit()
    # Fetch by email — the row might be the original one (via ON CONFLICT update)
    existing = await get_user_by_email(db, email)
    if existing:
        return existing
    return await get_user_by_id(db, user_id)


async def get_all_services(db: AsyncSession) -> list[dict]:
    result = await db.execute(text("""
        SELECT s.*,
               COALESCE(
                   (SELECT severity FROM incidents i 
                    WHERE i.service_id = s.service_id AND i.status = 'active' 
                    ORDER BY 
                      CASE severity 
                        WHEN 'critical' THEN 1 
                        WHEN 'warning' THEN 2 
                        ELSE 3 
                      END 
                    LIMIT 1), 
                   'healthy'
               ) as health_status,
               (SELECT JSON_BUILD_OBJECT(
                   'latency_ms', MAX(CASE WHEN metric_name = 'p95_latency_ms' THEN value ELSE 0 END),
                   'error_rate', MAX(CASE WHEN metric_name = 'error_rate' THEN value ELSE 0 END),
                   'cpu_percent', MAX(CASE WHEN metric_name = 'cpu_usage' THEN value ELSE 0 END),
                   'uptime_percent', MAX(CASE WHEN metric_name = 'uptime' THEN value ELSE 99.9 END)
                ) FROM metrics m WHERE m.service_id = s.service_id AND m.timestamp > NOW() - INTERVAL '5 minutes') as live_metrics
        FROM services s
        ORDER BY s.name
    """))
    return [dict(r) for r in result.mappings().all()]


async def get_service_by_id(db: AsyncSession, service_id: str) -> Optional[dict]:
    result = await db.execute(
        text("""
            SELECT s.*,
                   COALESCE(
                       (SELECT severity FROM incidents i 
                        WHERE i.service_id = s.service_id AND i.status = 'active' 
                        ORDER BY 
                          CASE severity 
                            WHEN 'critical' THEN 1 
                            WHEN 'warning' THEN 2 
                            ELSE 3 
                          END 
                        LIMIT 1), 
                       'healthy'
                   ) as health_status
            FROM services s 
            WHERE s.service_id = :sid
        """),
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
            SELECT * FROM forecasts 
            WHERE (service_id, metric_name, generated_at) IN (
                SELECT service_id, metric_name, MAX(generated_at)
                FROM forecasts
                GROUP BY service_id, metric_name
            )
            ORDER BY service_id, metric_name, predicted_at ASC
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


# ─── New helper functions for 4 features ─────────────────────────────────────

async def get_postmortem_from_db(db: AsyncSession, incident_id: str) -> Optional[dict]:
    result = await db.execute(
        text("SELECT * FROM postmortems WHERE incident_id = :iid ORDER BY created_at DESC LIMIT 1"),
        {"iid": incident_id}
    )
    row = result.mappings().first()
    return dict(row) if row else None


async def save_postmortem(
    db: AsyncSession,
    pm_id: str,
    incident_id: str,
    generated_by: str,
    content: str,
    impact_duration_minutes: Optional[int],
    affected_services: list,
    timeline_events: list,
) -> None:
    await db.execute(
        text("""
            INSERT INTO postmortems
                (id, incident_id, generated_by, status, content,
                 impact_duration_minutes, affected_services, timeline_events)
            VALUES
                (:id, :incident_id, :generated_by, 'done', :content,
                 :duration, CAST(:affected AS jsonb), CAST(:timeline AS jsonb))
            ON CONFLICT (id) DO UPDATE SET
                content = EXCLUDED.content,
                status = 'done',
                updated_at = NOW()
        """),
        {
            "id": pm_id,
            "incident_id": incident_id,
            "generated_by": generated_by,
            "content": content,
            "duration": impact_duration_minutes,
            "affected": json.dumps(affected_services),
            "timeline": json.dumps(timeline_events),
        }
    )
    await db.commit()


async def get_incident_timeline(db: AsyncSession, incident_id: str) -> list[dict]:
    """Build a simple timeline from incident data."""
    incident = await get_incident_by_id(db, incident_id)
    if not incident:
        return []
    events = []
    if incident.get("created_at"):
        events.append({"timestamp": str(incident["created_at"]), "event": "Incident created / anomaly detected"})
    if incident.get("acknowledged_at"):
        events.append({"timestamp": str(incident["acknowledged_at"]), "event": f"Acknowledged by {incident.get('acknowledged_by', 'unknown')}"})
    if incident.get("resolved_at"):
        events.append({"timestamp": str(incident["resolved_at"]), "event": "Incident resolved"})
    return events


async def get_metrics_during_incident(
    db: AsyncSession,
    service_id: str,
    created_at: Any,
    resolved_at: Any,
) -> dict:
    """Get peak metrics during incident window."""
    try:
        end_time = resolved_at or datetime.now(timezone.utc)
        result = await db.execute(
            text("""
                SELECT metric_name, MAX(value) as peak_value
                FROM metrics
                WHERE service_id = :sid
                AND timestamp >= :start
                AND timestamp <= :end
                GROUP BY metric_name
            """),
            {"sid": service_id, "start": created_at, "end": end_time}
        )
        rows = result.all()
        peaks = {row[0]: row[1] for row in rows}
        return {
            "peak_p95_latency_ms": peaks.get("p95_latency_ms"),
            "peak_error_rate": peaks.get("error_rate"),
            "peak_cpu": peaks.get("cpu_usage"),
        }
    except Exception:
        return {}


async def get_rca_result_from_db(db: AsyncSession, incident_id: str) -> Optional[dict]:
    """Placeholder — RCA is stored in Redis, not DB."""
    return None


# ─── Deployment helpers ───────────────────────────────────────────────────────

async def save_deployment(db: AsyncSession, deployment: dict) -> None:
    await db.execute(
        text("""
            INSERT INTO deployments
                (deployment_id, service_id, version, previous_version,
                 deployed_by, environment, status, commit_hash, deploy_notes, deployed_at)
            VALUES
                (:deployment_id, :service_id, :version, :previous_version,
                 :deployed_by, :environment, :status, :commit_hash, :deploy_notes,
                 :deployed_at::timestamptz)
            ON CONFLICT (deployment_id) DO NOTHING
        """),
        deployment
    )
    await db.commit()


async def get_service_deployments(db: AsyncSession, service_id: str, limit: int = 20) -> list[dict]:
    result = await db.execute(
        text("""
            SELECT d.*,
                COUNT(a.anomaly_id) as correlated_anomaly_count
            FROM deployments d
            LEFT JOIN anomalies a ON a.correlated_deployment_id = d.deployment_id
            WHERE d.service_id = :sid
            GROUP BY d.deployment_id
            ORDER BY d.deployed_at DESC
            LIMIT :limit
        """),
        {"sid": service_id, "limit": limit}
    )
    return [dict(r) for r in result.mappings().all()]


async def get_all_deployments(db: AsyncSession, limit: int = 50) -> list[dict]:
    result = await db.execute(
        text("""
            SELECT d.*,
                s.name as service_name,
                COUNT(a.anomaly_id) as correlated_anomaly_count
            FROM deployments d
            JOIN services s ON d.service_id = s.service_id
            LEFT JOIN anomalies a ON a.correlated_deployment_id = d.deployment_id
            GROUP BY d.deployment_id, s.name
            ORDER BY d.deployed_at DESC
            LIMIT :limit
        """),
        {"limit": limit}
    )
    return [dict(r) for r in result.mappings().all()]


async def get_anomalies_after(
    db: AsyncSession,
    service_id: str,
    deployed_at: datetime,
    window_minutes: int = 30,
) -> list[dict]:
    """Find anomalies detected within window_minutes after a deployment."""
    from datetime import timedelta
    window_end = deployed_at + timedelta(minutes=window_minutes)
    result = await db.execute(
        text("""
            SELECT * FROM anomalies
            WHERE service_id = :sid
            AND detected_at >= :start
            AND detected_at <= :end
        """),
        {"sid": service_id, "start": deployed_at, "end": window_end}
    )
    rows = result.mappings().all()
    return [dict(r) for r in rows]


async def tag_anomaly_with_deployment(
    db: AsyncSession,
    anomaly_id: str,
    deployment_id: str,
    minutes_after: int,
) -> None:
    await db.execute(
        text("""
            UPDATE anomalies
            SET correlated_deployment_id = :dep_id,
                minutes_after_deployment = :minutes
            WHERE anomaly_id = :aid
        """),
        {"dep_id": deployment_id, "minutes": minutes_after, "aid": anomaly_id}
    )
    await db.commit()


async def get_anomaly_by_id(db: AsyncSession, anomaly_id: str) -> Optional[dict]:
    result = await db.execute(
        text("SELECT * FROM anomalies WHERE anomaly_id = :aid"),
        {"aid": anomaly_id}
    )
    row = result.mappings().first()
    return dict(row) if row else None


# ─── SLO helpers ─────────────────────────────────────────────────────────────

async def save_slo(db: AsyncSession, slo: dict) -> None:
    await db.execute(
        text("""
            INSERT INTO slos
                (slo_id, service_id, name, metric_name, target_value,
                 comparison, window_days, created_by)
            VALUES
                (:slo_id, :service_id, :name, :metric_name, :target_value,
                 :comparison, :window_days, :created_by)
            ON CONFLICT (slo_id) DO NOTHING
        """),
        slo
    )
    await db.commit()


async def get_all_active_slos(db: AsyncSession, service_id: Optional[str] = None) -> list[dict]:
    query = "SELECT * FROM slos WHERE is_active = TRUE"
    params: dict = {}
    if service_id:
        query += " AND service_id = :service_id"
        params["service_id"] = service_id
    query += " ORDER BY service_id, name"
    result = await db.execute(text(query), params)
    return [dict(r) for r in result.mappings().all()]


async def set_slo_inactive(db: AsyncSession, slo_id: str) -> None:
    await db.execute(
        text("UPDATE slos SET is_active = FALSE WHERE slo_id = :slo_id"),
        {"slo_id": slo_id}
    )
    await db.commit()


async def save_slo_snapshot(
    db: AsyncSession,
    slo_id: str,
    compliance: dict,
    window_start: Optional[datetime] = None,
    window_end: Optional[datetime] = None,
) -> None:
    await db.execute(
        text("""
            INSERT INTO slo_snapshots
                (slo_id, compliance_pct, error_budget_remaining_pct,
                 error_budget_consumed_minutes, good_minutes, bad_minutes,
                 window_start, window_end)
            VALUES
                (:slo_id, :compliance_pct, :error_budget_remaining_pct,
                 :error_budget_consumed_minutes, :good_minutes, :bad_minutes,
                 :window_start, :window_end)
        """),
        {
            "slo_id": slo_id,
            "compliance_pct": compliance["compliance_pct"],
            "error_budget_remaining_pct": compliance["error_budget_remaining_pct"],
            "error_budget_consumed_minutes": compliance["error_budget_consumed_minutes"],
            "good_minutes": compliance["good_minutes"],
            "bad_minutes": compliance["bad_minutes"],
            "window_start": window_start,
            "window_end": window_end,
        }
    )
    await db.commit()


async def get_slo_snapshots(db: AsyncSession, slo_id: str, days: int = 30) -> list[dict]:
    result = await db.execute(
        text("""
            SELECT * FROM slo_snapshots
            WHERE slo_id = :slo_id
            AND snapshot_at > NOW() - INTERVAL '1 day' * :days
            ORDER BY snapshot_at DESC
        """),
        {"slo_id": slo_id, "days": days}
    )
    return [dict(r) for r in result.mappings().all()]


async def calculate_slo_compliance(db: AsyncSession, slo: dict) -> dict:
    """Calculate SLO compliance for the current window."""
    from datetime import timedelta
    window_start = datetime.now(timezone.utc) - timedelta(days=slo["window_days"])

    result = await db.execute(
        text("""
            SELECT value FROM metrics
            WHERE service_id = :sid
            AND metric_name = :metric
            AND timestamp >= :start
            ORDER BY timestamp ASC
        """),
        {"sid": slo["service_id"], "metric": slo["metric_name"], "start": window_start}
    )
    values = [row[0] for row in result.all()]

    if not values:
        return {
            "compliance_pct": 100.0,
            "error_budget_remaining_pct": 100.0,
            "error_budget_consumed_minutes": 0.0,
            "good_minutes": 0.0,
            "bad_minutes": 0.0,
            "data_points": 0,
        }

    minutes_per_point = 5
    good = 0
    bad = 0
    for v in values:
        if slo["comparison"] == "less_than":
            if v < slo["target_value"]:
                good += 1
            else:
                bad += 1
        else:
            if v > slo["target_value"]:
                good += 1
            else:
                bad += 1

    total = good + bad
    good_minutes = float(good * minutes_per_point)
    bad_minutes = float(bad * minutes_per_point)
    total_minutes = float(total * minutes_per_point)

    compliance_pct = (good / total * 100) if total > 0 else 100.0

    # Error budget calculation
    if slo["metric_name"] == "error_rate":
        allowed_bad_pct = slo["target_value"] * 100
    else:
        allowed_bad_pct = 1.0  # default 1% allowance for other metrics

    allowed_bad_minutes = total_minutes * (allowed_bad_pct / 100)
    if allowed_bad_minutes > 0:
        consumed_pct = min(bad_minutes / allowed_bad_minutes * 100, 100)
    else:
        consumed_pct = 100.0 if bad_minutes > 0 else 0.0
    remaining_pct = max(100.0 - consumed_pct, 0.0)

    return {
        "compliance_pct": round(compliance_pct, 3),
        "error_budget_remaining_pct": round(remaining_pct, 1),
        "error_budget_consumed_minutes": round(bad_minutes, 1),
        "good_minutes": round(good_minutes, 1),
        "bad_minutes": round(bad_minutes, 1),
        "data_points": total,
    }

