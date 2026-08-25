// scripts/lib/gii.js
// Gemeinsame Hol- und Parse-Schicht fuer gesetze-im-internet.de.
//
// Wird von zwei Skripten benutzt:
//   - scripts/import-gesetze.js    schreibt wissensbasis/gesetze.json
//   - scripts/pruefe-aktualitaet.js vergleicht die Quelle mit dem Bestand
//
// WICHTIG: Dieses Modul schreibt nichts. Es gibt hier bewusst keine Schreib-
// funktion. Der Aktualitaetspruefer soll die Wissensbasis unter keinen Umstaenden
// veraendern koennen, und "es ruft halt kein writeFileSync auf" waere eine
// Zusage; kein fs-Schreibzugriff im Modul ist eine Eigenschaft.
//
// Ebenso ruft dieses Modul kein process.exit auf. Eine Bibliothek, die den Prozess
// beendet, nimmt dem Aufrufer die Entscheidung ab - der Importer will bei einem
// unplausiblen Gesetzestitel abbrechen, der Pruefer will das als Fehler melden.
// Deshalb: werfen, nicht beenden.

"use strict";

const https = require("https");
const http  = require("http");
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
  // filter = Liste von Nummernbereichen. §§ 187–193 sind die Fristberechnung
  // (Fristbeginn, Fristende, § 193 Sonn-/Feiertag und Sonnabend) – jede Frist im
  // Bestand hängt daran, deshalb gehören sie mit in die Wissensbasis.
  // bis:580 → §§ 535–580a (Buchstaben-Zusätze wie 556a haben n=556 bzw. 580a hat n=580)
  { id: "BGB",         slug: "bgb",        gesetz_lang: "Bürgerliches Gesetzbuch",  erwartet: ["bürgerliches gesetzbuch"], filter: [{ von: 187, bis: 193 }, { von: 535, bis: 580 }] },
  { id: "BetrKV",      slug: "betrkv",     gesetz_lang: "Betriebskostenverordnung", erwartet: ["betriebskosten"],    filter: null },
  { id: "HeizkostenV", slug: "heizkostenv",gesetz_lang: "Heizkostenverordnung",     erwartet: ["heiz"],              filter: null },
  { id: "WoFlV",       slug: "woflv",      gesetz_lang: "Wohnflächenverordnung",    erwartet: ["wohnfläche"],        filter: null },
];

const TOC_URL          = "https://www.gesetze-im-internet.de/gii-toc.xml";
const HINWEIS          = "Konsolidierte Fassung, nicht die amtliche Fassung des BGBl.";
const FETCH_TIMEOUT_MS = 15_000;
const HEAD_TIMEOUT_MS  = 8_000;

// Wir fragen eine oeffentliche Quelle regelmaessig ab - dann soll auch erkennbar
// sein, wer da fragt.
const USER_AGENT = "Inspectora/1.0 (+https://inspectora.tech; Wissensbasis-Abgleich)";

// family: 4 ist gegen diese Quelle WIRKUNGSLOS und steht hier nur, damit die
// Anfrage nicht von den Voreinstellungen des Resolvers abhaengt.
//
// Zur Geschichte, damit niemand denselben Weg noch einmal geht:
// Abrufe von einem GitHub-Actions-Runner laufen in den Timeout (26.08.2026,
// Runs 32900138736 und 32901119879) - die Gegenstelle antwortet nicht und lehnt
// auch nicht ab. Die erste Vermutung war IPv6: Node bevorzugt seit v17 die vom
// Resolver zuerst gelieferte Adresse, und eine nicht routbare AAAA-Adresse haette
// genau so ausgesehen. Diese Vermutung ist WIDERLEGT: www.gesetze-im-internet.de
// hat ueberhaupt keinen AAAA-Eintrag, nur A 195.74.94.216. Es lief also von
// Anfang an ueber IPv4, und family: 4 hat am Fehlerbild erwartungsgemaess nichts
// geaendert.
//
// Die Ursache ist derzeit UNGEKLAERT. Lokal funktioniert derselbe Abruf.
// Bewusst je Request und nicht global ueber dns.setDefaultResultOrder("ipv4first"):
// Ein Modul soll die Namensaufloesung des gesamten Prozesses nicht umstellen.
const REQUEST_BASIS = {
  family: 4,
  headers: { "User-Agent": USER_AGENT },
};

// Fehlerarten, damit "Timeout" und "HTTP 403" nicht gleich aussehen. Sie stehen
// fuer verschiedene Probleme und brauchen verschiedene naechste Schritte.
function netzFehlerArt(err) {
  const code = err && err.code ? String(err.code) : "";
  if (/^(ENOTFOUND|EAI_AGAIN)$/.test(code)) return "DNS";
  if (/^(ECONNREFUSED|ECONNRESET|EHOSTUNREACH|ENETUNREACH|EPIPE|ECONNABORTED)$/.test(code)) return "VERBINDUNG";
  if (/^(CERT_|ERR_TLS|UNABLE_TO_|SELF_SIGNED|DEPTH_ZERO)/.test(code)) return "TLS";
  return "NETZ";
}

function fehler(art, nachricht, extra = {}) {
  return Object.assign(new Error(nachricht), { art, ...extra });
}

// Fehler beim Erreichen oder Lesen der Quelle. Eigene Klasse, damit der Aufrufer
// "Quelle nicht erreichbar" von "Gesetz hat sich geaendert" unterscheiden kann.
// Beides als dasselbe zu melden waere die gefaehrlichste Verwechslung ueberhaupt:
// Ein roter Lauf wegen fehlender Netzverbindung saehe aus wie eine Gesetzesaenderung.
class QuellFehler extends Error {
  constructor(message, ursache) {
    super(message);
    this.name = "QuellFehler";
    this.ursache = ursache;
    // Art der Ursache durchreichen, damit der Aufrufer im Bericht zwischen
    // Timeout, HTTP-Status, DNS und TLS unterscheiden kann.
    this.art = (ursache && ursache.art) || "UNBEKANNT";
    if (ursache && ursache.status) this.status = ursache.status;
  }
}

// ---------------------------------------------------------------------------
// HTTP-Hilfsfunktionen
// ---------------------------------------------------------------------------

function fetchBuffer(url) {
  return new Promise((resolve, reject) => {
    const attempt = (u, redirects) => {
      if (redirects > 5) return reject(fehler("REDIRECT", "Zu viele Redirects: " + u));
      const lib = u.startsWith("https") ? https : http; // Protokoll je Redirect-Ziel neu bestimmen
      const req = lib.get(u, { ...REQUEST_BASIS, timeout: FETCH_TIMEOUT_MS }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          const nextUrl = new URL(res.headers.location, u).toString();
          return attempt(nextUrl, redirects + 1);
        }
        if (res.statusCode !== 200) {
          res.resume();
          return reject(fehler("HTTP_STATUS", `HTTP ${res.statusCode} für ${u}`, { status: res.statusCode }));
        }
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end",  () => resolve(Buffer.concat(chunks)));
        res.on("error", (e) => reject(fehler(netzFehlerArt(e), `${e.code || e.message}: ${u}`)));
      });
      req.on("timeout", () => { req.destroy(); reject(fehler("TIMEOUT", "Timeout: " + u)); });
      req.on("error", (e) => reject(fehler(netzFehlerArt(e), `${e.code || e.message}: ${u}`)));
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
        const req = lib.request(u, { ...REQUEST_BASIS, method: "HEAD", timeout: HEAD_TIMEOUT_MS }, (res) => {
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
      case "IMG":
      case "img":
        // Formeln und Abbildungen liegen in der Quelle teils nur als Grafik vor
        // (z.B. B = Q/Hi in HeizkostenV § 9 Abs. 3) und lassen sich nicht in Text
        // überführen. Nicht stillschweigend verschlucken: Sonst bleibt an ihrer
        // Stelle nur der Satzpunkt stehen und liest sich wie ein vollständiger Satz.
        // Bewusst neutrale Klammer-Notiz, keine Gesetzessprache – sie darf nicht
        // mit Normtext verwechselt werden.
        out += "[Grafik in der Quelle – nicht als Text verfügbar]";
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

// Zwei Tabellen-Dialekte: HTML (tr/td/th) und CALS (row/entry). gesetze-im-internet.de
// liefert z.B. die Heizwerttabellen der HeizkostenV als CALS. Ohne row/entry findet
// die Zeilensuche nichts, der Fallback textOf() klebt alle Zellen ohne Trenner
// aneinander ("je LiterSchweres Heizöl10,9Kilowattstunden…") und die Werte sind
// unlesbar. Beide Dialekte behandeln, damit der Fallback nur noch für echte
// Nicht-Tabellen greift.
function tableText(nodes) {
  const zeilen = [
    ...findAll(nodes, "tr"),   ...findAll(nodes, "TR"),
    ...findAll(nodes, "row"),  ...findAll(nodes, "ROW"),
  ];
  if (!zeilen.length) return textOf(nodes);
  return zeilen
    .map((zeile) => {
      const inhalt = children(zeile);
      const zellen = [
        ...findAll(inhalt, "td"),    ...findAll(inhalt, "TD"),
        ...findAll(inhalt, "th"),    ...findAll(inhalt, "TH"),
        ...findAll(inhalt, "entry"), ...findAll(inhalt, "ENTRY"),
      ];
      // Zeilenumbrüche innerhalb einer Zelle zu Leerzeichen: Sonst ist "\n" mal
      // Zeilenwechsel der Tabelle und mal Umbruch im Zellinhalt, und die Zeilen-
      // grenzen sind nicht mehr erkennbar ("Kilowattstunden\nje Liter\nSchweres Heizöl").
      return zellen.map((z) => textOf(children(z)).replace(/\s+/g, " ").trim()).join(" | ");
    })
    .filter((zeile) => zeile.replace(/\|/g, "").trim())
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

// Laedt das Inhaltsverzeichnis und gibt es geparst zurueck.
async function ladeToc() {
  let tocBuffer;
  try {
    tocBuffer = await fetchBuffer(TOC_URL);
  } catch (err) {
    throw new QuellFehler(`Inhaltsverzeichnis nicht erreichbar: ${TOC_URL} (${err.message})`, err);
  }
  return parser.parse(tocBuffer.toString("utf8"));
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
// Nummernbereiche
// ---------------------------------------------------------------------------

function inBereichen(enbez, bereiche) {
  const m = enbez.match(/^§\s*(\d+)/);
  if (!m) return false;
  const n = parseInt(m[1], 10);
  return bereiche.some(({ von, bis }) => n >= von && n <= bis);
}

// ---------------------------------------------------------------------------
// Metadaten aus den ersten Norm-Bloecken
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
// Ein Gesetz holen und in Eintraege uebersetzen
// ---------------------------------------------------------------------------

// Holt das XML-ZIP eines Gesetzes und baut daraus die Paragraphen-Eintraege.
// Schreibt nichts und beendet den Prozess nicht.
//
// Rueckgabe: { basis, zipUrl, gesetzTitel, stand, eintraege, uebersprungen }
//   eintraege     - Paragraphen MIT Text, jeweils mit vorlaeufigem quelle = gesetzLink
//                   und internem _parUrl (der Importer ersetzt das nach der Linkpruefung)
//   uebersprungen - Paragraphen OHNE Text; in der Quelle vorhanden, aber leer
//
// log ist optional; ohne Angabe wird nichts ausgegeben. So bleibt die Ausgabe des
// Importers unveraendert, waehrend der Aktualitaetspruefer still arbeiten kann.
async function holeGesetz(ziel, gesetzLink, log = () => {}) {
  const { id, gesetz_lang, filter, erwartet } = ziel;
  const basis = baseUrl(gesetzLink);
  const zipUrl = xmlZipUrl(gesetzLink);

  log(`\n[${id}] Lade ZIP: ${zipUrl}`);

  let zipBuffer;
  try {
    zipBuffer = await fetchBuffer(zipUrl);
  } catch (err) {
    throw new QuellFehler(`[${id}] ZIP nicht erreichbar: ${zipUrl} (${err.message})`, err);
  }

  let xmlEntry;
  try {
    const zip = new AdmZip(zipBuffer);
    xmlEntry = zip.getEntries().find((e) => e.entryName.endsWith(".xml") && !e.isDirectory);
  } catch (err) {
    throw new QuellFehler(`[${id}] ZIP nicht lesbar: ${zipUrl} (${err.message})`, err);
  }
  if (!xmlEntry) throw new QuellFehler(`[${id}] Keine XML-Datei im ZIP gefunden: ${zipUrl}`);

  log(`  Verarbeite ${xmlEntry.entryName} (${(xmlEntry.getData().length / 1024).toFixed(0)} KB)`);
  const xmlText = xmlEntry.getData().toString("utf8");
  const parsed  = parser.parse(xmlText);

  // Alle <norm>-Knoten finden
  const normNodes = findAll(parsed, "norm");

  const gefundenerTitel = extractTitel(normNodes);
  log(`  Gesetzestitel (aus XML): ${gefundenerTitel || "(nicht gefunden)"}`);
  const titelLower = gefundenerTitel.toLowerCase();
  const plausibel = erwartet.some((kw) => titelLower.includes(kw));
  if (!plausibel) {
    // Werfen statt beenden: Der Importer faengt das und bricht ab, der Pruefer
    // meldet es als Fehler. Die Entscheidung gehoert dem Aufrufer.
    throw new Error(
      `[${id}] Der im XML gefundene Gesetzestitel "${gefundenerTitel}" passt nicht zu den ` +
      `erwarteten Begriffen (${erwartet.join(", ")}). Vermutlich falsches Gesetz geladen. ZIP: ${zipUrl}`
    );
  }

  const stand = extractStand(normNodes);
  log(`  Stand: ${stand || "(nicht gefunden)"}`);

  const eintraege = [];

  for (const norm of normNodes) {
    const metadaten  = findFirst(children(norm), "metadaten");
    if (!metadaten) continue;

    const enbezNode  = findFirst(children(metadaten), "enbez");
    const titelNode  = findFirst(children(metadaten), "titel");
    if (!enbezNode) continue;

    const enbez = getText(children(enbezNode)).trim();
    if (!enbez) continue;

    // Nummernbereich-Filter (nur BGB)
    if (filter && !inBereichen(enbez, filter)) continue;

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

    // Reihenfolge der Schluessel ist bedeutsam: JSON.stringify schreibt sie in
    // Einfuegereihenfolge, und gesetze.json soll bei unveraenderter Quelle
    // zeichengleich bleiben.
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

  log(`  ${eintraege.length} Paragraphen gefunden.`);

  // Paragraphen ohne Text nicht ausliefern. Manche Normen sind in der Quelle nur
  // noch leere Hüllen (<Content><P/></Content>), z.B. HeizkostenV § 13 Berlin-Klausel
  // und § 14 Inkrafttreten. Aufgenommen sähen sie im Assistenten-Kontext aus wie
  // gültige Fundstellen – mit echtem Titel und echtem Quell-Link, aber ohne Inhalt –
  // und belegten einen der wenigen Kontext-Plätze. Nicht still verwerfen: Die
  // uebersprungenen Paragraphen werden zurueckgegeben und vom Aufrufer benannt.
  const mitText = [];
  const uebersprungen = [];
  for (const e of eintraege) {
    if (!e.text || !e.text.trim()) {
      uebersprungen.push({ gesetz: id, paragraph: e.paragraph, titel: e.titel, quelle: e._parUrl || gesetzLink });
    } else {
      mitText.push(e);
    }
  }
  if (mitText.length !== eintraege.length) {
    log(`  ${eintraege.length - mitText.length} ohne Text in der Quelle – übersprungen (siehe Prüfbericht).`);
  }

  return { basis, zipUrl, gesetzTitel: gefundenerTitel, stand, eintraege: mitText, uebersprungen };
}

// Holt alle konfigurierten Gesetze. Bequemlichkeit fuer Aufrufer, die den TOC-
// Schritt nicht selbst fahren wollen.
async function holeAlleGesetze(log = () => {}) {
  const tocParsed = await ladeToc();
  const ergebnisse = [];

  for (const ziel of ZIEL_GESETZE) {
    log(`\nSuche "${ziel.id}" im TOC (Kürzel: ${ziel.slug})…`);
    const gesetzLink = findInToc(tocParsed, ziel.slug);
    if (!gesetzLink) {
      throw new QuellFehler(
        `Kürzel "${ziel.slug}" (für ${ziel.id}) wurde im TOC nicht gefunden: ${TOC_URL}`
      );
    }
    log(`  → ${gesetzLink}`);
    const ergebnis = await holeGesetz(ziel, gesetzLink, log);
    ergebnisse.push({ ziel, gesetzLink, ...ergebnis });
  }

  return ergebnisse;
}

module.exports = {
  // Konfiguration
  ZIEL_GESETZE, TOC_URL, HINWEIS, FETCH_TIMEOUT_MS, HEAD_TIMEOUT_MS,
  QuellFehler,
  // HTTP
  fetchBuffer, headStatus,
  // XML
  parser, xmlParserOpts,
  // Traversal
  tagName, children, findAll, findFirst,
  // Text
  textOf, tableText, getText,
  // TOC
  slugFromLink, findInToc, ladeToc,
  // URLs
  baseUrl, xmlZipUrl, konstruiereParUrl,
  // Filter
  inBereichen,
  // Metadaten
  extractTitel, extractStand,
  // Orchestrierung
  holeGesetz, holeAlleGesetze,
};
