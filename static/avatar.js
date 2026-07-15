/**
 * Vantage avatar — a procedural, canvas-drawn presence rather than a
 * static icon. Loosely modelled on the Kage avatar pattern (mood-driven
 * expression, breathing idle state, amplitude-style pulse while
 * "speaking") reinterpreted for the browser.
 *
 * The same concentric-ring motif does two jobs:
 *  - Fan mode: ambient decoration around the avatar (a stadium bowl).
 *  - Ops mode: literal data rings, one arc segment per zone, coloured
 *    and thickened by live capacity.
 *
 * Note on "lip-sync": the Web Speech API does not expose raw audio for
 * amplitude analysis, so speaking uses a synthetic multi-sine pulse as
 * a stand-in for real RMS-driven lip-sync.
 */
(function () {
  "use strict";

  const COLORS = {
    floodlight: "#f5c94b",
    turf: "#46c57f",
    console: "#6fe3ff",
    alert: "#ff6b4a",
    ink: "#edeff4",
  };

  const SIZE = 360;
  const CENTER = SIZE / 2;

  let canvas, ctx;
  let mode = "fan";
  let mood = "idle";
  let speaking = false;
  let listening = false;
  let zones = null; // { zoneName: pct } when in ops mode
  let reducedMotion = false;
  let rafId = null;
  let t = 0;

  function accentFor(currentMode) {
    return currentMode === "ops" ? COLORS.console : COLORS.floodlight;
  }

  function moodColor() {
    if (mood === "alert") return COLORS.alert;
    if (mood === "warning") return COLORS.floodlight;
    return accentFor(mode);
  }

  function capacityColor(pct) {
    if (pct >= 90) return COLORS.alert;
    if (pct >= 75) return COLORS.floodlight;
    if (pct >= 50) return COLORS.console;
    return COLORS.turf;
  }

  function hexToRgba(hex, alpha) {
    const n = parseInt(hex.slice(1), 16);
    const r = (n >> 16) & 255,
      g = (n >> 8) & 255,
      b = n & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  function clearFrame() {
    ctx.clearRect(0, 0, SIZE, SIZE);
  }

  function drawAmbientRings(time) {
    const radii = [168, 140, 112];
    const speeds = [0.06, -0.09, 0.13];
    const accent = moodColor();
    radii.forEach((r, i) => {
      const rotation = reducedMotion ? 0 : time * speeds[i];
      const gapStart = rotation;
      const arcLength = Math.PI * 1.5; // 270-degree bowl, open at the "entrance"
      ctx.beginPath();
      ctx.arc(CENTER, CENTER, r, gapStart, gapStart + arcLength);
      ctx.strokeStyle = hexToRgba(accent, 0.16 + i * 0.04);
      ctx.lineWidth = 2.5;
      ctx.lineCap = "round";
      ctx.stroke();
    });
  }

  function drawZoneRings() {
    if (!zones) return;
    const entries = Object.entries(zones);
    const count = entries.length || 1;
    const radius = 150;
    const gap = 0.09; // radians between segments
    const segment = (Math.PI * 2) / count - gap;

    entries.forEach(([name, pct], i) => {
      const start = i * ((Math.PI * 2) / count) - Math.PI / 2;
      const end = start + segment;
      const color = capacityColor(pct);
      const thickness = 5 + (pct / 100) * 18;

      ctx.beginPath();
      ctx.arc(CENTER, CENTER, radius, start, end);
      ctx.strokeStyle = hexToRgba(color, 0.85);
      ctx.lineWidth = thickness;
      ctx.lineCap = "round";
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(CENTER, CENTER, radius, start, end);
      ctx.strokeStyle = hexToRgba(color, 0.22);
      ctx.lineWidth = thickness + 10;
      ctx.lineCap = "round";
      ctx.stroke();
    });
  }

  function coreRadius(time) {
    const base = mode === "ops" ? 34 : 46;
    if (speaking) {
      const pulse =
        Math.sin(time * 9) * 6 + Math.sin(time * 15 + 1.3) * 3 + Math.sin(time * 4.2) * 2;
      return base + pulse;
    }
    if (!reducedMotion) {
      return base + Math.sin(time * 1.6) * 3; // idle breathing
    }
    return base;
  }

  function drawListeningRipple(time) {
    if (!listening) return;
    const progress = reducedMotion ? 0.5 : (time * 0.9) % 1;
    const r = 55 + progress * 90;
    const alpha = 0.5 * (1 - progress);
    ctx.beginPath();
    ctx.arc(CENTER, CENTER, r, 0, Math.PI * 2);
    ctx.strokeStyle = hexToRgba(moodColor(), alpha);
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  function drawCore(time) {
    const r = coreRadius(time);
    const accent = moodColor();

    const glow = ctx.createRadialGradient(CENTER, CENTER, 0, CENTER, CENTER, r * 2.1);
    glow.addColorStop(0, hexToRgba(accent, 0.9));
    glow.addColorStop(0.55, hexToRgba(accent, 0.28));
    glow.addColorStop(1, hexToRgba(accent, 0));
    ctx.beginPath();
    ctx.arc(CENTER, CENTER, r * 2.1, 0, Math.PI * 2);
    ctx.fillStyle = glow;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(CENTER, CENTER, r, 0, Math.PI * 2);
    ctx.fillStyle = hexToRgba(COLORS.ink, 0.95);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(CENTER, CENTER, r, 0, Math.PI * 2);
    ctx.strokeStyle = hexToRgba(accent, 0.9);
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  function frame() {
    t += 0.02;
    clearFrame();

    if (mode === "ops" && zones) {
      drawZoneRings();
    } else {
      drawAmbientRings(t);
    }

    drawListeningRipple(t);
    drawCore(t);

    if (!reducedMotion || speaking || listening) {
      rafId = requestAnimationFrame(frame);
    } else {
      rafId = null;
    }
  }

  function kick() {
    if (rafId === null) {
      rafId = requestAnimationFrame(frame);
    }
  }

  const Avatar = {
    init(canvasEl) {
      canvas = canvasEl;
      ctx = canvas.getContext("2d");
      reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      const dpr = window.devicePixelRatio || 1;
      canvas.width = SIZE * dpr;
      canvas.height = SIZE * dpr;
      ctx.scale(dpr, dpr);

      frame();
    },
    setMode(nextMode) {
      mode = nextMode;
      if (mode !== "ops") zones = null;
      kick();
    },
    setMood(nextMood) {
      mood = nextMood || "idle";
      kick();
    },
    setSpeaking(isSpeaking) {
      speaking = !!isSpeaking;
      kick();
    },
    setListening(isListening) {
      listening = !!isListening;
      kick();
    },
    setZoneData(nextZones) {
      zones = nextZones;
      kick();
    },
  };

  window.VantageAvatar = Avatar;
})();
