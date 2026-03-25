"""
Pytest fixtures for Sentinel backend tests.
"""
import asyncio
from datetime import datetime, timezone
from unittest.mock import AsyncMock

import pytest
import pytest_asyncio
from fastapi import Request
from httpx import ASGITransport, AsyncClient

from api.main import app
from api.security import User, create_access_token, hash_password, verify_token


@pytest.fixture(scope="session")
def event_loop_policy():
    return asyncio.DefaultEventLoopPolicy()


@pytest.fixture(scope="session")
def event_loop():
    policy = asyncio.DefaultEventLoopPolicy()
    loop = policy.new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture(scope="session")
async def async_client():
    admin_user = {
        "user_id": "admin",
        "username": "admin",
        "email": "admin@example.com",
        "role": "admin",
        "is_active": True,
        "created_at": datetime.now(timezone.utc),
        "last_login": None,
        "failed_login_attempts": 0,
        "locked_until": None,
        "hashed_password": hash_password("admin"),
    }
    viewer_user = {
        "user_id": "viewer",
        "username": "viewer",
        "email": "viewer@example.com",
        "role": "viewer",
        "is_active": True,
        "created_at": datetime.now(timezone.utc),
        "last_login": None,
        "failed_login_attempts": 0,
        "locked_until": None,
        "hashed_password": hash_password("viewer"),
    }
    fake_users = {
        admin_user["user_id"]: admin_user,
        viewer_user["user_id"]: viewer_user,
        admin_user["username"]: admin_user,
        viewer_user["username"]: viewer_user,
    }

    mock_redis = AsyncMock()
    mock_redis.exists = AsyncMock(return_value=0)
    mock_redis.get = AsyncMock(return_value=None)
    mock_redis.setex = AsyncMock(return_value=True)

    import api.main as main_module
    main_module.redis_pool = mock_redis

    import api.security as security_module
    security_module._redis_client = mock_redis

    class FakeSession:
        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return False

        async def rollback(self):
            return None

        async def commit(self):
            return None

    class FakeSessionFactory:
        def __call__(self):
            return FakeSession()

    async def fake_get_current_active_user(request: Request):
        auth = request.headers.get("authorization", "")
        token = auth.split(" ", 1)[1] if auth.lower().startswith("bearer ") else None
        if not token:
            token = request.cookies.get("sentinel_session")
        if not token:
            from fastapi import HTTPException
            raise HTTPException(status_code=401, detail="Authentication required")

        token_data = await verify_token(token, mock_redis)
        user = fake_users.get(token_data.username)
        if user is None:
            from fastapi import HTTPException
            raise HTTPException(status_code=401, detail="Could not validate credentials")

        return User(
            user_id=user["user_id"],
            username=user["username"],
            email=user["email"],
            role=user["role"],
            is_active=user["is_active"],
            created_at=user["created_at"],
            last_login=user["last_login"],
            failed_login_attempts=user["failed_login_attempts"],
            locked_until=user["locked_until"],
        )

    async def fake_get_user_by_username(db, username):
        user = fake_users.get(username)
        return dict(user) if user else None

    async def fake_get_all_services(db):
        return [
            {"service_id": "svc-api", "name": "API", "health_status": "healthy"},
            {"service_id": "svc-worker", "name": "Worker", "health_status": "healthy"},
        ]

    async def fake_get_incident_by_id(db, incident_id):
        return None

    async def fake_get_all_users(db):
        return [
            {
                "user_id": admin_user["user_id"],
                "username": admin_user["username"],
                "email": admin_user["email"],
                "role": admin_user["role"],
                "is_active": admin_user["is_active"],
                "created_at": admin_user["created_at"],
                "last_login": admin_user["last_login"],
                "failed_login_attempts": admin_user["failed_login_attempts"],
            },
            {
                "user_id": viewer_user["user_id"],
                "username": viewer_user["username"],
                "email": viewer_user["email"],
                "role": viewer_user["role"],
                "is_active": viewer_user["is_active"],
                "created_at": viewer_user["created_at"],
                "last_login": viewer_user["last_login"],
                "failed_login_attempts": viewer_user["failed_login_attempts"],
            },
        ]

    async def fake_write_audit_log(*args, **kwargs):
        return None

    async def fake_update_user_login_failure(*args, **kwargs):
        return None

    async def fake_update_user_login_success(*args, **kwargs):
        return None

    main_module.AsyncSessionLocal = FakeSessionFactory()
    main_module.get_user_by_username = fake_get_user_by_username
    main_module.get_all_services = fake_get_all_services
    main_module.get_incident_by_id = fake_get_incident_by_id
    main_module.get_all_users = fake_get_all_users
    main_module.write_audit_log = fake_write_audit_log
    main_module.update_user_login_failure = fake_update_user_login_failure
    main_module.update_user_login_success = fake_update_user_login_success

    app.dependency_overrides[security_module.get_current_active_user] = fake_get_current_active_user

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client

    main_module.redis_pool = None
    app.dependency_overrides.clear()


@pytest.fixture(scope="session")
def admin_token():
    return create_access_token({"sub": "admin", "role": "admin"})


@pytest.fixture(scope="session")
def viewer_token():
    return create_access_token({"sub": "viewer", "role": "viewer"})


@pytest.fixture(scope="session")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="session")
def viewer_headers(viewer_token):
    return {"Authorization": f"Bearer {viewer_token}"}
