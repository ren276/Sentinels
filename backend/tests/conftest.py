"""
Pytest fixtures for Sentinel backend tests.
"""
import asyncio
from unittest.mock import AsyncMock
import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport

from api.main import app
from api.security import create_access_token


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
    mock_redis = AsyncMock()
    mock_redis.exists = AsyncMock(return_value=0)
    mock_redis.get = AsyncMock(return_value=None)
    mock_redis.setex = AsyncMock(return_value=True)

    import api.main as main_module
    main_module.redis_pool = mock_redis

    import api.security as security_module
    security_module._redis_client = mock_redis

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client

    main_module.redis_pool = None


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