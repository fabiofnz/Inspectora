#!/usr/bin/env node
// scripts/pruefe-wissen-negativkontrolle.mjs
// Aufruf: npm run pruefe-wissen:negativkontrolle
//
// pruefe-wissen.mjs meldet im Normalfall "alles stimmt". Das beweist nichts, solange
// niemand gezeigt hat, dass es etwas melden KANN. Deshalb wird hier jede Pruefung
// absichtlich gebrochen - auf einer Kopie in einem temporaeren Verzeichnis, die echten
// Dateien bleiben unberuehrt. Wird ein eingebauter Fehler NICHT unter dem erwarteten
// Bereich gemeldet, schlaegt dieses Skript fehl.
//
// Die Kopie enthaelt auch kern/, scripts/ und die Wissensbasis: pruefe-wissen.mjs
// findet seine Wurzel ueber den eigenen Speicherort, also laeuft die Kopie gegen die
// Kopie.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const ORDNER = ["kern", "scripts/wissen", "wissensbasis", "wissen"];
const DATEIEN = [
  "scripts/baue-wissen.mjs", "scripts/pruefe-wissen.mjs",
  "index.html", "sitemap.xml", "nebenkostenabrechnung-frist-pruefen.html",
  "mietrecht-benchmark.html", "ki-assistent.html",
];

const JAHR = "wissen/nebenkostenabrechnung-2025-frist.html";
const RAUCH = "wissen/rauchmelder-nebenkosten.html";

function ersetze(dir, datei, suchen, ersetzen, alle = false) {
  const p = path.join(dir, datei);
  const s = fs.readFileSync(p, "utf8");
  if (!s.includes(suchen)) throw new Error(`Mutation greift nicht mehr: "${suchen.slice(0, 60)}" steht nicht in ${datei}`);
  fs.writeFileSync(p, alle ? s.split(suchen).join(ersetzen) : s.replace(suchen, ersetzen));
}

// "erwartet" ist der Bereich, unter dem pruefe-wissen.mjs melden muss ("FEHL  <bereich>:").
const MUTATIONEN = [
  {
    name: "Fristende auf der Jahresseite von Hand geaendert",
    erwartet: "data-pruef",
    mutiere: (d) => ersetze(d, JAHR, '<span data-pruef="jahr.2025.abrechnung.basis">Donnerstag, 31.12.2026</span>',
      '<span data-pruef="jahr.2025.abrechnung.basis">Freitag, 01.01.2027</span>'),
  },
  {
    name: "Markierung eines Engine-Werts entfernt",
    erwartet: "data-pruef",
    mutiere: (d) => ersetze(d, JAHR, '<span data-pruef="jahr.2025.abrechnung.p193">', "<span>"),
  },
  {
    name: "Gesetzeszitat verfaelscht (dreizehnter statt zwoelfter Monat)",
    erwartet: "Zitate",
    mutiere: (d) => ersetze(d, JAHR, "bis zum Ablauf des zwölften Monats nach Ende", "bis zum Ablauf des dreizehnten Monats nach Ende"),
  },
  {
    name: "Seite fehlt in der Sitemap",
    erwartet: "Sitemap",
    mutiere: (d) => {
      const p = path.join(d, "sitemap.xml");
      const s = fs.readFileSync(p, "utf8");
      const neu = s.replace(/  <url>\n    <loc>[^<]*rauchmelder-nebenkosten<\/loc>[\s\S]*?<\/url>\n/, "");
      if (neu === s) throw new Error("Mutation greift nicht mehr: Sitemap-Eintrag nicht gefunden");
      fs.writeFileSync(p, neu);
    },
  },
  {
    name: "Verwaiste Seite in wissen/",
    erwartet: "Bytes",
    mutiere: (d) => fs.writeFileSync(path.join(d, "wissen/alt.html"), "<!doctype html><title>alt</title>"),
  },
  {
    name: "Text einer Seite von Hand geaendert (ausserhalb jeder Markierung)",
    erwartet: "Bytes",
    mutiere: (d) => ersetze(d, RAUCH, "Diese Seite zeigt, was die", "Diese Seite erklärt, was die"),
  },
  {
    name: "Engine-Urteil passt nicht mehr zur Konfiguration",
    erwartet: "Bau",
    mutiere: (d) => ersetze(d, "scripts/wissen/konfig.mjs", 'erwartet: "im-gesetz-nicht-genannt",\n    titel: "Rauchmelder',
      'erwartet: "im-katalog",\n    titel: "Rauchmelder'),
  },
  {
    name: "Neues Gesetz in der Wissensbasis ohne Bereichsnamen",
    erwartet: "Bau",
    mutiere: (d) => {
      const p = path.join(d, "wissensbasis/gesetze.json");
      const k = JSON.parse(fs.readFileSync(p, "utf8"));
      k.push({ gesetz: "GrEStG", paragraph: "§ 1", titel: "Test", text: "Test", quelle: "https://www.gesetze-im-internet.de/grestg_1983/__1.html" });
      fs.writeFileSync(p, JSON.stringify(k, null, 2));
    },
  },
  {
    name: "Titel zu lang",
    erwartet: "Suche",
    mutiere: (d) => ersetze(d, RAUCH, "<title>Rauchmelder umlagefähig? Was die BetrKV sagt</title>",
      "<title>Rauchmelder umlagefähig? Was die Betriebskostenverordnung dazu im Wortlaut sagt</title>"),
  },
  {
    name: "Link zum Rechner fehlt",
    erwartet: "Verlinkung",
    mutiere: (d) => ersetze(d, RAUCH, 'href="/nebenkostenabrechnung-frist-pruefen', 'href="/rechner', true),
  },
  {
    name: "Datumsabhaengige Aussage auf einer Jahresseite",
    erwartet: "Zeitform",
    mutiere: (d) => ersetze(d, JAHR, "<h2>Bis wann muss die Abrechnung beim Mieter sein?</h2>",
      "<h2>Bis wann muss die Abrechnung beim Mieter sein?</h2>\n      <p>Die Frist läuft noch.</p>"),
  },
  {
    name: "Eintrag aus \"Was es heute gibt\" von Hand entfernt",
    erwartet: "Bestand",
    mutiere: (d) => {
      const p = path.join(d, "index.html");
      const s = fs.readFileSync(p, "utf8");
      const neu = s.replace(/\n\s*<li><a href="mietrecht-benchmark\.html">[^\n]*<\/li>/, "");
      if (neu === s) throw new Error("Mutation greift nicht mehr: Benchmark-Eintrag nicht gefunden");
      fs.writeFileSync(p, neu);
    },
  },
];

function kopie(ziel) {
  for (const o of ORDNER) fs.cpSync(path.join(ROOT, o), path.join(ziel, o), { recursive: true });
  for (const f of DATEIEN) {
    fs.mkdirSync(path.dirname(path.join(ziel, f)), { recursive: true });
    fs.copyFileSync(path.join(ROOT, f), path.join(ziel, f));
  }
}

function pruefe(dir) {
  const lauf = spawnSync(process.execPath, [path.join(dir, "scripts/pruefe-wissen.mjs")], { encoding: "utf8" });
  return { code: lauf.status, ausgabe: (lauf.stdout || "") + (lauf.stderr || "") };
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "inspectora-wissen-"));
let gescheitert = 0;

console.log("\nNegativkontrolle Frageseiten - jede Pruefung wird absichtlich gebrochen\n");

{
  const d = path.join(tmp, "unveraendert");
  kopie(d);
  const { code, ausgabe } = pruefe(d);
  if (code === 0) console.log("OK    Kontrolllauf ohne Mutation ist gruen");
  else {
    console.log("FEHL  Kontrolllauf ohne Mutation ist bereits rot - die Mutationen sagen dann nichts aus");
    console.log(ausgabe.split("\n").filter((z) => z.startsWith("FEHL")).map((z) => "      " + z).join("\n"));
    gescheitert++;
  }
}

MUTATIONEN.forEach((m, i) => {
  const d = path.join(tmp, "m" + i);
  kopie(d);
  try { m.mutiere(d); } catch (e) {
    console.log(`FEHL  ${m.name}\n      ${e.message}`);
    gescheitert++;
    return;
  }
  const { code, ausgabe } = pruefe(d);
  const gemeldet = ausgabe.includes(`FEHL  ${m.erwartet}:`);
  if (code !== 0 && gemeldet) {
    console.log(`OK    ${m.name}\n      gemeldet unter: ${m.erwartet}`);
  } else {
    console.log(`FEHL  ${m.name}\n      ${code === 0 ? "NICHT gemeldet - die Pruefung greift ins Leere" : `rot, aber nicht unter "${m.erwartet}"`}`);
    gescheitert++;
  }
});

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${MUTATIONEN.length + 1 - gescheitert} von ${MUTATIONEN.length + 1} Kontrollen bestanden.`);
process.exit(gescheitert ? 1 : 0);
