const Anthropic = require("@anthropic-ai/sdk");

const SYSTEM_PROMPT = `Du bist ein Assistent für Hausverwaltungen, der aus Stichpunkten einer WEG-Eigentümerversammlung ein formelles Versammlungsprotokoll formuliert.

Regeln:
- Formeller, sachlicher Verwaltungston, wie in einem echten Protokoll einer Eigentümerversammlung üblich.
- Beschlüsse müssen klar als solche herausgestellt werden: Beschlussantrag, Abstimmungsergebnis (Ja-/Nein-Stimmen, Enthaltungen) und ob der Antrag angenommen oder abgelehnt wurde.
- Deutsche Rechtschreibung und Grammatik, keine Anglizismen ohne Not.
- Keine Rechtsberatung: Formuliere ausschließlich den Ablauf und die Beschlüsse der Versammlung. Bewerte keine rechtliche Zulässigkeit von Beschlüssen und gib keine juristischen Empfehlungen.
- Erfinde keine Angaben, die nicht in den Stichpunkten enthalten sind. Fehlen Angaben, formuliere neutral oder lasse die Stelle allgemein (z. B. "wie besprochen"), ohne Fakten zu erfinden.
- Struktur: Titel, Einleitung (WEG, Datum, Ort, Versammlungsleiter, Anwesenheit, Beschlussfähigkeit), je Tagesordnungspunkt ein eigener Abschnitt mit Diskussion, Beschlussantrag und Abstimmungsergebnis, Schlussformel mit Unterschriftenzeile für Versammlungsleiter und Protokollführer.
- Beende das Protokoll IMMER mit folgendem Hinweis als letztem Absatz, unverändert:
"Hinweis: Dieses Protokoll ist ein automatisch erstellter, unverbindlicher Entwurf. Die fachliche und formale Verantwortung für Richtigkeit, Vollständigkeit und Form liegt beim Verwalter bzw. Versammlungsleiter."
- Gib ausschließlich den fertigen Protokolltext als Fließtext zurück, ohne einleitende Kommentare, ohne Markdown-Formatierung, ohne Code-Block.`;

function formatDate(value) {
  if (!value) return "Nicht angegeben";
  try {
    return new Intl.DateTimeFormat("de-DE").format(new Date(`${value}T12:00:00`));
  } catch {
    return String(value);
  }
}

function voteResult(top) {
  const yes = Number(top?.yes) || 0;
  const no = Number(top?.no) || 0;
  return yes > no ? "Angenommen" : "Abgelehnt";
}

function buildUserPrompt(data) {
  const present = Number(data.ownersPresent) || 0;
  const represented = Number(data.ownersRepresented) || 0;
  const tops = Array.isArray(data.tops) ? data.tops : [];

  const lines = [
    `WEG-Bezeichnung: ${data.name || "Nicht angegeben"}`,
    `Datum: ${formatDate(data.date)}`,
    `Ort: ${data.location || "Nicht angegeben"}`,
    `Versammlungsleiter: ${data.chair || "Nicht angegeben"}`,
    `Anwesende Eigentümer: ${present}`,
    `Vertretene Eigentümer: ${represented}`,
    `Beschlussfähigkeit: ${data.quorumStatus || "Nicht angegeben"}${data.quorumNote ? ` (${data.quorumNote})` : ""}`,
    "",
    "Tagesordnungspunkte:",
  ];

  if (!tops.length) {
    lines.push("Keine Tagesordnungspunkte erfasst.");
  } else {
    tops.forEach((top, index) => {
      const yes = Number(top.yes) || 0;
      const no = Number(top.no) || 0;
      const abstain = Number(top.abstain) || 0;
      lines.push("");
      lines.push(`TOP ${index + 1}: ${top.title || "Ohne Titel"}`);
      if (top.notes) lines.push(`Diskussion/Notizen: ${top.notes}`);
      if (top.motion) lines.push(`Beschlussantrag: ${top.motion}`);
      lines.push(
        `Abstimmung: ${yes} Ja-Stimmen, ${no} Nein-Stimmen, ${abstain} Enthaltungen – Ergebnis: ${voteResult(top)}`
      );
    });
  }

  lines.push("");
  lines.push("Formuliere daraus das vollständige Versammlungsprotokoll gemäß den Vorgaben.");
  return lines.join("\n");
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

  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: "Request-Body muss ein Objekt mit den Protokolldaten sein." }),
    };
  }

  if (data.tops !== undefined && !Array.isArray(data.tops)) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: "Das Feld 'tops' muss ein Array sein." }),
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
      max_tokens: 3000,
      thinking: { type: "disabled" },
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildUserPrompt(data) }],
    });

    const textBlock = response.content.find((block) => block.type === "text");
    if (!textBlock || !textBlock.text) {
      return {
        statusCode: 502,
        headers,
        body: JSON.stringify({ error: "Die KI hat keinen Text zurückgegeben. Bitte erneut versuchen." }),
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ text: textBlock.text }),
    };
  } catch (err) {
    console.error("generate-protokoll: Anthropic API error", err);
    return {
      statusCode: 502,
      headers,
      body: JSON.stringify({ error: "Die Protokoll-Formulierung ist fehlgeschlagen. Bitte erneut versuchen." }),
    };
  }
};
