FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    HOME=/data \
    CREWAI_STORAGE_DIR=/data/crewai

WORKDIR /app

RUN addgroup --system --gid 1001 appgroup && \
    adduser --system --uid 1001 --ingroup appgroup appuser && \
    mkdir -p /data && \
    chown -R appuser:appgroup /data /app

COPY pyproject.toml ./
COPY app ./app

RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir .

USER appuser

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
