#!/usr/bin/env node
// scripts/pruefe-wissen.mjs
// Waechter fuer die Frageseiten unter wissen/, die Sitemap und die Liste "Was es heute
// gibt" auf der Startseite.
// Aufruf: npm run pruefe-wissen   (Exit-Code != 0, sobald etwas nicht stimmt)
// Gegenprobe: npm run pruefe-wissen:negativkontrolle
//
// Geprueft wird:
//   1. Bau        - baue-wissen laeuft durch (Engine liefert, was konfig.mjs erwartet).
//   2. Bytes      - jede erzeugte Datei steht Byte fuer Byte so auf der Platte; in
//                   wissen/ liegt nichts, was der Bau nicht erzeugt. Eine Hand-Aenderung
//                   oder ein vergessenes "npm run baue-wissen" faellt hier auf.
//   3. data-pruef - jeder markierte Wert stimmt mit der Engine, und jeder Wert, der
//                   auf eine Seite gehoert, steht dort (scripts/wissen/daten.mjs).
//   4. Zitate     - jedes data-zitat steht woertlich im Paragraphen der Wissensbasis.
//   5. Suche      - Titel (<= 60 Zeichen, eindeutig), Beschreibung (100-160), canonical,
//                   genau eine h1.
//   6. Verlinkung - jede Seite fuehrt zum Rechner, zur Uebersicht und zur amtlichen
//                   Quelle; jeder interne Link zeigt auf eine vorhandene Seite.
//   7. Zeitform   - keine Aussage, die mit dem Datum veraltet ("laeuft noch"). Die Seiten
//                   werden nicht taeglich gebaut; "Fristende: 31.12.2026" bleibt wahr,
//                   "die Frist laeuft noch" nicht.
//   8. Sitemap    - enthaelt genau die Seiten, und jede gibt es.
//   9. Bestand    - die Liste auf der Startseite entspricht Modulverzeichnis und
//                   Wissensbasis.
//
// Punkt 2 allein wuerde fast alles fangen. Die Punkte 3 bis 9 stehen trotzdem da, weil
// sie sagen, WAS nicht stimmt - und weil sie auch dann greifen, wenn jemand den Bau
// selbst kaputt macht und die Seiten danach neu erzeugt.

import fs from "node:fs";
import path from "node:path";

import { baue, dateiVon, sitemapPfade, bestandHtml, MARKE_START, MARKE_ENDE } from "./baue-wissen.mjs";
import { WURZEL, PFAD_UEBERSICHT } from "./wissen/daten.mjs";
import { SEITE } from "./wissen/konfig.mjs";
import { MODULE } from "../kern/module.mjs";

let fehler = 0;
const fail = (bereich, text) => { console.error(`FEHL  ${bereich}: ${text}`); fehler++; };
const ok = (bereich, text) => console.log(`OK    ${bereich}: ${text}`);

const RECHNER = "/nebenkostenabrechnung-frist-pruefen";
const lies = (rel) => fs.readFileSync(path.join(WURZEL, rel), "utf8");
const entschaerfe = (s) => s
  .replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
const normal = (s) => s.replace(/\s+/g, " ").trim();

// --- 1 · Bau ------------------------------------------------------------------

let bau;
try {
  bau = baue();
  ok("Bau", `${bau.dateien.size} Dateien erzeugt`);
} catch (e) {
  fail("Bau", e.message);
  console.error(`\n${fehler} Fehler.`);
  process.exit(1);
}
const { dateien, r, alleWerte, daten } = bau;
const wissenDateien = [...dateien.keys()].filter((d) => d.startsWith("wissen/"));

// --- 2 · Bytes ----------------------------------------------------------------

{
  const vorher = fehler;
  for (const [datei, inhalt] of dateien) {
    const voll = path.join(WURZEL, datei);
    if (!fs.existsSync(voll)) { fail("Bytes", `${datei} fehlt - npm run baue-wissen`); continue; }
    if (fs.readFileSync(voll, "utf8") !== inhalt) {
      fail("Bytes", `${datei} weicht vom Bau ab (von Hand geaendert oder nicht neu gebaut)`);
    }
  }
  const ordner = path.join(WURZEL, "wissen");
  for (const f of fs.existsSync(ordner) ? fs.readdirSync(ordner) : []) {
    if (!dateien.has(`wissen/${f}`)) fail("Bytes", `wissen/${f} wurde nicht erzeugt - verwaist oder von Hand angelegt`);
  }
  if (fehler === vorher) ok("Bytes", `${dateien.size} Dateien byte-gleich neu erzeugt`);
}

// Ab hier wird gelesen, was auf der Platte steht - das ist, was ausgeliefert wird.
const platte = new Map(
  [...dateien.keys()].filter((d) => fs.existsSync(path.join(WURZEL, d))).map((d) => [d, lies(d)]),
);
const seitenPfade = [...alleWerte.keys()];

// --- 3 · data-pruef -------------------------------------------------------------

{
  const vorher = fehler;
  let geprueft = 0;
  for (const pfad of seitenPfade) {
    const datei = dateiVon(pfad);
    const html = platte.get(datei);
    if (html === undefined) continue;
    const soll = alleWerte.get(pfad);
    const funde = [...html.matchAll(/<span data-pruef="([^"]+)">([^<]*)<\/span>/g)];
    const roh = (html.match(/data-pruef=/g) || []).length;
    if (roh !== funde.length) fail("data-pruef", `${datei}: ${roh - funde.length} Markierung(en) in unerwarteter Form`);
    const gesehen = new Set();
    for (const [, k, v] of funde) {
      geprueft++;
      gesehen.add(k);
      if (!soll.has(k)) { fail("data-pruef", `${datei}: unbekannter Schluessel "${k}"`); continue; }
      if (entschaerfe(v) !== soll.get(k)) {
        fail("data-pruef", `${datei}: "${k}" zeigt "${entschaerfe(v)}", die Engine sagt "${soll.get(k)}"`);
      }
    }
    for (const k of soll.keys()) if (!gesehen.has(k)) fail("data-pruef", `${datei}: Wert "${k}" fehlt auf der Seite`);
  }
  if (fehler === vorher) ok("data-pruef", `${geprueft} markierte Werte gegen die Engine gehalten`);
}

// --- 4 · Zitate -----------------------------------------------------------------

{
  const vorher = fehler;
  let geprueft = 0;
  for (const datei of wissenDateien) {
    const html = platte.get(datei);
    if (html === undefined) continue;
    for (const m of html.matchAll(/<(span|pre)\b[^>]*\bdata-zitat="([^"]+)"[^>]*>([\s\S]*?)<\/\1>/g)) {
      geprueft++;
      const schluessel = entschaerfe(m[2]);
      const i = schluessel.indexOf(" §");
      const gesetz = schluessel.slice(0, i);
      const paragraph = schluessel.slice(i + 1);
      const eintrag = daten.korpus.find((p) => p.gesetz === gesetz && p.paragraph === paragraph);
      if (!eintrag) { fail("Zitate", `${datei}: ${schluessel} steht nicht in der Wissensbasis`); continue; }
      const text = normal(entschaerfe(m[3]));
      if (!text) { fail("Zitate", `${datei}: leeres Zitat aus ${schluessel}`); continue; }
      if (!normal(eintrag.text).includes(text)) {
        fail("Zitate", `${datei}: Zitat steht so nicht in ${schluessel}: "${text.slice(0, 80)}..."`);
      }
    }
  }
  if (fehler === vorher) ok("Zitate", `${geprueft} Zitate woertlich in der Wissensbasis gefunden`);
}

// --- 5 · Suche ----------------------------------------------------------------

{
  const vorher = fehler;
  const titel = new Map();
  for (const pfad of seitenPfade) {
    const datei = dateiVon(pfad);
    const html = platte.get(datei);
    if (html === undefined) continue;
    const t = entschaerfe(html.match(/<title>([^<]*)<\/title>/)?.[1] ?? "");
    const d = entschaerfe(html.match(/<meta name="description" content="([^"]*)">/)?.[1] ?? "");
    const c = html.match(/<link rel="canonical" href="([^"]*)">/)?.[1] ?? "";
    if (!t || t.length > 60) fail("Suche", `${datei}: Titel fehlt oder ist laenger als 60 Zeichen (${t.length})`);
    if (titel.has(t)) fail("Suche", `${datei}: Titel doppelt (auch ${titel.get(t)})`);
    titel.set(t, datei);
    if (d.length < 100 || d.length > 160) fail("Suche", `${datei}: Beschreibung hat ${d.length} Zeichen (100-160)`);
    if (c !== SEITE + pfad) fail("Suche", `${datei}: canonical "${c}" statt "${SEITE + pfad}"`);
    const h1 = (html.match(/<h1[\s>]/g) || []).length;
    if (h1 !== 1) fail("Suche", `${datei}: ${h1} h1 statt einer`);
  }
  if (fehler === vorher) ok("Suche", `Titel, Beschreibung, canonical und h1 auf ${seitenPfade.length} Seiten`);
}

// --- 6 · Verlinkung -----------------------------------------------------------

function ziel(href) {
  const p = href.split(/[?#]/)[0];
  if (p === "/") return "index.html";
  const rel = p.replace(/^\//, "");
  for (const k of [rel, rel + ".html", rel.replace(/\/?$/, "/") + "index.html"]) {
    if (dateien.has(k) || (k && fs.existsSync(path.join(WURZEL, k)) && fs.statSync(path.join(WURZEL, k)).isFile())) return k;
  }
  return null;
}

{
  const vorher = fehler;
  let links = 0;
  for (const datei of wissenDateien) {
    const html = platte.get(datei);
    if (html === undefined) continue;
    const hrefs = [...html.matchAll(/<a\b[^>]*\bhref="([^"]+)"/g)].map((m) => entschaerfe(m[1]));
    if (!hrefs.some((h) => h.split(/[?#]/)[0] === RECHNER)) fail("Verlinkung", `${datei}: kein Link zum Rechner`);
    if (datei !== dateiVon(PFAD_UEBERSICHT) && !hrefs.includes(PFAD_UEBERSICHT)) fail("Verlinkung", `${datei}: kein Link zur Uebersicht`);
    if (!hrefs.some((h) => h.startsWith("https://www.gesetze-im-internet.de/"))) fail("Verlinkung", `${datei}: kein Link auf die amtliche Quelle`);
    for (const h of hrefs.filter((x) => x.startsWith("/"))) {
      links++;
      if (!ziel(h)) fail("Verlinkung", `${datei}: interner Link ohne Ziel: ${h}`);
    }
  }
  // Jede Jahresseite verweist auf alle anderen.
  for (const j of r.jahre) {
    const html = platte.get(dateiVon(j.pfad)) || "";
    for (const x of r.jahre) if (x !== j && !html.includes(`href="${x.pfad}"`)) fail("Verlinkung", `${dateiVon(j.pfad)}: kein Link auf ${x.jahr}`);
  }
  if (fehler === vorher) ok("Verlinkung", `${links} interne Links aufloesbar, Rechner/Uebersicht/Quelle auf jeder Seite`);
}

// --- 7 · Zeitform ---------------------------------------------------------------

const VERALTET = ["läuft noch", "abgelaufen", "ist vorbei", "noch Zeit", "verstrichen", "endete", "inzwischen", "heute", "bereits"];
{
  const vorher = fehler;
  for (const datei of wissenDateien) {
    // Nur der eigene Text: Gesetzeszitate (data-zitat) sagen "bereits", und das bleibt wahr.
    const text = " " + (platte.get(datei) || "")
      .replace(/<(span|pre)\b[^>]*\bdata-zitat="[^"]*"[^>]*>[\s\S]*?<\/\1>/g, " ")
      .replace(/<[^>]+>/g, " ").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ") + " ";
    for (const w of VERALTET) if (text.includes(` ${w} `)) fail("Zeitform", `${datei}: "${w}" veraltet mit dem Datum`);
  }
  if (fehler === vorher) ok("Zeitform", `keine datumsabhaengige Aussage in ${wissenDateien.length} Seiten`);
}

// --- 8 · Sitemap ---------------------------------------------------------------

{
  const vorher = fehler;
  const xml = platte.get("sitemap.xml") || "";
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  const soll = sitemapPfade(r).map((p) => SEITE + p);
  const fehlt = soll.filter((u) => !locs.includes(u));
  const zuviel = locs.filter((u) => !soll.includes(u));
  if (fehlt.length) fail("Sitemap", `es fehlen: ${fehlt.join(", ")}`);
  if (zuviel.length) fail("Sitemap", `zu viel: ${zuviel.join(", ")}`);
  if (locs.length !== new Set(locs).size) fail("Sitemap", "doppelte Eintraege");
  for (const u of locs) if (!ziel(u.slice(SEITE.length) || "/")) fail("Sitemap", `${u} hat keine Datei`);
  if (fehler === vorher) ok("Sitemap", `${locs.length} Adressen, jede mit Datei`);
}

// --- 9 · Bestand ----------------------------------------------------------------

{
  const vorher = fehler;
  const html = platte.get("index.html") || "";
  const a = html.indexOf(MARKE_START);
  const e = html.indexOf(MARKE_ENDE);
  if (a === -1 || e === -1) fail("Bestand", "index.html: BESTAND-Marken fehlen");
  else {
    const block = html.slice(a, e + MARKE_ENDE.length);
    if (block !== bestandHtml(daten)) fail("Bestand", "Liste auf der Startseite entspricht nicht Modulverzeichnis und Wissensbasis");
    for (const m of MODULE.filter((x) => x.oeffentlich)) {
      if (!block.includes(`href="${m.oeffentlich.url}"`)) fail("Bestand", `Modul ${m.id} fehlt in der Liste`);
      if (!ziel("/" + m.oeffentlich.url)) fail("Bestand", `Modul ${m.id}: ${m.oeffentlich.url} gibt es nicht`);
    }
  }
  if (fehler === vorher) ok("Bestand", `Liste "Was es heute gibt" passt (${MODULE.filter((x) => x.oeffentlich).length} Module)`);
}

// --- Ergebnis --------------------------------------------------------------------

if (fehler) {
  console.error(`\n${fehler} Fehler.`);
  process.exit(1);
}
console.log("\nFrageseiten geprueft, alles stimmt.");
