"""Alembic environment configured for SQLite batch mode."""

import os
from logging.config import fileConfig
from alembic import context
from app.state.db import Base, create_sqlite_engine

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def _get_db_path() -> str:
    url = config.get_main_option("sqlalchemy.url")
    if url and url.startswith("sqlite:///"):
        return url.removeprefix("sqlite:///")
    db_path = os.environ.get("SQLITE_DB_PATH")
    if not db_path:
        raise RuntimeError("SQLITE_DB_PATH must be set for Alembic migrations")
    return db_path


def run_migrations_offline() -> None:
    db_path = _get_db_path()
    context.configure(
        url=f"sqlite:///{db_path}",
        target_metadata=target_metadata,
        literal_binds=True,
        render_as_batch=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    db_path = _get_db_path()
    connectable = create_sqlite_engine(db_path)

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            render_as_batch=True,
        )
        with context.begin_transaction():
            context.run_migrations()

    connectable.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
