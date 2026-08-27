// kern/datum.mjs
// Datums-Grundrechenarten fuer die Fristberechnung.
//
// Bewusst OHNE das Date-Objekt fuer die eigentliche Rechnung: new Date("2025-12-31")
// wird als UTC gelesen, new Date(2025,11,31) als Ortszeit. Wer beides mischt,
// bekommt je nach Zeitzone einen Tag Unterschied - und genau ein Tag ist bei einer
// Ausschlussfrist der ganze Unterschied. Hier wird deshalb auf {jahr,monat,tag}
// gerechnet. Date wird nur fuer den Wochentag benutzt, und dort ausschliesslich
// ueber Date.UTC, damit die Zeitzone des Browsers keine Rolle spielt.
//
// Datumsformat nach aussen ist durchgaengig ISO "JJJJ-MM-TT". Das laesst sich als
// Zeichenkette vergleichen (a <= b), solange die Laenge stimmt - deshalb wird beim
// Bauen immer auf zwei Stellen aufgefuellt.

"use strict";

const ZWEISTELLIG = (n) => String(n).padStart(2, "0");

export const WOCHENTAGE = [
  "Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Sonnabend",
];

// § 193 BGB nennt den Sonnabend ausdruecklich neben dem Sonntag. Beide Indizes
// stehen hier zusammen, damit die Fristlogik nicht mit rohen Zahlen arbeitet.
export const SONNTAG = 0;
export const SONNABEND = 6;

export function istSchaltjahr(jahr) {
  return (jahr % 4 === 0 && jahr % 100 !== 0) || jahr % 400 === 0;
}

export function tageImMonat(jahr, monat) {
  const tage = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (monat === 2 && istSchaltjahr(jahr)) return 29;
  return tage[monat - 1];
}

// Streng: "2025-2-3", "2025-02-30" und "Unsinn" sind alle ungueltig. Eine tolerante
// Pruefung waere hier gefaehrlich - ein stillschweigend auf den 01.03. gerolltes
// Datum wuerde als Fristende ausgegeben, ohne dass jemand den Fehler sieht.
export function parseIso(iso) {
  if (typeof iso !== "string") return null;
  const treffer = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!treffer) return null;
  const jahr  = Number(treffer[1]);
  const monat = Number(treffer[2]);
  const tag   = Number(treffer[3]);
  if (monat < 1 || monat > 12) return null;
  if (tag < 1 || tag > tageImMonat(jahr, monat)) return null;
  return { jahr, monat, tag };
}

export function istGueltigesDatum(iso) {
  return parseIso(iso) !== null;
}

export function zuIso({ jahr, monat, tag }) {
  return `${jahr}-${ZWEISTELLIG(monat)}-${ZWEISTELLIG(tag)}`;
}

export function wochentag(iso) {
  const d = parseIso(iso);
  if (!d) throw new Error(`wochentag: ungueltiges Datum ${iso}`);
  return new Date(Date.UTC(d.jahr, d.monat - 1, d.tag)).getUTCDay();
}

export function wochentagName(iso) {
  return WOCHENTAGE[wochentag(iso)];
}

export function plusTage(iso, n) {
  const d = parseIso(iso);
  if (!d) throw new Error(`plusTage: ungueltiges Datum ${iso}`);
  const ms = Date.UTC(d.jahr, d.monat - 1, d.tag) + n * 86400000;
  const neu = new Date(ms);
  return zuIso({ jahr: neu.getUTCFullYear(), monat: neu.getUTCMonth() + 1, tag: neu.getUTCDate() });
}

// Monatsaddition nach § 188 Abs. 2 BGB (Tag gleicher Zahl) mit der Ausnahme des
// § 188 Abs. 3 BGB (fehlt der Tag im Zielmonat, endet die Frist am Monatsletzten).
// Ob Abs. 3 gegriffen hat, wird zurueckgegeben statt verschwiegen: Die Oberflaeche
// muss diesen Rechenschritt belegen koennen, sonst steht dort ein Datum, das der
// Nutzer aus dem Gesetzestext nicht nachvollziehen kann.
export function plusMonate(iso, anzahl) {
  const d = parseIso(iso);
  if (!d) throw new Error(`plusMonate: ungueltiges Datum ${iso}`);
  const gesamt = d.monat - 1 + anzahl;
  const jahr   = d.jahr + Math.floor(gesamt / 12);
  const monat  = ((gesamt % 12) + 12) % 12 + 1;
  const letzter = tageImMonat(jahr, monat);
  const tag = Math.min(d.tag, letzter);
  return { iso: zuIso({ jahr, monat, tag }), abs3Angewendet: tag !== d.tag };
}

export function formatiereDeutsch(iso) {
  const d = parseIso(iso);
  if (!d) throw new Error(`formatiereDeutsch: ungueltiges Datum ${iso}`);
  return `${ZWEISTELLIG(d.tag)}.${ZWEISTELLIG(d.monat)}.${d.jahr}`;
}

// Mit Wochentag, weil § 193 BGB genau daran haengt.
export function formatiereMitWochentag(iso) {
  return `${wochentagName(iso)}, ${formatiereDeutsch(iso)}`;
}
