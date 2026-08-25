import gesetze from "../../wissensbasis/gesetze.json" with { type: "json" };

// Netlify Functions v2 (Web Request/Response).
//
// Liefert, was tatsächlich in der Wissensbasis steht: Anzahl der Paragraphen,
// Aufschlüsselung je Gesetz und die Quelle dazu. Gezählt wird zur Laufzeit aus
// gesetze.json – die Zahl kann also nicht von den Daten abweichen.
//
// Bewusst nicht nur eine nackte Zahl: Eine Zahl ohne Herkunft ist eine
// Behauptung, die niemand nachprüfen kann. Quelle und Stand gehören dazu.
//
// Öffentlich erreichbar, kein Zugangscode: Die Wissensbasis liegt ohnehin im
// öffentlichen Repo – hier gibt es nichts zu schützen.

const QUELLE = "https://www.gesetze-im-internet.de/";
const HINWEIS = "Konsolidierte Fassung, nicht die amtliche Fassung des BGBl.";

export default async (req) => {
  if (req.method !== "GET") {
    return new Response(null, { status: 405 });
  }

  // Kein stiller Rückfall auf 0: Wäre die Datei kaputt, sähe "0 Paragraphen"
  // wie eine gültige Antwort aus. Lieber ein ehrlicher Fehler.
  if (!Array.isArray(gesetze) || gesetze.length === 0) {
    console.error("[wissensbasis-status] gesetze.json ist kein befülltes Array – Abbruch.");
    return Response.json({ fehler: "Wissensbasis nicht lesbar." }, { status: 500 });
  }

  // Reihenfolge der Gesetze = Reihenfolge ihres ersten Auftretens in der Datei.
  const proGesetz = new Map();
  for (const eintrag of gesetze) {
    const kuerzel = eintrag?.gesetz;
    if (typeof kuerzel !== "string" || !kuerzel) continue;

    if (!proGesetz.has(kuerzel)) {
      const block = {
        kuerzel,
        name: typeof eintrag.gesetz_lang === "string" && eintrag.gesetz_lang ? eintrag.gesetz_lang : kuerzel,
        paragraphen: 0,
      };
      // WoFlV hat kein "stand" – dann das Feld weglassen statt "" auszuliefern.
      if (typeof eintrag.stand === "string" && eintrag.stand.trim()) {
        block.stand = eintrag.stand.trim();
      }
      proGesetz.set(kuerzel, block);
    }
    proGesetz.get(kuerzel).paragraphen++;
  }

  // "mit_themen" = Paragraphen mit Alltags-Suchbegriffen aus themen-mapping.json.
  // Aus den Einträgen selbst gezählt, nicht aus den Keys der Mapping-Datei:
  // die enthält zusätzlich den Kommentar-Key "_hinweis" und wäre um eins zu hoch.
  const mitThemen = gesetze.filter(
    (eintrag) => Array.isArray(eintrag?.themen) && eintrag.themen.length > 0
  ).length;

  const antwort = {
    stand: new Date().toISOString(), // Zeitpunkt dieser Auskunft, nicht der Daten
    paragraphen: gesetze.length,
    mit_themen: mitThemen,
    gesetze: [...proGesetz.values()],
    quelle: QUELLE,
    hinweis: HINWEIS,
  };

  // Erfolg mitloggen: Sonst ist im Netlify-Log nicht zu unterscheiden, ob die
  // Function sauber lief oder nie aufgerufen wurde.
  console.log(
    `[wissensbasis-status] ${antwort.paragraphen} Paragraphen, ${antwort.gesetze.length} Gesetze, ${antwort.mit_themen} mit Themen`
  );

  return Response.json(antwort, {
    headers: {
      // Das CDN fängt die Wiederholungen ab. Netlify leert seinen Cache beim
      // Deploy – die Zahl ist nach einem Push also sofort wieder korrekt.
      "Cache-Control": "public, max-age=0, must-revalidate, s-maxage=3600",
    },
  });
};
