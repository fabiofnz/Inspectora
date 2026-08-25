---
name: inspectora-build
description: Build conventions, known traps and working method for the Inspectora project (inspectora.tech - Netlify, Deno Edge Functions, Anthropic API, German property and tenancy law knowledge base). MUST be used whenever work touches Inspectora - every new or changed Netlify Function or Edge Function, any work on assistant.js, ki-assistent.html, styles.css or the knowledge base (gesetze.json, themen-mapping.json), creating new pages in any language including portfolio and about pages, deploy and git questions, Netlify Blobs, environment variables, CSS variable and design decisions, and any time statute text or another factual claim is rendered in the interface. Use it even when Fabio only says "build me X" without naming the project or these rules.
---

# Inspectora – build rules

Fabio's project. Property management apprentice, third year. Learning project with a real live deployment.
Repo: `fabiofnz/Inspectora`, public. Live: inspectora.tech.

These rules are binding. If an instruction contradicts them, **ask first** — do not silently deviate.

---

## The core principle: no claim without a witness

The most important design rule in the project, and it applies to every feature, not just the knowledge base.

Do not try to stop the model from hallucinating. **Build so that an unverifiable claim cannot be produced in the first place.**

In practice: every factual statement the interface outputs carries a checkable artifact with it. For statute, that is the paragraph from `gesetze.json` plus the deep link to the official source. For numbers and data, it is the source plus a timestamp.

When no source exists, the correct output is **"I don't have anything on that"** — never a plausible-sounding answer from model memory. A visible gap is correct. A fluent invention is wrong, and it will not be caught on review, because it reads exactly the way the reader expected.

---

## Before writing anything

1. **Show the plan first.** Always. No code before Fabio has seen and confirmed the plan. This is a hard rule, not a courtesy.
2. **Read the existing code before writing new code.** A lot already exists — streaming, file upload, knowledge base search, feedback. Do not build anything twice.
3. **Explain the reasoning, not just the result.** Fabio wants to understand why a decision goes one way, well enough to explain it to someone else. Include the why, briefly.

---

## Netlify Functions – the most common source of failure

| What | Format | Location |
|---|---|---|
| **New** functions | **v2**: `.mjs`, `export default`, Web `Request`/`Response` | `netlify/functions/` |
| Edge Functions | Deno, Web standard APIs | `netlify/edge-functions/` |
| `generate-protokoll.js` | still **v1** – **do not touch**, it works | `netlify/functions/` |

**Why v2 is mandatory:** Netlify Blobs only works in v2 format without extra configuration. A v1 function using Blobs fails at runtime, not at deploy time — so the error only appears live.

Template for a new function:

```js
// netlify/functions/example.mjs
export default async (req, context) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }
  try {
    const data = await req.json();
    // ... work ...
    console.log("[example] processed successfully");   // see logging rule
    return Response.json({ ok: true });
  } catch (error) {
    console.error("[example] failed:", error);
    return Response.json({ ok: false }, { status: 500 });
  }
};
```

---

## Logging

**Log success, not only failure.** For background operations — sending feedback, writing to Blobs — the Netlify log otherwise cannot distinguish between "ran cleanly" and "was never called at all". Those two look identical, and telling them apart costs hours.

Always prefix with the function name in square brackets: `[feedback] ...`, so the shared log stays filterable.

---

## Design

- **Only use existing CSS variables from `styles.css`.** Never hardcode a colour value, not even "just for this one element".
- **Name new variables by role, not by colour.** `--ink`, `--paper`, `--hair`, `--muted` rather than `--dark-grey`, `--blue-2`. Role names stay true when the value changes; colour names become lies the moment anything is adjusted.
- Dark design with purple accents. The design is good and stays — no unrequested redesigns.
- New pages reuse the structure and classes of existing pages rather than introducing their own patterns.
- **No framework, no build step, as little JavaScript as possible.** Static pages without JS are faster, last longer and break less. Use JavaScript only where it actually does something.

---

## Language

**Default: German.** Buttons, error messages, placeholders, loading states, tooltips — the whole interface. Code comments in German. Variable names in English by convention, but domain terms may stay German where that is clearer: `hausgeld`, `beschluss`, `wohnflaeche`.

**Exception: individual pages may be entirely English.** Portfolio, about and developer-facing pages address an international audience, not a German user with a legal problem.

Rule: **the language of a page is decided explicitly when it is created.** If Fabio does not say which language a new page uses, **ask** — do not assume German because the rest of the site is German. Never mix languages within a single page.

Legal and professional content — statute text, property and tenancy law, anything a user reads in order to make a decision — is **always** German. No exception there.

---

## Security

- **Never** write API keys, access codes or tokens into files — not as placeholders, not in examples. Netlify environment variables only.
- **No base64 in localStorage.** Store file uploads in the history as a placeholder only: `[Datei: name.pdf]`.
- The repo is **public**. Anything committed is readable by anyone. Check before every commit.

---

## Knowledge base

- `wissensbasis/gesetze.json` – 181 paragraphs (WEG, BGB §§ 535–580a, BetrKV, HeizkostenV, WoFlV), officially imported from gesetze-im-internet.de.
- `wissensbasis/themen-mapping.json` – 87 paragraphs mapped to everyday search terms. `titel_pruefung` is the safeguard against wrong assignment.
- Loaded via static import: `with { type: "json" }`.
- `scripts/import-gesetze.js` **runs locally only** — Claude Code Web has no network access, the proxy returns 403. Never try to run download scripts in the web environment.

Every statute output carries paragraph, law and the deep link to the official source. Never quote from model memory. If a paragraph is not in `gesetze.json`, say it is missing — do not reconstruct it. See the witness principle above.

---

## Git and deploys

- **Work directly on `main`.** No branches, no pull requests. Reason: deploy previews double credit consumption.
- **1,000 Netlify credits per month, 15 per deploy, resets on the 15th.** Roughly 66 deploys a month. Batch changes instead of pushing one at a time.
- If a change does not affect the website — docs, notes, CLAUDE.md, this file — put `[skip netlify]` in the commit message. Saves 15 credits.
- On Windows: **`npm.cmd`**, not `npm`. PowerShell blocks `npm` with "execution of scripts is disabled".

---

## Legal guardrails – not negotiable

1. **No personal data through the external AI** (GDPR). Word the interface notices as a **warning**, not a reassurance. The user should know what happens, not feel safe.
2. **No legal advice** (RDG). Every output is a non-binding draft. The human carries responsibility. This framing belongs visibly on the output, not in the small print.
3. As soon as advertising or revenue is added anywhere, German Impressum obligations apply. Flag this to Fabio rather than just building it.

---

## When something breaks

| Symptom | Where to look |
|---|---|
| Change not visible | Netlify → Deploys ("Published"?), then Ctrl+Shift+R |
| Assistant not responding | Netlify → Logs & metrics → **Edge Functions** |
| Feedback or protocol generator failing | Netlify → Logs & metrics → **Functions** |
| Something broken in the browser | F12 → Console |
| Is anything being sent at all? | F12 → Network, then trigger the action |

Status codes: `200/204` fine · `401/403` access code · `404` not deployed · `405` wrong server · `500` function runs but fails internally → check the function log.
