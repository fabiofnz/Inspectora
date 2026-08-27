// kern/feiertage.mjs
//
// ACHTUNG - DIESE DATEI IST KEIN BELEG AUS DER WISSENSBASIS.
//
// Alle uebrigen Regeln dieses Werkzeugs stammen aus wissensbasis/gesetze.json und
// tragen einen Link auf die amtliche Quelle. Die Feiertage tun das nicht: § 193 BGB
// verweist auf den "am Erklaerungs- oder Leistungsort staatlich anerkannten
// allgemeinen Feiertag", und das ist Landesrecht. Die Feiertagsgesetze der Laender
// sind nicht Teil der Wissensbasis.
//
// Deshalb gilt fuer diese Datei eine eigene Regel: Was hier berechnet wird, muss in
// der Oberflaeche AUSDRUECKLICH als "nicht aus der Wissensbasis" gekennzeichnet
// werden, und der Nutzer muss einen Feiertag selbst bestaetigen koennen. Ein
// unmarkiertes Feiertagsdatum waere genau die Sorte Behauptung, gegen die dieses
// Projekt gebaut ist: plausibel, unbelegt, beim Lesen nicht als Luecke erkennbar.
//
// ABGEDECKT sind nur die neun Tage, die in allen sechzehn Laendern gesetzliche
// Feiertage sind:
//   Neujahr, Karfreitag, Ostermontag, Tag der Arbeit, Christi Himmelfahrt,
//   Pfingstmontag, Tag der Deutschen Einheit, 1. und 2. Weihnachtstag.
//
// NICHT ABGEDECKT sind die landesrechtlichen Feiertage. Namentlich:
//   Heilige Drei Koenige, Internationaler Frauentag, Fronleichnam,
//   Mariae Himmelfahrt, Weltkindertag, Reformationstag, Allerheiligen,
//   Buss- und Bettag - dazu einmalige Feiertage, die einzelne Laender
//   fuer ein bestimmtes Jahr beschliessen.
// Faellt ein Fristende auf einen dieser Tage, findet dieses Modul ihn NICHT.
// Genau dafuer gibt es die Bestaetigung durch den Nutzer.
//
// Ostersonntag und Pfingstsonntag stehen nicht in der Liste. Sie sind Sonntage und
// werden von § 193 BGB bereits ueber den Sonntag erfasst - eine eigene Zeile waere
// wirkungslos und wuerde nur so aussehen, als sei mehr geprueft worden.

"use strict";

import { zuIso, plusTage, parseIso } from "./datum.mjs";

export const ABDECKUNG = "bundeseinheitlich";

// Wird in der Oberflaeche angezeigt - deshalb hier mit echten Umlauten, anders als
// die Kommentare in dieser Datei.
export const NICHT_ABGEDECKT = [
  "Heilige Drei Könige", "Internationaler Frauentag", "Fronleichnam",
  "Mariä Himmelfahrt", "Weltkindertag", "Reformationstag", "Allerheiligen",
  "Buß- und Bettag",
];

// Gauss'sche Osterformel in der anonymen gregorianischen Fassung.
// Gilt fuer den gregorianischen Kalender, also fuer jedes Jahr, das dieses
// Werkzeug sinnvoll berechnen kann. Die Testdatei prueft sie gegen bekannte
// Osterdaten - eine Formel, die niemand nachgerechnet hat, ist eine Behauptung.
export function ostersonntag(jahr) {
  const a = jahr % 19;
  const b = Math.floor(jahr / 100);
  const c = jahr % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const zaehler = h + l - 7 * m + 114;
  return zuIso({ jahr, monat: Math.floor(zaehler / 31), tag: (zaehler % 31) + 1 });
}

// Gibt eine Map ISO-Datum -> Name zurueck.
export function bundeseinheitlicheFeiertage(jahr) {
  const ostern = ostersonntag(jahr);
  const feiertage = new Map();
  feiertage.set(`${jahr}-01-01`, "Neujahr");
  feiertage.set(plusTage(ostern, -2), "Karfreitag");
  feiertage.set(plusTage(ostern, 1), "Ostermontag");
  feiertage.set(`${jahr}-05-01`, "Tag der Arbeit");
  feiertage.set(plusTage(ostern, 39), "Christi Himmelfahrt");
  feiertage.set(plusTage(ostern, 50), "Pfingstmontag");
  feiertage.set(`${jahr}-10-03`, "Tag der Deutschen Einheit");
  feiertage.set(`${jahr}-12-25`, "1. Weihnachtstag");
  feiertage.set(`${jahr}-12-26`, "2. Weihnachtstag");
  return feiertage;
}

// Karfreitag und Ostermontag koennen in den Maerz fallen, Christi Himmelfahrt und
// Pfingstmontag nie ueber den Juni hinaus - alle bleiben im selben Jahr. Es genuegt
// deshalb, das Jahr des gefragten Datums zu betrachten.
export function feiertagName(iso) {
  const d = parseIso(iso);
  if (!d) throw new Error(`feiertagName: ungueltiges Datum ${iso}`);
  return bundeseinheitlicheFeiertage(d.jahr).get(iso) || null;
}
