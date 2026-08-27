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
  UNBEKANNT: "nicht-zuordenbar",
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

function sucheBegriffe(gefaltet, eintraege) {
  const treffer = [];
  for (const eintrag of eintraege) {
    for (const begriff of eintrag.begriffe) {
      const gefalteterBegriff = falte(begriff);
      if (gefalteterBegriff && gefaltet.includes(gefalteterBegriff)) {
        treffer.push({ eintrag, begriff, laenge: gefalteterBegriff.length });
        break;
      }
    }
  }
  // Laengster Begriff gewinnt: "hausmeisterservice" ist genauer als "haus".
  treffer.sort((a, b) => b.laenge - a.laenge);
  return treffer;
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

export function ordneZeileZu(bezeichnung, katalog, ausschluesse, begriffe, belege) {
  const gefaltet = falte(bezeichnung);
  if (gefaltet === "") return { verdikt: VERDIKT.UNBEKANNT, fundstellen: [] };

  const katalogEintraege = [];
  const ausschlussEintraege = [];
  for (const eintrag of begriffe) {
    if (eintrag.art === "katalog") katalogEintraege.push(eintrag);
    else ausschlussEintraege.push(eintrag);
  }

  const ausschlussTreffer = sucheBegriffe(gefaltet, ausschlussEintraege);
  const katalogTreffer = sucheBegriffe(gefaltet, katalogEintraege);

  const fundstellen = [];

  // Ausschluss zuerst - Begruendung im Kopf dieser Datei.
  let verdikt = null;
  if (ausschlussTreffer.length > 0) {
    const best = ausschlussTreffer[0];
    const posten = ausschluesse.posten.find((p) => p.nr === best.eintrag.nr);
    if (posten) {
      const wortlaut = falte(posten.text).includes(falte(best.begriff));
      fundstellen.push(fundstelleAusschluss(posten, best.begriff, wortlaut, belege["betrkv-1"]));
      verdikt = VERDIKT.AUSGESCHLOSSEN;
    }
  }

  if (katalogTreffer.length > 0) {
    const best = katalogTreffer[0];
    const item = katalog.items.find((it) => it.nr === best.eintrag.nr);
    if (item) {
      const wortlaut = falte(item.text).includes(falte(best.begriff));
      fundstellen.push(fundstelleKatalog(item, best.begriff, wortlaut, belege["betrkv-2"]));
      if (verdikt === null) {
        verdikt = IMMER_MIT_VORBEHALT[item.nr] ? VERDIKT.MIETVERTRAG : VERDIKT.KATALOG;
      }
    }
  }

  if (verdikt === null) return { verdikt: VERDIKT.UNBEKANNT, fundstellen: [] };

  // Nr. 14 und Nr. 17 tragen ihren Vorbehalt immer, auch wenn das Urteil wegen
  // eines Ausschlusses schon anders lautet.
  const vorbehalte = fundstellen
    .filter((f) => f.art === "katalog" && IMMER_MIT_VORBEHALT[f.nr])
    .map((f) => ({ nr: f.nr, text: IMMER_MIT_VORBEHALT[f.nr] }));

  return { verdikt, fundstellen, vorbehalte };
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
      vorbehalte: zuordnung.vorbehalte || [],
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
      nichtZuordenbar: zaehle(VERDIKT.UNBEKANNT),
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
