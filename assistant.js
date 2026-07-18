(() => {
  "use strict";

  const CHAT_KEY = "inspectora_assistant_chat_v1";
  const CODE_KEY = "inspectora_assistant_code_v1";

  const $ = (s, r = document) => r.querySelector(s);
  const esc = (v) =>
    String(v ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");

  const refs = {
    gate: $("#assistantGate"),
    gateForm: $("#assistantGateForm"),
    gateInput: $("#assistantGateInput"),
    gateButton: $("#assistantGateButton"),
    gateError: $("#assistantGateError"),
    messages: $("#assistantMessages"),
    emptyState: $("#assistantEmptyState"),
    form: $("#assistantForm"),
    input: $("#assistantInput"),
    sendButton: $("#assistantSendButton"),
    newChatButton: $("#assistantNewChatButton"),
    toast: $("#toast"),
  };

  let history = [];
  let accessCode = "";

  function toast(msg) {
    if (!refs.toast) return;
    refs.toast.textContent = msg;
    refs.toast.classList.add("show");
    clearTimeout(toast.t);
    toast.t = setTimeout(() => refs.toast.classList.remove("show"), 2600);
  }

  function loadHistory() {
    try {
      const stored = JSON.parse(localStorage.getItem(CHAT_KEY) || "[]");
      history = Array.isArray(stored)
        ? stored.filter(
            (m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string"
          )
        : [];
    } catch {
      history = [];
    }
  }

  function saveHistory() {
    try {
      localStorage.setItem(CHAT_KEY, JSON.stringify(history));
    } catch {}
  }

  function renderContent(role, content) {
    if (role === "assistant" && typeof marked !== "undefined" && typeof DOMPurify !== "undefined") {
      return DOMPurify.sanitize(marked.parse(content));
    }
    return esc(content);
  }

  function addCopyButton(bubble, text) {
    const actions = document.createElement("div");
    actions.className = "assistant-bubble-actions";
    const btn = document.createElement("button");
    btn.className = "copy-btn";
    btn.textContent = "Kopieren";
    btn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(text);
        btn.textContent = "✓ Kopiert";
        setTimeout(() => { btn.textContent = "Kopieren"; }, 1500);
      } catch {
        try {
          const ta = document.createElement("textarea");
          ta.value = text;
          ta.style.cssText = "position:fixed;opacity:0;pointer-events:none";
          document.body.appendChild(ta);
          ta.select();
          document.execCommand("copy");
          document.body.removeChild(ta);
          btn.textContent = "✓ Kopiert";
          setTimeout(() => { btn.textContent = "Kopieren"; }, 1500);
        } catch {
          btn.textContent = "⚠ Nicht möglich";
          setTimeout(() => { btn.textContent = "Kopieren"; }, 2000);
        }
      }
    });
    actions.appendChild(btn);
    bubble.appendChild(actions);
  }

  function renderMessages() {
    refs.emptyState.style.display = history.length ? "none" : "block";
    refs.messages.querySelectorAll(".assistant-bubble").forEach((el) => el.remove());
    history.forEach((m) => {
      const bubble = document.createElement("div");
      bubble.className = `assistant-bubble ${m.role === "user" ? "assistant-bubble-user" : "assistant-bubble-assistant"}`;
      bubble.innerHTML = renderContent(m.role, m.content);
      if (m.role === "assistant") addCopyButton(bubble, m.content);
      refs.messages.appendChild(bubble);
    });
    refs.messages.scrollTop = refs.messages.scrollHeight;
  }

  function setTyping(active) {
    let indicator = $("#assistantTyping");
    if (active) {
      if (!indicator) {
        indicator = document.createElement("div");
        indicator.id = "assistantTyping";
        indicator.className = "assistant-bubble assistant-bubble-assistant assistant-typing";
        indicator.innerHTML = "<span></span><span></span><span></span>";
        refs.messages.appendChild(indicator);
      }
      refs.messages.scrollTop = refs.messages.scrollHeight;
    } else if (indicator) {
      indicator.remove();
    }
  }

  function setLoading(loading) {
    refs.input.disabled = loading;
    refs.sendButton.disabled = loading;
    refs.sendButton.classList.toggle("loading", loading);
    setTyping(loading);
  }

  async function callAssistant(messages, codeOverride) {
    const response = await fetch("/.netlify/functions/assistant-chat", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-access-code": codeOverride ?? accessCode },
      body: JSON.stringify({ messages }),
    });
    let data = null;
    try {
      data = await response.json();
    } catch {}
    return { ok: response.ok, status: response.status, data };
  }

  function showGate(errorMsg) {
    refs.gate.classList.add("show");
    refs.gateError.textContent = errorMsg || "";
    refs.gateInput.value = "";
    refs.gateInput.focus();
  }

  function hideGate() {
    refs.gate.classList.remove("show");
  }

  async function unlock(code) {
    refs.gateButton.disabled = true;
    refs.gateError.textContent = "";
    try {
      const { ok, status, data } = await callAssistant([], code);
      if (ok) {
        accessCode = code;
        try {
          localStorage.setItem(CODE_KEY, code);
        } catch {}
        hideGate();
        renderMessages();
        refs.input.focus();
      } else if (status === 401) {
        refs.gateError.textContent = data?.error || "Zugangscode ist falsch.";
      } else {
        refs.gateError.textContent = data?.error || "Prüfung fehlgeschlagen. Bitte erneut versuchen.";
      }
    } catch {
      refs.gateError.textContent = "Verbindung fehlgeschlagen. Bitte Internetverbindung prüfen.";
    } finally {
      refs.gateButton.disabled = false;
    }
  }

  async function sendMessage(text) {
    history.push({ role: "user", content: text });
    renderMessages();
    saveHistory();
    setLoading(true);

    let bubble = null;
    let fullText = "";

    function ensureBubble() {
      if (bubble) return;
      setTyping(false);
      bubble = document.createElement("div");
      bubble.className = "assistant-bubble assistant-bubble-assistant";
      refs.messages.appendChild(bubble);
    }

    function finishOk() {
      bubble.innerHTML = renderContent("assistant", fullText);
      addCopyButton(bubble, fullText);
      history.push({ role: "assistant", content: fullText });
      saveHistory();
      bubble.classList.add("assistant-bubble--settle");
      bubble.addEventListener("animationend", () => bubble?.classList.remove("assistant-bubble--settle"), { once: true });
      setLoading(false);
      refs.input.focus();
    }

    function finishErr(msg) {
      if (bubble) bubble.remove();
      toast(msg);
      setLoading(false);
      refs.input.focus();
    }

    try {
      const response = await fetch("/.netlify/functions/assistant-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-access-code": accessCode },
        body: JSON.stringify({ messages: history }),
      });

      if (!response.ok) {
        let data = null;
        try { data = await response.json(); } catch {}
        if (response.status === 401) {
          accessCode = "";
          try { localStorage.removeItem(CODE_KEY); } catch {}
          showGate(data?.error || "Zugangscode ist ungültig geworden. Bitte erneut freischalten.");
          setLoading(false);
          refs.input.focus();
        } else {
          finishErr(data?.error || "Antwort fehlgeschlagen – bitte erneut senden.");
        }
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let terminated = false;

      outer: while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6).trim();
          if (!raw) continue;
          try {
            const evt = JSON.parse(raw);
            if (evt.type === "delta" && evt.text) {
              ensureBubble();
              fullText += evt.text;
              bubble.textContent += evt.text;
              refs.messages.scrollTop = refs.messages.scrollHeight;
            } else if (evt.type === "done") {
              terminated = true;
              finishOk();
              break outer;
            } else if (evt.type === "error") {
              terminated = true;
              finishErr(evt.message || "Antwort fehlgeschlagen – bitte erneut senden.");
              break outer;
            }
          } catch {}
        }
      }

      if (!terminated) {
        if (fullText) {
          finishOk();
        } else {
          finishErr("Verbindung unterbrochen – bitte erneut senden.");
        }
      }
    } catch {
      finishErr("Antwort fehlgeschlagen – bitte Internetverbindung prüfen und erneut senden.");
    }
  }

  function resizeInput() {
    refs.input.style.height = "auto";
    refs.input.style.height = `${Math.min(refs.input.scrollHeight, 160)}px`;
  }

  function bind() {
    refs.gateForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const code = refs.gateInput.value.trim();
      if (!code) return;
      unlock(code);
    });

    refs.form.addEventListener("submit", (e) => {
      e.preventDefault();
      const text = refs.input.value.trim();
      if (!text || refs.input.disabled) return;
      refs.input.value = "";
      resizeInput();
      sendMessage(text);
    });

    refs.input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        refs.form.requestSubmit();
      }
    });
    refs.input.addEventListener("input", resizeInput);

    refs.newChatButton.addEventListener("click", () => {
      if (history.length && !window.confirm("Aktuellen Chatverlauf löschen?")) return;
      history = [];
      saveHistory();
      renderMessages();
    });
  }

  function init() {
    bind();
    loadHistory();
    renderMessages();

    let storedCode = "";
    try {
      storedCode = localStorage.getItem(CODE_KEY) || "";
    } catch {}

    if (!storedCode) {
      showGate();
      return;
    }

    accessCode = storedCode;
    callAssistant([]).then(({ ok, status }) => {
      if (ok) {
        hideGate();
        refs.input.focus();
      } else {
        accessCode = "";
        try {
          localStorage.removeItem(CODE_KEY);
        } catch {}
        showGate(status === 401 ? "Zugangscode ist ungültig geworden. Bitte erneut eingeben." : "");
      }
    }).catch(() => {
      // Netzwerkfehler beim Start: Gate zeigen, damit ein Retry über den Freischalt-Button möglich ist.
      accessCode = "";
      showGate("Verbindung fehlgeschlagen. Bitte Zugangscode erneut eingeben.");
    });
  }

  init();
})();
