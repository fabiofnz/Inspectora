#!/usr/bin/env node
// scripts/validate-site.mjs
// Prueft die statischen Seiten gegen app.js und gegeneinander.
// Aufruf: npm run validate-site   (Exit-Code != 0, sobald etwas nicht stimmt)
//
// Warum diese Fassung: Die vorige kannte nur index.html und suchte IDs allein
// als getElementById("x") / querySelector("#x"). app.js benutzt fast ueberall
// den Kurzhelfer $("#x") - also sah das Skript 3 von ueber 140 Referenzen und
// meldete gruen. Ein Pruefer, der aus dem falschen Grund gruen meldet, ist
// schlechter als keiner: Er erzeugt Vertrauen, das er nicht deckt. Dieselbe
// Fehlerklasse wie ein Beleg, der amtlicher aussieht, als er ist.
//
// Der Kern ist die Frage, welche IDs zu welcher Seite gehoeren. Seit die
// WEG-Werkzeuge auf einer eigenen Seite liegen, referenziert app.js IDs, die
// es auf index.html zu Recht nicht gibt. Eine gepflegte Liste "welches Modul
// gehoert wohin" waere genau die Sorte Nebenbuchhaltung, die veraltet, ohne
// dass es auffaellt. Deshalb wird die Zuordnung abgeleitet:
//
//   1. app.js in seine Top-Level-IIFEs zerlegen (ein Modul = ein Block).
//   2. Je Block alle referenzierten IDs sammeln.
//   3. IDs abziehen, die der Block selbst erzeugt (er schreibt sie per
//      innerHTML in die Seite und fragt sie danach ab - sie stehen in keiner
//      HTML-Datei und duerfen nicht als fehlend gelten).
//   4. Fordern: Es muss mindestens EINE Seite geben, die alle uebrigen IDs
//      des Blocks enthaelt.
//
// Das ist genau die Zusicherung, die zur Laufzeit gilt. Jedes Werkzeugmodul
// steigt ueber seine Wurzel-ID aus (#invTool / #wegTool / #hgTool); wo diese
// Wurzel steht, muss auch alles Uebrige stehen. Faellt eine ID aus ihrer
// Seite heraus, hat keine Seite mehr den vollstaendigen Satz - und das Skript
// schlaegt an.
//
// Geprueft wird ausserdem ueber ALLE Seiten (vorher nur index.html):
// doppelte IDs, tote Sprungmarken, fehlende lokale Dateien, CSS-Klammern und
// Schluesselmuster.

import fs from "node:fs";
import path from "node:path";

const root = process.env.SITE_WURZEL || process.cwd();

let fehlerZahl = 0;
const fail = (message) => { console.error(`✖ ${message}`); fehlerZahl++; };
const pass = (message) => { console.log(`✓ ${message}`); };

// --- Dateien einsammeln ---------------------------------------------------

const pflicht = ["index.html", "styles.css", "app.js"];
for (const datei of pflicht) {
  if (!fs.existsSync(path.join(root, datei))) fail(`Pflichtdatei fehlt: ${datei}`);
}
if (fehlerZahl) process.exit(1);
pass(`Pflichtdateien vorhanden (${pflicht.join(", ")})`);

const seitenNamen = fs.readdirSync(root).filter((f) => f.endsWith(".html")).sort();
const seiten = new Map(
  seitenNamen.map((f) => [f, fs.readFileSync(path.join(root, f), "utf8")])
);
const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");
const js = fs.readFileSync(path.join(root, "app.js"), "utf8");

const alle = (text, regex) => [...text.matchAll(regex)].map((m) => m[1]);

// --- 1 · Doppelte IDs, je Seite -------------------------------------------

const idsJeSeite = new Map();
let idsGesamt = 0;
for (const [name, html] of seiten) {
  const ids = alle(html, /\bid=["']([^"']+)["']/g);
  idsGesamt += ids.length;
  const zaehler = new Map();
  for (const id of ids) zaehler.set(id, (zaehler.get(id) ?? 0) + 1);
  idsJeSeite.set(name, new Set(zaehler.keys()));
  const doppelt = [...zaehler].filter(([, n]) => n > 1).map(([id, n]) => `${id} (${n}×)`);
  if (doppelt.length) fail(`${name}: doppelte IDs: ${doppelt.join(", ")}`);
}
if (!fehlerZahl) pass(`Keine doppelten IDs (${idsGesamt} IDs auf ${seiten.size} Seiten)`);

// --- 2 · Sprungmarken, je Seite -------------------------------------------

let ankerGesamt = 0;
for (const [name, html] of seiten) {
  const anker = [...new Set(alle(html, /\bhref=["']#([^"']+)["']/g))].filter((a) => a && a !== "top");
  ankerGesamt += anker.length;
  const tot = anker.filter((a) => !idsJeSeite.get(name).has(a));
  if (tot.length) fail(`${name}: Sprungmarken ohne Ziel: ${tot.join(", ")}`);
}
if (!fehlerZahl) pass(`Alle Sprungmarken haben ein Ziel (${ankerGesamt} geprueft)`);

// --- 3 · Lokale Dateien, je Seite -----------------------------------------

let verweise = 0;
for (const [name, html] of seiten) {
  const lokal = [
    ...alle(html, /<link[^>]+href=["']([^"']+\.css)["'][^>]*>/g),
    ...alle(html, /<script[^>]+src=["']([^"']+\.js)["'][^>]*>/g),
    ...alle(html, /\bhref=["'](?!https?:|mailto:|#)([^"']+\.html)["']/g),
  ].filter((p) => !/^https?:/i.test(p));
  for (const ziel of new Set(lokal)) {
    verweise++;
    if (!fs.existsSync(path.join(root, ziel.split("#")[0]))) {
      fail(`${name}: verweist auf fehlende Datei: ${ziel}`);
    }
  }
}
if (!fehlerZahl) pass(`Alle lokalen Verweise aufloesbar (${verweise} geprueft)`);

// --- 4 · Module aus app.js gegen die Seiten -------------------------------

// app.js an der Klammertiefe in Top-Level-IIFEs zerlegen.
function moduleZerlegen(quelle) {
  const bloecke = [];
  let tiefe = 0, start = null;
  for (let i = 0; i < quelle.length; i++) {
    const c = quelle[i];
    if (c === "{") { if (tiefe === 0) start = quelle.lastIndexOf("(", i); tiefe++; }
    else if (c === "}") {
      tiefe--;
      if (tiefe === 0 && start !== null) { bloecke.push(quelle.slice(start, i + 1)); start = null; }
    }
  }
  return bloecke;
}

// Alle Formen, in denen app.js eine ID nachschlaegt - inklusive $ und $$.
const idMuster = [
  /getElementById\(\s*["']([^"']+)["']\s*\)/g,
  /querySelector(?:All)?\(\s*["']#([A-Za-z][\w-]*)["']\s*\)/g,
  /\$\$?\(\s*["']#([A-Za-z][\w-]*)["']\s*\)/g,
];
// IDs, die der Block selbst in die Seite schreibt (Vorlagen mit id="…").
const selbstMuster = /\bid=\\?["']([A-Za-z][\w-]*)\\?["']/g;

const module = moduleZerlegen(js);
if (module.length < 2) fail(`app.js liess sich nicht in Module zerlegen (${module.length} gefunden)`);

let modulGeprueft = 0, idsGeprueft = 0, selbstGesamt = 0;
module.forEach((block, i) => {
  const referenziert = new Set();
  for (const muster of idMuster) for (const m of block.matchAll(muster)) referenziert.add(m[1]);
  const selbstErzeugt = new Set([...block.matchAll(selbstMuster)].map((m) => m[1]));
  const gebraucht = [...referenziert].filter((id) => !selbstErzeugt.has(id));
  selbstGesamt += [...referenziert].filter((id) => selbstErzeugt.has(id)).length;
  if (!gebraucht.length) return;

  modulGeprueft++;
  idsGeprueft += gebraucht.length;
  const passende = seitenNamen.filter((s) => gebraucht.every((id) => idsJeSeite.get(s).has(id)));
  if (passende.length) return;

  // Keine Seite hat den vollstaendigen Satz - die naechstbeste benennen.
  const naechste = seitenNamen
    .map((s) => [s, gebraucht.filter((id) => !idsJeSeite.get(s).has(id))])
    .sort((a, b) => a[1].length - b[1].length)[0];
  fail(
    `app.js, Modul ${i + 1}: keine Seite enthaelt alle ${gebraucht.length} referenzierten IDs. ` +
    `Am naechsten dran ist ${naechste[0]}; dort fehlen: ${naechste[1].join(", ")}`
  );
});
if (!fehlerZahl) {
  pass(
    `Jedes app.js-Modul findet eine vollstaendige Seite ` +
    `(${modulGeprueft} Module, ${idsGeprueft} IDs, ${selbstGesamt} selbst erzeugte ausgenommen)`
  );
}

// --- 5 · CSS-Klammern -----------------------------------------------------

const klammern = [...css].reduce((n, c) => (c === "{" ? n + 1 : c === "}" ? n - 1 : n), 0);
if (klammern !== 0) fail(`CSS-Klammern unausgeglichen (Bilanz: ${klammern})`);
else pass("CSS-Klammern ausgeglichen");

// --- 6 · Schluesselmuster -------------------------------------------------

const schluesselMuster = [
  /sk-[A-Za-z0-9_-]{20,}/g,
  /github_pat_[A-Za-z0-9_]{20,}/g,
  /ghp_[A-Za-z0-9]{20,}/g,
  /AIza[0-9A-Za-z_-]{30,}/g,
];
const zusammen = [...seiten.values()].join("\n") + "\n" + css + "\n" + js;
const gefunden = schluesselMuster.flatMap((m) => zusammen.match(m) ?? []);
if (gefunden.length) fail("Moegliches Schluessel- oder Tokenmuster in oeffentlichen Dateien gefunden");
else pass("Keine gaengigen Schluesselmuster gefunden");

// --- Ergebnis -------------------------------------------------------------

if (fehlerZahl) {
  console.error(`\n${fehlerZahl} Fehler.`);
  process.exit(1);
}
console.log("\nSeitenpruefung bestanden.");
