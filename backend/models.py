"""Pydantic schemas for the Vantage API."""
from typing import Dict, List, Literal, Optional

from pydantic import BaseModel, Field


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(..., max_length=1000)


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=500)
    mode: Literal["fan", "ops"] = "fan"
    history: Optional[List[ChatMessage]] = None


class ChatResponse(BaseModel):
    reply: str
    mood: Literal["idle", "listening", "helpful", "alert", "warning"] = "helpful"


class CrowdStatusResponse(BaseModel):
    zones: Dict[str, int]
    alerts: List[str]
    generated_at: float
