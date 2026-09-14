// benchmark/generiere-fristen.mjs
// Erzeugt Benchmark-Fragen zu den Fristen des § 556 Abs. 3 BGB samt Antwort.
// Aufruf: node benchmark/generiere-fristen.mjs   -> schreibt benchmark/fragen-fristen.json
//
// Die Antworten werden NICHT von Hand geschrieben, sondern von kern/frist.mjs berechnet -
// demselben Code, den die Seite im Browser laedt und scripts/pruefe-betriebskosten.js
// testet. Dieses Skript rechnet selbst keine einzige Frist. Es waehlt nur Faelle aus,
// formuliert die Frage und legt den Rechenweg der Engine mit ins Ergebnis, damit ein
// Fremder den Schluessel nachpruefen kann, statt ihm glauben zu muessen.
//
// DETERMINISTISCH, KEIN ZUFALL: Zwei Laeufe auf demselben Stand liefern eine
// byte-gleiche fragen-fristen.json. Auch kein Zeitstempel in der Datei - sonst waere jeder
// Lauf "anders", und niemand koennte den veroeffentlichten Datensatz reproduzieren.
//
// WAS UEBERSPRUNGEN WIRD (und im Log gezaehlt, damit sichtbar ist, dass der Filter lief):
//   ok:false          - die Engine verweigert die Rechnung, weil ein Beleg fehlt
//   abhaengig         - das Ereignis liegt zwischen Fristende nach §§ 187/188 und dem
//                       nach § 193 verschobenen Datum. Ob § 193 auf § 556 Abs. 3
//                       anwendbar ist, ist strittig; der Benchmark entscheidet das nicht.
//   landesfeiertag    - zwischen Fristende und verschobenem Datum liegt ein Tag, der in
//                       mindestens einem Land Feiertag ist. Dort waere die Antwort je
//                       nach Bundesland eine andere.
//   lesart-28-02      - Start am 28.02. vor einem Schaltjahr. "Ablauf des zwoelften Monats"
//                       laesst hier zwei Ergebnisse zu: 28.02. nach §§ 187 Abs. 1, 188 Abs. 2
//                       oder 29.02. als Ablauf des zwoelften Monats. Lesart 1 ist herrschend,
//                       aber vier Fragen sind den Streit nicht wert - vorerst heraus, bis
//                       an einem Kommentar gegengeprueft. Offen in benchmark/PLAN.md.
//
// FRAGEFORM: Fallen basis und verschiebung zusammen, nennt die Frage keine Norm. Fallen
// sie auseinander, nennt sie § 193 BGB ausdruecklich - dann ist die Antwort reine
// Rechnung und keine Rechtsmeinung.

"use strict";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { pruefeFristen, belegeLaden } from "../kern/frist.mjs";
import { ostersonntag, NICHT_ABGEDECKT } from "../kern/feiertage.mjs";
import { zuIso, plusTage, tageImMonat, wochentag, formatiereDeutsch, istSchaltjahr } from "../kern/datum.mjs";

const LOG = "[generiere-fristen]";
const HIER = path.dirname(fileURLToPath(import.meta.url));
const GESETZE_PFAD = path.resolve(HIER, "../wissensbasis/gesetze.json");
const AUSGABE_PFAD = path.resolve(HIER, "fragen-fristen.json");

const JAHR_VON = 2019;
const JAHR_BIS = 2026;

// Ereignisse um die Frist herum, relativ zu basis (B) und verschiebung (T).
// Nur die Randtage: der Fristtag selbst und der Tag danach. Weit entfernte Tage sind
// bei einer Ja/Nein-Frage mit 50 % Ratequote wertlos und verwaessern die Kennzahl.
// Ohne Verschiebung ergibt das B (ja) und B+1 (nein). Mit Verschiebung liegen B+1 und T
// im "abhaengig"-Fenster und werden uebersprungen - uebrig bleiben B (ja) und T+1 (nein).
// Die beiden stehen trotzdem hier, damit die Zaehlung zeigt, dass der Filter greift.
const EREIGNIS_VERSATZ = [
  { von: "basis", tage: 0 },
  { von: "basis", tage: 1 },
  { von: "verschiebung", tage: 0 },
  { von: "verschiebung", tage: 1 },
];

// ---------------------------------------------------------------------------
// Landesfeiertage - NUR als Ausschlussfilter
// ---------------------------------------------------------------------------
//
// ACHTUNG - AUCH DIESE LISTE IST KEIN BELEG AUS DER WISSENSBASIS (wie kern/feiertage.mjs).
// Sie erzeugt aber keine einzige Antwort, sie entfernt nur Faelle. Ein Datum zu viel
// kostet einen gueltigen Fall. Ein Datum zu wenig liesse einen landesabhaengigen Fall
// durch - deshalb eher grosszuegig, und deshalb bleibt die Handpruefung der 20 Faelle.
//
// Die Schluessel muessen die Namen aus NICHT_ABGEDECKT abdecken. Nimmt kern/feiertage.mjs
// dort einen Namen auf, bricht dieses Skript ab, statt ihn stillschweigend zu ignorieren.
const FEST = (monat, tag) => (jahr) => [zuIso({ jahr, monat, tag })];

const LANDESFEIERTAGE = {
  "Heilige Drei Könige": FEST(1, 6),
  "Internationaler Frauentag": FEST(3, 8),
  "Fronleichnam": (jahr) => [plusTage(ostersonntag(jahr), 60)],
  "Mariä Himmelfahrt": FEST(8, 15),
  "Weltkindertag": FEST(9, 20),
  "Reformationstag": FEST(10, 31),
  "Allerheiligen": FEST(11, 1),
  // Mittwoch vor dem 23. November, also zwischen dem 16. und 22.
  "Buß- und Bettag": (jahr) => {
    for (let tag = 22; tag >= 16; tag--) {
      const iso = zuIso({ jahr, monat: 11, tag });
      if (wochentag(iso) === 3) return [iso];
    }
    return [];
  },
  // Zusaetzlich, grosszuegig: Stadtfeiertag Augsburg und einmalige Feiertage in Berlin
  // (Jahrestage des Kriegsendes). Nicht in NICHT_ABGEDECKT benannt, dort nur als
  // "einmalige Feiertage" erwaehnt.
  "Augsburger Hohes Friedensfest": FEST(8, 8),
  "Tag der Befreiung (Berlin, einmalig)": (jahr) =>
    (jahr === 2020 || jahr === 2025 ? [zuIso({ jahr, monat: 5, tag: 8 })] : []),
};

function landesfeiertageDesJahres(jahr) {
  const karte = new Map();
  for (const [name, regel] of Object.entries(LANDESFEIERTAGE)) {
    for (const iso of regel(jahr)) karte.set(iso, name);
  }
  return karte;
}

// Erster Landesfeiertag im Fenster [vonIso, bisIso], oder null.
function landesfeiertagImFenster(vonIso, bisIso) {
  for (let iso = vonIso; iso <= bisIso; iso = plusTage(iso, 1)) {
    const name = landesfeiertageDesJahres(Number(iso.slice(0, 4))).get(iso);
    if (name) return { iso, name };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Fragen bauen
// ---------------------------------------------------------------------------

const FRISTEN = {
  abrechnungsfrist: {
    eingabeFeld: "zeitraumEndeIso",
    ereignisFeld: "zugangIso",
    ereignisBezeichnung: "Zugang der Abrechnung beim Mieter",
    einleitung: (start) =>
      `Der Abrechnungszeitraum einer Betriebskostenabrechnung endete am ${formatiereDeutsch(start)}.`,
    datumsfrage: (mit193) =>
      `Bis wann muss die Abrechnung dem Mieter${mit193 ? " unter Berücksichtigung von § 193 BGB" : ""} `
      + "spätestens zugehen?",
    jaNeinFrage: (ereignis, mit193) =>
      `Die Abrechnung ging dem Mieter am ${formatiereDeutsch(ereignis)} zu. `
      + `War die Abrechnungsfrist${mit193 ? " unter Berücksichtigung von § 193 BGB" : ""} gewahrt?`,
  },
  einwendungsfrist: {
    eingabeFeld: "zugangIso",
    ereignisFeld: "heuteIso",
    ereignisBezeichnung: "Zugang der Einwendungen beim Vermieter",
    einleitung: (start) =>
      `Eine Betriebskostenabrechnung ging dem Mieter am ${formatiereDeutsch(start)} zu.`,
    datumsfrage: (mit193) =>
      `Bis wann müssen Einwendungen des Mieters gegen die Abrechnung dem Vermieter`
      + `${mit193 ? " unter Berücksichtigung von § 193 BGB" : ""} spätestens zugehen?`,
    jaNeinFrage: (ereignis, mit193) =>
      `Die Einwendungen des Mieters gingen dem Vermieter am ${formatiereDeutsch(ereignis)} zu. `
      + `War die Einwendungsfrist${mit193 ? " unter Berücksichtigung von § 193 BGB" : ""} gewahrt?`,
  },
};

// Februar-Randfaelle haben eine eigene Kategorie, und sie geht § 193 vor:
//   § 188 Abs. 3 BGB - Start am 29.02., den Tag gibt es im Zieljahr nicht -> 28.02.
//   28.02.-Fall      - Start am 28.02. vor einem Schaltjahr. Die Engine rechnet 28.02.
//                      (§ 188 Abs. 2), der Wortlaut "Ablauf des zwoelften Monats" liesse
//                      auch 29.02. zu. Diese Faelle werden derzeit uebersprungen
//                      (lesart-28-02). Der Zweig bleibt, damit sie nach einer Klaerung
//                      wieder in dieser Kategorie landen.
// Ob zusaetzlich § 193 greift, geht nicht verloren: basis und verschiebung stehen im
// rechenweg, und die Frage nennt § 193 trotzdem, sobald die beiden auseinanderfallen.
function istFebruarRandfall(f) {
  if (f.basis.abs3Angewendet) return true;
  return f.basis.iso.endsWith("-02-28") && istSchaltjahr(Number(f.basis.iso.slice(0, 4)));
}

function kategorie(frist, antwortTyp, f) {
  if (istFebruarRandfall(f)) return "frist-februar";
  if (f.verschiebung.verschoben) return "frist-193-verschiebung";
  const kurz = frist === "abrechnungsfrist" ? "abrechnung" : "einwendung";
  return `frist-${kurz}-${antwortTyp === "datum" ? "datum" : "gewahrt"}`;
}

function rechenweg(fristName, f, belege, ereignis) {
  return {
    frist: fristName,
    grundlage: f.grundlage,
    startereignis: { bezeichnung: f.startLabel, datum: f.startIso },
    basis: f.basis.iso,
    verschiebung: f.verschiebung.zielIso,
    abs3_angewendet: f.basis.abs3Angewendet,
    verschiebungsgruende: f.verschiebung.kette.map((k) => ({ datum: k.iso, grund: k.text })),
    ...(ereignis ? { ereignis, status: f.bewertung.status } : {}),
    schritte: f.schritte.map((s) => ({
      bezeichnung: s.bezeichnung,
      erklaerung: s.erklaerung,
      beleg_link: belege[s.beleg].quelle,
    })),
  };
}

// ---------------------------------------------------------------------------

function main() {
  const fehlendeRegeln = NICHT_ABGEDECKT.filter((n) => !(n in LANDESFEIERTAGE));
  if (fehlendeRegeln.length > 0) {
    console.error(`${LOG} Abbruch: Landesfeiertage ohne Filterregel: ${fehlendeRegeln.join(", ")}`);
    process.exit(1);
  }

  const korpus = JSON.parse(fs.readFileSync(GESETZE_PFAD, "utf8"));
  const geladen = belegeLaden(korpus);
  if (!geladen.ok) {
    console.error(`${LOG} Abbruch: Belege fehlen:`, geladen.fehlend);
    process.exit(1);
  }
  const beleg556 = geladen.belege["bgb-556"];

  const fragen = [];
  const uebersprungen = { "ok-false": 0, abhaengig: 0, landesfeiertag: 0, "lesart-28-02": 0 };
  const landesfeiertagFunde = new Map();
  const vergebeneIds = new Set();

  // Die ID wird aus dem Fall selbst gebildet, nicht aus einer laufenden Nummer: Frist,
  // Startdatum, Fragetyp und - bei Ja/Nein - Ereignisdatum. So bleibt eine ID stabil,
  // wenn ein Filter spaeter Faelle heraus- oder hineinnimmt. Mit laufender Nummer
  // zeigten Ergebnisdateien und Handpruefungen danach still auf die falsche Frage.
  const neueFrage = (startIso, felder) => {
    const r = felder.rechenweg;
    const id = [
      "frist",
      r.frist === "abrechnungsfrist" ? "abrechnung" : "einwendung",
      startIso,
      felder.antwort_typ,
      ...(r.ereignis ? [r.ereignis.datum] : []),
    ].join("-");
    if (vergebeneIds.has(id)) {
      console.error(`${LOG} Abbruch: ID doppelt vergeben: ${id}`);
      process.exit(1);
    }
    vergebeneIds.add(id);
    fragen.push({
      id,
      frage: felder.frage,
      antwort_typ: felder.antwort_typ,
      antwort: felder.antwort,
      beleg_gesetz: beleg556.gesetz,
      beleg_paragraph: beleg556.paragraph.replace(/^§\s*/, ""),
      beleg_link: beleg556.quelle,
      kategorie: felder.kategorie,
      rechenweg: felder.rechenweg,
    });
  };

  // Startereignisse: Monatsenden fuer die Abrechnungsfrist. Fuer die Einwendungsfrist
  // ein Zugang 30 bis 329 Tage nach dem Monatsende - fester Versatz statt Zufall, der
  // ueber alle Wochentage streut, damit § 193 regelmaessig greift.
  const roh = [];
  let index = 0;
  for (let jahr = JAHR_VON; jahr <= JAHR_BIS; jahr++) {
    for (let monat = 1; monat <= 12; monat++) {
      const monatsende = zuIso({ jahr, monat, tag: tageImMonat(jahr, monat) });
      roh.push({ frist: "abrechnungsfrist", startIso: monatsende });
      roh.push({ frist: "einwendungsfrist", startIso: plusTage(monatsende, 30 + ((index * 37) % 300)) });
      index++;
    }
  }

  // Februar-Randfaelle zusaetzlich als Zugang fuer die Einwendungsfrist: jeder 29.02.
  // und jeder 28.02. vor einem Schaltjahr. Als Ende des Abrechnungszeitraums sind sie
  // ueber die Monatsenden schon enthalten. Die 28.02.-Faelle werden unten wieder
  // uebersprungen (lesart-28-02) - sie stehen hier, damit die Zaehlung das zeigt.
  for (let jahr = JAHR_VON; jahr <= JAHR_BIS; jahr++) {
    if (istSchaltjahr(jahr)) roh.push({ frist: "einwendungsfrist", startIso: zuIso({ jahr, monat: 2, tag: 29 }) });
    if (istSchaltjahr(jahr + 1)) roh.push({ frist: "einwendungsfrist", startIso: zuIso({ jahr, monat: 2, tag: 28 }) });
  }

  // Doppelte Startereignisse entfernen (der feste Versatz kann einen Februar-Tag
  // treffen) und chronologisch sortieren, damit die IDs in Datumsreihenfolge laufen.
  const gesehen = new Set();
  const starts = roh
    .filter((s) => {
      const schluessel = `${s.startIso}|${s.frist}`;
      if (gesehen.has(schluessel)) return false;
      gesehen.add(schluessel);
      return true;
    })
    .sort((a, b) => (`${a.startIso}|${a.frist}` < `${b.startIso}|${b.frist}` ? -1 : 1));

  for (const { frist: fristName, startIso } of starts) {
    const def = FRISTEN[fristName];

    // Zwei Lesarten, zwei Ergebnisse - der Benchmark entscheidet das nicht (siehe Kopf).
    if (startIso.endsWith("-02-28") && istSchaltjahr(Number(startIso.slice(0, 4)) + 1)) {
      uebersprungen["lesart-28-02"]++;
      continue;
    }
    const ohneEreignis = pruefeFristen({ [def.eingabeFeld]: startIso }, korpus);
    if (!ohneEreignis.ok) { uebersprungen["ok-false"]++; continue; }

    const f = ohneEreignis[fristName];
    const B = f.basis.iso;
    const T = f.verschiebung.zielIso;

    const fund = landesfeiertagImFenster(B, T);
    if (fund) {
      uebersprungen.landesfeiertag++;
      landesfeiertagFunde.set(fund.name, (landesfeiertagFunde.get(fund.name) || 0) + 1);
      continue;
    }

    const mit193 = f.verschiebung.verschoben;

    neueFrage(startIso, {
      frage: `${def.einleitung(startIso)} ${def.datumsfrage(mit193)}`,
      antwort_typ: "datum",
      antwort: T,
      kategorie: kategorie(fristName, "datum", f),
      rechenweg: rechenweg(fristName, f, geladen.belege, null),
    });

    const ereignisse = [...new Set(EREIGNIS_VERSATZ.map((v) => plusTage(v.von === "basis" ? B : T, v.tage)))]
      .sort();

    for (const ereignisIso of ereignisse) {
      const e = pruefeFristen({ [def.eingabeFeld]: startIso, [def.ereignisFeld]: ereignisIso }, korpus);
      if (!e.ok) { uebersprungen["ok-false"]++; continue; }
      const fe = e[fristName];
      if (fe.bewertung.status === "abhaengig") { uebersprungen.abhaengig++; continue; }

      neueFrage(startIso, {
        frage: `${def.einleitung(startIso)} ${def.jaNeinFrage(ereignisIso, mit193)}`,
        antwort_typ: "ja-nein",
        antwort: fe.bewertung.status === "gewahrt" ? "ja" : "nein",
        kategorie: kategorie(fristName, "ja-nein", fe),
        rechenweg: rechenweg(fristName, fe, e.belege,
          { bezeichnung: def.ereignisBezeichnung, datum: ereignisIso }),
      });
    }
  }

  if (fragen.length === 0) {
    console.error(`${LOG} Abbruch: keine einzige Frage erzeugt.`);
    process.exit(1);
  }

  fs.writeFileSync(AUSGABE_PFAD, JSON.stringify(fragen, null, 2) + "\n", "utf8");

  const proKategorie = {};
  for (const q of fragen) proKategorie[q.kategorie] = (proKategorie[q.kategorie] || 0) + 1;

  console.log(`${LOG} ${fragen.length} Fragen geschrieben nach ${path.relative(process.cwd(), AUSGABE_PFAD)}`);
  console.log(`${LOG} Startereignisse: ${starts.length} (${JAHR_VON}-${JAHR_BIS})`);
  console.log(`${LOG} Je Kategorie:`, proKategorie);
  console.log(`${LOG} Uebersprungen:`, uebersprungen);
  console.log(`${LOG} Davon Landesfeiertage:`, Object.fromEntries(landesfeiertagFunde));
  console.log(`${LOG} Beleg: ${beleg556.gesetz} ${beleg556.paragraph}, Stand ${beleg556.stand || "unbekannt"}`);
}

main();
