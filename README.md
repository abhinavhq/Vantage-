# Vantage — GenAI Stadium Compantion


Built for **Hack2Skill · Challenge 4: Smart Stadiums & Tournament Operations** (FIFA World Cup 2026).

Vantage is one assistant with two faces. Switch modes and the same core —
same voice, same avatar, same underlying model — reorients itself around a
different job:

- **Fan mode** — a conversational companion for navigation, accessibility,
  transportation, and sustainability questions, in whatever language the
  fan writes or speaks in.
- **Ops mode** — a live capacity view for stadium staff, with GenAI turning
  (simulated) crowd data into plain-language alerts and recommendations,
  plus a chat interface for direct questions.

The same stadium-bowl ring visualization behind the avatar does double
duty: ambient decoration in Fan mode, literal per-zone capacity data in
Ops mode.

## Problem statement alignment

| Requirement | How Vantage addresses it |
|---|---|
| Navigation | Fan-mode Q&A grounded in a stadium reference (gates, sections, routes) |
| Crowd management | Ops-mode live zone rings + threshold-based alerts |
| Accessibility | Accessible-gate/route info, high-contrast toggle, voice in/out, ARIA labels + live regions |
| Transportation | Transit, shuttle, and parking guidance in the knowledge base |
| Sustainability | Refill stations, recycling/compost, transit-over-driving nudges |
| Multilingual assistance | The assistant always replies in the language it's asked in |
| Operational intelligence | GenAI-generated, human-readable ops recommendations from zone data |
| Real-time decision support | Ops dashboard polls live (simulated) capacity every 5 seconds |

## What's real vs. simulated

This is a hackathon prototype, and it's upfront about it:

- **Real**: the LLM integration, the chat logic, the UI, voice I/O, the
  alerting logic.
- **Simulated**: crowd density (`backend/stadium_data.py` generates a
  smoothly time-varying pattern standing in for turnstile/camera/Wi-Fi
  occupancy feeds) and the stadium layout (a small reference knowledge
  base, not a real venue's actual data). Swapping the simulator for a
  real feed only touches `simulate_crowd_density()` — everything
  downstream (alerts, chat grounding, the UI) already consumes it as
  plain data.

## Architecture

```
Browser (static/) ── fetch/JSON ──▶ FastAPI (backend/) ──▶ Cerebras Cloud API
     │                                    │
  canvas avatar                   in-memory rate limiter
  Web Speech API (STT/TTS)        mock crowd simulator
```

One process serves both the API and the static frontend, so the whole
thing deploys as a single web service — no separate frontend host, no
CORS setup required for the demo itself.

**Backend** (`backend/`)
- `main.py` — FastAPI app, routes, rate-limit middleware
- `cerebras_client.py` — plain-HTTP wrapper around Cerebras chat completions
- `stadium_data.py` — mock knowledge base + crowd simulator
- `security.py` — rate limiting + input sanitization
- `models.py` — Pydantic request/response schemas

**Frontend** (`static/`)
- `index.html` — semantic app shell (skip link, ARIA roles, live regions)
- `style.css` — design system: floodlight gold (fan) / control-room cyan
  (ops) / turf green + alert amber for capacity states
- `avatar.js` — canvas-drawn avatar and stadium-bowl ring visualization
- `app.js` — mode switching, chat, voice I/O, ops polling

## Tech stack

Python · FastAPI · Cerebras Cloud (`gpt-oss-120b`) · vanilla HTML/CSS/JS ·
Web Speech API. No frontend build step — deploys as-is.

## Run it locally

```bash
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env             # then add your CEREBRAS_API_KEY
uvicorn backend.main:app --reload
```

Open `http://localhost:8000`.

## Deploy

**Render (recommended, free tier):**
1. Push this repo to GitHub.
2. On Render: New → Blueprint → point at the repo (`render.yaml` is
   already set up).
3. Add your `CEREBRAS_API_KEY` in the service's environment settings.
4. Deploy — you'll get a public `https://*.onrender.com` URL for the
   submission's deployed link.

**Railway / Fly.io:** same idea — install `requirements.txt`, run
`uvicorn backend.main:app --host 0.0.0.0 --port $PORT`, set
`CEREBRAS_API_KEY` as an env var.

## Security notes

- The Cerebras API key never reaches the client — all calls are
  server-side.
- Basic per-IP rate limiting on `/api/*` (in-memory; swap for Redis
  behind a real deployment).
- User input is length-capped and stripped of control characters before
  it reaches the model.
- `.env` is git-ignored; only `.env.example` (no secrets) is committed.

## Roadmap

- Swap the crowd simulator for a real feed (turnstiles, camera-based
  counting, or Wi-Fi occupancy).
- Streaming responses (Cerebras is fast enough that this is a polish
  item, not a necessity — even non-streamed replies feel close to
  instant).
- Persist chat history per session instead of in-memory only.
- Real amplitude-driven lip-sync for the avatar via the Web Audio API,
  closer to the original Kage RMS-based approach
  
