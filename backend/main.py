"""
Vantage — GenAI Stadium Companion for FIFA World Cup 2026

FastAPI backend that serves the REST API and the static frontend from
a single process, so the whole thing deploys as one web service.
"""
import logging
import os
import time
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from backend.cerebras_client import CerebrasError, get_chat_completion
from backend.models import ChatRequest, ChatResponse, CrowdStatusResponse
from backend.security import RateLimiter, sanitize_text
from backend.stadium_data import (
    STADIUM_KNOWLEDGE_BASE,
    generate_ops_alerts,
    simulate_crowd_density,
)

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("vantage")

app = FastAPI(title="Vantage — Stadium Companion", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("ALLOWED_ORIGINS", "*").split(","),
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

rate_limiter = RateLimiter(max_requests=30, window_seconds=60)

STATIC_DIR = Path(__file__).resolve().parent.parent / "static"


@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next):
    if request.url.path.startswith("/api/"):
        client_ip = request.client.host if request.client else "unknown"
        if not rate_limiter.allow(client_ip):
            raise HTTPException(status_code=429, detail="Too many requests — please slow down.")
    return await call_next(request)


@app.get("/api/health")
async def health():
    return {"status": "ok", "time": time.time()}


@app.get("/api/crowd-status", response_model=CrowdStatusResponse)
async def crowd_status():
    density = simulate_crowd_density()
    alerts = generate_ops_alerts(density)
    return CrowdStatusResponse(zones=density, alerts=alerts, generated_at=time.time())


@app.post("/api/chat", response_model=ChatResponse)
async def chat(req: ChatRequest):
    message = sanitize_text(req.message, max_length=500)
    if not message:
        raise HTTPException(status_code=400, detail="Message is empty or invalid.")

    system_prompt = _build_system_prompt(req.mode)
    history = [h.model_dump() for h in req.history[-6:]] if req.history else []

    try:
        reply, mood = get_chat_completion(
            system_prompt=system_prompt,
            history=history,
            user_message=message,
            mode=req.mode,
        )
    except CerebrasError as e:
        logger.error("Cerebras call failed: %s", e)
        raise HTTPException(
            status_code=502,
            detail="The assistant is temporarily unavailable. Please try again shortly.",
        )

    return ChatResponse(reply=reply, mood=mood)


def _build_system_prompt(mode: str) -> str:
    if mode == "ops":
        density = simulate_crowd_density()
        lines = "\n".join(f"- {zone}: {level}% capacity" for zone, level in density.items())
        return (
            "You are Vantage, an operations intelligence assistant for stadium staff "
            "during the FIFA World Cup 2026. Help staff make fast, clear decisions about "
            "crowd flow, safety, and logistics. Be concise, specific, and actionable — "
            "staff are reading this on the move. Always reply in the same language the "
            "staff member wrote in.\n\nCurrent live zone capacity:\n" + lines
        )
    return (
        "You are Vantage, a friendly GenAI companion for fans at the FIFA World Cup 2026. "
        "Help with navigation, accessibility, transportation, and sustainability questions "
        "using the stadium reference information below. Keep answers short, warm, and easy "
        "to follow. Always reply in the same language the fan wrote in, even if it isn't "
        "English — that's one of your most important jobs.\n\n" + STADIUM_KNOWLEDGE_BASE
    )


# Mounted last so it never shadows the /api/* routes above.
app.mount("/", StaticFiles(directory=str(STATIC_DIR), html=True), name="static")
