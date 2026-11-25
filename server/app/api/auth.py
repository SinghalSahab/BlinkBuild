"""Internal shared-secret and forwarded Clerk user ID authentication."""

import hmac
from fastapi import Header, HTTPException, status
from app.config.settings import get_settings


def verify_internal_auth(
    x_blinkbuild_secret: str | None = Header(default=None, alias="X-BlinkBuild-Secret"),
    x_clerk_user_id: str | None = Header(default=None, alias="X-Clerk-User-Id"),
) -> str:
    """Validate internal shared secret and forwarded Clerk user ID."""
    settings = get_settings()

    if not x_blinkbuild_secret or not hmac.compare_digest(
        x_blinkbuild_secret, settings.blinkbuild_server_secret
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing server secret",
        )

    if not x_clerk_user_id or not x_clerk_user_id.strip():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing forwarded Clerk user ID",
        )

    return x_clerk_user_id.strip()
