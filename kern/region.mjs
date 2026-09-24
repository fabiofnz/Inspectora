// kern/region.mjs
// Das Bundesland als eigene Dimension.
//
// Mehrere Regeln haengen am Land, nicht am Bund:
//   - Feiertage nach § 193 BGB (Landesrecht; heute nur bundeseinheitliche Tage,
//     siehe kern/feiertage.mjs)
//   - der Grunderwerbsteuersatz (Art. 105 Abs. 2a GG, je Land ein eigenes Gesetz)
//   - Kappungsgrenze und Mietpreisbremse (Landesverordnungen, teils je Gemeinde)
//
// Diese Datei enthaelt bewusst NUR die Laender selbst. Saetze, Feiertage und Gebiete
// kommen erst dazu, wenn sie einen bestaetigten Beleg haben (kern/belege.mjs,
// Quellenart "landesrecht"). Eine Tabelle mit Saetzen ohne Beleg waere genau die
// Sorte Angabe, die dieses Projekt vermeiden will: plausibel, unbelegt und in
// Sekundaerquellen teils schon veraltet.
//
// Schluessel: ISO 3166-2:DE ohne Praefix. Gemeinden (fuer Kappungsgrenze und
// Mietpreisbremse) werden spaeter unterhalb des Landes gefuehrt, nicht daneben.

"use strict";

export const LAENDER = [
  { code: "BW", name: "Baden-Württemberg" },
  { code: "BY", name: "Bayern" },
  { code: "BE", name: "Berlin" },
  { code: "BB", name: "Brandenburg" },
  { code: "HB", name: "Bremen" },
  { code: "HH", name: "Hamburg" },
  { code: "HE", name: "Hessen" },
  { code: "MV", name: "Mecklenburg-Vorpommern" },
  { code: "NI", name: "Niedersachsen" },
  { code: "NW", name: "Nordrhein-Westfalen" },
  { code: "RP", name: "Rheinland-Pfalz" },
  { code: "SL", name: "Saarland" },
  { code: "SN", name: "Sachsen" },
  { code: "ST", name: "Sachsen-Anhalt" },
  { code: "SH", name: "Schleswig-Holstein" },
  { code: "TH", name: "Thüringen" },
];

export function land(code) {
  return LAENDER.find((l) => l.code === code) || null;
}
