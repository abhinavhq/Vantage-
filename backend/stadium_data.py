"""
Mock stadium data layer.

`simulate_crowd_density` stands in for a real feed (turnstile counters,
camera-based crowd estimation, Wi-Fi occupancy, etc). It generates a
plausible, smoothly time-varying pattern so the ops dashboard and the
AI-generated alerts have something realistic to react to in a demo.
This is clearly a simulation, not live sensor data — see README.
"""
import math
import random
import time
from typing import Dict, List

ZONES = [
    "Main Gate (North)",
    "Gate B (East)",
    "Gate C (South)",
    "Gate D (West)",
    "Lower Bowl Concourse",
    "Upper Bowl Concourse",
    "Fan Zone / Plaza",
]

_START_TIME = time.time()

STADIUM_KNOWLEDGE_BASE = """
Stadium reference information:
- Main Gate (North): general admission, bag check, closest to the Metro/rail station.
- Gate B (East): step-free accessible entrance with ramp access and a wheelchair assistance desk.
- Gate C (South): fastest entry lane, closest to premium/accessible parking.
- Gate D (West): family entrance with stroller check and a nursing room nearby.
- Lower Bowl Concourse: sections 100-199, accessible seating on every aisle, sensory-friendly quiet room near section 112.
- Upper Bowl Concourse: sections 200-299, elevators at every third section for step-free access.
- Fan Zone / Plaza: food trucks, free water refill stations, recycling/compost bins, first aid tent.
- Multilingual volunteers wear an "Ask Vantage" badge and are stationed at every gate.
- Transit: rail station adjacent to Main Gate (North); free shuttle buses loop from remote parking every 10 minutes.
- Sustainability: reusable cup program at all concessions; refill stations near every gate; sorted recycling and compost bins throughout the concourses.
"""

SUSTAINABILITY_TIPS = [
    "Bring a reusable bottle — free refill stations are near every gate.",
    "Take the rail or a shuttle instead of driving — it cuts congestion and emissions.",
    "Sort your waste at the marked recycling and compost bins on the concourses.",
]


def simulate_crowd_density() -> Dict[str, int]:
    """Returns zone -> capacity percentage (0-100), smoothly varying over time."""
    elapsed_minutes = (time.time() - _START_TIME) / 60
    density: Dict[str, int] = {}
    for i, zone in enumerate(ZONES):
        phase = i * 0.9
        base = 45 + 35 * math.sin(elapsed_minutes / 6 + phase)
        noise = random.uniform(-6, 6)
        value = max(5, min(99, round(base + noise)))
        density[zone] = int(value)
    return density


def generate_ops_alerts(density: Dict[str, int]) -> List[str]:
    alerts: List[str] = []
    for zone, level in sorted(density.items(), key=lambda kv: -kv[1]):
        if level >= 85:
            alerts.append(f"{zone} is at {level}% capacity — consider redirecting flow.")
        elif level >= 70:
            alerts.append(f"{zone} is trending high ({level}%) — monitor closely.")
    return alerts
