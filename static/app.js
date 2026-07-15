(function () {
  "use strict";

  const el = {
    app: document.querySelector(".app"),
    modeFan: document.getElementById("mode-fan"),
    modeOps: document.getElementById("mode-ops"),
    contrastToggle: document.getElementById("contrast-toggle"),
    canvas: document.getElementById("avatar-canvas"),
    statusLine: document.getElementById("status-line"),
    alertTicker: document.getElementById("alert-ticker"),
    chips: document.getElementById("suggestion-chips"),
    chatLog: document.getElementById("chat-log"),
    form: document.getElementById("composer-form"),
    input: document.getElementById("composer-input"),
    micBtn: document.getElementById("mic-btn"),
  };

  const state = {
    mode: "fan",
    history: [], // [{role, content}] sent to the API
    sending: false,
    lastInputWasVoice: false,
    opsPollTimer: null,
    opsIntroShown: false,
  };

  const STATUS_TEXT = {
    fan: "Ask me anything, in any language.",
    ops: "Live zone capacity — simulated data, refreshes every 5s.",
  };

  function init() {
    window.VantageAvatar.init(el.canvas);
    appendMessage(
      "assistant",
      "Hi, I'm Vantage. Ask about gates, seats, getting here, or anything else — I'll answer in whatever language you write in.",
      "helpful",
      false
    );

    el.modeFan.addEventListener("click", () => switchMode("fan"));
    el.modeOps.addEventListener("click", () => switchMode("ops"));
    el.contrastToggle.addEventListener("click", toggleContrast);
    el.form.addEventListener("submit", onSubmit);
    el.chips.addEventListener("click", onChipClick);
    setupMic();
  }

  // ---------------------------------------------------------------
  // Mode switching
  // ---------------------------------------------------------------
  function switchMode(mode) {
    if (mode === state.mode) return;
    state.mode = mode;
    el.app.dataset.mode = mode;

    const isOps = mode === "ops";
    el.modeFan.classList.toggle("is-active", !isOps);
    el.modeFan.setAttribute("aria-checked", String(!isOps));
    el.modeOps.classList.toggle("is-active", isOps);
    el.modeOps.setAttribute("aria-checked", String(isOps));

    el.statusLine.textContent = STATUS_TEXT[mode];
    el.chips.hidden = isOps;
    window.VantageAvatar.setMode(mode);

    if (isOps) {
      if (!state.opsIntroShown) {
        state.opsIntroShown = true;
        appendMessage(
          "assistant",
          "Switched to Ops view. The rings above now show live zone capacity — ask me about any zone.",
          "helpful",
          false
        );
      }
      pollCrowdStatus();
      state.opsPollTimer = window.setInterval(pollCrowdStatus, 5000);
    } else {
      el.alertTicker.hidden = true;
      window.VantageAvatar.setMood("helpful");
      if (state.opsPollTimer) {
        window.clearInterval(state.opsPollTimer);
        state.opsPollTimer = null;
      }
    }
  }

  function toggleContrast() {
    const on = el.app.classList.toggle("high-contrast");
    el.contrastToggle.setAttribute("aria-pressed", String(on));
  }

  // ---------------------------------------------------------------
  // Ops polling
  // ---------------------------------------------------------------
  async function pollCrowdStatus() {
    try {
      const res = await fetch("/api/crowd-status");
      if (!res.ok) throw new Error("bad status");
      const data = await res.json();
      window.VantageAvatar.setZoneData(data.zones);

      const summary = Object.entries(data.zones)
        .map(([zone, pct]) => `${zone} ${pct}%`)
        .join(", ");
      el.canvas.setAttribute("aria-label", `Live zone capacity: ${summary}`);

      if (data.alerts && data.alerts.length) {
        el.alertTicker.hidden = false;
        el.alertTicker.textContent = data.alerts.join("   •   ");
        window.VantageAvatar.setMood("alert");
      } else {
        el.alertTicker.hidden = true;
        window.VantageAvatar.setMood("helpful");
      }
    } catch (err) {
      el.alertTicker.hidden = false;
      el.alertTicker.textContent = "Couldn't refresh live capacity — retrying shortly.";
    }
  }

  // ---------------------------------------------------------------
  // Chat
  // ---------------------------------------------------------------
  function onChipClick(e) {
    const btn = e.target.closest(".chip");
    if (!btn) return;
    el.input.value = btn.dataset.prompt || "";
    state.lastInputWasVoice = false;
    sendCurrentInput();
  }

  function onSubmit(e) {
    e.preventDefault();
    state.lastInputWasVoice = false;
    sendCurrentInput();
  }

  function sendCurrentInput() {
    const text = el.input.value.trim();
    if (!text || state.sending) return;
    el.input.value = "";
    sendMessage(text);
  }

  async function sendMessage(text) {
    appendMessage("user", text);
    state.history.push({ role: "user", content: text });
    state.sending = true;
    window.VantageAvatar.setMood("helpful");
    const typingEl = appendTyping();

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          mode: state.mode,
          history: state.history.slice(-6),
        }),
      });

      typingEl.remove();

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || "Request failed");
      }

      const data = await res.json();
      appendMessage("assistant", data.reply, data.mood);
      state.history.push({ role: "assistant", content: data.reply });
      window.VantageAvatar.setMood(data.mood);

      if (state.lastInputWasVoice) {
        speak(data.reply);
      }
    } catch (err) {
      typingEl.remove();
      appendMessage(
        "assistant",
        "I'm having trouble responding right now — please try again in a moment.",
        "warning"
      );
      window.VantageAvatar.setMood("warning");
    } finally {
      state.sending = false;
    }
  }

  function appendMessage(role, text, mood, scroll) {
    const bubble = document.createElement("div");
    bubble.className = `msg ${role}`;
    if (role === "assistant" && mood === "alert") {
      bubble.classList.add("mood-alert");
    }
    bubble.textContent = text;
    el.chatLog.appendChild(bubble);
    if (scroll !== false) {
      el.chatLog.scrollTop = el.chatLog.scrollHeight;
    }
    return bubble;
  }

  function appendTyping() {
    const bubble = document.createElement("div");
    bubble.className = "msg typing";
    bubble.textContent = "Vantage is typing…";
    el.chatLog.appendChild(bubble);
    el.chatLog.scrollTop = el.chatLog.scrollHeight;
    return bubble;
  }

  // ---------------------------------------------------------------
  // Voice input / output
  // ---------------------------------------------------------------
  function setupMic() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      el.micBtn.disabled = true;
      el.micBtn.title = "Voice input isn't supported in this browser";
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;

    let listening = false;

    el.micBtn.addEventListener("click", () => {
      if (listening) {
        recognition.stop();
        return;
      }
      try {
        recognition.start();
      } catch (err) {
        /* already started; ignore */
      }
    });

    recognition.addEventListener("start", () => {
      listening = true;
      el.micBtn.setAttribute("aria-pressed", "true");
      window.VantageAvatar.setListening(true);
    });

    recognition.addEventListener("end", () => {
      listening = false;
      el.micBtn.setAttribute("aria-pressed", "false");
      window.VantageAvatar.setListening(false);
    });

    recognition.addEventListener("result", (event) => {
      const transcript = event.results[0][0].transcript;
      state.lastInputWasVoice = true;
      sendMessage(transcript);
    });

    recognition.addEventListener("error", () => {
      listening = false;
      el.micBtn.setAttribute("aria-pressed", "false");
      window.VantageAvatar.setListening(false);
    });
  }

  function speak(text) {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.onstart = () => window.VantageAvatar.setSpeaking(true);
    utterance.onend = () => window.VantageAvatar.setSpeaking(false);
    utterance.onerror = () => window.VantageAvatar.setSpeaking(false);
    window.speechSynthesis.speak(utterance);
  }

  document.addEventListener("DOMContentLoaded", init);
})();
