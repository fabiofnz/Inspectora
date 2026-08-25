#!/usr/bin/env node
// scripts/pruefe-aktualitaet.js
// Vergleicht wissensbasis/gesetze.json mit dem aktuellen Stand auf
// gesetze-im-internet.de. Aufruf: npm run pruefe-aktualitaet
//
// NUR BERICHT. Dieses Skript schreibt die Wissensbasis nicht. Es kann das auch
// nicht: Die gemeinsame Hol- und Parse-Schicht scripts/lib/gii.js enthaelt keine
// Schreibfunktion, und hier wird kein fs-Schreibzugriff verwendet.
//
// Warum es das gibt: Am 25.08.2026 stellte sich heraus, dass drei BGB-Paragraphen
// seit rund einem Monat veraltet im Bestand standen (§ 559f neu, §§ 555b und 559e
// geaendert). Aufgefallen ist das nur, weil der Import aus einem anderen Grund neu
// lief. Kein Feld hat es angezeigt - insbesondere blieb "stand" bei allen 180
// vorher vorhandenen Paragraphen unveraendert, waehrend sich der Text aenderte.
// Deshalb wird hier der TEXT verglichen und nicht "stand".
//
// EXIT-CODES - die Unterscheidung ist der Kern dieses Skripts:
//   0  Bestand deckt sich mit der Quelle
//   1  BEFUND: Die Quelle hat sich geaendert (Gesetzesaenderung)
//   2  FEHLER: Die Quelle war nicht erreichbar oder nicht lesbar
//
// 1 und 2 duerfen nie verwechselt werden. Ein roter Lauf, weil der Runner kein
// Netz hat, sieht sonst aus wie eine Gesetzesaenderung - und eine echte
// Gesetzesaenderung sieht aus wie eine Netzstoerung, die man wegklickt.

"use strict";

const fs   = require("fs");
const path = require("path");

const { holeAlleGesetze, headStatus, QuellFehler } = require("./lib/gii");

const EXIT_OK      = 0;
const EXIT_BEFUND  = 1;
const EXIT_FEHLER  = 2;

const GESETZE_PFAD = process.env.WISSENSBASIS_GESETZE
  || path.resolve(__dirname, "../wissensbasis/gesetze.json");

// Statt zu holen einen vorbereiteten Stand aus einer Datei lesen. Nur fuer die
// Negativkontrolle gedacht: Die soll die Einordnung von Unterschieden pruefen,
// nicht das Netz.
const SNAPSHOT_PFAD = process.env.AKTUALITAET_SNAPSHOT || "";

// Linkpruefung abschaltbar - sie ist der langsamste Teil (ein HEAD je Paragraph).
const LINKPRUEFUNG = process.env.AKTUALITAET_LINKPRUEFUNG !== "0";
const LINK_PARALLEL = 8;

const DIFF_ZEILEN   = 6;    // wie viele geaenderte Zeilen je Paragraph gezeigt werden
const DIFF_BREITE   = 220;  // wie lang eine gezeigte Zeile hoechstens ist

// Ein Timeout und ein HTTP 403 sind verschiedene Probleme und brauchen
// verschiedene naechste Schritte. Sie duerfen im Bericht nicht gleich aussehen.
const DIAGNOSE = {
  TIMEOUT: [
    "Die Gegenstelle hat weder geantwortet noch abgelehnt - die Anfrage lief ins Leere.",
    "Typisch fuer eine nicht routbare Adresse (z.B. IPv6 ohne Route) oder eine Firewall,",
    "die Pakete verwirft statt sie abzulehnen. Pruefen: Kommt man ueber IPv4 durch?",
  ],
  HTTP_STATUS: [
    "Die Gegenstelle hat geantwortet, aber mit einem Fehlerstatus.",
    "403/429: Zugriff abgelehnt oder gedrosselt - vermutlich Filterung nach Herkunft.",
    "404: Die URL-Struktur der Quelle hat sich geaendert - dann muss gii.js angepasst werden.",
  ],
  DNS: [
    "Der Hostname liess sich nicht aufloesen.",
    "Pruefen: DNS-Server der Umgebung, Tippfehler in der URL, Domain umgezogen.",
  ],
  VERBINDUNG: [
    "Die Verbindung wurde abgelehnt oder abgebrochen.",
    "Im Unterschied zum Timeout hat hier etwas geantwortet - meist ein Proxy oder eine Firewall.",
  ],
  TLS: [
    "Das Zertifikat der Gegenstelle wurde nicht akzeptiert.",
    "Pruefen: abgelaufenes Zertifikat, TLS-aufbrechender Proxy, veraltetes Wurzelzertifikat.",
  ],
  REDIRECT: [
    "Die Quelle leitet im Kreis oder zu oft weiter.",
    "Pruefen: Hat sich die URL-Struktur geaendert?",
  ],
  NETZ: [
    "Netzwerkfehler ohne genauere Einordnung - siehe Fehlercode oben.",
  ],
  UNBEKANNT: [
    "Die Ursache liess sich nicht einordnen - siehe Meldung oben.",
  ],
};

// ---------------------------------------------------------------------------
// Hilfen
// ---------------------------------------------------------------------------

function ladeJson(pfad, was) {
  let roh;
  try {
    roh = fs.readFileSync(pfad, "utf8");
  } catch (err) {
    console.error(`FEHLER: ${was} nicht lesbar (${pfad}) - ${err.message}`);
    process.exit(EXIT_FEHLER);
  }
  try {
    return JSON.parse(roh);
  } catch (err) {
    console.error(`FEHLER: ${was} ist kein gueltiges JSON (${pfad}) - ${err.message}`);
    process.exit(EXIT_FEHLER);
  }
}

function kuerze(zeile) {
  const z = zeile.trim();
  return z.length > DIFF_BREITE ? z.slice(0, DIFF_BREITE) + " […]" : z;
}

// Zeilenweiser Unterschied. Bewusst kein vollstaendiges Diff: Es soll erkennbar
// sein, WAS sich geaendert hat, ohne den Paragraphen komplett auszugeben.
function textUnterschied(alt, neu) {
  const altZeilen = alt.split("\n").map((z) => z.trim()).filter(Boolean);
  const neuZeilen = neu.split("\n").map((z) => z.trim()).filter(Boolean);
  const altSet = new Set(altZeilen);
  const neuSet = new Set(neuZeilen);
  return {
    hinzu: neuZeilen.filter((z) => !altSet.has(z)),
    weg:   altZeilen.filter((z) => !neuSet.has(z)),
  };
}

async function pruefeLinksParallel(eintraege) {
  const tot = [];
  let index = 0;
  async function arbeiter() {
    while (index < eintraege.length) {
      const e = eintraege[index++];
      if (!e.quelle) { tot.push({ eintrag: e, status: 0 }); continue; }
      const status = await headStatus(e.quelle);
      if (status !== 200) tot.push({ eintrag: e, status });
    }
  }
  await Promise.all(Array.from({ length: LINK_PARALLEL }, arbeiter));
  return tot;
}

// ---------------------------------------------------------------------------
// Quelle holen
// ---------------------------------------------------------------------------

// Rueckgabe: { eintraege, uebersprungen }
async function holeQuelle() {
  if (SNAPSHOT_PFAD) {
    console.log(`Quelle: Datei statt Netz (AKTUALITAET_SNAPSHOT=${SNAPSHOT_PFAD})`);
    const snap = ladeJson(SNAPSHOT_PFAD, "Snapshot");
    return {
      eintraege: Array.isArray(snap) ? snap : (snap.eintraege || []),
      uebersprungen: Array.isArray(snap) ? [] : (snap.uebersprungen || []),
    };
  }

  console.log("Quelle: gesetze-im-internet.de");
  const ergebnisse = await holeAlleGesetze(); // ohne log: still
  const eintraege = [];
  const uebersprungen = [];
  for (const r of ergebnisse) {
    for (const e of r.eintraege) {
      // _parUrl ist intern; fuer den Vergleich wird es nicht gebraucht.
      const { _parUrl, ...rest } = e;
      eintraege.push(rest);
    }
    for (const u of r.uebersprungen) uebersprungen.push(u);
  }
  return { eintraege, uebersprungen };
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

async function main() {
  console.log("=== Aktualitaetspruefung der Wissensbasis ===\n");

  const bestand = ladeJson(GESETZE_PFAD, "gesetze.json");
  if (!Array.isArray(bestand) || bestand.length === 0) {
    console.error("FEHLER: gesetze.json ist kein befuelltes Array.");
    process.exit(EXIT_FEHLER);
  }

  let quelle;
  try {
    quelle = await holeQuelle();
  } catch (err) {
    // Genau hier trennen sich Netzproblem und Gesetzesaenderung.
    const art = err.art || (err instanceof QuellFehler ? err.art : "UNBEKANNT");
    // err.message enthaelt die Ursache bei QuellFehler bereits - nicht doppelt anhaengen.
    const grund = err.message;

    console.error("\n=================================");
    console.error("FEHLER: Die Quelle konnte nicht gelesen werden.");
    console.error(`  Art:     ${art}${err.status ? ` (HTTP ${err.status})` : ""}`);
    console.error(`  ${err.message}`);
    if (err.ursache && !err.message.includes(err.ursache.message)) {
      console.error(`  Ursache: ${err.ursache.message}`);
    }
    console.error("");
    for (const zeile of DIAGNOSE[art] || DIAGNOSE.UNBEKANNT) console.error(`  ${zeile}`);
    console.error("");
    console.error("Das ist KEIN Befund. Es ist NICHT festgestellt, dass sich ein Gesetz");
    console.error("geaendert hat - es ist ueberhaupt nichts festgestellt. Der Bestand");
    console.error("kann veraltet sein, ohne dass dieser Lauf es zeigen wuerde.");
    console.error("=================================");

    // Maschinenlesbar fuer den Workflow, damit Annotation und Job-Summary den
    // konkreten Grund nennen koennen, ohne dass jemand das Log oeffnen muss.
    console.error(`AKTUALITAET_FEHLERART=${art}`);
    console.error(`AKTUALITAET_FEHLERGRUND=${grund.replace(/\s+/g, " ").trim()}`);
    process.exit(EXIT_FEHLER);
  }

  const bestandById = new Map(bestand.map((e) => [e.id, e]));
  const quelleById  = new Map(quelle.eintraege.map((e) => [e.id, e]));
  const textlosById = new Map(
    quelle.uebersprungen.map((u) => [
      `${u.gesetz.toLowerCase()}-${String(u.paragraph).replace(/^§\s*/, "").toLowerCase()}`,
      u,
    ])
  );

  const befunde = [];
  const melde = (art, id, kopf, zeilen = []) => befunde.push({ art, id, kopf, zeilen });

  // Neu in der Quelle
  for (const e of quelle.eintraege) {
    if (!bestandById.has(e.id)) {
      melde("NEU_IN_QUELLE", e.id,
        `${e.gesetz} ${e.paragraph} "${e.titel}" ist neu in der Quelle (${e.text.trim().length} Zeichen)`,
        [kuerze(e.text.split("\n").find((z) => z.trim()) || "")]);
    }
  }

  // Entfallen, Text- und Titelaenderungen
  for (const alt of bestand) {
    const neu = quelleById.get(alt.id);

    if (!neu) {
      const textlos = textlosById.get(alt.id);
      melde("ENTFALLEN", alt.id,
        textlos
          ? `${alt.gesetz} ${alt.paragraph} "${alt.titel}" hat in der Quelle keinen Text mehr - der Import wuerde ihn ueberspringen`
          : `${alt.gesetz} ${alt.paragraph} "${alt.titel}" ist in der Quelle nicht mehr vorhanden`);
      continue;
    }

    if ((alt.titel || "") !== (neu.titel || "")) {
      melde("TITEL_GEAENDERT", alt.id,
        `${alt.gesetz} ${alt.paragraph}: Titel geaendert`,
        [`vorher:  ${kuerze(alt.titel || "")}`, `jetzt:   ${kuerze(neu.titel || "")}`]);
    }

    if ((alt.text || "") !== (neu.text || "")) {
      const d = textUnterschied(alt.text || "", neu.text || "");
      const zeilen = [];
      zeilen.push(`${(alt.text || "").trim().length} -> ${(neu.text || "").trim().length} Zeichen, ` +
                  `${d.hinzu.length} Zeile(n) neu, ${d.weg.length} Zeile(n) entfallen`);
      for (const z of d.hinzu.slice(0, DIFF_ZEILEN)) zeilen.push(`  + ${kuerze(z)}`);
      if (d.hinzu.length > DIFF_ZEILEN) zeilen.push(`  + … ${d.hinzu.length - DIFF_ZEILEN} weitere`);
      for (const z of d.weg.slice(0, DIFF_ZEILEN)) zeilen.push(`  - ${kuerze(z)}`);
      if (d.weg.length > DIFF_ZEILEN) zeilen.push(`  - … ${d.weg.length - DIFF_ZEILEN} weitere`);
      melde("TEXT_GEAENDERT", alt.id,
        `${alt.gesetz} ${alt.paragraph} "${alt.titel}": Text geaendert`, zeilen);
    }
  }

  // Tote Quell-Links im Bestand
  if (LINKPRUEFUNG) {
    const beginn = Date.now();
    const tot = await pruefeLinksParallel(bestand);
    const dauer = ((Date.now() - beginn) / 1000).toFixed(1);
    console.log(`Linkpruefung: ${bestand.length} Links in ${dauer}s geprueft, ${tot.length} auffaellig.\n`);
    for (const { eintrag, status } of tot) {
      melde("QUELLE_TOT", eintrag.id,
        `${eintrag.gesetz} ${eintrag.paragraph}: Quell-Link antwortet mit HTTP ${status || "Timeout"}`,
        [eintrag.quelle || "(kein Link hinterlegt)"]);
    }
  } else {
    console.log("Linkpruefung uebersprungen (AKTUALITAET_LINKPRUEFUNG=0).\n");
  }

  // -------------------------------------------------------------------------
  // Ausgabe
  // -------------------------------------------------------------------------

  const ARTEN = ["NEU_IN_QUELLE", "ENTFALLEN", "TEXT_GEAENDERT", "TITEL_GEAENDERT", "QUELLE_TOT"];

  console.log(`Bestand: ${bestand.length} Paragraphen`);
  console.log(`Quelle:  ${quelle.eintraege.length} Paragraphen mit Text` +
              (quelle.uebersprungen.length ? `, ${quelle.uebersprungen.length} ohne Text` : "") + "\n");

  for (const art of ARTEN) {
    const treffer = befunde.filter((b) => b.art === art);
    console.log(`${treffer.length ? "✖" : "✓"} ${art}${treffer.length ? ` (${treffer.length})` : ""}`);
    for (const t of treffer) {
      console.log(`    ${t.id}: ${t.kopf}`);
      for (const z of t.zeilen) console.log(`      ${z}`);
    }
  }

  console.log("\n=================================");
  if (!befunde.length) {
    console.log("Bestand deckt sich mit der Quelle. Keine Aenderung festgestellt.");
    process.exit(EXIT_OK);
  }

  console.log(`BEFUND: ${befunde.length} Abweichung(en) zwischen Bestand und Quelle.`);
  console.log("Das ist kein Netzproblem - die Quelle war erreichbar und lesbar.");
  console.log("");
  console.log("Naechster Schritt: 'npm run import-gesetze' lokal laufen lassen,");
  console.log("die Aenderungen im Diff pruefen und committen. Neue Paragraphen");
  console.log("brauchen ausserdem einen Eintrag in themen-mapping.json, sonst sind");
  console.log("sie fuer den Assistenten nicht erreichbar.");
  console.log("=================================");
  process.exit(EXIT_BEFUND);
}

main().catch((err) => {
  // Unerwartete Fehler sind Fehler, keine Befunde.
  console.error("\nFEHLER (unerwartet):", err && err.stack ? err.stack : err);
  console.error("Kein Befund - die Pruefung ist nicht durchgelaufen.");
  process.exit(EXIT_FEHLER);
});
