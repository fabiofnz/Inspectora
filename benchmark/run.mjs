// benchmark/run.mjs
// Stellt Benchmark-Fragen an ein Modell und speichert die Antworten WORTWOERTLICH.
//
// Aufruf (ohne --ausfuehren immer Trockenlauf, keine Anfrage, keine Kosten):
//   node benchmark/run.mjs --modell claude-sonnet-5 --fragen fristen
//       Testauswahl (20 feste Fragen, nur fristen)
//   node benchmark/run.mjs --modell claude-sonnet-5 --fragen umlage --voll
//       alle Fragen der Fragendatei
//   node benchmark/run.mjs --modell claude-sonnet-5 --fragen fristen --voll --ausfuehren --kostenlimit 15
//       echter Lauf, kostet Geld. --kostenlimit (USD, geschaetzt) ist bei --voll Pflicht.
//   node benchmark/run.mjs --modell claude-sonnet-5 --fragen fristen --voll --ausfuehren --kostenlimit 15 \
//       --fortsetzen benchmark/ergebnisse/2026-09-14-claude-sonnet-5-fristen-voll.json
//       setzt einen abgebrochenen Lauf fort
//   node benchmark/run.mjs --modell claude-sonnet-5 --fragen fristen --voll --ausfuehren --kostenlimit 8 --lauf 2
//       Wiederholungslauf mit Nummer: Datei ...-fristen-voll-lauf2.json, lauf_nummer 2 in der Datei
//
// Laeuft nur lokal, nie auf Netlify. Der Schluessel kommt ausschliesslich aus der
// Umgebungsvariablen BENCHMARK_ANTHROPIC_API_KEY - es gibt keinen Rueckfall auf andere
// Zugangsdaten (z.B. ein "ant auth login"-Profil), sonst waere unklar, welches Konto
// bezahlt hat.
//
// Dieses Skript INTERPRETIERT NICHTS und BEWERTET NICHTS. Es zieht nicht einmal die
// "ANTWORT:"-Zeile aus der Antwort - das ist Aufgabe des Scorers. Die Ergebnisdatei ist
// das Beweisstueck; was darin steht, ist genau das, was die API geliefert hat. Auch der
// Zwischenstand zeigt nur Tatsachen der Antworten (stop_reason, Token), keine Wertung.
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
//   - Eine Anfrage nach der anderen, nie parallel - gleiche Bedingungen wie im Testlauf.
//
// ---------------------------------------------------------------------------
// REIHENFOLGE (nur --voll) - fest, kein Zufall
// ---------------------------------------------------------------------------
//   - In Dateireihenfolge laege z.B. jede der 19 Ausschlussfragen im letzten Fuenftel des
//     umlage-Laufs, und die fristen-Fragen stuenden nach Jahren sortiert. Eine Schwankung der
//     API waehrend eines Abschnitts traefe dann eine ganze Kategorie am Stueck.
//   - Deshalb verzahnt: Gruppen wie im Testlauf-Kontingent (Kategorie, Antworttyp, bei Ja/Nein
//     auch Antwort), jede Gruppe gleichmaessig ueber den ganzen Lauf verteilt. Verfahren siehe
//     REIHENFOLGE_VERFAHREN - es haengt nur an den Frage-IDs, nicht an Dateireihenfolge oder Datum.
//   - Die Ergebnisdatei enthaelt das Verfahren und reihenfolge_sha256 (SHA-256 der ID-Liste in
//     Frage-Reihenfolge). --fortsetzen bricht ab, wenn beides nicht exakt passt.
//   - Der Testlauf behaelt die Reihenfolge seiner Kontingente - er ist gelaufen, und sein
//     Ergebnis soll zu seinem Commit passen.
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
//
// ---------------------------------------------------------------------------
// ABBRUCH, FEHLER, FORTSETZUNG
// ---------------------------------------------------------------------------
//   - Die Ergebnisdatei wird nach JEDER Antwort neu geschrieben. Was gelaufen ist, bleibt.
//   - Strg+C: Der Lauf endet nach der Antwort, die gerade laeuft (status "abgebrochen").
//     Ein zweites Strg+C bricht sofort ab - die laufende Antwort fehlt dann.
//   - Kostenlimit erreicht: Vor der naechsten Frage Schluss, status "abgebrochen".
//   - API-Fehler: Das SDK wiederholt eine Anfrage selbst bis zu zweimal (gleiches Modell).
//     Scheitert sie trotzdem, bleibt ein fehler-Eintrag stehen. Es gibt KEINE weitere
//     Wiederholung - auch --fortsetzen laesst diese Fragen unangetastet. Ein spaeterer
//     Versuch waere ein zweiter Wurf unter anderen Bedingungen; ihn still als "die"
//     Antwort zu speichern, waere eine stille Auswahl.
//   - Fehler-Serie: Ein einzelner fehler-Eintrag beendet den Lauf nicht (normales API-Rauschen).
//     Drei fehler-Eintraege in Folge sind eine Stoerung: Der Lauf endet sofort mit status
//     "abgebrochen", grund "API-Fehler-Serie". Jede erfolgreiche Antwort setzt den Zaehler
//     zurueck. So gehen bei einem Ausfall hoechstens drei Fragen verloren, der Rest bleibt
//     fuer --fortsetzen offen.
//   - --fortsetzen fragt nur Fragen ohne jeden Eintrag. Vorher muessen Modell, Parameter,
//     Vorlagen, Laufart, Fragendatei und ihr SHA-256 exakt zum urspruenglichen Lauf passen.
//     Jede Fortsetzung wird in der Datei unter "fortsetzungen" vermerkt.
//   - Ein echter Lauf startet nur, wenn benchmark/run.mjs committet ist - sonst bezeichnet
//     git_commit nicht den Code, der gelaufen ist.
//
// ---------------------------------------------------------------------------
// LAUF-NUMMER (nur --voll)
// ---------------------------------------------------------------------------
//   - Veroeffentlicht wird die Spanne ueber mehrere Laeufe je Modell und Fragendatei. Welcher
//     Lauf welcher ist, gehoert zum Messgegenstand - deshalb eine Nummer, kein freier Text.
//   - --lauf <n> (ganze Zahl ab 1) haengt "-lauf<n>" an den Dateinamen und steht als
//     lauf_nummer in der Ergebnisdatei. Ohne --lauf ist lauf_nummer null.
//   - Die Laeufe vom 15.09.2026 haben keine Nummer, sie sind Lauf 1 (siehe benchmark/PLAN.md).
//   - --fortsetzen bricht ab, wenn --lauf nicht zur lauf_nummer der Datei passt.

"use strict";

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execSync } from "node:child_process";
import { isDeepStrictEqual } from "node:util";
import { fileURLToPath } from "node:url";

import Anthropic from "@anthropic-ai/sdk";

const LOG = "[run]";
const HIER = path.dirname(fileURLToPath(import.meta.url));
const WURZEL = path.resolve(HIER, "..");
const ERGEBNIS_VERZEICHNIS = path.resolve(HIER, "ergebnisse");
const SDK_PAKET = path.resolve(HIER, "../node_modules/@anthropic-ai/sdk/package.json");
const SCHLUESSEL_VARIABLE = "BENCHMARK_ANTHROPIC_API_KEY";

const FRAGENDATEIEN = {
  fristen: "fragen-fristen.json",
  umlage: "fragen-umlage.json",
};

const ZWISCHENSTAND_ALLE = 25;
const FEHLER_SERIE_LIMIT = 3;

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
    // Nur fuer Zwischenstand und Kostenlimit - eine Schaetzung, keine Abrechnung.
    // Wird nicht an die API geschickt.
    preis_usd_pro_mio_token: { input: 2, output: 10 },
  },
};

// ---------------------------------------------------------------------------
// Frage und Vorlage
// ---------------------------------------------------------------------------

const FORMATZEILE = {
  "datum": "Letzte Zeile deiner Antwort genau in dieser Form: ANTWORT: TT.MM.JJJJ",
  "ja-nein": "Letzte Zeile deiner Antwort genau in dieser Form: ANTWORT: ja oder ANTWORT: nein",
};

const NACHRICHTENAUFBAU = "<frage unveraendert>\\n\\n<formatzeile des antworttyps>";

const baueNachricht = (frage) => `${frage.frage}\n\n${FORMATZEILE[frage.antwort_typ]}`;

// ---------------------------------------------------------------------------
// Feste Auswahl fuer den Testlauf - kein Zufall
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

const AUSWAHL_VERFAHREN_VOLL = "Alle Fragen der Fragendatei. Keine Auswahl.";

// ---------------------------------------------------------------------------
// Feste Reihenfolge fuer volle Laeufe - kein Zufall
// ---------------------------------------------------------------------------

const REIHENFOLGE_GRUPPIERUNG = "Kategorie, Antworttyp, bei Ja/Nein auch Antwort";

const REIHENFOLGE_VERFAHREN = "Verzahnt. 1. Gruppen bilden nach (Kategorie, Antworttyp, bei Ja/Nein "
  + "auch Antwort). 2. In jeder Gruppe nach SHA-256 der Frage-ID (UTF-8, hex) aufsteigend sortieren. "
  + "3. Frage j (j = 0..n-1) einer Gruppe mit n Fragen erhaelt die Position (j + 0,5) / n. "
  + "4. Alle Fragen nach Position aufsteigend sortieren, bei gleicher Position nach SHA-256 der "
  + "Frage-ID. Haengt nur an den IDs - nicht an Dateireihenfolge, Datum oder Zufall.";

const TESTLAUF_REIHENFOLGE = "Reihenfolge der Testauswahl: Kontingente nacheinander, wie in KONTINGENT.";

const gruppenSchluessel = (f) => `${f.kategorie} | ${f.antwort_typ}`
  + (f.antwort_typ === "ja-nein" ? ` | ${f.antwort}` : "");

function ordneFragen(alle) {
  const hash = new Map(alle.map((f) => [f.id, sha256(Buffer.from(f.id, "utf8"))]));
  const nachHash = (a, b) => (hash.get(a.id) < hash.get(b.id) ? -1 : hash.get(a.id) > hash.get(b.id) ? 1 : 0);
  const gruppen = new Map();
  for (const f of alle) {
    const k = gruppenSchluessel(f);
    if (!gruppen.has(k)) gruppen.set(k, []);
    gruppen.get(k).push(f);
  }
  const platziert = [];
  for (const gruppe of gruppen.values()) {
    gruppe.sort(nachHash);
    gruppe.forEach((f, j) => platziert.push({ f, position: (j + 0.5) / gruppe.length }));
  }
  platziert.sort((a, b) => a.position - b.position || nachHash(a.f, b.f));
  return platziert.map((x) => x.f);
}

// SHA-256 der ID-Liste in Frage-Reihenfolge, IDs mit "\n" verbunden.
const reihenfolgeHash = (fragen) => sha256(Buffer.from(fragen.map((f) => f.id).join("\n"), "utf8"));

// Anteil jeder Gruppe je Fuenftel des Laufs - nur zur Anzeige im Trockenlauf.
function verteilungJeFuenftel(fragen) {
  const v = {};
  fragen.forEach((f, i) => {
    const k = gruppenSchluessel(f);
    v[k] ??= [0, 0, 0, 0, 0];
    v[k][Math.floor(i * 5 / fragen.length)]++;
  });
  return v;
}

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
  const ids = new Set();
  for (const f of fragen) {
    if (ids.has(f.id)) probleme.push(`${f.id}: doppelt`);
    ids.add(f.id);
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

// Eine Fortsetzung muss exakt der urspruengliche Lauf sein - sonst stuenden Antworten
// unter verschiedenen Bedingungen in einer Datei.
function pruefeFortsetzung(ergebnis, soll) {
  if (!Array.isArray(ergebnis.antworten)) return ["Datei ohne antworten-Liste"];
  const p = [];
  if (ergebnis.status === "abgeschlossen") p.push("Lauf ist bereits abgeschlossen");
  if (ergebnis.lauf !== soll.laufArt) p.push(`Laufart "${ergebnis.lauf}", angefragt "${soll.laufArt}"`);
  if ((ergebnis.lauf_nummer ?? null) !== soll.laufNummer) {
    p.push(`Lauf-Nummer ${ergebnis.lauf_nummer ?? "keine"}, angefragt ${soll.laufNummer ?? "keine"}`);
  }
  if (ergebnis.modell?.angefragt !== soll.modellId) {
    p.push(`Modell "${ergebnis.modell?.angefragt}", angefragt "${soll.modellId}"`);
  }
  if (!isDeepStrictEqual(ergebnis.konfiguration?.parameter, soll.parameter)) p.push("Parameter weichen ab");
  if (ergebnis.konfiguration?.systemprompt !== null) p.push("systemprompt weicht ab");
  if (ergebnis.konfiguration?.fallbacks !== null) p.push("fallbacks weichen ab");
  if (!isDeepStrictEqual(ergebnis.vorlagen, FORMATZEILE)) p.push("Vorlagen weichen ab");
  if (ergebnis.nachrichtenaufbau !== NACHRICHTENAUFBAU) p.push("Nachrichtenaufbau weicht ab");
  if (soll.laufArt === "testlauf" && !isDeepStrictEqual(ergebnis.auswahl?.kontingent, KONTINGENT)) {
    p.push("Kontingent der Testauswahl weicht ab");
  }
  if (ergebnis.reihenfolge?.verfahren !== soll.reihenfolgeVerfahren) p.push("Reihenfolge-Verfahren weicht ab");
  if (ergebnis.reihenfolge?.reihenfolge_sha256 !== soll.reihenfolgeSha) {
    p.push(`reihenfolge_sha256 "${ergebnis.reihenfolge?.reihenfolge_sha256}", berechnet "${soll.reihenfolgeSha}"`);
  }
  if (ergebnis.herkunft?.fragendatei !== soll.fragendatei) {
    p.push(`Fragendatei "${ergebnis.herkunft?.fragendatei}", angefragt "${soll.fragendatei}"`);
  }
  if (ergebnis.herkunft?.fragendatei_sha256 !== soll.fragenHash) p.push("SHA-256 der Fragendatei weicht ab");

  const nachId = new Map(soll.fragen.map((f) => [f.id, f]));
  const gesehen = new Set();
  for (const a of ergebnis.antworten) {
    const f = nachId.get(a.frage_id);
    if (!f) { p.push(`${a.frage_id}: nicht in der Auswahl`); continue; }
    if (gesehen.has(a.frage_id)) p.push(`${a.frage_id}: doppelt`);
    gesehen.add(a.frage_id);
    if (a.nachricht !== baueNachricht(f)) p.push(`${a.frage_id}: gespeicherte Nachricht weicht ab`);
  }
  return p;
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
    return execSync("git rev-parse HEAD", { cwd: HIER, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
}

// true nur, wenn git laeuft und run.mjs keine uncommitteten Aenderungen hat.
function runMjsCommittet() {
  try {
    const status = execSync("git status --porcelain -- run.mjs", {
      cwd: HIER, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"],
    });
    return status.trim() === "";
  } catch {
    return false;
  }
}

const sha256 = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");

function dauerText(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

// Geschaetzte Kosten aus usage. Keine Abrechnung - die steht nur im Konto.
function kostenAus(antworten, preis) {
  let usd = 0;
  for (const a of antworten) {
    const u = a.usage;
    if (!u) continue;
    const input = (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0);
    usd += (input * preis.input + (u.output_tokens ?? 0) * preis.output) / 1e6;
  }
  return usd;
}

const usdText = (usd) => `~$${usd.toFixed(2)}`;

// Alles, was waehrend eines echten Laufs gemeldet wird, geht auch in die .log-Datei.
let logPfad = null;
function melde(text) {
  console.log(text);
  if (logPfad) fs.appendFileSync(logPfad, text + "\n", "utf8");
}
function meldeFehler(text) {
  console.error(text);
  if (logPfad) fs.appendFileSync(logPfad, text + "\n", "utf8");
}

function abbruch(text) {
  meldeFehler(`${LOG} Abbruch: ${text}`);
  process.exit(1);
}

function schreibe(pfad, daten) {
  fs.writeFileSync(pfad, JSON.stringify(daten, null, 2) + "\n", "utf8");
}

function fehlerAus(fehler) {
  return fehler instanceof Anthropic.APIError
    ? { status: fehler.status, typ: fehler.name, meldung: fehler.message }
    : { typ: "unbekannt", meldung: String(fehler) };
}

// Laufender echter Lauf - fuer Strg+C und unerwartete Fehler.
let laufend = null;
let stopAngefordert = false;

function beende(status, abbruchInfo = null) {
  laufend.ergebnis.status = status;
  laufend.ergebnis.beendet = new Date().toISOString();
  laufend.ergebnis.abbruch = abbruchInfo;
  schreibe(laufend.pfad, laufend.ergebnis);
}

// ---------------------------------------------------------------------------

async function main() {
  const modellId = argument("--modell");
  const fragenName = argument("--fragen");
  const voll = process.argv.includes("--voll");
  const ausfuehren = process.argv.includes("--ausfuehren");
  const fortsetzenArg = argument("--fortsetzen");
  const kostenlimitArg = argument("--kostenlimit");

  if (!modellId) abbruch("--modell fehlt. Bekannt: " + Object.keys(MODELLE).join(", "));
  const modell = MODELLE[modellId];
  if (!modell) abbruch(`Unbekanntes Modell "${modellId}". Bekannt: ${Object.keys(MODELLE).join(", ")}`);
  if (!FRAGENDATEIEN[fragenName]) abbruch(`--fragen fehlt oder unbekannt. Bekannt: ${Object.keys(FRAGENDATEIEN).join(", ")}`);
  const kostenlimit = kostenlimitArg === null ? null : Number(kostenlimitArg);
  if (kostenlimitArg !== null && !(kostenlimit > 0)) abbruch(`--kostenlimit "${kostenlimitArg}" ist keine positive Zahl.`);
  const laufArg = argument("--lauf");
  if (process.argv.includes("--lauf") && !/^[1-9][0-9]*$/.test(laufArg ?? "")) {
    abbruch(`--lauf "${laufArg ?? ""}" ist keine ganze Zahl ab 1.`);
  }
  const laufNummer = laufArg === null ? null : Number(laufArg);
  if (laufNummer !== null && !voll) abbruch("--lauf gibt es nur mit --voll.");

  const fragenPfad = path.resolve(HIER, FRAGENDATEIEN[fragenName]);
  const fragendateiRelativ = path.relative(WURZEL, fragenPfad).replace(/\\/g, "/");
  const rohdaten = fs.readFileSync(fragenPfad);
  const fragenHash = sha256(rohdaten);
  const alle = JSON.parse(rohdaten.toString("utf8"));

  if (!voll && fragenName !== "fristen") abbruch("Eine Testauswahl gibt es nur fuer fristen. Fuer umlage: --voll.");
  const laufArt = voll ? "voll" : "testlauf";
  const fragen = voll ? ordneFragen(alle) : waehleFragen(alle);
  const reihenfolgeVerfahren = voll ? REIHENFOLGE_VERFAHREN : TESTLAUF_REIHENFOLGE;
  const reihenfolgeSha = reihenfolgeHash(fragen);

  const probleme = pruefeVorlagen(fragen);
  if (probleme.length > 0) abbruch("Vorlagenpruefung: " + probleme.join(" | "));

  let zielPfad;
  let bestehend = null;
  let offen = fragen;
  if (fortsetzenArg) {
    zielPfad = path.resolve(fortsetzenArg);
    if (!fs.existsSync(zielPfad)) abbruch(`${fortsetzenArg} existiert nicht.`);
    bestehend = JSON.parse(fs.readFileSync(zielPfad, "utf8"));
    const p = pruefeFortsetzung(bestehend, {
      laufArt, modellId, parameter: modell.parameter, fragendatei: fragendateiRelativ, fragenHash, fragen,
      reihenfolgeVerfahren, reihenfolgeSha, laufNummer,
    });
    if (p.length > 0) abbruch("Fortsetzung nicht moeglich: " + p.join(" | "));
    const vorhanden = new Set(bestehend.antworten.map((a) => a.frage_id));
    offen = fragen.filter((f) => !vorhanden.has(f.id));
  } else {
    zielPfad = path.join(ERGEBNIS_VERZEICHNIS,
      `${lokalesDatum()}-${modellId}-${fragenName}-${voll ? "voll" : "test"}`
      + `${laufNummer === null ? "" : `-lauf${laufNummer}`}.json`);
  }

  const anzahl = (filter) => fragen.filter(filter).length;
  const kategorien = {};
  for (const f of fragen) kategorien[`${f.kategorie} | ${f.antwort_typ}`] = (kategorien[`${f.kategorie} | ${f.antwort_typ}`] ?? 0) + 1;

  console.log(`${LOG} Modell: ${modellId} (${modell.anbieter}), freigegeben: ${modell.freigegeben}`);
  console.log(`${LOG} Parameter: ${JSON.stringify(modell.parameter)}`);
  console.log(`${LOG} Fragendatei: ${fragendateiRelativ}, SHA-256 ${fragenHash}`);
  console.log(`${LOG} Lauf-Nummer: ${laufNummer ?? "keine"}`);
  console.log(`${LOG} Lauf: ${laufArt}, ${fragen.length} Fragen:${anzahl((f) => f.antwort_typ === "datum")} Datum, `
    + `${anzahl((f) => f.antwort === "ja")} ja, ${anzahl((f) => f.antwort === "nein")} nein`);
  for (const [k, n] of Object.entries(kategorien)) console.log(`${LOG}   ${k}: ${n}`);
  console.log(`${LOG} Vorlagenpruefung: bestanden (${fragen.length} Nachrichten)`);
  console.log(`${LOG} Reihenfolge: ${voll ? "verzahnt" : "Testauswahl"}, reihenfolge_sha256 ${reihenfolgeSha}`);
  if (voll) {
    console.log(`${LOG} Verteilung je Fuenftel des Laufs (Gruppe: 1. 2. 3. 4. 5. Fuenftel):`);
    for (const [k, v] of Object.entries(verteilungJeFuenftel(fragen))) console.log(`${LOG}   ${k}: ${v.join(" ")}`);
  }
  console.log(`${LOG} Zieldatei: ${path.relative(process.cwd(), zielPfad)}`
    + (!bestehend && fs.existsSync(zielPfad) ? " - EXISTIERT BEREITS" : ""));
  if (bestehend) {
    const fehlerEintraege = bestehend.antworten.filter((a) => a.fehler).length;
    console.log(`${LOG} Fortsetzung: ${bestehend.antworten.length} Eintraege vorhanden (davon ${fehlerEintraege} `
      + `fehler - bleiben unangetastet), ${offen.length} offen, bisheriger Status "${bestehend.status}"`);
  }
  console.log(`${LOG} Kostenlimit: ${kostenlimit === null ? "keins" : `$${kostenlimit}`}`);
  console.log(`${LOG} ${SCHLUESSEL_VARIABLE} gesetzt: ${process.env[SCHLUESSEL_VARIABLE] ? "ja" : "nein"}`);
  console.log(`${LOG} run.mjs committet: ${runMjsCommittet() ? "ja" : "nein"}`);

  if (!ausfuehren) {
    if (bestehend) {
      console.log(`${LOG} TROCKENLAUF - keine Anfrage gesendet. Offene Fragen, wie sie gefragt wuerden:`);
      for (const f of offen) console.log(`  ${f.id}`);
      return;
    }
    const zeigen = fragen.length <= 50 ? fragen : fragen.slice(0, 3);
    console.log(`${LOG} TROCKENLAUF - keine Anfrage gesendet. Nachrichten, wie sie gesendet wuerden`
      + (zeigen.length < fragen.length ? ` (die ersten ${zeigen.length} von ${fragen.length}; geprueft sind alle):` : ":"));
    for (const f of zeigen) console.log(`\n--- ${f.id}\n${baueNachricht(f)}`);
    return;
  }

  // Ab hier: echter Lauf. Jede Voraussetzung wird VOR der ersten Anfrage geprueft.
  if (!modell.freigegeben) abbruch(`Die Konfiguration fuer ${modellId} ist nicht freigegeben.`);
  if (voll && kostenlimit === null) abbruch("--kostenlimit fehlt. Bei --voll ist es Pflicht.");
  const schluessel = process.env[SCHLUESSEL_VARIABLE];
  if (!schluessel) abbruch(`${SCHLUESSEL_VARIABLE} ist nicht gesetzt.`);
  if (!runMjsCommittet()) {
    abbruch("benchmark/run.mjs hat nicht committete Aenderungen - git_commit wuerde nicht den Code bezeichnen, der laeuft.");
  }
  if (!bestehend && fs.existsSync(zielPfad)) abbruch(`${zielPfad} existiert bereits - wird nicht ueberschrieben.`);
  if (offen.length === 0) {
    console.log(`${LOG} Keine offenen Fragen - nichts zu tun. Datei unveraendert.`);
    return;
  }
  fs.mkdirSync(ERGEBNIS_VERZEICHNIS, { recursive: true });
  logPfad = zielPfad.replace(/\.json$/, ".log");

  // authToken ausdruecklich null: sonst koennte das SDK zusaetzlich einen Token aus der
  // Umgebung mitschicken, und es waere wieder unklar, womit gefragt wurde.
  const client = new Anthropic({ apiKey: schluessel, authToken: null });
  const sdkVersion = `@anthropic-ai/sdk ${JSON.parse(fs.readFileSync(SDK_PAKET, "utf8")).version}`;
  const commit = gitCommit();
  const jetzt = new Date().toISOString();

  let ergebnis;
  if (bestehend) {
    ergebnis = bestehend;
    if (ergebnis.herkunft.git_commit !== commit) {
      melde(`${LOG} HINWEIS: Urspruenglicher Lauf auf Commit ${ergebnis.herkunft.git_commit}, Fortsetzung auf ${commit}. `
        + "Wird in der Datei vermerkt.");
    }
    ergebnis.fortsetzungen ??= [];
    ergebnis.fortsetzungen.push({
      gestartet: jetzt,
      vorheriger_status: ergebnis.status,
      vorheriger_abbruch: ergebnis.abbruch ?? null,
      vorheriges_ende: ergebnis.beendet ?? null,
      eintraege_vor_start: ergebnis.antworten.length,
      offen_vor_start: offen.length,
      git_commit: commit,
      run_mjs_committet: true,
      sdk: sdkVersion,
      node: process.version,
      kostenlimit_usd: kostenlimit,
    });
    ergebnis.status = "laeuft";
    ergebnis.beendet = null;
    ergebnis.abbruch = null;
  } else {
    ergebnis = {
      lauf: laufArt,
      lauf_nummer: laufNummer,
      status: "laeuft",
      gestartet: jetzt,
      beendet: null,
      abbruch: null,
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
      nachrichtenaufbau: NACHRICHTENAUFBAU,
      auswahl: voll
        ? { verfahren: AUSWAHL_VERFAHREN_VOLL, kontingent: null, anzahl: fragen.length }
        : { verfahren: AUSWAHL_VERFAHREN, kontingent: KONTINGENT },
      reihenfolge: {
        verfahren: reihenfolgeVerfahren,
        gruppierung: voll ? REIHENFOLGE_GRUPPIERUNG : null,
        reihenfolge_sha256: reihenfolgeSha,
        reihenfolge_sha256_verfahren: "SHA-256 (hex) der Frage-IDs in Frage-Reihenfolge, mit \"\\n\" verbunden, UTF-8",
      },
      steuerung: {
        reihenfolge: "nacheinander, keine parallelen Anfragen",
        fehler_serie: `Lauf endet nach ${FEHLER_SERIE_LIMIT} fehler-Eintraegen in Folge (grund "API-Fehler-Serie"); `
          + "jede erfolgreiche Antwort setzt den Zaehler zurueck",
        sdk_wiederholungen: "SDK-Standard: bis zu 2 Wiederholungen je Anfrage (gleiches Modell)",
        weitere_wiederholungen: "keine; fehler-Eintraege bleiben stehen, auch bei --fortsetzen",
        kostenlimit_usd: kostenlimit,
        preis_usd_pro_mio_token_schaetzung: modell.preis_usd_pro_mio_token,
      },
      herkunft: {
        fragendatei: fragendateiRelativ,
        fragendatei_sha256: fragenHash,
        git_commit: commit,
        run_mjs_committet: true,
        sdk: sdkVersion,
        node: process.version,
      },
      fortsetzungen: [],
      antworten: [],
    };
  }

  laufend = { pfad: zielPfad, ergebnis };
  schreibe(zielPfad, ergebnis);
  melde(`${LOG} Start ${jetzt}: ${offen.length} Fragen offen, Log: ${path.relative(process.cwd(), logPfad)}`);
  melde(`${LOG} Strg+C beendet den Lauf nach der aktuellen Antwort.`);

  if (!ergebnis.modell.info) {
    try {
      const info = await client.models.retrieve(modellId);
      ergebnis.modell.info = { id: info.id, display_name: info.display_name, created_at: info.created_at };
      melde(`${LOG} Modellinfo abgerufen: ${info.display_name}`);
    } catch (fehler) {
      ergebnis.modell.info = { fehler: fehlerAus(fehler) };
      meldeFehler(`${LOG} Modellinfo nicht abrufbar: ${fehler.message}`);
    }
    schreibe(zielPfad, ergebnis);
  }

  const preis = modell.preis_usd_pro_mio_token;
  const startMs = Date.now();
  let erledigt = 0;
  let fehlerInFolge = 0;

  for (const f of offen) {
    if (stopAngefordert) {
      beende("abgebrochen", { grund: "Strg+C", zeitpunkt: new Date().toISOString(),
        hinweis: "Nach der letzten gespeicherten Antwort beendet. Mit --fortsetzen weiterfuehren." });
      melde(`${LOG} Abgebrochen (Strg+C). ${ergebnis.antworten.length}/${fragen.length} gespeichert.`);
      return;
    }
    const bisherKosten = kostenAus(ergebnis.antworten, preis);
    if (kostenlimit !== null && bisherKosten >= kostenlimit) {
      beende("abgebrochen", { grund: "kostenlimit", zeitpunkt: new Date().toISOString(),
        kosten_usd_geschaetzt: Number(bisherKosten.toFixed(4)), kostenlimit_usd: kostenlimit });
      melde(`${LOG} Kostenlimit erreicht (${usdText(bisherKosten)} von $${kostenlimit}). `
        + `${ergebnis.antworten.length}/${fragen.length} gespeichert.`);
      return;
    }

    const eintrag = { frage_id: f.id, nachricht: baueNachricht(f), gesendet: new Date().toISOString() };
    let zeilenInfo;
    try {
      const stream = client.messages.stream({
        model: modellId,
        ...modell.parameter,
        messages: [{ role: "user", content: eintrag.nachricht }],
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
      zeilenInfo = `${antwort.stop_reason}, ${antwort.usage.output_tokens} Ausgabe-Token`;
    } catch (fehler) {
      eintrag.fehler = fehlerAus(fehler);
      zeilenInfo = `FEHLER ${JSON.stringify(eintrag.fehler)}`;
    }
    ergebnis.antworten.push(eintrag);
    schreibe(zielPfad, ergebnis);
    erledigt++;

    const vergangen = Date.now() - startMs;
    const verbleibend = (vergangen / erledigt) * (offen.length - erledigt);
    const zeile = `${LOG} ${ergebnis.antworten.length}/${fragen.length} ${f.id}: ${zeilenInfo} | `
      + `${dauerText(vergangen)} vergangen, ~${dauerText(verbleibend)} verbleibend | `
      + `${usdText(kostenAus(ergebnis.antworten, preis))} bisher`;
    if (eintrag.fehler) meldeFehler(zeile); else melde(zeile);

    fehlerInFolge = eintrag.fehler ? fehlerInFolge + 1 : 0;
    if (fehlerInFolge >= FEHLER_SERIE_LIMIT) {
      beende("abgebrochen", { grund: "API-Fehler-Serie", zeitpunkt: new Date().toISOString(),
        fehler_in_folge: fehlerInFolge,
        hinweis: `Die letzten ${fehlerInFolge} Eintraege sind fehler und bleiben stehen. `
          + "Offene Fragen mit --fortsetzen weiterfuehren." });
      meldeFehler(`${LOG} Abgebrochen: ${fehlerInFolge} API-Fehler in Folge. `
        + `${ergebnis.antworten.length}/${fragen.length} Eintraege gespeichert. Kein Neustart.`);
      return;
    }

    if (erledigt % ZWISCHENSTAND_ALLE === 0 && erledigt < offen.length) {
      const a = ergebnis.antworten;
      const stopReasons = {};
      for (const x of a) if (x.stop_reason) stopReasons[x.stop_reason] = (stopReasons[x.stop_reason] ?? 0) + 1;
      const ausgabeToken = a.reduce((s, x) => s + (x.usage?.output_tokens ?? 0), 0);
      melde(`${LOG} --- Zwischenstand ${a.length}/${fragen.length}: stop_reason ${JSON.stringify(stopReasons)}, `
        + `fehler ${a.filter((x) => x.fehler).length}, abgeschnitten ${a.filter((x) => x.abgeschnitten).length}, `
        + `${ausgabeToken} Ausgabe-Token, ${usdText(kostenAus(a, preis))} geschaetzt`);
    }
  }

  beende("abgeschlossen");
  const a = ergebnis.antworten;
  melde(`${LOG} Fertig: ${a.length}/${fragen.length} Eintraege, ${a.filter((x) => x.fehler).length} fehler, `
    + `${a.filter((x) => x.abgeschnitten).length} abgeschnitten, ${usdText(kostenAus(a, preis))} geschaetzt. `
    + `Datei: ${path.relative(process.cwd(), zielPfad)}`);
}

process.on("SIGINT", () => {
  if (!laufend) process.exit(130);
  if (!stopAngefordert) {
    stopAngefordert = true;
    melde(`${LOG} Strg+C: Der Lauf endet nach der aktuellen Antwort. Nochmal Strg+C bricht sofort ab.`);
    return;
  }
  beende("abgebrochen", { grund: "Strg+C sofort", zeitpunkt: new Date().toISOString(),
    hinweis: "Die Antwort, die gerade lief, fehlt. Mit --fortsetzen weiterfuehren." });
  meldeFehler(`${LOG} Sofort abgebrochen. ${laufend.ergebnis.antworten.length} Eintraege gespeichert.`);
  process.exit(130);
});

main().catch((fehler) => {
  meldeFehler(`${LOG} Unerwarteter Fehler: ${fehler?.stack ?? fehler}`);
  if (laufend) {
    beende("abgebrochen", { grund: "unerwarteter Fehler", zeitpunkt: new Date().toISOString(),
      meldung: String(fehler?.message ?? fehler) });
  }
  process.exit(1);
});
