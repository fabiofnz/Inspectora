#!/usr/bin/env node
// scripts/validate-site-negativkontrolle.mjs
// Aufruf: npm run validate-site:negativkontrolle
//
// Wozu das hier gehoert: validate-site.mjs meldet im Normalfall "bestanden".
// Genau das ist wertlos, solange niemand gezeigt hat, dass es ueberhaupt etwas
// melden KANN. Ein gruener Lauf beweist nichts - er kann auch heissen, dass
// eine Pruefung ins Leere greift.
//
// Das ist hier schon passiert, mit gruenem Lauf: Die alte Fassung suchte IDs
// nur als getElementById("x") und querySelector("#x"), app.js benutzt aber
// fast ueberall den Kurzhelfer $("#x"). Von ueber 140 Referenzen sah der
// Pruefer drei. Als die WEG-Werkzeuge auf eine eigene Seite umzogen - der
// Moment, fuer den diese Pruefung gedacht war - meldete er "All JavaScript id
// references exist (3 checked)" und war zufrieden. Verifiziert hat den Umzug
// am Ende ein Test von Hand im Browser, nicht der Pruefer.
//
// Deshalb: Jede Pruefung wird hier absichtlich gebrochen. Wird ein eingebauter
// Fehler NICHT gemeldet, schlaegt dieses Skript fehl.
//
// Die echten Dateien werden dabei nicht angefasst: Es wird gegen mutierte
// Kopien in einem temporaeren Verzeichnis geprueft (SITE_WURZEL in
// validate-site.mjs zeigt dorthin).

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HIER = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HIER, "..");
const PRUEFER = path.join(HIER, "validate-site.mjs");

// Was in die Kopie muss, damit der Pruefer arbeiten kann.
// Alle Dateien der Seitenwurzel, auf die eine Seite verweisen kann. Bewusst
// breit: Der Vorlauf unten hat beim ersten Lauf gemeldet, dass assistant.js und
// betriebskosten-pruefer.js fehlten - die Kontrolle haette sonst Fehler
// gemessen, die sie selbst erzeugt.
const MITNEHMEN = fs
  .readdirSync(ROOT)
  .filter((f) => /\.(html|css|js|mjs|xml)$/.test(f) && fs.statSync(path.join(ROOT, f)).isFile());

// Jede Mutation bricht genau eine Pruefung. "erwartet" ist ein Textstueck, das
// in der Fehlermeldung von validate-site.mjs vorkommen muss.
const MUTATIONEN = [
  {
    name: "ID verschwindet aus der Seite, die das Modul traegt",
    erwartet: "keine Seite enthaelt alle",
    mutiere: (dir) => {
      const p = path.join(dir, "weg-verwaltung.html");
      const s = fs.readFileSync(p, "utf8");
      if (!s.includes('id="wegTopList"')) throw new Error("wegTopList nicht gefunden");
      fs.writeFileSync(p, s.replace('id="wegTopList"', 'id="wegTopListe"'));
    },
  },
  {
    name: 'ID, die nur ueber den Kurzhelfer $("#x") referenziert wird, faellt weg',
    erwartet: "keine Seite enthaelt alle",
    mutiere: (dir) => {
      // #hgQuickGrid wird in app.js ausschliesslich als $('#hgQuickGrid')
      // nachgeschlagen - genau die Form, die der alte Pruefer nicht sah.
      const p = path.join(dir, "weg-verwaltung.html");
      const s = fs.readFileSync(p, "utf8");
      if (!s.includes('id="hgQuickGrid"')) throw new Error("hgQuickGrid nicht gefunden");
      fs.writeFileSync(p, s.replace('id="hgQuickGrid"', 'id="hgQuickGitter"'));
    },
  },
  {
    name: "Doppelte ID auf einer Seite",
    erwartet: "doppelte IDs",
    mutiere: (dir) => {
      const p = path.join(dir, "index.html");
      const s = fs.readFileSync(p, "utf8");
      fs.writeFileSync(p, s.replace("</main>", '<div id="beleg"></div></main>'));
    },
  },
  {
    name: "Sprungmarke ohne Ziel",
    erwartet: "Sprungmarken ohne Ziel",
    mutiere: (dir) => {
      const p = path.join(dir, "index.html");
      const s = fs.readFileSync(p, "utf8");
      fs.writeFileSync(p, s.replace('href="#ueber-uns"', 'href="#ueber-uns-2"'));
    },
  },
  {
    name: "Verweis auf eine Seite, die es nicht gibt",
    erwartet: "fehlende Datei",
    mutiere: (dir) => {
      const p = path.join(dir, "index.html");
      const s = fs.readFileSync(p, "utf8");
      fs.writeFileSync(p, s.replace('href="weg-verwaltung.html"', 'href="weg-werkzeuge.html"'));
    },
  },
  {
    name: "CSS-Klammer fehlt",
    erwartet: "CSS-Klammern unausgeglichen",
    mutiere: (dir) => {
      const p = path.join(dir, "styles.css");
      const s = fs.readFileSync(p, "utf8");
      const ziel = ".section>*{position:relative;z-index:1}";
      if (!s.includes(ziel)) throw new Error("Ankerregel nicht gefunden");
      fs.writeFileSync(p, s.replace(ziel, ".section>*{position:relative;z-index:1"));
    },
  },
  {
    name: "Schluesselmuster in einer oeffentlichen Datei",
    erwartet: "Schluessel- oder Tokenmuster",
    mutiere: (dir) => {
      const p = path.join(dir, "app.js");
      const s = fs.readFileSync(p, "utf8");
      fs.writeFileSync(p, s + "\n// AIzaSyD" + "x".repeat(30) + "\n");
    },
  },
];

function kopiereNach(dir) {
  fs.mkdirSync(dir, { recursive: true });
  for (const f of MITNEHMEN) fs.copyFileSync(path.join(ROOT, f), path.join(dir, f));
}

function pruefe(dir) {
  const r = spawnSync(process.execPath, [PRUEFER], {
    env: { ...process.env, SITE_WURZEL: dir },
    encoding: "utf8",
  });
  return { code: r.status, ausgabe: (r.stdout || "") + (r.stderr || "") };
}

console.log("=== Negativkontrolle fuer validate-site.mjs ===\n");

let fehlgeschlagen = 0;

// Vorlauf: Die unveraenderte Kopie muss bestehen. Sonst misst der Rest nichts.
const basis = fs.mkdtempSync(path.join(os.tmpdir(), "inspectora-site-basis-"));
kopiereNach(basis);
const vorlauf = pruefe(basis);
fs.rmSync(basis, { recursive: true, force: true });
if (vorlauf.code !== 0) {
  console.error("✖ Vorlauf: Die unveraenderte Kopie besteht die Pruefung NICHT.");
  console.error(vorlauf.ausgabe);
  process.exit(1);
}
console.log("✓ Vorlauf: unveraenderte Kopie besteht\n");

for (const m of MUTATIONEN) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "inspectora-site-"));
  try {
    kopiereNach(dir);
    m.mutiere(dir);
    const { code, ausgabe } = pruefe(dir);
    if (code === 0) {
      console.error(`✖ ${m.name}\n   Der Pruefer hat den eingebauten Fehler NICHT gemeldet.`);
      fehlgeschlagen++;
    } else if (!ausgabe.includes(m.erwartet)) {
      const gemeldet = ausgabe
        .split("\n")
        .filter((z) => z.startsWith("✖"))
        .map((z) => "   " + z)
        .join("\n");
      console.error(
        `✖ ${m.name}\n   Der Pruefer schlug an, aber nicht mit der erwarteten Begruendung ` +
          `("${m.erwartet}").\n   Gemeldet wurde:\n${gemeldet}`
      );
      fehlgeschlagen++;
    } else {
      console.log(`✓ ${m.name}`);
    }
  } catch (e) {
    console.error(`✖ ${m.name}\n   Mutation liess sich nicht anwenden: ${e.message}`);
    fehlgeschlagen++;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

console.log(
  `\n${MUTATIONEN.length - fehlgeschlagen} von ${MUTATIONEN.length} Mutationen wurden erkannt.`
);
if (fehlgeschlagen) {
  console.error("Die Pruefung greift nicht ueberall. Exit 1.");
  process.exit(1);
}
console.log("Jede eingebaute Luecke wurde gemeldet.");
