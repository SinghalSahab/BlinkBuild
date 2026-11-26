"""Pytest configuration: isolate CrewAI storage directory to /tmp."""

import os

os.environ.setdefault("CREWAI_STORAGE_DIR", "/tmp/crewai_storage")
os.environ.setdefault("CREWAI_TRACING_ENABLED", "false")
