const { getStore } = require("@netlify/blobs");

// Nimmt Rückmeldungen zu Assistenten-Antworten entgegen und legt sie in einem
// Netlify-Blob-Store ab. Es geht ausschließlich um die Antwortqualität:
// KEINE Nutzerkennung, KEINE IP werden gespeichert.
//
// Der Endpunkt ist mit dem bestehenden Zugangscode abgesichert (dieselbe
// leichte Bremse wie im Chat) – der Code wird nur geprüft, nie gespeichert.
// Fehler laufen still ins Leere: Der Nutzer soll nie etwas davon merken und der
// Chat darf dadurch nicht kaputtgehen.

const MAX_TEXT_LENGTH = 20000; // Frage / Antwort
const MAX_COMMENT_LENGTH = 2000;
const MAX_KB_IDS = 30;

const NO_CONTENT = { statusCode: 204, body: "" };

function clip(value, max) {
  return typeof value === "string" ? value.slice(0, max) : "";
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "" };
  }

  // Leichte Bremse gegen offenes Zumüllen: gleicher Zugangscode wie der Chat.
  const expected = process.env.ASSISTANT_ACCESS_CODE;
  const provided = event.headers["x-access-code"] || event.headers["X-Access-Code"] || "";
  if (!expected || provided !== expected) {
    return NO_CONTENT; // still ablehnen – kein Hinweis nach außen
  }

  let data;
  try {
    data = JSON.parse(event.body || "{}");
  } catch {
    return NO_CONTENT;
  }

  const rating = data.rating === "positiv" || data.rating === "negativ" ? data.rating : null;
  if (!rating) return NO_CONTENT; // ohne gültige Bewertung nichts speichern

  const entry = {
    timestamp: new Date().toISOString(),
    rating,
    question: clip(data.question, MAX_TEXT_LENGTH),
    answer: clip(data.answer, MAX_TEXT_LENGTH),
    comment: clip(data.comment, MAX_COMMENT_LENGTH),
    // Wissensbasis: ob sie gegriffen hat und welche Paragraphen-IDs gezogen
    // wurden (null = unbekannt, z.B. bei älteren Antworten ohne Metadaten).
    kbUsed: typeof data.kbUsed === "boolean" ? data.kbUsed : null,
    kbIds: Array.isArray(data.kbIds)
      ? data.kbIds.filter((id) => typeof id === "string").slice(0, MAX_KB_IDS)
      : [],
    webSearchUsed: typeof data.webSearchUsed === "boolean" ? data.webSearchUsed : null,
  };

  try {
    const store = getStore("assistant-feedback");
    const random = Math.random().toString(36).slice(2, 8);
    const key = `feedback:${entry.timestamp}-${random}`;
    await store.setJSON(key, entry);
  } catch (err) {
    // Nur serverseitig loggen – niemals an den Client durchreichen.
    console.error("[feedback] Speichern fehlgeschlagen:", err);
  }

  // Aus Sicht des Nutzers immer erfolgreich und ohne Inhalt.
  return NO_CONTENT;
};
