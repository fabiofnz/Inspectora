#!/usr/bin/env node
// scripts/pruefe-wissensbasis.js
// Prueft wissensbasis/gesetze.json gegen wissensbasis/themen-mapping.json.
// Aufruf: npm run pruefe-wissensbasis   (Exit-Code != 0, sobald ein FEHLER auftritt)
//
// Hintergrund: gesetze.json ist ein Bauergebnis. import-gesetze.js erzeugt die Datei
// neu und stempelt die "themen" aus themen-mapping.json hinein. Der Assistent sucht
// zur Laufzeit in gesetze.json. Eine Zuordnung, die auf den falschen Paragraphen
// zeigt, faellt deshalb nirgends auf: Es steht ein echter Paragraph mit echtem
// Quell-Link im Kontext, nur eben der falsche.
//
// Dieses Skript ist bewusst breit angelegt. Es laeuft ohne Netzzugang und prueft
// nur die Konsistenz der beiden Dateien untereinander - NICHT, ob der gespeicherte
// Text noch der geltenden Fassung entspricht. Dafuer braeuchte es einen Abgleich
// gegen gesetze-im-internet.de.

"use strict";

const fs   = require("fs");
const path = require("path");

// Pfade sind ueberschreibbar, damit die Negativkontrolle gegen Kopien pruefen kann,
// statt die echten Dateien zu veraendern und wieder herzustellen. Ein Skript, das
// die Wissensbasis zum Testen kaputtmacht, waere genau die Sorte Risiko, die hier
// abgeschafft werden soll - erst recht, wenn es spaeter unbeaufsichtigt laeuft.
const GESETZE_PFAD = process.env.WISSENSBASIS_GESETZE
  || path.resolve(__dirname, "../wissensbasis/gesetze.json");
const MAPPING_PFAD = process.env.WISSENSBASIS_MAPPING
  || path.resolve(__dirname, "../wissensbasis/themen-mapping.json");

// Kuerzester echter Paragraph im Bestand liegt bei rund 90 Zeichen (BGB § 570).
// Die Warnschwelle liegt bewusst deutlich darunter: Sie soll Reste einer kaputten
// Extraktion finden, nicht kurze Normen.
const WARN_KURZ = 40;

// ---------------------------------------------------------------------------
// Befunde
// ---------------------------------------------------------------------------

const befunde = [];
const fehler  = (pruefung, id, text) => befunde.push({ stufe: "FEHLER",  pruefung, id, text });
const warnung = (pruefung, id, text) => befunde.push({ stufe: "WARNUNG", pruefung, id, text });
const info    = (pruefung, id, text) => befunde.push({ stufe: "INFO",    pruefung, id, text });

// ---------------------------------------------------------------------------
// Normalisierung
// ---------------------------------------------------------------------------

const klein = (s) => (s || "").toLowerCase();
const ascii = (s) =>
  klein(s).replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss");

// Zahlwoerter, laengste zuerst - sonst zerfaellt "vierundzwanzig" in "vier" + "zwanzig".
const ZAHLWORT = [
  [100, "hundert"],
  [25, "fuenfundzwanzigstel|fuenfundzwanzig"],
  [24, "vierundzwanzig"],
  [90, "neunzig"], [80, "achtzig"], [70, "siebzig"], [60, "sechzig"],
  [50, "fuenfzig"], [40, "vierzig"], [30, "dreissig"], [20, "zwanzig"],
  [19, "neunzehn"], [18, "achtzehn"], [17, "siebzehn"], [16, "sechzehn"],
  [15, "fuenfzehn"], [14, "vierzehn"], [13, "dreizehn"],
  [12, "zwoelf"], [11, "elf"], [10, "zehn"],
  [9, "neun"], [8, "acht"], [7, "sieben"], [6, "sechs"], [5, "fuenf"],
  [4, "vier"], [3, "drei|dritt"], [2, "zwei"], [1, "ein"],
];

// Welche Zahlen verspricht ein Suchbegriff?
function zahlenImBegriff(begriff) {
  const roh = ascii(begriff);
  let rest = roh;
  const gefunden = new Set();
  for (const [wert, muster] of ZAHLWORT) {
    const re = new RegExp(`\\b(${muster})[a-z]*\\b`, "g");
    if (re.test(rest)) {
      gefunden.add(wert);
      rest = rest.replace(new RegExp(`\\b(${muster})[a-z]*\\b`, "g"), " ");
    }
  }
  for (const m of roh.matchAll(/\b(\d{1,4})\b/g)) gefunden.add(Number(m[1]));
  return gefunden;
}

// Welche Zahlen stehen im Gesetzestext? Bewusst grosszuegig: Ein Fehlalarm hier
// waere schlimmer als eine uebersehene Schreibweise, weil er echte Befunde entwertet.
function zahlenImText(text) {
  const t = ascii(text);
  const gefunden = new Set();
  for (const m of t.matchAll(/\b(\d{1,4})\b/g)) gefunden.add(Number(m[1]));
  for (const [wert, muster] of ZAHLWORT) {
    if (new RegExp(`\\b(${muster})[a-z]*\\b`).test(t)) gefunden.add(wert);
  }
  if (/\bhaelfte\b|\bhalb/.test(t)) gefunden.add(2);
  if (/\bviertel\b/.test(t)) { gefunden.add(4); gefunden.add(25); }
  if (/\bdrittel\b/.test(t)) gefunden.add(3);
  if (/\bvom hundert\b|%|\bprozent\b/.test(t)) gefunden.add(100);
  return gefunden;
}

// Zeitbezug. Die Wortliste ist breit, die Treffer muessen aber am WORTANFANG
// stehen (\b vor der Gruppe). Beides ist noetig, und beides wurde hier teuer gelernt:
//
//  - Zu enge Wortliste: Eine fruehere Fassung kannte nur "frist|monat|jahr|woche|tag"
//    und meldete BGB § 542 faelschlich, weil dort "auf bestimmte Zeit ... Ablauf
//    dieser Zeit" steht. Fehlalarme entwerten echte Befunde.
//  - Ohne Wortanfang-Anker: Mit "zeit" an beliebiger Stelle galt WEG § 44 als
//    Paragraph mit Zeitbezug - wegen "gleichzeitigen" in Absatz 2. Damit war die
//    Pruefung blind fuer genau den Fehler, der sie ausgeloest hat ("anfechtungsfrist"
//    auf § 44 statt § 45). Nachgewiesen in der Negativkontrolle.
//
// Deshalb zwei Muster mit denselben Woertern, aber gegenlaeufigen Regeln:
//
//  - SUCHBEGRIFF: irgendwo im Wort. Suchbegriffe sind Komposita, in denen das
//    Zeitwort hinten steht ("anfechtungsfrist", "kuendigungsfrist", "monatsfrist").
//    Mit Wortanfang-Anker wuerde hier keiner davon als Fristbegriff erkannt.
//  - GESETZESTEXT: nur am Wortanfang. Sonst zaehlt "gleichzeitigen" als Zeitangabe.
//
// WARNUNG AN SPAETERE AENDERUNGEN: Diese Pruefung ist ein grobes Netz. Sie findet
// nur Faelle, in denen der Paragraph ueberhaupt keine Zeitangabe enthaelt. Zeigt ein
// Fristbegriff auf einen Paragraphen, der zwar Fristen nennt, aber die falschen,
// faellt das hier NICHT auf. Ein gruener Lauf ist kein Beleg fuer richtige Zuordnung.
const ZEITWOERTER = "frist|monat|jahr|woche|werktag|verjaehr|tag|zeit|termin|ablauf|kalender|quartal|sonnabend|samstag|sonntag|feiertag";
const ZEITBEZUG_BEGRIFF = new RegExp(`(${ZEITWOERTER})`);
const ZEITBEZUG_TEXT    = new RegExp(`\\b(${ZEITWOERTER})`);

// ---------------------------------------------------------------------------
// Dateien laden
// ---------------------------------------------------------------------------

function ladeJson(pfad) {
  let roh;
  try {
    roh = fs.readFileSync(pfad, "utf8");
  } catch (err) {
    console.error(`FEHLER: ${pfad} nicht lesbar - ${err.message}`);
    process.exit(1);
  }
  try {
    return JSON.parse(roh);
  } catch (err) {
    console.error(`FEHLER: ${pfad} ist kein gueltiges JSON - ${err.message}`);
    process.exit(1);
  }
}

const gesetze = ladeJson(GESETZE_PFAD);
const mapping = ladeJson(MAPPING_PFAD);

if (!Array.isArray(gesetze) || gesetze.length === 0) {
  console.error("FEHLER: gesetze.json ist kein befuelltes Array.");
  process.exit(1);
}

const byId = new Map();
for (const e of gesetze) {
  if (byId.has(e.id)) {
    fehler("Eindeutige IDs", e.id, `id "${e.id}" kommt in gesetze.json mehrfach vor`);
  }
  byId.set(e.id, e);
}

// ---------------------------------------------------------------------------
// Pruefungen auf gesetze.json
// ---------------------------------------------------------------------------

for (const e of gesetze) {
  const bez = `${e.gesetz} ${e.paragraph}`;
  const text = typeof e.text === "string" ? e.text : "";

  // Der Kern-Invariant. Er haelt die Skip-Regel aus import-gesetze.js dauerhaft:
  // Ein Eintrag mit echtem Titel und echtem Quell-Link, aber ohne Text, sieht im
  // Assistenten-Kontext aus wie eine gueltige Fundstelle und belegt einen der
  // wenigen Kontext-Plaetze. Solche Eintraege duerfen gar nicht erst entstehen.
  if (!text.trim()) {
    fehler("Kein leerer Text", e.id, `${bez} "${e.titel}" hat leeren Text - gehoert nicht in gesetze.json`);
    continue;
  }

  if (text.trim().length < WARN_KURZ) {
    warnung("Kein leerer Text", e.id, `${bez} nur ${text.trim().length} Zeichen - auf Extraktionsfehler pruefen`);
  }

  // Signatur einer verschluckten Grafik/Formel: Doppelpunkt, dann eine Zeile,
  // die nur aus einem Punkt besteht. So sah HeizkostenV § 9 Abs. 3 aus, bevor
  // der Importer eine Markierung gesetzt hat.
  if (/:\s*\n+\s*\.\s*(\n|$)/.test(text)) {
    fehler("Keine verschluckten Grafiken", e.id, `${bez} - an einer Formel-/Grafikstelle steht nur "."`);
  }

  if (!e.quelle || !/^https?:\/\//.test(e.quelle)) {
    fehler("Quell-Link vorhanden", e.id, `${bez} hat keinen brauchbaren Quell-Link`);
  }

  // Bekannte, bewusst akzeptierte Luecke - als INFO ausweisen, damit sie nicht
  // eines Tages fuer eine neue Regression gehalten wird.
  if (text.includes("[Grafik in der Quelle")) {
    info("Akzeptierte Luecken", e.id, `${bez} - Formel liegt in der Quelle nur als Grafik vor, Markierung gesetzt`);
  }
}

// ---------------------------------------------------------------------------
// Pruefungen auf themen-mapping.json
// ---------------------------------------------------------------------------

let mappingEintraege = 0;

for (const [id, eintrag] of Object.entries(mapping)) {
  if (id.startsWith("_")) continue; // Kommentar-/Metaschluessel
  mappingEintraege++;

  const ziel = byId.get(id);
  if (!ziel) {
    fehler("Mapping-IDs aufloesbar", id, `Mapping-ID "${id}" existiert nicht in gesetze.json`);
    continue;
  }

  const bez = `${ziel.gesetz} ${ziel.paragraph}`;

  // Das Titel-Gate von import-gesetze.js nachstellen. Faellt es durch, verwirft
  // der Import die themen still - der Mapping-Eintrag sieht dann gepflegt aus,
  // wirkt aber nicht.
  const pruefung = klein(eintrag.titel_pruefung);
  if (!pruefung) {
    fehler("Titel-Gate haelt", id, `kein titel_pruefung gesetzt - der Import wuerde die themen verwerfen`);
  } else if (!klein(ziel.titel).includes(pruefung)) {
    fehler("Titel-Gate haelt", id,
      `titel_pruefung "${eintrag.titel_pruefung}" steht nicht im Titel "${ziel.titel}" - der Import verwirft die themen still`);
  }

  const themen = eintrag.themen;
  if (!Array.isArray(themen) || themen.length === 0) {
    fehler("Themen vorhanden", id, `Mapping-Eintrag ohne themen`);
    continue;
  }

  const textZahlen = zahlenImText(ziel.text);
  const hatZeitbezug = ZEITBEZUG_TEXT.test(ascii(ziel.text));

  for (const begriff of themen) {
    if (typeof begriff !== "string" || !begriff.trim()) {
      fehler("Themen vorhanden", id, `leerer Suchbegriff in themen`);
      continue;
    }

    // Ein Begriff darf keine Zahl nennen, die im Paragraphen nicht vorkommt.
    // Abgeleitete Zahlen gehoeren nicht in die Suchbegriffe: BGB § 573c nennt
    // "fuenf und acht Jahren" und "jeweils drei Monate" - die daraus folgenden
    // sechs bzw. neun Monate stehen nirgends im Text und werden hier zu Recht
    // beanstandet. Die Rechnung macht spaeter ein Werkzeug, der Bestand bleibt woertlich.
    const versprochen = zahlenImBegriff(begriff);
    const fehlend = [...versprochen].filter((z) => !textZahlen.has(z));
    if (fehlend.length) {
      fehler("Zahlen belegt", id,
        `"${begriff}" nennt ${fehlend.join(", ")} - kommt im Text von ${bez} nicht vor`);
    }

    // Ein Begriff, der eine Frist verspricht, muss auf einen Paragraphen mit
    // Zeitbezug zeigen.
    if (ZEITBEZUG_BEGRIFF.test(ascii(begriff)) && !hatZeitbezug) {
      fehler("Fristbegriffe belegt", id,
        `"${begriff}" verspricht eine Frist - ${bez} enthaelt keinen Zeitbezug`);
    }
  }

  // Bekannte Luecken: Der Paragraph ist der richtige Anlaufpunkt, enthaelt die
  // Antwort aber nicht. Kein Fehler, aber schriftlich festgehalten.
  if (eintrag.luecke) {
    info("Bekannte Wissensluecken", id, `${bez} - ${eintrag.luecke}`);
  }
}

// Gegenrichtung: themen in gesetze.json, die kein Mapping-Eintrag mehr traegt.
// Das heisst, die beiden Dateien sind auseinandergelaufen - meist ein Import,
// der nach einer Mapping-Aenderung nicht neu gelaufen ist.
for (const e of gesetze) {
  if (Array.isArray(e.themen) && e.themen.length && !mapping[e.id]) {
    fehler("Dateien synchron", e.id,
      `${e.gesetz} ${e.paragraph} traegt themen in gesetze.json, hat aber keinen Mapping-Eintrag - Import neu laufen lassen`);
  }
}

// ---------------------------------------------------------------------------
// Ausgabe
// ---------------------------------------------------------------------------

const PRUEFUNGEN = [
  "Eindeutige IDs",
  "Mapping-IDs aufloesbar",
  "Titel-Gate haelt",
  "Themen vorhanden",
  "Zahlen belegt",
  "Fristbegriffe belegt",
  "Kein leerer Text",
  "Keine verschluckten Grafiken",
  "Quell-Link vorhanden",
  "Dateien synchron",
];

const mitThemen = gesetze.filter((e) => Array.isArray(e.themen) && e.themen.length).length;

console.log("=== Pruefung der Wissensbasis ===\n");
console.log(`gesetze.json:        ${gesetze.length} Paragraphen, ${mitThemen} mit Themen`);
console.log(`themen-mapping.json: ${mappingEintraege} Eintraege\n`);

for (const pruefung of PRUEFUNGEN) {
  const treffer = befunde.filter((b) => b.pruefung === pruefung);
  const schlimm = treffer.filter((b) => b.stufe === "FEHLER");
  const symbol = schlimm.length ? "✖" : "✓";
  console.log(`${symbol} ${pruefung}${treffer.length ? ` (${treffer.length})` : ""}`);
  for (const t of treffer) {
    console.log(`    ${t.stufe === "FEHLER" ? "FEHLER " : "WARNUNG"} ${t.id}: ${t.text}`);
  }
}

const infos = befunde.filter((b) => b.stufe === "INFO");
if (infos.length) {
  console.log("\n--- Zur Kenntnis (keine Fehler) ---");
  for (const i of infos) console.log(`    ${i.pruefung} | ${i.id}: ${i.text}`);
}

const anzFehler  = befunde.filter((b) => b.stufe === "FEHLER").length;
const anzWarnung = befunde.filter((b) => b.stufe === "WARNUNG").length;

console.log("\n=================================");
console.log(`${anzFehler} Fehler, ${anzWarnung} Warnungen, ${infos.length} Hinweise`);
console.log(
  "Hinweis: Geprueft wird nur die Konsistenz der beiden Dateien.\n" +
  "         Ob der gespeicherte Text noch der geltenden Fassung entspricht,\n" +
  "         prueft dieses Skript NICHT - dafuer braucht es einen Abgleich gegen die Quelle."
);

process.exit(anzFehler > 0 ? 1 : 0);
