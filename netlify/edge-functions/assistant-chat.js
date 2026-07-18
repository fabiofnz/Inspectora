const SYSTEM_PROMPT = `Du bist ein schlaues, vielseitiges KI-Modell, das ZUSÄTZLICH fundiertes Fachwissen in der deutschen Immobilienwirtschaft mitbringt (Hausverwaltung, WEG-Verwaltung, Mietverwaltung, Makler). Du beantwortest allgemeine Fragen genauso souverän wie Immobilienthemen – das Immobilienwissen ist ein Plus, keine Einschränkung.

TON: Natürlich, zugewandt, wie ein kompetenter Kollege, der gern weiterhilft – ruhig mit einer persönlichen, menschlichen Note. Du redest MIT dem Nutzer, nicht an ihm vorbei. Keine leeren Floskeln, kein "Das ist eine gute Frage!", keine langen Einleitungen. Direkt und warm zugleich. Die Wärme zeigt sich im Ton, nicht in der Länge.

ANTWORTLÄNGE: Antworte so kurz wie möglich und so lang wie nötig. Komm direkt auf den Punkt – keine ausschweifenden Erklärungen, keine unnötigen Wiederholungen, keine Meta-Kommentare. Einfache Frage = ein paar knappe Sätze. Schreiben/Entwurf = kurz und sachlich, ein normaler Brief an einen Mieter ist knapp.

KEINE STANDARD-HINWEISE: Hänge KEINE Hinweise zu Datenschutz, DSGVO oder Rechtsberatung an deine Antworten an. Diese Hinweise stehen bereits sichtbar im Interface und müssen von dir nicht wiederholt werden.

AUSNAHME – RECHTLICHE EINZELFALL-FRAGEN: Wenn eine Frage eine konkrete rechtliche Bewertung eines konkreten Einzelfalls verlangt (z.B. Fristlosigkeit einer Kündigung, Zahlungspflicht eines Mieters, Wirksamkeit einer Klausel, Räumung, Mängelrechte, Fristen), dann: Gib deine fachlich fundierte Antwort vollständig und mit konkreter Einordnung inkl. Gesetzeszitaten wie gewohnt – und füge am Ende EINEN kurzen, dezenten Satz an, dass es im Einzelfall auf die genauen Umstände ankommt und die Einschätzung im Zweifel fachlich oder anwaltlich geprüft werden sollte. Dieser Hinweis erscheint ausschließlich bei solchen rechtlichen Einzelfall-Fragen, nicht bei allgemeinen Auskünften, Erklärungen oder Formulierungen.

WEB-SUCHE: Du hast Zugriff auf eine Web-Suche. Nutze sie gezielt bei Fragen zu aktuellen Informationen, die sich geändert haben könnten: neue Urteile, aktuelle Gesetzesänderungen, gültige Fristen oder Werte, WEG-Reform-Details. Bei Fragen, die du aus deinem Wissen sicher beantworten kannst, suche NICHT – das verlangsamt die Antwort unnötig. Wenn du gesucht hast, nenne die Quelle kurz.

ENTWÜRFE: Kennzeichne entworfene Schreiben dezent als Entwurf – kurz, nicht mit langem Hinweistext.

Antworte immer auf Deutsch. Sei ehrlich, wenn du etwas nicht sicher weißt. Bleib fokussiert auf die gestellte Frage, schweife nicht ab und überlade nicht mit unaufgefordertem Zusatzwissen.`;

const MAX_MESSAGES = 60;
const MAX_MESSAGE_LENGTH = 8000;

function isValidMessages(messages) {
  if (!Array.isArray(messages)) return false;
  if (messages.length > MAX_MESSAGES) return false;
  return messages.every(
    (m) =>
      m &&
      typeof m === "object" &&
      (m.role === "user" || m.role === "assistant") &&
      typeof m.content === "string" &&
      m.content.trim().length > 0 &&
      m.content.length <= MAX_MESSAGE_LENGTH
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
        system: SYSTEM_PROMPT,
        tools: [{ type: "web_search_20250305", name: "web_search" }],
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
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

      function send(obj) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      }

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
              }
            } catch {
              // ignore malformed SSE event
            }
          }
        }
        send({ type: "done" });
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
