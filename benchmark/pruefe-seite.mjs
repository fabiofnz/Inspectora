#!/usr/bin/env node
// benchmark/pruefe-seite.mjs
// Prueft mietrecht-benchmark.html gegen die Auswertungs- und Ergebnisdateien.
// Aufruf: npm run pruefe-seite   (Exit-Code != 0, sobald etwas nicht stimmt)
//
// Warum es dieses Skript gibt: Die Zahlen auf der Benchmark-Seite stehen hart im
// HTML. Eine Zahl, die im HTML steht und von keinem Test geprueft wird, laeuft beim
// naechsten Lauf lautlos auseinander - und eine falsche Zahl auf einer Seite, deren
// einziges Kapital Nachpruefbarkeit ist, faellt niemandem auf, weil sie genauso
// aussieht wie die richtige. Dieselbe Klasse Fehler wie ein Beleg, der amtlicher
// wirkt als er ist.
//
// Das Skript liest die Werte AUS DEN DATEN, nicht aus einer Liste im Skript. Es
// gibt keine erwarteten Zahlen hier drin. Kommen neue Laeufe dazu oder aendert sich
// eine Auswertung, rechnet das Skript neu und meldet jede Abweichung zur Seite.
//
// Geprueft wird:
//   1. Jede mit data-pruef markierte Zahl im HTML gegen den berechneten Wert.
//   2. Jeder berechnete Wert kommt im HTML auch vor - eine Zahl, die aus der Seite
//      verschwindet, ist genauso ein Fehler wie eine falsche.
//   3. Jede eingebettete Rohantwort (data-roh) Zeichen fuer Zeichen gegen die
//      Ergebnisdatei. Ein gekuerztes oder angepasstes Zitat waere der schwerere
//      Fehler von beiden.
//   4. Jede in der Downloadtabelle genannte Datei existiert und hat die angegebene
//      Groesse.
//
// Grenze: Geprueft wird nur, was mit data-pruef markiert ist. Ausgeschriebene
// Zahlen im Fliesstext sieht das Skript nicht. Deshalb sind alle abgeleiteten
// Zahlen markiert - auch die ausgeschriebenen ("Die 6 Fristenfehler"). Was
// bewusst unmarkiert bleibt, sind Konstanten der Methode und keine Messwerte:
// "zwei Befunde", "drei Laeufe je Serie", "vier Begriffe der Gruppe". Aendert
// sich eine davon, aendert sich die Methode - und dann wird die Seite ohnehin
// neu geschrieben, nicht nur nachgerechnet.
//
// Das Skript laeuft ohne Netzzugang und ohne Abhaengigkeiten.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HIER = path.dirname(fileURLToPath(import.meta.url));
const WURZEL = process.env.BENCHMARK_WURZEL || path.resolve(HIER, "..");
const ERGEBNISSE = path.join(WURZEL, "benchmark", "ergebnisse");
const SEITE = process.env.BENCHMARK_SEITE || path.join(WURZEL, "mietrecht-benchmark.html");

// --- Die Serien. Reihenfolge der Dateien = Lauf 1, 2, 3. -------------------
// Die alte umlage-Serie steht bewusst mit drin: Sie ist auf der Seite die
// Replikation, kein Archivmaterial - also wird sie auch mitgeprueft.
const SERIEN = {
  fristen: [
    "2026-09-15-claude-sonnet-5-fristen-voll",
    "2026-09-16-claude-sonnet-5-fristen-voll-lauf2",
    "2026-09-16-claude-sonnet-5-fristen-voll-lauf3",
  ],
  "umlage-neu": [
    "2026-09-17-claude-sonnet-5-umlage-voll-b309d7d2-lauf1",
    "2026-09-17-claude-sonnet-5-umlage-voll-b309d7d2-lauf2",
    "2026-09-17-claude-sonnet-5-umlage-voll-b309d7d2-lauf3",
  ],
  "umlage-alt": [
    "2026-09-15-claude-sonnet-5-umlage-voll",
    "2026-09-16-claude-sonnet-5-umlage-voll-lauf2",
    "2026-09-16-claude-sonnet-5-umlage-voll-lauf3",
  ],
};

// Die Begriffsgruppe des Befundes. Sie steht hier als Namensliste, weil sie eine
// inhaltliche Setzung ist und keine Rechnung - vorab benannt, nicht aus den Daten
// abgelesen. Genau deshalb darf sie nicht aus den Daten kommen.
const GRUPPE = {
  "umlage-ungeziefer": 9,
  "umlage-waeschepflege": 16,
  "umlage-schaedlingsbekaempfung": 9,
  "umlage-ungezieferbekaempfung": 9,
};
// Die uebrigen Begriffe des § 2 Nr. 9 - der stabile Nachbar, ohne den die Gruppe
// keine Gruppe waere.
const REINIGUNG = [
  "umlage-hausreinigung",
  "umlage-reinigung",
  "umlage-treppenhausreinigung",
  "umlage-gebaeudereinigung",
];

const DOWNLOADS = [
  ["benchmark/fragen-fristen.json", "546 Fristenfragen mit Schlüssel, Fundstelle und Rechenweg"],
  ["benchmark/fragen-umlage.json", "76 Umlagefragen mit Schlüssel, Fundstelle und Gesetzestext"],
  ...SERIEN.fristen.flatMap((d) => [
    [`benchmark/ergebnisse/${d}.json`, "Fristen, Rohantworten"],
    [`benchmark/ergebnisse/${d}-auswertung.json`, "Fristen, Auswertung"],
  ]),
  ...SERIEN["umlage-neu"].flatMap((d) => [
    [`benchmark/ergebnisse/${d}.json`, "Umlage (veröffentlichte Serie), Rohantworten"],
    [`benchmark/ergebnisse/${d}-auswertung.json`, "Umlage (veröffentlichte Serie), Auswertung"],
  ]),
  ...SERIEN["umlage-alt"].flatMap((d) => [
    [`benchmark/ergebnisse/${d}.json`, "Umlage (ältere Serie), Rohantworten"],
    [`benchmark/ergebnisse/${d}-auswertung.json`, "Umlage (ältere Serie), Auswertung"],
  ]),
  [
    "benchmark/ergebnisse/verworfen-schluessel-2026-09-15/2026-09-15-claude-sonnet-5-umlage-voll.json",
    "Verworfener Lauf, Rohantworten – zählt in keiner Serie mit",
  ],
];

// --- Hilfen ---------------------------------------------------------------

const lies = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const ausw = (name) => lies(path.join(ERGEBNISSE, name + "-auswertung.json"));
const ergeb = (name) => lies(path.join(ERGEBNISSE, name + ".json"));

const zahl = (n, stellen) => n.toFixed(stellen).replace(".", ",");
const prozent = (r, g, stellen = 1) => (g ? zahl((r / g) * 100, stellen) : "–");

// Datumswerte stehen in den Dateien als ISO, auf der Seite deutsch. Die Umrechnung
// gehoert hierher und nicht in den Seitenbau: Sonst prueft das Skript die Seite
// gegen ein anderes Format als das, in dem sie geschrieben ist, und meldet bei
// jedem Datum eine Abweichung, die keine ist.
const alsDatum = (s) =>
  /^\d{4}-\d{2}-\d{2}$/.test(s ?? "") ? s.slice(8, 10) + "." + s.slice(5, 7) + "." + s.slice(0, 4) : s;

// Spanne ueber die Laeufe. Gerechnet wird auf den Zahlen, formatiert erst danach -
// sonst entstuende die Spanne aus gerundeten Strings.
function spanne(werte, stellen = 1) {
  const min = Math.min(...werte);
  const max = Math.max(...werte);
  const f = (v) => zahl(v, stellen);
  return min === max ? `${f(min)} %` : `${f(min)}–${f(max)} %`;
}

const na = (o) =>
  Object.values(o.nicht_auswertbar ?? {}).reduce((a, b) => a + b, 0);

// --- Die Werte. Alles wird hier gerechnet, nichts steht fest. --------------

export function werteBerechnen() {
  const w = new Map();
  const setze = (k, v) => w.set(k, String(v));

  let thinkingBloecke = 0;
  let laeufeGesamt = 0;
  let laeufeAntworten = 0;

  for (const [serie, dateien] of Object.entries(SERIEN)) {
    const a = dateien.map(ausw);
    const e = dateien.map(ergeb);
    const einzel = a.map((j) => new Map(j.einzelwertung.map((x) => [x.frage_id, x])));
    const position = new Map(e[0].antworten.map((x, i) => [x.frage_id, i + 1]));
    const ids = [...einzel[0].keys()];

    setze(`${serie}.fragen`, ids.length);
    setze(`${serie}.fragendatei.sha8`, a[0].quelle.fragendatei_sha256.slice(0, 8));

    // Laufkopf
    a.forEach((j, i) => {
      const n = i + 1;
      setze(`lauf.${serie}.${n}.gestartet`, j.quelle.gestartet);
      setze(`lauf.${serie}.${n}.beendet`, j.quelle.beendet);
      setze(`lauf.${serie}.${n}.antworten`, j.zusammenfassung.antworten);
      setze(`lauf.${serie}.${n}.fehler`, j.zusammenfassung.status.fehler);
      setze(`lauf.${serie}.${n}.abgeschnitten`, j.zusammenfassung.status.abgeschnitten);
      setze(`lauf.${serie}.${n}.sha256`, j.quelle.ergebnisdatei_sha256);
      // Kurzform fuer die Herkunftszeile unter den Beispielen. Die vollen 64
      // Zeichen stehen in der Lauftabelle, die waagerecht scrollen kann - im
      // Fliesstext laufen sie auf einem Telefon ueber den Rand hinaus.
      setze(`lauf.${serie}.${n}.sha16`, j.quelle.ergebnisdatei_sha256.slice(0, 16));
      setze(`${serie}.na.l${n}`, na(j.zusammenfassung.status));
    });

    laeufeGesamt += dateien.length;
    e.forEach((j) => {
      laeufeAntworten += j.antworten.length;
      for (const antwort of j.antworten) {
        thinkingBloecke += (antwort.content ?? []).filter((c) => c.type === "thinking").length;
      }
    });

    // Quoten je Antworttyp, je Schluesselwert, je Kategorie
    for (const typ of Object.keys(a[0].quoten.nach_antworttyp)) {
      const reihe = a.map((j) => j.quoten.nach_antworttyp[typ]);
      setze(`${serie}.typ.${typ}.spanne`, spanne(reihe.map((r) => (r.richtig / r.gewertet) * 100)));
      reihe.forEach((r, i) => {
        setze(`${serie}.typ.${typ}.l${i + 1}`, `${r.richtig}/${r.gewertet}`);
        setze(`${serie}.typ.${typ}.l${i + 1}.prozent`, prozent(r.richtig, r.gewertet));
        setze(`${serie}.typ.${typ}.l${i + 1}.na`, na(r));
      });
      for (const schluessel of Object.keys(reihe[0].nach_schluessel ?? {})) {
        const s = reihe.map((r) => r.nach_schluessel[schluessel]);
        setze(
          `${serie}.typ.${typ}.${schluessel}.spanne`,
          spanne(s.map((r) => (r.richtig / r.gewertet) * 100))
        );
        s.forEach((r, i) => {
          setze(`${serie}.typ.${typ}.${schluessel}.l${i + 1}`, `${r.richtig}/${r.gewertet}`);
          setze(`${serie}.typ.${typ}.${schluessel}.l${i + 1}.na`, na(r));
        });
      }
    }

    for (let k = 0; k < a[0].quoten.nach_kategorie.length; k++) {
      const reihe = a.map((j) => j.quoten.nach_kategorie[k]);
      const schluessel = `${serie}.kat.${reihe[0].kategorie}.${reihe[0].antwort_typ}`;
      setze(`${schluessel}.spanne`, spanne(reihe.map((r) => (r.richtig / r.gewertet) * 100)));
      reihe.forEach((r, i) => {
        setze(`${schluessel}.l${i + 1}`, `${r.richtig}/${r.gewertet}`);
        setze(`${schluessel}.l${i + 1}.na`, na(r));
      });
    }

    // Falschquote ueber alle gewerteten Antworten. Zwei Nachkommastellen, weil
    // eine Stelle die Fristen-Werte auf 0,2 / 0,6 / 0,4 zusammenschiebt und die
    // Spanne damit breiter aussieht, als sie ist.
    const falschQuoten = a.map((j) => {
      const s = j.zusammenfassung.status;
      return (s.falsch / (s.richtig + s.falsch)) * 100;
    });
    setze(`${serie}.falschquote.spanne`, spanne(falschQuoten, 2));

    // Streuung der Fehler ueber die Laeufe
    const proFrage = ids.map((id) => ({
      id,
      position: position.get(id),
      schluessel: einzel[0].get(id).schluessel,
      laeufe: einzel.map((m) => m.get(id)),
    }));
    const falsch = proFrage.filter((f) => f.laeufe.some((l) => l.status === "falsch"));
    const unterschiedlich = proFrage.filter(
      (f) => new Set(f.laeufe.map((l) => `${l.status}|${l.modell_antwort}`)).size > 1
    );
    setze(`${serie}.falsch.fragen`, falsch.length);
    setze(
      `${serie}.falsch.antworten`,
      proFrage.reduce((a2, f) => a2 + f.laeufe.filter((l) => l.status === "falsch").length, 0)
    );
    setze(`${serie}.unterschiedlich`, unterschiedlich.length);
    setze(
      `${serie}.nur-format`,
      unterschiedlich.length - falsch.length
    );
    for (const f of falsch) {
      setze(`${serie}.fehler.${f.id}.position`, f.position);
      setze(`${serie}.fehler.${f.id}.schluessel`, alsDatum(f.schluessel));
      f.laeufe.forEach((l, i) => {
        setze(
          `${serie}.fehler.${f.id}.l${i + 1}`,
          l.status === "richtig"
            ? "richtig"
            : l.status === "falsch"
              ? alsDatum(l.modell_antwort)
              : "n. a."
        );
      });
    }

    // Gruppenrechnung nur fuer die beiden umlage-Serien
    if (serie.startsWith("umlage")) {
      const zaehle = (liste) => {
        let richtig = 0, falschN = 0, naN = 0;
        for (const id of liste) {
          for (const m of einzel) {
            const s = m.get(id).status;
            if (s === "richtig") richtig++;
            else if (s === "falsch") falschN++;
            else naN++;
          }
        }
        return { richtig, falsch: falschN, na: naN, antworten: liste.length * einzel.length };
      };
      const gruppeIds = Object.keys(GRUPPE);
      const restJa = ids.filter(
        (id) =>
          einzel[0].get(id).schluessel === "ja" &&
          !gruppeIds.includes(id) &&
          !REINIGUNG.includes(id)
      );
      const ausschluss = ids.filter((id) => einzel[0].get(id).schluessel === "nein");

      for (const [name, liste] of [
        ["gruppe", gruppeIds],
        ["reinigung", REINIGUNG],
        ["restja", restJa],
        ["ausschluss", ausschluss],
      ]) {
        const z = zaehle(liste);
        setze(`${serie}.${name}.fragen`, liste.length);
        setze(`${serie}.${name}.antworten`, z.antworten);
        setze(`${serie}.${name}.richtig`, z.richtig);
        setze(`${serie}.${name}.falsch`, z.falsch);
        setze(`${serie}.${name}.na`, z.na);
      }
      setze(
        `${serie}.rest.antworten`,
        (ids.length - gruppeIds.length) * einzel.length
      );

      for (const id of gruppeIds) {
        setze(`${serie}.gruppe.${id}.position`, position.get(id));
        einzel.forEach((m, i) => {
          const x = m.get(id);
          setze(
            `${serie}.gruppe.${id}.l${i + 1}`,
            x.status === "richtig" ? "richtig" : x.status === "falsch" ? "falsch" : "n. a."
          );
        });
      }

      // Zitatpruefung: Welche Nummern des § 2 BetrKV kommen in den Antworten der
      // Gruppe vor? Bewusst zwei getrennte Muster - die Paragraphenform und die
      // blosse Listenform ("16."). Die Listenform ist das schwaechere Signal und
      // wird deshalb getrennt ausgewiesen, nie dazugezaehlt.
      let inParagraphenform = 0, nurListenform = 0, garnicht = 0;
      for (const [id, nummer] of Object.entries(GRUPPE)) {
        for (const j of e) {
          const text = j.antworten.find((x) => x.frage_id === id).roh_antwort;
          const para = [
            ...text.matchAll(/§\s*2\s*(?:Abs\.\s*1\s*)?(?:S(?:atz)?\.?\s*1\s*)?Nr\.?\s*(\d{1,2})/g),
          ].map((m) => Number(m[1]));
          const liste = [...text.matchAll(/(?:^|\n)\s*\**(\d{1,2})\.\s/g)].map((m) => Number(m[1]));
          if (para.includes(nummer)) inParagraphenform++;
          else if (liste.includes(nummer)) nurListenform++;
          else garnicht++;
        }
      }
      setze(`${serie}.zitate.paragraphenform`, inParagraphenform);
      setze(`${serie}.zitate.listenform`, nurListenform);
      setze(`${serie}.zitate.ohne-schluesselnummer`, garnicht);
    }
  }

  setze("thinking.bloecke", thinkingBloecke);
  // Anzahl der Laeufe und Antworten ueber alle Serien. Steht markiert auf der
  // Seite, weil eine im Fliesstext ausgeschriebene Zahl ("sechs Laeufe") dem
  // Waechter sonst entgeht - genau dort stand vor dem 23.09.2026 eine falsche.
  setze("laeufe.gesamt", laeufeGesamt);
  setze("antworten.gesamt", laeufeAntworten.toLocaleString("de-DE"));

  const verworfen = lies(
    path.join(
      ERGEBNISSE,
      "verworfen-schluessel-2026-09-15",
      "2026-09-15-claude-sonnet-5-umlage-voll-auswertung.json"
    )
  );
  setze("verworfen.fragendatei.sha8", verworfen.quelle.fragendatei_sha256.slice(0, 8));
  setze("verworfen.fragen", verworfen.zusammenfassung.antworten);

  for (const [datei] of DOWNLOADS) {
    const p = path.join(WURZEL, datei);
    if (fs.existsSync(p)) {
      setze(`download.${datei}.groesse`, groesse(fs.statSync(p).size));
    }
  }

  return w;
}

export function groesse(bytes) {
  if (bytes >= 1024 * 1024) return zahl(bytes / (1024 * 1024), 1) + " MB";
  return Math.round(bytes / 1024) + " KB";
}

export function rohantwort(serie, frageId, lauf) {
  const datei = SERIEN[serie][lauf - 1];
  const j = ergeb(datei);
  const treffer = j.antworten.find((x) => x.frage_id === frageId);
  if (!treffer) throw new Error(`${frageId} nicht in ${datei}`);
  return treffer.roh_antwort;
}

export { SERIEN, GRUPPE, REINIGUNG, DOWNLOADS, ausw, ergeb, spanne, prozent, na, zahl, alsDatum, lies, WURZEL };

// --- Pruefung -------------------------------------------------------------

const entschaerfen = (s) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");

function pruefen() {
  const html = fs.readFileSync(SEITE, "utf8");
  const werte = werteBerechnen();
  let fehler = 0;
  const meckern = (m) => {
    console.error("FEHLER  " + m);
    fehler++;
  };

  // 1 · markierte Zahlen
  const gefunden = new Set();
  for (const m of html.matchAll(/data-pruef="([^"]+)"\s*>([\s\S]*?)<\/span>/g)) {
    const [, schluessel, roh] = m;
    gefunden.add(schluessel);
    const imHtml = entschaerfen(roh.replace(/<[^>]+>/g, "")).trim();
    if (!werte.has(schluessel)) {
      meckern(`data-pruef="${schluessel}" steht im HTML, wird aber nicht berechnet.`);
      continue;
    }
    const erwartet = werte.get(schluessel);
    if (imHtml !== erwartet) {
      meckern(`${schluessel}: Seite sagt "${imHtml}", Daten sagen "${erwartet}".`);
    }
  }

  // 2 · berechnete Werte, die auf der Seite fehlen. Nicht jeder berechnete Wert
  //     muss auf der Seite stehen - aber jeder, der einmal dort stand, soll nicht
  //     stillschweigend verschwinden. Deshalb nur eine Warnung, kein Fehler.
  const fehlende = [...werte.keys()].filter((k) => !gefunden.has(k));
  if (fehlende.length) {
    console.log(`Hinweis  ${fehlende.length} berechnete Werte stehen nicht auf der Seite.`);
  }

  // 3 · Rohantworten Zeichen fuer Zeichen
  let rohGeprueft = 0;
  for (const m of html.matchAll(/data-roh="([^"]+)"\s*>([\s\S]*?)<\/pre>/g)) {
    const [, kennung, roh] = m;
    const [serie, frageId, lauf] = kennung.split(":");
    let original;
    try {
      original = rohantwort(serie, frageId, Number(lauf));
    } catch (e) {
      meckern(`data-roh="${kennung}": ${e.message}`);
      continue;
    }
    if (entschaerfen(roh) !== original) {
      meckern(`data-roh="${kennung}": Zitat weicht von der Ergebnisdatei ab.`);
    } else {
      rohGeprueft++;
    }
  }

  // 4 · Downloaddateien
  let dateienGeprueft = 0;
  for (const [datei] of DOWNLOADS) {
    const p = path.join(WURZEL, datei);
    if (!fs.existsSync(p)) {
      meckern(`Downloaddatei fehlt: ${datei}`);
      continue;
    }
    if (!html.includes(datei)) {
      meckern(`Downloaddatei nicht auf der Seite verlinkt: ${datei}`);
      continue;
    }
    dateienGeprueft++;
  }

  console.log(
    `${gefunden.size} Zahlen, ${rohGeprueft} Rohantworten, ${dateienGeprueft} Dateien geprueft.`
  );
  if (fehler) {
    console.error(`\n${fehler} Abweichung(en). Die Seite stimmt nicht mehr mit den Daten ueberein.`);
    process.exit(1);
  }
  console.log("Seite und Daten stimmen ueberein.");
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  pruefen();
}
