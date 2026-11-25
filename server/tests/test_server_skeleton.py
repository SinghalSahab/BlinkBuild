"""Phase 2 tests for FastAPI skeleton, settings validation, and internal auth."""

import pytest
from fastapi.testclient import TestClient
from app.config.settings import get_settings
from app.main import app


@pytest.fixture(autouse=True)
def reset_settings_cache():
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def test_missing_required_env_fails_fast(monkeypatch):
    monkeypatch.delenv("BLINKBUILD_SERVER_SECRET", raising=False)
    monkeypatch.setenv("SQLITE_DB_PATH", "/tmp/test.db")
    with pytest.raises(RuntimeError, match="BLINKBUILD_SERVER_SECRET"):
        get_settings()


def test_health_endpoint_unauthenticated(monkeypatch):
    monkeypatch.setenv("BLINKBUILD_SERVER_SECRET", "test-secret-123")
    monkeypatch.setenv("SQLITE_DB_PATH", "/tmp/test.db")
    with TestClient(app) as client:
        resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok", "version": "0.1.0"}


def test_protected_route_rejects_missing_secret(monkeypatch):
    monkeypatch.setenv("BLINKBUILD_SERVER_SECRET", "test-secret-123")
    monkeypatch.setenv("SQLITE_DB_PATH", "/tmp/test.db")
    with TestClient(app) as client:
        resp = client.get("/protected/ping", headers={"X-Clerk-User-Id": "user_1"})
    assert resp.status_code == 401


def test_protected_route_rejects_wrong_secret(monkeypatch):
    monkeypatch.setenv("BLINKBUILD_SERVER_SECRET", "test-secret-123")
    monkeypatch.setenv("SQLITE_DB_PATH", "/tmp/test.db")
    with TestClient(app) as client:
        resp = client.get(
            "/protected/ping",
            headers={
                "X-BlinkBuild-Secret": "wrong-secret",
                "X-Clerk-User-Id": "user_1",
            },
        )
    assert resp.status_code == 401


def test_protected_route_rejects_missing_user_id(monkeypatch):
    monkeypatch.setenv("BLINKBUILD_SERVER_SECRET", "test-secret-123")
    monkeypatch.setenv("SQLITE_DB_PATH", "/tmp/test.db")
    with TestClient(app) as client:
        resp = client.get(
            "/protected/ping",
            headers={"X-BlinkBuild-Secret": "test-secret-123"},
        )
    assert resp.status_code == 401


def test_protected_route_accepts_valid_headers(monkeypatch):
    monkeypatch.setenv("BLINKBUILD_SERVER_SECRET", "test-secret-123")
    monkeypatch.setenv("SQLITE_DB_PATH", "/tmp/test.db")
    with TestClient(app) as client:
        resp = client.get(
            "/protected/ping",
            headers={
                "X-BlinkBuild-Secret": "test-secret-123",
                "X-Clerk-User-Id": "user_abc",
            },
        )
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok", "user_id": "user_abc"}
