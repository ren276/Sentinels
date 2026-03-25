"""
Security unit tests — password, JWT, token revocation.
"""
import pytest
from datetime import datetime, timezone, timedelta

from api.security import (
    hash_password, verify_password, validate_password_strength,
    create_access_token, create_refresh_token,
)
from jose import jwt
from api.config import settings


# ── Password ──────────────────────────────────────────────────────────────────

def test_password_hash_uses_bcrypt():
    hashed = hash_password("TestPass@123")
    assert hashed.startswith("$2b$")


def test_password_hash_is_different_each_time():
    pw = "TestPass@123"
    assert hash_password(pw) != hash_password(pw)


def test_verify_password_correct():
    pw = "TestPass@123"
    assert verify_password(pw, hash_password(pw)) is True


def test_verify_password_incorrect_returns_false():
    assert verify_password("wrong", hash_password("correct")) is False


def test_weak_password_rejected_too_short():
    assert validate_password_strength("Ab1!") is False


def test_weak_password_rejected_missing_uppercase():
    assert validate_password_strength("abcdefg1!") is False


def test_weak_password_rejected_no_special_char():
    assert validate_password_strength("Abcdefg12") is False


def test_weak_password_rejected_no_digit():
    assert validate_password_strength("Abcdefg!!") is False


def test_strong_password_accepted():
    assert validate_password_strength("Sentinel@Admin1") is True


# ── JWT ───────────────────────────────────────────────────────────────────────

def test_access_token_contains_jti_claim():
    token = create_access_token({"sub": "testuser", "role": "viewer"})
    payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
    assert "jti" in payload
    assert payload["jti"] is not None


def test_refresh_token_contains_jti_claim():
    token = create_refresh_token({"sub": "testuser", "role": "viewer"})
    payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
    assert "jti" in payload


def test_access_refresh_have_different_jti():
    data = {"sub": "testuser", "role": "viewer"}
    access = create_access_token(data)
    refresh = create_refresh_token(data)
    ap = jwt.decode(access, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
    rp = jwt.decode(refresh, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
    assert ap["jti"] != rp["jti"]


def test_token_with_wrong_secret_rejected():
    token = create_access_token({"sub": "testuser", "role": "viewer"})
    with pytest.raises(Exception):
        jwt.decode(token, "WRONG_SECRET" * 5, algorithms=[settings.JWT_ALGORITHM])


def test_token_contains_sub_and_role():
    token = create_access_token({"sub": "admin", "role": "admin"})
    payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
    assert payload["sub"] == "admin"
    assert payload["role"] == "admin"


def test_access_token_expiry_is_in_future():
    token = create_access_token({"sub": "testuser", "role": "viewer"})
    payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
    exp_dt = datetime.fromtimestamp(payload["exp"], tz=timezone.utc)
    assert exp_dt > datetime.now(timezone.utc)


# ── SSRF Guard ───────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_ssrf_guard_blocks_localhost():
    from api.utils import assert_safe_url
    with pytest.raises(ValueError, match="resolves to private network range"):
        await assert_safe_url("https://localhost/webhook")
    with pytest.raises(ValueError, match="resolves to private network range"):
        await assert_safe_url("https://127.0.0.1/webhook")


@pytest.mark.asyncio
async def test_ssrf_guard_blocks_private_ip():
    from api.utils import assert_safe_url
    with pytest.raises(ValueError, match="resolves to private network range"):
        await assert_safe_url("https://192.168.1.1/webhook")


@pytest.mark.asyncio
async def test_ssrf_guard_blocks_non_https():
    from api.utils import assert_safe_url
    with pytest.raises(ValueError, match="Only HTTPS URLs are allowed"):
        await assert_safe_url("http://google.com/webhook")


@pytest.mark.asyncio
async def test_ssrf_guard_allows_public_https():
    from api.utils import assert_safe_url
    # google.com should be fine unless it resolves to a weird local thing in CI
    try:
        await assert_safe_url("https://www.google.com")
    except ValueError as e:
        if "Could not resolve hostname" not in str(e):
             pytest.fail(f"SSRF guard blocked valid URL: {e}")


# ── Revocation ────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_token_revocation_checks_redis():
    from api.security import is_token_revoked, revoke_token
    class MockRedis:
        def __init__(self): self.data = {}
        async def setex(self, k, t, v): self.data[k] = v
        async def exists(self, k): return k in self.data
        
    mock = MockRedis()
    jti = "test-jti-123"
    assert await is_token_revoked(jti, mock) is False
    await revoke_token(jti, 3600, mock)
    assert await is_token_revoked(jti, mock) is True
