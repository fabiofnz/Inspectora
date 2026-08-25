#!/usr/bin/env node
// scripts/pruefe-aktualitaet-negativkontrolle.js
// Aufruf: npm run pruefe-aktualitaet:negativkontrolle
//
// Wozu: pruefe-aktualitaet.js meldet im Normalfall "keine Aenderung festgestellt".
// Das ist wertlos, solange niemand gezeigt hat, dass es ueberhaupt etwas melden
// KANN. Ein gruener Lauf kann auch heissen, dass ein Vergleich ins Leere greift.
//
// WAS DIESE KONTROLLE NICHT PRUEFT - bitte lesen, bevor man ihr vertraut:
// Sie prueft die EINORDNUNG von Unterschieden, nicht das Holen der Quelle.
// Gearbeitet wird mit einem kleinen kuenstlichen Bestand und einem vorbereiteten
// Quell-Stand aus einer Datei (AKTUALITAET_SNAPSHOT), damit die Kontrolle schnell,
// offline und reproduzierbar ist. Ob fetchBuffer, das ZIP-Entpacken, der XML-Parser
// und die TOC-Suche funktionieren, ist damit AUSDRUECKLICH NICHT gezeigt - das
// zeigt nur der echte Lauf gegen gesetze-im-internet.de.
// Einzige Ausnahme: QUELLE_TOT wird gegen eine echte 404-URL geprueft, weil ein
// nachgebauter toter Link nichts beweisen wuerde.
//
// Zusaetzlich wird geprueft, dass ein FEHLER (Quelle nicht lesbar) mit Exit-Code 2
// endet und nicht mit 1. Diese Unterscheidung ist der Kern des Pruefers: Ein roter
// Lauf wegen fehlendem Netz darf nie wie eine Gesetzesaenderung aussehen.

"use strict";

const fs   = require("fs");
const os   = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT    = path.resolve(__dirname, "..");
const PRUEFER = path.join(ROOT, "scripts/pruefe-aktualitaet.js");

const EXIT_OK     = 0;
const EXIT_BEFUND = 1;
const EXIT_FEHLER = 2;

// Eine URL, die es auf gesetze-im-internet.de nicht gibt.
const TOTER_LINK = "https://www.gesetze-im-internet.de/bgb/__99999.html";

// ---------------------------------------------------------------------------
// Kuenstlicher Bestand
// ---------------------------------------------------------------------------

const eintrag = (id, gesetz, paragraph, titel, text, quelle) => ({
  id, gesetz,
  gesetz_lang: gesetz === "BGB" ? "Bürgerliches Gesetzbuch" : "Wohnungseigentumsgesetz",
  paragraph, titel, text,
  themen: [],
  stand: "Testfassung",
  quelle,
  hinweis: "Kuenstlicher Eintrag der Negativkontrolle - nicht aus der Quelle.",
});

function basisBestand() {
  return [
    eintrag("bgb-193", "BGB", "§ 193", "Sonn- und Feiertag; Sonnabend",
      "Faellt der letzte Tag der Frist auf einen Sonntag, einen Feiertag oder einen Sonnabend,\nso tritt an die Stelle eines solchen Tages der naechste Werktag.",
      "https://www.gesetze-im-internet.de/bgb/__193.html"),
    eintrag("bgb-187", "BGB", "§ 187", "Fristbeginn",
      "Ist fuer den Anfang einer Frist ein Ereignis massgebend, so wird der Tag nicht mitgerechnet,\nin welchen das Ereignis faellt.",
      "https://www.gesetze-im-internet.de/bgb/__187.html"),
    eintrag("weg-45", "WEG", "§ 45", "Fristen der Anfechtungsklage",
      "Die Anfechtungsklage muss innerhalb eines Monats nach der Beschlussfassung erhoben\nund innerhalb zweier Monate begruendet werden.",
      "https://www.gesetze-im-internet.de/woeigg/__45.html"),
  ];
}

// ---------------------------------------------------------------------------
// Faelle
// ---------------------------------------------------------------------------

const FAELLE = [
  {
    name: "Grundfall: Bestand und Quelle sind gleich",
    erwartetExit: EXIT_OK,
    erwartetArt: null, // kein Befund
    baue: (bestand) => ({ bestand, quelle: { eintraege: basisBestand(), uebersprungen: [] } }),
  },
  {
    name: "Text eines Paragraphen in der Quelle geaendert",
    erwartetExit: EXIT_BEFUND,
    erwartetArt: "TEXT_GEAENDERT",
    baue: (bestand) => {
      const q = basisBestand();
      q.find((e) => e.id === "bgb-193").text += "\nDies gilt auch fuer die Abgabe einer Willenserklaerung.";
      return { bestand, quelle: { eintraege: q, uebersprungen: [] } };
    },
  },
  {
    name: "Titel eines Paragraphen in der Quelle geaendert",
    erwartetExit: EXIT_BEFUND,
    erwartetArt: "TITEL_GEAENDERT",
    baue: (bestand) => {
      const q = basisBestand();
      q.find((e) => e.id === "bgb-187").titel = "Beginn der Frist";
      return { bestand, quelle: { eintraege: q, uebersprungen: [] } };
    },
  },
  {
    name: "Neuer Paragraph in der Quelle (der Fall § 559f)",
    erwartetExit: EXIT_BEFUND,
    erwartetArt: "NEU_IN_QUELLE",
    baue: (bestand) => {
      const q = basisBestand();
      q.push(eintrag("bgb-559f", "BGB", "§ 559f", "Mieterhoehung nach Einbau einer Waermepumpe",
        "Der Vermieter kann die volle Umlage nur bei nachgewiesener Jahresarbeitszahl von mindestens 2,5 verlangen.",
        "https://www.gesetze-im-internet.de/bgb/__559f.html"));
      return { bestand, quelle: { eintraege: q, uebersprungen: [] } };
    },
  },
  {
    name: "Paragraph in der Quelle nicht mehr vorhanden",
    erwartetExit: EXIT_BEFUND,
    erwartetArt: "ENTFALLEN",
    baue: (bestand) => ({
      bestand,
      quelle: { eintraege: basisBestand().filter((e) => e.id !== "weg-45"), uebersprungen: [] },
    }),
  },
  {
    name: "Paragraph in der Quelle jetzt ohne Text (der Fall HeizkostenV §§ 13/14)",
    erwartetExit: EXIT_BEFUND,
    erwartetArt: "ENTFALLEN",
    baue: (bestand) => ({
      bestand,
      quelle: {
        eintraege: basisBestand().filter((e) => e.id !== "weg-45"),
        uebersprungen: [{ gesetz: "WEG", paragraph: "§ 45", titel: "Fristen der Anfechtungsklage", quelle: "x" }],
      },
    }),
  },
  {
    name: "Quell-Link im Bestand ist tot (echte 404-URL, mit Netz)",
    erwartetExit: EXIT_BEFUND,
    erwartetArt: "QUELLE_TOT",
    linkpruefung: true,
    baue: (bestand) => {
      const b = bestand.map((e) => ({ ...e }));
      b.find((e) => e.id === "bgb-187").quelle = TOTER_LINK;
      return { bestand: b, quelle: { eintraege: basisBestand(), uebersprungen: [] } };
    },
  },
  {
    name: "Quelle nicht lesbar - muss FEHLER sein (Exit 2), nicht Befund (Exit 1)",
    erwartetExit: EXIT_FEHLER,
    erwartetArt: null,
    snapshotKaputt: true,
    baue: (bestand) => ({ bestand, quelle: null }),
  },
];

// ---------------------------------------------------------------------------
// Ausfuehren
// ---------------------------------------------------------------------------

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "inspectora-aktualitaet-"));
const bestandPfad  = path.join(tempDir, "gesetze.json");
const snapshotPfad = path.join(tempDir, "snapshot.json");

const ergebnisse = [];

try {
  for (const fall of FAELLE) {
    const { bestand, quelle } = fall.baue(basisBestand());
    fs.writeFileSync(bestandPfad, JSON.stringify(bestand, null, 2), "utf8");

    if (fall.snapshotKaputt) {
      fs.writeFileSync(snapshotPfad, "{ das ist kein gueltiges JSON", "utf8");
    } else {
      fs.writeFileSync(snapshotPfad, JSON.stringify(quelle, null, 2), "utf8");
    }

    const lauf = spawnSync(process.execPath, [PRUEFER], {
      cwd: ROOT,
      encoding: "utf8",
      env: {
        ...process.env,
        WISSENSBASIS_GESETZE: bestandPfad,
        AKTUALITAET_SNAPSHOT: snapshotPfad,
        AKTUALITAET_LINKPRUEFUNG: fall.linkpruefung ? "1" : "0",
      },
    });

    const ausgabe = (lauf.stdout || "") + (lauf.stderr || "");
    const zeilen = ausgabe.split("\n");
    const artGemeldet = fall.erwartetArt
      ? zeilen.some((z) => z.trim().startsWith(`✖ ${fall.erwartetArt}`))
      : true;
    const kopf = fall.erwartetArt
      ? (zeilen[zeilen.findIndex((z) => z.trim().startsWith(`✖ ${fall.erwartetArt}`)) + 1] || "").trim()
      : "";

    ergebnisse.push({
      name: fall.name,
      erwartetExit: fall.erwartetExit,
      exit: lauf.status,
      erwartetArt: fall.erwartetArt,
      bestanden: lauf.status === fall.erwartetExit && artGemeldet,
      kopf,
    });
  }
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// Ausgabe
// ---------------------------------------------------------------------------

console.log("=== Negativkontrolle fuer pruefe-aktualitaet.js ===\n");

let ok = 0;
for (const r of ergebnisse) {
  const marke = r.bestanden ? "✓ OK        " : "✖ FEHLER    ";
  console.log(`${marke} exit=${r.exit} (erwartet ${r.erwartetExit})` +
              (r.erwartetArt ? `  [${r.erwartetArt}]` : "  [kein Befund erwartet]"));
  console.log(`   ${r.name}`);
  if (r.kopf) console.log(`   -> ${r.kopf}`);
  console.log("");
  if (r.bestanden) ok++;
}

console.log("=================================");
console.log(`${ok} von ${ergebnisse.length} Faellen wie erwartet.`);
console.log("Geprueft wurde die Einordnung von Unterschieden, NICHT das Holen der");
console.log("Quelle. Ob Netzzugriff, ZIP und XML-Parser funktionieren, zeigt nur");
console.log("der echte Lauf: npm run pruefe-aktualitaet");

if (ok !== ergebnisse.length) {
  console.error("\nFEHLGESCHLAGEN: Mindestens ein Fall wurde nicht wie erwartet behandelt.");
  console.error("pruefe-aktualitaet.js darf so nicht auf einem Zeitplan laufen.");
}

process.exit(ok === ergebnisse.length ? 0 : 1);
