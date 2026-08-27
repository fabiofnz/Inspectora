#!/usr/bin/env node
// scripts/pruefe-betriebskosten.js
// Prueft die Fristberechnung des Betriebskosten-Pruefers (Teil A).
// Aufruf: npm run pruefe-betriebskosten   (Exit-Code != 0, sobald ein FEHLER auftritt)
//
// Das hier ist kein Syntaxcheck. Das Skript fuehrt genau den Code aus, den auch die
// Seite im Browser laedt (kern/frist.mjs), und vergleicht die Ergebnisse mit von Hand
// nachgerechneten Fristenden. Eine Fristberechnung, die nur "laeuft", ist wertlos -
// falsch ist sie erst am Datum zu erkennen, und ein Tag Unterschied entscheidet bei
// einer Ausschlussfrist alles.
//
// Warum die Pfade ueberschreibbar sind: Die Negativkontrolle
// (pruefe-betriebskosten-negativkontrolle.js) baut absichtlich kaputte Kopien von
// kern/ und der Wissensbasis und laesst dieses Skript dagegen laufen. Die echten
// Dateien werden dabei nie angefasst.
//
//   BETRIEBSKOSTEN_KERN    Verzeichnis mit datum.mjs / feiertage.mjs / frist.mjs
//   WISSENSBASIS_GESETZE   Pfad auf gesetze.json

"use strict";

const fs   = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");

const KERN_VERZEICHNIS = process.env.BETRIEBSKOSTEN_KERN
  || path.resolve(__dirname, "../kern");
const GESETZE_PFAD = process.env.WISSENSBASIS_GESETZE
  || path.resolve(__dirname, "../wissensbasis/gesetze.json");

const QUELLE_PRAEFIX = "https://www.gesetze-im-internet.de/";

// ---------------------------------------------------------------------------
// Befunde
// ---------------------------------------------------------------------------

const befunde = [];
const fehler = (pruefung, id, text) => befunde.push({ stufe: "FEHLER", pruefung, id, text });
const gut    = (pruefung, id) => befunde.push({ stufe: "OK", pruefung, id, text: "" });
const info   = (pruefung, id, text) => befunde.push({ stufe: "INFO",   pruefung, id, text });

// Der Rueckgabewert von fn ist entweder true (bestanden) oder ein Text, der sagt,
// was stattdessen herauskam. Eine geworfene Ausnahme zaehlt als Fehler, nicht als
// Absturz: Eine kaputte Rechnung wirft haeufig, bevor sie ein falsches Datum
// liefert, und die Negativkontrolle muss auch diesen Fall gemeldet bekommen.
function pruefe(pruefung, id, fn) {
  try {
    const ergebnis = fn();
    if (ergebnis === true) gut(pruefung, id);
    else fehler(pruefung, id, String(ergebnis));
  } catch (e) {
    fehler(pruefung, id, "Ausnahme: " + (e && e.message ? e.message : String(e)));
  }
}

const gleich = (ist, soll, was) =>
  ist === soll ? true : `${was}: erwartet ${JSON.stringify(soll)}, bekommen ${JSON.stringify(ist)}`;

// ---------------------------------------------------------------------------
// Von Hand nachgerechnete Faelle
// ---------------------------------------------------------------------------

// basis = Fristende nach §§ 187 Abs. 1, 188 Abs. 2/3 BGB
// ziel  = Fristende nach zusaetzlicher Anwendung von § 193 BGB
// grundArt = warum § 193 greift (null = greift nicht)
const FRIST_FAELLE = [
  {
    name: "Regelfall Kalenderjahr",
    start: "2024-12-31", basis: "2025-12-31", ziel: "2025-12-31",
    grundArt: null, abs3: false,
  },
  {
    name: "Fristende auf Sonntag",
    start: "2025-05-31", basis: "2026-05-31", ziel: "2026-06-01",
    grundArt: "sonntag", abs3: false,
  },
  {
    name: "Fristende auf Sonnabend, danach Sonntag und Neujahr",
    start: "2021-12-31", basis: "2022-12-31", ziel: "2023-01-02",
    grundArt: "sonnabend", abs3: false,
  },
  {
    name: "Fristende auf Sonntag, danach Neujahr",
    start: "2022-12-31", basis: "2023-12-31", ziel: "2024-01-02",
    grundArt: "sonntag", abs3: false,
  },
  {
    name: "Fristende auf Tag der Deutschen Einheit (Freitag), danach Wochenende",
    start: "2024-10-03", basis: "2025-10-03", ziel: "2025-10-06",
    grundArt: "feiertag", abs3: false,
  },
  {
    name: "Fristende auf 1. Weihnachtstag, Kette ueber vier Tage",
    start: "2024-12-25", basis: "2025-12-25", ziel: "2025-12-29",
    grundArt: "feiertag", abs3: false,
  },
  {
    name: "Fristende auf Tag der Arbeit",
    start: "2024-05-01", basis: "2025-05-01", ziel: "2025-05-02",
    grundArt: "feiertag", abs3: false,
  },
  {
    name: "§ 188 Abs. 3 BGB - 29. Februar hat im Zieljahr keine Entsprechung",
    start: "2024-02-29", basis: "2025-02-28", ziel: "2025-02-28",
    grundArt: null, abs3: true,
  },
];

// Ostersonntag steuert Karfreitag, Ostermontag, Christi Himmelfahrt und Pfingstmontag.
// Stimmt die Formel nicht, stimmen vier der neun Feiertage nicht.
const OSTERN = {
  2000: "2000-04-23", 2024: "2024-03-31", 2025: "2025-04-20",
  2026: "2026-04-05", 2027: "2027-03-28", 2038: "2038-04-25",
};

// ---------------------------------------------------------------------------

async function main() {
  const laden = async (datei) =>
    import(pathToFileURL(path.join(KERN_VERZEICHNIS, datei)).href);

  const Frist     = await laden("frist.mjs");
  const Feiertage = await laden("feiertage.mjs");
  const Datum     = await laden("datum.mjs");

  const korpus = JSON.parse(fs.readFileSync(GESETZE_PFAD, "utf8"));
  info("Bestand", "-", `${korpus.length} Paragraphen aus ${path.basename(GESETZE_PFAD)}, `
    + `Kern aus ${KERN_VERZEICHNIS}`);

  // -------------------------------------------------------------------------
  const P_BELEGE = "Belege vorhanden und amtlich verlinkt";
  // -------------------------------------------------------------------------

  const geladen = Frist.belegeLaden(korpus);
  pruefe(P_BELEGE, "vollstaendig", () =>
    geladen.ok ? true : "fehlende Belege: " + JSON.stringify(geladen.fehlend));

  for (const benoetigt of Frist.BENOETIGTE_BELEGE) {
    pruefe(P_BELEGE, benoetigt.schluessel, () => {
      const beleg = geladen.belege[benoetigt.schluessel];
      if (!beleg) return "Beleg fehlt";
      if (!beleg.quelle.startsWith(QUELLE_PRAEFIX)) return "Quelle nicht amtlich: " + beleg.quelle;
      if (!beleg.text || beleg.text.length < 40) return "Text zu kurz oder leer";
      return true;
    });
  }

  // -------------------------------------------------------------------------
  const P_KEIN_BELEG = "Ohne Beleg wird keine Regel ausgegeben";
  // -------------------------------------------------------------------------
  //
  // Die wichtigste Eigenschaft der ganzen Seite: Faellt die Wissensbasis aus, darf
  // kein Fristende erscheinen. Ein Datum ohne Beleg sieht genauso verlaesslich aus
  // wie eines mit - deshalb muss die Ausgabe hier leer bleiben, nicht nur der Link.

  pruefe(P_KEIN_BELEG, "leerer Korpus", () => {
    const e = Frist.pruefeFristen({ zeitraumEndeIso: "2024-12-31" }, []);
    if (e.ok !== false) return "ok war " + e.ok;
    if (e.grund !== "belege-fehlen") return "grund war " + e.grund;
    if (e.abrechnungsfrist !== null) return "trotz fehlender Belege wurde eine Frist ausgegeben";
    return true;
  });

  pruefe(P_KEIN_BELEG, "einzelner Paragraph fehlt", () => {
    const ohne193 = korpus.filter((p) => !(p.gesetz === "BGB" && p.paragraph === "§ 193"));
    const e = Frist.pruefeFristen({ zeitraumEndeIso: "2024-12-31" }, ohne193);
    if (e.ok !== false) return "fehlender § 193 wurde nicht bemerkt";
    if (e.abrechnungsfrist !== null) return "trotz fehlendem § 193 wurde eine Frist ausgegeben";
    return true;
  });

  pruefe(P_KEIN_BELEG, "Quell-Link fehlt", () => {
    const ohneQuelle = korpus.map((p) =>
      p.gesetz === "BGB" && p.paragraph === "§ 188" ? { ...p, quelle: "" } : p);
    const e = Frist.pruefeFristen({ zeitraumEndeIso: "2024-12-31" }, ohneQuelle);
    if (e.ok !== false) return "fehlender Quell-Link wurde nicht bemerkt";
    return true;
  });

  pruefe(P_KEIN_BELEG, "fremder Quell-Link", () => {
    const fremd = korpus.map((p) =>
      p.gesetz === "BGB" && p.paragraph === "§ 187"
        ? { ...p, quelle: "https://beispiel.invalid/bgb/187" } : p);
    const e = Frist.pruefeFristen({ zeitraumEndeIso: "2024-12-31" }, fremd);
    if (e.ok !== false) return "nicht amtlicher Quell-Link wurde nicht bemerkt";
    return true;
  });

  // -------------------------------------------------------------------------
  const P_OSTERN = "Osterdaten";
  // -------------------------------------------------------------------------

  for (const [jahr, soll] of Object.entries(OSTERN)) {
    pruefe(P_OSTERN, jahr, () =>
      gleich(Feiertage.ostersonntag(Number(jahr)), soll, "Ostersonntag " + jahr));
  }

  // -------------------------------------------------------------------------
  const P_FEIERTAGE = "Bundeseinheitliche Feiertage";
  // -------------------------------------------------------------------------

  for (const jahr of [2024, 2025, 2026]) {
    pruefe(P_FEIERTAGE, "Anzahl " + jahr, () =>
      gleich(Feiertage.bundeseinheitlicheFeiertage(jahr).size, 9, "Anzahl Feiertage " + jahr));
  }

  pruefe(P_FEIERTAGE, "Tag der Deutschen Einheit", () =>
    gleich(Feiertage.feiertagName("2025-10-03"), "Tag der Deutschen Einheit", "03.10.2025"));

  pruefe(P_FEIERTAGE, "Christi Himmelfahrt beweglich", () =>
    gleich(Feiertage.feiertagName("2026-05-14"), "Christi Himmelfahrt", "14.05.2026"));

  pruefe(P_FEIERTAGE, "gewoehnlicher Werktag", () =>
    gleich(Feiertage.feiertagName("2025-06-17"), null, "17.06.2025"));

  // Ostersonntag steht bewusst NICHT in der Liste - er ist ein Sonntag und wird von
  // § 193 BGB schon darueber erfasst. Waere er drin, sahe die Abdeckung groesser aus,
  // als sie ist.
  pruefe(P_FEIERTAGE, "Ostersonntag nicht als Feiertag gefuehrt", () =>
    gleich(Feiertage.feiertagName(Feiertage.ostersonntag(2025)), null, "Ostersonntag 2025"));

  pruefe(P_FEIERTAGE, "landesrechtliche Feiertage benannt", () =>
    Feiertage.NICHT_ABGEDECKT.length >= 8 ? true
      : "Liste der nicht abgedeckten Feiertage ist zu kurz");

  // -------------------------------------------------------------------------
  const P_FRIST = "Fristende nach §§ 187, 188, 193 BGB";
  // -------------------------------------------------------------------------

  for (const fall of FRIST_FAELLE) {
    pruefe(P_FRIST, fall.start, () => {
      const e = Frist.pruefeFristen({ zeitraumEndeIso: fall.start }, korpus);
      if (!e.ok) return "Berechnung nicht moeglich: " + JSON.stringify(e.fehler || e.fehlend);
      const f = e.abrechnungsfrist;

      const basis = gleich(f.basis.iso, fall.basis, fall.name + " / Fristende §§ 187, 188");
      if (basis !== true) return basis;

      const ziel = gleich(f.verschiebung.zielIso, fall.ziel, fall.name + " / Fristende § 193");
      if (ziel !== true) return ziel;

      const art = f.verschiebung.grund ? f.verschiebung.grund.art : null;
      const grund = gleich(art, fall.grundArt, fall.name + " / Grund der Verschiebung");
      if (grund !== true) return grund;

      const abs3 = gleich(f.basis.abs3Angewendet, fall.abs3, fall.name + " / § 188 Abs. 3");
      if (abs3 !== true) return abs3;

      // § 188 Abs. 3 muss belegt werden, wenn er angewendet wurde - und darf nicht
      // auftauchen, wenn nicht. Ein Rechenschritt ohne Beleg ist eine Behauptung.
      const hatAbs3Schritt = f.schritte.some((s) => s.bezeichnung.includes("188 Abs. 3"));
      if (hatAbs3Schritt !== fall.abs3) {
        return fall.abs3 ? "§ 188 Abs. 3 angewendet, aber nicht im Rechenweg ausgewiesen"
                         : "§ 188 Abs. 3 im Rechenweg ausgewiesen, obwohl nicht angewendet";
      }
      return true;
    });
  }

  // Beide Daten muessen immer da sein, auch wenn sie gleich sind. Die Oberflaeche
  // zeigt bewusst zwei Zeilen - ob § 193 auf diese Ausschlussfrist anzuwenden ist,
  // entscheidet dieses Werkzeug nicht.
  pruefe(P_FRIST, "beide Daten immer vorhanden", () => {
    for (const fall of FRIST_FAELLE) {
      const f = Frist.pruefeFristen({ zeitraumEndeIso: fall.start }, korpus).abrechnungsfrist;
      if (!f.basis.iso || !f.verschiebung.zielIso) return "ein Datum fehlt bei " + fall.start;
      if (!f.schritte.some((s) => s.bezeichnung.includes("193"))) {
        return "§ 193 wird bei " + fall.start + " nicht im Rechenweg genannt";
      }
    }
    return true;
  });

  // -------------------------------------------------------------------------
  const P_EINWENDUNG = "Einwendungsfrist nach § 556 Abs. 3 Satz 5 BGB";
  // -------------------------------------------------------------------------

  pruefe(P_EINWENDUNG, "laeuft ab Zugang, nicht ab Zeitraumende", () => {
    const e = Frist.pruefeFristen(
      { zeitraumEndeIso: "2024-12-31", zugangIso: "2025-03-15" }, korpus);
    if (!e.ok) return "Berechnung nicht moeglich";
    const ein = e.einwendungsfrist;
    const basis = gleich(ein.basis.iso, "2026-03-15", "Einwendungsfrist §§ 187, 188");
    if (basis !== true) return basis;
    // 15.03.2026 ist ein Sonntag
    return gleich(ein.verschiebung.zielIso, "2026-03-16", "Einwendungsfrist § 193");
  });

  pruefe(P_EINWENDUNG, "ohne Zugangsdatum nicht berechnet", () => {
    const e = Frist.pruefeFristen({ zeitraumEndeIso: "2024-12-31" }, korpus);
    if (e.einwendungsfrist !== null) return "Einwendungsfrist ohne Zugangsdatum berechnet";
    if (!e.hinweise.some((h) => h.includes("Zugangsdatum"))) return "Hinweis fehlt";
    return true;
  });

  pruefe(P_EINWENDUNG, "Abrechnungsfrist ohne Zugangsdatum weiterhin moeglich", () => {
    const e = Frist.pruefeFristen({ zeitraumEndeIso: "2024-12-31" }, korpus);
    if (!e.ok || !e.abrechnungsfrist) return "Abrechnungsfrist wurde nicht berechnet";
    if (e.abrechnungsfrist.bewertung !== null) return "Bewertung ohne Zugangsdatum abgegeben";
    return true;
  });

  // -------------------------------------------------------------------------
  const P_BEWERTUNG = "Bewertung des Zugangs - drei Zustaende";
  // -------------------------------------------------------------------------
  //
  // Zwischen Fristende nach §§ 187/188 und dem nach § 193 verschobenen Datum gibt es
  // keine richtige Antwort, sondern eine offene Rechtsfrage. Genau das muss der
  // Status sagen. Wuerde hier "gewahrt" oder "versaeumt" stehen, waere das eine
  // Rechtsmeinung, die als Rechenergebnis auftritt.

  const BEWERTUNGEN = [
    { zugang: "2026-05-30", soll: "gewahrt",   was: "ein Tag vor dem Fristende" },
    { zugang: "2026-05-31", soll: "gewahrt",   was: "am letzten Tag der Frist" },
    { zugang: "2026-06-01", soll: "abhaengig", was: "am Tag der Verschiebung nach § 193" },
    { zugang: "2026-06-02", soll: "versaeumt", was: "einen Tag nach der Verschiebung" },
  ];

  for (const fall of BEWERTUNGEN) {
    pruefe(P_BEWERTUNG, fall.zugang, () => {
      const e = Frist.pruefeFristen(
        { zeitraumEndeIso: "2025-05-31", zugangIso: fall.zugang }, korpus);
      if (!e.ok) return "Berechnung nicht moeglich";
      return gleich(e.abrechnungsfrist.bewertung.status, fall.soll, fall.was);
    });
  }

  pruefe(P_BEWERTUNG, "ohne Verschiebung nur zwei Zustaende", () => {
    // 31.12.2025 ist ein Mittwoch, § 193 greift nicht. Dann darf es kein "abhaengig"
    // geben - es gibt keinen Zwischenraum, ueber den man streiten koennte.
    const e = Frist.pruefeFristen(
      { zeitraumEndeIso: "2024-12-31", zugangIso: "2026-01-01" }, korpus);
    return gleich(e.abrechnungsfrist.bewertung.status, "versaeumt", "Zugang 01.01.2026");
  });

  pruefe(P_BEWERTUNG, "Stichtag bewertet die Einwendungsfrist", () => {
    const basis = { zeitraumEndeIso: "2024-12-31", zugangIso: "2025-03-15" };
    const am = (heuteIso) =>
      Frist.pruefeFristen({ ...basis, heuteIso }, korpus).einwendungsfrist.bewertung.status;
    const offen = gleich(am("2026-03-15"), "gewahrt", "Stichtag 15.03.2026");
    if (offen !== true) return offen;
    const strittig = gleich(am("2026-03-16"), "abhaengig", "Stichtag 16.03.2026");
    if (strittig !== true) return strittig;
    return gleich(am("2026-03-17"), "versaeumt", "Stichtag 17.03.2026");
  });

  // -------------------------------------------------------------------------
  const P_NUTZER_FEIERTAG = "Vom Nutzer bestaetigter Feiertag";
  // -------------------------------------------------------------------------
  //
  // Landesrechtliche Feiertage kennt das Werkzeug nicht. Der Nutzer kann sie
  // deshalb selbst setzen - und die Herkunft dieser Angabe muss im Ergebnis
  // unterscheidbar bleiben, sonst sieht eine Nutzerangabe aus wie eine Berechnung.

  pruefe(P_NUTZER_FEIERTAG, "verschiebt und bleibt als Nutzerangabe erkennbar", () => {
    const e = Frist.pruefeFristen(
      { zeitraumEndeIso: "2024-12-31", feiertageBestaetigt: ["2025-12-31"] }, korpus);
    const f = e.abrechnungsfrist;
    if (f.basis.iso !== "2025-12-31") return "Fristende nach §§ 187/188 veraendert sich";
    // 01.01.2026 ist Neujahr, also geht es weiter auf den 02.01.2026 (Freitag).
    const ziel = gleich(f.verschiebung.zielIso, "2026-01-02", "Ziel nach Nutzerangabe");
    if (ziel !== true) return ziel;
    return gleich(f.verschiebung.grund.herkunft, "nutzerangabe", "Herkunft des Grundes");
  });

  pruefe(P_NUTZER_FEIERTAG, "berechneter Feiertag traegt seine Herkunft", () => {
    const e = Frist.pruefeFristen({ zeitraumEndeIso: "2024-10-03" }, korpus);
    return gleich(e.abrechnungsfrist.verschiebung.grund.herkunft, "bundeseinheitlich",
      "Herkunft des Grundes");
  });

  pruefe(P_NUTZER_FEIERTAG, "Frage nach dem Feiertag zielt auf den Werktag", () => {
    const e = Frist.pruefeFristen({ zeitraumEndeIso: "2024-12-31" }, korpus);
    const frage = e.abrechnungsfrist.feiertagsfrage;
    if (!frage) return "es wird gar nicht gefragt";
    return gleich(frage.iso, "2025-12-31", "Datum der Frage");
  });

  pruefe(P_NUTZER_FEIERTAG, "keine Frage zu einem bereits erkannten Feiertag", () => {
    // Der 03.10.2025 ist bereits als Feiertag erkannt, die Kette endet am 06.10.2025.
    // Gefragt wird nach dem Endpunkt, nicht nach dem schon erkannten Tag.
    const e = Frist.pruefeFristen({ zeitraumEndeIso: "2024-10-03" }, korpus);
    const frage = e.abrechnungsfrist.feiertagsfrage;
    if (!frage) return "es wird gar nicht gefragt";
    return gleich(frage.iso, "2025-10-06", "Datum der Frage");
  });

  // -------------------------------------------------------------------------
  const P_BELEGKETTE = "Jeder Rechenschritt haengt an einem Beleg";
  // -------------------------------------------------------------------------

  pruefe(P_BELEGKETTE, "Schritte verweisen auf vorhandene Belege", () => {
    const e = Frist.pruefeFristen(
      { zeitraumEndeIso: "2024-02-29", zugangIso: "2025-03-15" }, korpus);
    for (const frist of [e.abrechnungsfrist, e.einwendungsfrist]) {
      if (!frist.schritte.length) return "Frist ohne Rechenweg";
      for (const schritt of frist.schritte) {
        const beleg = e.belege[schritt.beleg];
        if (!beleg) return "Schritt ohne Beleg: " + schritt.bezeichnung;
        if (!beleg.quelle.startsWith(QUELLE_PRAEFIX)) {
          return "Beleg ohne amtliche Quelle: " + schritt.bezeichnung;
        }
      }
    }
    return true;
  });

  // Die Seite zeigt zu jeder Frist den Wortlaut der Vorschrift. Dieser Wortlaut
  // steht als Zeichenkette im Kern - und muss deshalb Zeichen fuer Zeichen im Text
  // aus der Wissensbasis vorkommen. Sonst ist es ein Zitat aus zweiter Hand, das
  // beim naechsten Import der Gesetze unbemerkt falsch wird.
  pruefe(P_BELEGKETTE, "Zitierter Wortlaut steht so in der Wissensbasis", () => {
    const e = Frist.pruefeFristen(
      { zeitraumEndeIso: "2024-12-31", zugangIso: "2025-03-15" }, korpus);
    const text = e.belege["bgb-556"].text;
    for (const frist of [e.abrechnungsfrist, e.einwendungsfrist]) {
      if (!text.includes(frist.satz)) {
        return `Der zitierte Satz der ${frist.titel} kommt in § 556 BGB nicht wörtlich vor: `
          + JSON.stringify(frist.satz);
      }
    }

    // Dasselbe fuer den Tatbestand des § 193 BGB. Die Seite erklaert damit, wann
    // § 193 ueberhaupt gilt - eine Aussage ueber den Gesetzestext, also gehoert
    // sie an den Gesetzestext gebunden und nicht in den Oberflaechen-Code.
    if (!e.zitate || !e.zitate.paragraf193Voraussetzung) {
      return "Der Baustein zum Tatbestand des § 193 BGB fehlt im Ergebnis";
    }
    if (!e.belege["bgb-193"].text.includes(e.zitate.paragraf193Voraussetzung)) {
      return "Der zitierte Tatbestand kommt in § 193 BGB nicht wörtlich vor: "
        + JSON.stringify(e.zitate.paragraf193Voraussetzung);
    }
    return true;
  });

  pruefe(P_BELEGKETTE, "§ 556 wird als Grundlage mitgeliefert", () => {
    const e = Frist.pruefeFristen(
      { zeitraumEndeIso: "2024-12-31", zugangIso: "2025-03-15" }, korpus);
    if (!e.belege["bgb-556"]) return "§ 556 fehlt in den Belegen";
    if (!e.abrechnungsfrist.grundlage.includes("556")) return "Abrechnungsfrist nennt § 556 nicht";
    if (!e.einwendungsfrist.grundlage.includes("556")) return "Einwendungsfrist nennt § 556 nicht";
    return true;
  });

  // -------------------------------------------------------------------------
  const P_EINGABE = "Ungueltige Eingaben werden zurueckgewiesen";
  // -------------------------------------------------------------------------
  //
  // Ein stillschweigend zurechtgebogenes Datum waere hier besonders gefaehrlich:
  // Der 30.02. wuerde als 02.03. weiterlaufen und ein Fristende erzeugen, das
  // niemand nachvollziehen kann.

  for (const schlecht of ["2025-02-30", "2025-2-3", "31.12.2025", "morgen", ""]) {
    pruefe(P_EINGABE, JSON.stringify(schlecht), () => {
      const e = Frist.pruefeFristen({ zeitraumEndeIso: schlecht }, korpus);
      if (e.ok !== false) return "wurde als gueltiges Datum akzeptiert";
      if (e.abrechnungsfrist !== null) return "es wurde trotzdem eine Frist berechnet";
      return true;
    });
  }

  pruefe(P_EINGABE, "Schaltjahr 29.02. bleibt gueltig", () =>
    Datum.istGueltigesDatum("2024-02-29") ? true : "29.02.2024 wurde abgelehnt");

  pruefe(P_EINGABE, "Zugang vor Zeitraumende wird angemerkt", () => {
    const e = Frist.pruefeFristen(
      { zeitraumEndeIso: "2024-12-31", zugangIso: "2024-06-01" }, korpus);
    if (!e.ok) return "Berechnung abgebrochen statt angemerkt";
    return e.hinweise.some((h) => h.includes("vor dem Ende")) ? true : "Hinweis fehlt";
  });

  // -------------------------------------------------------------------------
  // Ausgabe
  // -------------------------------------------------------------------------

  const fehlerAnzahl = befunde.filter((b) => b.stufe === "FEHLER").length;
  const gruppen = [...new Set(befunde.map((b) => b.pruefung))];

  console.log("");
  console.log("Betriebskosten-Pruefer - Fristberechnung (Teil A)");
  console.log("=".repeat(62));

  for (const gruppe of gruppen) {
    const eintraege = befunde.filter((b) => b.pruefung === gruppe);
    const kaputt = eintraege.filter((b) => b.stufe === "FEHLER");
    const bestanden = eintraege.filter((b) => b.stufe === "OK").length;
    console.log("");
    console.log(`${kaputt.length === 0 ? "OK  " : "FEHL"}  ${gruppe}`
      + (bestanden ? `  (${bestanden}/${bestanden + kaputt.length})` : ""));
    for (const e of kaputt) console.log(`      FEHLER [${e.id}] ${e.text}`);
    for (const e of eintraege.filter((b) => b.stufe === "INFO")) {
      console.log(`      ${e.text}`);
    }
  }

  const gesamt = befunde.filter((b) => b.stufe !== "INFO").length;
  console.log("");
  console.log("=".repeat(62));
  console.log(`${gesamt - fehlerAnzahl} von ${gesamt} Pruefungen bestanden, `
    + `${fehlerAnzahl} Fehler.`);
  console.log("");

  process.exit(fehlerAnzahl === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("Pruefung konnte nicht durchgefuehrt werden:", e);
  process.exit(2);
});
