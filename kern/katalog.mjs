// kern/katalog.mjs
// Positionspruefung fuer die Nebenkostenabrechnung - Teil B des Pruefers.
//
// Prueft eingegebene Positionsbezeichnungen gegen
//   BetrKV § 2        - der abschliessende Katalog Nr. 1 bis 17
//   BetrKV § 1 Abs. 2 - was gerade NICHT dazugehoert (Verwaltungskosten,
//                       Instandhaltungs- und Instandsetzungskosten)
//
// Der Katalog wird zur Laufzeit aus wissensbasis/gesetze.json GEPARST, niemals
// hier abgeschrieben. Eine abgeschriebene Liste waere beim naechsten Import der
// Gesetze still veraltet - und eine Nummer, die auf den falschen Text zeigt,
// sieht genauso belegt aus wie eine richtige.
//
// ---------------------------------------------------------------------------
// WARUM DIE AUSSCHLUESSE ZUERST GEPRUEFT WERDEN
// ---------------------------------------------------------------------------
// Eine Zeile wie "Reparatur Heizung" trifft beides: "Heizung" steht in § 2 Nr. 4,
// "Reparatur" gehoert zu den Instandhaltungskosten aus § 1 Abs. 2 Nr. 2. Welche
// Fundstelle vorgeht, ist hier nicht frei gewaehlt, sondern steht im Gesetz:
// § 2 Nr. 14 rechnet die Hauswartkosten nur an, "soweit diese nicht die
// Instandhaltung, Instandsetzung, Erneuerung, Schoenheitsreparaturen oder die
// Hausverwaltung betrifft". Der Katalog nimmt diese Kosten also selbst aus -
// der Ausschluss geht dem Katalog vor, nicht umgekehrt.
//
// Trifft eine Zeile beides, wird BEIDES ausgegeben: das Urteil richtet sich nach
// dem Ausschluss, der Katalogtreffer steht als zweite Fundstelle daneben. Sonst
// verschwaende die eine Haelfte der Zeile stillschweigend, und der Nutzer saehe
// nicht, dass die Position aufzuteilen ist.
//
// ---------------------------------------------------------------------------
// WARUM NICHTS VERSCHWINDET
// ---------------------------------------------------------------------------
// In einer echten Abrechnung stehen zwischen den Positionen auch Ueberschriften,
// Summenzeilen, Daten und Seitenzahlen. Die werden aussortiert, aber NICHT
// weggeworfen: Sie landen sichtbar und gezaehlt in "nichtGewertet", mit Grund.
// Entscheidend ist die Reihenfolge - aussortiert wird erst, NACHDEM die Zeile
// keinen Treffer hatte. Ein Filterwort kann deshalb niemals einen Befund
// unterdruecken ("Zwischensumme Wasser" bleibt ein Treffer auf § 2 Nr. 2).
// Eine still verschluckte Position waere die gefaehrlichste Ausgabe von allen:
// eine Seite ohne Befund sieht aus wie eine Seite ohne Problem.
//
// ---------------------------------------------------------------------------
// MEHRERE TREFFER IN EINER ZEILE
// ---------------------------------------------------------------------------
// "Wasser und Müll" trifft § 2 Nr. 2 und Nr. 8. Frueher blieb davon nur ein Treffer
// uebrig - die Zeile war gruen und halb geprueft. Jetzt gilt:
//   - Gesucht wird mit Position in der Zeile. Ein Treffer faellt nur weg, wenn er
//     VOLLSTAENDIG in einem laengeren Treffer liegt ("wasser" in "abwasser" ist
//     dasselbe Wort, keine zweite Position). Teilweise ueberlappende Treffer bleiben
//     beide stehen.
//   - Innerhalb eines Eintrags gewinnt der laengste Begriff, nicht der erste der Liste.
//   - Beruehrt eine Zeile zwei oder mehr Nummern (Katalog und/oder Luecke), lautet das
//     Urteil "mehrere Positionen". Die Engine erkennt beide Teile, kann die Aufteilung
//     aber nicht entscheiden - also entscheidet sie sie nicht. Dasselbe Prinzip wie bei
//     § 193 in frist.mjs. Das gilt auch, wenn zusaetzlich ein Ausschluss trifft: Auf
//     welchen Teil sich "Reparatur" bezieht, steht nicht in der Zeile.
//   - Jede Position traegt "abdeckung": welche Woerter der Zeile KEIN Treffer abdeckt.
//     Ein Ergebnis, das nur einen Teil der Zeile bewertet hat, muss als solches
//     erkennbar sein. Die Abdeckung aendert nie das Urteil.

"use strict";

const QUELLE_PRAEFIX = "https://www.gesetze-im-internet.de/";

export const BENOETIGTE_BELEGE = [
  { schluessel: "betrkv-2", gesetz: "BetrKV", paragraph: "§ 2", zweck: "Katalog der Betriebskosten" },
  { schluessel: "betrkv-1", gesetz: "BetrKV", paragraph: "§ 1", zweck: "Was nicht dazugehoert" },
];

export const VERDIKT = {
  KATALOG: "im-katalog",
  AUSGESCHLOSSEN: "nicht-umlagefaehig",
  MIETVERTRAG: "mietvertrag-erforderlich",
  // Bekannte Position, die im Wortlaut des § 2 nicht vorkommt. Der Unterschied zu
  // UNBEKANNT ist inhaltlich: Dort kennt das Werkzeug das Wort nicht, hier kennt
  // es das Wort - und weiss, dass das Gesetz es nicht nennt.
  LUECKE: "im-gesetz-nicht-genannt",
  UNBEKANNT: "nicht-zuordenbar",
  // Die Zeile beruehrt zwei oder mehr Nummern. Kein Urteil ueber die Zeile als Ganzes,
  // weil die Aufteilung aus dem Text nicht hervorgeht - siehe Kopf der Datei.
  MEHRERE: "mehrere-positionen",
};

// Diese beiden Nummern sind aus dem Gesetzestext allein nie zu entscheiden und
// tragen ihren Hinweis IMMER, auch bei einem sauberen Treffer.
export const IMMER_MIT_VORBEHALT = {
  14: "Beim Hauswart sind umlagefähige und nicht umlagefähige Arbeiten zu trennen: "
    + "§ 2 Nr. 14 BetrKV rechnet die Kosten nur an, soweit sie nicht Instandhaltung, "
    + "Instandsetzung, Erneuerung, Schönheitsreparaturen oder die Hausverwaltung betreffen. "
    + "Wie die Aufteilung im Einzelfall aussieht, steht nicht im Gesetz.",
  17: "Sonstige Betriebskosten sind nur umlagefähig, wenn sie im Mietvertrag ausdrücklich "
    + "vereinbart sind. Ob das der Fall ist, steht nicht im Gesetz, sondern in Ihrem Vertrag.",
};

// ---------------------------------------------------------------------------
// Belege
// ---------------------------------------------------------------------------

export function belegeLaden(korpus) {
  const fehlend = [];
  const belege = {};

  if (!Array.isArray(korpus) || korpus.length === 0) {
    return {
      ok: false, belege: {},
      fehlend: BENOETIGTE_BELEGE.map((b) => ({ ...b, grund: "Wissensbasis nicht geladen oder leer" })),
    };
  }

  for (const gesucht of BENOETIGTE_BELEGE) {
    const eintrag = korpus.find(
      (p) => p && p.gesetz === gesucht.gesetz && p.paragraph === gesucht.paragraph);
    if (!eintrag) { fehlend.push({ ...gesucht, grund: "Paragraph nicht in der Wissensbasis" }); continue; }
    if (typeof eintrag.text !== "string" || eintrag.text.trim().length === 0) {
      fehlend.push({ ...gesucht, grund: "Paragraph ohne Text" }); continue;
    }
    if (typeof eintrag.quelle !== "string" || !eintrag.quelle.startsWith(QUELLE_PRAEFIX)) {
      fehlend.push({ ...gesucht, grund: "Kein Link auf die amtliche Quelle" }); continue;
    }
    belege[gesucht.schluessel] = {
      schluessel: gesucht.schluessel,
      gesetz: eintrag.gesetz,
      gesetz_lang: eintrag.gesetz_lang || eintrag.gesetz,
      paragraph: eintrag.paragraph,
      titel: eintrag.titel || "",
      text: eintrag.text,
      quelle: eintrag.quelle,
      stand: eintrag.stand || "",
      hinweis: eintrag.hinweis || "",
    };
  }
  return { ok: fehlend.length === 0, belege, fehlend };
}

// ---------------------------------------------------------------------------
// § 2 BetrKV - Katalog parsen
// ---------------------------------------------------------------------------

const istNummer = (z) => /^\d{1,2}\.\s+\S/.test(z);
const istUnterpunkt = (z) => /^[a-z]\)\s+\S/.test(z);
const istOder = (z) => z.trim() === "oder";

function ohneEndzeichen(s) {
  return s.replace(/[,;.]\s*$/, "").trim();
}

// Der Schlusssatz des § 2 ("Für Anlagen, die ab dem 1. Dezember 2021 errichtet
// worden sind, ...") gehoert zu KEINER Nummer - er schraenkt Nr. 15 ein und steht
// hinter dem Katalog. Wer einfach alles hinter der letzten Nummer einsammelt,
// haengt ihn an Nr. 17 "sonstige Betriebskosten" an und zitiert ihn dann als
// deren Bestandteil. Das faellt beim Lesen nicht auf, weil die Stelle einen
// echten Paragraphen und einen echten Link traegt.
//
// Unterschieden wird deshalb strukturell, nicht ueber ein Stichwort: Innerhalb
// einer Nummer folgt auf eine Leerzeile immer "oder" (kommt in Nr. 15 zweimal
// vor). Folgt auf eine Leerzeile etwas anderes, ist der Katalog zu Ende.
export function parseKatalog(text) {
  const zeilen = String(text || "").split("\n");
  const items = [];
  const vorspann = [];
  let schlusssatz = "";
  let aktuell = null;
  let i = 0;

  const naechsteNichtLeere = (von) => {
    for (let j = von; j < zeilen.length; j++) if (zeilen[j].trim() !== "") return zeilen[j];
    return null;
  };

  while (i < zeilen.length) {
    const zeile = zeilen[i];

    if (zeile.trim() === "") {
      const folgt = naechsteNichtLeere(i + 1);
      if (folgt === null) break;
      if (istOder(folgt) || istUnterpunkt(folgt) || istNummer(folgt)) { i++; continue; }
      schlusssatz = zeilen.slice(i + 1).join("\n").trim();
      break;
    }

    const treffer = /^(\d{1,2})\.\s+(.*)$/.exec(zeile);
    if (treffer) {
      aktuell = { nr: Number(treffer[1]), zeilen: [zeile], unterpunkte: [] };
      items.push(aktuell);
      i++;
      continue;
    }

    if (aktuell) {
      aktuell.zeilen.push(zeile);
      if (istUnterpunkt(zeile)) aktuell.unterpunkte.push(zeile);
    } else {
      vorspann.push(zeile);
    }
    i++;
  }

  for (const item of items) {
    const kopf = ohneEndzeichen(item.zeilen[0].replace(/^\d{1,2}\.\s+/, ""));
    // Nr. 4, 5 und 15 heissen in der ersten Zeile nur "die Kosten"; erst der
    // erste Unterpunkt sagt, worum es geht. Abgeleitet, nicht abgeschrieben.
    item.kurztitel = (kopf === "die Kosten" && item.unterpunkte.length > 0)
      ? kopf + " " + ohneEndzeichen(item.unterpunkte[0].replace(/^[a-z]\)\s+/, ""))
      : kopf;
    item.text = item.zeilen.join("\n");
  }

  return { items, vorspann: vorspann.join("\n"), schlusssatz };
}

// § 1 Abs. 2 BetrKV - die beiden Ausschluesse.
export function parseAusschluesse(text) {
  const zeilen = String(text || "").split("\n");
  const start = zeilen.findIndex((z) => /^\(2\)/.test(z.trim()));
  if (start === -1) return { einleitung: "", posten: [] };

  const posten = [];
  for (let i = start + 1; i < zeilen.length; i++) {
    const zeile = zeilen[i];
    if (zeile.trim() === "") continue;
    if (/^\(\d+\)/.test(zeile.trim())) break;
    const treffer = /^(\d{1,2})\.\s+(.*)$/.exec(zeile);
    if (!treffer) continue;
    // Der Kurztitel steht im Gesetz selbst - als Klammerzusatz am Ende:
    // "(Verwaltungskosten)", "(Instandhaltungs- und Instandsetzungskosten)".
    const klammern = zeile.match(/\(([^()]+)\)\s*[,.]?\s*$/);
    posten.push({
      nr: Number(treffer[1]),
      kurztitel: klammern ? klammern[1] : ohneEndzeichen(treffer[2]),
      text: zeile,
    });
  }
  return { einleitung: zeilen[start], posten };
}

// ---------------------------------------------------------------------------
// Normalisierung
// ---------------------------------------------------------------------------

export function falte(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Betraege werden entfernt und danach WEGGEWORFEN. Dieses Werkzeug rechnet
// bewusst nicht mit ihnen: keine Summe, kein Anteil, keine Gegenprobe. Was hier
// geprueft wird, ist die Position - nicht die Rechnung.
export function trenneBetrag(zeile) {
  let rest = String(zeile || "").trim();
  rest = rest.replace(/^\s*(?:[-•*–]|\d{1,3}[.)])\s+/, "");
  let vorher;
  do {
    vorher = rest;
    rest = rest
      .replace(/\s*(?:€|eur|euro)\s*$/i, "")
      .replace(/\s*[-+]?\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?\s*$/, "")
      .replace(/\s*[-+]?\d+(?:[.,]\d{1,2})?\s*$/, "")
      .replace(/[\s:;|.,–-]+$/, "")
      .trim();
  } while (rest !== vorher);
  return rest;
}

// ---------------------------------------------------------------------------
// Zeilen, die keine Position sind
// ---------------------------------------------------------------------------
//
// Diese Stichwoerter stehen in keinem Gesetz - sie sind redaktionell und dienen
// nur der Lesbarkeit der Ausgabe. Deshalb erzeugen sie auch KEINEN Befund,
// sondern nur die Einordnung "nicht als Position gewertet" samt Grund. Und sie
// greifen erst, wenn die Zeile keinen Treffer hatte (siehe Kopf der Datei).
const SUMMENWORTE = [
  "summe", "zwischensumme", "gesamtsumme", "gesamtbetrag", "gesamtkosten",
  "uebertrag", "saldo", "nachzahlung", "guthaben", "vorauszahlung",
  "vorauszahlungen", "abschlag", "ihr anteil", "ergebnis",
];
const KOPFZEILENWORTE = [
  "kostenart", "kostenarten", "position", "positionen", "betrag", "bezeichnung",
  "verteilerschluessel", "umlageschluessel", "verteilerschlussel", "einheit",
  "abrechnungszeitraum", "zeitraum", "wohnflaeche", "anteil", "gesamt",
  "seite", "rechnungsnummer", "kundennummer", "mieter", "vermieter", "objekt",
];

// Fuellwoerter fuer die Abdeckung einer Zeile.
//
// REDAKTIONELL, NICHT AUS DEM GESETZ - wie SUMMENWORTE und KOPFZEILENWORTE. Diese
// Liste entscheidet nur, welche Woerter bei der Abdeckung NICHT als "unbewertet"
// gemeldet werden: "Wasser und Müll" ist vollstaendig bewertet, obwohl "und" keinen
// Treffer hat. Sie erzeugt NIE ein Urteil und NIE eine Fundstelle.
//
// Eintraege stehen in gefalteter Form (siehe falte): "fuer", nicht "für" - sonst
// greift ein Eintrag nie, und das faellt nicht auf. scripts/pruefe-betriebskosten.js
// prueft das. Beim Ausbau der Wissensbasis gehoert diese Liste mit auf den Tisch.
export const FUELLWOERTER = [
  "und", "oder", "sowie", "inkl", "einschl", "fuer", "der", "die", "das", "des",
  "von", "mit", "kosten",
];

export function nichtPositionGrund(rohzeile, bezeichnung) {
  const roh = String(rohzeile || "").trim();
  const gefaltet = falte(bezeichnung);

  if (gefaltet === "") return "enthält keine Bezeichnung, nur Zahlen oder Zeichen";
  if (gefaltet.length < 3) return "zu kurz für eine Positionsbezeichnung";
  // Gegen die ROHE Zeile geprueft: "Seite 2" verliert beim Abtrennen des Betrags
  // seine Ziffer und saehe sonst aus wie eine Ueberschrift.
  if (/^seite\s*\d+/.test(falte(roh)) || /^-\s*\d+\s*-$/.test(roh)) return "sieht nach einer Seitenzahl aus";
  if (/\d{1,2}\.\d{1,2}\.\d{2,4}/.test(roh) || /^(19|20)\d{2}$/.test(gefaltet)) {
    return "sieht nach einer Datums- oder Zeitraumangabe aus";
  }
  for (const wort of SUMMENWORTE) if (gefaltet.includes(wort)) return "sieht nach einer Summenzeile aus";
  // Kopfzeilen einer Tabelle bestehen aus mehreren Spaltentiteln nebeneinander
  // ("Kostenart   Betrag   Anteil"). Deshalb wird jedes Wort geprueft, nicht die
  // ganze Zeile - aber ALLE muessen Spaltentitel sein, sonst ist es eine Position.
  const woerter = gefaltet.split(" ").filter(Boolean);
  if (woerter.length > 0 && woerter.every((w) => KOPFZEILENWORTE.includes(w))) {
    return "sieht nach einer Überschrift aus";
  }
  return null;
}

// ---------------------------------------------------------------------------
// Zuordnung einer einzelnen Zeile
// ---------------------------------------------------------------------------

// Alle Treffer einer Zeile, jeweils mit Position (start/ende in der gefalteten Zeile).
//
// Frueher brach die Suche je Eintrag beim ERSTEN passenden Begriff der Liste ab, und
// danach blieb je Zeile nur ein einziger Treffer uebrig. Beides hat still verworfen:
// "Warmwasserversorgung" traf Nr. 5 ueber "warmwasser" (10 Zeichen) statt ueber den
// ganzen Begriff (20) und verlor dann gegen "wasserversorgung" aus Nr. 2 (16). Bei
// "Wasser und Müll" verschwand Nr. 8.
//
// Jetzt wird jedes Vorkommen jedes Begriffs gesammelt, laengster Treffer zuerst. Ein
// Treffer faellt nur weg, wenn er vollstaendig in einem schon behaltenen, laengeren
// Treffer liegt - dann ist er Teil desselben Wortes und keine eigene Position.
// Teilweise Ueberlappungen bleiben beide stehen: Dort waere jede Auswahl eine Vermutung.
function sucheTreffer(gefaltet, eintraege) {
  const alle = [];
  for (const eintrag of eintraege) {
    for (const begriff of eintrag.begriffe) {
      const gefalteterBegriff = falte(begriff);
      if (!gefalteterBegriff) continue;
      for (let start = gefaltet.indexOf(gefalteterBegriff); start !== -1;
        start = gefaltet.indexOf(gefalteterBegriff, start + 1)) {
        alle.push({ eintrag, begriff, start, ende: start + gefalteterBegriff.length });
      }
    }
  }

  // Laengster Begriff gewinnt: "hausmeisterservice" ist genauer als "haus".
  alle.sort((a, b) => (b.ende - b.start) - (a.ende - a.start) || a.start - b.start);

  const behalten = [];
  for (const t of alle) {
    const enthalten = behalten.some((b) => b.start <= t.start && t.ende <= b.ende);
    if (!enthalten) behalten.push(t);
  }
  return behalten;
}

// Fasst Treffer je Eintrag zusammen. Mehrere Treffer derselben Nummer sind EINE
// Fundstelle; genannt wird der laengste Begriff. Reihenfolge: wie in der Zeile.
function jeEintrag(treffer) {
  const gruppen = new Map();
  for (const t of treffer) {
    // treffer kommt nach Laenge sortiert - der erste je Eintrag ist der laengste.
    if (!gruppen.has(t.eintrag.schluessel)) {
      gruppen.set(t.eintrag.schluessel, { eintrag: t.eintrag, begriff: t.begriff, start: t.start });
    }
    const gruppe = gruppen.get(t.eintrag.schluessel);
    gruppe.start = Math.min(gruppe.start, t.start);
  }
  return [...gruppen.values()].sort((a, b) => a.start - b.start);
}

// Welche Woerter der Zeile kein Treffer abdeckt. Ein Wort gilt nur als bewertet, wenn
// es VOLLSTAENDIG abgedeckt ist: "Wasserschaden" ist nicht bewertet, nur weil "wasser"
// darin steckt. Gemeldet wird das Wort so, wie der Nutzer es geschrieben hat - nie in
// gefalteter Form. Zahlen und FUELLWOERTER zaehlen nicht als unbewertet.
function berechneAbdeckung(bezeichnung, gefaltet, treffer, verdikt) {
  const abgedeckt = new Array(gefaltet.length).fill(false);
  for (const t of treffer) for (let i = t.start; i < t.ende; i++) abgedeckt[i] = true;

  const unbewertet = [];
  let cursor = 0;
  for (const wort of String(bezeichnung).match(/[\p{L}\p{N}]+/gu) || []) {
    const gefaltetesWort = falte(wort);
    if (!gefaltetesWort) continue;
    const start = gefaltet.indexOf(gefaltetesWort, cursor);
    // Nicht wiedergefunden (sollte nicht vorkommen): lieber als unbewertet melden.
    if (start === -1) { unbewertet.push(wort); continue; }
    const ende = start + gefaltetesWort.length;
    cursor = ende;
    if (/^\d+$/.test(gefaltetesWort) || FUELLWOERTER.includes(gefaltetesWort)) continue;
    let voll = true;
    for (let i = start; i < ende; i++) if (!abgedeckt[i]) { voll = false; break; }
    if (!voll) unbewertet.push(wort);
  }

  return {
    vollstaendig: verdikt !== VERDIKT.UNBEKANNT && unbewertet.length === 0,
    unbewertet,
  };
}

// Steht der Begriff als GANZES WORT im Gesetzestext? Nur dann darf die Oberflaeche
// "steht so im Gesetz" schreiben. Ein Teilstring reicht nicht: "Müll" steckt in
// "Müllbeseitigung", "Reinigung" in "Gebäudereinigung" - so steht es eben nicht im
// Gesetz. Bewusst ohne Liste erlaubter Endungen: Die waere redaktionell und laege
// schon beim ersten echten Fall daneben ("Instandhaltungs-" traegt ein Fugen-s, keine
// Endung). Der Preis: "Brennstoff" (Gesetz: "Brennstoffe") verliert das Kennzeichen.
// Das ist die richtige Richtung - die Anzeige ist dann weniger sicher als der Befund,
// nie sicherer. Gearbeitet wird auf der gefalteten Form, dort trennt genau ein
// Leerzeichen die Woerter.
function stehtAlsWort(text, begriff) {
  const gefalteterBegriff = falte(begriff);
  if (!gefalteterBegriff) return false;
  return ` ${falte(text)} `.includes(` ${gefalteterBegriff} `);
}

function fundstelleKatalog(item, begriff, wortlaut, beleg) {
  return {
    art: "katalog",
    nr: item.nr,
    bezeichnung: `§ 2 Nr. ${item.nr} BetrKV`,
    kurztitel: item.kurztitel,
    text: item.text,
    quelle: beleg.quelle,
    // Ein Treffer ueber ein Alltagswort ist eine redaktionelle Zuordnung, kein
    // Gesetzeswortlaut. Er wird deshalb als solcher ausgewiesen - mitsamt dem
    // Begriff, der ihn ausgeloest hat, damit der Nutzer die Zuordnung selbst
    // nachpruefen kann statt sie zu glauben.
    treffer: wortlaut ? { art: "wortlaut", begriff } : { art: "suchbegriff", begriff },
  };
}

function fundstelleAusschluss(posten, begriff, wortlaut, beleg) {
  return {
    art: "ausschluss",
    nr: posten.nr,
    bezeichnung: `§ 1 Abs. 2 Nr. ${posten.nr} BetrKV`,
    kurztitel: posten.kurztitel,
    text: posten.text,
    quelle: beleg.quelle,
    treffer: wortlaut ? { art: "wortlaut", begriff } : { art: "suchbegriff", begriff },
  };
}

// Der Hinweis zu einer bekannten Luecke. ER HAT BEWUSST KEIN quelle- UND KEIN
// text-FELD. Das ist keine Nachlaessigkeit und auch keine Zusage der Oberflaeche,
// nichts zu verlinken, sondern eine Eigenschaft des Objekts: Woraus kein Link
// gebaut werden kann, daraus wird auch versehentlich keiner gebaut. Die Zuordnung
// zu einer Nummer stammt hier aus der Rechtsprechung, nicht aus dem Gesetzestext -
// sie darf deshalb nirgends wie eine Fundstelle aussehen. Aus demselben Grund wird
// nur "Nr. 8" genannt und nicht "§ 2 Nr. 8 BetrKV": Die volle Zitierform ist auf
// dieser Seite das Kennzeichen eines echten Belegs.
function luecke(eintrag, begriff) {
  return {
    begriff,
    praxisNr: eintrag.praxisNr,
    hinweis: "Häufige Position, im Wortlaut der Betriebskostenverordnung aber nicht "
      + `genannt. In der Praxis wird sie Nr. ${eintrag.praxisNr} zugerechnet; diese `
      + "Zuordnung stammt aus der Rechtsprechung, nicht aus dem Wortlaut. Dieses "
      + "Werkzeug ordnet nur nach dem Gesetzestext zu.",
  };
}

export function ordneZeileZu(bezeichnung, katalog, ausschluesse, begriffe, belege) {
  const gefaltet = falte(bezeichnung);
  if (gefaltet === "") {
    return {
      verdikt: VERDIKT.UNBEKANNT, fundstellen: [], luecken: [], vorbehalte: [],
      abdeckung: { vollstaendig: false, unbewertet: [] },
    };
  }

  const katalogEintraege = [];
  const ausschlussEintraege = [];
  const lueckenEintraege = [];
  for (const eintrag of begriffe) {
    if (eintrag.art === "katalog") katalogEintraege.push(eintrag);
    else if (eintrag.art === "luecke") lueckenEintraege.push(eintrag);
    else ausschlussEintraege.push(eintrag);
  }

  const ausschlussTreffer = sucheTreffer(gefaltet, ausschlussEintraege);

  // Katalog und Luecken treten im SELBEN Wettbewerb an, laengster Begriff gewinnt.
  // Getrennte Durchlaeufe waeren hier ein Fehler mit Ansage: "Dachrinnenreinigung"
  // enthaelt "reinigung" und wuerde sonst als § 2 Nr. 9 durchgehen - eine
  // dokumentierte Luecke, ausgegeben mit echtem Paragraphen und echtem Link.
  const trefferKatalogUndLuecke = sucheTreffer(gefaltet, [...katalogEintraege, ...lueckenEintraege]);

  // Ausschluesse zuerst - Begruendung im Kopf dieser Datei. Jeder getroffene
  // Ausschluss wird genannt, nicht nur der erste.
  const fundstellenAusschluss = [];
  for (const gruppe of jeEintrag(ausschlussTreffer)) {
    const posten = ausschluesse.posten.find((p) => p.nr === gruppe.eintrag.nr);
    if (!posten) continue;
    const wortlaut = stehtAlsWort(posten.text, gruppe.begriff);
    fundstellenAusschluss.push(fundstelleAusschluss(posten, gruppe.begriff, wortlaut, belege["betrkv-1"]));
  }

  const fundstellenKatalog = [];
  const luecken = [];
  const zielGruppen = jeEintrag(trefferKatalogUndLuecke);
  for (const gruppe of zielGruppen) {
    if (gruppe.eintrag.art === "luecke") {
      luecken.push(luecke(gruppe.eintrag, gruppe.begriff));
      continue;
    }
    const item = katalog.items.find((it) => it.nr === gruppe.eintrag.nr);
    if (!item) continue;
    const wortlaut = stehtAlsWort(item.text, gruppe.begriff);
    fundstellenKatalog.push(fundstelleKatalog(item, gruppe.begriff, wortlaut, belege["betrkv-2"]));
  }

  // Wie viele verschiedene Nummern (Katalog oder Luecke) die Zeile beruehrt.
  const ziele = fundstellenKatalog.length + luecken.length;

  let verdikt = null;
  // Zwei oder mehr Nummern: Die Aufteilung geht aus der Zeile nicht hervor, also wird
  // sie nicht entschieden - auch nicht ueber einen zusaetzlichen Ausschluss.
  if (ziele >= 2) verdikt = VERDIKT.MEHRERE;
  if (verdikt === null && fundstellenAusschluss.length > 0) verdikt = VERDIKT.AUSGESCHLOSSEN;
  if (verdikt === null && luecken.length === 1) verdikt = VERDIKT.LUECKE;
  if (fundstellenKatalog.length === 1 && ziele === 1 && verdikt === null) {
    verdikt = IMMER_MIT_VORBEHALT[fundstellenKatalog[0].nr] ? VERDIKT.MIETVERTRAG : VERDIKT.KATALOG;
  }
  if (verdikt === null) verdikt = VERDIKT.UNBEKANNT;

  const fundstellen = [...fundstellenAusschluss, ...fundstellenKatalog];

  // Nr. 14 und Nr. 17 tragen ihren Vorbehalt immer, auch wenn das Urteil wegen
  // eines Ausschlusses oder mehrerer Positionen schon anders lautet.
  const vorbehalte = fundstellen
    .filter((f) => f.art === "katalog" && IMMER_MIT_VORBEHALT[f.nr])
    .map((f) => ({ nr: f.nr, text: IMMER_MIT_VORBEHALT[f.nr] }));

  const abdeckung = berechneAbdeckung(
    bezeichnung, gefaltet, [...ausschlussTreffer, ...trefferKatalogUndLuecke], verdikt);

  return { verdikt, fundstellen, luecken, vorbehalte, abdeckung };
}

// ---------------------------------------------------------------------------
// Einstieg
// ---------------------------------------------------------------------------

export function pruefePositionen(eingabe, korpus, begriffsdatei) {
  const { text = "", alleZeilenPruefen = false } = eingabe || {};

  const geladen = belegeLaden(korpus);
  if (!geladen.ok) {
    return { ok: false, grund: "belege-fehlen", fehlend: geladen.fehlend, positionen: [], nichtGewertet: [] };
  }

  const begriffe = begriffeAufbereiten(begriffsdatei);
  if (begriffe.length === 0) {
    return { ok: false, grund: "begriffe-fehlen", positionen: [], nichtGewertet: [] };
  }

  const katalog = parseKatalog(geladen.belege["betrkv-2"].text);
  const ausschluesse = parseAusschluesse(geladen.belege["betrkv-1"].text);

  if (katalog.items.length === 0 || ausschluesse.posten.length === 0) {
    return { ok: false, grund: "katalog-unlesbar", positionen: [], nichtGewertet: [] };
  }

  const rohzeilen = String(text).split(/\r?\n/);
  const positionen = [];
  const nichtGewertet = [];

  for (const rohzeile of rohzeilen) {
    if (rohzeile.trim() === "") continue;
    const bezeichnung = trenneBetrag(rohzeile);
    const zuordnung = ordneZeileZu(bezeichnung, katalog, ausschluesse, begriffe, geladen.belege);

    // Aussortiert wird ausschliesslich, was ohnehin keinen Treffer hatte.
    if (zuordnung.verdikt === VERDIKT.UNBEKANNT && !alleZeilenPruefen) {
      const grund = nichtPositionGrund(rohzeile, bezeichnung);
      if (grund) { nichtGewertet.push({ rohzeile: rohzeile.trim(), grund }); continue; }
    }

    positionen.push({
      rohzeile: rohzeile.trim(),
      bezeichnung,
      verdikt: zuordnung.verdikt,
      fundstellen: zuordnung.fundstellen,
      luecken: zuordnung.luecken || [],
      vorbehalte: zuordnung.vorbehalte || [],
      abdeckung: zuordnung.abdeckung,
    });
  }

  const zaehle = (v) => positionen.filter((p) => p.verdikt === v).length;

  return {
    ok: true,
    belege: geladen.belege,
    katalog,
    ausschluesse,
    positionen,
    nichtGewertet,
    zusammenfassung: {
      zeilenGesamt: rohzeilen.filter((z) => z.trim() !== "").length,
      geprueft: positionen.length,
      imKatalog: zaehle(VERDIKT.KATALOG),
      nichtUmlagefaehig: zaehle(VERDIKT.AUSGESCHLOSSEN),
      mietvertrag: zaehle(VERDIKT.MIETVERTRAG),
      nichtGenannt: zaehle(VERDIKT.LUECKE),
      nichtZuordenbar: zaehle(VERDIKT.UNBEKANNT),
      mehrerePositionen: zaehle(VERDIKT.MEHRERE),
      // Bewertet, aber nicht die ganze Zeile - siehe abdeckung.
      teilweiseBewertet: positionen.filter(
        (p) => p.verdikt !== VERDIKT.UNBEKANNT && !p.abdeckung.vollstaendig).length,
      nichtGewertet: nichtGewertet.length,
    },
  };
}

// Bringt die Begriffsdatei in die Form, die ordneZeileZu erwartet, und wirft
// dabei nichts stillschweigend weg: Ein Eintrag ohne Begriffe faellt raus, wird
// aber vom Pruefskript gemeldet.
export function begriffeAufbereiten(datei) {
  if (!datei || typeof datei !== "object") return [];
  const eintraege = [];
  for (const [schluessel, wert] of Object.entries(datei)) {
    if (schluessel.startsWith("_") || !wert || typeof wert !== "object") continue;
    if (!Array.isArray(wert.begriffe) || wert.begriffe.length === 0) continue;

    // Bekannte Luecken: eigener Schluesselraum, damit sie nie als Katalog- oder
    // Ausschlusseintrag durchgehen koennen. "praxis_nr" ist die Nummer, der die
    // Praxis die Position zurechnet - kein Beleg, nur eine Angabe im Hinweistext.
    const luecke = /^luecke-[a-z0-9-]+$/.exec(schluessel);
    if (luecke) {
      if (!Number.isInteger(wert.praxis_nr)) continue;
      eintraege.push({
        schluessel,
        art: "luecke",
        nr: wert.praxis_nr,
        praxisNr: wert.praxis_nr,
        titel_pruefung: wert.titel_pruefung || "",
        begriffe: wert.begriffe,
      });
      continue;
    }

    const treffer = /^betrkv-(1|2)-(\d{1,2})$/.exec(schluessel);
    if (!treffer) continue;
    eintraege.push({
      schluessel,
      art: treffer[1] === "2" ? "katalog" : "ausschluss",
      nr: Number(treffer[2]),
      titel_pruefung: wert.titel_pruefung || "",
      begriffe: wert.begriffe,
    });
  }
  return eintraege;
}
