const Anthropic = require("@anthropic-ai/sdk");

const SYSTEM_PROMPT = `Du bist ein hilfsbereiter KI-Assistent für Mitarbeitende in der deutschen Immobilienwirtschaft (Hausverwaltung, WEG-Verwaltung, Mietverwaltung, Makler). Du hast fundiertes Fachwissen zu Mietrecht-Grundlagen, WEG-Recht, Betriebs- und Nebenkosten, typischem Schriftverkehr und Verwaltungsabläufen. Du hilfst außerdem gerne bei allgemeinen Fragen, Formulierungen und Aufgaben – wie ein normaler Assistent, nur mit Immobilien-Kompetenz im Hintergrund. Regeln: Du gibst KEINE Rechtsberatung im Sinne des RDG – bei rechtlichen Fragen lieferst du allgemeine, unverbindliche Informationen und weist darauf hin, dass im Zweifel ein Fachmann/Anwalt hinzuzuziehen ist. Entworfene Schreiben kennzeichnest du als unverbindlichen Entwurf. Du erinnerst freundlich daran, keine echten personenbezogenen Mieterdaten einzugeben (DSGVO), falls jemand das tut. Antworte sachlich, höflich, klar und auf Deutsch. Sei ehrlich, wenn du etwas nicht sicher weißt.`;

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
