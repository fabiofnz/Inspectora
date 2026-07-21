import gesetzeRaw from "../../wissensbasis/gesetze.json" with { type: "json" };

// Defensiv: Falls die Datei fehlt/leer/kein Array ist, bleibt die Wissensbasis leer
// und der Assistent antwortet ganz normal ohne Zusatzwissen statt abzustürzen.
const GESETZE = Array.isArray(gesetzeRaw) ? gesetzeRaw : [];
if (!Array.isArray(gesetzeRaw)) {
  console.error("[assistant-chat] wissensbasis/gesetze.json ist kein Array – Wissensbasis deaktiviert.");
}

const ENTRIES_BY_ID = new Map(GESETZE.map((e) => [e.id, e]));
const GESETZ_IDS = [...new Set(GESETZE.map((e) => e.gesetz))]; // z.B. ["WEG","BGB","BetrKV","HeizkostenV","WoFlV"]
const GESETZ_ALTERNATION = GESETZ_IDS.map((g) => g.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
const MAX_KONTEXT_EINTRAEGE = 5;

const SYSTEM_PROMPT = `Du bist ein schlaues, vielseitiges KI-Modell, das ZUSÄTZLICH fundiertes Fachwissen in der deutschen Immobilienwirtschaft mitbringt (Hausverwaltung, WEG-Verwaltung, Mietverwaltung, Makler). Du beantwortest allgemeine Fragen genauso souverän wie Immobilienthemen – das Immobilienwissen ist ein Plus, keine Einschränkung.

DEIN NAME: Du heißt Inspector, der KI-Assistent von Inspectora. Fragt dich jemand, wie du heißt, sag einfach, dass du Inspector heißt – kurz und natürlich, ohne Aufhebens. Erwähne deinen Namen nicht ungefragt in jeder Antwort.

TON: Natürlich, zugewandt, wie ein kompetenter Kollege, der gern weiterhilft – ruhig mit einer persönlichen, menschlichen Note. Du redest MIT dem Nutzer, nicht an ihm vorbei. Keine leeren Floskeln, kein "Das ist eine gute Frage!", keine langen Einleitungen. Direkt und warm zugleich. Die Wärme zeigt sich im Ton, nicht in der Länge.

ANTWORTLÄNGE: Antworte so kurz wie möglich und so lang wie nötig. Komm direkt auf den Punkt – keine ausschweifenden Erklärungen, keine unnötigen Wiederholungen, keine Meta-Kommentare. Einfache Frage = ein paar knappe Sätze. Schreiben/Entwurf = kurz und sachlich, ein normaler Brief an einen Mieter ist knapp.

KEINE STANDARD-HINWEISE: Hänge KEINE Hinweise zu Datenschutz, DSGVO oder Rechtsberatung an deine Antworten an. Diese Hinweise stehen bereits sichtbar im Interface und müssen von dir nicht wiederholt werden.

AUSNAHME – RECHTLICHE EINZELFALL-FRAGEN: Wenn eine Frage eine konkrete rechtliche Bewertung eines konkreten Einzelfalls verlangt (z.B. Fristlosigkeit einer Kündigung, Zahlungspflicht eines Mieters, Wirksamkeit einer Klausel, Räumung, Mängelrechte, Fristen), dann: Gib deine fachlich fundierte Antwort vollständig und mit konkreter Einordnung inkl. Gesetzeszitaten wie gewohnt – und füge am Ende EINEN kurzen, dezenten Satz an, dass es im Einzelfall auf die genauen Umstände ankommt und die Einschätzung im Zweifel fachlich oder anwaltlich geprüft werden sollte. Dieser Hinweis erscheint ausschließlich bei solchen rechtlichen Einzelfall-Fragen, nicht bei allgemeinen Auskünften, Erklärungen oder Formulierungen.

WEB-SUCHE: Du hast Zugriff auf eine Web-Suche. Nutze sie gezielt bei Fragen zu aktuellen Informationen, die sich geändert haben könnten: neue Urteile, aktuelle Gesetzesänderungen, gültige Fristen oder Werte, WEG-Reform-Details. Bei Fragen, die du aus deinem Wissen sicher beantworten kannst, suche NICHT – das verlangsamt die Antwort unnötig. Wenn du gesucht hast, nenne die Quelle kurz.

ENTWÜRFE: Kennzeichne entworfene Schreiben dezent als Entwurf – kurz, nicht mit langem Hinweistext.

Antworte immer auf Deutsch. Sei ehrlich, wenn du etwas nicht sicher weißt. Bleib fokussiert auf die gestellte Frage, schweife nicht ab und überlade nicht mit unaufgefordertem Zusatzwissen.`;

const WISSENSBASIS_ANWEISUNG = `Dir werden bei manchen Fragen passende Gesetzestexte im Volltext bereitgestellt. Nutze sie als verlässliche Wissensgrundlage – aber antworte weiterhin genau so wie bisher: natürlich, dialogisch, kurz und auf den Punkt. Die Gesetzestexte sind Hintergrundwissen, kein Antwortformat.

Konkret:
- Antworte in normaler Sprache, nicht im Gesetzesstil
- Zitiere einen Paragraphen nur, wenn er für die Antwort wirklich wichtig ist – nicht bei jeder Gelegenheit und nicht als Beleg-Liste
- Wenn du zitierst: knapp, im Fließtext, mit dem Link zur Quelle
- Wiederhole niemals den kompletten bereitgestellten Gesetzestext, fasse in eigenen Worten zusammen
- Erwähne die Wissensbasis nicht ('laut meiner Datenbank', 'in den mir vorliegenden Texten') – das interessiert niemanden
- Steht etwas nicht in den bereitgestellten Texten, antworte normal aus deinem Wissen
- Erfinde niemals einen Paragraphen oder Wortlaut. Wenn ein Text bereitgestellt wurde, gib ihn korrekt wieder.`;

// ---------------------------------------------------------------------------
// Wissensbasis: Passende Paragraphen zur Nutzerfrage finden
// ---------------------------------------------------------------------------

function baueId(gesetzId, nummer) {
  return `${gesetzId.toLowerCase()}-${nummer.toLowerCase()}`;
}

// Erkennt explizite Paragraphen-Nennungen: "§ 24 WEG", "§ 556a", "Paragraph 543", "556a BGB".
// Wird kein Gesetz genannt, wird über alle bekannten Gesetze nach einer passenden ID gesucht.
function findeExpliziteParagraphen(text) {
  const treffer = [];
  if (!GESETZ_ALTERNATION) return treffer;

  const gesetzRegex = new RegExp(`^(${GESETZ_ALTERNATION})$`, "i");
  const paragraphZeichen = /§\s*(\d{1,4}[a-zA-Z]?)(?:\s*Abs(?:atz)?\.?\s*\d+[a-zA-Z]?)?\s*([A-Za-zÄÖÜäöüß]+)?/g;
  const paragraphWort = /\bParagraph(?:en)?\s+(\d{1,4}[a-zA-Z]?)\s*([A-Za-zÄÖÜäöüß]+)?/gi;
  const nummerGesetz = new RegExp(`\\b(\\d{1,4}[a-zA-Z]?)\\s+(${GESETZ_ALTERNATION})\\b`, "gi");

  const sammeln = (regex) => {
    let m;
    while ((m = regex.exec(text)) !== null) {
      const nummer = m[1];
      const gesetzRoh = m[2];
      const gesetzId = gesetzRoh && gesetzRegex.test(gesetzRoh)
        ? GESETZ_IDS.find((g) => g.toLowerCase() === gesetzRoh.toLowerCase())
        : null;
      treffer.push({ nummer, gesetzId });
    }
  };

  sammeln(paragraphZeichen);
  sammeln(paragraphWort);
  sammeln(nummerGesetz);

  const ergebnisse = [];
  const gesehen = new Set();
  for (const { nummer, gesetzId } of treffer) {
    const kandidatenGesetze = gesetzId ? [gesetzId] : GESETZ_IDS;
    for (const g of kandidatenGesetze) {
      const id = baueId(g, nummer);
      if (gesehen.has(id)) continue;
      const eintrag = ENTRIES_BY_ID.get(id);
      if (eintrag) {
        ergebnisse.push(eintrag);
        gesehen.add(id);
      }
    }
  }
  return ergebnisse;
}

// Stichwort-Abgleich gegen die "themen"-Felder; nach Anzahl Treffern pro Eintrag sortiert.
function findeUeberThemen(textLower, ausschluss) {
  const treffer = [];
  for (const eintrag of GESETZE) {
    if (ausschluss.has(eintrag.id)) continue;
    if (!Array.isArray(eintrag.themen) || eintrag.themen.length === 0) continue;
    let score = 0;
    for (const thema of eintrag.themen) {
      if (thema && textLower.includes(thema.toLowerCase())) score++;
    }
    if (score > 0) treffer.push({ eintrag, score });
  }
  treffer.sort((a, b) => b.score - a.score);
  return treffer.map((t) => t.eintrag);
}

// Fallback: Abgleich gegen den Paragraphen-Titel. Nur genutzt, wenn (a)+(b) nichts fanden.
function findeUeberTitel(textLower, ausschluss) {
  const treffer = [];
  for (const eintrag of GESETZE) {
    if (ausschluss.has(eintrag.id)) continue;
    if (!eintrag.titel) continue;
    if (textLower.includes(eintrag.titel.toLowerCase())) treffer.push(eintrag);
  }
  return treffer;
}

function findeKontext(userText) {
  if (!userText || GESETZE.length === 0) return [];
  const textLower = userText.toLowerCase();

  const ergebnis = [];
  const ids = new Set();
  const hinzufuegen = (eintraege) => {
    for (const e of eintraege) {
      if (ids.size >= MAX_KONTEXT_EINTRAEGE) break;
      if (ids.has(e.id)) continue;
      ergebnis.push(e);
      ids.add(e.id);
    }
  };

  hinzufuegen(findeExpliziteParagraphen(userText));
  if (ids.size < MAX_KONTEXT_EINTRAEGE) hinzufuegen(findeUeberThemen(textLower, ids));
  if (ids.size === 0) hinzufuegen(findeUeberTitel(textLower, ids));

  return ergebnis;
}

function baueKontextBlock(eintraege) {
  return eintraege
    .map((e) => `${e.gesetz} ${e.paragraph} – ${e.titel}\nQuelle: ${e.quelle}\n\n${e.text}`)
    .join("\n\n---\n\n");
}

function extrahiereText(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((b) => b && b.type === "text" && typeof b.text === "string")
      .map((b) => b.text)
      .join(" ");
  }
  return "";
}

// Ermittelt die zur letzten Nutzerfrage passenden Wissensbasis-Einträge.
function ermittleKontextEintraege(messages) {
  const letzteNutzerNachricht = [...messages].reverse().find((m) => m.role === "user");
  const nutzerText = letzteNutzerNachricht ? extrahiereText(letzteNutzerNachricht.content) : "";
  return findeKontext(nutzerText);
}

function baueSystemPrompt(kontextEintraege) {
  if (kontextEintraege.length === 0) return SYSTEM_PROMPT;

  return `${SYSTEM_PROMPT}\n\n${WISSENSBASIS_ANWEISUNG}\n\n=== Bereitgestellte Gesetzestexte ===\n\n${baueKontextBlock(kontextEintraege)}`;
}

const MAX_MESSAGES = 60;
const MAX_MESSAGE_LENGTH = 8000;
const ALLOWED_MEDIA_TYPES = new Set(["application/pdf", "image/jpeg", "image/png", "image/gif", "image/webp"]);

function isValidContent(content) {
  if (typeof content === "string") {
    return content.trim().length > 0 && content.length <= MAX_MESSAGE_LENGTH;
  }
  if (Array.isArray(content) && content.length > 0) {
    return content.every((block) => {
      if (!block || typeof block !== "object") return false;
      if (block.type === "text") {
        return typeof block.text === "string" && block.text.length <= MAX_MESSAGE_LENGTH;
      }
      if (block.type === "image" || block.type === "document") {
        const src = block.source;
        return (
          src &&
          src.type === "base64" &&
          ALLOWED_MEDIA_TYPES.has(src.media_type) &&
          typeof src.data === "string" &&
          src.data.length > 0
        );
      }
      return false;
    });
  }
  return false;
}

function isValidMessages(messages) {
  if (!Array.isArray(messages)) return false;
  if (messages.length > MAX_MESSAGES) return false;
  return messages.every(
    (m) =>
      m &&
      typeof m === "object" &&
      (m.role === "user" || m.role === "assistant") &&
      isValidContent(m.content)
  );
}

export default async (request) => {
  const jsonHeaders = { "Content-Type": "application/json" };

  if (request.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Nur POST-Anfragen werden unterstützt." }),
      { status: 405, headers: jsonHeaders }
    );
  }

  const accessCode = Deno.env.get("ASSISTANT_ACCESS_CODE");
  if (!accessCode) {
    return new Response(
      JSON.stringify({ error: "Serverkonfiguration unvollständig. Bitte Administrator kontaktieren." }),
      { status: 500, headers: jsonHeaders }
    );
  }

  const providedCode = request.headers.get("x-access-code") || "";
  if (!providedCode || providedCode !== accessCode) {
    return new Response(
      JSON.stringify({ error: "Ungültiger Zugangscode." }),
      { status: 401, headers: jsonHeaders }
    );
  }

  let data;
  try {
    data = await request.json();
  } catch {
    return new Response(
      JSON.stringify({ error: "Ungültiges JSON im Request-Body." }),
      { status: 400, headers: jsonHeaders }
    );
  }

  const messages = data?.messages;
  if (!isValidMessages(messages)) {
    return new Response(
      JSON.stringify({ error: "Das Feld 'messages' ist ungültig oder zu lang." }),
      { status: 400, headers: jsonHeaders }
    );
  }

  // Empty array = auth check only, no AI call needed
  if (messages.length === 0) {
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: jsonHeaders });
  }

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "Serverkonfiguration unvollständig. Bitte Administrator kontaktieren." }),
      { status: 500, headers: jsonHeaders }
    );
  }

  // Wissensbasis-Treffer einmal ermitteln: fließt in den System-Prompt UND
  // wird dem Client als Metadaten mitgegeben (für den Feedback-Mechanismus).
  const kontextEintraege = ermittleKontextEintraege(messages);
  const kbIds = kontextEintraege.map((e) => e.id);

  let anthropicResponse;
  try {
    anthropicResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "web-search-2025-03-05",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 2000,
        stream: true,
        system: baueSystemPrompt(kontextEintraege),
        tools: [{ type: "web_search_20250305", name: "web_search" }],
        messages: messages.map((m) => ({
          role: m.role,
          content: typeof m.content === "string" ? m.content : m.content,
        })),
      }),
    });
  } catch {
    return new Response(
      JSON.stringify({ error: "Die Anfrage an die KI ist fehlgeschlagen. Bitte erneut versuchen." }),
      { status: 502, headers: jsonHeaders }
    );
  }

  if (!anthropicResponse.ok) {
    return new Response(
      JSON.stringify({ error: "Die Anfrage an die KI ist fehlgeschlagen. Bitte erneut versuchen." }),
      { status: 502, headers: jsonHeaders }
    );
  }

  // Re-emit Anthropic SSE stream, forwarding only text deltas + done/error signals
  const upstreamReader = anthropicResponse.body.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let buffer = "";
      let webSearchUsed = false;

      function send(obj) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      }

      // Metadaten der Wissensbasis vorab senden – der Client hängt sie an die
      // Antwort, damit sie später mit einer Rückmeldung gespeichert werden können.
      send({ type: "meta", kbUsed: kbIds.length > 0, kbIds });

      try {
        while (true) {
          const { done, value } = await upstreamReader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const raw = line.slice(6).trim();
            if (!raw || raw === "[DONE]") continue;
            try {
              const evt = JSON.parse(raw);
              if (
                evt.type === "content_block_delta" &&
                evt.delta?.type === "text_delta" &&
                evt.delta.text
              ) {
                send({ type: "delta", text: evt.delta.text });
              } else if (evt.type === "content_block_start") {
                // Web-Suche erkennen: Anthropic sendet dafür server_tool_use /
                // web_search_tool_result als eigene Content-Blöcke.
                const blockType = evt.content_block?.type;
                if (blockType === "server_tool_use" || blockType === "web_search_tool_result") {
                  webSearchUsed = true;
                }
              }
            } catch {
              // ignore malformed SSE event
            }
          }
        }
        send({ type: "done", webSearchUsed });
      } catch {
        send({ type: "error", message: "Stream unterbrochen. Bitte erneut versuchen." });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no",
    },
  });
};
