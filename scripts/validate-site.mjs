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
// Der Kern ist die Frage, welche IDs zu welcher Seite gehoeren. Laedt mehr als
// eine Seite app.js, referenziert app.js IDs, die es auf einer davon zu Recht
// nicht gibt. Eine gepflegte Liste "welches Modul gehoert wohin" waere genau
// die Sorte Nebenbuchhaltung, die veraltet, ohne dass es auffaellt. Deshalb
// wird die Zuordnung abgeleitet:
//
//   1. app.js in seine Top-Level-IIFEs zerlegen (ein Modul = ein Block).
//   2. Je Block alle referenzierten IDs sammeln.
//   3. IDs abziehen, die der Block selbst erzeugt (er schreibt sie per
//      innerHTML in die Seite und fragt sie danach ab - sie stehen in keiner
//      HTML-Datei und duerfen nicht als fehlend gelten).
//   4. Fordern: Es muss mindestens EINE Seite geben, die alle uebrigen IDs
//      des Blocks enthaelt.
//
// Das ist genau die Zusicherung, die zur Laufzeit gilt. Jedes Modul steigt
// aus, wenn seine Wurzel-ID fehlt (z.B. #kbCount, #menuToggle); wo diese
// Wurzel steht, muss auch alles Uebrige stehen. Faellt eine ID aus ihrer
// Seite heraus, hat keine Seite mehr den vollstaendigen Satz - und das Skript
// schlaegt an.
//
// Geprueft wird ausserdem ueber ALLE Seiten (vorher nur index.html):
// doppelte IDs, tote Sprungmarken, fehlende lokale Dateien, CSS-Klammern,
// Schluesselmuster und externe Einbindungen (Abschnitt 7).

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
// Auch url() in styles.css - vor allem die Schriftdateien. Ein falscher Pfad
// dort faellt sonst niemandem auf: Der Browser nimmt still die Systemschrift.
for (const ziel of new Set(alle(css, /url\(\s*["']?([^"')]+?)["']?\s*\)/g))) {
  if (/^(data:|https?:|\/\/|#)/i.test(ziel)) continue;
  verweise++;
  if (!fs.existsSync(path.join(root, ziel.split(/[?#]/)[0]))) {
    fail(`styles.css: verweist auf fehlende Datei: ${ziel}`);
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

// --- 7 · Externe Einbindungen ---------------------------------------------
//
// Keine Seite darf beim Laden einen fremden Server ansprechen. Jede solche
// Anfrage uebertraegt die IP-Adresse der Besucher dorthin (DSGVO), und eine
// Datei hinter "marked@13" kann sich aendern, ohne dass hier ein Commit
// passiert. Schriften und Bibliotheken liegen deshalb in fonts/ und vendor/
// (Herkunft und Pruefsummen: vendor/QUELLEN.md).
//
// Verboten ist, was LAEDT: src/srcset/poster/data an Medien- und Skript-Tags,
// <link href> (ausser canonical/alternate - die laden nichts), url() und
// @import in CSS und <style>, und in eigenem JavaScript import/fetch/.src mit
// absoluter Adresse sowie dynamisch erzeugte <script>/<link>.
// Erlaubt bleiben normale Links (<a href>) und <meta content> (og:image muss
// laut Protokoll absolut sein und wird nur von Vorschau-Diensten abgerufen).
//
// Geprueft werden alle Seiten, die Vorlage der Benchmark-Seite (sonst kommt
// die Einbindung beim naechsten "npm run baue-seite" zurueck), styles.css und
// das eigene JavaScript. vendor/ bleibt aussen vor: Das sind unveraenderte
// Fremddateien, die nichts nachladen - geprueft wurde das im Browser.
//
// Grenze: Das sind Textmuster, kein Browser. Eine Adresse, die erst zur
// Laufzeit zusammengesetzt wird, sieht diese Pruefung nicht.

const extern = (url) => /^\s*(https?:|wss?:)?\/\//i.test(url);
const VORLAGE = "benchmark/seite-vorlage.html";

const htmlQuellen = new Map(seiten);
if (fs.existsSync(path.join(root, VORLAGE))) {
  htmlQuellen.set(VORLAGE, fs.readFileSync(path.join(root, VORLAGE), "utf8"));
}
const jsQuellen = new Map();
for (const ordner of [".", "kern"]) {
  const voll = path.join(root, ordner);
  if (!fs.existsSync(voll)) continue;
  for (const f of fs.readdirSync(voll).filter((f) => /\.(js|mjs)$/.test(f)).sort()) {
    const rel = ordner === "." ? f : `${ordner}/${f}`;
    jsQuellen.set(rel, fs.readFileSync(path.join(root, rel), "utf8"));
  }
}

// Tags mit ladenden Attributen - gilt fuer HTML und fuer HTML-Vorlagen in JS.
function externeTags(text) {
  const funde = [];
  for (const m of text.matchAll(/<(script|img|iframe|frame|source|video|audio|track|embed|object|input)\b[^>]*>/gi)) {
    for (const a of m[0].matchAll(/\s(src|srcset|poster|data)\s*=\s*["']([^"']*)["']/gi)) {
      const urls = a[1].toLowerCase() === "srcset" ? a[2].split(",").map((s) => s.trim().split(/\s+/)[0]) : [a[2]];
      for (const u of urls) if (extern(u)) funde.push(`<${m[1]} ${a[1]}="${u}">`);
    }
  }
  for (const m of text.matchAll(/<link\b[^>]*>/gi)) {
    const rel = (m[0].match(/\srel\s*=\s*["']([^"']*)["']/i)?.[1] ?? "").toLowerCase().split(/\s+/);
    const href = m[0].match(/\shref\s*=\s*["']([^"']*)["']/i)?.[1] ?? "";
    if (extern(href) && !rel.every((r) => r === "canonical" || r === "alternate")) {
      funde.push(`<link rel="${rel.join(" ")}" href="${href}">`);
    }
  }
  return funde;
}

// url() und @import - fuer styles.css, <style>-Bloecke und style-Attribute.
function externesCss(text) {
  return [
    ...alle(text, /@import\s+(?:url\(\s*)?["']?([^"')\s;]+)/gi).filter(extern).map((u) => `@import ${u}`),
    ...alle(text, /url\(\s*["']?([^"')]+?)["']?\s*\)/gi).filter(extern).map((u) => `url(${u})`),
  ];
}

function externesJs(text) {
  const muster = [
    /\bimport\s*(?:[\w*{}\s,]+\s*from\s*)?["'`]([^"'`]+)["'`]/g,
    /\bimport\(\s*["'`]([^"'`]+)/g,
    /\b(?:fetch|importScripts|new\s+(?:Worker|SharedWorker|EventSource|WebSocket))\(\s*["'`]([^"'`]+)/g,
    /\.src\s*=\s*["'`]([^"'`]+)/g,
    /\.setAttribute\(\s*["'](?:src|href)["']\s*,\s*["'`]([^"'`]+)/g,
  ];
  const funde = muster.flatMap((m) => alle(text, m).filter(extern));
  // Dynamisch erzeugte Skripte/Stylesheets: Ziel meist nicht als Text sichtbar,
  // also grundsaetzlich melden. Heute gibt es keine - wer eins braucht, soll
  // hier bewusst eine Ausnahme eintragen, statt dass es still durchrutscht.
  for (const m of text.matchAll(/createElement\(\s*["'`](script|link)["'`]\s*\)/g)) {
    funde.push(`createElement("${m[1]}")`);
  }
  return funde;
}

let externGeprueft = 0;
const externFunde = [];
for (const [name, html] of htmlQuellen) {
  externGeprueft++;
  const stile = [
    ...alle(html, /<style\b[^>]*>([\s\S]*?)<\/style>/gi),
    ...alle(html, /\sstyle\s*=\s*"([^"]*)"/gi),
    ...alle(html, /\sstyle\s*=\s*'([^']*)'/gi),
  ].join("\n");
  for (const f of [...externeTags(html), ...externesCss(stile)]) externFunde.push(`${name}: ${f}`);
}
externGeprueft++;
for (const f of externesCss(css)) externFunde.push(`styles.css: ${f}`);
for (const [name, text] of jsQuellen) {
  externGeprueft++;
  for (const f of [...externeTags(text), ...externesJs(text)]) externFunde.push(`${name}: ${f}`);
}
if (externFunde.length) {
  for (const f of externFunde) fail(`externe Einbindung: ${f}`);
} else {
  pass(`Keine externen Einbindungen (${externGeprueft} Dateien: Seiten, Vorlage, styles.css, eigenes JS)`);
}

// --- Ergebnis -------------------------------------------------------------

if (fehlerZahl) {
  console.error(`\n${fehlerZahl} Fehler.`);
  process.exit(1);
}
console.log("\nSeitenpruefung bestanden.");
