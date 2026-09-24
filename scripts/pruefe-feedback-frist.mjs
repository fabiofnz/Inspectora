#!/usr/bin/env node
// scripts/pruefe-feedback-frist.mjs
// Aufruf: npm run pruefe-feedback-frist   (Exit-Code != 0, sobald etwas nicht stimmt)
//
// Prueft die Loeschfrist fuer Feedback (netlify/lib/feedback-frist.mjs) ohne
// Netlify: feste Faelle an den Grenzen, dann ein Durchlauf gegen einen
// nachgebauten Store.
//
// Mit eingebauter Negativkontrolle: Dieselben Faelle laufen gegen absichtlich
// falsche Fassungen der Frist (ein Tag daneben, 183 Tage statt sechs Monaten,
// "unlesbar = loeschen" ...). Jede falsche Fassung muss an mindestens einem Fall
// scheitern. Tut sie das nicht, beweisen die Faelle nichts - und das Skript
// schlaegt an.
//
// Was hier NICHT geprueft werden kann: ob Netlify die Function taeglich
// startet. Das zeigt nur das Log im Netlify-Dashboard.

import { datumAusSchluessel, fristGrenze, sortiere, aufraeumen } from "../netlify/lib/feedback-frist.mjs";

let fehler = 0;
const ok = (m) => console.log(`✓ ${m}`);
const nein = (m) => { console.error(`✖ ${m}`); fehler++; };
const k = (iso) => `feedback:${iso}-abc123`;

// --- Faelle: [Beschreibung, jetzt, Schluessel, erwartet] -------------------
// erwartet: "loeschen" | "behalten" | "ohneDatum"
const JETZT = "2026-09-24T12:00:00.000Z";
const FAELLE = [
  ["genau sechs Monate alt: bleibt (Grenze selbst ist nicht 'aelter')", JETZT, k("2026-03-24T12:00:00.000Z"), "behalten"],
  ["eine Millisekunde aelter als sechs Monate: weg", JETZT, k("2026-03-24T11:59:59.999Z"), "loeschen"],
  ["einen Tag juenger als sechs Monate: bleibt", JETZT, k("2026-03-25T12:00:00.000Z"), "behalten"],
  ["einen Tag aelter als sechs Monate: weg", JETZT, k("2026-03-23T12:00:00.000Z"), "loeschen"],
  ["gestern: bleibt", JETZT, k("2026-09-23T12:00:00.000Z"), "behalten"],
  ["vor einem Jahr: weg", JETZT, k("2025-09-24T12:00:00.000Z"), "loeschen"],
  ["Datum in der Zukunft: bleibt", JETZT, k("2027-01-01T00:00:00.000Z"), "behalten"],
  // Monatsende: 31.08. minus sechs Monate = 28.02. (nicht 03.03.)
  ["Monatsende: 27.02. ist am 31.08. aelter als sechs Monate", "2026-08-31T00:00:00.000Z", k("2026-02-27T00:00:00.000Z"), "loeschen"],
  ["Monatsende: 01.03. ist am 31.08. juenger als sechs Monate", "2026-08-31T00:00:00.000Z", k("2026-03-01T00:00:00.000Z"), "behalten"],
  ["Monatsende: 28.02. 23:00 ist am 31.08. 00:00 juenger", "2026-08-31T00:00:00.000Z", k("2026-02-28T23:00:00.000Z"), "behalten"],
  ["Jahreswechsel: am 15.01.2027 ist 14.07.2026 weg", "2027-01-15T00:00:00.000Z", k("2026-07-14T00:00:00.000Z"), "loeschen"],
  ["Jahreswechsel: am 15.01.2027 bleibt 16.07.2026", "2027-01-15T00:00:00.000Z", k("2026-07-16T00:00:00.000Z"), "behalten"],
  ["Zufallsteil leer: trotzdem lesbar", JETZT, "feedback:2025-01-01T00:00:00.000Z-", "loeschen"],
  ["ohne Millisekunden: lesbar", JETZT, "feedback:2025-01-01T00:00:00Z-x1", "loeschen"],
  ["fremder Schluessel: nicht loeschen, melden", JETZT, "irgendwas-anderes", "ohneDatum"],
  ["kaputtes Datum: nicht loeschen, melden", JETZT, "feedback:2025-13-45T99:00:00.000Z-abc", "ohneDatum"],
  ["alter Schluessel ohne Praefix: nicht loeschen, melden", JETZT, "2025-01-01T00:00:00.000Z-abc", "ohneDatum"],
];

function pruefeFaelle(sortierer) {
  const falsch = [];
  for (const [name, jetzt, schluessel, erwartet] of FAELLE) {
    const r = sortierer([schluessel], Date.parse(jetzt));
    const ist = r.loeschen.length ? "loeschen" : r.behalten.length ? "behalten" : "ohneDatum";
    if (ist !== erwartet) falsch.push(`${name} (erwartet ${erwartet}, ist ${ist})`);
  }
  return falsch;
}

console.log("=== Loeschfrist Feedback: Faelle ===\n");
const falsch = pruefeFaelle(sortiere);
if (falsch.length) falsch.forEach(nein);
else ok(`${FAELLE.length} Faelle an den Grenzen stimmen`);

const g = fristGrenze(Date.parse("2026-08-31T00:00:00.000Z")).toISOString();
if (g !== "2026-02-28T00:00:00.000Z") nein(`Grenze am 31.08.: erwartet 2026-02-28, ist ${g}`);
else ok("Grenze am 31.08.2026 ist der 28.02.2026 (letzter Tag des Monats)");

if (datumAusSchluessel("feedback:2026-09-24T14:03:11.512Z-k3j9x2")?.toISOString() !== "2026-09-24T14:03:11.512Z") {
  nein("Datum aus einem echten Schluessel nicht richtig gelesen");
} else ok("Datum aus einem echten Schluessel gelesen");

// --- Durchlauf gegen einen nachgebauten Store ------------------------------
console.log("\n=== Durchlauf gegen nachgebauten Store ===\n");
const inhalt = new Map([
  [k("2025-01-01T00:00:00.000Z"), 1],
  [k("2026-03-01T00:00:00.000Z"), 1],
  [k("2026-09-01T00:00:00.000Z"), 1],
  ["kaputt", 1],
  [k("2025-06-01T00:00:00.000Z"), 1], // Loeschen schlaegt fehl
]);
const SPERRE = k("2025-06-01T00:00:00.000Z");
const store = {
  list: async () => ({ blobs: [...inhalt.keys()].map((key) => ({ key, etag: "x" })), directories: [] }),
  delete: async (key) => { if (key === SPERRE) throw new Error("gesperrt"); inhalt.delete(key); },
};
const r = await aufraeumen(store, Date.parse(JETZT));
const uebrig = [...inhalt.keys()].sort().join(" | ");
const erwartetUebrig = ["kaputt", k("2025-06-01T00:00:00.000Z"), k("2026-09-01T00:00:00.000Z")].sort().join(" | ");
if (r.geprueft !== 5 || r.geloescht !== 2 || r.behalten !== 1 || r.ohneDatum.length !== 1 || r.fehlgeschlagen.length !== 1) {
  nein(`Zahlen falsch: ${JSON.stringify(r)}`);
} else ok("5 geprueft, 2 geloescht, 1 behalten, 1 ohne Datum gemeldet, 1 Loeschfehler gemeldet");
if (uebrig !== erwartetUebrig) nein(`Im Store uebrig: ${uebrig}`);
else ok("Im Store bleibt genau: das Junge, das Undatierbare, das mit Loeschfehler");

// --- Negativkontrolle: falsche Fristen muessen scheitern -------------------
console.log("\n=== Negativkontrolle: falsche Fassungen muessen scheitern ===\n");
const TAG = 86400000;
const mitGrenze = (grenzeVon, { unlesbarLoeschen = false, bisEinschliesslich = false } = {}) =>
  (schluessel, jetzt) => {
    const grenze = grenzeVon(jetzt);
    const e = { loeschen: [], behalten: [], ohneDatum: [] };
    for (const s of schluessel) {
      const d = datumAusSchluessel(s);
      if (!d) (unlesbarLoeschen ? e.loeschen : e.ohneDatum).push(s);
      else if (bisEinschliesslich ? d <= grenze : d < grenze) e.loeschen.push(s);
      else e.behalten.push(s);
    }
    return e;
  };
const naiverMonat = (jetzt) => { const d = new Date(jetzt); d.setUTCMonth(d.getUTCMonth() - 6); return d; };
const FALSCHE = [
  ["183 Tage statt sechs Kalendermonate", mitGrenze((j) => new Date(j - 183 * TAG))],
  ["180 Tage", mitGrenze((j) => new Date(j - 180 * TAG))],
  ["einen Tag zu frueh", mitGrenze((j) => new Date(fristGrenze(j).getTime() + TAG))],
  ["einen Tag zu spaet", mitGrenze((j) => new Date(fristGrenze(j).getTime() - TAG))],
  ["Grenze selbst mitgeloescht (<= statt <)", mitGrenze(fristGrenze, { bisEinschliesslich: true })],
  ["naives setUTCMonth (laeuft am Monatsende in den Maerz)", mitGrenze(naiverMonat)],
  ["Unlesbares wird geloescht", mitGrenze(fristGrenze, { unlesbarLoeschen: true })],
  ["fuenf statt sechs Monate", mitGrenze((j) => { const d = fristGrenze(j); d.setUTCMonth(d.getUTCMonth() + 1); return d; })],
];
for (const [name, sortierer] of FALSCHE) {
  const f = pruefeFaelle(sortierer);
  if (f.length) ok(`erkannt: ${name} (${f.length} Fall/Faelle schlagen an)`);
  else nein(`NICHT erkannt: ${name} - die Faelle decken diesen Fehler nicht ab`);
}

console.log(fehler ? `\n${fehler} Fehler.` : "\nLoeschfrist geprueft, Negativkontrolle vollstaendig.");
process.exit(fehler ? 1 : 0);
