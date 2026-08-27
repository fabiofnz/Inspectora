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

import {
  istGueltigesDatum, plusMonate, plusTage, wochentag, wochentagName,
  formatiereDeutsch, formatiereMitWochentag, SONNTAG, SONNABEND,
} from "./datum.mjs";
import { feiertagName, ABDECKUNG, NICHT_ABGEDECKT } from "./feiertage.mjs";

// Jeder Beleg muss von der amtlichen Quelle stammen. Das wird geprueft, nicht
// vorausgesetzt: ein Eintrag mit leerem oder fremdem Link zaehlt als fehlend.
const QUELLE_PRAEFIX = "https://www.gesetze-im-internet.de/";

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
  const fehlend = [];
  const belege = {};

  if (!Array.isArray(korpus) || korpus.length === 0) {
    return {
      ok: false,
      belege: {},
      fehlend: BENOETIGTE_BELEGE.map((b) => ({
        ...b, grund: "Wissensbasis nicht geladen oder leer",
      })),
    };
  }

  for (const gesucht of BENOETIGTE_BELEGE) {
    const eintrag = korpus.find(
      (p) => p && p.gesetz === gesucht.gesetz && p.paragraph === gesucht.paragraph,
    );
    if (!eintrag) {
      fehlend.push({ ...gesucht, grund: "Paragraph nicht in der Wissensbasis" });
      continue;
    }
    if (typeof eintrag.text !== "string" || eintrag.text.trim().length === 0) {
      fehlend.push({ ...gesucht, grund: "Paragraph ohne Text" });
      continue;
    }
    if (typeof eintrag.quelle !== "string" || !eintrag.quelle.startsWith(QUELLE_PRAEFIX)) {
      fehlend.push({ ...gesucht, grund: "Kein Link auf die amtliche Quelle" });
      continue;
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
// § 193 BGB - Verschiebung auf den naechsten Werktag
// ---------------------------------------------------------------------------

// Warum ein Tag nach § 193 BGB nicht als Fristende taugt - oder null, wenn er taugt.
// "bestaetigt" sind Tage, die der Nutzer selbst als Feiertag markiert hat; sie sind
// getrennt gefuehrt, weil sie eine andere Herkunft haben als die berechneten.
function hinderungsgrund(iso, bestaetigt) {
  const tag = wochentag(iso);
  if (tag === SONNTAG)   return { art: "sonntag",   text: "Sonntag",   herkunft: "gesetz" };
  if (tag === SONNABEND) return { art: "sonnabend", text: "Sonnabend", herkunft: "gesetz" };
  if (bestaetigt.includes(iso)) {
    return {
      art: "feiertag", text: "gesetzlicher Feiertag (Angabe des Nutzers)",
      herkunft: "nutzerangabe",
    };
  }
  const name = feiertagName(iso);
  if (name) {
    return { art: "feiertag", text: name + " (bundeseinheitlicher Feiertag)", herkunft: ABDECKUNG };
  }
  return null;
}

function verschiebeNachWerktag(basisIso, bestaetigt) {
  const kette = [];
  let aktuell = basisIso;
  // Obergrenze als Reissleine: gaebe hinderungsgrund fuer jeden Tag einen Grund
  // zurueck, waere das sonst eine Endlosschleife im Browser des Nutzers.
  for (let i = 0; i < 10; i++) {
    const grund = hinderungsgrund(aktuell, bestaetigt);
    if (!grund) break;
    kette.push({ iso: aktuell, ...grund });
    aktuell = plusTage(aktuell, 1);
  }
  return {
    verschoben: kette.length > 0,
    zielIso: aktuell,
    kette,
    // Der erste Grund ist der, den die Oberflaeche nennt: er betrifft das
    // eigentliche Fristende nach §§ 187/188.
    grund: kette.length > 0 ? kette[0] : null,
  };
}

// ---------------------------------------------------------------------------
// Eine Frist
// ---------------------------------------------------------------------------

function berechneFrist({ schluessel, titel, grundlage, satz, startIso, startLabel, bestaetigt }) {
  const { iso: basisIso, abs3Angewendet } = plusMonate(startIso, FRIST_MONATE);
  const verschiebung = verschiebeNachWerktag(basisIso, bestaetigt);

  const schritte = [
    {
      beleg: "bgb-187", bezeichnung: "§ 187 Abs. 1 BGB",
      erklaerung: "Fristbeginn: Der " + formatiereDeutsch(startIso)
        + " ist der Tag des Ereignisses (" + startLabel
        + ") und wird nicht mitgerechnet.",
    },
    {
      beleg: "bgb-188", bezeichnung: "§ 188 Abs. 2 BGB",
      erklaerung: "Fristende: Die Zwölfmonatsfrist endet mit Ablauf des Tages im zwölften "
        + "Monat, der durch seine Zahl dem " + formatiereDeutsch(startIso) + " entspricht.",
    },
  ];

  if (abs3Angewendet) {
    schritte.push({
      beleg: "bgb-188", bezeichnung: "§ 188 Abs. 3 BGB",
      erklaerung: "Diesen Tag gibt es im Zielmonat nicht. Die Frist endet deshalb mit Ablauf "
        + "des letzten Tages dieses Monats.",
    });
  }

  schritte.push({
    beleg: "bgb-193", bezeichnung: "§ 193 BGB",
    erklaerung: verschiebung.verschoben
      // Der Grund wird hinter einem Doppelpunkt eingesetzt und nicht in den Satz
      // eingebaut. Sonst muesste der Text mitgebeugt werden ("auf einen gesetzlichen
      // Feiertag", aber "auf den Tag der Deutschen Einheit") - und eine Ausgabe, die
      // Faelle raten muss, wird irgendwann falsch.
      ? "Das Fristende fällt auf einen Tag, an dem eine Frist nach § 193 BGB nicht endet: "
        + verschiebung.grund.text + ". An seine Stelle tritt der nächste Werktag: "
        + formatiereMitWochentag(verschiebung.zielIso) + "."
      : "Das Fristende fällt auf einen " + wochentagName(basisIso) + " und ist nach der "
        + "bundeseinheitlichen Liste kein Feiertag. § 193 BGB führt hier zu keiner Verschiebung.",
  });

  return {
    schluessel,
    titel,
    grundlage,
    satz,
    startIso,
    startLabel,
    schritte,
    basis: {
      iso: basisIso,
      anzeige: formatiereMitWochentag(basisIso),
      abs3Angewendet,
    },
    verschiebung: {
      verschoben: verschiebung.verschoben,
      zielIso: verschiebung.zielIso,
      anzeige: formatiereMitWochentag(verschiebung.zielIso),
      grund: verschiebung.grund,
      kette: verschiebung.kette,
    },
    // Frage an den Nutzer: Ist der Tag, auf den die Frist am Ende faellt, bei ihm
    // ein landesrechtlicher Feiertag? Nur sinnvoll, wenn der Tag nicht ohnehin
    // schon als Hinderungsgrund erkannt ist.
    feiertagsfrage: hinderungsgrund(verschiebung.zielIso, bestaetigt) === null
      ? {
          iso: verschiebung.zielIso,
          anzeige: formatiereMitWochentag(verschiebung.zielIso),
          bereitsBestaetigt: bestaetigt.includes(verschiebung.zielIso),
        }
      : null,
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
  };
}
