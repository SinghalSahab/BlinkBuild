"""SQLAlchemy 2.x ORM models and SQLite engine/session configuration."""

from contextlib import contextmanager
from pathlib import Path
from typing import Iterator
from sqlalchemy import (
    DateTime,
    ForeignKey,
    Integer,
    JSON,
    String,
    Text,
    create_engine,
    event,
)
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, sessionmaker


class Base(DeclarativeBase):
    """Base class for all SQLAlchemy ORM models."""


class RunRow(Base):
    __tablename__ = "runs"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    clerk_user_id: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    prompt: Mapped[str] = mapped_column(Text, nullable=False)
    template_type: Mapped[str] = mapped_column(String(16), nullable=False)
    mode: Mapped[str] = mapped_column(String(16), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    escalation_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), nullable=False)


class PlanRow(Base):
    __tablename__ = "plans"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    run_id: Mapped[str] = mapped_column(ForeignKey("runs.id", ondelete="CASCADE"), nullable=False, index=True)
    activated_agents: Mapped[list] = mapped_column(JSON, nullable=False)
    summary: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), nullable=False)


class TaskRow(Base):
    __tablename__ = "tasks"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    run_id: Mapped[str] = mapped_column(ForeignKey("runs.id", ondelete="CASCADE"), nullable=False, index=True)
    plan_id: Mapped[str | None] = mapped_column(ForeignKey("plans.id", ondelete="SET NULL"), nullable=True)
    owner: Mapped[str] = mapped_column(String(32), nullable=False)
    title: Mapped[str] = mapped_column(String(256), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    acceptance_criteria: Mapped[list] = mapped_column(JSON, nullable=False)
    size_hint: Mapped[str] = mapped_column(String(16), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    requirement_refs: Mapped[list] = mapped_column(JSON, nullable=False)
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), nullable=False)


class ContractRow(Base):
    __tablename__ = "contracts"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    run_id: Mapped[str] = mapped_column(ForeignKey("runs.id", ondelete="CASCADE"), nullable=False, index=True)
    routes: Mapped[list] = mapped_column(JSON, nullable=False)
    frontend_paths: Mapped[list] = mapped_column(JSON, nullable=False)
    backend_paths: Mapped[list] = mapped_column(JSON, nullable=False)
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), nullable=False)


class GeneratedFileRow(Base):
    __tablename__ = "generated_files"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    run_id: Mapped[str] = mapped_column(ForeignKey("runs.id", ondelete="CASCADE"), nullable=False, index=True)
    task_id: Mapped[str | None] = mapped_column(ForeignKey("tasks.id", ondelete="SET NULL"), nullable=True)
    owner: Mapped[str] = mapped_column(String(32), nullable=False)
    path: Mapped[str] = mapped_column(String(512), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    purpose: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), nullable=False)


class TestCaseRow(Base):
    __tablename__ = "test_cases"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    run_id: Mapped[str] = mapped_column(ForeignKey("runs.id", ondelete="CASCADE"), nullable=False, index=True)
    task_id: Mapped[str | None] = mapped_column(ForeignKey("tasks.id", ondelete="SET NULL"), nullable=True)
    name: Mapped[str] = mapped_column(String(256), nullable=False)
    category: Mapped[str] = mapped_column(String(32), nullable=False)
    requirement_ref: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), nullable=False)


class TestResultRow(Base):
    __tablename__ = "test_results"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    run_id: Mapped[str] = mapped_column(ForeignKey("runs.id", ondelete="CASCADE"), nullable=False, index=True)
    check_name: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    duration_ms: Mapped[int] = mapped_column(Integer, nullable=False)
    evidence: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), nullable=False)


class DefectRow(Base):
    __tablename__ = "defects"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    run_id: Mapped[str] = mapped_column(ForeignKey("runs.id", ondelete="CASCADE"), nullable=False, index=True)
    task_id: Mapped[str] = mapped_column(ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False, index=True)
    failing_check: Mapped[str] = mapped_column(String(64), nullable=False)
    evidence: Mapped[str] = mapped_column(Text, nullable=False)
    owner: Mapped[str | None] = mapped_column(String(32), nullable=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    requirement_refs: Mapped[list] = mapped_column(JSON, nullable=False)
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), nullable=False)


class AgentStatusRow(Base):
    __tablename__ = "agent_status"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    run_id: Mapped[str] = mapped_column(ForeignKey("runs.id", ondelete="CASCADE"), nullable=False, index=True)
    agent: Mapped[str] = mapped_column(String(32), nullable=False)
    state: Mapped[str] = mapped_column(String(64), nullable=False)
    current_task_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    updated_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), nullable=False)


class RetryCounterRow(Base):
    __tablename__ = "retry_counters"

    task_id: Mapped[str] = mapped_column(ForeignKey("tasks.id", ondelete="CASCADE"), primary_key=True)
    run_id: Mapped[str] = mapped_column(ForeignKey("runs.id", ondelete="CASCADE"), nullable=False, index=True)
    count: Mapped[int] = mapped_column(Integer, nullable=False)
    max_retries: Mapped[int] = mapped_column(Integer, nullable=False)
    updated_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), nullable=False)


class LlmUsageRow(Base):
    __tablename__ = "llm_usage"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    run_id: Mapped[str] = mapped_column(ForeignKey("runs.id", ondelete="CASCADE"), nullable=False, index=True)
    agent: Mapped[str] = mapped_column(String(32), nullable=False)
    provider: Mapped[str] = mapped_column(String(64), nullable=False)
    model: Mapped[str] = mapped_column(String(128), nullable=False)
    tokens_in: Mapped[int | None] = mapped_column(Integer, nullable=True)
    tokens_out: Mapped[int | None] = mapped_column(Integer, nullable=True)
    latency_ms: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), nullable=False)


class AuditEntryRow(Base):
    __tablename__ = "audit_entries"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    run_id: Mapped[str] = mapped_column(ForeignKey("runs.id", ondelete="CASCADE"), nullable=False, index=True)
    category: Mapped[str] = mapped_column(String(64), nullable=False)
    actor: Mapped[str] = mapped_column(String(64), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    requirement_refs: Mapped[list] = mapped_column(JSON, nullable=False)
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), nullable=False)


def create_sqlite_engine(db_path: str) -> Engine:
    """Create a SQLAlchemy engine configured for SQLite integrity and concurrency."""
    Path(db_path).parent.mkdir(parents=True, exist_ok=True)
    engine = create_engine(
        f"sqlite:///{db_path}",
        connect_args={"timeout": 30},
        future=True,
    )

    @event.listens_for(engine, "connect")
    def _set_sqlite_pragmas(dbapi_connection, _connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.execute("PRAGMA busy_timeout=30000")
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.close()

    return engine


def create_session_factory(engine: Engine) -> sessionmaker[Session]:
    """Create a short-transaction session factory."""
    return sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


@contextmanager
def session_scope(factory: sessionmaker[Session]) -> Iterator[Session]:
    """Provide a short transactional scope; never hold open across LLM/sandbox calls."""
    session = factory()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
