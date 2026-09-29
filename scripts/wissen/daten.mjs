// scripts/wissen/daten.mjs
// Rechnet alles, was auf den Seiten unter /wissen/ steht - ueber die Engine, nie daneben.
//
// Arbeitsteilung wie bei der Benchmark-Seite (benchmark/pruefe-seite.mjs):
//   daten.mjs          - ruft die Module auf und legt fest, welcher Wert unter welchem
//                        data-pruef-Schluessel auf welcher Seite stehen muss.
//   baue-wissen.mjs    - ordnet die Werte an, rechnet selbst nichts.
//   pruefe-wissen.mjs  - liest die fertigen Seiten und haelt sie gegen diese Werte.
//
// Die Module werden ueber das Verzeichnis (kern/module.mjs) aufgerufen, nicht ueber
// ihre Dateien: So rechnen die Seiten mit genau dem, was auch der Pruefer im Browser
// und spaeter der Assistent aufruft.
//
// Alles, was hier nicht passt, WIRFT. Eine Seite, die trotzdem gebaut wuerde, saehe
// genauso belegt aus wie eine richtige.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { modul } from "../../kern/module.mjs";
import { VERDIKT, VERDIKT_ANZEIGE, falte } from "../../kern/katalog.mjs";
import { formatiereDeutsch } from "../../kern/datum.mjs";
import { JAHRE, BEGRIFFE } from "./konfig.mjs";

export const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export function ladeDaten() {
  const lies = (p) => JSON.parse(fs.readFileSync(path.join(WURZEL, p), "utf8"));
  return {
    korpus: lies("wissensbasis/gesetze.json"),
    begriffe: lies("wissensbasis/betriebskosten-begriffe.json"),
  };
}

export const pfadJahr = (jahr) => `/wissen/nebenkostenabrechnung-${jahr}-frist`;
export const pfadBegriff = (b) => `/wissen/${b.slug}`;
export const PFAD_UEBERSICHT = "/wissen/";

// Urteile, fuer die es keine Begriffsseite geben darf: Die Engine sagt dort selbst,
// dass sie die Zeile nicht als Ganzes beurteilt.
const KEINE_SEITE = [VERDIKT.MEHRERE, VERDIKT.UNBEKANNT];

class BauFehler extends Error {}
const wirf = (text) => { throw new BauFehler(text); };

// --- Fristen ---------------------------------------------------------------

function rechneJahr(jahr, daten) {
  const frist = modul("nebenkosten-frist");
  const ende = `${jahr}-12-31`;
  const a = frist.rechne({ zeitraumEndeIso: ende }, daten);
  if (!a.ok || !a.abrechnungsfrist) wirf(`Jahr ${jahr}: Abrechnungsfrist nicht berechnet (${a.grund || "?"})`);

  // Beispiel fuer die Mieterseite: Zugang am letzten Tag der Abrechnungsfrist nach
  // §§ 187, 188 - dem spaetesten Tag, der sie ohne § 193 wahrt.
  const zugang = a.abrechnungsfrist.basis.iso;
  const e = frist.rechne({ zeitraumEndeIso: ende, zugangIso: zugang }, daten);
  if (!e.ok || !e.einwendungsfrist) wirf(`Jahr ${jahr}: Einwendungsfrist nicht berechnet`);

  return {
    jahr, ende, zugang,
    pfad: pfadJahr(jahr),
    abrechnung: a.abrechnungsfrist,
    einwendung: e.einwendungsfrist,
    belege: a.belege,
    zitate: a.zitate,
    grenzen: a.grenzen,
    modul: { id: a.modul, version: a.version },
  };
}

// --- Begriffe --------------------------------------------------------------

function rechneBegriff(konf, daten) {
  const positionen = modul("nebenkosten-positionen");
  const r = positionen.rechne({ text: konf.begriff, alleZeilenPruefen: true }, daten);
  const wo = `Begriff "${konf.begriff}"`;
  if (!r.ok) wirf(`${wo}: Engine rechnet nicht (${r.grund})`);
  if (r.positionen.length !== 1) wirf(`${wo}: ${r.positionen.length} Positionen statt einer`);
  const p = r.positionen[0];
  if (p.bezeichnung !== konf.begriff) wirf(`${wo}: Engine liest "${p.bezeichnung}"`);
  if (KEINE_SEITE.includes(p.verdikt)) wirf(`${wo}: Urteil "${p.verdikt}" - dafuer gibt es keine Seite`);
  if (p.verdikt !== konf.erwartet) {
    wirf(`${wo}: Engine sagt "${p.verdikt}", Titel und Beschreibung sind fuer "${konf.erwartet}" geschrieben`);
  }
  if (!p.abdeckung.vollstaendig) wirf(`${wo}: Zeile nur teilweise bewertet (${p.abdeckung.unbewertet.join(", ")})`);

  // Der Begriff muss WOERTLICH in der Begriffsdatei stehen - sonst bewertet die Seite
  // einen Begriff, den niemand bewusst eingetragen hat.
  const gelistet = Object.entries(daten.begriffe)
    .filter(([k, v]) => !k.startsWith("_") && v && Array.isArray(v.begriffe))
    .some(([, v]) => v.begriffe.includes(konf.begriff));
  if (!gelistet) wirf(`${wo}: steht nicht woertlich in der Begriffsdatei`);

  // Eine Luecke darf im Wortlaut des § 2 tatsaechlich nicht vorkommen - die Seite
  // sagt genau das.
  if (p.verdikt === VERDIKT.LUECKE && falte(r.belege["betrkv-2"].text).includes(falte(konf.begriff))) {
    wirf(`${wo}: als Luecke gefuehrt, steht aber im Wortlaut des § 2 BetrKV`);
  }

  return {
    konf,
    pfad: pfadBegriff(konf),
    position: p,
    katalog: r.katalog,
    ausschluesse: r.ausschluesse,
    belege: r.belege,
    grenzen: r.grenzen,
    modul: { id: r.modul, version: r.version },
  };
}

// --- Alles -----------------------------------------------------------------

export function rechneAlles(daten = ladeDaten()) {
  const slugs = BEGRIFFE.map((b) => b.slug);
  if (new Set(slugs).size !== slugs.length) wirf("doppelter slug in konfig.mjs");
  if (new Set(JAHRE).size !== JAHRE.length) wirf("doppeltes Jahr in konfig.mjs");
  return {
    jahre: JAHRE.map((j) => rechneJahr(j, daten)),
    begriffe: BEGRIFFE.map((b) => rechneBegriff(b, daten)),
  };
}

// --- Werte je Seite -----------------------------------------------------------
//
// Map: Seitenpfad -> Map: data-pruef-Schluessel -> erwarteter Text.
// Jeder Wert, der auf einer Seite steht, steht hier. Der Waechter verlangt beides:
// jeder markierte Wert stimmt, und jeder Wert dieser Liste steht auf seiner Seite.

function fristWerte(praefix, frist) {
  const w = [
    [`${praefix}.basis`, frist.basis.anzeige],
    [`${praefix}.p193`, frist.verschiebung.anzeige],
  ];
  frist.schritte.forEach((s, i) => w.push([`${praefix}.schritt.${i + 1}`, s.erklaerung]));
  return w;
}

const urteilWert = (b) => [`begriff.${b.konf.slug}.urteil`, VERDIKT_ANZEIGE[b.position.verdikt]];
const fristendeWert = (j) => [`jahr.${j.jahr}.fristende`, j.abrechnung.basis.anzeige];

export function werte(r) {
  const seiten = new Map();

  seiten.set(PFAD_UEBERSICHT, new Map([
    ...r.jahre.map(fristendeWert),
    ...r.begriffe.map(urteilWert),
  ]));

  for (const j of r.jahre) {
    seiten.set(j.pfad, new Map([
      ...fristWerte(`jahr.${j.jahr}.abrechnung`, j.abrechnung),
      [`jahr.${j.jahr}.einwendung.zugang`, formatiereDeutsch(j.zugang)],
      ...fristWerte(`jahr.${j.jahr}.einwendung`, j.einwendung),
      // Die anderen Jahre, auf die diese Seite verweist.
      ...r.jahre.filter((x) => x !== j).map(fristendeWert),
    ]));
  }

  for (const b of r.begriffe) {
    const f = b.position.fundstellen[0];
    seiten.set(b.pfad, new Map([
      urteilWert(b),
      ...(f ? [[`begriff.${b.konf.slug}.fundstelle`, f.bezeichnung]] : []),
      ["katalog.anzahl", String(b.katalog.items.length)],
      ...r.begriffe.filter((x) => x !== b).map(urteilWert),
    ]));
  }

  return seiten;
}

export { BauFehler };
