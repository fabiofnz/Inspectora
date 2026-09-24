// kern/belege.mjs
// Belege laden - fuer alle Module gleich.
//
// Jedes Modul nennt die Vorschriften, die es braucht (BENOETIGTE_BELEGE), und holt
// sie zur Laufzeit aus der Wissensbasis. Fehlt eine, oder fehlt ihr die amtliche
// Quelle, rechnet das Modul NICHT: ok:false. Eine Rechnung ohne Beleg saehe genauso
// aus wie eine belegte - also gibt es sie nicht.
//
// Frueher stand diese Funktion zweimal im Kern (frist.mjs, katalog.mjs), Zeichen fuer
// Zeichen gleich. Zwei Kopien laufen irgendwann auseinander, ohne dass es auffaellt.
//
// ---------------------------------------------------------------------------
// QUELLENARTEN
// ---------------------------------------------------------------------------
// bundesrecht  - gesetze-im-internet.de. Importiert von scripts/import-gesetze.js,
//                gegen die Quelle geprueft von scripts/pruefe-aktualitaet.js.
// landesrecht  - die Portale der Laender (z. B. Grunderwerbsteuersaetze nach
//                Art. 105 Abs. 2a GG). Es gibt keine amtliche Gesamtliste und keinen
//                einheitlichen Abruf. Ein Eintrag gilt deshalb erst als Beleg, wenn
//                er Quelle, Geltungsbeginn, Pruefdatum UND eine Bestaetigung durch
//                einen Menschen traegt, der die Quelle selbst geoeffnet hat.
//                Heute gibt es noch keinen solchen Eintrag (kommt mit Schritt 2b).

"use strict";

export const QUELLENARTEN = {
  bundesrecht: {
    praefix: "https://www.gesetze-im-internet.de/",
    pflicht: [],
  },
  landesrecht: {
    praefix: "https://",
    pflicht: ["gueltig_ab", "geprueft_am", "bestaetigt_von"],
  },
};

// Welche Quellenart ein Eintrag hat. Ohne Angabe: bundesrecht - so sehen alle
// Eintraege aus, die es heute gibt.
function artVon(eintrag) {
  return eintrag && typeof eintrag.quellenart === "string" ? eintrag.quellenart : "bundesrecht";
}

// Laedt die benoetigten Belege. Rueckgabe wie bisher in frist.mjs/katalog.mjs:
// { ok, belege: { [schluessel]: {...} }, fehlend: [...] } - dieselben Felder in
// derselben Reihenfolge, denn die Benchmark-Fragedateien enthalten sie und sollen
// byte-gleich bleiben.
export function ladeBelege(korpus, benoetigt) {
  const fehlend = [];
  const belege = {};

  if (!Array.isArray(korpus) || korpus.length === 0) {
    return {
      ok: false,
      belege: {},
      fehlend: benoetigt.map((b) => ({
        ...b, grund: "Wissensbasis nicht geladen oder leer",
      })),
    };
  }

  for (const gesucht of benoetigt) {
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
    const art = QUELLENARTEN[artVon(eintrag)];
    if (!art) {
      fehlend.push({ ...gesucht, grund: "Unbekannte Quellenart" });
      continue;
    }
    if (typeof eintrag.quelle !== "string" || !eintrag.quelle.startsWith(art.praefix)) {
      fehlend.push({ ...gesucht, grund: "Kein Link auf die amtliche Quelle" });
      continue;
    }
    const luecke = art.pflicht.filter((f) => typeof eintrag[f] !== "string" || !eintrag[f].trim());
    if (luecke.length) {
      fehlend.push({ ...gesucht, grund: "Nicht bestaetigt: es fehlt " + luecke.join(", ") });
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
    // Nur bei Landesrecht - bundesrechtliche Belege bleiben feldgleich wie bisher.
    if (artVon(eintrag) !== "bundesrecht") {
      Object.assign(belege[gesucht.schluessel], {
        quellenart: artVon(eintrag),
        gueltig_ab: eintrag.gueltig_ab,
        geprueft_am: eintrag.geprueft_am,
        bestaetigt_von: eintrag.bestaetigt_von,
      });
    }
  }

  return { ok: fehlend.length === 0, belege, fehlend };
}
