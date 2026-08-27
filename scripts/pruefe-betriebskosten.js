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
const BEGRIFFE_PFAD = process.env.BETRIEBSKOSTEN_BEGRIFFE
  || path.resolve(__dirname, "../wissensbasis/betriebskosten-begriffe.json");

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

  // =========================================================================
  // TEIL B - Positionspruefung gegen den Katalog der BetrKV
  // =========================================================================

  const Katalog = await laden("katalog.mjs");
  const begriffsdatei = JSON.parse(fs.readFileSync(BEGRIFFE_PFAD, "utf8"));
  const belegeB = Katalog.belegeLaden(korpus);
  const katalog = belegeB.ok ? Katalog.parseKatalog(belegeB.belege["betrkv-2"].text) : { items: [] };
  const ausschluesse = belegeB.ok
    ? Katalog.parseAusschluesse(belegeB.belege["betrkv-1"].text) : { posten: [] };

  // -------------------------------------------------------------------------
  const P_BELEGE_B = "Belege fuer die Positionspruefung";
  // -------------------------------------------------------------------------

  pruefe(P_BELEGE_B, "BetrKV vollstaendig", () =>
    belegeB.ok ? true : "fehlende Belege: " + JSON.stringify(belegeB.fehlend));

  pruefe(P_BELEGE_B, "ohne Wissensbasis kein Ergebnis", () => {
    const e = Katalog.pruefePositionen({ text: "Grundsteuer" }, [], begriffsdatei);
    if (e.ok !== false) return "leere Wissensbasis wurde akzeptiert";
    if (e.positionen.length !== 0) return "trotzdem wurden Positionen ausgegeben";
    return true;
  });

  pruefe(P_BELEGE_B, "ohne Begriffsdatei kein Ergebnis", () => {
    const e = Katalog.pruefePositionen({ text: "Grundsteuer" }, korpus, {});
    if (e.ok !== false) return "leere Begriffsdatei wurde akzeptiert";
    if (e.positionen.length !== 0) return "trotzdem wurden Positionen ausgegeben";
    return true;
  });

  // -------------------------------------------------------------------------
  const P_KATALOG = "Katalog aus § 2 BetrKV geparst";
  // -------------------------------------------------------------------------
  //
  // Der Katalog wird nicht abgeschrieben, sondern geparst. Deshalb muss hier
  // stehen, WAS dabei herauskommen soll - sonst faellt eine Textaenderung beim
  // naechsten Import erst auf der Seite auf, mit echtem Paragraphen und echtem
  // Link neben der falschen Nummer.

  const ERWARTETE_KURZTITEL = {
    1: "die laufenden öffentlichen Lasten des Grundstücks",
    2: "die Kosten der Wasserversorgung",
    3: "die Kosten der Entwässerung",
    4: "die Kosten des Betriebs der zentralen Heizungsanlage einschließlich der Abgasanlage",
    5: "die Kosten des Betriebs der zentralen Warmwasserversorgungsanlage",
    6: "die Kosten verbundener Heizungs- und Warmwasserversorgungsanlagen",
    7: "die Kosten des Betriebs des Personen- oder Lastenaufzugs",
    8: "die Kosten der Straßenreinigung und Müllbeseitigung",
    9: "die Kosten der Gebäudereinigung und Ungezieferbekämpfung",
    10: "die Kosten der Gartenpflege",
    11: "die Kosten der Beleuchtung",
    12: "die Kosten der Schornsteinreinigung",
    13: "die Kosten der Sach- und Haftpflichtversicherung",
    14: "die Kosten für den Hauswart",
    15: "die Kosten des Betriebs der Gemeinschafts-Antennenanlage",
    16: "die Kosten des Betriebs der Einrichtungen für die Wäschepflege",
    17: "sonstige Betriebskosten",
  };

  pruefe(P_KATALOG, "genau 17 Nummern", () =>
    gleich(katalog.items.length, 17, "Anzahl der Katalognummern"));

  pruefe(P_KATALOG, "Nummern 1 bis 17 lueckenlos", () => {
    const nummern = katalog.items.map((i) => i.nr).join(",");
    return gleich(nummern, "1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17", "Nummernfolge");
  });

  for (const [nr, soll] of Object.entries(ERWARTETE_KURZTITEL)) {
    pruefe(P_KATALOG, "Nr. " + nr, () => {
      const item = katalog.items.find((i) => i.nr === Number(nr));
      if (!item) return "Nummer fehlt im geparsten Katalog";
      return gleich(item.kurztitel, soll, "Kurztitel Nr. " + nr);
    });
  }

  // Der Schlusssatz gehoert zu keiner Nummer. Haengt er an Nr. 17, wird er als
  // Bestandteil der "sonstigen Betriebskosten" zitiert - eine falsche Fundstelle,
  // die mit echtem Paragraphen und echtem Link daherkommt.
  pruefe(P_KATALOG, "Schlusssatz getrennt erfasst", () => {
    if (!katalog.schlusssatz.startsWith("Für Anlagen")) {
      return "Schlusssatz fehlt oder beginnt anders: " + JSON.stringify(katalog.schlusssatz.slice(0, 40));
    }
    return true;
  });

  pruefe(P_KATALOG, "Schlusssatz steht nicht in Nr. 17", () => {
    const nr17 = katalog.items.find((i) => i.nr === 17);
    if (nr17.text.includes("Für Anlagen")) return "Der Schlusssatz wurde Nr. 17 zugeschlagen";
    return gleich(nr17.zeilen.length, 2, "Zeilen in Nr. 17");
  });

  pruefe(P_KATALOG, "Nr. 15 behaelt ihre Unterpunkte", () => {
    const nr15 = katalog.items.find((i) => i.nr === 15);
    return gleich(nr15.unterpunkte.length, 3, "Unterpunkte in Nr. 15");
  });

  pruefe(P_KATALOG, "§ 1 Abs. 2 ergibt zwei Ausschluesse", () => {
    if (ausschluesse.posten.length !== 2) {
      return "Anzahl der Ausschluesse: " + ausschluesse.posten.length;
    }
    const eins = gleich(ausschluesse.posten[0].kurztitel, "Verwaltungskosten", "Ausschluss Nr. 1");
    if (eins !== true) return eins;
    return gleich(ausschluesse.posten[1].kurztitel,
      "Instandhaltungs- und Instandsetzungskosten", "Ausschluss Nr. 2");
  });

  // -------------------------------------------------------------------------
  const P_BEGRIFFE = "Begriffsdatei";
  // -------------------------------------------------------------------------
  //
  // titel_pruefung ist dieselbe Sicherung wie in themen-mapping.json: Der
  // Suchbegriff darf nur dann auf eine Nummer zeigen, wenn dieser Textteil auch
  // wirklich in GENAU DIESER Nummer steht.

  const begriffsEintraege = Katalog.begriffeAufbereiten(begriffsdatei);

  pruefe(P_BEGRIFFE, "Eintraege werden erkannt", () =>
    begriffsEintraege.length >= 19 ? true
      : "nur " + begriffsEintraege.length + " Eintraege erkannt");

  pruefe(P_BEGRIFFE, "kein Eintrag ohne Begriffe", () => {
    const leer = Object.entries(begriffsdatei)
      .filter(([k, v]) => !k.startsWith("_") && (!v.begriffe || v.begriffe.length === 0))
      .map(([k]) => k);
    return leer.length === 0 ? true : "ohne Begriffe: " + leer.join(", ");
  });

  for (const eintrag of begriffsEintraege) {
    pruefe(P_BEGRIFFE, "Anker " + eintrag.schluessel, () => {
      if (!eintrag.titel_pruefung) return "titel_pruefung fehlt";
      // Luecken-Eintraege ankern wie Katalog-Eintraege: Ihre praxis_nr zeigt auf
      // eine Nummer des Katalogs. Der Anker behauptet dabei NICHT, dass der
      // Begriff dort vorkommt - er sichert nur, dass die genannte Nummer noch
      // die Vorschrift ist, die gemeint war.
      const ziel = eintrag.art === "ausschluss"
        ? ausschluesse.posten.find((p) => p.nr === eintrag.nr)
        : katalog.items.find((i) => i.nr === eintrag.nr);
      if (!ziel) return "Nummer " + eintrag.nr + " gibt es nicht";
      if (!Katalog.falte(ziel.text).includes(Katalog.falte(eintrag.titel_pruefung))) {
        return `titel_pruefung ${JSON.stringify(eintrag.titel_pruefung)} kommt im Text von `
          + `Nr. ${eintrag.nr} nicht vor - die Zuordnung zeigt woandershin`;
      }
      return true;
    });
  }

  pruefe(P_BEGRIFFE, "kein Begriff kuerzer als vier Zeichen", () => {
    const kurz = [];
    for (const e of begriffsEintraege) {
      for (const b of e.begriffe) if (Katalog.falte(b).length < 4) kurz.push(e.schluessel + ": " + b);
    }
    return kurz.length === 0 ? true : "zu kurz und damit zu unscharf: " + kurz.join(", ");
  });

  pruefe(P_BEGRIFFE, "kein Begriff in zwei Eintraegen", () => {
    const gesehen = new Map();
    const doppelt = [];
    for (const e of begriffsEintraege) {
      for (const b of e.begriffe) {
        const schluessel = Katalog.falte(b);
        if (gesehen.has(schluessel)) doppelt.push(`${b} (${gesehen.get(schluessel)} und ${e.schluessel})`);
        else gesehen.set(schluessel, e.schluessel);
      }
    }
    return doppelt.length === 0 ? true : "mehrdeutig: " + doppelt.join(", ");
  });

  // -------------------------------------------------------------------------
  const P_ZUORDNUNG = "Zuordnung der Positionen";
  // -------------------------------------------------------------------------

  const ordne = (zeile, optionen) =>
    Katalog.pruefePositionen({ text: zeile, ...(optionen || {}) }, korpus, begriffsdatei).positionen[0];

  const ZUORDNUNGEN = [
    { zeile: "Grundsteuer 245,80 EUR", verdikt: "im-katalog", nr: 1, art: "katalog" },
    { zeile: "Müllabfuhr 180,00", verdikt: "im-katalog", nr: 8, art: "katalog" },
    { zeile: "Gartenpflege 320,50 €", verdikt: "im-katalog", nr: 10, art: "katalog" },
    { zeile: "Aufzug 410,00", verdikt: "im-katalog", nr: 7, art: "katalog" },
    { zeile: "Verwaltervergütung 240,00", verdikt: "nicht-umlagefaehig", nr: 1, art: "ausschluss" },
    { zeile: "Reparatur Heizung 890,00", verdikt: "nicht-umlagefaehig", nr: 2, art: "ausschluss" },
    { zeile: "Hausmeister 620,00", verdikt: "mietvertrag-erforderlich", nr: 14, art: "katalog" },
    { zeile: "Sonstige Betriebskosten 95,00", verdikt: "mietvertrag-erforderlich", nr: 17, art: "katalog" },
  ];

  for (const fall of ZUORDNUNGEN) {
    pruefe(P_ZUORDNUNG, fall.zeile, () => {
      const p = ordne(fall.zeile);
      if (!p) return "keine Position erzeugt";
      const v = gleich(p.verdikt, fall.verdikt, "Urteil");
      if (v !== true) return v;
      const erste = p.fundstellen[0];
      if (!erste) return "kein Fundstelle angegeben";
      const a = gleich(erste.art, fall.art, "Art der ersten Fundstelle");
      if (a !== true) return a;
      return gleich(erste.nr, fall.nr, "Nummer der ersten Fundstelle");
    });
  }

  // Der Ausschluss geht dem Katalog vor - siehe Begruendung im Kopf von
  // kern/katalog.mjs (§ 2 Nr. 14 nimmt Instandhaltung selbst aus). Trifft eine
  // Zeile beides, muss trotzdem BEIDES sichtbar bleiben.
  pruefe(P_ZUORDNUNG, "Doppeltreffer zeigt beide Fundstellen", () => {
    const p = ordne("Reparatur Heizung 890,00");
    if (p.fundstellen.length !== 2) {
      return "Fundstellen: " + p.fundstellen.map((f) => f.bezeichnung).join(", ");
    }
    if (p.fundstellen[0].art !== "ausschluss") return "der Ausschluss steht nicht vorn";
    if (p.fundstellen[1].art !== "katalog") return "der Katalogtreffer fehlt";
    return true;
  });

  pruefe(P_ZUORDNUNG, "Nr. 14 traegt den Vorbehalt", () => {
    const p = ordne("Hausmeister 620,00");
    return p.vorbehalte.some((v) => v.nr === 14) ? true : "Vorbehalt zu Nr. 14 fehlt";
  });

  pruefe(P_ZUORDNUNG, "Nr. 17 traegt den Vorbehalt", () => {
    const p = ordne("Sonstige Betriebskosten 95,00");
    return p.vorbehalte.some((v) => v.nr === 17) ? true : "Vorbehalt zu Nr. 17 fehlt";
  });

  // Ein unbekanntes Wort darf KEINE Nummer bekommen. "Nicht zuordenbar" ist eine
  // Aussage ueber dieses Werkzeug, nicht ueber die Position.
  pruefe(P_ZUORDNUNG, "unbekanntes Wort behauptet nichts", () => {
    const p = ordne("Blubberdings 12,00");
    if (!p) return "die Zeile wurde stillschweigend verworfen";
    const v = gleich(p.verdikt, "nicht-zuordenbar", "Urteil");
    if (v !== true) return v;
    if (p.fundstellen.length !== 0) return "es wurde trotzdem eine Fundstelle genannt";
    if (p.vorbehalte.length !== 0) return "es wurde trotzdem ein Vorbehalt genannt";
    return true;
  });

  pruefe(P_ZUORDNUNG, "Betrag wird abgetrennt und nicht verrechnet", () => {
    const p = ordne("Grundsteuer 245,80 EUR");
    const b = gleich(p.bezeichnung, "Grundsteuer", "Bezeichnung ohne Betrag");
    if (b !== true) return b;
    const e = Katalog.pruefePositionen(
      { text: "Grundsteuer 245,80 EUR\nMüllabfuhr 180,00" }, korpus, begriffsdatei);
    // Es darf nirgends eine Summe entstehen - dieses Werkzeug rechnet nicht.
    const alsText = JSON.stringify(e.zusammenfassung);
    if (/245|180|425/.test(alsText)) return "im Ergebnis taucht ein Betrag auf: " + alsText;
    return true;
  });

  pruefe(P_ZUORDNUNG, "jede Fundstelle traegt eine amtliche Quelle", () => {
    const e = Katalog.pruefePositionen({
      text: ZUORDNUNGEN.map((f) => f.zeile).join("\n"),
    }, korpus, begriffsdatei);
    for (const p of e.positionen) {
      for (const f of p.fundstellen) {
        if (!f.quelle || !f.quelle.startsWith(QUELLE_PRAEFIX)) {
          return "Fundstelle ohne amtliche Quelle: " + p.bezeichnung + " -> " + f.bezeichnung;
        }
        if (!f.text || f.text.length < 20) return "Fundstelle ohne Gesetzestext: " + f.bezeichnung;
      }
    }
    return true;
  });

  // Die Oberflaeche schreibt bei einem Wortlaut-Treffer "steht so im Gesetz".
  // Dann muss der genannte Begriff auch wirklich so im Text stehen - sonst ist
  // die Beschriftung selbst die Unwahrheit. (Erste Fassung zeigte die intern
  // gefaltete Form "muellabfuhr", die in keinem Gesetzestext vorkommt.)
  pruefe(P_ZUORDNUNG, "Wortlaut-Treffer steht wirklich im Gesetzestext", () => {
    const e = Katalog.pruefePositionen({
      text: "Grundsteuer\nMüllabfuhr\nGartenpflege\nAufzug\nEntwässerung\nGebäudereinigung",
    }, korpus, begriffsdatei);
    for (const p of e.positionen) {
      for (const f of p.fundstellen) {
        if (f.treffer.art !== "wortlaut") continue;
        if (!f.text.toLowerCase().includes(f.treffer.begriff.toLowerCase())) {
          return `"${f.treffer.begriff}" wird als Wortlaut ausgewiesen, kommt in `
            + `${f.bezeichnung} aber nicht so vor`;
        }
      }
    }
    return true;
  });

  pruefe(P_ZUORDNUNG, "Tabellenkopf wird nicht als Position gelesen", () => {
    const e = Katalog.pruefePositionen(
      { text: "Kostenart          Betrag          Anteil" }, korpus, begriffsdatei);
    if (e.positionen.length !== 0) return "die Kopfzeile wurde als Position gewertet";
    return gleich(e.nichtGewertet.length, 1, "aussortierte Zeilen");
  });

  pruefe(P_ZUORDNUNG, "Suchbegriff-Treffer ist als solcher gekennzeichnet", () => {
    const wortlaut = ordne("Grundsteuer 245,80").fundstellen[0].treffer;
    const synonym = ordne("Hausmeister 620,00").fundstellen[0].treffer;
    if (wortlaut.art !== "wortlaut") return "Grundsteuer steht im Gesetz, gilt aber als Suchbegriff";
    if (synonym.art !== "suchbegriff") return "Hausmeister steht nicht im Gesetz, gilt aber als Wortlaut";
    // In deutscher Schreibweise, so wie es in der Oberflaeche steht.
    return gleich(synonym.begriff, "Hausmeister", "genannter Suchbegriff");
  });

  // -------------------------------------------------------------------------
  const P_LUECKEN = "Bekannte Luecken sind keine Fundstellen";
  // -------------------------------------------------------------------------
  //
  // Positionen wie Winterdienst nennt § 2 BetrKV nicht; ihre Zuordnung stammt aus
  // der Rechtsprechung. Sie bekommen ein eigenes Urteil - und ausdruecklich keinen
  // Beleg. Der gefaehrliche Fall waere nicht die fehlende Fundstelle, sondern eine
  // vorhandene: eine Zuordnung aus der Rechtsprechung, ausgegeben mit echtem
  // Paragraphen und echtem Link, also nicht als Rechtsauskunft erkennbar.

  const lueckenEintraege = begriffsEintraege.filter((e) => e.art === "luecke");

  pruefe(P_LUECKEN, "es gibt Luecken-Eintraege", () =>
    lueckenEintraege.length >= 3 ? true
      : "nur " + lueckenEintraege.length + " Luecken-Eintraege erkannt");

  for (const eintrag of lueckenEintraege) {
    for (const begriff of eintrag.begriffe) {
      pruefe(P_LUECKEN, eintrag.schluessel + " / " + begriff, () => {
        const p = ordne(begriff + " 210,00");
        if (!p) return "die Zeile wurde stillschweigend verworfen";

        const v = gleich(p.verdikt, "im-gesetz-nicht-genannt", "Urteil");
        if (v !== true) return v;

        // Der Kern der Sache: keine Fundstelle, kein Vorbehalt, nur der Hinweis.
        if (p.fundstellen.length !== 0) {
          return "es wurde eine Fundstelle ausgegeben: "
            + p.fundstellen.map((f) => f.bezeichnung).join(", ");
        }
        if (p.luecken.length !== 1) return "Anzahl der Hinweise: " + p.luecken.length;

        const hinweis = p.luecken[0];
        if (hinweis.praxisNr !== eintrag.praxisNr) {
          return `genannte Nummer ${hinweis.praxisNr} statt ${eintrag.praxisNr}`;
        }
        if (!katalog.items.some((i) => i.nr === hinweis.praxisNr)) {
          return "die genannte Nummer gibt es im Katalog nicht";
        }
        return true;
      });
    }
  }

  // Kein quelle- und kein text-Feld. Nicht "wird nicht angezeigt", sondern gibt es
  // nicht: Woraus kein Link gebaut werden kann, daraus wird auch versehentlich
  // keiner gebaut.
  pruefe(P_LUECKEN, "Hinweis hat weder quelle noch text", () => {
    const e = Katalog.pruefePositionen({
      text: lueckenEintraege.flatMap((l) => l.begriffe).join("\n"),
    }, korpus, begriffsdatei);
    for (const p of e.positionen) {
      for (const hinweis of p.luecken) {
        const schluessel = Object.keys(hinweis);
        if (schluessel.includes("quelle")) return "der Hinweis hat ein quelle-Feld";
        if (schluessel.includes("text")) return "der Hinweis hat ein text-Feld";
      }
      const alsText = JSON.stringify(p);
      if (p.verdikt === "im-gesetz-nicht-genannt" && alsText.includes("gesetze-im-internet.de")) {
        return "im Ergebnis steht trotzdem ein Quell-Link: " + p.bezeichnung;
      }
    }
    return true;
  });

  // Die volle Zitierform ist auf der Seite das Kennzeichen eines echten Belegs -
  // im Hinweistext darf sie deshalb nicht auftauchen.
  pruefe(P_LUECKEN, "Hinweis nennt nur die Nummer, nicht die Zitierform", () => {
    const p = ordne("Winterdienst 210,00");
    const hinweis = p.luecken[0].hinweis;
    if (/§\s*2/.test(hinweis)) return "der Hinweis zitiert wie ein Beleg: " + hinweis;
    if (!hinweis.includes("Nr. " + p.luecken[0].praxisNr)) return "die Nummer wird nicht genannt";
    return true;
  });

  // Der Grund, warum Luecken und Katalog im selben Wettbewerb antreten muessen.
  pruefe(P_LUECKEN, "Dachrinnenreinigung schlaegt den Katalogbegriff Reinigung", () => {
    const p = ordne("Dachrinnenreinigung 130,00");
    if (p.verdikt !== "im-gesetz-nicht-genannt") {
      return "Urteil " + p.verdikt + ", Fundstellen: "
        + p.fundstellen.map((f) => f.bezeichnung).join(", ");
    }
    return gleich(p.fundstellen.length, 0, "Fundstellen");
  });

  pruefe(P_LUECKEN, "Luecke bleibt vom Ausschluss unterscheidbar", () => {
    // "Reparatur Dachrinnenreinigung" trifft beides. Das Urteil richtet sich nach
    // dem Ausschluss, der Luecken-Hinweis bleibt trotzdem sichtbar.
    const p = ordne("Reparatur Dachrinnenreinigung 80,00");
    if (p.verdikt !== "nicht-umlagefaehig") return "Urteil: " + p.verdikt;
    if (p.luecken.length !== 1) return "der Luecken-Hinweis fehlt";
    for (const f of p.fundstellen) {
      if (f.art === "katalog") return "es wurde trotzdem eine Katalog-Fundstelle gebaut";
    }
    return true;
  });

  pruefe(P_LUECKEN, "unbekanntes Wort bleibt nicht zuordenbar", () => {
    // Die Abgrenzung, um die es geht: "nicht zuordenbar" heisst, das Werkzeug
    // kennt das Wort nicht. "Im Gesetz nicht genannt" heisst, es kennt es.
    const p = ordne("Blubberdings 12,00");
    const v = gleich(p.verdikt, "nicht-zuordenbar", "Urteil");
    if (v !== true) return v;
    return gleich(p.luecken.length, 0, "Hinweise");
  });

  // -------------------------------------------------------------------------
  const P_FILTER = "Nichts verschwindet";
  // -------------------------------------------------------------------------
  //
  // Die wichtigste Eigenschaft von Teil B. Zeilen, die keine Position sind,
  // werden aussortiert - aber sichtbar und gezaehlt. Eine still verschluckte
  // Position waere die gefaehrlichste Ausgabe: eine Seite ohne Befund sieht aus
  // wie eine Seite ohne Problem.

  const GEMISCHT = [
    "Kostenart",
    "Grundsteuer 245,80",
    "Zwischensumme Wasser 120,00",
    "Summe 3.133,30",
    "Abrechnungszeitraum 01.01.2024 - 31.12.2024",
    "Seite 2",
    "- 3 -",
    "Blubberdings 12,00",
  ].join("\n");

  pruefe(P_FILTER, "keine Zeile geht verloren", () => {
    const e = Katalog.pruefePositionen({ text: GEMISCHT }, korpus, begriffsdatei);
    const summe = e.positionen.length + e.nichtGewertet.length;
    return gleich(summe, e.zusammenfassung.zeilenGesamt,
      "Positionen + aussortierte Zeilen gegen eingegebene Zeilen");
  });

  // Der Filter greift erst NACH der Zuordnung. Deshalb kann ein Filterwort
  // niemals einen Befund unterdruecken.
  pruefe(P_FILTER, "Filterwort unterdrueckt keinen Treffer", () => {
    const e = Katalog.pruefePositionen({ text: GEMISCHT }, korpus, begriffsdatei);
    const treffer = e.positionen.find((p) => p.rohzeile.startsWith("Zwischensumme Wasser"));
    if (!treffer) return "\"Zwischensumme Wasser\" wurde aussortiert, obwohl sie § 2 Nr. 2 trifft";
    return gleich(treffer.fundstellen[0].nr, 2, "Nummer der Fundstelle");
  });

  pruefe(P_FILTER, "aussortierte Zeilen nennen ihren Grund", () => {
    const e = Katalog.pruefePositionen({ text: GEMISCHT }, korpus, begriffsdatei);
    if (e.nichtGewertet.length === 0) return "es wurde gar nichts aussortiert";
    for (const n of e.nichtGewertet) {
      if (!n.grund || n.grund.length < 5) return "Zeile ohne Grund: " + n.rohzeile;
      if (!n.rohzeile) return "aussortierte Zeile ohne Text";
    }
    return true;
  });

  pruefe(P_FILTER, "nur Zeilen ohne Treffer werden aussortiert", () => {
    const e = Katalog.pruefePositionen({ text: GEMISCHT }, korpus, begriffsdatei);
    for (const n of e.nichtGewertet) {
      const geprueft = Katalog.pruefePositionen(
        { text: n.rohzeile, alleZeilenPruefen: true }, korpus, begriffsdatei).positionen[0];
      if (geprueft && geprueft.verdikt !== "nicht-zuordenbar") {
        return "aussortiert, obwohl zuordenbar: " + n.rohzeile + " -> " + geprueft.verdikt;
      }
    }
    return true;
  });

  pruefe(P_FILTER, "Filter laesst sich abschalten", () => {
    const e = Katalog.pruefePositionen(
      { text: GEMISCHT, alleZeilenPruefen: true }, korpus, begriffsdatei);
    if (e.nichtGewertet.length !== 0) return "trotz abgeschaltetem Filter wurde aussortiert";
    return gleich(e.positionen.length, e.zusammenfassung.zeilenGesamt, "gepruefte Zeilen");
  });

  pruefe(P_FILTER, "Leerzeilen erzeugen keinen Befund", () => {
    const e = Katalog.pruefePositionen(
      { text: "Grundsteuer\n\n   \n\nMüllabfuhr" }, korpus, begriffsdatei);
    return gleich(e.positionen.length, 2, "Positionen aus zwei Zeilen mit Text");
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
