// kern/frist.mjs
// Fristberechnung fuer die Betriebskostenabrechnung - Teil A des Pruefers.
//
// Rechnet zwei voneinander unabhaengige Zwoelfmonatsfristen aus § 556 Abs. 3 BGB:
//   Satz 2 - der Vermieter muss die Abrechnung binnen zwoelf Monaten nach Ende des
//            Abrechnungszeitraums mitteilen.
//   Satz 5 - der Mieter muss Einwendungen binnen zwoelf Monaten nach Zugang der
//            Abrechnung mitteilen.
// Beide laufen ueber dieselbe Rechenkette (§§ 187 Abs. 1, 188 Abs. 2 und 3, 193 BGB),
// nur mit unterschiedlichem Startereignis.
//
// ZWEI ENTWURFSENTSCHEIDUNGEN, die man beim Lesen kennen muss:
//
// 1. Kein Gesetzestext in dieser Datei. Jede Regel, die ausgegeben wird, holt sich
//    ihren Beleg zur Laufzeit aus wissensbasis/gesetze.json. Fehlt dort ein
//    Paragraph oder sein Quell-Link, liefert dieses Modul KEIN Ergebnis, sondern
//    ok:false. Eine Frist ohne Beleg anzuzeigen waere schlimmer als gar nichts
//    anzuzeigen - sie sieht genauso aus wie eine belegte.
//
// 2. § 193 BGB wird nie allein ausgegeben. Ob § 193 auf diese Ausschlussfrist
//    ueberhaupt anzuwenden ist, ist Auslegungsfrage - die Vorschrift spricht von
//    einer Willenserklaerung oder einer Leistung. Dieses Modul gibt deshalb IMMER
//    beide Daten zurueck: das Fristende nach §§ 187/188 und das nach § 193
//    verschobene. Sich fuer eines zu entscheiden waere eine Rechtsmeinung im
//    Gewand einer Rechnung. Liegt der Zugang zwischen beiden Daten, ist das
//    Ergebnis ausdruecklich "haengt von § 193 ab" - keine Antwort ist hier die
//    einzige richtige Antwort.

"use strict";

import { istGueltigesDatum } from "./datum.mjs";
import { ABDECKUNG, NICHT_ABGEDECKT } from "./feiertage.mjs";
import { ladeBelege } from "./belege.mjs";
import { monatsfrist } from "./fristbausteine.mjs";

// Belege laedt kern/belege.mjs - fuer alle Module gleich. Jeder Beleg muss von der
// amtlichen Quelle stammen; ein Eintrag mit leerem oder fremdem Link zaehlt als fehlend.

export const FRIST_MONATE = 12;

// Wortlaut-Bausteine, die die Oberflaeche anzeigt.
//
// Warum das hier steht und nicht in betriebskosten-pruefer.js: Die Seite erklaert,
// WANN § 193 BGB ueberhaupt gilt, und gibt dafuer den Tatbestand der Vorschrift
// wieder. Stand dieser Teilsatz im Oberflaechen-Code, pruefte ihn nichts - er waere
// beim naechsten Import der Gesetze unbemerkt falsch geworden, waehrend der
// vollstaendige Text direkt darunter richtig gewesen waere. Genau diese Sorte
// stiller Abweichung ist gefaehrlich, weil sie belegt aussieht.
//
// Als Teil des Ergebnisses wird der Baustein gegen den Text aus gesetze.json
// geprueft (scripts/pruefe-betriebskosten.js) - wie der Wortlaut des § 556.
export const ZITATE = {
  paragraf193Voraussetzung: "eine Willenserklärung abzugeben oder eine Leistung zu bewirken",
};

// Welche Paragraphen dieses Modul braucht. Die Liste ist zugleich die Pruefliste
// beim Laden - was hier steht, muss in der Wissensbasis vorhanden sein.
export const BENOETIGTE_BELEGE = [
  { schluessel: "bgb-556", gesetz: "BGB", paragraph: "§ 556", zweck: "Grundlage beider Fristen" },
  { schluessel: "bgb-187", gesetz: "BGB", paragraph: "§ 187", zweck: "Fristbeginn" },
  { schluessel: "bgb-188", gesetz: "BGB", paragraph: "§ 188", zweck: "Fristende" },
  { schluessel: "bgb-193", gesetz: "BGB", paragraph: "§ 193", zweck: "Sonn- und Feiertag, Sonnabend" },
];

// ---------------------------------------------------------------------------
// Belege
// ---------------------------------------------------------------------------

export function belegeLaden(korpus) {
  return ladeBelege(korpus, BENOETIGTE_BELEGE);
}

// ---------------------------------------------------------------------------
// Eine Frist - Rechenkette aus kern/fristbausteine.mjs, hier nur die Anbindung an § 556
// ---------------------------------------------------------------------------

function berechneFrist({ schluessel, titel, grundlage, satz, startIso, startLabel, bestaetigt }) {
  const f = monatsfrist({
    startIso, monate: FRIST_MONATE, startLabel, bestaetigt,
    bezeichnung: { frist: "Zwölfmonatsfrist", monat: "zwölften" },
  });
  // Reihenfolge der Schluessel wie vorher: Die Benchmark-Fragedateien enthalten
  // dieses Objekt und sollen byte-gleich bleiben.
  return {
    schluessel, titel, grundlage, satz, startIso, startLabel,
    schritte: f.schritte, basis: f.basis, verschiebung: f.verschiebung,
    feiertagsfrage: f.feiertagsfrage,
  };
}

// Drei Zustaende, nicht zwei. Liegt das Ereignis zwischen dem Fristende nach
// §§ 187/188 und dem nach § 193 verschobenen Datum, haengt die Antwort daran, ob
// § 193 auf diese Frist anzuwenden ist. Das ist offen - und wird als offen gemeldet.
function bewerte(ereignisIso, frist) {
  if (!ereignisIso) return null;
  if (ereignisIso <= frist.basis.iso) return { status: "gewahrt", ereignisIso };
  if (ereignisIso <= frist.verschiebung.zielIso) return { status: "abhaengig", ereignisIso };
  return { status: "versaeumt", ereignisIso };
}

// ---------------------------------------------------------------------------
// Einstieg
// ---------------------------------------------------------------------------

export function pruefeFristen(eingabe, korpus) {
  const {
    zeitraumEndeIso = null,
    zugangIso = null,
    heuteIso = null,
    feiertageBestaetigt = [],
  } = eingabe || {};

  const geladen = belegeLaden(korpus);
  if (!geladen.ok) {
    return {
      ok: false,
      grund: "belege-fehlen",
      fehlend: geladen.fehlend,
      abrechnungsfrist: null,
      einwendungsfrist: null,
      ...grundform(),
    };
  }

  const fehler = [];
  if (!zeitraumEndeIso && !zugangIso) {
    fehler.push("Bitte mindestens das Ende des Abrechnungszeitraums angeben.");
  }
  if (zeitraumEndeIso && !istGueltigesDatum(zeitraumEndeIso)) {
    fehler.push("Das Ende des Abrechnungszeitraums ist kein gültiges Datum.");
  }
  if (zugangIso && !istGueltigesDatum(zugangIso)) {
    fehler.push("Das Zugangsdatum ist kein gültiges Datum.");
  }
  if (heuteIso && !istGueltigesDatum(heuteIso)) {
    fehler.push("Das Stichtagsdatum ist kein gültiges Datum.");
  }
  if (fehler.length > 0) {
    return {
      ok: false, grund: "eingabe", fehler, belege: geladen.belege,
      abrechnungsfrist: null, einwendungsfrist: null,
      ...grundform(),
    };
  }

  const bestaetigt = Array.isArray(feiertageBestaetigt)
    ? feiertageBestaetigt.filter(istGueltigesDatum)
    : [];

  const hinweise = [];

  let abrechnungsfrist = null;
  if (zeitraumEndeIso) {
    abrechnungsfrist = berechneFrist({
      schluessel: "abrechnungsfrist",
      titel: "Abrechnungsfrist des Vermieters",
      grundlage: "§ 556 Abs. 3 Satz 2 BGB",
      // Wortlaut des § 556 Abs. 3 Satz 2 BGB. Wird gegen den Text in gesetze.json
      // geprueft (siehe scripts/pruefe-betriebskosten.js) - ein Zitat, das niemand
      // nachschlaegt, ist nur eine gut aussehende Behauptung.
      satz: "Die Abrechnung ist dem Mieter spätestens bis zum Ablauf des zwölften Monats "
        + "nach Ende des Abrechnungszeitraums mitzuteilen.",
      startIso: zeitraumEndeIso,
      startLabel: "Ende des Abrechnungszeitraums",
      bestaetigt,
    });
    abrechnungsfrist.bewertung = bewerte(zugangIso, abrechnungsfrist);
  }

  let einwendungsfrist = null;
  if (zugangIso) {
    einwendungsfrist = berechneFrist({
      schluessel: "einwendungsfrist",
      titel: "Einwendungsfrist des Mieters",
      grundlage: "§ 556 Abs. 3 Satz 5 BGB",
      // Wortlaut des § 556 Abs. 3 Satz 5 BGB, ebenfalls geprueft.
      satz: "Einwendungen gegen die Abrechnung hat der Mieter dem Vermieter spätestens bis "
        + "zum Ablauf des zwölften Monats nach Zugang der Abrechnung mitzuteilen.",
      startIso: zugangIso,
      startLabel: "Zugang der Abrechnung",
      bestaetigt,
    });
    einwendungsfrist.bewertung = bewerte(heuteIso, einwendungsfrist);
  } else {
    hinweise.push("Für die Einwendungsfrist wird das Zugangsdatum der Abrechnung benötigt.");
  }

  if (zeitraumEndeIso && zugangIso && zugangIso < zeitraumEndeIso) {
    hinweise.push(
      "Der Zugang liegt vor dem Ende des Abrechnungszeitraums. Bitte die Eingaben prüfen.",
    );
  }

  return {
    ok: true,
    belege: geladen.belege,
    zitate: ZITATE,
    hinweise,
    feiertagsabdeckung: { abdeckung: ABDECKUNG, nichtAbgedeckt: NICHT_ABGEDECKT },
    abrechnungsfrist,
    einwendungsfrist,
    // Gemeinsames Ergebnisformat (kern/ergebnis.mjs) - zusaetzlich, die Felder
    // darueber bleiben unveraendert, weil Oberflaeche, Tests und Benchmark sie lesen.
    ...grundform(),
    teile: [abrechnungsfrist, einwendungsfrist].filter(Boolean).map((f) => ({
      schluessel: f.schluessel,
      titel: f.titel,
      ergebnis: {
        fristendeIso: f.basis.iso,
        nach193Iso: f.verschiebung.zielIso,
        bewertung: f.bewertung ? f.bewertung.status : null,
      },
      schritte: f.schritte,
    })),
    grenzen: GRENZEN,
    annahmen: [],
  };
}

// ---------------------------------------------------------------------------
// Gemeinsames Ergebnisformat
// ---------------------------------------------------------------------------

export const MODUL = { id: "nebenkosten-frist", version: "1.0.0" };

// Wo dieses Modul aufhoert. Steht im Ergebnis, damit es niemand als vollstaendige
// Antwort liest - auch nicht der Assistent, der das Modul spaeter aufruft.
export const GRENZEN = [
  "Geprüft wird nur der Zeitpunkt nach § 556 Abs. 3 BGB, nicht der Inhalt der Abrechnung.",
  "Feiertage: nur die bundeseinheitlichen. Landesrechtliche Feiertage findet dieses Modul "
    + "nicht – sie müssen selbst bestätigt werden.",
  "Ob § 193 BGB auf diese Fristen anzuwenden ist, ist Auslegung. Deshalb stehen immer beide "
    + "Daten da: nach §§ 187, 188 BGB und nach § 193 BGB verschoben.",
  "Keine Rechtsberatung.",
];

function grundform() {
  return { modul: MODUL.id, version: MODUL.version };
}
