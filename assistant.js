(() => {
  "use strict";

  const CHAT_KEY = "inspectora_assistant_chat_v1";
  const CODE_KEY = "inspectora_assistant_code_v1";

  // File upload limits
  const PDF_MAX_BYTES = 10 * 1024 * 1024;        // 10 MB raw
  const IMAGE_MAX_BYTES_AFTER = 3.5 * 1024 * 1024; // 3.5 MB after compression
  const IMAGE_MAX_DIM = 2000;
  const IMAGE_INITIAL_QUALITY = 0.85;
  const IMAGE_MIN_QUALITY = 0.30;
  const MAX_ATTACHMENTS = 5;

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
    attachButton: $("#assistantAttachButton"),
    fileInput: $("#assistantFileInput"),
    chips: $("#assistantChips"),
    toast: $("#toast"),
  };

  let history = [];
  let accessCode = "";
  // pendingFiles: Array<{ name, mediaType, base64, isImage }>
  let pendingFiles = [];

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
    refs.attachButton.disabled = loading;
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

  // --- File handling ---

  function readAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function estimatePdfPages(arrayBuffer) {
    try {
      const text = new TextDecoder("latin1").decode(new Uint8Array(arrayBuffer));
      const matches = text.match(/\/Count\s+(\d+)/g);
      if (!matches) return null;
      const counts = matches.map((m) => parseInt(m.replace(/\/Count\s+/, ""), 10)).filter((n) => !isNaN(n));
      return counts.length ? Math.max(...counts) : null;
    } catch {
      return null;
    }
  }

  async function compressImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        let { width, height } = img;
        if (width > IMAGE_MAX_DIM || height > IMAGE_MAX_DIM) {
          const ratio = Math.min(IMAGE_MAX_DIM / width, IMAGE_MAX_DIM / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);

        let quality = IMAGE_INITIAL_QUALITY;
        let dataUrl;
        do {
          dataUrl = canvas.toDataURL("image/jpeg", quality);
          const bytes = Math.round((dataUrl.length - dataUrl.indexOf(",") - 1) * 0.75);
          if (bytes <= IMAGE_MAX_BYTES_AFTER || quality <= IMAGE_MIN_QUALITY) break;
          quality = Math.max(IMAGE_MIN_QUALITY, quality - 0.10);
        } while (true);

        resolve(dataUrl);
      };
      img.onerror = reject;
      img.src = url;
    });
  }

  async function processFile(file) {
    const name = file.name;
    const isPdf = file.type === "application/pdf" || name.toLowerCase().endsWith(".pdf");
    const isImage = file.type.startsWith("image/");

    if (!isPdf && !isImage) {
      toast(`${name}: Nur PDF und Bilddateien (JPEG, PNG, GIF, WebP) werden unterstützt.`);
      return null;
    }

    if (isPdf) {
      if (file.size > PDF_MAX_BYTES) {
        toast(`${name}: PDF ist zu groß (max. 10 MB).`);
        return null;
      }
      const arrayBuffer = await file.arrayBuffer();
      const pages = estimatePdfPages(arrayBuffer);
      if (pages !== null && pages > 100) {
        toast(`${name}: Das PDF hat schätzungsweise ${pages} Seiten (Limit: 100). Bitte ein kürzeres Dokument verwenden.`);
        return null;
      }
      const dataUrl = await readAsDataURL(file);
      const base64 = dataUrl.split(",")[1];
      return { name, mediaType: "application/pdf", base64, isImage: false };
    }

    if (isImage) {
      let dataUrl;
      try {
        dataUrl = await compressImage(file);
      } catch {
        toast(`${name}: Bild konnte nicht verarbeitet werden.`);
        return null;
      }
      const base64 = dataUrl.split(",")[1];
      const bytes = Math.round(base64.length * 0.75);
      if (bytes > IMAGE_MAX_BYTES_AFTER) {
        toast(`${name}: Bild ist auch nach Komprimierung zu groß.`);
        return null;
      }
      return { name, mediaType: "image/jpeg", base64, isImage: true };
    }

    return null;
  }

  function renderChips() {
    refs.chips.innerHTML = "";
    pendingFiles.forEach((f, i) => {
      const chip = document.createElement("div");
      chip.className = "file-chip";
      const nameEl = document.createElement("span");
      nameEl.className = "file-chip-name";
      nameEl.textContent = f.name;
      nameEl.title = f.name;
      const removeBtn = document.createElement("button");
      removeBtn.className = "file-chip-remove";
      removeBtn.type = "button";
      removeBtn.textContent = "×";
      removeBtn.setAttribute("aria-label", `${f.name} entfernen`);
      removeBtn.addEventListener("click", () => {
        pendingFiles.splice(i, 1);
        renderChips();
      });
      chip.appendChild(nameEl);
      chip.appendChild(removeBtn);
      refs.chips.appendChild(chip);
    });
  }

  async function handleFiles(fileList) {
    const remaining = MAX_ATTACHMENTS - pendingFiles.length;
    if (remaining <= 0) {
      toast(`Maximal ${MAX_ATTACHMENTS} Dateien pro Nachricht.`);
      return;
    }
    const toProcess = Array.from(fileList).slice(0, remaining);
    if (fileList.length > remaining) {
      toast(`Es werden nur die ersten ${remaining} Dateien hinzugefügt (Limit: ${MAX_ATTACHMENTS}).`);
    }
    for (const file of toProcess) {
      const result = await processFile(file);
      if (result) pendingFiles.push(result);
    }
    renderChips();
  }

  // --- Send ---

  function buildUserContent(text, files) {
    if (!files.length) return text;
    const parts = [];
    for (const f of files) {
      if (f.isImage) {
        parts.push({
          type: "image",
          source: { type: "base64", media_type: f.mediaType, data: f.base64 },
        });
      } else {
        parts.push({
          type: "document",
          source: { type: "base64", media_type: f.mediaType, data: f.base64 },
        });
      }
    }
    parts.push({ type: "text", text });
    return parts;
  }

  function userContentToText(text, files) {
    if (!files.length) return text;
    const fileNames = files.map((f) => `[Datei: ${f.name}]`).join(" ");
    return `${fileNames}\n${text}`;
  }

  async function sendMessage(text) {
    const attachments = pendingFiles.slice();
    pendingFiles = [];
    renderChips();

    const userContent = buildUserContent(text, attachments);
    const userContentText = userContentToText(text, attachments);

    history.push({ role: "user", content: userContentText });
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
      const messagesPayload = [
        ...history.slice(0, -1).map((m) => ({ role: m.role, content: m.content })),
        { role: "user", content: userContent },
      ];

      const response = await fetch("/.netlify/functions/assistant-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-access-code": accessCode },
        body: JSON.stringify({ messages: messagesPayload }),
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
        } else if (response.status === 413 || response.status === 414) {
          finishErr("Die Datei ist zu groß für den Upload. Bitte eine kleinere Datei verwenden.");
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
              const errMsg = evt.message || "Antwort fehlgeschlagen – bitte erneut senden.";
              if (errMsg.includes("page") || errMsg.includes("seiten") || errMsg.toLowerCase().includes("too many")) {
                finishErr("Das PDF hat zu viele Seiten. Bitte ein kürzeres Dokument verwenden (max. 100 Seiten).");
              } else {
                finishErr(errMsg);
              }
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
    } catch (err) {
      if (err && (err.name === "PayloadTooLargeError" || (err.message && err.message.includes("413")))) {
        finishErr("Die Datei ist zu groß für den Upload. Bitte eine kleinere Datei verwenden.");
      } else {
        finishErr("Antwort fehlgeschlagen – bitte Internetverbindung prüfen und erneut senden.");
      }
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

    refs.attachButton.addEventListener("click", () => {
      refs.fileInput.value = "";
      refs.fileInput.click();
    });

    refs.fileInput.addEventListener("change", () => {
      if (refs.fileInput.files.length) handleFiles(refs.fileInput.files);
    });

    refs.newChatButton.addEventListener("click", () => {
      if (history.length && !window.confirm("Aktuellen Chatverlauf löschen?")) return;
      history = [];
      saveHistory();
      renderMessages();
      pendingFiles = [];
      renderChips();
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
      accessCode = "";
      showGate("Verbindung fehlgeschlagen. Bitte Zugangscode erneut eingeben.");
    });
  }

  init();
})();
