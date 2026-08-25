#!/usr/bin/env node
// scripts/pruefe-wissensbasis-negativkontrolle.js
// Aufruf: npm run pruefe-wissensbasis:negativkontrolle
//
// Wozu das hier gehoert: pruefe-wissensbasis.js meldet im Normalfall "0 Fehler".
// Genau das ist wertlos, solange niemand gezeigt hat, dass es ueberhaupt etwas
// melden KANN. Ein gruener Lauf beweist nichts - er kann auch heissen, dass eine
// Pruefung ins Leere greift.
//
// Das ist waehrend der Entwicklung zweimal passiert, beide Male mit gruenem Lauf:
//   1. Das Zeitwort-Muster war zu eng ("frist|monat|jahr|woche|tag") und meldete
//      BGB § 542 faelschlich.
//   2. Nach dem Verbreitern galt WEG § 44 wegen "gleichzeitigen" als Paragraph mit
//      Zeitbezug - die Pruefung war blind fuer genau den Fehler, der sie ausgeloest
//      hatte ("anfechtungsfrist" auf § 44 statt § 45). Exit 0, sah sauber aus.
//
// Deshalb: Jede Pruefung wird hier absichtlich gebrochen. Wird ein eingebauter
// Fehler NICHT gemeldet, schlaegt dieses Skript fehl. Es muss laufen, bevor
// pruefe-wissensbasis.js auf einem Zeitplan Vertrauen bekommt.
//
// Die echten Dateien werden dabei nicht angefasst: Es wird gegen mutierte Kopien
// in einem temporaeren Verzeichnis geprueft (siehe WISSENSBASIS_GESETZE /
// WISSENSBASIS_MAPPING in pruefe-wissensbasis.js).

"use strict";

const fs   = require("fs");
const os   = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT         = path.resolve(__dirname, "..");
const GESETZE_PFAD = path.join(ROOT, "wissensbasis/gesetze.json");
const MAPPING_PFAD = path.join(ROOT, "wissensbasis/themen-mapping.json");
const PRUEFER      = path.join(ROOT, "scripts/pruefe-wissensbasis.js");

const originalG = fs.readFileSync(GESETZE_PFAD, "utf8");
const originalM = fs.readFileSync(MAPPING_PFAD, "utf8");

// Jede Mutation bricht genau eine Pruefung. "erwartet" ist die Ueberschrift,
// unter der pruefe-wissensbasis.js den Befund melden muss.
const MUTATIONEN = [
  {
    name: "Mapping-ID zeigt ins Leere",
    erwartet: "Mapping-IDs aufloesbar",
    mutiere: (g, m) => { m["weg-45x"] = m["weg-45"]; delete m["weg-45"]; },
  },
  {
    name: "Suchbegriff nennt eine Zahl, die im Text nicht vorkommt (Originalfehler woflv-4)",
    erwartet: "Zahlen belegt",
    mutiere: (g, m) => { m["woflv-4"].themen.push("vierundzwanzig prozent"); },
  },
  {
    name: "Suchbegriff nennt eine abgeleitete Zahl (Originalfehler bgb-573c)",
    erwartet: "Zahlen belegt",
    mutiere: (g, m) => { m["bgb-573c"].themen.push("fuenf jahre neun monate"); },
  },
  {
    name: "titel_pruefung passt nicht - der Import wuerde die themen still verwerfen",
    erwartet: "Titel-Gate haelt",
    mutiere: (g, m) => { m["bgb-193"].titel_pruefung = "Unsinn"; },
  },
  {
    name: "Mapping-Eintrag ohne themen",
    erwartet: "Themen vorhanden",
    mutiere: (g, m) => { m["bgb-190"].themen = []; },
  },
  {
    name: "Paragraph ohne Text - die Skip-Regel des Importers waere umgangen",
    erwartet: "Kein leerer Text",
    mutiere: (g) => { g.find((e) => e.id === "bgb-190").text = "   \n  "; },
  },
  {
    name: "Verschluckte Formel - an ihrer Stelle steht nur ein Punkt",
    erwartet: "Keine verschluckten Grafiken",
    mutiere: (g) => {
      const e = g.find((x) => x.id === "bgb-189");
      e.text += "\n\nnach folgender Gleichung zu bestimmen:\n\n.\n\nDabei gilt:";
    },
  },
  {
    name: "themen in gesetze.json ohne Mapping-Eintrag - Import lief nach einer Mapping-Aenderung nicht neu",
    erwartet: "Dateien synchron",
    mutiere: (g, m) => { delete m["bgb-192"]; },
  },
  {
    name: "Fristbegriff auf einem Paragraphen ohne Zeitbezug (Originalfehler weg-44)",
    erwartet: "Fristbegriffe belegt",
    mutiere: (g, m) => { m["weg-44"].themen.push("anfechtungsfrist"); },
  },
];

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "inspectora-negativkontrolle-"));
const tempG   = path.join(tempDir, "gesetze.json");
const tempM   = path.join(tempDir, "themen-mapping.json");

const ergebnisse = [];

try {
  for (const mut of MUTATIONEN) {
    const g = JSON.parse(originalG);
    const m = JSON.parse(originalM);
    mut.mutiere(g, m);
    fs.writeFileSync(tempG, JSON.stringify(g, null, 2), "utf8");
    fs.writeFileSync(tempM, JSON.stringify(m, null, 2), "utf8");

    const lauf = spawnSync(process.execPath, [PRUEFER], {
      cwd: ROOT,
      encoding: "utf8",
      env: { ...process.env, WISSENSBASIS_GESETZE: tempG, WISSENSBASIS_MAPPING: tempM },
    });

    const zeilen = (lauf.stdout || "").split("\n");
    // Die Zeile unter der erwarteten Ueberschrift zeigen, nicht die erste beliebige
    // Fehlerzeile - eine Mutation kann mehrere Pruefungen gleichzeitig ausloesen.
    const kopf = zeilen.findIndex((z) => /^[✓✖]/.test(z.trim()) && z.includes(mut.erwartet));
    ergebnisse.push({
      name: mut.name,
      erwartet: mut.erwartet,
      exit: lauf.status,
      // Erkannt heisst: gemeldet UND als Fehler gewertet. Ein Befund ohne Exit-Code
      // waere auf einem Zeitplan unsichtbar.
      erkannt: zeilen.some((z) => z.trim().startsWith(`✖ ${mut.erwartet}`)) && lauf.status !== 0,
      zeile: kopf >= 0 ? (zeilen[kopf + 1] || "").trim() : "",
    });
  }
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

console.log("=== Negativkontrolle fuer pruefe-wissensbasis.js ===\n");

let erkannt = 0;
for (const r of ergebnisse) {
  console.log(`${r.erkannt ? "✓ ERKANNT   " : "✖ UEBERSEHEN"} exit=${r.exit}  [${r.erwartet}]`);
  console.log(`   ${r.name}`);
  if (r.zeile) console.log(`   -> ${r.zeile}`);
  console.log("");
  if (r.erkannt) erkannt++;
}

// Beweisen, dass die echten Dateien unangetastet sind.
const unveraendert =
  fs.readFileSync(GESETZE_PFAD, "utf8") === originalG &&
  fs.readFileSync(MAPPING_PFAD, "utf8") === originalM;

console.log("=================================");
console.log(`${erkannt} von ${ergebnisse.length} eingebauten Fehlern erkannt.`);
console.log(`Echte Wissensbasis unveraendert: ${unveraendert ? "ja" : "NEIN"}`);

if (erkannt !== ergebnisse.length) {
  console.error("\nFEHLGESCHLAGEN: Mindestens eine Pruefung greift ins Leere.");
  console.error("pruefe-wissensbasis.js darf so nicht auf einem Zeitplan laufen –");
  console.error("ein gruener Lauf wuerde eine Abdeckung behaupten, die es nicht gibt.");
}
if (!unveraendert) {
  console.error("\nFEHLGESCHLAGEN: Die echten Dateien wurden veraendert.");
}

process.exit(erkannt === ergebnisse.length && unveraendert ? 0 : 1);
