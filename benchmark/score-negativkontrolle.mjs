// benchmark/score-negativkontrolle.mjs
// Aufruf: node benchmark/score-negativkontrolle.mjs
//
// Wozu das hier gehoert: score.mjs entscheidet richtig und falsch. Liegt der Scorer
// still daneben, ist jede veroeffentlichte Zahl falsch, und man sieht es ihr nicht an.
// Ein Lauf ueber echte Antworten beweist nichts - die meisten sind im richtigen Format,
// die kritischen Faelle kommen darin womoeglich gar nicht vor.
//
// Deshalb: erfundene Antworten, fuer jeden Fall ist das Urteil vorher festgelegt. Der
// echte Scorer laeuft als eigener Prozess auf Dateien in einem temporaeren Verzeichnis
// (ueber BENCHMARK_WURZEL). Weicht ein Urteil ab, schlaegt dieses Skript fehl.
// Echte Frage- und Ergebnisdateien werden nicht angefasst.

"use strict";

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { isDeepStrictEqual } from "node:util";
import { fileURLToPath } from "node:url";

const LOG = "[score-negativkontrolle]";
const HIER = path.dirname(fileURLToPath(import.meta.url));
const SCORER = path.join(HIER, "score.mjs");

// Wortgleich mit run.mjs.
const VORLAGEN = {
  "datum": "Letzte Zeile deiner Antwort genau in dieser Form: ANTWORT: TT.MM.JJJJ",
  "ja-nein": "Letzte Zeile deiner Antwort genau in dieser Form: ANTWORT: ja oder ANTWORT: nein",
};

// ---------------------------------------------------------------------------
// Faelle mit festgelegtem Urteil
// ---------------------------------------------------------------------------

const D = "2020-06-02"; // Schluessel aller Datumsfaelle: 02.06.2020

const FAELLE = [
  // gewertet
  { id: "d-richtig", typ: "datum", schluessel: D, kategorie: "k1",
    roh: "Rechnung ...\n\nANTWORT: 02.06.2020", erwartet: "richtig" },
  { id: "d-richtig-leerraum", typ: "datum", schluessel: D, kategorie: "k1",
    roh: "Rechnung ...\r\nANTWORT: 02.06.2020  \r\n\r\n", erwartet: "richtig" },
  { id: "d-falsch", typ: "datum", schluessel: D, kategorie: "k2",
    roh: "ANTWORT: 01.06.2020", erwartet: "falsch" },
  { id: "d-tag-monat-vertauscht", typ: "datum", schluessel: D, kategorie: "k1",
    roh: "ANTWORT: 06.02.2020", erwartet: "falsch" },
  { id: "d-letzte-zeile-zaehlt", typ: "datum", schluessel: D, kategorie: "k1",
    roh: "ANTWORT: 02.06.2020\nKorrektur:\nANTWORT: 03.06.2020", erwartet: "falsch" },
  { id: "j-richtig", typ: "ja-nein", schluessel: "nein", kategorie: "k2",
    roh: "Begruendung ...\nANTWORT: nein", erwartet: "richtig" },
  { id: "j-ja-statt-nein", typ: "ja-nein", schluessel: "nein", kategorie: "k2",
    roh: "Begruendung ...\nANTWORT: ja", erwartet: "falsch" },

  // nicht-auswertbar: format-abweichung
  { id: "d-fett", typ: "datum", schluessel: D, kategorie: "k1",
    roh: "Rechnung ...\n**ANTWORT: 02.06.2020**", erwartet: "nicht-auswertbar", grund: "format-abweichung" },
  { id: "d-iso-format", typ: "datum", schluessel: D, kategorie: "k1",
    roh: "Rechnung ...\nANTWORT: 2020-06-02", erwartet: "nicht-auswertbar", grund: "format-abweichung" },
  { id: "d-text-dahinter", typ: "datum", schluessel: D, kategorie: "k1",
    roh: "ANTWORT: 02.06.2020 (Dienstag)", erwartet: "nicht-auswertbar", grund: "format-abweichung" },
  { id: "j-grossgeschrieben", typ: "ja-nein", schluessel: "ja", kategorie: "k2",
    roh: "Begruendung ...\nANTWORT: Ja", erwartet: "nicht-auswertbar", grund: "format-abweichung" },

  // nicht-auswertbar: keine-schlusszeile
  { id: "d-keine-schlusszeile", typ: "datum", schluessel: D, kategorie: "k1",
    roh: "Die Frist endet am 02.06.2020.", erwartet: "nicht-auswertbar", grund: "keine-schlusszeile" },
  { id: "d-leer", typ: "datum", schluessel: D, kategorie: "k1",
    roh: "", erwartet: "nicht-auswertbar", grund: "keine-schlusszeile" },

  // nicht-auswertbar: falsche-position - richtige Antwort in der vorletzten Zeile
  { id: "d-vorletzte-zeile", typ: "datum", schluessel: D, kategorie: "k1",
    roh: "Rechnung ...\nANTWORT: 02.06.2020\nIch hoffe, das hilft.", erwartet: "nicht-auswertbar", grund: "falsche-position" },

  // nicht gewertet, obwohl die Schlusszeile exakt richtig waere
  { id: "d-abgeschnitten", typ: "datum", schluessel: D, kategorie: "k1",
    roh: "ANTWORT: 02.06.2020", abgeschnitten: true, stop_reason: "max_tokens", erwartet: "abgeschnitten" },
  { id: "j-api-fehler", typ: "ja-nein", schluessel: "ja", kategorie: "k2",
    fehler: { status: 529, typ: "OverloadedError", meldung: "Overloaded" }, erwartet: "fehler" },
  { id: "j-abgelehnt", typ: "ja-nein", schluessel: "ja", kategorie: "k2",
    roh: "ANTWORT: ja", stop_reason: "refusal", erwartet: "abgelehnt" },
];

// ---------------------------------------------------------------------------
// Hilfen
// ---------------------------------------------------------------------------

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "score-negativkontrolle-"));
const sha256 = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");

const ergebnisse = [];
function pruefe(name, bestanden, detail = "") {
  ergebnisse.push({ name, bestanden });
  console.log(`${bestanden ? "  OK    " : "  FEHLER"} ${name}${!bestanden && detail ? ` - ${detail}` : ""}`);
}

function frageAus(fall) {
  return {
    id: fall.id,
    frage: `Testfrage ${fall.id}?`,
    antwort_typ: fall.typ,
    antwort: fall.schluessel,
    beleg_gesetz: "BGB",
    beleg_paragraph: "556",
    beleg_link: "https://www.gesetze-im-internet.de/bgb/__556.html",
    kategorie: fall.kategorie,
    rechenweg: { testfall: fall.id, basis: fall.schluessel, schritte: [{ bezeichnung: "Test", erklaerung: fall.id }] },
  };
}

function eintragAus(fall, frage) {
  const eintrag = {
    frage_id: frage.id,
    nachricht: `${frage.frage}\n\n${VORLAGEN[frage.antwort_typ]}`,
    stop_reason: fall.stop_reason ?? "end_turn",
    abgeschnitten: fall.abgeschnitten ?? false,
  };
  if (fall.fehler) eintrag.fehler = fall.fehler;
  else eintrag.roh_antwort = fall.roh;
  return eintrag;
}

// Baut Wurzel/benchmark/fragen-test.json und Wurzel/benchmark/ergebnisse/lauf.json.
// "vorher" darf Fragen und Eintraege veraendern, bevor der Hash berechnet wird;
// "nachher" veraendert die Fragendatei danach.
function baue(name, faelle, { vorher, nachher } = {}) {
  const wurzel = path.join(TMP, name);
  fs.mkdirSync(path.join(wurzel, "benchmark", "ergebnisse"), { recursive: true });
  const fragen = faelle.map(frageAus);
  const antworten = faelle.map((f, i) => eintragAus(f, fragen[i]));
  if (vorher) vorher(fragen, antworten);

  const fragenPfad = path.join(wurzel, "benchmark", "fragen-test.json");
  const fragenBytes = Buffer.from(JSON.stringify(fragen, null, 2) + "\n", "utf8");
  fs.writeFileSync(fragenPfad, fragenBytes);

  const ergebnis = {
    lauf: "negativkontrolle",
    status: "abgeschlossen",
    modell: { angefragt: "testmodell", anbieter: "Test", info: { display_name: "Testmodell" } },
    konfiguration: { parameter: {}, systemprompt: null, fallbacks: null },
    vorlagen: VORLAGEN,
    auswahl: { kontingent: [{ anzahl: antworten.length }] },
    herkunft: { fragendatei: "benchmark/fragen-test.json", fragendatei_sha256: sha256(fragenBytes) },
    antworten,
  };
  const ergebnisPfad = path.join(wurzel, "benchmark", "ergebnisse", "lauf.json");
  fs.writeFileSync(ergebnisPfad, JSON.stringify(ergebnis, null, 2) + "\n", "utf8");
  if (nachher) nachher(fragenPfad, fragen);

  return { wurzel, ergebnisPfad, fragen, auswertungPfad: path.join(wurzel, "benchmark", "ergebnisse", "lauf-auswertung.json") };
}

function laufe(fall) {
  return spawnSync(process.execPath, [SCORER, "--ergebnis", fall.ergebnisPfad], {
    env: { ...process.env, BENCHMARK_WURZEL: fall.wurzel },
    encoding: "utf8",
  });
}

function pruefeAbbruch(name, fall, erwarteterText) {
  const r = laufe(fall);
  pruefe(`${name}: Abbruch mit Exit-Code ungleich 0`, r.status !== 0, `Exit-Code ${r.status}`);
  pruefe(`${name}: Meldung nennt "${erwarteterText}"`, r.stderr.includes(erwarteterText), r.stderr.trim());
  pruefe(`${name}: keine Auswertung geschrieben`, !fs.existsSync(fall.auswertungPfad));
}

// ---------------------------------------------------------------------------

function main() {
  console.log(`${LOG} Temporaeres Verzeichnis: ${TMP}`);

  // --- 1. Urteile je Fall ---------------------------------------------------
  console.log(`\n${LOG} 1. Urteil je Fall (${FAELLE.length} Faelle)`);
  const haupt = baue("haupt", FAELLE);
  const r = laufe(haupt);
  pruefe("Scorer laeuft durch (Exit-Code 0)", r.status === 0, r.stderr.trim());
  if (r.status !== 0 || !fs.existsSync(haupt.auswertungPfad)) {
    pruefe("Auswertungsdatei geschrieben", false);
    return;
  }
  const a = JSON.parse(fs.readFileSync(haupt.auswertungPfad, "utf8"));

  pruefe(`Einzelwertung enthaelt genau ${FAELLE.length} Eintraege`, a.einzelwertung.length === FAELLE.length,
    `${a.einzelwertung.length} Eintraege`);
  for (const fall of FAELLE) {
    const e = a.einzelwertung.find((x) => x.frage_id === fall.id);
    const ist = e ? `${e.status}${e.grund ? "/" + e.grund : ""}` : "fehlt";
    const soll = `${fall.erwartet}${fall.grund ? "/" + fall.grund : ""}`;
    pruefe(`${fall.id} -> ${soll}`, ist === soll, `Scorer sagt ${ist}`);
  }

  // --- 2. Die beiden ausdruecklich verlangten Faelle, einzeln -----------------
  console.log(`\n${LOG} 2. Richtige Antwort in falscher Form wird nicht gewertet`);
  const iso = a.nicht_auswertbar["format-abweichung"].find((x) => x.frage_id === "d-iso-format");
  pruefe("ANTWORT: 2020-06-02 steht unter format-abweichung, mit der Zeile im Original",
    iso?.schlusszeile === "ANTWORT: 2020-06-02", JSON.stringify(iso));
  const pos = a.nicht_auswertbar["falsche-position"].find((x) => x.frage_id === "d-vorletzte-zeile");
  pruefe("Vorletzte Zeile richtig, letzte anders: falsche-position, Antwortzeile und letzte Zeile benannt",
    pos?.antwortzeile === "ANTWORT: 02.06.2020" && pos?.schlusszeile === "Ich hoffe, das hilft."
      && pos?.zeilen_vor_ende === 1, JSON.stringify(pos));
  const alleGewertet = a.einzelwertung.filter((x) => x.status === "richtig" || x.status === "falsch").map((x) => x.frage_id);
  pruefe("Keiner der beiden Faelle zaehlt als richtig oder falsch",
    !alleGewertet.includes("d-iso-format") && !alleGewertet.includes("d-vorletzte-zeile"));

  // --- 3. Quoten ------------------------------------------------------------
  console.log(`\n${LOG} 3. Quoten und Zaehler`);
  const datum = a.quoten.nach_antworttyp["datum"];
  pruefe("datum: 2 richtig, 3 falsch, 5 gewertet, Quote 0,4",
    datum.richtig === 2 && datum.falsch === 3 && datum.gewertet === 5 && datum.quote_richtig === 0.4,
    JSON.stringify(datum));
  pruefe("datum: nicht-auswertbar 3 format-abweichung, 2 keine-schlusszeile, 1 falsche-position",
    isDeepStrictEqual(datum.nicht_auswertbar, { "format-abweichung": 3, "keine-schlusszeile": 2, "falsche-position": 1 }),
    JSON.stringify(datum.nicht_auswertbar));
  pruefe("datum: 1 abgeschnitten, nicht in der Quote", datum.abgeschnitten === 1, JSON.stringify(datum));

  const jn = a.quoten.nach_antworttyp["ja-nein"];
  pruefe("ja-nein: 1 richtig, 1 falsch, Quote 0,5; 1 fehler, 1 abgelehnt, 1 format-abweichung",
    jn.richtig === 1 && jn.falsch === 1 && jn.quote_richtig === 0.5 && jn.fehler === 1 && jn.abgelehnt === 1
      && jn.nicht_auswertbar["format-abweichung"] === 1, JSON.stringify(jn));
  pruefe("ja-nein, Schluessel nein: 2 gewertet, 1 richtig",
    jn.nach_schluessel.nein.gewertet === 2 && jn.nach_schluessel.nein.richtig === 1, JSON.stringify(jn.nach_schluessel.nein));
  pruefe("ja-nein, Schluessel ja: 0 gewertet, Quote leer (null, nicht 0)",
    jn.nach_schluessel.ja.gewertet === 0 && jn.nach_schluessel.ja.quote_richtig === null, JSON.stringify(jn.nach_schluessel.ja));
  pruefe("Keine gemischte Gesamtquote in der Auswertung",
    !("quote_richtig" in a.zusammenfassung) && !("gesamt" in a.quoten));

  const k2datum = a.quoten.nach_kategorie.find((z) => z.kategorie === "k2" && z.antwort_typ === "datum");
  const k2jn = a.quoten.nach_kategorie.find((z) => z.kategorie === "k2" && z.antwort_typ === "ja-nein");
  pruefe("Kategorie k2 getrennt nach Antworttyp: datum 1 falsch, ja-nein 1 richtig 1 falsch",
    k2datum?.falsch === 1 && k2datum?.gewertet === 1 && k2jn?.richtig === 1 && k2jn?.falsch === 1,
    JSON.stringify({ k2datum, k2jn }));
  pruefe("Status-Zaehler ergeben zusammen alle Faelle", (() => {
    const s = a.zusammenfassung.status;
    const summe = s.richtig + s.falsch + s.abgeschnitten + s.fehler + s.abgelehnt
      + Object.values(s.nicht_auswertbar).reduce((x, y) => x + y, 0);
    return summe === FAELLE.length;
  })(), JSON.stringify(a.zusammenfassung.status));

  // --- 4. Fehlerliste -------------------------------------------------------
  console.log(`\n${LOG} 4. Liste der falschen Antworten`);
  const erwarteteFalsche = FAELLE.filter((f) => f.erwartet === "falsch").map((f) => f.id).sort();
  pruefe(`Genau diese falschen: ${erwarteteFalsche.join(", ")}`,
    isDeepStrictEqual(a.falsche_antworten.map((x) => x.frage_id).sort(), erwarteteFalsche),
    a.falsche_antworten.map((x) => x.frage_id).join(", "));
  const fragenNachId = new Map(haupt.fragen.map((f) => [f.id, f]));
  pruefe("Jede falsche Antwort traegt Frage, Schlusszeile, Schluessel, Beleg und rechenweg der Fragendatei",
    a.falsche_antworten.every((x) => {
      const f = fragenNachId.get(x.frage_id);
      return x.frage === f.frage && x.schluessel === f.antwort && x.beleg_link === f.beleg_link
        && typeof x.schlusszeile === "string" && isDeepStrictEqual(x.rechenweg, f.rechenweg);
    }));
  const letzte = a.falsche_antworten.find((x) => x.frage_id === "d-letzte-zeile-zaehlt");
  pruefe("Richtige Zeile weiter oben rettet nichts: gewertet wird 03.06.2020",
    letzte?.modell_antwort === "2020-06-03", JSON.stringify(letzte));
  pruefe("Terminal nennt die Fehlerliste", r.stdout.includes(`== Falsche Antworten (${erwarteteFalsche.length}) ==`));

  // --- 5. Nicht ueberschreiben ------------------------------------------------
  console.log(`\n${LOG} 5. Vorhandene Auswertung bleibt unberuehrt`);
  const vorher = fs.readFileSync(haupt.auswertungPfad);
  const r2 = laufe(haupt);
  pruefe("Zweiter Lauf bricht ab", r2.status !== 0, `Exit-Code ${r2.status}`);
  pruefe("Meldung nennt \"existiert bereits\"", r2.stderr.includes("existiert bereits"), r2.stderr.trim());
  pruefe("Datei byte-gleich", vorher.equals(fs.readFileSync(haupt.auswertungPfad)));

  // --- 6. Eingabepruefung ---------------------------------------------------
  console.log(`\n${LOG} 6. Abbruch bei veraenderten Eingaben`);
  const einfach = [FAELLE.find((f) => f.id === "d-falsch")];

  // Schluessel nach dem Lauf so geaendert, dass die falsche Antwort "richtig" waere.
  pruefeAbbruch("Fragendatei nach dem Lauf veraendert", baue("hash", einfach, {
    nachher: (fragenPfad, fragen) => {
      fragen[0].antwort = "2020-06-01";
      fs.writeFileSync(fragenPfad, JSON.stringify(fragen, null, 2) + "\n", "utf8");
    },
  }), "SHA-256");

  pruefeAbbruch("Gesendete Nachricht weicht von der Vorlage ab", baue("vorlage", einfach, {
    vorher: (_, antworten) => { antworten[0].nachricht += " Denk gruendlich nach."; },
  }), "nicht exakt Frage + Vorlage");

  pruefeAbbruch("frage_id fehlt in der Fragendatei", baue("unbekannt", einfach, {
    vorher: (_, antworten) => { antworten[0].frage_id = "gibt-es-nicht"; },
  }), "nicht in der Fragendatei");

  pruefeAbbruch("frage_id im Lauf doppelt", baue("doppelt", einfach, {
    vorher: (_, antworten) => { antworten.push({ ...antworten[0] }); },
  }), "im Lauf doppelt");

  pruefeAbbruch("Schluessel im falschen Format", baue("schluessel", einfach, {
    vorher: (fragen) => { fragen[0].antwort = "02.06.2020"; },
  }), "hat nicht das Format");
}

try {
  main();
} finally {
  fs.rmSync(TMP, { recursive: true, force: true });
}

const bestanden = ergebnisse.filter((e) => e.bestanden).length;
console.log(`\n${LOG} ${bestanden} von ${ergebnisse.length} Pruefungen bestanden.`);
// 0 von 0 ist kein Erfolg.
if (ergebnisse.length === 0 || bestanden !== ergebnisse.length) process.exit(1);
