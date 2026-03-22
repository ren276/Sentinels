"""
Sentinel API — Main FastAPI application.

CRITICAL BACKGROUND TASK RULE:
  ALWAYS:   loop = asyncio.get_event_loop()
            loop.create_task(coro(arg1, arg2, arg3))
  NEVER:    BackgroundTasks (causes 422 with slowapi)
  NEVER:    asyncio.create_task(coro(kw=arg))  # no kwargs
"""
import asyncio
import json
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Optional, Any

import httpx
import redis.asyncio as aioredis
import structlog
from fastapi import (
    Depends, FastAPI, HTTPException, Query, Request,
    WebSocket, WebSocketDisconnect, status
)
from fastapi.middleware.cors import CORSMiddleware
from jose import jwt
from pydantic import BaseModel
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from .config import settings
from .database import (
    AsyncSessionLocal, init_db,
    get_db, get_user_by_username, get_user_by_id,
    get_all_services, get_service_by_id,
    get_service_metrics, get_service_anomalies,
    get_incidents, get_incident_by_id,
    get_all_forecasts, get_forecasts_for_service,
    get_model_registry, get_platform_settings,
    write_audit_log, update_user_login_success,
    update_user_login_failure, create_anomaly_record,
    create_incident_record, get_all_users,
    get_all_service_ids, get_recent_anomalies,
    DEFAULT_PLATFORM_SETTINGS,
)
from .security import (
    SecurityHeadersMiddleware, Token, User,
    create_access_token, create_refresh_token,
    get_current_active_user, get_redis, hash_password,
    is_token_revoked, require_admin, require_operator,
    revoke_token, validate_password_strength,
    verify_password, verify_token, oauth2_scheme,
)
from .websocket_manager import ws_manager

log = structlog.get_logger()

# ─── Rate limiter ─────────────────────────────────────────────────────────────
limiter = Limiter(key_func=get_remote_address)

# ─── Global Redis pool ────────────────────────────────────────────────────────
redis_pool: aioredis.Redis = None  # type: ignore

# ─── Scheduler reference ─────────────────────────────────────────────────────
_scheduler = None


# ─── Lifespan ─────────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    global redis_pool, _scheduler

    # Init Redis
    redis_pool = await aioredis.from_url(
        settings.REDIS_URL,
        encoding="utf-8",
        decode_responses=True,
    )
    log.info("redis.connected")

    # Init DB
    await init_db()
    log.info("database.initialized")

    # Seed if development
    if settings.ENVIRONMENT == "development":
        try:
            from .seed import seed_database
            from .database import AsyncSessionLocal
            from sqlalchemy import text
            async with AsyncSessionLocal() as _db:
                result = await _db.execute(text("SELECT COUNT(*) FROM metrics"))
                count = result.scalar()
            if count<1000:
                await seed_database()
                log.info("database.seeded")
            else:
                log.info("seed.skipped_already_seeded", metric_rows=count)
        except Exception as exc:
            log.warning("seed.skipped", error=str(exc))

    # Init MLflow
    try:
        from ml.registry import setup_mlflow
        setup_mlflow()
    except Exception as exc:
        log.warning("mlflow.init_skipped", error=str(exc))



    # Start scheduler
    try:
        from .scheduler import start_scheduler
        _scheduler = await start_scheduler()
    except Exception as exc:
        log.warning("scheduler.init_skipped", error=str(exc))

    log.info("sentinel.startup_complete", environment=settings.ENVIRONMENT)

    yield

    # Shutdown
    if _scheduler:
        _scheduler.shutdown(wait=False)
    if redis_pool:
        await redis_pool.aclose()
    log.info("sentinel.shutdown_complete")


# ─── App ──────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="Sentinel API",
    version="1.0.0",
    description="AI System Monitoring Platform",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Setup OpenTelemetry
try:
    from observability.tracing import setup_tracing
    setup_tracing(app)
except Exception as exc:
    log.warning("tracing.init_skipped", error=str(exc))

# Setup Prometheus
if settings.PROMETHEUS_ENABLED:
    try:
        from observability.metrics import setup_prometheus
        setup_prometheus(app)
    except Exception as exc:
        log.warning("prometheus.init_skipped", error=str(exc))

app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── Pydantic request/response models ────────────────────────────────────────

class LoginRequest(BaseModel):
    username: str
    password: str


class RefreshRequest(BaseModel):
    refresh_token: str


class PasswordChangeRequest(BaseModel):
    current_password: str
    new_password: str


class AcknowledgeRequest(BaseModel):
    incident_id: str
    note: Optional[str] = None


class RunbookExecuteRequest(BaseModel):
    incident_id: Optional[str] = None
    dry_run: bool = True
    parameters: dict = {}
    confirmed: bool = False


class ChaosInjectRequest(BaseModel):
    service: str
    type: str
    duration_minutes: int = 15


class CreateUserRequest(BaseModel):
    username: str
    email: str
    role: str = "viewer"
    password: Optional[str] = None


class UpdateUserRequest(BaseModel):
    email: Optional[str] = None
    role: Optional[str] = None
    is_active: Optional[bool] = None


# ─── Health & observability ───────────────────────────────────────────────────

@app.get("/health", tags=["observability"])
async def health_check():
    return {
        "status": "healthy",
        "version": "1.0.0",
        "environment": settings.ENVIRONMENT,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


# ─── AUTH endpoints ───────────────────────────────────────────────────────────

@app.post("/api/v1/auth/login", tags=["auth"])
@limiter.limit("5/minute")
async def login(request: Request, body: LoginRequest) -> Token:
    # Sanitize
    username = body.username[:50].strip()
    async for db in get_db():
        user = await get_user_by_username(db, username)

        ip = request.client.host if request.client else "unknown"
        ua = request.headers.get("user-agent", "")

        if not user:
            await write_audit_log(db, None, "login_failure",
                                  "auth", username, ip, ua, False,
                                  {"reason": "user_not_found"})
            raise HTTPException(status_code=401, detail="Invalid username or password")

        # Check lockout
        if user.get("locked_until"):
            locked_until = user["locked_until"]
            if isinstance(locked_until, str):
                locked_until = datetime.fromisoformat(locked_until.replace("Z", "+00:00"))
            if locked_until.tzinfo is None:
                locked_until = locked_until.replace(tzinfo=timezone.utc)
            if locked_until > datetime.now(timezone.utc):
                raise HTTPException(status_code=403, detail="Account temporarily locked. Try again later.")

        if not verify_password(body.password, user["hashed_password"]):
            await update_user_login_failure(db, user["user_id"])
            await write_audit_log(db, user["user_id"], "login_failure",
                                  "auth", username, ip, ua, False,
                                  {"reason": "wrong_password"})
            raise HTTPException(status_code=401, detail="Invalid username or password")

        # Success
        await update_user_login_success(db, user["user_id"])
        await write_audit_log(db, user["user_id"], "login_success",
                              "auth", username, ip, ua, True, {})

        token_data = {"sub": user["username"], "role": user["role"]}
        access_token = create_access_token(token_data)
        refresh_token = create_refresh_token(token_data)

        return Token(
            access_token=access_token,
            refresh_token=refresh_token,
            token_type="bearer",
            expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        )


@app.post("/api/v1/auth/refresh", tags=["auth"])
@limiter.limit("10/minute")
async def refresh_token_endpoint(request: Request, body: RefreshRequest) -> Token:
    try:
        payload = jwt.decode(
            body.refresh_token,
            settings.JWT_SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM]
        )
        username = payload.get("sub")
        role = payload.get("role")
        old_jti = payload.get("jti")
        if not username or not old_jti:
            raise HTTPException(status_code=401, detail="Invalid refresh token")

        # Revoke old refresh token
        old_exp = payload.get("exp", 0)
        ttl = max(0, int(old_exp - datetime.now(timezone.utc).timestamp()))
        await revoke_token(old_jti, ttl, redis_pool)

        # Issue new pair
        token_data = {"sub": username, "role": role}
        access_token = create_access_token(token_data)
        refresh_token = create_refresh_token(token_data)

        return Token(
            access_token=access_token,
            refresh_token=refresh_token,
            token_type="bearer",
            expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        )
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid refresh token")


@app.post("/api/v1/auth/logout", tags=["auth"])
async def logout(
    request: Request,
    current_user: User = Depends(get_current_active_user),
):
    token = await oauth2_scheme(request)
    try:
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
        jti = payload.get("jti")
        exp = payload.get("exp", 0)
        if jti:
            ttl = max(1, int(exp - datetime.now(timezone.utc).timestamp()))
            await revoke_token(jti, ttl, redis_pool)
    except Exception:
        pass
    async for db in get_db():
        await write_audit_log(db, current_user.user_id, "logout", "auth", current_user.username)
    return {"status": "logged_out"}


@app.get("/api/v1/auth/me", tags=["auth"])
async def get_me(current_user: User = Depends(get_current_active_user)) -> User:
    return current_user


# ─── SERVICES ─────────────────────────────────────────────────────────────────

@app.get("/api/v1/services", tags=["services"])
@limiter.limit("100/minute")
async def list_services(
    request: Request,
    current_user: User = Depends(get_current_active_user),
):
    async for db in get_db():
        services = await get_all_services(db)
        return services


@app.get("/api/v1/services/{service_id}", tags=["services"])
@limiter.limit("100/minute")
async def get_service(
    request: Request,
    service_id: str,
    current_user: User = Depends(get_current_active_user),
):
    async for db in get_db():
        service = await get_service_by_id(db, service_id)
        if not service:
            raise HTTPException(status_code=404, detail="Service not found")
        return service


@app.get("/api/v1/services/{service_id}/metrics", tags=["services"])
@limiter.limit("100/minute")
async def get_service_metrics_endpoint(
    request: Request,
    service_id: str,
    window_minutes: int = Query(default=60, ge=1, le=10080),
    metric: str = Query(default="all"),
    current_user: User = Depends(get_current_active_user),
):
    async for db in get_db():
        metrics = await get_service_metrics(db, service_id, window_minutes, metric)
        return metrics


@app.get("/api/v1/services/{service_id}/anomalies", tags=["services"])
@limiter.limit("100/minute")
async def get_service_anomalies_endpoint(
    request: Request,
    service_id: str,
    limit: int = Query(default=50, ge=1, le=500),
    status: str = Query(default="active"),
    current_user: User = Depends(get_current_active_user),
):
    async for db in get_db():
        anomalies = await get_service_anomalies(db, service_id, limit, status)
        return anomalies


@app.get("/api/v1/services/{service_id}/forecast", tags=["services"])
@limiter.limit("100/minute")
async def get_service_forecast(
    request: Request,
    service_id: str,
    metric: str = Query(default="cpu_usage"),
    horizon: int = Query(default=30, ge=5, le=120),
    current_user: User = Depends(get_current_active_user),
):
    async for db in get_db():
        forecasts = await get_forecasts_for_service(db, service_id, metric)
        return forecasts


# ─── INCIDENTS ────────────────────────────────────────────────────────────────

@app.get("/api/v1/incidents", tags=["incidents"])
@limiter.limit("100/minute")
async def list_incidents(
    request: Request,
    status: Optional[str] = Query(default=None),
    severity: Optional[str] = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    current_user: User = Depends(get_current_active_user),
):
    async for db in get_db():
        incidents = await get_incidents(db, status, severity, limit)
        return incidents


@app.get("/api/v1/incidents/{incident_id}", tags=["incidents"])
@limiter.limit("100/minute")
async def get_incident(
    request: Request,
    incident_id: str,
    current_user: User = Depends(get_current_active_user),
):
    async for db in get_db():
        incident = await get_incident_by_id(db, incident_id)
        if not incident:
            raise HTTPException(status_code=404, detail="Incident not found")
        return incident


# ─── RCA — CRITICAL: NO BODY, NO BackgroundTasks ──────────────────────────────

@app.post("/api/v1/incidents/{incident_id}/rca/generate", tags=["rca"])
@limiter.limit("10/minute")
async def trigger_rca_generation(
    request: Request,
    incident_id: str,
    current_user: User = Depends(get_current_active_user),
) -> dict[str, str]:
    """
    Trigger RCA generation. NO body. NO BackgroundTasks.
    Uses loop.create_task with positional args ONLY.
    """
    async for db in get_db():
        incident = await get_incident_by_id(db, incident_id)
        if not incident:
            raise HTTPException(status_code=404, detail="Incident not found")

        service_id = incident["service_id"]
        anomaly_score = incident.get("anomaly_score_at_trigger", 0.75)

        loop = asyncio.get_event_loop()
        loop.create_task(_rca_job_handler(
            incident_id,
            service_id,
            float(anomaly_score),
        ))
        return {"status": "pending", "message": "RCA analysis started"}


async def _rca_job_handler(
    incident_id: str,
    service_id: str,
    anomaly_score: float,
) -> None:
    """
    Background RCA job.
    Called ONLY via: loop.create_task(_rca_job_handler(a, b, c))
    Positional args only.
    """
    try:
        from ml.rca import rca_job_handler
        await rca_job_handler(incident_id, service_id, anomaly_score)
    except Exception as exc:
        log.error("rca_dispatch.failed", incident_id=incident_id, error=str(exc))


@app.get("/api/v1/incidents/{incident_id}/rca", tags=["rca"])
@limiter.limit("60/minute")
async def get_rca_status(
    request: Request,
    incident_id: str,
    current_user: User = Depends(get_current_active_user),
):
    job_key = f"rca:job:{incident_id}"
    data = await redis_pool.get(job_key)
    if data is None:
        return {"status": "not_started", "result": "", "updated_at": None}
    return json.loads(data)


# ─── ALERTS ───────────────────────────────────────────────────────────────────

@app.post("/api/v1/alerts/acknowledge", tags=["alerts"])
@limiter.limit("100/minute")
async def acknowledge_alert(
    request: Request,
    body: AcknowledgeRequest,
    current_user: User = Depends(require_operator),
):
    async for db in get_db():
        incident = await get_incident_by_id(db, body.incident_id)
        if not incident:
            raise HTTPException(status_code=404, detail="Incident not found")
        from sqlalchemy import text
        async with AsyncSessionLocal() as session:
            await session.execute(
                text("""
                    UPDATE incidents SET
                        status = 'acknowledged',
                        acknowledged_at = NOW(),
                        acknowledged_by = :user,
                        resolution_note = :note
                    WHERE incident_id = :iid
                """),
                {"user": current_user.username, "note": body.note, "iid": body.incident_id}
            )
            await session.commit()
        await write_audit_log(db, current_user.user_id, "alert.acknowledge",
                              "incident", body.incident_id)
        await ws_manager.broadcast({
            "type": "incident_updated",
            "incident_id": body.incident_id,
            "status": "acknowledged",
        })
        return {"status": "acknowledged"}


# ─── RUNBOOKS ────────────────────────────────────────────────────────────────

RUNBOOKS = {
    "high_cpu": {
        "id": "high_cpu",
        "name": "High CPU Response",
        "description": "Attempt to reduce CPU load via GC or scaling.",
        "risk_level": "low",
        "trigger": "cpu_usage > 0.85 for 5min",
        "dry_run_default": False,
    },
    "memory_pressure": {
        "id": "memory_pressure",
        "name": "Memory Pressure Response",
        "description": "Log memory stats and consider restart.",
        "risk_level": "medium",
        "trigger": "mem_usage > 0.90",
        "dry_run_default": True,
    },
    "circuit_breaker": {
        "id": "circuit_breaker",
        "name": "Circuit Breaker Activation",
        "description": "Enable circuit breaker to stop error cascade.",
        "risk_level": "high",
        "trigger": "error_rate > 0.10 for 2min",
        "dry_run_default": True,
        "requires_approval": True,
    },
}


@app.get("/api/v1/runbooks", tags=["runbooks"])
@limiter.limit("100/minute")
async def list_runbooks(
    request: Request,
    current_user: User = Depends(get_current_active_user),
):
    return list(RUNBOOKS.values())


@app.post("/api/v1/runbooks/{runbook_id}/execute", tags=["runbooks"])
@limiter.limit("5/minute")
async def execute_runbook_endpoint(
    request: Request,
    runbook_id: str,
    body: RunbookExecuteRequest,
    current_user: User = Depends(require_operator),
):
    runbook = RUNBOOKS.get(runbook_id)
    if not runbook:
        raise HTTPException(status_code=404, detail="Runbook not found")

    async for db in get_db():
        await write_audit_log(db, current_user.user_id, "runbook.execute",
                              "runbook", runbook_id, details={
                                  "dry_run": body.dry_run,
                                  "incident_id": body.incident_id,
                                  "risk_level": runbook["risk_level"],
                              })

    if runbook["risk_level"] == "high" and not body.confirmed:
        return {"status": "requires_confirmation", "message": "High risk action requires confirmed=true"}

    if body.dry_run:
        return {"status": "dry_run", "runbook": runbook["name"], "would_execute": runbook}

    return {"status": "executed", "runbook": runbook["name"]}


# ─── ML ───────────────────────────────────────────────────────────────────────

@app.get("/api/v1/ml/models", tags=["ml"])
@limiter.limit("100/minute")
async def list_ml_models(
    request: Request,
    current_user: User = Depends(get_current_active_user),
):
    async for db in get_db():
        return await get_model_registry(db)


@app.get("/api/v1/ml/experiments", tags=["ml"])
@limiter.limit("100/minute")
async def list_ml_experiments(
    request: Request,
    current_user: User = Depends(get_current_active_user),
):
    try:
        import mlflow
        from mlflow.tracking import MlflowClient
        mlflow.set_tracking_uri(settings.MLFLOW_TRACKING_URI)
        client = MlflowClient()
        exp = client.get_experiment_by_name(settings.MLFLOW_EXPERIMENT_NAME)
        if not exp:
            return []
        runs = client.search_runs(
            experiment_ids=[exp.experiment_id],
            order_by=["start_time DESC"],
            max_results=50,
        )
        return [
            {
                "run_id": r.info.run_id,
                "status": r.info.status,
                "start_time": r.info.start_time,
                "metrics": r.data.metrics,
                "tags": r.data.tags,
                "params": r.data.params,
            }
            for r in runs
        ]
    except Exception as exc:
        log.warning("mlflow.experiments.failed", error=str(exc))
        return []


@app.post("/api/v1/ml/train", tags=["ml"])
@limiter.limit("5/minute")
async def trigger_training(
    request: Request,
    current_user: User = Depends(require_admin),
):
    loop = asyncio.get_event_loop()
    loop.create_task(_train_all_models())
    return {"status": "training_started", "message": "Model retraining initiated"}


async def _train_all_models() -> None:
    try:
        from ml.train import train_all_services
        async for db in get_db():
            await train_all_services(db)
    except Exception as exc:
        log.error("training.failed", error=str(exc))


@app.get("/api/v1/ollama/status", tags=["ml"])
@limiter.limit("30/minute")
async def get_ollama_status(
    request: Request,
    current_user: User = Depends(get_current_active_user),
):
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get("http://localhost:11434/api/tags")
            data = response.json()
            models = [m["name"] for m in data.get("models", [])]
            return {
                "connected": True,
                "models": models,
                "active_model": settings.OLLAMA_MODEL,
            }
    except Exception:
        return {
            "connected": False,
            "models": [],
            "active_model": settings.OLLAMA_MODEL,
        }


# ─── FORECASTS ────────────────────────────────────────────────────────────────

@app.get("/api/v1/forecasts", tags=["forecasts"])
@limiter.limit("100/minute")
async def list_forecasts(
    request: Request,
    current_user: User = Depends(get_current_active_user),
):
    async for db in get_db():
        return await get_all_forecasts(db)


# ─── USERS (admin only) ───────────────────────────────────────────────────────

@app.get("/api/v1/users", tags=["users"])
@limiter.limit("100/minute")
async def list_users(
    request: Request,
    current_user: User = Depends(require_admin),
):
    async for db in get_db():
        return await get_all_users(db)


@app.post("/api/v1/users", tags=["users"])
@limiter.limit("20/minute")
async def create_user(
    request: Request,
    body: CreateUserRequest,
    current_user: User = Depends(require_admin),
):
    from sqlalchemy import text
    password = body.password or f"TempPass{uuid.uuid4().hex[:8]}!"
    if not validate_password_strength(password):
        raise HTTPException(status_code=400, detail="Password does not meet strength requirements")
    user_id = str(uuid.uuid4())
    async with AsyncSessionLocal() as session:
        await session.execute(
            text("""
                INSERT INTO users (user_id, username, email, hashed_password, role)
                VALUES (:uid, :username, :email, :hp, :role)
            """),
            {"uid": user_id, "username": body.username[:50],
             "email": body.email[:255], "hp": hash_password(password),
             "role": body.role}
        )
        await session.commit()
    async for db in get_db():
        await write_audit_log(db, current_user.user_id, "user.created", "user", user_id)
    return {"user_id": user_id, "username": body.username, "temp_password": password}


@app.put("/api/v1/users/{user_id}", tags=["users"])
@limiter.limit("20/minute")
async def update_user(
    request: Request,
    user_id: str,
    body: UpdateUserRequest,
    current_user: User = Depends(require_admin),
):
    from sqlalchemy import text
    updates = []
    params: dict = {"uid": user_id}
    if body.email is not None:
        updates.append("email = :email")
        params["email"] = body.email[:255]
    if body.role is not None:
        updates.append("role = :role")
        params["role"] = body.role
    if body.is_active is not None:
        updates.append("is_active = :is_active")
        params["is_active"] = body.is_active
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    async with AsyncSessionLocal() as session:
        await session.execute(
            text(f"UPDATE users SET {', '.join(updates)} WHERE user_id = :uid"),
            params
        )
        await session.commit()
    return {"status": "updated"}


@app.delete("/api/v1/users/{user_id}", tags=["users"])
@limiter.limit("10/minute")
async def deactivate_user(
    request: Request,
    user_id: str,
    current_user: User = Depends(require_admin),
):
    from sqlalchemy import text
    async with AsyncSessionLocal() as session:
        await session.execute(
            text("UPDATE users SET is_active = FALSE WHERE user_id = :uid"),
            {"uid": user_id}
        )
        await session.commit()
    async for db in get_db():
        await write_audit_log(db, current_user.user_id, "user.deactivated", "user", user_id)
    return {"status": "deactivated"}


@app.put("/api/v1/users/me/password", tags=["users"])
@limiter.limit("5/minute")
async def change_my_password(
    request: Request,
    body: PasswordChangeRequest,
    current_user: User = Depends(get_current_active_user),
):
    from sqlalchemy import text
    if not validate_password_strength(body.new_password):
        raise HTTPException(status_code=400, detail="Password does not meet strength requirements")
    async for db in get_db():
        user = await get_user_by_id(db, current_user.user_id)
        if not user or not verify_password(body.current_password, user["hashed_password"]):
            raise HTTPException(status_code=400, detail="Current password is incorrect")
    async with AsyncSessionLocal() as session:
        await session.execute(
            text("UPDATE users SET hashed_password = :hp WHERE user_id = :uid"),
            {"hp": hash_password(body.new_password), "uid": current_user.user_id}
        )
        await session.commit()
    async for db in get_db():
        await write_audit_log(db, current_user.user_id, "password_change", "user", current_user.user_id)
    return {"status": "password_updated"}


# ─── SETTINGS ────────────────────────────────────────────────────────────────

@app.get("/api/v1/settings", tags=["settings"])
@limiter.limit("100/minute")
async def get_settings(
    request: Request,
    current_user: User = Depends(get_current_active_user),
):
    async for db in get_db():
        return await get_platform_settings(db)


@app.put("/api/v1/settings", tags=["settings"])
@limiter.limit("20/minute")
async def update_settings(
    request: Request,
    body: dict,
    current_user: User = Depends(require_admin),
):
    from sqlalchemy import text
    async with AsyncSessionLocal() as session:
        await session.execute(
            text("""
                INSERT INTO platform_settings (key, value, updated_by)
                VALUES ('app_settings', :value::jsonb, :user)
                ON CONFLICT (key) DO UPDATE SET
                    value = :value::jsonb,
                    updated_by = :user,
                    updated_at = NOW()
            """),
            {"value": json.dumps(body), "user": current_user.username}
        )
        await session.commit()
    return {"status": "updated"}


# ─── DEV ONLY: Chaos injection ────────────────────────────────────────────────

@app.post("/api/v1/chaos/inject", tags=["dev"])
@limiter.limit("20/minute")
async def chaos_inject(
    request: Request,
    body: ChaosInjectRequest,
    current_user: User = Depends(require_operator),
):
    if settings.ENVIRONMENT != "development":
        raise HTTPException(status_code=403, detail="Chaos injection only available in development")
    # Store chaos state in Redis
    chaos_key = f"chaos:{body.service}:{body.type}"
    await redis_pool.setex(chaos_key, body.duration_minutes * 60, json.dumps({
        "service": body.service,
        "type": body.type,
        "duration_minutes": body.duration_minutes,
        "injected_at": datetime.now(timezone.utc).isoformat(),
        "injected_by": current_user.username,
    }))
    log.warning("chaos.injected", service=body.service, type=body.type,
                duration=body.duration_minutes)
    return {"status": "injected", "service": body.service, "type": body.type}


# ─── WebSocket ────────────────────────────────────────────────────────────────

@app.websocket("/ws/live")
async def websocket_endpoint(websocket: WebSocket):
    # Auth via query param token
    token = websocket.query_params.get("token")
    if not token:
        await websocket.close(code=4001)
        return
    try:
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
        if not payload.get("sub"):
            await websocket.close(code=4001)
            return
    except Exception:
        await websocket.close(code=4001)
        return

    await ws_manager.connect(websocket)
    try:
        while True:
            try:
                data = await asyncio.wait_for(websocket.receive_text(), timeout=35.0)
                if data == "ping":
                    await websocket.send_text("pong")
            except asyncio.TimeoutError:
                try:
                    await websocket.send_text("ping")
                except Exception:
                    break
    except WebSocketDisconnect:
        pass
    finally:
        ws_manager.disconnect(websocket)


# ─── API versioning stubs ─────────────────────────────────────────────────────

@app.get("/api/v2/services", tags=["v2"])
async def list_services_v2(current_user: User = Depends(get_current_active_user)):
    """V2 stub — same as v1 for now."""
    async for db in get_db():
        return await get_all_services(db)


# ─── Recent anomalies (overview) ──────────────────────────────────────────────

@app.get("/api/v1/anomalies/recent", tags=["anomalies"])
@limiter.limit("100/minute")
async def get_recent_anomalies_endpoint(
    request: Request,
    limit: int = Query(default=50, ge=1, le=200),
    current_user: User = Depends(get_current_active_user),
):
    async for db in get_db():
        return await get_recent_anomalies(db, limit)
