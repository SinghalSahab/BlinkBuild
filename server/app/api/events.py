"""In-memory per-run SSE event bus with replay buffer for reconnects (P10-T7, PM.md 11.2)."""

import asyncio
import json
from collections import defaultdict
from datetime import datetime, timezone
from typing import Any, AsyncIterator


class RunEventBus:
    """Stores ordered events per run_id and notifies live SSE subscribers."""

    def __init__(self) -> None:
        self._history: dict[str, list[dict[str, Any]]] = defaultdict(list)
        self._subscribers: dict[str, list[asyncio.Queue[dict[str, Any] | None]]] = defaultdict(list)

    def publish(
        self,
        *,
        run_id: str,
        event_type: str,
        message: str,
        data: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        seq = len(self._history[run_id]) + 1
        payload = {
            "id": seq,
            "event": event_type,
            "run_id": run_id,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "message": message,
            "data": data or {},
        }
        self._history[run_id].append(payload)
        for queue in list(self._subscribers[run_id]):
            queue.put_nowait(payload)
        return payload

    def close(self, run_id: str) -> None:
        for queue in list(self._subscribers[run_id]):
            queue.put_nowait(None)

    def get_history(self, run_id: str, after_id: int = 0) -> list[dict[str, Any]]:
        return [ev for ev in self._history[run_id] if ev["id"] > after_id]

    async def subscribe(self, run_id: str, after_id: int = 0) -> AsyncIterator[str]:
        queue: asyncio.Queue[dict[str, Any] | None] = asyncio.Queue()
        self._subscribers[run_id].append(queue)
        try:
            for ev in self.get_history(run_id, after_id=after_id):
                yield f"id: {ev['id']}\nevent: {ev['event']}\ndata: {json.dumps(ev)}\n\n"
            while True:
                ev = await queue.get()
                if ev is None:
                    break
                yield f"id: {ev['id']}\nevent: {ev['event']}\ndata: {json.dumps(ev)}\n\n"
        finally:
            if queue in self._subscribers[run_id]:
                self._subscribers[run_id].remove(queue)
