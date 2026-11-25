"""Environment-only settings loader with fail-fast validation."""

from functools import lru_cache
from pydantic import Field, ValidationError
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Server settings loaded exclusively from environment variables."""

    model_config = SettingsConfigDict(extra="ignore")

    app_version: str = "0.1.0"
    blinkbuild_server_secret: str = Field(..., min_length=1, alias="BLINKBUILD_SERVER_SECRET")
    sqlite_db_path: str = Field(..., min_length=1, alias="SQLITE_DB_PATH")


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Load and validate settings, failing fast without exposing secret values."""
    try:
        return Settings()  # type: ignore[call-arg]
    except ValidationError as exc:
        missing = [
            ".".join(str(part) for part in err["loc"])
            for err in exc.errors()
        ]
        raise RuntimeError(
            f"Missing or invalid required environment variable(s): {', '.join(missing)}"
        ) from None
