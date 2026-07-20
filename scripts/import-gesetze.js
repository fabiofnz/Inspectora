#!/usr/bin/env node
// scripts/import-gesetze.js
// Lädt Gesetzestexte von gesetze-im-internet.de und schreibt wissensbasis/gesetze.json
// Aufruf: node scripts/import-gesetze.js

"use strict";

const https = require("https");
const http  = require("http");
const path  = require("path");
const fs    = require("fs");
const { XMLParser } = require("fast-xml-parser");
const AdmZip = require("adm-zip");

// ---------------------------------------------------------------------------
// Konfiguration
// ---------------------------------------------------------------------------

// "slug" ist das eindeutige Verzeichnis-Kürzel auf gesetze-im-internet.de
// (z.B. https://www.gesetze-im-internet.de/woeigg/xml.zip) – NICHT der Titeltext,
// da Titelsuche zu unscharf ist (z.B. traf "WEG" fälschlich "zertverwv").
// "erwartet" dient nur der nachgelagerten Plausibilitätsprüfung des im XML gefundenen Gesetzestitels.
const ZIEL_GESETZE = [
  { id: "WEG",         slug: "woeigg",     gesetz_lang: "Wohnungseigentumsgesetz",  erwartet: ["wohnungseigentum"],  filter: null },
  { id: "BGB",         slug: "bgb",        gesetz_lang: "Bürgerliches Gesetzbuch",  erwartet: ["bürgerliches gesetzbuch"], filter: { von: 535, bis: 580 } }, // bis:580 → §§ 535–580a (Buchstaben-Zusätze wie 556a haben n=556 bzw. 580a hat n=580)
  { id: "BetrKV",      slug: "betrkv",     gesetz_lang: "Betriebskostenverordnung", erwartet: ["betriebskosten"],    filter: null },
  { id: "HeizkostenV", slug: "heizkostenv",gesetz_lang: "Heizkostenverordnung",     erwartet: ["heiz"],              filter: null },
  { id: "WoFlV",       slug: "woflv",      gesetz_lang: "Wohnflächenverordnung",    erwartet: ["wohnfläche"],        filter: null },
];

const TOC_URL      = "https://www.gesetze-im-internet.de/gii-toc.xml";
const AUSGABE_PFAD = path.resolve(__dirname, "../wissensbasis/gesetze.json");
const THEMEN_MAPPING_PFAD = path.resolve(__dirname, "../wissensbasis/themen-mapping.json");
const HINWEIS      = "Konsolidierte Fassung, nicht die amtliche Fassung des BGBl.";
const LINK_SAMPLE  = 5;   // Anzahl Stichproben für Link-Prüfung je Gesetz
const FETCH_TIMEOUT_MS = 15_000;
const HEAD_TIMEOUT_MS  = 8_000;

// ---------------------------------------------------------------------------
// HTTP-Hilfsfunktionen
// ---------------------------------------------------------------------------

function fetchBuffer(url) {
  return new Promise((resolve, reject) => {
    const attempt = (u, redirects) => {
      if (redirects > 5) return reject(new Error("Zu viele Redirects: " + u));
      const lib = u.startsWith("https") ? https : http; // Protokoll je Redirect-Ziel neu bestimmen
      const req = lib.get(u, { timeout: FETCH_TIMEOUT_MS }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          const nextUrl = new URL(res.headers.location, u).toString();
          return attempt(nextUrl, redirects + 1);
        }
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`HTTP ${res.statusCode} für ${u}`));
        }
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end",  () => resolve(Buffer.concat(chunks)));
        res.on("error", reject);
      });
      req.on("timeout", () => { req.destroy(); reject(new Error("Timeout: " + u)); });
      req.on("error", reject);
    };
    attempt(url, 0);
  });
}

function headStatus(url) {
  return new Promise((resolve) => {
    const attempt = (u, redirects) => {
      if (redirects > 5) return resolve(0);
      try {
        const lib = u.startsWith("https") ? https : http; // Protokoll je Redirect-Ziel neu bestimmen
        const req = lib.request(u, { method: "HEAD", timeout: HEAD_TIMEOUT_MS }, (res) => {
          res.resume();
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            const nextUrl = new URL(res.headers.location, u).toString();
            return attempt(nextUrl, redirects + 1);
          }
          resolve(res.statusCode);
        });
        req.on("timeout", () => { req.destroy(); resolve(0); });
        req.on("error",   () => resolve(0));
        req.end();
      } catch {
        resolve(0);
      }
    };
    attempt(url, 0);
  });
}

// ---------------------------------------------------------------------------
// XML-Parser
// ---------------------------------------------------------------------------

const xmlParserOpts = {
  ignoreAttributes:     false,
  attributeNamePrefix:  "@_",
  textNodeName:         "#text",
  parseAttributeValue:  false,
  parseTagValue:        false,
  preserveOrder:        true,
};
const parser = new XMLParser(xmlParserOpts);

// ---------------------------------------------------------------------------
// Baum-Traversal (preserveOrder-Format)
// ---------------------------------------------------------------------------

// Ein Knoten im preserveOrder-Format ist ein Objekt mit genau einem Schlüssel (Tag-Name),
// dessen Wert ein Array der Kind-Knoten ist. Daneben gibt es ggf. ":@" für Attribute.

function tagName(node) {
  return Object.keys(node).find((k) => k !== ":@" && k !== "#text");
}

function children(node) {
  const t = tagName(node);
  return t ? (node[t] || []) : [];
}

function findAll(nodes, tag) {
  const result = [];
  for (const node of nodes) {
    const t = tagName(node);
    if (t === tag) result.push(node);
    if (t) {
      for (const hit of findAll(node[t] || [], tag)) result.push(hit);
    }
  }
  return result;
}

function findFirst(nodes, tag) {
  for (const node of nodes) {
    const t = tagName(node);
    if (t === tag) return node;
    if (t) {
      const hit = findFirst(node[t] || [], tag);
      if (hit) return hit;
    }
  }
  return null;
}

function directText(nodes) {
  return nodes
    .filter((n) => "#text" in n)
    .map((n) => n["#text"])
    .join("");
}

// ---------------------------------------------------------------------------
// Text-Extraktion aus Gesetzestext-XML
// ---------------------------------------------------------------------------

function textOf(nodes) {
  let out = "";
  for (const node of nodes) {
    if ("#text" in node) {
      out += node["#text"];
      continue;
    }
    const t = tagName(node);
    if (!t) continue;
    const kids = node[t] || [];
    switch (t) {
      case "P":
      case "SP":
        out += textOf(kids).trim() + "\n\n";
        break;
      case "BR":
        out += "\n";
        break;
      case "LA": {
        // Listenpunkt: ggf. Einzug-Attribut berücksichtigen
        const attrs = node[":@"] || {};
        const indent = attrs["@_la"] ? "   ".repeat(Number(attrs["@_la"]) || 0) : "";
        out += indent + textOf(kids).trim() + "\n";
        break;
      }
      case "DL":
        // Vor der Liste einen Umbruch erzwingen, falls der vorangehende Fließtext
        // (z.B. "...vor, wenn ") noch nicht mit einem Zeilenumbruch endet – sonst
        // verschmilzt er mit der ersten Aufzählungsziffer zu "...vor, wenn1.".
        if (out && !/\n[ \t]*$/.test(out)) out = out.replace(/[ \t]+$/, "") + "\n";
        out += textOf(kids);
        out += "\n";
        break;
      case "DT":
        out += textOf(kids).trim() + " ";
        break;
      case "DD":
        out += textOf(kids).trim() + "\n";
        break;
      case "table":
      case "TABLE":
        out += tableText(kids) + "\n";
        break;
      case "FnR":
      case "Footnotes":
        // Fußnoten-Anker und Fußnoten weglassen
        break;
      case "Title":
      case "Subtitle":
        out += textOf(kids).trim() + "\n\n";
        break;
      default:
        out += textOf(kids);
    }
  }
  return out;
}

function tableText(nodes) {
  const rows = findAll(nodes, "tr").concat(findAll(nodes, "TR"));
  if (!rows.length) return textOf(nodes);
  return rows
    .map((row) => {
      const cells = (row["tr"] || row["TR"] || []);
      const cols = findAll(cells, "td")
        .concat(findAll(cells, "TD"))
        .concat(findAll(cells, "th"))
        .concat(findAll(cells, "TH"));
      return cols.map((c) => textOf(children(c)).trim()).join(" | ");
    })
    .join("\n");
}

function getText(nodes) {
  return textOf(nodes).replace(/\n{3,}/g, "\n\n").trim();
}

// ---------------------------------------------------------------------------
// TOC-Suche
// ---------------------------------------------------------------------------

// Extrahiert das Verzeichnis-Kürzel aus einer gesetze-im-internet.de-URL,
// z.B. "https://www.gesetze-im-internet.de/woeigg/index.html" → "woeigg"
function slugFromLink(link) {
  const m = link.match(/gesetze-im-internet\.de\/([^/]+)\/[^/]*$/i);
  return m ? m[1].toLowerCase() : null;
}

function findInToc(tocXml, slug) {
  // TOC-Format: <items><item><link>…</link><title>…</title></item>…</items>
  // Abgleich erfolgt exakt über das Verzeichnis-Kürzel im Link, nicht über den Titeltext,
  // da ein unscharfer Titel-Match versehentlich das falsche Gesetz treffen kann.
  const items = findAll(tocXml, "item");
  const zielSlug = slug.toLowerCase();
  for (const item of items) {
    const linkNode = findFirst(children(item), "link");
    if (!linkNode) continue;
    const link = getText(children(linkNode)).trim();
    if (slugFromLink(link) === zielSlug) return link;
  }
  return null;
}

// ---------------------------------------------------------------------------
// URL-Hilfsfunktionen
// ---------------------------------------------------------------------------

function baseUrl(gesetzLink) {
  // z.B. "http://www.gesetze-im-internet.de/weg/index.html"
  //   → "https://www.gesetze-im-internet.de/weg/"
  // TOC liefert http-Links, die per Redirect auf https zeigen – Deep-Links
  // daher von vornherein mit https:// aufbauen statt den Redirect zu provozieren.
  return gesetzLink.replace(/^http:\/\//i, "https://").replace(/[^/]+$/, "");
}

function xmlZipUrl(gesetzLink) {
  return baseUrl(gesetzLink) + "xml.zip";
}

// Versucht, eine Paragraphen-URL zu konstruieren.
// § 24       → __24.html
// § 14a      → __14a.html
// Abs. ohne § → null (Einleitungsformeln, Vorbemerkungen etc.)
function konstruiereParUrl(basis, enbez) {
  const m = enbez.match(/^§\s*(\d+[a-z]*)/i);
  if (!m) return null;
  return basis + "__" + m[1].toLowerCase() + ".html";
}

// ---------------------------------------------------------------------------
// BGB-Filterbereich
// ---------------------------------------------------------------------------

function inBgbRange(enbez, von, bis) {
  const m = enbez.match(/^§\s*(\d+)/);
  if (!m) return false;
  const n = parseInt(m[1], 10);
  return n >= von && n <= bis;
}

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
// Stand aus erstem Norm-Block
// ---------------------------------------------------------------------------

function extractTitel(normNodes) {
  // Der amtliche Gesetzestitel steckt in den ersten Normen (meist der Eingangsformel)
  // unter <metadaten><langue> (Langtitel) bzw. <kurzue> (Kurztitel).
  for (let i = 0; i < Math.min(3, normNodes.length); i++) {
    const metadaten = findFirst(children(normNodes[i]), "metadaten");
    if (!metadaten) continue;
    const langueNode = findFirst(children(metadaten), "langue");
    if (langueNode) {
      const text = getText(children(langueNode)).trim();
      if (text) return text;
    }
    const kurzueNode = findFirst(children(metadaten), "kurzue");
    if (kurzueNode) {
      const text = getText(children(kurzueNode)).trim();
      if (text) return text;
    }
  }
  return "";
}

function extractStand(normNodes) {
  // In den ersten Normen steckt oft Metadaten ohne enbez
  for (let i = 0; i < Math.min(3, normNodes.length); i++) {
    const norm = normNodes[i];
    const metadaten = findFirst(children(norm), "metadaten");
    if (!metadaten) continue;
    const standNode = findFirst(children(metadaten), "standkommentar");
    if (standNode) {
      const text = getText(children(standNode)).trim();
      if (text) return text;
    }
    // Alternativ: <Stand><standangabe>
    const standOuter = findFirst(children(metadaten), "Stand");
    if (standOuter) {
      const standangabe = findFirst(children(standOuter), "standangabe");
      if (standangabe) {
        const text = getText(children(standangabe)).trim();
        if (text) return text;
      }
    }
  }
  return "";
}

// ---------------------------------------------------------------------------
// Gesetz verarbeiten
// ---------------------------------------------------------------------------

async function verarbeiteGesetz(ziel, gesetzLink) {
  const { id, gesetz_lang, filter, erwartet } = ziel;
  const basis = baseUrl(gesetzLink);
  const zipUrl = xmlZipUrl(gesetzLink);

  console.log(`\n[${id}] Lade ZIP: ${zipUrl}`);
  const zipBuffer = await fetchBuffer(zipUrl);

  const zip = new AdmZip(zipBuffer);
  const xmlEntry = zip.getEntries().find((e) => e.entryName.endsWith(".xml") && !e.isDirectory);
  if (!xmlEntry) throw new Error(`[${id}] Keine XML-Datei im ZIP gefunden.`);

  console.log(`  Verarbeite ${xmlEntry.entryName} (${(xmlEntry.getData().length / 1024).toFixed(0)} KB)`);
  const xmlText = xmlEntry.getData().toString("utf8");
  const parsed  = parser.parse(xmlText);

  // Alle <norm>-Knoten finden
  const normNodes = findAll(parsed, "norm");

  const gefundenerTitel = extractTitel(normNodes);
  console.log(`  Gesetzestitel (aus XML): ${gefundenerTitel || "(nicht gefunden)"}`);
  const titelLower = gefundenerTitel.toLowerCase();
  const plausibel = erwartet.some((kw) => titelLower.includes(kw));
  if (!plausibel) {
    console.error(`\nFEHLER: [${id}] Der im XML gefundene Gesetzestitel "${gefundenerTitel}" passt nicht`);
    console.error(`  zu den erwarteten Begriffen (${erwartet.join(", ")}). Vermutlich falsches Gesetz geladen.`);
    console.error(`  ZIP: ${zipUrl}`);
    console.error("Abbruch – bitte manuell prüfen.");
    process.exit(1);
  }

  const stand = extractStand(normNodes);
  console.log(`  Stand: ${stand || "(nicht gefunden)"}`);

  const eintraege = [];

  for (const norm of normNodes) {
    const metadaten  = findFirst(children(norm), "metadaten");
    if (!metadaten) continue;

    const enbezNode  = findFirst(children(metadaten), "enbez");
    const titelNode  = findFirst(children(metadaten), "titel");
    if (!enbezNode) continue;

    const enbez = getText(children(enbezNode)).trim();
    if (!enbez) continue;

    // BGB-Filter
    if (filter && !inBgbRange(enbez, filter.von, filter.bis)) continue;

    // Nur Normen mit §-Bezeichnung (keine Einleitungsnormen ohne §)
    if (!enbez.match(/^§/)) continue;

    const titelText = titelNode ? getText(children(titelNode)).trim() : "";

    // Textdaten
    const textdaten  = findFirst(children(norm), "textdaten");
    const textNode   = textdaten ? findFirst(children(textdaten), "text") : null;
    const contentNode = textNode ? findFirst(children(textNode), "Content") : null;
    const rawText    = contentNode ? getText(children(contentNode)) : "";

    // ID bauen
    const paraNum = (enbez.match(/^§\s*(.+)/) || [])[1] || enbez;
    const entryId = id.toLowerCase() + "-" + paraNum.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");

    // Paragraphen-URL
    const parUrl = konstruiereParUrl(basis, enbez);

    eintraege.push({
      id:         entryId,
      gesetz:     id,
      gesetz_lang,
      paragraph:  enbez,
      titel:      titelText,
      text:       rawText,
      themen:     [],
      stand,
      quelle:     gesetzLink, // vorläufig; wird in pruefeLinks überschrieben
      hinweis:    HINWEIS,
      _parUrl:    parUrl,     // intern, wird in pruefeLinks entfernt
    });
  }

  console.log(`  ${eintraege.length} Paragraphen gefunden.`);

  await pruefeLinks(eintraege, id, basis, gesetzLink);

  return eintraege;
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
    if (id === "_hinweis") continue;

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

  const tocBuffer = await fetchBuffer(TOC_URL);
  const tocParsed = parser.parse(tocBuffer.toString("utf8"));

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

    const eintraege = await verarbeiteGesetz(ziel, gesetzLink);
    for (const e of eintraege) alle.push(e);
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
