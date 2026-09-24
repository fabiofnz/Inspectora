// kern/module.mjs
// Verzeichnis aller Module der Engine.
//
// Ein Modul ist eine reine Funktion: Eingabe + Daten (Wissensbasis) -> Ergebnis im
// gemeinsamen Format (kern/ergebnis.mjs). Kein DOM, kein Dateisystem, keine
// Node-APIs - dieselbe Datei laeuft im Browser, in Node (Tests, Benchmark,
// Bauskripte) und spaeter in der Deno-Edge-Function, wenn der Assistent Module als
// Werkzeuge aufruft.
//
// Was ein Eintrag hier festlegt:
//   id, version    - stehen auch im Ergebnis; so bleibt jede Antwort zuordenbar
//   eingabeSchema  - JSON Schema der Eingabe. Wird spaeter unveraendert zur
//                    Werkzeug-Definition fuer den Assistenten.
//   beispiel       - eine Eingabe, die rechnen MUSS (scripts/pruefe-kern.mjs)
//   rechne         - (eingabe, { korpus, begriffe }) -> Ergebnis
//   benchmark      - welche Kategorie das Modul im Benchmark liefert und woraus
//                    die Fragen erzeugt werden. Pfade statt Imports: Die Generatoren
//                    lesen Dateien und gehoeren nicht in den Browser.
//
// Ein neues Modul wird hier eingetragen - und ist damit automatisch in
// scripts/pruefe-kern.mjs geprueft.

"use strict";

import { pruefeFristen, MODUL as FRIST } from "./frist.mjs";
import { pruefePositionen, MODUL as POSITIONEN } from "./katalog.mjs";

const DATUM = { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" };

export const MODULE = [
  {
    id: FRIST.id,
    version: FRIST.version,
    titel: "Fristen der Nebenkostenabrechnung (§ 556 Abs. 3 BGB)",
    eingabeSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        zeitraumEndeIso: { ...DATUM, description: "Letzter Tag des Abrechnungszeitraums" },
        zugangIso: { ...DATUM, description: "Tag, an dem die Abrechnung beim Mieter einging" },
        heuteIso: { ...DATUM, description: "Stichtag für die Einwendungsfrist" },
        feiertageBestaetigt: {
          type: "array", items: DATUM,
          description: "Vom Nutzer bestätigte landesrechtliche Feiertage",
        },
      },
    },
    beispiel: { zeitraumEndeIso: "2025-12-31", zugangIso: "2026-06-15" },
    rechne: (eingabe, daten) => pruefeFristen(eingabe, daten.korpus),
    benchmark: {
      kategorie: "fristen",
      fragenDatei: "benchmark/fragen-fristen.json",
      generator: "benchmark/generiere-fristen.mjs",
    },
  },
  {
    id: POSITIONEN.id,
    version: POSITIONEN.version,
    titel: "Positionen der Nebenkostenabrechnung (§§ 1, 2 BetrKV)",
    eingabeSchema: {
      type: "object",
      additionalProperties: false,
      required: ["text"],
      properties: {
        text: { type: "string", description: "Positionen der Abrechnung, eine pro Zeile" },
        alleZeilenPruefen: {
          type: "boolean",
          description: "Auch Zeilen prüfen, die wie Überschrift, Summe oder Datum aussehen",
        },
      },
    },
    beispiel: { text: "Grundsteuer 245,80\nReparatur Heizung\nWinterdienst" },
    rechne: (eingabe, daten) => pruefePositionen(eingabe, daten.korpus, daten.begriffe),
    benchmark: {
      kategorie: "umlage",
      fragenDatei: "benchmark/fragen-umlage.json",
      generator: "benchmark/generiere-umlage.mjs",
    },
  },
];

export function modul(id) {
  return MODULE.find((m) => m.id === id) || null;
}
