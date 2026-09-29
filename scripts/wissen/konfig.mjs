// scripts/wissen/konfig.mjs
// Was unter /wissen/ erzeugt wird - und nichts sonst.
//
// Hier steht nur, was ein Mensch entscheidet: welche Jahre, welche Begriffe, wie die
// Seiten heissen und wie sie in der Suche beschrieben werden. Jede Zahl, jedes Datum
// und jedes Urteil auf den Seiten kommt aus der Engine (kern/), nicht von hier.
//
// Die Jahre stehen fest in dieser Liste und werden NICHT aus dem heutigen Datum
// abgeleitet: Sonst erzeugte dasselbe Skript morgen andere Seiten, und "reproduzierbar"
// waere nur ein Wort. Ein neues Jahr kommt dazu, indem es hier eingetragen wird.
//
// Reihenfolge der Begriffe = Reihenfolge nach den Signalen aus der Recherche
// (docs/recherche-2026-09.md): zuerst die mit Signal, dann die, die je einen anderen
// Urteilstyp zeigen. Legionellenpruefung fehlt bewusst (Entscheidung 29.09.2026: keine
// Seite, bis die Zuordnung geklaert ist).
//
// "erwartet" ist das Urteil, fuer das Titel und Beschreibung geschrieben sind. Liefert
// die Engine etwas anderes, bricht der Bau ab - sonst stuende eine handgeschriebene
// Beschreibung ueber einer Seite, die inzwischen etwas anderes sagt.

export const SEITE = "https://inspectora.tech";

export const JAHRE = [2024, 2025, 2026];

export const BEGRIFFE = [
  {
    slug: "rauchmelder-nebenkosten",
    begriff: "Rauchwarnmelder",
    anzeige: "Rauchmelder",
    erwartet: "im-gesetz-nicht-genannt",
    titel: "Rauchmelder umlagefähig? Was die BetrKV sagt",
    beschreibung: "Rauchwarnmelder in der Nebenkostenabrechnung: Die Betriebskostenverordnung "
      + "nennt sie im Wortlaut nicht. Was dort steht – und was sie offenlässt.",
  },
  {
    slug: "grundsteuer-nebenkosten",
    begriff: "Grundsteuer",
    anzeige: "Grundsteuer",
    erwartet: "im-katalog",
    titel: "Grundsteuer umlagefähig? Was die BetrKV sagt",
    beschreibung: "Grundsteuer in der Nebenkostenabrechnung: § 2 Nr. 1 BetrKV nennt sie "
      + "ausdrücklich. Der Wortlaut mit amtlicher Quelle – und was die Verordnung offenlässt.",
  },
  {
    slug: "hausmeister-nebenkosten",
    begriff: "Hausmeister",
    anzeige: "Hausmeister",
    erwartet: "im-katalog-anteilig",
    titel: "Hausmeisterkosten umlagefähig? Was die BetrKV sagt",
    beschreibung: "Hausmeister in der Nebenkostenabrechnung: § 2 Nr. 14 BetrKV nennt den "
      + "Hauswart – aber nicht jede seiner Arbeiten. Der Wortlaut mit amtlicher Quelle.",
  },
  {
    slug: "winterdienst-nebenkosten",
    begriff: "Winterdienst",
    anzeige: "Winterdienst",
    erwartet: "im-gesetz-nicht-genannt",
    titel: "Winterdienst umlagefähig? Was die BetrKV sagt",
    beschreibung: "Winterdienst in der Nebenkostenabrechnung: Das Wort steht nicht in der "
      + "Betriebskostenverordnung. Was ihr Wortlaut nennt – und was er offenlässt.",
  },
  {
    slug: "verwaltungskosten-nebenkosten",
    begriff: "Verwaltungskosten",
    anzeige: "Verwaltungskosten",
    erwartet: "nicht-umlagefaehig",
    titel: "Verwaltungskosten umlagefähig? Was die BetrKV sagt",
    beschreibung: "Verwaltungskosten in der Nebenkostenabrechnung: § 1 Abs. 2 BetrKV zählt sie "
      + "nicht zu den Betriebskosten. Der Wortlaut mit amtlicher Quelle.",
  },
];

// Die Uebersicht /wissen/.
export const UEBERSICHT = {
  titel: "Fragen zur Nebenkostenabrechnung – Inspectora",
  beschreibung: "Bis wann die Nebenkostenabrechnung kommen muss und welche Posten die "
    + "Betriebskostenverordnung nennt – aus dem Gesetz gerechnet, mit Vorschrift zu jedem Schritt.",
};

// Seiten, die nicht aus diesem Skript kommen, aber in die Sitemap gehoeren. Der Bau
// prueft, dass es sie gibt.
export const WEITERE_SEITEN = [
  { pfad: "/", datei: "index.html" },
  { pfad: "/nebenkostenabrechnung-frist-pruefen", datei: "nebenkostenabrechnung-frist-pruefen.html" },
  { pfad: "/mietrecht-benchmark", datei: "mietrecht-benchmark.html" },
];

// Wie die Gesetze der Wissensbasis in "Was es heute gibt" heissen. Abgeleitet wird die
// Liste aus wissensbasis/gesetze.json; steht dort ein Gesetz, das hier fehlt, bricht der
// Bau ab - ein neues Gesetz bekommt so bewusst einen Namen, statt still zu fehlen.
// Mehrere Kuerzel duerfen auf denselben Bereich zeigen.
export const WISSENSBEREICHE = {
  WEG: "WEG",
  BGB: "Mietrecht",
  BetrKV: "Betriebskosten",
  HeizkostenV: "Heizkosten",
  WoFlV: "Wohnfläche",
};

// Was es ausser den Modulen (kern/module.mjs, Feld "oeffentlich") heute gibt.
// "{bereiche}" wird durch die Bereiche der Wissensbasis ersetzt.
export const BESTAND_WEITERE = [
  {
    titel: "Fragen und Antworten zur Nebenkostenabrechnung, aus derselben Engine gerechnet",
    url: "wissen/",
  },
  {
    titel: "Inspector, der Assistent für Fachleute – mit der Wissensbasis zu {bereiche}",
    url: "ki-assistent.html",
  },
  {
    // Ohne Zahl: Eine handgeschriebene Zahl hier prueft niemand.
    titel: "Der Mietrecht-Benchmark: KI-Antworten gegen den Gesetzestext geprüft, Rohdaten zum Herunterladen",
    url: "mietrecht-benchmark.html",
  },
];
