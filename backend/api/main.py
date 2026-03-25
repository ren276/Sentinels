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
import sys
from typing import Optional, Any
import logging

import httpx
import redis.asyncio as aioredis
import structlog
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

SENSITIVE_KEYS = [
    "password", "token", "secret", "key", "webhook",
    "authorization", "cookie", "credential", "jwt", "hashed_password"
]

def scrub_sensitive_info(_, __, event_dict):
    """structlog processor to scrub sensitive information."""
    for key in event_dict:
        k_lower = key.lower()
        if any(s in k_lower for s in SENSITIVE_KEYS):
            event_dict[key] = "[REDACTED]"
    
    # Also scrub nested dicts if needed
    for key, value in event_dict.items():
        if isinstance(value, dict):
            scrub_sensitive_info(None, None, value)
            
    return event_dict

structlog.configure(
    processors=[
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.StackInfoRenderer(),
        structlog.dev.set_exc_info,
        structlog.processors.TimeStamper(fmt="%Y-%m-%d %H:%M:%S", utc=False),
        scrub_sensitive_info, # ADDED
        # Use dev.ConsoleRenderer for better visibility in powershell/terminal
        structlog.dev.ConsoleRenderer(
            colors=True if sys.stdout.isatty() else False,
            pad_event=40,
        )
    ],
    wrapper_class=structlog.make_filtering_bound_logger(logging.INFO),
    context_class=dict,
    logger_factory=structlog.PrintLoggerFactory(),
    cache_logger_on_first_use=True,
)
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
    get_db, get_user_by_username, get_user_by_id, get_user_by_email, create_oauth_user,
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
    # Feature 1 — Post-mortems
    get_postmortem_from_db, save_postmortem,
    get_incident_timeline, get_metrics_during_incident,
    # Feature 2 — Deployments
    save_deployment, get_service_deployments, get_all_deployments,
    get_anomalies_after, tag_anomaly_with_deployment,
    # Feature 3 — SLOs
    save_slo, get_all_active_slos, set_slo_inactive,
    save_slo_snapshot, get_slo_snapshots, calculate_slo_compliance,
    # Feature 4 — Anomaly Explanation
    get_anomaly_by_id,
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
from fastapi.responses import Response as FastAPIResponse, RedirectResponse
from .oauth import oauth
from uuid import uuid4 as _uuid4

from .utils import assert_safe_url

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
    title="Sentinel API",
    version="1.0",
    description="System Monitoring Platform — Created by Sandesh Verma",
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

from starlette.middleware.sessions import SessionMiddleware
app.add_middleware(
    SessionMiddleware,
    secret_key=settings.JWT_SECRET_KEY
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    # Log full error server-side
    log.error("internal_error", error=str(exc), path=request.url.path)
    # Hide details from client unless in development
    detail = str(exc) if settings.ENVIRONMENT == "development" else "Internal server error"
    return FastAPIResponse(
        content=json.dumps({"detail": detail}),
        status_code=500,
        media_type="application/json"
    )


# ─── Pydantic request/response models ────────────────────────────────────────

class LoginRequest(BaseModel):
    username: str
    password: str


class RegisterRequest(BaseModel):
    username: str
    email: str
    password: str


class ForgotPasswordRequest(BaseModel):
    email: str


class ResetPasswordRequest(BaseModel):
    email: str
    token: str
    new_password: str


class RequestAccessRequest(BaseModel):
    username: str
    email: str
    reason: Optional[str] = None


class RefreshRequest(BaseModel):
    refresh_token: str


class PasswordChangeRequest(BaseModel):
    current_password: str
    new_password: str


class AcknowledgeRequest(BaseModel):
    incident_id: str
    note: Optional[str] = None


class ResolveRequest(BaseModel):
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


class MonitoredUrlCreate(BaseModel):
    name: str
    url: str
    expected_status_code: int = 200
    timeout_seconds: int = 5


class SlackTestRequest(BaseModel):
    webhook_url: str


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
@limiter.limit("5/15minute")
async def login(request: Request, response: FastAPIResponse, body: LoginRequest) -> Token:
    # Sanitize
    username = body.username[:64].strip()
    async with AsyncSessionLocal() as db:
        user = await get_user_by_username(db, username)

        ip = request.client.host if request.client else "unknown"
        ua = request.headers.get("user-agent", "")

        if not user:
            await write_audit_log(db, None, "login_failure", 
                                  "auth", username, ip, ua, False, 
                                  {"reason": "user_not_found"})
            # Generic error to prevent timing attacks
            raise HTTPException(status_code=401, detail="Invalid username or password")

        # Check lockout
        if user.get("locked_until"):
            locked_until = user["locked_until"]
            if isinstance(locked_until, str):
                locked_until = datetime.fromisoformat(locked_until.replace("Z", "+00:00"))
            if locked_until.tzinfo is None:
                locked_until = locked_until.replace(tzinfo=timezone.utc)
            if locked_until > datetime.now(timezone.utc):
                await write_audit_log(db, user["user_id"], "login_locked", "auth", username, ip, ua, False, {})
                raise HTTPException(status_code=423, detail="Account temporarily locked")

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

        # Set cookies
        response.set_cookie(
            key="sentinel_session",
            value=access_token,
            httponly=False,  # Accessible to browser scripts for WebSocket
            secure=settings.ENVIRONMENT == "production",
            samesite="lax",
            max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
            path="/",
        )
        response.set_cookie(
            key="refresh_token",
            value=refresh_token,
            httponly=True,
            secure=settings.ENVIRONMENT == "production",
            samesite="lax",
            max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400,
            path="/",
        )

        return Token(
            access_token=access_token,
            refresh_token=refresh_token,
            token_type="bearer",
            expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        )


@app.post("/api/v1/auth/register", tags=["auth"])
@limiter.limit("2/hour")
async def register(request: Request, body: RegisterRequest):
    if not settings.ALLOW_SELF_SIGNUP:
         raise HTTPException(status_code=403, detail="Signup is disabled")
    
    if not validate_password_strength(body.password):
        raise HTTPException(status_code=400, detail="Password too weak")
    
    async with AsyncSessionLocal() as db:
        existing = await get_user_by_username(db, body.username)
        if existing:
            # Generic response to avoid revealing existing usernames
            return {"status": "success", "message": "Check your email to complete registration"}
        
        user_id = str(uuid.uuid4())
        from sqlalchemy import text
        async with AsyncSessionLocal() as session:
            await session.execute(
                text("""
                    INSERT INTO users (user_id, username, email, hashed_password, role)
                    VALUES (:uid, :uname, :email, :hp, :role)
                """),
                {"uid": user_id, "uname": body.username[:64], "email": body.email[:255], 
                 "hp": hash_password(body.password), "role": "viewer"}
            )
            await session.commit()
    return {"status": "success", "message": "User registered successfully"}


@app.post("/api/v1/auth/forgot-password", tags=["auth"])
@limiter.limit("3/hour")
async def forgot_password(request: Request, body: ForgotPasswordRequest):
    # Always return success to prevent email enumeration
    from hmac import compare_digest
    from secrets import token_hex
    async with AsyncSessionLocal() as db:
        user = await get_user_by_email(db, body.email)
        if user:
            token = token_hex(32)
            token_hash = hash_password(token) # Reuse hash helper
            expires = datetime.now(timezone.utc) + timedelta(hours=1)
            from sqlalchemy import text
            async with AsyncSessionLocal() as session:
                await session.execute(
                    text("UPDATE users SET reset_token_hash = :hash, reset_token_expires = :exp WHERE email = :email"),
                    {"hash": token_hash, "exp": expires, "email": body.email}
                )
                await session.commit()
            # Simulation of sending email
            log.info("auth.reset_requested", email=body.email)
            await write_audit_log(db, user["user_id"], "password_reset_requested", "auth", body.email)
    
    return {"status": "success", "message": "If this email is registered, you'll receive a reset link"}


@app.post("/api/v1/auth/reset-password", tags=["auth"])
@limiter.limit("5/hour")
async def reset_password(request: Request, body: ResetPasswordRequest):
    async with AsyncSessionLocal() as db:
        user = await get_user_by_email(db, body.email)
        if not user or not user.get("reset_token_hash") or not user.get("reset_token_expires"):
            raise HTTPException(status_code=400, detail="Invalid or expired reset token")
            
        expires = user["reset_token_expires"]
        if isinstance(expires, str):
            expires = datetime.fromisoformat(expires.replace("Z", "+00:00"))
        if expires.tzinfo is None:
            expires = expires.replace(tzinfo=timezone.utc)
            
        if expires < datetime.now(timezone.utc):
            raise HTTPException(status_code=400, detail="Expired reset token")
            
        if not verify_password(body.token, user["reset_token_hash"]):
            raise HTTPException(status_code=400, detail="Invalid reset token")
            
        if not validate_password_strength(body.new_password):
            raise HTTPException(status_code=400, detail="New password is too weak")
            
        from sqlalchemy import text
        async with AsyncSessionLocal() as session:
            await session.execute(
                text("""
                    UPDATE users SET 
                        hashed_password = :hp,
                        reset_token_hash = NULL,
                        reset_token_expires = NULL,
                        failed_login_attempts = 0,
                        locked_until = NULL
                    WHERE user_id = :uid
                """),
                {"hp": hash_password(body.new_password), "uid": user["user_id"]}
            )
            await session.commit()
            
        # Revoke existing sessions? Yes, if we want to be secure
        # We'll revoke user's JWTs if we have a way to find all JTIs? No, only current token is easy.
        
        await write_audit_log(db, user["user_id"], "password_reset_success", "auth", user["username"])
        return {"status": "success", "message": "Password updated successfully"}


@app.post("/api/v1/auth/request-access", tags=["auth"])
@limiter.limit("10/day")
async def request_access(request: Request, body: RequestAccessRequest):
    async with AsyncSessionLocal() as db:
        await write_audit_log(db, None, "access_requested", "auth", 
                              body.email, details={"username": body.username, "reason": body.reason})
    return {"status": "success", "message": "Access request submitted"}


@app.post("/api/v1/auth/refresh", tags=["auth"])
@limiter.limit("10/minute")
async def refresh_token_endpoint(request: Request, response: FastAPIResponse, body: RefreshRequest) -> Token:
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
        
        # Set cookies
        response.set_cookie(
            key="sentinel_session",
            value=access_token,
            httponly=False,
            secure=settings.ENVIRONMENT == "production",
            samesite="lax",
            max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
            path="/",
        )

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
    async with AsyncSessionLocal() as db:
        await write_audit_log(db, current_user.user_id, "logout", "auth", current_user.username)
    return {"status": "logged_out"}


@app.get("/api/v1/auth/me", tags=["auth"])
async def get_me(current_user: User = Depends(get_current_active_user)) -> User:
    return current_user


# ─── OAuth endpoints ──────────────────────────────────────────────────────────

@app.get("/api/auth/{provider}", tags=["auth"])
async def oauth_login(
    request: Request,
    provider: str,
) -> RedirectResponse:
    if provider not in ["github", "google", "microsoft"]:
        raise HTTPException(400, "Unknown provider")
    if not getattr(settings, f"{provider.upper()}_ENABLED"):
        raise HTTPException(
            400, f"{provider} OAuth not configured"
        )
    
    # Generate and store state for CSRF protection
    state = str(uuid.uuid4())
    request.session["oauth_state"] = state
    
    redirect_uri = (
        f"{settings.OAUTH_REDIRECT_BASE_URL}"
        f"/api/auth/{provider}/callback"
    )
    client = oauth.create_client(provider)
    return await client.authorize_redirect(
        request, redirect_uri, state=state
    )

@app.get("/api/auth/{provider}/callback", tags=["auth"])
async def oauth_callback(
    request: Request,
    provider: str,
) -> RedirectResponse:
    if provider not in ["github", "google", "microsoft"]:
        raise HTTPException(400, "Unknown provider")
        
    # Verify state
    state = request.query_params.get("state")
    stored_state = request.session.pop("oauth_state", None)
    if not state or not stored_state or state != stored_state:
        return RedirectResponse("/login?error=invalid_state")
        
    client = oauth.create_client(provider)
    token = await client.authorize_access_token(request)

    # Get user info from provider
    if provider == "github":
        resp = await client.get(
            "user", token=token
        )
        userinfo = resp.json()
        email = userinfo.get("email")
        if not email:
            resp_email = await client.get("user/emails", token=token)
            emails = resp_email.json()
            primary_emails = [e["email"] for e in emails if e.get("primary")]
            if primary_emails:
                email = primary_emails[0]
            elif emails:
                email = emails[0]["email"]
        username = userinfo.get("login")
        name = userinfo.get("name", username)
    else:
        userinfo = token.get("userinfo", {})
        email = userinfo.get("email")
        username = email.split("@")[0] if email else None
        name = userinfo.get("name", username)

    if not email:
        return RedirectResponse(
            "/login?error=no_email"
        )

    async with AsyncSessionLocal() as db:
        # Find or create user
        user = await get_user_by_email(db, email)
        if not user:
            if not settings.ALLOW_SELF_SIGNUP:
                return RedirectResponse(
                    "/login?error=signup_disabled"
                )
            # Create new user
            user = await create_oauth_user(
                db=db,
                username=username or email.split("@")[0],
                email=email,
                name=name,
                provider=provider,
                role="viewer",  # default role
            )

        if not user["is_active"]:
            return RedirectResponse(
                "/login?error=account_inactive"
            )

        # Create tokens
        token_data = {
            "sub": user["username"],
            "role": user["role"],
        }
        access_token = create_access_token(token_data)
        refresh_token = create_refresh_token(token_data)

        # Redirect to frontend with tokens as cookies
        response = RedirectResponse(url="/")
        response.set_cookie(
            "sentinel_session", access_token,
            httponly=False, samesite="lax",
            max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
            path="/",
        )
        response.set_cookie(
            "refresh_token", refresh_token,
            httponly=True, samesite="lax",
            max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400,
            path="/",
        )
        return response


# ─── SERVICES ─────────────────────────────────────────────────────────────────

@app.get("/api/v1/services", tags=["services"])
@limiter.limit("100/minute")
async def list_services(
    request: Request,
    current_user: User = Depends(get_current_active_user),
):
    async with AsyncSessionLocal() as db:
        services = await get_all_services(db)
        return services


@app.get("/api/v1/monitored-urls", tags=["services"])
@limiter.limit("100/minute")
async def list_monitored_urls(
    request: Request,
    current_user: User = Depends(get_current_active_user),
):
    async with AsyncSessionLocal() as db:
        from sqlalchemy import text
        result = await db.execute(text("SELECT * FROM monitored_urls ORDER BY created_at DESC"))
        return [dict(r) for r in result.mappings().all()]


@app.post("/api/v1/monitored-urls", tags=["services"])
@limiter.limit("20/minute")
async def add_monitored_url(
    request: Request,
    body: MonitoredUrlCreate,
    current_user: User = Depends(require_operator),
):
    import uuid
    from sqlalchemy import text
    _id = f"url_{uuid.uuid4().hex[:8]}"
    service_id = f"http-{uuid.uuid4().hex[:8]}"
    async with AsyncSessionLocal() as db:
        await db.execute(text("""
            INSERT INTO monitored_urls (id, service_id, name, url, expected_status_code, timeout_seconds, created_by)
            VALUES (:id, :sid, :name, :url, :esc, :ts, :cb)
        """), {
            "id": _id, "sid": service_id, "name": body.name, "url": body.url,
            "esc": body.expected_status_code, "ts": body.timeout_seconds, "cb": current_user.username
        })
        await db.commit()
    return {"status": "created", "id": _id, "service_id": service_id}


@app.delete("/api/v1/monitored-urls/{url_id}", tags=["services"])
@limiter.limit("20/minute")
async def delete_monitored_url(
    request: Request,
    url_id: str,
    current_user: User = Depends(require_operator),
):
    from sqlalchemy import text
    async with AsyncSessionLocal() as db:
        await db.execute(text("DELETE FROM monitored_urls WHERE id = :id"), {"id": url_id})
        await db.commit()
    return {"status": "deleted"}


@app.post("/api/v1/slack/test", tags=["Integrations"])
@limiter.limit("10/minute")
async def test_slack(
    request: Request,
    body: SlackTestRequest,
    current_user: User = Depends(require_operator),
):
    # SSRF guard
    try:
        await assert_safe_url(body.webhook_url)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
        
    from alerting.slack import test_slack_webhook
    result = await test_slack_webhook(body.webhook_url)
    if not result["success"]:
        raise HTTPException(
            400,
            f"Webhook test failed: {result.get('error', 'Unknown error')}"
        )
    return {"success": True, "message": "Test sent"}


@app.post("/api/v1/slack/test-alert", tags=["Integrations"])
@limiter.limit("5/minute")
async def test_slack_alert(
    request: Request,
    current_user: User = Depends(require_operator),
):
    from alerting.slack import send_slack_alert
    from datetime import datetime, timezone
    fake_incident = {
        "incident_id": "test-001",
        "service_id": "sentinel-api",
        "severity": "critical",
        "summary": "Test alert from Sentinel",
        "anomaly_score_at_trigger": 0.92,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await send_slack_alert(fake_incident, {}, "This is a test RCA message from Sentinel.")
    return {"status": "sent"}


@app.get("/api/v1/services/{service_id}", tags=["services"])
@limiter.limit("100/minute")
async def get_service(
    request: Request,
    service_id: str,
    current_user: User = Depends(get_current_active_user),
):
    async with AsyncSessionLocal() as db:
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
    async with AsyncSessionLocal() as db:
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
    async with AsyncSessionLocal() as db:
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
    async with AsyncSessionLocal() as db:
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
    db: AsyncSession = Depends(get_db),
):
    incidents = await get_incidents(db, status, severity, limit)
    return incidents


@app.get("/api/v1/incidents/{incident_id}", tags=["incidents"])
@limiter.limit("100/minute")
async def get_incident(
    request: Request,
    incident_id: str,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
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
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    """
    Trigger RCA generation. NO body. NO BackgroundTasks.
    Uses loop.create_task with positional args ONLY.
    """
    async with AsyncSessionLocal() as db:
        incident = await get_incident_by_id(db, incident_id)
        if not incident:
            raise HTTPException(status_code=404, detail="Incident not found")

        service_id = incident["service_id"]
        anomaly_score = incident.get("anomaly_score_at_trigger", 0.75)

        log.info("rca.trigger_requested", incident_id=incident_id, service_id=service_id)
        
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
    log.info("rca.job_entry", incident_id=incident_id)
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
    db: AsyncSession = Depends(get_db),
):
    incident = await get_incident_by_id(db, body.incident_id)
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    from sqlalchemy import text
    await db.execute(
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
    await db.commit()
    await write_audit_log(db, current_user.user_id, "alert.acknowledge",
                          "incident", body.incident_id)
    await ws_manager.broadcast({
        "type": "incident_updated",
        "incident_id": body.incident_id,
        "status": "acknowledged",
    })
    return {"status": "acknowledged"}


@app.post("/api/v1/incidents/resolve", tags=["incidents"])
@limiter.limit("50/minute")
async def resolve_incident(
    request: Request,
    body: ResolveRequest,
    current_user: User = Depends(require_operator),
    db: AsyncSession = Depends(get_db),
):
    incident = await get_incident_by_id(db, body.incident_id)
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    
    from sqlalchemy import text
    from datetime import datetime, timezone
    
    # Calculate duration
    created_at = incident["created_at"]
    if isinstance(created_at, str):
        created_at = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
    
    if created_at.tzinfo is None:
        created_at = created_at.replace(tzinfo=timezone.utc)
    
    now = datetime.now(timezone.utc)
    duration_min = int((now - created_at).total_seconds() / 60)

    await db.execute(
        text("""
            UPDATE incidents SET
                status = 'resolved',
                resolved_at = :now,
                resolved_by = :user,
                resolution_note = :note,
                duration_minutes = :dur
            WHERE incident_id = :iid
        """),
        {
            "user": current_user.username, 
            "note": body.note, 
            "iid": body.incident_id,
            "now": now,
            "dur": duration_min
        }
    )
    await db.commit()
        
    await write_audit_log(db, current_user.user_id, "incident.resolve",
                          "incident", body.incident_id)
    
    # Trigger Slack Notification
    try:
        from alerting.slack import send_slack_resolution
        incident_update = {
            **incident,
            "status": "resolved",
            "resolution_note": body.note,
            "duration_minutes": duration_min
        }
        await send_slack_resolution(incident_update)
    except Exception as e:
        log.warning("slack_resolve.failed", error=str(e))

    await ws_manager.broadcast({
        "type": "incident_updated",
        "incident_id": body.incident_id,
        "status": "resolved",
    })
    return {"status": "resolved", "duration_minutes": duration_min}


@app.post("/api/v1/incidents/{incident_id}/comments", tags=["incidents"])
async def add_incident_comment(
    request: Request,
    incident_id: str,
    body: dict,
    current_user: User = Depends(get_current_active_user),
):
    comment_text = body.get("comment")
    if not comment_text:
        raise HTTPException(status_code=400, detail="Comment cannot be empty")
    
    async with AsyncSessionLocal() as session:
        await session.execute(
            text("""
                INSERT INTO incident_comments (incident_id, user_id, username, comment)
                VALUES (:iid, :uid, :uname, :txt)
            """),
            {"iid": incident_id, "uid": str(current_user.user_id), "uname": current_user.username, "txt": comment_text}
        )
        await session.commit()
    
    await ws_manager.broadcast({
        "type": "incident_updated",
        "incident_id": incident_id,
        "new_comment": True
    })
    return {"status": "comment_added"}


@app.get("/api/v1/incidents/{incident_id}/comments", tags=["incidents"])
async def get_incident_comments(
    request: Request,
    incident_id: str,
    current_user: User = Depends(get_current_active_user),
):
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            text("SELECT username, comment, created_at FROM incident_comments WHERE incident_id = :iid ORDER BY created_at ASC"),
            {"iid": incident_id}
        )
        rows = result.all()
        return [{"username": r[0], "comment": r[1], "created_at": r[2]} for r in rows]

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
    db: AsyncSession = Depends(get_db),
):
    runbook = RUNBOOKS.get(runbook_id)
    if not runbook:
        raise HTTPException(status_code=404, detail="Runbook not found")

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
    db: AsyncSession = Depends(get_db),
):
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
        async with AsyncSessionLocal() as db:
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
    db: AsyncSession = Depends(get_db),
):
    return await get_all_forecasts(db)


# ─── USERS (admin only) ───────────────────────────────────────────────────────

@app.get("/api/v1/users", tags=["users"])
@limiter.limit("100/minute")
async def list_users(
    request: Request,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    all_users = await get_all_users(db)
    
    # Admin gets everything
    if current_user.role == "admin":
        return all_users
        
    # Observer only sees themselves
    if current_user.role == "viewer": # 'viewer' is the role name in security.py line 65
        return [u for u in all_users if u["user_id"] == current_user.user_id]
        
    # Operator gets basic list (strip sensitive or specific fields if any)
    # Currently get_all_users already strips passwordHash etc.
    return all_users


@app.post("/api/v1/users", tags=["users"])
@limiter.limit("20/minute")
async def create_user(
    request: Request,
    body: CreateUserRequest,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    from sqlalchemy import text
    password = body.password or f"TempPass{uuid.uuid4().hex[:8]}!"
    if not validate_password_strength(password):
        raise HTTPException(status_code=400, detail="Password does not meet strength requirements")
    user_id = str(uuid.uuid4())
    await db.execute(
        text("""
            INSERT INTO users (user_id, username, email, hashed_password, role)
            VALUES (:uid, :username, :email, :hp, :role)
        """),
        {"uid": user_id, "username": body.username[:50],
         "email": body.email[:255], "hp": hash_password(password),
         "role": body.role}
    )
    await db.commit()
    await write_audit_log(db, current_user.user_id, "user.created", "user", user_id)
    return {"user_id": user_id, "username": body.username, "temp_password": password}


@app.put("/api/v1/users/{user_id}", tags=["users"])
@limiter.limit("20/minute")
async def update_user(
    request: Request,
    user_id: str,
    body: UpdateUserRequest,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    # RBAC & IDOR: A user can only edit themselves UNLESS they are admin
    if current_user.user_id != user_id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")
        
    # Admin cannot change their own role (prevents accidental lockout/privilege escalation)
    if current_user.user_id == user_id and body.role is not None and body.role != current_user.role:
         raise HTTPException(status_code=400, detail="Cannot change your own role")

    from sqlalchemy import text
    updates = []
    params: dict = {"uid": user_id}
    if body.email is not None:
        updates.append("email = :email")
        params["email"] = body.email[:255]
    if body.role is not None and current_user.role == "admin": # Only admin can change roles
        updates.append("role = :role")
        params["role"] = body.role
    if body.is_active is not None and current_user.role == "admin":
        updates.append("is_active = :is_active")
        params["is_active"] = body.is_active
        
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
        
    await db.execute(
        text(f"UPDATE users SET {', '.join(updates)} WHERE user_id = :uid"),
        params
    )
    await db.commit()
    return {"status": "updated"}


@app.delete("/api/v1/users/{user_id}", tags=["users"])
@limiter.limit("10/minute")
async def deactivate_user(
    request: Request,
    user_id: str,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    from sqlalchemy import text
    await db.execute(
        text("UPDATE users SET is_active = FALSE WHERE user_id = :uid"),
        {"uid": user_id}
    )
    await db.commit()
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
    async with AsyncSessionLocal() as db:
        user = await get_user_by_id(db, current_user.user_id)
        if not user or not verify_password(body.current_password, user["hashed_password"]):
            raise HTTPException(status_code=400, detail="Current password is incorrect")
    async with AsyncSessionLocal() as session:
        await session.execute(
            text("UPDATE users SET hashed_password = :hp WHERE user_id = :uid"),
            {"hp": hash_password(body.new_password), "uid": current_user.user_id}
        )
        await session.commit()
    async with AsyncSessionLocal() as db:
        await write_audit_log(db, current_user.user_id, "password_change", "user", current_user.user_id)
    return {"status": "password_updated"}


# ─── SETTINGS ────────────────────────────────────────────────────────────────

@app.get("/api/v1/settings", tags=["settings"])
@limiter.limit("100/minute")
async def get_settings(
    request: Request,
    current_user: User = Depends(get_current_active_user),
):
    async with AsyncSessionLocal() as db:
        return await get_platform_settings(db)


@app.put("/api/v1/settings", tags=["settings"])
@limiter.limit("20/minute")
async def update_settings(
    request: Request,
    body: dict,
    current_user: User = Depends(require_admin),
):
    # SSRF guard for Slack Webhook URL if present in body
    webhook = body.get("SLACK_WEBHOOK_URL")
    if webhook:
        try:
            await assert_safe_url(webhook)
        except ValueError as e:
            raise HTTPException(status_code=422, detail=str(e))
            
    from sqlalchemy import text
    async with AsyncSessionLocal() as session:
        await session.execute(
            text("""
                INSERT INTO platform_settings (key, value, updated_by)
                VALUES ('app_settings', CAST(:value AS JSONB), :user)
                ON CONFLICT (key) DO UPDATE SET
                    value = CAST(:value AS JSONB),
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
        log.warning("ws.auth_failed.no_token")
        await websocket.close(code=4001)
        return
    try:
        from .security import verify_token
        token_data = await verify_token(token, redis_pool)
        
        # Construct payload for compatibility
        payload = {
            "sub": token_data.username,
            "role": token_data.role,
            "jti": token_data.jti,
            "exp": token_data.exp
        }
            
    except Exception as exc:
        log.warning("ws.auth_failed.invalid_token", error=str(exc))
        await websocket.close(code=4001)
        return

    # Pass payload into connect for connection limits and role metadata
    success = await ws_manager.connect(websocket, payload)
    if not success:
        await websocket.close(code=4008)  # Policy Violation / Too many conns
        return
        
    try:
        while True:
            try:
                # 35s timeout to catch disconnected clients.
                # Client pings every 30s.
                data = await asyncio.wait_for(websocket.receive_text(), timeout=35.0)
                
                if data == "ping":
                    await websocket.send_json({"type": "pong"})
                    continue
                
                # Skip debug logging of raw websocket messages
                pass
                
            except asyncio.TimeoutError:
                # Still alive but quiet. Probe with a ping.
                try:
                    await websocket.send_json({"type": "ping"})
                    # If send fails, it'll raise an Exception caught below
                except Exception:
                    break
            except WebSocketDisconnect as exc:
                # Normal or abnormal closure from client side
                log.info("ws.disconnected_client", 
                         user=payload.get("sub"), 
                         code=exc.code, 
                         reason=exc.reason or "no reason")
                break
            except Exception as exc:
                # Unexpected read error
                log.error("ws.read_failed", error=str(exc))
                break
    except Exception as exc:
        log.error("ws.endpoint_failed", error=str(exc))
    finally:
        ws_manager.disconnect(websocket)


# ─── API versioning stubs ─────────────────────────────────────────────────────

@app.get("/api/v2/services", tags=["v2"])
async def list_services_v2(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """V2 stub — same as v1 for now."""
    return await get_all_services(db)


# ─── Recent anomalies (overview) ──────────────────────────────────────────────

@app.get("/api/v1/anomalies/recent", tags=["anomalies"])
@limiter.limit("100/minute")
async def get_recent_anomalies_endpoint(
    request: Request,
    limit: int = Query(default=50, ge=1, le=200),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    return await get_recent_anomalies(db, limit)


# ─── POSTMORTEM endpoints ─────────────────────────────────────────────────────

@app.post("/api/v1/incidents/{incident_id}/postmortem/generate", tags=["postmortem"])
@limiter.limit("5/minute")
async def trigger_postmortem_generation(
    request: Request,
    incident_id: str,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    """Trigger post-mortem generation. NO body. Same pattern as /rca/generate."""
    incident = await get_incident_by_id(db, incident_id)
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    if incident["status"] != "resolved":
        raise HTTPException(
            status_code=400,
            detail="Post-mortems can only be generated for resolved incidents",
        )
    loop = asyncio.get_event_loop()
    loop.create_task(_postmortem_job_dispatch(
        incident_id,
            current_user.username,
        ))
    return {
        "status": "generating",
        "message": "Post-mortem generation started",
    }


async def _postmortem_job_dispatch(incident_id: str, generated_by: str) -> None:
    try:
        from ml.postmortem import postmortem_job_handler
        await postmortem_job_handler(incident_id, generated_by)
    except Exception as exc:
        log.error("postmortem_dispatch.failed", incident_id=incident_id, error=str(exc))


@app.get("/api/v1/incidents/{incident_id}/postmortem", tags=["postmortem"])
@limiter.limit("60/minute")
async def get_postmortem(
    request: Request,
    incident_id: str,
    current_user: User = Depends(get_current_active_user),
) -> dict[str, Any]:
    r = await aioredis.from_url(settings.REDIS_URL, decode_responses=True)
    job_key = f"postmortem:job:{incident_id}"
    try:
        job_data = await r.get(job_key)
        if not job_data:
            async with AsyncSessionLocal() as db:
                pm = await get_postmortem_from_db(db, incident_id)
                if pm:
                    return {
                        "status": "done",
                        "content": pm["content"],
                        "postmortem_id": pm["id"],
                    }
                return {"status": "not_started", "content": ""}
        return json.loads(job_data)
    finally:
        await r.aclose()


@app.get("/api/v1/incidents/{incident_id}/postmortem/export", tags=["postmortem"])
async def export_postmortem(
    request: Request,
    incident_id: str,
    current_user: User = Depends(get_current_active_user),
) -> FastAPIResponse:
    async with AsyncSessionLocal() as db:
        pm = await get_postmortem_from_db(db, incident_id)
        if not pm:
            raise HTTPException(status_code=404, detail="Post-mortem not found")
        filename = f"postmortem-{incident_id}.md"
        return FastAPIResponse(
            content=pm["content"],
            media_type="text/markdown",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )


# ─── DEPLOYMENT endpoints ─────────────────────────────────────────────────────

class DeploymentCreateRequest(BaseModel):
    service_id: str
    version: str
    previous_version: Optional[str] = None
    deployed_by: str
    environment: str = "production"
    status: str = "success"
    commit_hash: Optional[str] = None
    deploy_notes: Optional[str] = None
    deployed_at: Optional[datetime] = None


@app.post("/api/v1/deployments", tags=["deployments"])
@limiter.limit("30/minute")
async def create_deployment(
    request: Request,
    body: DeploymentCreateRequest,
    current_user: User = Depends(get_current_active_user),
) -> dict[str, Any]:
    deployment_id = f"dep-{_uuid4().hex[:8]}"
    deployed_at = body.deployed_at or datetime.now(timezone.utc)

    async with AsyncSessionLocal() as db:
        # Validate service exists first
        svc = await get_service_by_id(db, body.service_id)
        if not svc:
            raise HTTPException(
                status_code=404,
                detail=f"Service '{body.service_id}' does not exist. Please use a valid service ID."
            )

        nearby_anomalies = await get_anomalies_after(
            db, body.service_id, deployed_at, window_minutes=30,
        )

        await save_deployment(db, {
            "deployment_id": deployment_id,
            "service_id": body.service_id,
            "version": body.version,
            "previous_version": body.previous_version,
            "deployed_by": body.deployed_by,
            "environment": body.environment,
            "status": body.status,
            "commit_hash": body.commit_hash,
            "deploy_notes": body.deploy_notes,
            "deployed_at": deployed_at,
        })

        for anomaly in nearby_anomalies:
            det = anomaly.get("detected_at")
            if det:
                if isinstance(det, str):
                    det = datetime.fromisoformat(det.replace("Z", "+00:00"))
                if det.tzinfo is None:
                    det = det.replace(tzinfo=timezone.utc)
                dp = deployed_at
                if dp.tzinfo is None:
                    dp = dp.replace(tzinfo=timezone.utc)
                minutes_after = int((det - dp).total_seconds() / 60)
                await tag_anomaly_with_deployment(
                    db, anomaly["anomaly_id"], deployment_id, minutes_after,
                )

        await ws_manager.broadcast({
            "type": "deployment_created",
            "deployment_id": deployment_id,
            "service_id": body.service_id,
            "version": body.version,
            "deployed_at": deployed_at.isoformat(),
        })

        log.info(
            "deployment.created",
            deployment_id=deployment_id,
            service_id=body.service_id,
            version=body.version,
            nearby_anomalies=len(nearby_anomalies),
        )

        return {
            "deployment_id": deployment_id,
            "correlated_anomalies": len(nearby_anomalies),
            "message": f"Deployment registered. {len(nearby_anomalies)} nearby anomalies found.",
        }


@app.get("/api/v1/services/{service_id}/deployments", tags=["deployments"])
@limiter.limit("100/minute")
async def get_deployments_for_service(
    request: Request,
    service_id: str,
    limit: int = Query(default=20, ge=1, le=100),
    current_user: User = Depends(get_current_active_user),
) -> list[dict[str, Any]]:
    async with AsyncSessionLocal() as db:
        return await get_service_deployments(db, service_id, limit)


@app.get("/api/v1/deployments", tags=["deployments"])
@limiter.limit("100/minute")
async def list_all_deployments(
    request: Request,
    limit: int = Query(default=50, ge=1, le=200),
    current_user: User = Depends(get_current_active_user),
) -> list[dict[str, Any]]:
    async with AsyncSessionLocal() as db:
        return await get_all_deployments(db, limit)


# ─── SLO endpoints ────────────────────────────────────────────────────────────

class SloCreateRequest(BaseModel):
    service_id: str
    name: str
    metric_name: str
    target_value: float
    comparison: str = "less_than"
    window_days: int = 30


@app.get("/api/v1/slos", tags=["slos"])
@limiter.limit("100/minute")
async def list_slos(
    request: Request,
    service_id: Optional[str] = Query(default=None),
    current_user: User = Depends(get_current_active_user),
) -> list[dict[str, Any]]:
    async with AsyncSessionLocal() as db:
        slos = await get_all_active_slos(db, service_id)
        
        # Optimize: Calculate compliance in parallel
        tasks = [calculate_slo_compliance(db, slo) for slo in slos]
        compliances = await asyncio.gather(*tasks)
        
        result = []
        for slo, compliance in zip(slos, compliances):
            result.append({**slo, **compliance})
        return result


@app.get("/api/v1/slos/{slo_id}/history", tags=["slos"])
@limiter.limit("100/minute")
async def get_slo_history(
    request: Request,
    slo_id: str,
    days: int = Query(default=30, ge=1, le=365),
    current_user: User = Depends(get_current_active_user),
) -> list[dict[str, Any]]:
    async with AsyncSessionLocal() as db:
        return await get_slo_snapshots(db, slo_id, days)


@app.post("/api/v1/slos", tags=["slos"])
@limiter.limit("20/minute")
async def create_slo(
    request: Request,
    body: SloCreateRequest,
    current_user: User = Depends(require_admin),
) -> dict[str, Any]:
    slo_id = f"slo-{_uuid4().hex[:8]}"
    async with AsyncSessionLocal() as db:
        try:
            await save_slo(db, {
                "slo_id": slo_id,
                "service_id": body.service_id,
                "name": body.name,
                "metric_name": body.metric_name,
                "target_value": body.target_value,
                "comparison": body.comparison,
                "window_days": body.window_days,
                "created_by": current_user.username,
            })
            return {"slo_id": slo_id, "status": "created"}
        except IntegrityError as e:
            await db.rollback()
            if "slos_service_id_fkey" in str(e):
                raise HTTPException(status_code=404, detail=f"Service '{body.service_id}' does not exist.")
            raise HTTPException(status_code=400, detail="Database integrity violation.")


@app.delete("/api/v1/slos/{slo_id}", tags=["slos"])
async def deactivate_slo(
    request: Request,
    slo_id: str,
    current_user: User = Depends(require_admin),
) -> dict[str, str]:
    async with AsyncSessionLocal() as db:
        await set_slo_inactive(db, slo_id)
        return {"status": "deactivated"}


# ─── ANOMALY EXPLANATION endpoint ─────────────────────────────────────────────

@app.get("/api/v1/anomalies/{anomaly_id}/explanation", tags=["anomalies"])
@limiter.limit("100/minute")
async def get_anomaly_explanation(
    request: Request,
    anomaly_id: str,
    current_user: User = Depends(get_current_active_user),
) -> dict[str, Any]:
    async with AsyncSessionLocal() as db:
        anomaly = await get_anomaly_by_id(db, anomaly_id)
        if not anomaly:
            raise HTTPException(status_code=404, detail="Anomaly not found")

        features = anomaly.get("features") or {}
        if isinstance(features, str):
            try:
                features = json.loads(features)
            except Exception:
                features = {}

        explanation = features.get("shap_explanation", [])

        if not explanation:
            return {
                "anomaly_id": anomaly_id,
                "has_explanation": False,
                "feature_values": {
                    k: v for k, v in features.items()
                    if k not in ("shap_explanation", "top_contributor")
                },
                "explanation": [],
            }

        return {
            "anomaly_id": anomaly_id,
            "has_explanation": True,
            "top_contributor": features.get("top_contributor", "unknown"),
            "if_score": anomaly.get("if_score"),
            "lstm_score": anomaly.get("lstm_score"),
            "combined_score": anomaly.get("anomaly_score"),
            "explanation": explanation,
        }

