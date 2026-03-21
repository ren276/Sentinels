"""
Pytest fixtures for Sentinel backend tests.
"""
import asyncio
import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport

from api.main import app
from api.security import create_access_token, create_refresh_token


@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture
async def async_client():
    """AsyncClient for testing FastAPI endpoints."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client


@pytest.fixture
def admin_token():
    """JWT access token for admin user."""
    return create_access_token({"sub": "admin", "role": "admin"})


@pytest.fixture
def viewer_token():
    """JWT access token for viewer user."""
    return create_access_token({"sub": "viewer", "role": "viewer"})


@pytest.fixture
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture
def viewer_headers(viewer_token):
    return {"Authorization": f"Bearer {viewer_token}"}
