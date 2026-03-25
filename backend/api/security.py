from datetime import datetime, timedelta, timezone
from typing import Optional
from uuid import uuid4

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response
import re

from .config import settings
from .database import AsyncSessionLocal

pwd_context = CryptContext(schemes=["bcrypt"], bcrypt__rounds=12, deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login", auto_error=False)


# ─── Password helpers ────────────────────────────────────────────────────────

def hash_password(plain: str) -> str:
    return pwd_context.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def validate_password_strength(password: str) -> bool:
    if len(password) < 8:
        return False
    if not re.search(r"[A-Z]", password):
        return False
    if not re.search(r"[a-z]", password):
        return False
    if not re.search(r"\d", password):
        return False
    if not re.search(r"[!@#$%^&*()_+\-=\[\]{};':\"\\|,.<>\/?]", password):
        return False
    return True


# ─── Pydantic models ─────────────────────────────────────────────────────────

class Token(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int  # seconds


class TokenData(BaseModel):
    username: Optional[str] = None
    role: Optional[str] = None
    jti: Optional[str] = None
    exp: Optional[int] = None
    email: Optional[str] = None
    full_name: Optional[str] = None


class User(BaseModel):
    user_id: str
    username: str
    email: str
    role: str  # admin | operator | viewer
    is_active: bool
    created_at: datetime
    last_login: Optional[datetime] = None
    failed_login_attempts: int = 0
    locked_until: Optional[datetime] = None


# ─── JWT helpers ─────────────────────────────────────────────────────────────

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    to_encode.update({
        "exp": expire,
        "iat": datetime.now(timezone.utc),
        "jti": str(uuid4()),
        "type": "access",
    })
    return jwt.encode(to_encode, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def create_refresh_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    to_encode.update({
        "exp": expire,
        "iat": datetime.now(timezone.utc),
        "jti": str(uuid4()),
        "type": "refresh",
    })
    return jwt.encode(to_encode, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


async def verify_token(token: str, redis_client) -> TokenData:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        # Check algorithm (ES256 support for Supabase OAuth)
        if token.startswith("eyJhbGciOiJFUzI1NiIs"):
            from supabase import create_client
            sb_client = create_client(settings.SUPABASE_URL, settings.SUPABASE_ANON_KEY)
            res = sb_client.auth.get_user(token)
            if not res or not res.user:
                raise credentials_exception
            
            # Map Supabase User to our TokenData
            # Note: Supabase provides its own role (often 'authenticated'), 
            # but we'll use 'viewer' as a default if not present or map it.
            return TokenData(
                username=res.user.id, 
                role=res.user.role or "viewer", 
                jti=None, 
                exp=None,
                email=res.user.email,
                full_name=res.user.user_metadata.get("full_name") or res.user.user_metadata.get("name")
            )

        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
        username: str = payload.get("sub")
        jti = payload.get("jti")
        role = payload.get("role")
        exp = payload.get("exp")
        if username is None:
            raise credentials_exception
        # Check revocation (only if jti is present)
        if jti and await is_token_revoked(jti, redis_client):
            raise credentials_exception
        return TokenData(
            username=username, 
            role=role, 
            jti=jti, 
            exp=exp,
            email=payload.get("email"),
            full_name=payload.get("full_name") or payload.get("name")
        )
    except JWTError as e:
        log.error("auth.token_verify_failed", error=str(e), token_preview=token[:20] if token else "None")
        raise credentials_exception


# ─── Token revocation ────────────────────────────────────────────────────────

async def revoke_token(jti: str, ttl: int, redis_client) -> None:
    await redis_client.setex(f"revoked:{jti}", ttl, "1")


async def is_token_revoked(jti: str, redis_client) -> bool:
    result = await redis_client.exists(f"revoked:{jti}")
    return bool(result)


# ─── FastAPI dependencies ─────────────────────────────────────────────────────

async def get_redis():
    """Yield redis connection from pool — imported from main at runtime."""
    from .main import redis_pool
    yield redis_pool

from structlog import get_logger
log = get_logger()


async def get_current_user(
    request: Request,
    token: Optional[str] = Depends(oauth2_scheme),
    redis_client=Depends(get_redis),
) -> User:
    from .main import get_db
    from .database import get_user_by_username, get_user_by_id
    
    # Fallback to cookie if Bearer token is missing
    if not token and request:
        token = request.cookies.get("sentinel_session")
        
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )
        
    token_data = await verify_token(token, redis_client)
    async with AsyncSessionLocal() as db:
        # Search by ID first (Supabase sub is the UUID)
        user = await get_user_by_id(db, token_data.username)
        if user:
            pass
        else:
            # Fallback to username
            user = await get_user_by_username(db, token_data.username)
            if user:
                pass
            
        if user is None:
            log.info("auth.user_not_found_local", sub=token_data.username)
            # AUTO-PROVISION Supabase/OAuth User if not found locally
            if token_data.email:
                try:
                    from .database import create_oauth_user
                    # Default role is viewer for auto-provisioned
                    user = await create_oauth_user(
                        db=db,
                        username=token_data.email.split("@")[0][:50],
                        email=token_data.email,
                        name=token_data.full_name or token_data.email.split("@")[0],
                        provider="external",
                        role="viewer",
                        user_id=token_data.username # Pass the verified UUID/sub
                    )
                except Exception as e:
                    log.error("auth.auto_provision_failed", error=str(e))
                    # Rollback the broken transaction so the session is usable again
                    try:
                        await db.rollback()
                    except Exception:
                        pass
                    # Try to find the user by email (they may already exist)
                    from .database import get_user_by_email
                    try:
                        user = await get_user_by_email(db, token_data.email)
                    except Exception:
                        pass
                
        if user is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Could not validate credentials")
            
        return User(
            user_id=user["user_id"],
            username=user["username"],
            email=user["email"],
            role=user["role"],
            is_active=user["is_active"],
            created_at=user["created_at"],
            last_login=user.get("last_login"),
            failed_login_attempts=user.get("failed_login_attempts", 0),
            locked_until=user.get("locked_until"),
        )


async def get_current_active_user(user: User = Depends(get_current_user)) -> User:
    if not user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")
    if user.locked_until and user.locked_until > datetime.now(timezone.utc):
        raise HTTPException(status_code=403, detail="Account temporarily locked")
    return user


async def require_admin(user: User = Depends(get_current_active_user)) -> User:
    if user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return user


async def require_operator(user: User = Depends(get_current_active_user)) -> User:
    if user.role not in ("admin", "operator"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Operator or admin access required")
    return user


# ─── Security headers middleware ──────────────────────────────────────────────

class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        
        # CSP header
        csp_rules = [
            "default-src 'self'",
            "script-src 'self' 'unsafe-inline' 'unsafe-eval'", # unsafe-eval for some frontend libs if needed
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data: https://avatars.githubusercontent.com https://lh3.googleusercontent.com",
            "connect-src 'self' wss: http://127.0.0.1:8000",
            "font-src 'self'",
            "frame-ancestors 'none'",
            "base-uri 'self'",
            "form-action 'self'",
        ]
        response.headers["Content-Security-Policy"] = "; ".join(csp_rules)
        
        # Privacy & Tech detection prevention
        response.headers["X-DNS-Prefetch-Control"] = "off"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=(), payment=()"
        
        # HSTS in production
        if settings.ENVIRONMENT == "production":
            response.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains; preload"
        
        # Hide Server header
        response.headers["Server"] = ""
        
        return response
