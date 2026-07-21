(() => {
  "use strict";

  // Storage keys
  const CHATS_KEY    = "inspectora_chats_v1";
  const ACTIVE_KEY   = "inspectora_active_chat_v1";
  const OLD_CHAT_KEY = "inspectora_assistant_chat_v1"; // legacy – kept as backup, never deleted here
  const CODE_KEY     = "inspectora_assistant_code_v1";
  const FB_HINT_KEY  = "inspectora_feedback_hint_v1"; // once-shown transparency note

  // File upload limits
  const PDF_MAX_BYTES          = 10 * 1024 * 1024;
  const IMAGE_MAX_BYTES_AFTER  = 3.5 * 1024 * 1024;
  const IMAGE_MAX_DIM          = 2000;
  const IMAGE_INITIAL_QUALITY  = 0.85;
  const IMAGE_MIN_QUALITY      = 0.30;
  const MAX_ATTACHMENTS        = 5;

  const $ = (s, r = document) => r.querySelector(s);
  const esc = (v) =>
    String(v ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");

  const refs = {
    gate:          $("#assistantGate"),
    gateForm:      $("#assistantGateForm"),
    gateInput:     $("#assistantGateInput"),
    gateButton:    $("#assistantGateButton"),
    gateError:     $("#assistantGateError"),
    messages:      $("#assistantMessages"),
    emptyState:    $("#assistantEmptyState"),
    form:          $("#assistantForm"),
    input:         $("#assistantInput"),
    sendButton:    $("#assistantSendButton"),
    newChatButton: $("#assistantNewChatButton"),
    attachButton:  $("#assistantAttachButton"),
    fileInput:     $("#assistantFileInput"),
    chips:         $("#assistantChips"),
    toast:         $("#toast"),
    sidebar:       $("#assistantSidebar"),
    convList:      $("#assistantConvList"),
    search:        $("#assistantSearch"),
    backdrop:      $("#sidebarBackdrop"),
    sidebarToggle: $("#sidebarToggleBtn"),
  };

  // ── State ──────────────────────────────────────────────────────────────────
  let chats       = [];   // { id, title, messages[], createdAt, updatedAt }
  let activeId    = null;
  let isStreaming = false;
  let accessCode  = "";
  let pendingFiles = [];

  // ── Utilities ──────────────────────────────────────────────────────────────
  function genId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function getActiveChat() {
    return chats.find((c) => c.id === activeId) || null;
  }

  function formatDate(ts) {
    const d   = new Date(ts);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) {
      return d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
    }
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return "Gestern";
    return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "2-digit" });
  }

  function autoTitle(text) {
    return text.replace(/\s+/g, " ").trim().slice(0, 42) || "Gespräch";
  }

  // ── Toast ──────────────────────────────────────────────────────────────────
  function toast(msg, duration = 3500) {
    if (!refs.toast) return;
    refs.toast.textContent = msg;
    refs.toast.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => refs.toast.classList.remove("show"), duration);
  }

  // ── Storage ────────────────────────────────────────────────────────────────
  function isValidMessage(m) {
    return (
      m && typeof m === "object" &&
      (m.role === "user" || m.role === "assistant") &&
      typeof m.content === "string"
    );
  }

  function isValidChat(c) {
    return (
      c && typeof c === "object" &&
      typeof c.id === "string" &&
      typeof c.title === "string" &&
      Array.isArray(c.messages) &&
      typeof c.createdAt === "number" &&
      typeof c.updatedAt === "number"
    );
  }

  function saveChats() {
    try {
      localStorage.setItem(CHATS_KEY, JSON.stringify(chats));
      localStorage.setItem(ACTIVE_KEY, activeId || "");
    } catch (e) {
      if (e && (e.name === "QuotaExceededError" || e.code === 22 || e.name === "NS_ERROR_DOM_QUOTA_REACHED")) {
        toast("Speicher voll – bitte alte Gespräche löschen, damit neue Nachrichten gespeichert werden können.", 5000);
      }
    }
  }

  function loadChats() {
    // 1. Try new multi-chat format
    try {
      const raw = localStorage.getItem(CHATS_KEY);
      if (raw) {
        const stored = JSON.parse(raw);
        if (Array.isArray(stored) && stored.length > 0) {
          const valid = stored.filter(isValidChat).map((c) => ({
            ...c,
            messages: c.messages.filter(isValidMessage),
          }));
          if (valid.length > 0) {
            chats = valid;
            const storedActive = localStorage.getItem(ACTIVE_KEY) || "";
            activeId = chats.find((c) => c.id === storedActive) ? storedActive : chats[0].id;
            return;
          }
        }
      }
    } catch {}

    // 2. Migration from old single-chat format
    try {
      const oldRaw = localStorage.getItem(OLD_CHAT_KEY);
      if (oldRaw) {
        const oldData = JSON.parse(oldRaw);
        if (Array.isArray(oldData) && oldData.length > 0) {
          const messages = oldData.filter(isValidMessage);
          if (messages.length > 0) {
            const firstUser = messages.find((m) => m.role === "user");
            const title = firstUser
              ? autoTitle(firstUser.content)
              : "Mein erster Chat";
            const now  = Date.now();
            const chat = { id: genId(), title, messages, createdAt: now, updatedAt: now };
            chats    = [chat];
            activeId = chat.id;

            // Write new format first; only remove old key after verified success
            try {
              localStorage.setItem(CHATS_KEY, JSON.stringify(chats));
              localStorage.setItem(ACTIVE_KEY, activeId);
              // New format confirmed saved – old key is now redundant
              try { localStorage.removeItem(OLD_CHAT_KEY); } catch {}
            } catch (e) {
              if (e && (e.name === "QuotaExceededError" || e.code === 22)) {
                toast(
                  "Migration fehlgeschlagen: Speicher voll. Dein alter Verlauf bleibt erhalten.",
                  6000
                );
                // Keep data in memory only; old key preserved as backup
              }
            }
            return;
          }
        }
      }
    } catch {}

    // 3. Fresh start
    chats    = [];
    activeId = null;
  }

  // ── Chat management ────────────────────────────────────────────────────────
  function createChat() {
    const now  = Date.now();
    const chat = { id: genId(), title: "Neues Gespräch", messages: [], createdAt: now, updatedAt: now };
    chats.unshift(chat);
    activeId = chat.id;
    saveChats();
    renderSidebar();
    renderMessages();
    closeSidebar();
    refs.input.focus();
    return chat;
  }

  function switchChat(id) {
    if (isStreaming) {
      toast("Bitte warten – die Antwort wird noch geladen.");
      return;
    }
    if (id === activeId) { closeSidebar(); return; }
    activeId = id;
    saveChats();
    renderSidebar();
    renderMessages();
    closeSidebar();
    refs.input.focus();
  }

  function deleteChat(id) {
    const chat  = chats.find((c) => c.id === id);
    const label = chat?.title || "Gespräch";
    if (!window.confirm(`„${label}" löschen?`)) return;
    const idx = chats.findIndex((c) => c.id === id);
    if (idx === -1) return;
    chats.splice(idx, 1);
    if (activeId === id) activeId = chats[0]?.id || null;
    saveChats();
    renderSidebar();
    renderMessages();
  }

  function renameChat(id, newTitle) {
    const chat = chats.find((c) => c.id === id);
    if (!chat) return;
    const t = newTitle.trim();
    if (t) chat.title = t;
    saveChats();
    renderSidebar();
  }

  // ── Sidebar ────────────────────────────────────────────────────────────────
  function openSidebar() {
    refs.sidebar.classList.add("open");
    refs.backdrop.classList.add("show");
    refs.sidebarToggle?.setAttribute("aria-expanded", "true");
  }
  function closeSidebar() {
    refs.sidebar.classList.remove("open");
    refs.backdrop.classList.remove("show");
    refs.sidebarToggle?.setAttribute("aria-expanded", "false");
  }

  function getSnippet(chat, query) {
    const q = query.toLowerCase();
    for (const m of chat.messages) {
      const content = typeof m.content === "string" ? m.content : "";
      const idx     = content.toLowerCase().indexOf(q);
      if (idx !== -1) {
        const start  = Math.max(0, idx - 28);
        const end    = Math.min(content.length, idx + q.length + 52);
        const before = esc(content.slice(start, idx));
        const match  = esc(content.slice(idx, idx + q.length));
        const after  = esc(content.slice(idx + q.length, end));
        return (start > 0 ? "…" : "") + before + `<mark>${match}</mark>` + after + (end < content.length ? "…" : "");
      }
    }
    return "";
  }

  function startRename(item, titleEl, id, currentTitle) {
    const input = document.createElement("input");
    input.type      = "text";
    input.className = "conv-item-rename";
    input.value     = currentTitle;
    titleEl.replaceWith(input);
    input.focus();
    input.select();
    let committed = false;
    function commit() {
      if (committed) return;
      committed = true;
      renameChat(id, input.value || currentTitle);
    }
    input.addEventListener("blur", commit);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter")  { e.preventDefault(); input.blur(); }
      if (e.key === "Escape") { input.value = currentTitle; input.blur(); }
    });
  }

  function makeConvItem(chat, query) {
    const isActive    = chat.id === activeId;
    const blockedItem = isStreaming && !isActive;

    const item = document.createElement("div");
    item.className = "conv-item" +
      (isActive    ? " conv-item--active"    : "") +
      (blockedItem ? " conv-item--streaming" : "");
    item.setAttribute("role", "listitem");

    // Body
    const body    = document.createElement("div");
    body.className = "conv-item-body";

    const titleEl      = document.createElement("div");
    titleEl.className  = "conv-item-title";
    titleEl.textContent = chat.title;
    body.appendChild(titleEl);

    const dateEl      = document.createElement("div");
    dateEl.className  = "conv-item-date";
    dateEl.textContent = formatDate(chat.updatedAt);
    body.appendChild(dateEl);

    if (query) {
      const snippet = getSnippet(chat, query);
      if (snippet) {
        const snippetEl      = document.createElement("div");
        snippetEl.className  = "conv-item-snippet";
        snippetEl.innerHTML  = snippet; // built with esc(), safe
        body.appendChild(snippetEl);
      }
    }

    item.appendChild(body);

    // Action buttons
    const actions      = document.createElement("div");
    actions.className  = "conv-item-actions";

    const renameBtn = document.createElement("button");
    renameBtn.className = "conv-action-btn rename";
    renameBtn.type      = "button";
    renameBtn.title     = "Umbenennen";
    renameBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
    renameBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      startRename(item, titleEl, chat.id, chat.title);
    });

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "conv-action-btn delete";
    deleteBtn.type      = "button";
    deleteBtn.title     = "Löschen";
    deleteBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>`;
    deleteBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      deleteChat(chat.id);
    });

    actions.appendChild(renameBtn);
    actions.appendChild(deleteBtn);
    item.appendChild(actions);

    if (!blockedItem) {
      item.addEventListener("click", () => switchChat(chat.id));
    }

    return item;
  }

  function renderSidebar() {
    if (!refs.convList) return;
    const query = (refs.search?.value || "").trim().toLowerCase();

    let filtered = chats;
    if (query) {
      filtered = chats.filter((c) => {
        if (c.title.toLowerCase().includes(query)) return true;
        return c.messages.some(
          (m) => typeof m.content === "string" && m.content.toLowerCase().includes(query)
        );
      });
    }

    refs.convList.innerHTML = "";

    if (filtered.length === 0) {
      const empty      = document.createElement("div");
      empty.className  = "sidebar-empty";
      empty.textContent = query ? "Keine Treffer." : "Noch keine Gespräche.";
      refs.convList.appendChild(empty);
      return;
    }

    for (const chat of filtered) {
      refs.convList.appendChild(makeConvItem(chat, query));
    }
  }

  // ── Rendering ──────────────────────────────────────────────────────────────
  function renderContent(role, content) {
    if (role === "assistant" && typeof marked !== "undefined" && typeof DOMPurify !== "undefined") {
      return DOMPurify.sanitize(marked.parse(content));
    }
    return esc(content);
  }

  // ── Feedback ─────────────────────────────────────────────────────────────
  const ICON_THUMB_UP =
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 10v11"/><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z"/></svg>`;
  const ICON_THUMB_DOWN =
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 14V3"/><path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z"/></svg>`;

  // Transparency note – shown once on the very first feedback interaction.
  // Returns true if the hint was shown (caller then skips the "Danke!" toast so
  // the hint isn't immediately overwritten in the shared toast element).
  function maybeShowFeedbackHint() {
    try {
      if (localStorage.getItem(FB_HINT_KEY)) return false;
      localStorage.setItem(FB_HINT_KEY, "1");
    } catch { return false; }
    toast("Rückmeldungen werden mit Frage und Antwort gespeichert, um den Assistenten zu verbessern.", 5500);
    return true;
  }

  // Fire-and-forget: a failed save must never disrupt the chat or the UI.
  // On a 5xx (e.g. a cold-start 503) or network error, retry exactly once after
  // ~1.5 s – feedback from someone returning after a pause is especially worth
  // keeping. Fully silent and non-blocking either way.
  function sendFeedback(msg, question, rating, comment) {
    const payload = {
      rating,
      question: question || "",
      answer: msg.content || "",
      comment: comment || "",
      kbUsed:        msg.meta?.kbUsed        ?? null,
      kbIds:         msg.meta?.kbIds         ?? [],
      webSearchUsed: msg.meta?.webSearchUsed ?? null,
    };
    const body = JSON.stringify(payload);

    async function attempt() {
      const res = await fetch("/.netlify/functions/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-access-code": accessCode },
        body,
        keepalive: true,
      });
      if (res.status >= 500) throw new Error("retryable"); // 5xx → retry
      return res;
    }

    (async () => {
      try {
        await attempt();
      } catch {
        await new Promise((r) => setTimeout(r, 1500));
        try { await attempt(); } catch { /* give up silently */ }
      }
    })();
  }

  function copyText(btn, text) {
    (async () => {
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
    })();
  }

  // Actions bar under an assistant bubble: copy + thumbs up/down (+ optional
  // comment field on thumbs-down). `msg` is the stored message object so the
  // chosen rating persists in localStorage and stays visibly set & changeable.
  function addBubbleActions(bubble, msg, question) {
    const actions = document.createElement("div");
    actions.className = "assistant-bubble-actions";

    const copyBtn = document.createElement("button");
    copyBtn.className = "copy-btn";
    copyBtn.type      = "button";
    copyBtn.textContent = "Kopieren";
    copyBtn.addEventListener("click", () => copyText(copyBtn, msg.content));
    actions.appendChild(copyBtn);

    const group = document.createElement("div");
    group.className = "feedback-group";

    const upBtn = document.createElement("button");
    upBtn.type      = "button";
    upBtn.className  = "feedback-btn feedback-up";
    upBtn.title      = "Hilfreich";
    upBtn.setAttribute("aria-label", "Daumen hoch – hilfreiche Antwort");
    upBtn.innerHTML  = ICON_THUMB_UP;

    const downBtn = document.createElement("button");
    downBtn.type     = "button";
    downBtn.className = "feedback-btn feedback-down";
    downBtn.title     = "Nicht hilfreich";
    downBtn.setAttribute("aria-label", "Daumen runter – nicht hilfreiche Antwort");
    downBtn.innerHTML = ICON_THUMB_DOWN;

    group.appendChild(upBtn);
    group.appendChild(downBtn);
    actions.appendChild(group);
    bubble.appendChild(actions);

    let commentWrap = null;

    function reflect() {
      const r = msg.feedback?.rating || null;
      upBtn.classList.toggle("is-active", r === "positiv");
      downBtn.classList.toggle("is-active", r === "negativ");
    }

    function pop(btn) {
      btn.classList.remove("feedback-btn--pop");
      // reflow to restart the animation on repeated clicks
      void btn.offsetWidth;
      btn.classList.add("feedback-btn--pop");
      btn.addEventListener("animationend", () => btn.classList.remove("feedback-btn--pop"), { once: true });
    }

    function showCommentBox() {
      if (commentWrap) { commentWrap.hidden = false; return; }
      commentWrap = document.createElement("div");
      commentWrap.className = "feedback-comment";

      const ta = document.createElement("textarea");
      ta.className   = "feedback-comment-input";
      ta.rows        = 2;
      ta.maxLength   = 2000;
      ta.placeholder = "Was war falsch? (optional)";
      if (msg.feedback?.comment) ta.value = msg.feedback.comment;

      const sendBtn = document.createElement("button");
      sendBtn.type      = "button";
      sendBtn.className  = "button secondary small feedback-comment-send";
      sendBtn.textContent = "Absenden";
      sendBtn.addEventListener("click", () => {
        const text = ta.value.trim();
        msg.feedback = { rating: "negativ", comment: text };
        saveChats();
        sendFeedback(msg, question, "negativ", text);
        commentWrap.hidden = true;
        toast("Danke für den Hinweis!");
      });

      commentWrap.appendChild(ta);
      commentWrap.appendChild(sendBtn);
      bubble.appendChild(commentWrap);
    }

    function hideCommentBox() { if (commentWrap) commentWrap.hidden = true; }

    function choose(btn, rating) {
      pop(btn);
      const changed = msg.feedback?.rating !== rating;
      if (changed) {
        const hintShown = maybeShowFeedbackHint();
        msg.feedback = { rating, comment: msg.feedback?.comment || "" };
        reflect();
        saveChats();
        sendFeedback(msg, question, rating, msg.feedback.comment);
        if (!hintShown) toast("Danke!", 1800);
      }
      if (rating === "negativ") showCommentBox();
      else hideCommentBox();
    }

    upBtn.addEventListener("click",   () => choose(upBtn, "positiv"));
    downBtn.addEventListener("click", () => choose(downBtn, "negativ"));

    // Restore a previously given rating (visible & changeable after reload).
    reflect();
    if (msg.feedback?.rating === "negativ") showCommentBox();
  }

  // The question for an assistant answer is the nearest preceding user message.
  function questionFor(history, index) {
    for (let i = index - 1; i >= 0; i--) {
      if (history[i].role === "user") return history[i].content;
    }
    return "";
  }

  function renderMessages() {
    const chat    = getActiveChat();
    const history = chat?.messages || [];
    refs.emptyState.style.display = history.length ? "none" : "block";
    refs.messages.querySelectorAll(".assistant-bubble").forEach((el) => el.remove());
    history.forEach((m, i) => {
      const bubble = document.createElement("div");
      bubble.className = `assistant-bubble ${m.role === "user" ? "assistant-bubble-user" : "assistant-bubble-assistant"}`;
      bubble.innerHTML = renderContent(m.role, m.content);
      if (m.role === "assistant") addBubbleActions(bubble, m, questionFor(history, i));
      refs.messages.appendChild(bubble);
    });
    refs.messages.scrollTop = refs.messages.scrollHeight;
  }

  function setTyping(active) {
    let indicator = $("#assistantTyping");
    if (active) {
      if (!indicator) {
        indicator = document.createElement("div");
        indicator.id        = "assistantTyping";
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
    isStreaming                  = loading;
    refs.input.disabled          = loading;
    refs.sendButton.disabled     = loading;
    refs.attachButton.disabled   = loading;
    refs.sendButton.classList.toggle("loading", loading);
    setTyping(loading);
    renderSidebar(); // reflect streaming state on conv items
  }

  // ── Auth ───────────────────────────────────────────────────────────────────
  async function callAssistant(messages, codeOverride) {
    const response = await fetch("/.netlify/functions/assistant-chat", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-access-code": codeOverride ?? accessCode },
      body: JSON.stringify({ messages }),
    });
    let data = null;
    try { data = await response.json(); } catch {}
    return { ok: response.ok, status: response.status, data };
  }

  function showGate(errorMsg) {
    refs.gate.classList.add("show");
    refs.gateError.textContent = errorMsg || "";
    refs.gateInput.value = "";
    refs.gateInput.focus();
  }
  function hideGate() { refs.gate.classList.remove("show"); }

  async function unlock(code) {
    refs.gateButton.disabled   = true;
    refs.gateError.textContent = "";
    try {
      const { ok, status, data } = await callAssistant([], code);
      if (ok) {
        accessCode = code;
        try { localStorage.setItem(CODE_KEY, code); } catch {}
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

  // ── File handling ──────────────────────────────────────────────────────────
  function readAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload  = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function estimatePdfPages(arrayBuffer) {
    try {
      const text    = new TextDecoder("latin1").decode(new Uint8Array(arrayBuffer));
      const matches = text.match(/\/Count\s+(\d+)/g);
      if (!matches) return null;
      const counts  = matches.map((m) => parseInt(m.replace(/\/Count\s+/, ""), 10)).filter((n) => !isNaN(n));
      return counts.length ? Math.max(...counts) : null;
    } catch { return null; }
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
          width  = Math.round(width  * ratio);
          height = Math.round(height * ratio);
        }
        const canvas = document.createElement("canvas");
        canvas.width  = width;
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
    const name    = file.name;
    const isPdf   = file.type === "application/pdf" || name.toLowerCase().endsWith(".pdf");
    const isImage = file.type.startsWith("image/");

    if (!isPdf && !isImage) {
      toast(`${name}: Nur PDF und Bilddateien (JPEG, PNG, GIF, WebP) werden unterstützt.`);
      return null;
    }
    if (isPdf) {
      if (file.size > PDF_MAX_BYTES) { toast(`${name}: PDF ist zu groß (max. 10 MB).`); return null; }
      const arrayBuffer = await file.arrayBuffer();
      const pages       = estimatePdfPages(arrayBuffer);
      if (pages !== null && pages > 100) {
        toast(`${name}: Das PDF hat schätzungsweise ${pages} Seiten (Limit: 100). Bitte ein kürzeres Dokument verwenden.`);
        return null;
      }
      const dataUrl = await readAsDataURL(file);
      return { name, mediaType: "application/pdf", base64: dataUrl.split(",")[1], isImage: false };
    }
    if (isImage) {
      let dataUrl;
      try { dataUrl = await compressImage(file); }
      catch { toast(`${name}: Bild konnte nicht verarbeitet werden.`); return null; }
      const bytes = Math.round((dataUrl.split(",")[1].length) * 0.75);
      if (bytes > IMAGE_MAX_BYTES_AFTER) { toast(`${name}: Bild ist auch nach Komprimierung zu groß.`); return null; }
      return { name, mediaType: "image/jpeg", base64: dataUrl.split(",")[1], isImage: true };
    }
    return null;
  }

  function renderChips() {
    refs.chips.innerHTML = "";
    pendingFiles.forEach((f, i) => {
      const chip      = document.createElement("div");
      chip.className  = "file-chip";
      const nameEl    = document.createElement("span");
      nameEl.className = "file-chip-name";
      nameEl.textContent = f.name;
      nameEl.title = f.name;
      const removeBtn = document.createElement("button");
      removeBtn.className = "file-chip-remove";
      removeBtn.type      = "button";
      removeBtn.textContent = "×";
      removeBtn.setAttribute("aria-label", `${f.name} entfernen`);
      removeBtn.addEventListener("click", () => { pendingFiles.splice(i, 1); renderChips(); });
      chip.appendChild(nameEl);
      chip.appendChild(removeBtn);
      refs.chips.appendChild(chip);
    });
  }

  async function handleFiles(fileList) {
    const remaining = MAX_ATTACHMENTS - pendingFiles.length;
    if (remaining <= 0) { toast(`Maximal ${MAX_ATTACHMENTS} Dateien pro Nachricht.`); return; }
    const toProcess = Array.from(fileList).slice(0, remaining);
    if (fileList.length > remaining) toast(`Es werden nur die ersten ${remaining} Dateien hinzugefügt (Limit: ${MAX_ATTACHMENTS}).`);
    for (const file of toProcess) {
      const result = await processFile(file);
      if (result) pendingFiles.push(result);
    }
    renderChips();
  }

  function buildUserContent(text, files) {
    if (!files.length) return text;
    const parts = [];
    for (const f of files) {
      parts.push(
        f.isImage
          ? { type: "image",    source: { type: "base64", media_type: f.mediaType, data: f.base64 } }
          : { type: "document", source: { type: "base64", media_type: f.mediaType, data: f.base64 } }
      );
    }
    parts.push({ type: "text", text });
    return parts;
  }

  function userContentToText(text, files) {
    if (!files.length) return text;
    return `${files.map((f) => `[Datei: ${f.name}]`).join(" ")}\n${text}`;
  }

  // ── Send ───────────────────────────────────────────────────────────────────
  async function sendMessage(text) {
    // Ensure an active chat exists
    let chat = getActiveChat();
    if (!chat) chat = createChat();

    // Lock stream to this chat – guards against any future switch attempt
    const streamChatId = chat.id;

    const attachments     = pendingFiles.slice();
    pendingFiles = [];
    renderChips();

    const userContent     = buildUserContent(text, attachments);
    const userContentText = userContentToText(text, attachments);

    // Auto-title on first user message
    if (chat.messages.length === 0 && chat.title === "Neues Gespräch") {
      chat.title = autoTitle(text);
    }

    chat.messages.push({ role: "user", content: userContentText });
    chat.updatedAt = Date.now();

    // Bubble active chat to top of list
    const idx = chats.indexOf(chat);
    if (idx > 0) { chats.splice(idx, 1); chats.unshift(chat); activeId = chat.id; }

    renderMessages();
    saveChats();
    renderSidebar();
    setLoading(true);

    let bubble   = null;
    let fullText = "";
    const streamMeta = { kbUsed: null, kbIds: [], webSearchUsed: null };

    function ensureBubble() {
      if (bubble) return;
      setTyping(false);
      bubble           = document.createElement("div");
      bubble.className = "assistant-bubble assistant-bubble-assistant";
      refs.messages.appendChild(bubble);
    }

    function finishOk() {
      // No text at all (e.g. a response that only ran a web search) → treat as a
      // failed turn instead of dereferencing a possibly-null bubble.
      if (!fullText) { finishErr("Keine Antwort erhalten – bitte erneut senden."); return; }
      ensureBubble();
      bubble.innerHTML = renderContent("assistant", fullText);
      const assistantMsg = { role: "assistant", content: fullText, meta: { ...streamMeta } };
      const target = chats.find((c) => c.id === streamChatId);
      if (target) {
        target.messages.push(assistantMsg);
        target.updatedAt = Date.now();
      }
      addBubbleActions(bubble, assistantMsg, userContentText);
      saveChats();
      bubble.classList.add("assistant-bubble--settle");
      bubble.addEventListener("animationend", () => bubble?.classList.remove("assistant-bubble--settle"), { once: true });
      setLoading(false);
      renderSidebar();
      refs.input.focus();
    }

    function finishErr(msg) {
      if (bubble) bubble.remove();
      toast(msg);
      setLoading(false);
      refs.input.focus();
    }

    try {
      // Build payload: prior messages (text only) + current message with file content blocks
      const target           = chats.find((c) => c.id === streamChatId);
      const priorMessages    = target ? target.messages.slice(0, -1) : [];
      const messagesPayload  = [
        ...priorMessages.map((m) => ({ role: m.role, content: m.content })),
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
        } else if (response.status === 413 || response.status === 414) {
          finishErr("Die Datei ist zu groß für den Upload. Bitte eine kleinere Datei verwenden.");
        } else {
          finishErr(data?.error || "Antwort fehlgeschlagen – bitte erneut senden.");
        }
        return;
      }

      const reader  = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer     = "";
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
              fullText            += evt.text;
              bubble.textContent  += evt.text;
              refs.messages.scrollTop = refs.messages.scrollHeight;
            } else if (evt.type === "meta") {
              streamMeta.kbUsed = !!evt.kbUsed;
              streamMeta.kbIds  = Array.isArray(evt.kbIds) ? evt.kbIds : [];
            } else if (evt.type === "done") {
              streamMeta.webSearchUsed = !!evt.webSearchUsed;
              terminated = true; finishOk(); break outer;
            } else if (evt.type === "error") {
              terminated = true;
              const msg = evt.message || "Antwort fehlgeschlagen – bitte erneut senden.";
              finishErr(
                msg.toLowerCase().includes("page") || msg.toLowerCase().includes("seiten")
                  ? "Das PDF hat zu viele Seiten (max. 100). Bitte ein kürzeres Dokument verwenden."
                  : msg
              );
              break outer;
            }
          } catch {}
        }
      }

      if (!terminated) {
        if (fullText) finishOk();
        else finishErr("Verbindung unterbrochen – bitte erneut senden.");
      }
    } catch (err) {
      if (err?.message?.includes("413")) {
        finishErr("Die Datei ist zu groß für den Upload. Bitte eine kleinere Datei verwenden.");
      } else {
        finishErr("Antwort fehlgeschlagen – bitte Internetverbindung prüfen und erneut senden.");
      }
    }
  }

  // ── Input resize ───────────────────────────────────────────────────────────
  function resizeInput() {
    refs.input.style.height = "auto";
    refs.input.style.height = `${Math.min(refs.input.scrollHeight, 160)}px`;
  }

  // ── Event bindings ─────────────────────────────────────────────────────────
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
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); refs.form.requestSubmit(); }
    });
    refs.input.addEventListener("input", resizeInput);

    refs.attachButton.addEventListener("click", () => { refs.fileInput.value = ""; refs.fileInput.click(); });
    refs.fileInput.addEventListener("change", () => { if (refs.fileInput.files.length) handleFiles(refs.fileInput.files); });

    refs.newChatButton.addEventListener("click", () => createChat());

    refs.sidebarToggle?.addEventListener("click", () => {
      if (refs.sidebar.classList.contains("open")) closeSidebar();
      else openSidebar();
    });
    refs.backdrop?.addEventListener("click", closeSidebar);

    refs.search?.addEventListener("input", () => renderSidebar());

    // Close sidebar on Escape
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && refs.sidebar.classList.contains("open")) closeSidebar();
    });
  }

  // ── Init ───────────────────────────────────────────────────────────────────
  function init() {
    bind();
    loadChats();
    renderSidebar();
    renderMessages();

    let storedCode = "";
    try { storedCode = localStorage.getItem(CODE_KEY) || ""; } catch {}

    if (!storedCode) { showGate(); return; }

    accessCode = storedCode;
    callAssistant([]).then(({ ok, status }) => {
      if (ok) {
        hideGate();
        refs.input.focus();
      } else {
        accessCode = "";
        try { localStorage.removeItem(CODE_KEY); } catch {}
        showGate(status === 401 ? "Zugangscode ist ungültig geworden. Bitte erneut eingeben." : "");
      }
    }).catch(() => {
      accessCode = "";
      showGate("Verbindung fehlgeschlagen. Bitte Zugangscode erneut eingeben.");
    });
  }

  init();
})();
