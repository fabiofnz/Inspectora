// benchmark/run.mjs
// Stellt Benchmark-Fragen an ein Modell und speichert die Antworten WORTWOERTLICH.
//
// Aufruf:
//   node benchmark/run.mjs --modell claude-sonnet-5               Trockenlauf (Standard)
//   node benchmark/run.mjs --modell claude-sonnet-5 --ausfuehren  echter Lauf, kostet Geld
//
// Laeuft nur lokal, nie auf Netlify. Der Schluessel kommt ausschliesslich aus der
// Umgebungsvariablen BENCHMARK_ANTHROPIC_API_KEY - es gibt keinen Rueckfall auf andere
// Zugangsdaten (z.B. ein "ant auth login"-Profil), sonst waere unklar, welches Konto
// bezahlt hat.
//
// Dieses Skript INTERPRETIERT NICHTS und BEWERTET NICHTS. Es zieht nicht einmal die
// "ANTWORT:"-Zeile aus der Antwort - das ist Aufgabe des Scorers. Die Ergebnisdatei ist
// das Beweisstueck; was darin steht, ist genau das, was die API geliefert hat.
//
// ---------------------------------------------------------------------------
// WIE GEFRAGT WIRD
// ---------------------------------------------------------------------------
//   - Kein Systemprompt. Jede Rolle, jeder Hinweis, jeder Ton wuerde das Modell steuern.
//   - Nutzernachricht = Frage unveraendert aus der Fragendatei + EINE feste Formatzeile,
//     je Antworttyp wortgleich. Die Formatzeile legt nur die letzte Zeile fest - darueber
//     darf das Modell frei begruenden. Platzhalter "TT.MM.JJJJ", kein Beispieldatum, damit
//     kein Datum als Anker wirkt.
//   - Keine Beispiele, kein Gespraechsverlauf: jede Frage ist eine eigene Anfrage.
//   - Vor der ersten Anfrage wird geprueft, dass jede Nachricht ohne die Frage exakt die
//     Vorlage ihres Antworttyps ist. Weicht eine ab, bricht das Skript ab.
//   - KEINE fallbacks: Ein Rueckfall auf ein anderes Modell wuerde eine Antwort dem
//     falschen Modell zuschreiben. Eine Ablehnung wird als stop_reason "refusal"
//     gespeichert, wie sie ist.
//
// ---------------------------------------------------------------------------
// REGEL FUER DIE KONFIGURATION - gilt fuer alle Modelle, auch kuenftige Anbieter
// ---------------------------------------------------------------------------
//   - Je Anbieter die schlichteste verfuegbare Standardkonfiguration.
//   - Keine optionalen Denk- oder Reasoning-Verstaerker - ausser sie sind bei allen
//     Anbietern gleichwertig eingeschaltet, und dann fuer alle. Sonst vergleicht der
//     Benchmark Konfigurationen statt Modelle.
//   - max_tokens grosszuegig. Das ist keine Qualitaetsschraube, es verhindert nur
//     abgeschnittene Antworten. Wird trotzdem abgeschnitten (stop_reason "max_tokens"),
//     wird die Antwort als abgeschnitten markiert und spaeter nicht gewertet.
//   - Die vollstaendige Konfiguration je Modell steht in der Ergebnisdatei und spaeter
//     auf der Methodenseite.
//   - Eine Konfiguration laeuft erst, wenn sie freigegeben ist.

"use strict";

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import Anthropic from "@anthropic-ai/sdk";

const LOG = "[run]";
const HIER = path.dirname(fileURLToPath(import.meta.url));
const FRAGEN_PFAD = path.resolve(HIER, "fragen-fristen.json");
const ERGEBNIS_VERZEICHNIS = path.resolve(HIER, "ergebnisse");
const SDK_PAKET = path.resolve(HIER, "../node_modules/@anthropic-ai/sdk/package.json");
const SCHLUESSEL_VARIABLE = "BENCHMARK_ANTHROPIC_API_KEY";

// ---------------------------------------------------------------------------
// Modelle und ihre Konfiguration
// ---------------------------------------------------------------------------

const MODELLE = {
  "claude-sonnet-5": {
    anbieter: "Anthropic",
    // Freigegeben 14.09.2026, Variante A: keine Parameter ausser dem Pflichtfeld max_tokens.
    // Was der Anbieter ohne Konfiguration ausliefert, ist der Messgegenstand. Schliesst die
    // Vorgabe Denken ein (bei Claude Sonnet 5 laut API-Dokumentation adaptives Denken mit
    // effort "high"), ist das Teil der Messung und wird offengelegt.
    freigegeben: true,
    parameter: {
      max_tokens: 64000,
    },
    anmerkung: "Variante A: weder thinking noch output_config gesetzt, nur das Pflichtfeld "
      + "max_tokens. Laut API-Dokumentation laeuft Claude Sonnet 5 dann mit adaptivem Denken "
      + "und effort high. Die Anbieter-Vorgabe ist der Messgegenstand.",
  },
};

// ---------------------------------------------------------------------------
// Frage und Vorlage
// ---------------------------------------------------------------------------

const FORMATZEILE = {
  "datum": "Letzte Zeile deiner Antwort genau in dieser Form: ANTWORT: TT.MM.JJJJ",
  "ja-nein": "Letzte Zeile deiner Antwort genau in dieser Form: ANTWORT: ja oder ANTWORT: nein",
};

const baueNachricht = (frage) => `${frage.frage}\n\n${FORMATZEILE[frage.antwort_typ]}`;

// ---------------------------------------------------------------------------
// Feste Auswahl - kein Zufall
// ---------------------------------------------------------------------------
//
// Kontingente je (Kategorie, Antworttyp, Antwort). Bei Ja/Nein-Fragen ist die Antwort
// Teil des Kontingents: Ohne das ergab die erste Fassung 7 ja zu 3 nein, weil innerhalb
// eines Falls der Fristtag (ja) vor dem Folgetag (nein) sortiert. Ein Modell mit Hang
// zu "ja" haette dadurch zu gut abgeschnitten.
const KONTINGENT = [
  { kategorie: "frist-193-verschiebung", typ: "datum", antwort: null, anzahl: 3 },
  { kategorie: "frist-abrechnung-datum", typ: "datum", antwort: null, anzahl: 3 },
  { kategorie: "frist-einwendung-datum", typ: "datum", antwort: null, anzahl: 3 },
  { kategorie: "frist-februar", typ: "datum", antwort: null, anzahl: 1 },
  { kategorie: "frist-193-verschiebung", typ: "ja-nein", antwort: "ja", anzahl: 2 },
  { kategorie: "frist-193-verschiebung", typ: "ja-nein", antwort: "nein", anzahl: 1 },
  { kategorie: "frist-abrechnung-gewahrt", typ: "ja-nein", antwort: "ja", anzahl: 1 },
  { kategorie: "frist-abrechnung-gewahrt", typ: "ja-nein", antwort: "nein", anzahl: 2 },
  { kategorie: "frist-einwendung-gewahrt", typ: "ja-nein", antwort: "ja", anzahl: 1 },
  { kategorie: "frist-einwendung-gewahrt", typ: "ja-nein", antwort: "nein", anzahl: 2 },
  { kategorie: "frist-februar", typ: "ja-nein", antwort: "ja", anzahl: 1 },
];

const AUSWAHL_VERFAHREN = "Je Kontingent (Kategorie, Antworttyp, bei Ja/Nein auch Antwort) "
  + "die Gruppe nach ID sortieren und die Positionen round(i*(n-1)/(k-1)) nehmen, "
  + "i = 0..k-1; bei k = 1 die Mitte floor((n-1)/2). Kein Zufall.";

function waehleFragen(alle) {
  const auswahl = [];
  for (const k of KONTINGENT) {
    const gruppe = alle
      .filter((f) => f.kategorie === k.kategorie && f.antwort_typ === k.typ
        && (k.antwort === null || f.antwort === k.antwort))
      .sort((a, b) => (a.id < b.id ? -1 : 1));
    if (gruppe.length < k.anzahl) {
      throw new Error(`Kontingent ${k.kategorie}/${k.typ}/${k.antwort}: nur ${gruppe.length} Fragen`);
    }
    const positionen = k.anzahl === 1
      ? [Math.floor((gruppe.length - 1) / 2)]
      : Array.from({ length: k.anzahl }, (_, i) => Math.round(i * (gruppe.length - 1) / (k.anzahl - 1)));
    for (const p of positionen) auswahl.push(gruppe[p]);
  }
  return auswahl;
}

// Jede Nachricht muss ohne ihre Frage exakt die Vorlage ihres Antworttyps sein.
function pruefeVorlagen(fragen) {
  const probleme = [];
  for (const f of fragen) {
    if (!FORMATZEILE[f.antwort_typ]) { probleme.push(`${f.id}: unbekannter Antworttyp`); continue; }
    const nachricht = baueNachricht(f);
    if (!nachricht.startsWith(f.frage)) probleme.push(`${f.id}: Frage nicht unveraendert am Anfang`);
    if (nachricht.slice(f.frage.length) !== `\n\n${FORMATZEILE[f.antwort_typ]}`) {
      probleme.push(`${f.id}: weicht von der Vorlage ab`);
    }
    if (/ANTWORT:/.test(f.frage)) probleme.push(`${f.id}: Frage enthaelt schon eine Formatzeile`);
  }
  return probleme;
}

// ---------------------------------------------------------------------------
// Hilfen
// ---------------------------------------------------------------------------

function argument(name) {
  const i = process.argv.indexOf(name);
  return i === -1 ? null : (process.argv[i + 1] || null);
}

function lokalesDatum() {
  const d = new Date();
  const zwei = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${zwei(d.getMonth() + 1)}-${zwei(d.getDate())}`;
}

function gitCommit() {
  try {
    return execSync("git rev-parse HEAD", { cwd: HIER, encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

function abbruch(text) {
  console.error(`${LOG} Abbruch: ${text}`);
  process.exit(1);
}

// Die Datei wird nach JEDER Antwort neu geschrieben. Bricht der Lauf mittendrin ab,
// bleibt das bis dahin Gelieferte als Beweisstueck erhalten - mit status "laeuft".
function schreibe(pfad, daten) {
  fs.writeFileSync(pfad, JSON.stringify(daten, null, 2) + "\n", "utf8");
}

// ---------------------------------------------------------------------------

async function main() {
  const modellId = argument("--modell");
  const ausfuehren = process.argv.includes("--ausfuehren");
  if (!modellId) abbruch("--modell fehlt. Bekannt: " + Object.keys(MODELLE).join(", "));
  const modell = MODELLE[modellId];
  if (!modell) abbruch(`Unbekanntes Modell "${modellId}". Bekannt: ${Object.keys(MODELLE).join(", ")}`);

  const rohdaten = fs.readFileSync(FRAGEN_PFAD);
  const alle = JSON.parse(rohdaten.toString("utf8"));
  const fragen = waehleFragen(alle);

  const probleme = pruefeVorlagen(fragen);
  if (probleme.length > 0) abbruch("Vorlagenpruefung: " + probleme.join(" | "));

  const zielPfad = path.join(ERGEBNIS_VERZEICHNIS, `${lokalesDatum()}-${modellId}.json`);
  const ja = fragen.filter((f) => f.antwort === "ja").length;
  const nein = fragen.filter((f) => f.antwort === "nein").length;

  console.log(`${LOG} Modell: ${modellId} (${modell.anbieter}), freigegeben: ${modell.freigegeben}`);
  console.log(`${LOG} Parameter: ${JSON.stringify(modell.parameter)}`);
  console.log(`${LOG} Auswahl: ${fragen.length} Fragen, ${fragen.length - ja - nein} Datum, `
    + `${ja} ja, ${nein} nein, ${fragen.filter((f) => f.kategorie === "frist-193-verschiebung").length} aus frist-193-verschiebung`);
  console.log(`${LOG} Vorlagenpruefung: bestanden`);
  console.log(`${LOG} Zieldatei: ${path.relative(process.cwd(), zielPfad)}`
    + (fs.existsSync(zielPfad) ? " - EXISTIERT BEREITS" : ""));
  console.log(`${LOG} ${SCHLUESSEL_VARIABLE} gesetzt: ${process.env[SCHLUESSEL_VARIABLE] ? "ja" : "nein"}`);

  if (!ausfuehren) {
    console.log(`${LOG} TROCKENLAUF - keine Anfrage gesendet. Nachrichten, wie sie gesendet wuerden:`);
    for (const f of fragen) {
      console.log(`\n--- ${f.id}\n${baueNachricht(f)}`);
    }
    return;
  }

  // Ab hier: echter Lauf. Jede Voraussetzung wird VOR der ersten Anfrage geprueft.
  if (!modell.freigegeben) abbruch(`Die Konfiguration fuer ${modellId} ist nicht freigegeben.`);
  const schluessel = process.env[SCHLUESSEL_VARIABLE];
  if (!schluessel) abbruch(`${SCHLUESSEL_VARIABLE} ist nicht gesetzt.`);
  if (fs.existsSync(zielPfad)) abbruch(`${zielPfad} existiert bereits - wird nicht ueberschrieben.`);
  fs.mkdirSync(ERGEBNIS_VERZEICHNIS, { recursive: true });

  // authToken ausdruecklich null: sonst koennte das SDK zusaetzlich einen Token aus der
  // Umgebung mitschicken, und es waere wieder unklar, womit gefragt wurde.
  const client = new Anthropic({ apiKey: schluessel, authToken: null });

  const ergebnis = {
    lauf: "testlauf",
    status: "laeuft",
    gestartet: new Date().toISOString(),
    beendet: null,
    modell: {
      angefragt: modellId,
      anbieter: modell.anbieter,
      info: null,
    },
    konfiguration: {
      parameter: modell.parameter,
      systemprompt: null,
      fallbacks: null,
      anmerkung: modell.anmerkung,
    },
    vorlagen: FORMATZEILE,
    nachrichtenaufbau: "<frage unveraendert>\\n\\n<formatzeile des antworttyps>",
    auswahl: { verfahren: AUSWAHL_VERFAHREN, kontingent: KONTINGENT },
    herkunft: {
      fragendatei: path.relative(path.resolve(HIER, ".."), FRAGEN_PFAD).replace(/\\/g, "/"),
      fragendatei_sha256: crypto.createHash("sha256").update(rohdaten).digest("hex"),
      git_commit: gitCommit(),
      sdk: `@anthropic-ai/sdk ${JSON.parse(fs.readFileSync(SDK_PAKET, "utf8")).version}`,
      node: process.version,
    },
    antworten: [],
  };

  try {
    const info = await client.models.retrieve(modellId);
    ergebnis.modell.info = { id: info.id, display_name: info.display_name, created_at: info.created_at };
    console.log(`${LOG} Modellinfo abgerufen: ${info.display_name}`);
  } catch (fehler) {
    ergebnis.modell.info = { fehler: fehler instanceof Anthropic.APIError
      ? { status: fehler.status, typ: fehler.name, meldung: fehler.message }
      : { typ: "unbekannt", meldung: String(fehler) } };
    console.error(`${LOG} Modellinfo nicht abrufbar:`, fehler.message);
  }
  schreibe(zielPfad, ergebnis);

  for (const [nr, f] of fragen.entries()) {
    const nachricht = baueNachricht(f);
    const eintrag = { frage_id: f.id, nachricht, gesendet: new Date().toISOString() };
    try {
      const stream = client.messages.stream({
        model: modellId,
        ...modell.parameter,
        messages: [{ role: "user", content: nachricht }],
      });
      const antwort = await stream.finalMessage();
      Object.assign(eintrag, {
        antwort_id: antwort.id,
        modell_laut_antwort: antwort.model,
        stop_reason: antwort.stop_reason,
        stop_details: antwort.stop_details ?? null,
        // Abgeschnitten ist keine Bewertung, sondern eine Tatsache der Antwort:
        // Der Scorer wertet solche Antworten nicht.
        abgeschnitten: antwort.stop_reason === "max_tokens",
        roh_antwort: antwort.content.filter((b) => b.type === "text").map((b) => b.text).join(""),
        content: antwort.content,
        usage: antwort.usage,
      });
      console.log(`${LOG} ${nr + 1}/${fragen.length} ${f.id}: stop_reason ${antwort.stop_reason}, `
        + `${antwort.usage.output_tokens} Ausgabe-Token`);
    } catch (fehler) {
      eintrag.fehler = fehler instanceof Anthropic.APIError
        ? { status: fehler.status, typ: fehler.name, meldung: fehler.message }
        : { typ: "unbekannt", meldung: String(fehler) };
      console.error(`${LOG} ${nr + 1}/${fragen.length} ${f.id}: FEHLER`, eintrag.fehler);
    }
    ergebnis.antworten.push(eintrag);
    schreibe(zielPfad, ergebnis);
  }

  ergebnis.status = "abgeschlossen";
  ergebnis.beendet = new Date().toISOString();
  schreibe(zielPfad, ergebnis);

  const fehlerAnzahl = ergebnis.antworten.filter((a) => a.fehler).length;
  const abgeschnitten = ergebnis.antworten.filter((a) => a.abgeschnitten).length;
  console.log(`${LOG} Fertig: ${ergebnis.antworten.length} Eintraege, ${fehlerAnzahl} Fehler, `
    + `${abgeschnitten} abgeschnitten. Datei: ${path.relative(process.cwd(), zielPfad)}`);
}

main().catch((fehler) => {
  console.error(`${LOG} Unerwarteter Fehler:`, fehler);
  process.exit(1);
});
