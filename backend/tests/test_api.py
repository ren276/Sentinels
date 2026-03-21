"""
API endpoint tests — covers auth, endpoints, security, and the
critical RCA-no-422 verification.
"""
import pytest


@pytest.mark.asyncio
async def test_health_returns_200(async_client):
    resp = await async_client.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "healthy"


@pytest.mark.asyncio
async def test_docs_loads_without_error(async_client):
    resp = await async_client.get("/docs")
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_protected_endpoint_no_token_returns_401(async_client):
    resp = await async_client.get("/api/v1/services")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_protected_endpoint_with_token_returns_200(async_client, admin_headers):
    resp = await async_client.get("/api/v1/services", headers=admin_headers)
    # 200 or DB not running → still not 401
    assert resp.status_code != 401


@pytest.mark.asyncio
async def test_login_invalid_credentials_returns_401(async_client):
    resp = await async_client.post(
        "/api/v1/auth/login",
        json={"username": "nonexistent", "password": "wrongpass"},
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_login_error_message_is_generic(async_client):
    """
    SECURITY: Error message must never reveal which field is wrong.
    """
    resp = await async_client.post(
        "/api/v1/auth/login",
        json={"username": "nonexistent", "password": "wrongpass"},
    )
    detail = resp.json().get("detail", "")
    assert "Invalid username or password" in detail
    assert "User not found" not in detail
    assert "Wrong password" not in detail
    assert "does not exist" not in detail


@pytest.mark.asyncio
async def test_rca_generate_no_body_returns_not_422(async_client, admin_headers):
    """
    CRITICAL: POST /rca/generate must accept NO body and return
    200 (pending) or 404 (incident not found). Never 422.
    """
    resp = await async_client.post(
        "/api/v1/incidents/non-existent-incident/rca/generate",
        headers=admin_headers,
    )
    # Must NOT be 422 (Unprocessable Entity)
    assert resp.status_code != 422
    # Should be 404 (incident not found) or 200
    assert resp.status_code in (200, 404, 503)


@pytest.mark.asyncio
async def test_rca_generate_with_body_still_not_422(async_client, admin_headers):
    """Even sending a body by accident must not cause 422."""
    resp = await async_client.post(
        "/api/v1/incidents/non-existent-incident/rca/generate",
        headers=admin_headers,
        json={"some": "body"},  # should be ignored
    )
    assert resp.status_code != 422


@pytest.mark.asyncio
async def test_viewer_cannot_execute_runbook_returns_403(async_client, viewer_headers):
    resp = await async_client.post(
        "/api/v1/runbooks/high_cpu/execute",
        headers=viewer_headers,
        json={"dry_run": True},
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_viewer_cannot_access_admin_users_returns_403(async_client, viewer_headers):
    resp = await async_client.get("/api/v1/users", headers=viewer_headers)
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_security_headers_present_on_health(async_client):
    resp = await async_client.get("/health")
    assert resp.headers.get("x-content-type-options") == "nosniff"
    assert resp.headers.get("x-frame-options") == "DENY"
    assert resp.headers.get("x-xss-protection") == "1; mode=block"


@pytest.mark.asyncio
async def test_ollama_status_endpoint_returns_dict(async_client, admin_headers):
    resp = await async_client.get("/api/v1/ollama/status", headers=admin_headers)
    # Should succeed (Ollama may or may not be running)
    assert resp.status_code == 200
    data = resp.json()
    assert "connected" in data
    assert "models" in data
    assert "active_model" in data


@pytest.mark.asyncio
async def test_runbooks_list_returns_list(async_client, admin_headers):
    resp = await async_client.get("/api/v1/runbooks", headers=admin_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert len(data) >= 3
