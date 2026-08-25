#!/usr/bin/env node
// scripts/import-gesetze.js
// Lädt Gesetzestexte von gesetze-im-internet.de und schreibt wissensbasis/gesetze.json
// Aufruf: node scripts/import-gesetze.js
//
// Das Holen und Parsen steckt in scripts/lib/gii.js und wird mit
// scripts/pruefe-aktualitaet.js geteilt. Hier bleibt, was nur den Import angeht:
// Linkprüfung mit Stichproben, Themen-Mapping, Prüfbericht und das Schreiben
// der Datei. gii.js schreibt nichts.

"use strict";

const path = require("path");
const fs   = require("fs");

const gii = require("./lib/gii");
const { ZIEL_GESETZE, TOC_URL, headStatus, findInToc, ladeToc, holeGesetz } = gii;

// ---------------------------------------------------------------------------
// Konfiguration
// ---------------------------------------------------------------------------

const AUSGABE_PFAD = path.resolve(__dirname, "../wissensbasis/gesetze.json");
const THEMEN_MAPPING_PFAD = path.resolve(__dirname, "../wissensbasis/themen-mapping.json");
const LINK_SAMPLE  = 5;   // Anzahl Stichproben für Link-Prüfung je Gesetz

// Paragraphen, die es in der Quelle gibt, die aber keinen Text haben und deshalb
// nicht in gesetze.json landen. Wird im Prüfbericht namentlich ausgegeben.
const UEBERSPRUNGEN = [];

// ---------------------------------------------------------------------------
// Stichproben-Linkprüfung
// ---------------------------------------------------------------------------

function sample(arr, n) {
  const copy = arr.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
}

async function pruefeLinks(eintraege, gesetzId, basis, gesetzLink) {
  const mitParUrl = eintraege.filter((e) => e._parUrl);
  const stichproben = sample(mitParUrl, Math.min(LINK_SAMPLE, mitParUrl.length));

  if (!stichproben.length) {
    console.log(`  [${gesetzId}] Keine Paragraphen-URLs vorhanden – verwende Gesetzes-Link als Fallback.`);
    eintraege.forEach((e) => { e.quelle = gesetzLink; delete e._parUrl; });
    return;
  }

  console.log(`  [${gesetzId}] Prüfe ${stichproben.length} Stichproben-Links…`);
  let ok = 0;
  for (const e of stichproben) {
    const status = await headStatus(e._parUrl);
    const symbol = status === 200 ? "✓" : "✗";
    console.log(`    ${symbol} ${e._parUrl} → HTTP ${status || "Timeout"}`);
    if (status === 200) ok++;
  }

  if (ok === 0) {
    console.log(`  [${gesetzId}] Alle Stichproben fehlgeschlagen – setze Gesetzes-Link als Fallback.`);
    eintraege.forEach((e) => { e.quelle = gesetzLink; delete e._parUrl; });
  } else {
    console.log(`  [${gesetzId}] ${ok}/${stichproben.length} Links erreichbar – verwende Paragraphen-Links.`);
    eintraege.forEach((e) => {
      e.quelle = e._parUrl || gesetzLink;
      delete e._parUrl;
    });
  }
}

// ---------------------------------------------------------------------------
// Themen-Mapping
// ---------------------------------------------------------------------------

// Befüllt die "themen"-Felder in `alle` anhand von wissensbasis/themen-mapping.json.
// Sicherheitsprinzip: Themen werden NUR gesetzt, wenn "titel_pruefung" (case-insensitive)
// im tatsächlichen Titel des Paragraphen vorkommt – sonst lieber leer als eine falsche
// Zuordnung, die den Assistenten auf den falschen Gesetzestext verweisen würde.
function wendeThemenMappingAn(alle, mappingPfad) {
  const mapping = JSON.parse(fs.readFileSync(mappingPfad, "utf8"));
  const byId = new Map(alle.map((e) => [e.id, e]));

  let gesetzt = 0;
  const warnungen = [];

  for (const [id, eintrag] of Object.entries(mapping)) {
    // Alle Schlüssel mit führendem "_" sind Kommentar-/Metafelder, keine Paragraphen-IDs.
    // Ohne diese Regel würde ein zusätzlicher Kommentarschlüssel als fehlende ID gemeldet.
    if (id.startsWith("_")) continue;

    const ziel = byId.get(id);
    if (!ziel) {
      warnungen.push(`ID nicht in gesetze.json gefunden: "${id}"`);
      continue;
    }

    const pruefung = (eintrag.titel_pruefung || "").toLowerCase();
    const titelIst = (ziel.titel || "").toLowerCase();
    if (!pruefung || !titelIst.includes(pruefung)) {
      warnungen.push(
        `${id}: Titel-Prüfung "${eintrag.titel_pruefung}" nicht im tatsächlichen Titel gefunden ` +
        `– tatsächlicher Titel: "${ziel.titel}"`
      );
      continue;
    }

    ziel.themen = eintrag.themen || [];
    gesetzt++;
  }

  return { gesetzt, warnungen };
}

// ---------------------------------------------------------------------------
// Prüfbericht
// ---------------------------------------------------------------------------

function druckeBerichtFuerGesetz(id, eintraege) {
  const leer    = eintraege.filter((e) => !e.text || e.text.length < 20);
  const kurz    = eintraege.filter((e) => e.text && e.text.length >= 20 && e.text.length < 100);
  console.log(`\n  [${id}] ${eintraege.length} Paragraphen`);
  if (leer.length)  console.log(`    Leer/sehr kurz (<20 Zeichen): ${leer.map((e) => e.paragraph).join(", ")}`);
  if (kurz.length)  console.log(`    Kurz (<100 Zeichen): ${kurz.map((e) => e.paragraph).join(", ")}`);
}

function druckeParagraph(eintraege, gesetz, paragraph) {
  const e = eintraege.find((x) => x.gesetz === gesetz && x.paragraph === paragraph);
  if (!e) { console.log(`  → ${paragraph} (${gesetz}) nicht gefunden`); return; }
  console.log(`\n--- ${e.paragraph} ${e.gesetz} – ${e.titel} ---`);
  console.log(e.text.slice(0, 800) + (e.text.length > 800 ? "\n[…]" : ""));
  console.log(`Zeichen: ${e.text.length}`);
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

async function main() {
  console.log("=== Inspectora Gesetze-Import ===\n");
  console.log(`Lade Inhaltsverzeichnis: ${TOC_URL}`);

  const tocParsed = await ladeToc();

  const alle = [];

  for (const ziel of ZIEL_GESETZE) {
    console.log(`\nSuche "${ziel.id}" im TOC (Kürzel: ${ziel.slug})…`);
    const gesetzLink = findInToc(tocParsed, ziel.slug);
    if (!gesetzLink) {
      console.error(`\nFEHLER: Kürzel "${ziel.slug}" (für ${ziel.id}) wurde im TOC nicht gefunden.`);
      console.error("Abbruch – bitte den TOC manuell prüfen: " + TOC_URL);
      process.exit(1);
    }
    console.log(`  → ${gesetzLink}`);

    // gii.holeGesetz wirft bei unplausiblem Gesetzestitel, statt selbst zu beenden.
    // Der Abbruch gehört hierher: Ein falsch geladenes Gesetz darf nicht in
    // gesetze.json landen.
    let ergebnis;
    try {
      ergebnis = await holeGesetz(ziel, gesetzLink, console.log);
    } catch (err) {
      console.error(`\nFEHLER: ${err.message}`);
      console.error("Abbruch – bitte manuell prüfen.");
      process.exit(1);
    }

    for (const u of ergebnis.uebersprungen) UEBERSPRUNGEN.push(u);

    await pruefeLinks(ergebnis.eintraege, ziel.id, ergebnis.basis, gesetzLink);

    for (const e of ergebnis.eintraege) alle.push(e);
  }

  // Themen-Mapping anwenden
  console.log(`\nLade Themen-Mapping: ${THEMEN_MAPPING_PFAD}`);
  const { gesetzt: themenGesetzt, warnungen: themenWarnungen } = wendeThemenMappingAn(alle, THEMEN_MAPPING_PFAD);

  // Ausgabe schreiben
  const ausgabeDir = path.dirname(AUSGABE_PFAD);
  if (!fs.existsSync(ausgabeDir)) fs.mkdirSync(ausgabeDir, { recursive: true });
  fs.writeFileSync(AUSGABE_PFAD, JSON.stringify(alle, null, 2), "utf8");

  // Bericht
  console.log("\n\n========== PRÜFBERICHT ==========");
  for (const ziel of ZIEL_GESETZE) {
    druckeBerichtFuerGesetz(ziel.id, alle.filter((e) => e.gesetz === ziel.id));
  }

  console.log("\n--- Übersprungene Paragraphen (in der Quelle ohne Text) ---");
  if (UEBERSPRUNGEN.length) {
    for (const u of UEBERSPRUNGEN) {
      console.log(`  - ${u.gesetz} ${u.paragraph} "${u.titel}" → ${u.quelle}`);
    }
    console.log(`  ${UEBERSPRUNGEN.length} Paragraph(en) nicht in gesetze.json aufgenommen.`);
  } else {
    console.log("  Keine.");
  }

  console.log("\n--- Stichproben-Texte ---");
  druckeParagraph(alle, "WEG", "§ 24");
  druckeParagraph(alle, "BGB", "§ 543");

  console.log("\n\n========== THEMEN-MAPPING ==========");
  console.log(`${themenGesetzt} von ${alle.length} Paragraphen mit Themen versehen.`);
  if (themenWarnungen.length) {
    console.log(`\nWarnungen (${themenWarnungen.length}):`);
    for (const w of themenWarnungen) console.log(`  - ${w}`);
  } else {
    console.log("Keine Warnungen.");
  }
  console.log("=====================================");

  console.log(`\nGesamt: ${alle.length} Paragraphen → ${AUSGABE_PFAD}`);
  console.log("=================================\n");
  console.log("WICHTIG: wissensbasis/gesetze.json bitte committen und pushen –");
  console.log("         die Datei wird vom Edge-Function-Assistenten zur Laufzeit gelesen.");
}

main().catch((err) => {
  console.error("\nFEHLER:", err.message);
  process.exit(1);
});
