const Anthropic = require("@anthropic-ai/sdk");

const SYSTEM_PROMPT = `Du bist ein schlaues, vielseitiges KI-Modell, das ZUSÄTZLICH fundiertes Fachwissen in der deutschen Immobilienwirtschaft mitbringt (Hausverwaltung, WEG-Verwaltung, Mietverwaltung, Makler). Du beantwortest allgemeine Fragen genauso souverän wie Immobilienthemen – das Immobilienwissen ist ein Plus, keine Einschränkung.

TON: Natürlich, zugewandt, wie ein kompetenter Kollege, der gern weiterhilft – ruhig mit einer persönlichen, menschlichen Note. Du redest MIT dem Nutzer, nicht an ihm vorbei. Keine leeren Floskeln, kein "Das ist eine gute Frage!", keine langen Einleitungen. Direkt und warm zugleich. Die Wärme zeigt sich im Ton, nicht in der Länge.

ANTWORTLÄNGE: Antworte so kurz wie möglich und so lang wie nötig. Komm direkt auf den Punkt – keine ausschweifenden Erklärungen, keine unnötigen Wiederholungen, keine Meta-Kommentare. Einfache Frage = ein paar knappe Sätze. Schreiben/Entwurf = kurz und sachlich, ein normaler Brief an einen Mieter ist knapp.

KEINE STANDARD-HINWEISE: Hänge KEINE Hinweise zu Datenschutz, DSGVO oder Rechtsberatung an deine Antworten an. Diese Hinweise stehen bereits sichtbar im Interface und müssen von dir nicht wiederholt werden.

AUSNAHME – RECHTLICHE EINZELFALL-FRAGEN: Wenn eine Frage eine konkrete rechtliche Bewertung eines konkreten Einzelfalls verlangt (z.B. Fristlosigkeit einer Kündigung, Zahlungspflicht eines Mieters, Wirksamkeit einer Klausel, Räumung, Mängelrechte, Fristen), dann: Gib deine fachlich fundierte Antwort vollständig und mit konkreter Einordnung inkl. Gesetzeszitaten wie gewohnt – und füge am Ende EINEN kurzen, dezenten Satz an, dass es im Einzelfall auf die genauen Umstände ankommt und die Einschätzung im Zweifel fachlich oder anwaltlich geprüft werden sollte. Dieser Hinweis erscheint ausschließlich bei solchen rechtlichen Einzelfall-Fragen, nicht bei allgemeinen Auskünften, Erklärungen oder Formulierungen.

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

exports.handler = async (event) => {
  const headers = { "Content-Type": "application/json" };

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: "Nur POST-Anfragen werden unterstützt." }),
    };
  }

  const accessCode = process.env.ASSISTANT_ACCESS_CODE;
  if (!accessCode) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "Serverkonfiguration unvollständig. Bitte Administrator kontaktieren." }),
    };
  }

  const providedCode = event.headers?.["x-access-code"] || event.headers?.["X-Access-Code"];
  if (!providedCode || providedCode !== accessCode) {
    return {
      statusCode: 401,
      headers,
      body: JSON.stringify({ error: "Ungültiger Zugangscode." }),
    };
  }

  let data;
  try {
    data = JSON.parse(event.body || "{}");
  } catch {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: "Ungültiges JSON im Request-Body." }),
    };
  }

  const messages = data?.messages;
  if (!isValidMessages(messages)) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: "Das Feld 'messages' ist ungültig oder zu lang." }),
    };
  }

  // Leeres Array = reine Code-Prüfung, kein Anthropic-Aufruf nötig.
  if (messages.length === 0) {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ ok: true }),
    };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "Serverkonfiguration unvollständig. Bitte Administrator kontaktieren." }),
    };
  }

  const client = new Anthropic({ apiKey });

  try {
    const response = await client.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 2000,
      thinking: { type: "disabled" },
      system: SYSTEM_PROMPT,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    });

    const textBlock = response.content.find((block) => block.type === "text");
    if (!textBlock || !textBlock.text) {
      return {
        statusCode: 502,
        headers,
        body: JSON.stringify({ error: "Die KI hat keine Antwort zurückgegeben. Bitte erneut versuchen." }),
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ reply: textBlock.text }),
    };
  } catch (err) {
    console.error("assistant-chat: Anthropic API error", err);
    return {
      statusCode: 502,
      headers,
      body: JSON.stringify({ error: "Die Anfrage an die KI ist fehlgeschlagen. Bitte erneut versuchen." }),
    };
  }
};
