// kern/ergebnis.mjs
// Das gemeinsame Ergebnisformat aller Module - und seine Pruefung.
//
// Jedes Modul liefert neben seinen eigenen Feldern (die Oberflaeche, Tests und
// Benchmark lesen) dieselbe Grundform:
//
//   {
//     ok, modul, version,
//     teile: [ { schluessel, titel, ergebnis, schritte: [ { beleg, bezeichnung, erklaerung } ] } ],
//     grenzen:  [ "Wo das Modul aufhoert ..." ],     // mindestens eine - jedes Modul hat Grenzen
//     annahmen: [ "Was angenommen wurde ..." ],      // z. B. Regelfall bei Notarkosten; darf leer sein
//     hinweise: [ ... ],
//     belege:   { [schluessel]: { gesetz, paragraph, quelle, ... } },
//   }
//
// "teile", weil ein Ergebnis mehrere Teile haben kann (zwei Fristen, viele Positionen).
// Jeder Rechenschritt zeigt auf einen Beleg, der im selben Ergebnis steht - so kann
// der Assistent spaeter ein Modulergebnis zitieren, ohne selbst etwas zu formulieren.
//
// Warum "grenzen" Pflicht ist: Ein Ergebnis ohne erkennbares Ende liest sich wie eine
// vollstaendige Antwort. Wo das Gesetz nicht rechnet, muss das dastehen.
//
// Die Pruefung wird von scripts/pruefe-kern.mjs benutzt - nicht von der Oberflaeche.

"use strict";

export const FORMAT = "inspectora-ergebnis/1";

const text = (x) => typeof x === "string" && x.trim().length > 0;

// Gibt eine Liste von Verstoessen zurueck (leer = in Ordnung).
export function pruefeErgebnis(e) {
  const v = [];
  if (!e || typeof e !== "object") return ["Ergebnis ist kein Objekt"];
  if (typeof e.ok !== "boolean") v.push("ok fehlt oder ist kein Wahrheitswert");
  if (!text(e.modul)) v.push("modul fehlt");
  if (!text(e.version) || !/^\d+\.\d+\.\d+$/.test(e.version)) v.push("version fehlt oder ist nicht x.y.z");

  // Ein verweigertes Ergebnis braucht nur seinen Grund - es behauptet ja nichts.
  if (e.ok === false) {
    if (!text(e.grund)) v.push("ok:false ohne grund");
    return v;
  }

  if (!Array.isArray(e.grenzen) || e.grenzen.length === 0 || !e.grenzen.every(text)) {
    v.push("grenzen fehlen - jedes Modul muss sagen, wo es aufhoert");
  }
  if (!Array.isArray(e.annahmen) || !e.annahmen.every(text)) v.push("annahmen fehlen oder sind leer");
  if (!Array.isArray(e.hinweise)) v.push("hinweise fehlen");
  if (!e.belege || typeof e.belege !== "object") v.push("belege fehlen");

  // Leer darf die Liste sein (z. B. keine Zeile eingegeben) - fehlen darf sie nicht.
  if (!Array.isArray(e.teile)) {
    v.push("teile fehlen");
    return v;
  }
  e.teile.forEach((t, i) => {
    const wo = `teile[${i}]`;
    if (!text(t.schluessel)) v.push(`${wo}: schluessel fehlt`);
    if (!text(t.titel)) v.push(`${wo}: titel fehlt`);
    if (t.ergebnis === undefined || t.ergebnis === null) v.push(`${wo}: ergebnis fehlt`);
    if (!Array.isArray(t.schritte)) { v.push(`${wo}: schritte fehlen`); return; }
    t.schritte.forEach((s, j) => {
      const wo2 = `${wo}.schritte[${j}]`;
      if (!text(s.bezeichnung)) v.push(`${wo2}: bezeichnung fehlt`);
      if (!text(s.erklaerung)) v.push(`${wo2}: erklaerung fehlt`);
      const b = e.belege && e.belege[s.beleg];
      if (!b) v.push(`${wo2}: Beleg "${s.beleg}" steht nicht in belege`);
      else if (!text(b.quelle)) v.push(`${wo2}: Beleg "${s.beleg}" ohne Quelle`);
    });
  });
  return v;
}
