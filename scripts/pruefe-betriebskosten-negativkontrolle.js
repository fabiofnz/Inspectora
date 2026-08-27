#!/usr/bin/env node
// scripts/pruefe-betriebskosten-negativkontrolle.js
// Aufruf: npm run pruefe-betriebskosten:negativkontrolle
//
// Wozu das hier gehoert: pruefe-betriebskosten.js meldet im Normalfall "0 Fehler".
// Das allein beweist nichts. Es kann auch heissen, dass eine Pruefung ins Leere
// greift - genau das ist beim Bau dieser Datei passiert: Die erste Fassung von
// pruefe-betriebskosten.js hat bestandene Pruefungen gar nicht gezaehlt und
// "0 von 0 Pruefungen bestanden, 0 Fehler" gemeldet. Exit 0, sah sauber aus,
// prueft aber nichts.
//
// Deshalb: Jede Pruefung wird hier absichtlich gebrochen. Wird ein eingebauter
// Fehler NICHT gemeldet, schlaegt dieses Skript fehl.
//
// Die echten Dateien werden dabei nicht angefasst. Gearbeitet wird auf Kopien von
// kern/ und wissensbasis/gesetze.json in einem temporaeren Verzeichnis; der Pruefer
// wird ueber BETRIEBSKOSTEN_KERN und WISSENSBASIS_GESETZE dorthin gelenkt.

"use strict";

const fs   = require("fs");
const os   = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT          = path.resolve(__dirname, "..");
const KERN_QUELLE   = path.join(ROOT, "kern");
const GESETZE_PFAD  = path.join(ROOT, "wissensbasis/gesetze.json");
const BEGRIFFE_PFAD = path.join(ROOT, "wissensbasis/betriebskosten-begriffe.json");
const PRUEFER       = path.join(ROOT, "scripts/pruefe-betriebskosten.js");

const KERN_DATEIEN = ["datum.mjs", "feiertage.mjs", "frist.mjs", "katalog.mjs"];

// Jede Mutation bricht genau eine Pruefung. "erwartet" ist die Ueberschrift, unter
// der pruefe-betriebskosten.js den Befund melden muss.
//
// "code" ersetzt eine Zeichenkette in einer Kern-Datei, "daten" veraendert die
// Wissensbasis. Greift eine Ersetzung nicht mehr, ist das ein eigener Fehler und
// keine bestandene Pruefung - sonst wuerde eine veraltete Mutation stillschweigend
// zu einem gruenen Lauf fuehren.
const MUTATIONEN = [
  {
    name: "Zwoelf Monate werden zu dreizehn",
    erwartet: "Fristende nach §§ 187, 188, 193 BGB",
    datei: "frist.mjs",
    suchen: "export const FRIST_MONATE = 12;",
    ersetzen: "export const FRIST_MONATE = 13;",
  },
  {
    name: "Fristende um einen Tag verschoben (§ 187 Abs. 1 falsch angewendet)",
    erwartet: "Fristende nach §§ 187, 188, 193 BGB",
    datei: "frist.mjs",
    suchen: "const { iso: basisIso, abs3Angewendet } = plusMonate(startIso, FRIST_MONATE);",
    ersetzen: "const _roh = plusMonate(startIso, FRIST_MONATE);\n"
      + "  const basisIso = plusTage(_roh.iso, 1);\n"
      + "  const abs3Angewendet = _roh.abs3Angewendet;",
  },
  {
    name: "§ 193 kennt den Sonnabend nicht mehr",
    erwartet: "Fristende nach §§ 187, 188, 193 BGB",
    datei: "frist.mjs",
    suchen: "if (tag === SONNABEND)",
    ersetzen: "if (false && tag === SONNABEND)",
  },
  {
    name: "§ 193 kennt den Sonntag nicht mehr",
    erwartet: "Fristende nach §§ 187, 188, 193 BGB",
    datei: "frist.mjs",
    suchen: "if (tag === SONNTAG)",
    ersetzen: "if (false && tag === SONNTAG)",
  },
  {
    name: "§ 193 kennt keine Feiertage mehr",
    erwartet: "Fristende nach §§ 187, 188, 193 BGB",
    datei: "frist.mjs",
    suchen: "  if (name) {",
    ersetzen: "  if (false && name) {",
  },
  {
    name: "§ 188 Abs. 3 entfaellt (29.02. wird nicht auf den Monatsletzten gezogen)",
    erwartet: "Fristende nach §§ 187, 188, 193 BGB",
    datei: "datum.mjs",
    suchen: "const tag = Math.min(d.tag, letzter);",
    ersetzen: "const tag = d.tag;",
  },
  {
    name: "Osterformel um einen Tag verschoben",
    erwartet: "Osterdaten",
    datei: "feiertage.mjs",
    suchen: "const zaehler = h + l - 7 * m + 114;",
    ersetzen: "const zaehler = h + l - 7 * m + 115;",
  },
  {
    name: "Ein bundeseinheitlicher Feiertag verschwindet",
    erwartet: "Bundeseinheitliche Feiertage",
    datei: "feiertage.mjs",
    suchen: 'feiertage.set(`${jahr}-10-03`, "Tag der Deutschen Einheit");',
    ersetzen: "",
  },
  {
    name: "Der strittige Zwischenraum wird als versaeumt gemeldet",
    erwartet: "Bewertung des Zugangs - drei Zustaende",
    datei: "frist.mjs",
    suchen: 'if (ereignisIso <= frist.verschiebung.zielIso) return { status: "abhaengig", ereignisIso };',
    ersetzen: 'if (ereignisIso <= frist.verschiebung.zielIso) return { status: "versaeumt", ereignisIso };',
  },
  {
    name: "Nutzerangabe sieht aus wie eine Berechnung",
    erwartet: "Vom Nutzer bestaetigter Feiertag",
    datei: "frist.mjs",
    suchen: 'text: "gesetzlicher Feiertag (Angabe des Nutzers)",\n      herkunft: "nutzerangabe",',
    ersetzen: 'text: "gesetzlicher Feiertag (Angabe des Nutzers)",\n      herkunft: ABDECKUNG,',
  },
  {
    name: "Ein Rechenschritt zeigt auf einen Beleg, den es nicht gibt",
    erwartet: "Jeder Rechenschritt haengt an einem Beleg",
    datei: "frist.mjs",
    suchen: 'beleg: "bgb-193", bezeichnung: "§ 193 BGB",',
    ersetzen: 'beleg: "bgb-999", bezeichnung: "§ 193 BGB",',
  },
  {
    name: "Zitat weicht vom Gesetzestext ab",
    erwartet: "Jeder Rechenschritt haengt an einem Beleg",
    datei: "frist.mjs",
    suchen: 'satz: "Die Abrechnung ist dem Mieter spätestens bis zum Ablauf des zwölften Monats "',
    ersetzen: 'satz: "Die Abrechnung ist dem Mieter spätestens bis zum Ablauf des sechsten Monats "',
  },
  {
    name: "Tatbestand des § 193 weicht vom Gesetzestext ab",
    erwartet: "Jeder Rechenschritt haengt an einem Beleg",
    datei: "frist.mjs",
    suchen: 'paragraf193Voraussetzung: "eine Willenserklärung abzugeben oder eine Leistung zu bewirken",',
    ersetzen: 'paragraf193Voraussetzung: "eine Willenserklärung abzugeben oder eine Zahlung zu leisten",',
  },
  {
    name: "Ungueltiges Datum wird durchgelassen",
    erwartet: "Ungueltige Eingaben werden zurueckgewiesen",
    datei: "datum.mjs",
    suchen: "if (tag < 1 || tag > tageImMonat(jahr, monat)) return null;",
    ersetzen: "if (false) return null;",
  },
  {
    name: "Fehlende Belege halten die Ausgabe nicht mehr auf",
    erwartet: "Ohne Beleg wird keine Regel ausgegeben",
    datei: "frist.mjs",
    suchen: "  if (!geladen.ok) {",
    ersetzen: "  if (false) {",
  },
  // --- Teil B: Positionspruefung ---------------------------------------------
  {
    name: "Katalog verliert die zweistelligen Nummern",
    erwartet: "Katalog aus § 2 BetrKV geparst",
    datei: "katalog.mjs",
    suchen: "const treffer = /^(\\d{1,2})\\.\\s+(.*)$/.exec(zeile);",
    ersetzen: "const treffer = /^(\\d{1})\\.\\s+(.*)$/.exec(zeile);",
  },
  {
    name: "Schlusssatz faellt in Nr. 17 (falsche Fundstelle mit echtem Link)",
    erwartet: "Katalog aus § 2 BetrKV geparst",
    datei: "katalog.mjs",
    suchen: "      if (istOder(folgt) || istUnterpunkt(folgt) || istNummer(folgt)) { i++; continue; }",
    ersetzen: "      { i++; continue; }",
  },
  {
    name: "Ausschluss verliert seinen Vorrang vor dem Katalog",
    erwartet: "Zuordnung der Positionen",
    datei: "katalog.mjs",
    suchen: "        if (verdikt === null) {\n          verdikt = IMMER_MIT_VORBEHALT[item.nr] ? VERDIKT.MIETVERTRAG : VERDIKT.KATALOG;\n        }",
    ersetzen: "        verdikt = IMMER_MIT_VORBEHALT[item.nr] ? VERDIKT.MIETVERTRAG : VERDIKT.KATALOG;",
  },
  {
    name: "Nr. 14 verliert ihren Vorbehalt",
    erwartet: "Zuordnung der Positionen",
    datei: "katalog.mjs",
    suchen: "export const IMMER_MIT_VORBEHALT = {\n  14:",
    ersetzen: "export const IMMER_MIT_VORBEHALT = {\n  914:",
  },
  {
    name: "Aussortierte Zeile wird weggeworfen statt gemeldet",
    erwartet: "Nichts verschwindet",
    datei: "katalog.mjs",
    suchen: "      if (grund) { nichtGewertet.push({ rohzeile: rohzeile.trim(), grund }); continue; }",
    ersetzen: "      if (grund) { continue; }",
  },
  {
    name: "Filter greift vor der Zuordnung und verschluckt einen Treffer",
    erwartet: "Nichts verschwindet",
    datei: "katalog.mjs",
    suchen: "    if (zuordnung.verdikt === VERDIKT.UNBEKANNT && !alleZeilenPruefen) {",
    ersetzen: "    if (!alleZeilenPruefen) {",
  },
  {
    name: "Begriffsdatei: Suchbegriff zeigt auf die falsche Nummer",
    erwartet: "Zuordnung der Positionen",
    begriffe: (datei) => {
      // Umhaengen, nicht kopieren: Bleibt der Begriff in beiden Eintraegen, meldet
      // der Pruefer "Begriff in zwei Eintraegen" statt der falschen Zuordnung -
      // rot waere er dann zwar, aber an der falschen Stelle.
      datei["betrkv-2-1"].begriffe = datei["betrkv-2-1"].begriffe.filter((b) => b !== "Grundsteuer");
      datei["betrkv-2-3"].begriffe = [...datei["betrkv-2-3"].begriffe, "Grundsteuer"];
      return datei;
    },
  },
  {
    name: "Begriffsdatei: titel_pruefung ankert nicht mehr",
    erwartet: "Begriffsdatei",
    begriffe: (datei) => {
      datei["betrkv-2-14"].titel_pruefung = "Concierge";
      return datei;
    },
  },
  {
    name: "Bekannte Luecke wird zum normalen Katalogtreffer",
    erwartet: "Bekannte Luecken sind keine Fundstellen",
    begriffe: (datei) => {
      // Genau der Fehler, gegen den das fuenfte Urteil gebaut ist: Winterdienst
      // kaeme mit echtem Paragraphen und echtem Link zurueck, obwohl § 2 ihn
      // nicht nennt.
      datei["betrkv-2-8"].begriffe = [...datei["betrkv-2-8"].begriffe, "Winterdienst"];
      delete datei["luecke-winterdienst"];
      return datei;
    },
  },
  {
    name: "Luecken-Hinweis bekommt einen Quell-Link",
    erwartet: "Bekannte Luecken sind keine Fundstellen",
    datei: "katalog.mjs",
    suchen: "  return {\n    begriff,\n    praxisNr: eintrag.praxisNr,",
    ersetzen: "  return {\n    begriff,\n    quelle: \"https://www.gesetze-im-internet.de/betrkv/__2.html\",\n"
      + "    praxisNr: eintrag.praxisNr,",
  },
  {
    name: "Luecke verliert den Wettbewerb gegen den Katalogbegriff",
    erwartet: "Bekannte Luecken sind keine Fundstellen",
    datei: "katalog.mjs",
    suchen: "  const trefferKatalogUndLuecke = sucheBegriffe(gefaltet, [...katalogEintraege, ...lueckenEintraege]);",
    ersetzen: "  const trefferKatalogUndLuecke = sucheBegriffe(gefaltet, katalogEintraege)\n"
      + "    .concat(sucheBegriffe(gefaltet, lueckenEintraege));",
  },
  {
    name: "Wissensbasis: BetrKV § 2 hat keinen Quell-Link mehr",
    erwartet: "Belege fuer die Positionspruefung",
    daten: (korpus) => korpus.map((p) =>
      p.gesetz === "BetrKV" && p.paragraph === "§ 2" ? { ...p, quelle: "" } : p),
  },
  {
    name: "Wissensbasis: BetrKV § 1 fehlt",
    erwartet: "Belege fuer die Positionspruefung",
    daten: (korpus) => korpus.filter((p) => !(p.gesetz === "BetrKV" && p.paragraph === "§ 1")),
  },
  {
    name: "Wissensbasis: § 193 hat keinen Quell-Link mehr",
    erwartet: "Belege vorhanden und amtlich verlinkt",
    daten: (korpus) => korpus.map((p) =>
      p.gesetz === "BGB" && p.paragraph === "§ 193" ? { ...p, quelle: "" } : p),
  },
  {
    name: "Wissensbasis: § 187 fehlt",
    erwartet: "Belege vorhanden und amtlich verlinkt",
    daten: (korpus) => korpus.filter((p) => !(p.gesetz === "BGB" && p.paragraph === "§ 187")),
  },
];

// ---------------------------------------------------------------------------

function baueArbeitskopie(zielVerzeichnis) {
  const kernZiel = path.join(zielVerzeichnis, "kern");
  fs.mkdirSync(kernZiel, { recursive: true });
  for (const datei of KERN_DATEIEN) {
    fs.copyFileSync(path.join(KERN_QUELLE, datei), path.join(kernZiel, datei));
  }
  const gesetzeZiel = path.join(zielVerzeichnis, "gesetze.json");
  fs.copyFileSync(GESETZE_PFAD, gesetzeZiel);
  const begriffeZiel = path.join(zielVerzeichnis, "betriebskosten-begriffe.json");
  fs.copyFileSync(BEGRIFFE_PFAD, begriffeZiel);
  return { kernZiel, gesetzeZiel, begriffeZiel };
}

function fuehrePrueferAus(kernZiel, gesetzeZiel, begriffeZiel) {
  const lauf = spawnSync(process.execPath, [PRUEFER], {
    encoding: "utf8",
    env: {
      ...process.env,
      BETRIEBSKOSTEN_KERN: kernZiel,
      WISSENSBASIS_GESETZE: gesetzeZiel,
      BETRIEBSKOSTEN_BEGRIFFE: begriffeZiel,
    },
  });
  return { code: lauf.status, ausgabe: (lauf.stdout || "") + (lauf.stderr || "") };
}

function main() {
  const arbeitsWurzel = fs.mkdtempSync(path.join(os.tmpdir(), "inspectora-bk-"));
  let gescheitert = 0;

  console.log("");
  console.log("Negativkontrolle - jede Pruefung wird absichtlich gebrochen");
  console.log("=".repeat(62));
  console.log("");

  // Zuerst der Gegenbeweis in die andere Richtung: Auf einer unveraenderten Kopie
  // muss der Pruefer sauber durchlaufen. Sonst sagt eine gemeldete Mutation nichts -
  // dann meldet der Pruefer eben immer etwas.
  {
    const arbeit = path.join(arbeitsWurzel, "unveraendert");
    const { kernZiel, gesetzeZiel, begriffeZiel } = baueArbeitskopie(arbeit);
    const { code } = fuehrePrueferAus(kernZiel, gesetzeZiel, begriffeZiel);
    if (code === 0) {
      console.log("OK    Kontrolllauf ohne Mutation ist gruen");
    } else {
      console.log("FEHL  Kontrolllauf ohne Mutation ist bereits rot - "
        + "die Mutationen unten sagen dann nichts aus");
      gescheitert++;
    }
  }

  MUTATIONEN.forEach((mutation, index) => {
    const arbeit = path.join(arbeitsWurzel, "mutation-" + index);
    const { kernZiel, gesetzeZiel, begriffeZiel } = baueArbeitskopie(arbeit);

    if (mutation.datei) {
      const pfad = path.join(kernZiel, mutation.datei);
      const original = fs.readFileSync(pfad, "utf8");
      if (!original.includes(mutation.suchen)) {
        console.log(`FEHL  ${mutation.name}`);
        console.log(`      Die Mutation greift nicht mehr: gesuchter Text steht nicht `
          + `in ${mutation.datei}. Der Code hat sich geaendert, die Mutation nicht.`);
        gescheitert++;
        return;
      }
      fs.writeFileSync(pfad, original.replace(mutation.suchen, mutation.ersetzen), "utf8");
    }

    if (mutation.daten) {
      const korpus = JSON.parse(fs.readFileSync(gesetzeZiel, "utf8"));
      const veraendert = mutation.daten(korpus);
      if (JSON.stringify(veraendert) === JSON.stringify(korpus)) {
        console.log(`FEHL  ${mutation.name}`);
        console.log("      Die Mutation hat die Wissensbasis nicht veraendert.");
        gescheitert++;
        return;
      }
      fs.writeFileSync(gesetzeZiel, JSON.stringify(veraendert, null, 2), "utf8");
    }

    if (mutation.begriffe) {
      const original = fs.readFileSync(begriffeZiel, "utf8");
      const veraendert = mutation.begriffe(JSON.parse(original));
      if (JSON.stringify(veraendert) === JSON.stringify(JSON.parse(original))) {
        console.log(`FEHL  ${mutation.name}`);
        console.log("      Die Mutation hat die Begriffsdatei nicht veraendert.");
        gescheitert++;
        return;
      }
      fs.writeFileSync(begriffeZiel, JSON.stringify(veraendert, null, 2), "utf8");
    }

    const { code, ausgabe } = fuehrePrueferAus(kernZiel, gesetzeZiel, begriffeZiel);
    const gemeldet = ausgabe.includes("FEHL  " + mutation.erwartet);

    if (code !== 0 && gemeldet) {
      console.log(`OK    ${mutation.name}`);
      console.log(`      wurde gemeldet unter: ${mutation.erwartet}`);
    } else if (code !== 0 && !gemeldet) {
      // Der Pruefer ist rot, aber an der falschen Stelle. Das ist kein Erfolg: Die
      // Pruefung, um die es geht, hat den Fehler nicht gesehen.
      console.log(`FEHL  ${mutation.name}`);
      console.log(`      Der Pruefer meldet einen Fehler, aber NICHT unter `
        + `"${mutation.erwartet}".`);
      gescheitert++;
    } else {
      console.log(`FEHL  ${mutation.name}`);
      console.log("      Der eingebaute Fehler wurde NICHT gemeldet - "
        + "diese Pruefung greift ins Leere.");
      gescheitert++;
    }
  });

  fs.rmSync(arbeitsWurzel, { recursive: true, force: true });

  console.log("");
  console.log("=".repeat(62));
  console.log(`${MUTATIONEN.length - gescheitert + 1} von ${MUTATIONEN.length + 1} `
    + `Kontrollen bestanden, ${gescheitert} davon nicht.`);
  console.log("");

  process.exit(gescheitert === 0 ? 0 : 1);
}

main();
