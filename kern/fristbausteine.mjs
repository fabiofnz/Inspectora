// kern/fristbausteine.mjs
// Bausteine fuer Fristen nach §§ 187 ff. BGB - fuer alle Module gleich.
//
// Herausgeloest aus kern/frist.mjs (Nebenkostenabrechnung), Zeile fuer Zeile
// unveraendert bis auf die Parameter. Kuenftige Module (Kuendigungsfrist,
// WEG-Fristen, Verjaehrung) rechnen mit denselben Bausteinen - eine zweite,
// eigene Fristberechnung liefe irgendwann auseinander.
//
// Die Grundsaetze aus frist.mjs gelten hier genauso: § 193 BGB wird nie allein
// ausgegeben, sondern immer neben dem Fristende nach §§ 187/188 (ob § 193 auf eine
// Frist anzuwenden ist, ist Auslegung). Feiertage sind nur die bundeseinheitlichen
// (kern/feiertage.mjs) - Landesfeiertage bestaetigt der Nutzer selbst.
//
// Wer hier etwas aendert: scripts/pruefe-betriebskosten-negativkontrolle.js bricht
// diese Datei absichtlich an sechs Stellen und erwartet, dass jeder Bruch auffaellt.

"use strict";

import {
  plusMonate, plusTage, wochentag, wochentagName,
  formatiereDeutsch, formatiereMitWochentag, SONNTAG, SONNABEND,
} from "./datum.mjs";
import { feiertagName, ABDECKUNG } from "./feiertage.mjs";

// ---------------------------------------------------------------------------
// § 193 BGB - Verschiebung auf den naechsten Werktag
// ---------------------------------------------------------------------------

// Warum ein Tag nach § 193 BGB nicht als Fristende taugt - oder null, wenn er taugt.
// "bestaetigt" sind Tage, die der Nutzer selbst als Feiertag markiert hat; sie sind
// getrennt gefuehrt, weil sie eine andere Herkunft haben als die berechneten.
export function hinderungsgrund(iso, bestaetigt) {
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

export function verschiebeNachWerktag(basisIso, bestaetigt) {
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
// Monatsfrist: §§ 187 Abs. 1, 188 Abs. 2 und 3, danach § 193 BGB
// ---------------------------------------------------------------------------

// bezeichnung: die Woerter fuer den Rechenschritt, z. B. { frist: "Zwölfmonatsfrist",
// monat: "zwölften" }. Vom Modul uebergeben statt hier aus einer Zahlwort-Tabelle -
// eine Ausgabe, die Zahlwoerter bilden muss, wird irgendwann falsch.
export function monatsfrist({ startIso, monate, startLabel, bestaetigt, bezeichnung }) {
  const { iso: basisIso, abs3Angewendet } = plusMonate(startIso, monate);
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
      erklaerung: "Fristende: Die " + bezeichnung.frist + " endet mit Ablauf des Tages im "
        + bezeichnung.monat + " "
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

