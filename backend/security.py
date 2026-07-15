"""
Lightweight, dependency-free helpers for basic abuse prevention.

Demo-grade and in-memory / single-process. A real production deployment
should move rate limiting to a shared store (e.g. Redis) or an API
gateway / WAF in front of the service.
"""
import re
import time
from collections import defaultdict, deque
from threading import Lock


class RateLimiter:
    def __init__(self, max_requests: int = 30, window_seconds: int = 60):
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self._hits = defaultdict(deque)
        self._lock = Lock()

    def allow(self, key: str) -> bool:
        now = time.time()
        with self._lock:
            hits = self._hits[key]
            while hits and now - hits[0] > self.window_seconds:
                hits.popleft()
            if len(hits) >= self.max_requests:
                return False
            hits.append(now)
            return True


_CONTROL_CHARS = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")


def sanitize_text(text: str, max_length: int = 500) -> str:
    """Strips control characters and caps length. Not a substitute for
    output encoding — the frontend must still treat all chat content as
    text, never inject it as HTML."""
    if not isinstance(text, str):
        return ""
    cleaned = _CONTROL_CHARS.sub("", text).strip()
    return cleaned[:max_length]
