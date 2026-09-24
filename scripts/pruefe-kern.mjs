#!/usr/bin/env node
// scripts/pruefe-kern.mjs
// Aufruf: npm run pruefe-kern   (Exit-Code != 0, sobald etwas nicht stimmt)
//
// Prueft die gemeinsame Schicht der Engine - das, was jedes Modul erfuellen muss:
//   1. Modulverzeichnis (kern/module.mjs): eindeutige IDs, gueltiges Eingabeschema,
//      das Beispiel passt zum Schema und RECHNET, das Ergebnis hat das gemeinsame
//      Format (kern/ergebnis.mjs), Modul und Version im Ergebnis stimmen, und ohne
//      Wissensbasis verweigert das Modul die Rechnung.
//   2. Belege (kern/belege.mjs): Bundesrecht nur mit amtlichem Link, Landesrecht nur
//      mit Geltungsbeginn, Pruefdatum UND Bestaetigung durch einen Menschen.
//   3. Regionen (kern/region.mjs): 16 Laender, eindeutige Codes.
//   4. Benchmark: Jede Fragedatei, die ein Modul liefert, entsteht aus ihrem
//      Generator BYTE-GLEICH neu. Sonst waere der veroeffentlichte Datensatz nicht
//      mehr das, was der Code erzeugt.
//
// Mit eingebauter Negativkontrolle: Dieselben Pruefungen laufen gegen absichtlich
// kaputte Eingaben. Jede muss anschlagen - sonst beweist ein gruener Lauf nichts.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { MODULE } from "../kern/module.mjs";
import { pruefeErgebnis } from "../kern/ergebnis.mjs";
import { ladeBelege } from "../kern/belege.mjs";
import { LAENDER } from "../kern/region.mjs";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lies = (p) => JSON.parse(fs.readFileSync(path.join(WURZEL, p), "utf8"));
const DATEN = {
  korpus: lies("wissensbasis/gesetze.json"),
  begriffe: lies("wissensbasis/betriebskosten-begriffe.json"),
};

let fehler = 0;
const ok = (m) => console.log(`✓ ${m}`);
const nein = (m) => { console.error(`✖ ${m}`); fehler++; };

// --- Kleiner Schema-Pruefer: nur was die Eingabeschemata benutzen ----------
// (type object/string/boolean/array, properties, required, additionalProperties,
// pattern, items). Bewusst klein - ein unbekanntes Schluesselwort ist ein Fehler,
// damit nichts still ungeprueft bleibt.
const BEKANNT = new Set(["type", "properties", "required", "additionalProperties", "pattern", "items", "description"]);
function schemaVerstoesse(schema, wert, wo = "eingabe") {
  const v = [];
  for (const k of Object.keys(schema)) if (!BEKANNT.has(k)) v.push(`${wo}: unbekanntes Schema-Schluesselwort "${k}"`);
  const typ = Array.isArray(wert) ? "array" : typeof wert;
  if (schema.type && schema.type !== typ) return [...v, `${wo}: erwartet ${schema.type}, ist ${typ}`];
  if (schema.type === "string" && schema.pattern && !new RegExp(schema.pattern).test(wert)) v.push(`${wo}: passt nicht zu ${schema.pattern}`);
  if (schema.type === "array" && schema.items) wert.forEach((x, i) => v.push(...schemaVerstoesse(schema.items, x, `${wo}[${i}]`)));
  if (schema.type === "object") {
    for (const r of schema.required || []) if (!(r in wert)) v.push(`${wo}: Pflichtfeld ${r} fehlt`);
    for (const [k, x] of Object.entries(wert)) {
      if (schema.properties && schema.properties[k]) v.push(...schemaVerstoesse(schema.properties[k], x, `${wo}.${k}`));
      else if (schema.additionalProperties === false) v.push(`${wo}: unerwartetes Feld ${k}`);
    }
  }
  return v;
}

// --- 1. Module --------------------------------------------------------------
function modulVerstoesse(m, daten) {
  const v = [];
  if (!m.id || !m.version || !m.titel) v.push("id, version oder titel fehlt");
  if (!m.eingabeSchema || m.eingabeSchema.type !== "object") v.push("eingabeSchema fehlt oder ist kein Objekt-Schema");
  else v.push(...schemaVerstoesse(m.eingabeSchema, m.beispiel || {}, "beispiel"));
  let e;
  try { e = m.rechne(m.beispiel, daten); } catch (err) { return [...v, "rechne wirft: " + err.message]; }
  if (!e || e.ok !== true) v.push("Beispiel rechnet nicht (ok ist nicht true)");
  v.push(...pruefeErgebnis(e).map((x) => "Format: " + x));
  if (e && e.modul !== m.id) v.push(`Ergebnis nennt Modul "${e && e.modul}" statt "${m.id}"`);
  if (e && e.version !== m.version) v.push(`Ergebnis nennt Version "${e && e.version}" statt "${m.version}"`);
  if (e && Array.isArray(e.teile) && e.teile.length === 0) v.push("Beispiel liefert keine teile - taugt nicht als Beispiel");
  // Ohne Wissensbasis darf nichts herauskommen.
  let leer;
  try { leer = m.rechne(m.beispiel, { ...daten, korpus: [] }); } catch (err) { return [...v, "rechne ohne Wissensbasis wirft: " + err.message]; }
  if (!leer || leer.ok !== false) v.push("rechnet auch ohne Wissensbasis - Ergebnis ohne Beleg");
  else v.push(...pruefeErgebnis(leer).map((x) => "Format (ohne Wissensbasis): " + x));
  return v;
}
function verzeichnisVerstoesse(module) {
  const ids = module.map((m) => m.id);
  const doppelt = ids.filter((id, i) => ids.indexOf(id) !== i);
  return doppelt.length ? [`doppelte Modul-IDs: ${[...new Set(doppelt)].join(", ")}`] : [];
}

// --- 2. Belege ---------------------------------------------------------------
const B = (extra) => [{ gesetz: "X", paragraph: "§ 1", text: "Text", ...extra }];
const GESUCHT = [{ schluessel: "x-1", gesetz: "X", paragraph: "§ 1" }];
function belegRegelVerstoesse(lade) {
  const v = [];
  const faelle = [
    ["Bundesrecht mit amtlichem Link", B({ quelle: "https://www.gesetze-im-internet.de/x/__1.html" }), true],
    ["Bundesrecht mit fremdem Link", B({ quelle: "https://example.com/x" }), false],
    ["Landesrecht vollstaendig bestaetigt", B({ quellenart: "landesrecht", quelle: "https://recht.example.de/x", gueltig_ab: "2025-07-01", geprueft_am: "2026-09-24", bestaetigt_von: "Fabio" }), true],
    ["Landesrecht ohne Bestaetigung", B({ quellenart: "landesrecht", quelle: "https://recht.example.de/x", gueltig_ab: "2025-07-01", geprueft_am: "2026-09-24" }), false],
    ["Landesrecht ohne Pruefdatum", B({ quellenart: "landesrecht", quelle: "https://recht.example.de/x", gueltig_ab: "2025-07-01", bestaetigt_von: "Fabio" }), false],
    ["Landesrecht ohne https", B({ quellenart: "landesrecht", quelle: "http://recht.example.de/x", gueltig_ab: "2025-07-01", geprueft_am: "2026-09-24", bestaetigt_von: "Fabio" }), false],
    ["Unbekannte Quellenart", B({ quellenart: "blog", quelle: "https://www.gesetze-im-internet.de/x" }), false],
    ["Paragraph ohne Text", B({ text: "", quelle: "https://www.gesetze-im-internet.de/x/__1.html" }), false],
  ];
  for (const [name, korpus, erwartet] of faelle) {
    const r = lade(korpus, GESUCHT);
    if (r.ok !== erwartet) v.push(`${name}: ok=${r.ok}, erwartet ${erwartet}`);
  }
  return v;
}

// --- 3. Regionen ---------------------------------------------------------------
function regionVerstoesse(laender) {
  const v = [];
  if (laender.length !== 16) v.push(`${laender.length} Laender statt 16`);
  const codes = laender.map((l) => l.code);
  if (new Set(codes).size !== codes.length) v.push("doppelte Laender-Codes");
  if (!codes.every((c) => /^[A-Z]{2}$/.test(c))) v.push("Code nicht zweistellig");
  if (!laender.every((l) => typeof l.name === "string" && l.name.length > 2)) v.push("Name fehlt");
  return v;
}

// --- 4. Benchmark: Fragedateien byte-gleich neu erzeugt ------------------------
const sha = (buf) => crypto.createHash("sha256").update(buf).digest("hex");
function erzeugeNeu(generator) {
  const ziel = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "inspectora-kern-")), "fragen.json");
  const r = spawnSync(process.execPath, [path.join(WURZEL, generator)], {
    env: { ...process.env, BENCHMARK_AUSGABE: ziel }, encoding: "utf8",
  });
  if (r.status !== 0) throw new Error(`${generator} endet mit ${r.status}: ${(r.stderr || "").slice(0, 200)}`);
  const inhalt = fs.readFileSync(ziel);
  fs.rmSync(path.dirname(ziel), { recursive: true, force: true });
  return inhalt;
}
function fragedateiVerstoesse(veroeffentlicht, neu, name) {
  return Buffer.compare(veroeffentlicht, neu) === 0 ? [] : [`${name}: neu erzeugt ${sha(neu).slice(0, 16)}, veroeffentlicht ${sha(veroeffentlicht).slice(0, 16)}`];
}

// =============================================================================
console.log("=== Kern: Module, Belege, Regionen, Benchmark ===\n");

const vz = verzeichnisVerstoesse(MODULE);
vz.length ? vz.forEach(nein) : ok(`${MODULE.length} Module, IDs eindeutig`);
for (const m of MODULE) {
  const v = modulVerstoesse(m, DATEN);
  v.length ? v.forEach((x) => nein(`${m.id}: ${x}`)) : ok(`${m.id} ${m.version}: Schema, Beispiel, Format, Beleg-Pflicht`);
}
const bv = belegRegelVerstoesse(ladeBelege);
bv.length ? bv.forEach(nein) : ok("Belegregeln: Bundesrecht nur amtlich, Landesrecht nur bestaetigt");
const rv = regionVerstoesse(LAENDER);
rv.length ? rv.forEach(nein) : ok("16 Laender, Codes eindeutig");

const neuErzeugt = {};
for (const m of MODULE.filter((x) => x.benchmark)) {
  const { fragenDatei, generator, kategorie } = m.benchmark;
  const veroeffentlicht = fs.readFileSync(path.join(WURZEL, fragenDatei));
  let neu;
  try { neu = erzeugeNeu(generator); } catch (err) { nein(err.message); continue; }
  neuErzeugt[kategorie] = { veroeffentlicht, neu };
  const v = fragedateiVerstoesse(veroeffentlicht, neu, fragenDatei);
  v.length ? v.forEach(nein) : ok(`Benchmark "${kategorie}": ${fragenDatei} byte-gleich neu erzeugt (${sha(neu).slice(0, 16)})`);
}

// --- Negativkontrolle ----------------------------------------------------------
console.log("\n=== Negativkontrolle: absichtlich kaputte Eingaben muessen anschlagen ===\n");
const [erstes] = MODULE;
const gut = erstes.rechne(erstes.beispiel, DATEN);
const klon = (x) => JSON.parse(JSON.stringify(x));
const mitErgebnis = (aendern) => ({ ...erstes, rechne: () => { const e = klon(gut); aendern(e); return e; } });
const MUTATIONEN = [
  ["Rechenschritt zeigt auf einen Beleg, den es nicht gibt", "steht nicht in belege", () => modulVerstoesse(mitErgebnis((e) => { e.teile[0].schritte[0].beleg = "bgb-999"; }), DATEN)],
  ["Grenzen fehlen", "grenzen fehlen", () => modulVerstoesse(mitErgebnis((e) => { e.grenzen = []; }), DATEN)],
  ["Modulname im Ergebnis fehlt", "modul fehlt", () => modulVerstoesse(mitErgebnis((e) => { e.modul = ""; }), DATEN)],
  ["Version im Ergebnis weicht ab", "nennt Version", () => modulVerstoesse(mitErgebnis((e) => { e.version = "9.9.9"; }), DATEN)],
  ["Beleg ohne Quelle", "ohne Quelle", () => modulVerstoesse(mitErgebnis((e) => { e.belege[e.teile[0].schritte[0].beleg].quelle = ""; }), DATEN)],
  ["Rechenschritt ohne Erklaerung", "erklaerung fehlt", () => modulVerstoesse(mitErgebnis((e) => { e.teile[0].schritte[0].erklaerung = ""; }), DATEN)],
  ["Modul rechnet auch ohne Wissensbasis", "rechnet auch ohne Wissensbasis", () => modulVerstoesse({ ...erstes, rechne: (ein, d) => (d.korpus.length ? erstes.rechne(ein, d) : klon(gut)) }, DATEN)],
  ["ok:false ohne Grund", "ok:false ohne grund", () => modulVerstoesse({ ...erstes, rechne: (ein, d) => (d.korpus.length ? erstes.rechne(ein, d) : { ok: false, modul: erstes.id, version: erstes.version }) }, DATEN)],
  ["Beispiel passt nicht zum Schema", "unerwartetes Feld", () => modulVerstoesse({ ...erstes, beispiel: { ...erstes.beispiel, unbekannt: 1 } }, DATEN)],
  ["Datum im Beispiel falsch formatiert", "passt nicht zu", () => modulVerstoesse({ ...erstes, beispiel: { zeitraumEndeIso: "31.12.2025" } }, DATEN)],
  ["Zwei Module mit derselben ID", "doppelte Modul-IDs", () => verzeichnisVerstoesse([...MODULE, MODULE[0]])],
  ["Landesrecht ohne Bestaetigung gilt als Beleg", "Landesrecht ohne Bestaetigung", () => belegRegelVerstoesse((k, g) => ladeBelege(k.map((x) => ({ ...x, bestaetigt_von: x.bestaetigt_von || "jemand" })), g))],
  ["Fremder Link gilt als amtlich", "Bundesrecht mit fremdem Link", () => belegRegelVerstoesse((k, g) => ladeBelege(k.map((x) => ({ ...x, quelle: x.quelle && x.quelle.replace("https://example.com", "https://www.gesetze-im-internet.de") })), g))],
  ["Ein Land doppelt", "doppelte Laender-Codes", () => regionVerstoesse([...LAENDER.slice(0, 15), LAENDER[0]])],
  ["Ein Land fehlt", "15 Laender statt 16", () => regionVerstoesse(LAENDER.slice(0, 15))],
  ["Fragedatei weicht um ein Byte ab", "neu erzeugt", () => { const f = Object.values(neuErzeugt)[0]; return fragedateiVerstoesse(f.veroeffentlicht, Buffer.concat([f.neu, Buffer.from(" ")]), "fragen"); }],
];
// Nicht nur OB, sondern WARUM: Schlaegt eine Mutation aus einem anderen Grund an,
// deckt die Pruefung, fuer die sie gedacht ist, womoeglich nichts ab.
for (const [name, grund, lauf] of MUTATIONEN) {
  let v; try { v = lauf(); } catch (err) { v = ["wirft: " + err.message]; }
  if (!v.length) nein(`NICHT erkannt: ${name}`);
  else if (!v.some((x) => x.includes(grund))) nein(`${name}: erkannt, aber aus anderem Grund - gemeldet: ${v.join(" | ")}`);
  else ok(`erkannt: ${name}`);
}

console.log(fehler ? `\n${fehler} Fehler.` : `\nKern geprueft, ${MUTATIONEN.length} von ${MUTATIONEN.length} Mutationen erkannt.`);
process.exit(fehler ? 1 : 0);
