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

pwd_context = CryptContext(schemes=["bcrypt"], bcrypt__rounds=12, deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")


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
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
        username: str = payload.get("sub")
        jti: str = payload.get("jti")
        role: str = payload.get("role")
        exp: int = payload.get("exp")
        if username is None or jti is None:
            raise credentials_exception
        # Check revocation
        if await is_token_revoked(jti, redis_client):
            raise credentials_exception
        return TokenData(username=username, role=role, jti=jti, exp=exp)
    except JWTError:
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


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    redis_client=Depends(get_redis),
) -> User:
    from .main import get_db
    from .database import get_user_by_username
    token_data = await verify_token(token, redis_client)
    async for db in get_db():
        user = await get_user_by_username(db, token_data.username)
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
        response.headers["Content-Security-Policy"] = "default-src 'self'"
        if settings.ENVIRONMENT == "production":
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        return response
