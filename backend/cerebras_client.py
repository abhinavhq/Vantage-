"""
Thin wrapper around the Cerebras Cloud chat completions API.

Uses plain HTTP (requests) rather than an extra SDK on purpose: it keeps
the dependency surface small (easier to security-review) and makes the
request/response shape fully visible for debugging.
"""
import os
from typing import List, Optional, Tuple

import requests

CEREBRAS_API_URL = "https://api.cerebras.ai/v1/chat/completions"
DEFAULT_MODEL = os.getenv("CEREBRAS_MODEL", "gpt-oss-120b")
REQUEST_TIMEOUT = 20


class CerebrasError(Exception):
    """Raised when the Cerebras API call fails or returns something unusable."""


def _api_key() -> str:
    key = os.getenv("CEREBRAS_API_KEY")
    if not key:
        raise CerebrasError(
            "CEREBRAS_API_KEY is not set. Copy .env.example to .env and add your key."
        )
    return key


def _infer_mood(reply_text: str, mode: str) -> str:
    lowered = reply_text.lower()
    if mode == "ops" and any(
        w in lowered for w in ("capacity", "redirect", "evacuat", "urgent", "immediately", "divert")
    ):
        return "alert"
    if any(w in lowered for w in ("sorry", "unfortunately", "unable", "closed", "cannot")):
        return "warning"
    return "helpful"


def get_chat_completion(
    system_prompt: str,
    history: List[dict],
    user_message: str,
    mode: str = "fan",
    model: Optional[str] = None,
) -> Tuple[str, str]:
    """
    Calls the Cerebras chat completions endpoint.

    Returns (reply_text, inferred_mood). Raises CerebrasError on any failure
    so the API layer can turn it into a clean HTTP error instead of a 500.
    """
    messages = [{"role": "system", "content": system_prompt}]
    for turn in history:
        role = turn.get("role") if isinstance(turn, dict) else getattr(turn, "role", None)
        content = turn.get("content") if isinstance(turn, dict) else getattr(turn, "content", None)
        if role in ("user", "assistant") and content:
            messages.append({"role": role, "content": str(content)[:1000]})
    messages.append({"role": "user", "content": user_message})

    payload = {
        "model": model or DEFAULT_MODEL,
        "messages": messages,
        "max_tokens": 400,
        "temperature": 0.6,
    }

    try:
        response = requests.post(
            CEREBRAS_API_URL,
            headers={
                "Authorization": f"Bearer {_api_key()}",
                "Content-Type": "application/json",
            },
            json=payload,
            timeout=REQUEST_TIMEOUT,
        )
        response.raise_for_status()
    except requests.RequestException as e:
        raise CerebrasError(f"Cerebras request failed: {e}") from e

    data = response.json()
    try:
        reply = data["choices"][0]["message"]["content"].strip()
    except (KeyError, IndexError, TypeError) as e:
        raise CerebrasError(f"Unexpected Cerebras response shape: {e}") from e

    mood = _infer_mood(reply, mode)
    return reply, mood
