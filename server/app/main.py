"""FastAPI application entry point for BlinkBuild server."""

from contextlib import asynccontextmanager
from fastapi import Depends, FastAPI
from app.api.auth import verify_internal_auth
from app.config.settings import get_settings


@asynccontextmanager
async def lifespan(_: FastAPI):
    """Fail fast on startup if required environment variables are missing."""
    get_settings()
    yield


app = FastAPI(
    title="BlinkBuild Server",
    version="0.1.0",
    lifespan=lifespan,
)


@app.get("/health")
def health() -> dict[str, str]:
    """Unauthenticated health check endpoint."""
    settings = get_settings()
    return {"status": "ok", "version": settings.app_version}


@app.get("/protected/ping")
def protected_ping(user_id: str = Depends(verify_internal_auth)) -> dict[str, str]:
    """Authenticated smoke-check route verifying shared-secret + Clerk user ID."""
    return {"status": "ok", "user_id": user_id}
