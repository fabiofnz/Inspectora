// benchmark/generiere-umlage.mjs
// Erzeugt Benchmark-Fragen zur Umlagefaehigkeit nach der BetrKV samt Antwort.
// Aufruf: node benchmark/generiere-umlage.mjs   -> schreibt benchmark/fragen-umlage.json
//
// Gegenstueck zu generiere-fristen.mjs, gleiche Grundsaetze: Die Antwort wird nicht von
// Hand geschrieben, sondern von kern/katalog.mjs berechnet - ueber pruefePositionen, also
// denselben Weg, den die Seite im Browser geht. Deterministisch, kein Zeitstempel, IDs aus
// dem Inhalt.
//
// FRAGEFORM: "umlagefaehig", nicht "darf umlegen". Ob der Vermieter tatsaechlich umlegen
// darf, ist eine Frage des Mietvertrags, nicht der BetrKV - und den prueft die Engine nicht
// (die Seite sagt das selbst, betriebskosten-pruefer.js). Ein Modell, das "nur bei
// entsprechender Vereinbarung" antwortet, waere sonst richtiger als der Schluessel und
// wuerde als falsch gewertet. Die Frage ist fuer jeden Begriff wortgleich, nur der Begriff
// wechselt. Das wird unten geprueft, nicht vorausgesetzt.
//
// WAS UEBERSPRUNGEN WIRD - in dieser Reihenfolge geprueft, je Grund im Log gezaehlt:
//   ok-false             - die Engine verweigert (Beleg, Begriffsdatei oder Katalog fehlt)
//   luecke               - bekannte Luecke: Zuordnung stammt aus der Rechtsprechung
//   vorbehalt-nr-14-17   - Nummer steht in IMMER_MIT_VORBEHALT, aus dem Gesetz allein nicht
//                          zu entscheiden
//   einschraenkung-<art> - die Begriffsdatei markiert den Begriff (oder seine ganze Nummer)
//                          mit einer ausschliessenden Art, siehe AUSSCHLIESSENDE_ARTEN.
//                          Welche Begriffe das sind, steht in der Begriffsdatei, nicht hier.
//   vorbehalte           - das Ergebnis traegt einen Vorbehalt
//   nicht-zuordenbar     - die Engine kennt einen gelisteten Begriff nicht (Datenfehler)
//   mehrere-fundstellen  - mehr als eine Fundstelle, der Beleg waere nicht eindeutig
//   zuordnung-abweichend - die Engine nennt eine andere Nummer als die, unter der der Begriff
//                          gelistet ist. Liste (redaktionell) und Rechnung muessen
//                          uebereinstimmen, sonst ist der Beleg nicht belastbar.
//   begriff-verraet      - der Begriff selbst enthaelt "umlage" oder "betriebskost" und nimmt
//                          die Antwort vorweg

"use strict";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  pruefePositionen, belegeLaden, parseKatalog, parseAusschluesse, begriffeAufbereiten,
  falte, VERDIKT, IMMER_MIT_VORBEHALT,
} from "../kern/katalog.mjs";

const LOG = "[generiere-umlage]";
const HIER = path.dirname(fileURLToPath(import.meta.url));
const GESETZE_PFAD = path.resolve(HIER, "../wissensbasis/gesetze.json");
const BEGRIFFE_PFAD = path.resolve(HIER, "../wissensbasis/betriebskosten-begriffe.json");
const AUSGABE_PFAD = path.resolve(HIER, "fragen-umlage.json");

const QUELLE_PRAEFIX = "https://www.gesetze-im-internet.de/";

// Die einzige Stelle, an der die Frage formuliert wird.
const frageText = (begriff) =>
  `In einer Betriebskostenabrechnung für eine Mietwohnung steht die Position „${begriff}“. `
  + "Zählt diese Position nach der Betriebskostenverordnung zu den umlagefähigen Betriebskosten?";

const PLATZHALTER = "…";

// Woerter, mit denen ein Begriff die Antwort schon mitbringen wuerde.
const VERRAETERISCH = ["umlage", "betriebskost"];

// Arten aus dem Feld "einschraenkungen" der Begriffsdatei (Beschreibung dort unter
// "_einschraenkungen"). Hier stehen nur ARTEN, keine Begriffe: Welcher Begriff betroffen
// ist, entscheidet die Datei, damit ein Ausschluss beim naechsten Ausbau nicht vergessen
// wird. Ausschliessend ist, was eine unbedingte Ja/Nein-Antwort unmoeglich macht oder
// einen Beleg veroeffentlichen wuerde, den der Wortlaut nicht traegt.
const AUSSCHLIESSENDE_ARTEN = ["bedingung", "befristung", "gegenstand", "widerspruch-katalog", "beleg-analogie"];
// Bekannt, aber nicht ausschliessend: festgehaltene Entscheidungen. "umfang" kommt als
// Einschraenkung auf die Methodenseite.
const NICHT_AUSSCHLIESSENDE_ARTEN = ["umfang", "kostenart", "beleg-gedeckt"];
// Diese Arten gelten fuer die ganze Nummer und nennen keine Begriffe.
const ARTEN_FUER_GANZE_NUMMER = ["bedingung", "befristung"];

const ANTWORT = {
  [VERDIKT.KATALOG]: "ja",
  [VERDIKT.AUSGESCHLOSSEN]: "nein",
};

function kategorie(fundstelle) {
  if (fundstelle.art === "ausschluss") return "umlage-ausschluss";
  return fundstelle.treffer.art === "wortlaut" ? "umlage-katalog-wortlaut" : "umlage-katalog-suchbegriff";
}

function abbruch(text) {
  console.error(`${LOG} Abbruch: ${text}`);
  process.exit(1);
}

// Liest "einschraenkungen" direkt aus der Begriffsdatei - die Engine uebernimmt das Feld
// nicht. Unbekannte Arten und Begriffe, die nicht im Eintrag stehen, brechen ab: Eine neue
// Art darf nicht still als "nicht ausschliessend" durchgehen.
function artenJeBegriff(begriffsdatei, eintrag) {
  const roh = begriffsdatei[eintrag.schluessel]?.einschraenkungen;
  const arten = new Map(eintrag.begriffe.map((b) => [b, []]));
  if (roh === undefined) return arten;
  if (!Array.isArray(roh)) abbruch(`${eintrag.schluessel}: einschraenkungen ist keine Liste.`);
  for (const a of roh) {
    if (!AUSSCHLIESSENDE_ARTEN.includes(a?.art) && !NICHT_AUSSCHLIESSENDE_ARTEN.includes(a?.art)) {
      abbruch(`${eintrag.schluessel}: unbekannte Einschraenkungsart ${JSON.stringify(a?.art)}.`);
    }
    if (ARTEN_FUER_GANZE_NUMMER.includes(a.art)) {
      if (a.begriffe !== undefined) abbruch(`${eintrag.schluessel}: "${a.art}" gilt fuer die ganze Nummer und nennt keine Begriffe.`);
      for (const liste of arten.values()) liste.push(a.art);
      continue;
    }
    if (!Array.isArray(a.begriffe) || a.begriffe.length === 0) abbruch(`${eintrag.schluessel}: "${a.art}" ohne begriffe.`);
    for (const b of a.begriffe) {
      if (!arten.has(b)) abbruch(`${eintrag.schluessel}: "${b}" in einschraenkungen steht nicht in den Begriffen.`);
      arten.get(b).push(a.art);
    }
  }
  return arten;
}

// ---------------------------------------------------------------------------

function main() {
  const korpus = JSON.parse(fs.readFileSync(GESETZE_PFAD, "utf8"));
  const begriffsdatei = JSON.parse(fs.readFileSync(BEGRIFFE_PFAD, "utf8"));

  // Die Vorlage selbst darf keinen Hinweis auf die Fundstelle enthalten: keine Paragraphen,
  // keine Nummer, keinen Kurztitel aus § 2 oder § 1 Abs. 2. Die Kurztitel kommen aus dem
  // geparsten Gesetzestext, nicht aus einer Liste hier.
  const vorlage = frageText(PLATZHALTER);
  const geladen = belegeLaden(korpus);
  if (!geladen.ok) abbruch("Belege fehlen: " + JSON.stringify(geladen.fehlend));
  const kurztitel = [
    ...parseKatalog(geladen.belege["betrkv-2"].text).items.map((i) => i.kurztitel),
    ...parseAusschluesse(geladen.belege["betrkv-1"].text).posten.map((p) => p.kurztitel),
  ];
  if (/§|Nr\./.test(vorlage)) abbruch("Die Fragevorlage nennt einen Paragraphen oder eine Nummer.");
  const kurztitelInVorlage = kurztitel.filter((t) => falte(vorlage).includes(falte(t)));
  if (kurztitelInVorlage.length > 0) abbruch("Kurztitel in der Fragevorlage: " + kurztitelInVorlage.join(", "));

  const eintraege = begriffeAufbereiten(begriffsdatei);
  const fragen = [];
  const vergebeneIds = new Set();
  const uebersprungen = {
    "ok-false": 0, luecke: 0, "vorbehalt-nr-14-17": 0,
    ...Object.fromEntries(AUSSCHLIESSENDE_ARTEN.map((a) => [`einschraenkung-${a}`, 0])),
    vorbehalte: 0, "nicht-zuordenbar": 0,
    "mehrere-fundstellen": 0, "zuordnung-abweichend": 0, "begriff-verraet": 0,
  };
  const abweichungen = [];
  const eingeschraenkt = [];
  const mitUmfang = [];
  const ueberspringe = (grund) => { uebersprungen[grund]++; };

  for (const eintrag of eintraege) {
    const arten = eintrag.art === "luecke" ? null : artenJeBegriff(begriffsdatei, eintrag);
    for (const begriff of eintrag.begriffe) {
      const ergebnis = pruefePositionen({ text: begriff, alleZeilenPruefen: true }, korpus, begriffsdatei);
      if (!ergebnis.ok) { ueberspringe("ok-false"); continue; }

      if (eintrag.art === "luecke") { ueberspringe("luecke"); continue; }
      if (eintrag.art === "katalog" && IMMER_MIT_VORBEHALT[eintrag.nr]) { ueberspringe("vorbehalt-nr-14-17"); continue; }

      // Gezaehlt wird die erste ausschliessende Art in der Reihenfolge von
      // AUSSCHLIESSENDE_ARTEN; im Log stehen alle.
      const artenDesBegriffs = arten.get(begriff);
      const ausschliessend = AUSSCHLIESSENDE_ARTEN.filter((a) => artenDesBegriffs.includes(a));
      if (ausschliessend.length > 0) {
        ueberspringe(`einschraenkung-${ausschliessend[0]}`);
        eingeschraenkt.push(`${eintrag.schluessel.padEnd(12)} ${begriff} [${ausschliessend.join(", ")}]`);
        continue;
      }

      if (ergebnis.positionen.length !== 1) { ueberspringe("nicht-zuordenbar"); continue; }
      const position = ergebnis.positionen[0];

      // Die Frage nennt den Begriff so, wie er in der Datei steht. Haette die Engine davon
      // etwas abgeschnitten (trenneBetrag), wuerde sie eine andere Zeile bewerten als die,
      // nach der gefragt wird - das darf nicht still passieren.
      if (position.bezeichnung !== begriff.trim()) {
        abbruch(`Engine hat "${begriff}" als "${position.bezeichnung}" gelesen.`);
      }

      if (position.vorbehalte.length > 0) { ueberspringe("vorbehalte"); continue; }
      if (position.verdikt === VERDIKT.UNBEKANNT) { ueberspringe("nicht-zuordenbar"); continue; }
      if (position.fundstellen.length !== 1) { ueberspringe("mehrere-fundstellen"); continue; }

      const fundstelle = position.fundstellen[0];
      if (fundstelle.art !== eintrag.art || fundstelle.nr !== eintrag.nr) {
        ueberspringe("zuordnung-abweichend");
        abweichungen.push(`"${begriff}": gelistet unter ${eintrag.schluessel}, Engine nennt ${fundstelle.bezeichnung}`);
        continue;
      }

      const gefaltet = falte(begriff);
      if (VERRAETERISCH.some((w) => gefaltet.includes(w))) { ueberspringe("begriff-verraet"); continue; }

      const antwort = ANTWORT[position.verdikt];
      if (!antwort) abbruch(`Unerwartetes Verdikt "${position.verdikt}" bei "${begriff}".`);
      if (!fundstelle.quelle || !fundstelle.quelle.startsWith(QUELLE_PRAEFIX)) {
        abbruch(`Fundstelle ohne amtlichen Link bei "${begriff}".`);
      }

      // ID aus dem Begriff allein. Die Nummer gehoert bewusst nicht hinein: Wird ein Begriff
      // spaeter anders zugeordnet, bleibt es dieselbe Frage - nur die Antwort aendert sich.
      const id = "umlage-" + gefaltet.replace(/ /g, "-");
      if (vergebeneIds.has(id)) abbruch(`ID doppelt vergeben: ${id}`);
      vergebeneIds.add(id);

      if (artenDesBegriffs.includes("umfang")) mitUmfang.push(`${eintrag.schluessel.padEnd(12)} ${begriff}`);

      fragen.push({
        id,
        frage: frageText(begriff),
        antwort_typ: "ja-nein",
        antwort,
        beleg_gesetz: "BetrKV",
        beleg_paragraph: fundstelle.bezeichnung.replace(/^§\s*/, "").replace(/\s*BetrKV$/, ""),
        beleg_link: fundstelle.quelle,
        kategorie: kategorie(fundstelle),
        rechenweg: {
          begriff,
          eintrag: eintrag.schluessel,
          verdikt: position.verdikt,
          treffer: fundstelle.treffer.art,
          fundstelle: fundstelle.bezeichnung,
          kurztitel: fundstelle.kurztitel,
          gesetzestext: fundstelle.text,
          beleg_link: fundstelle.quelle,
        },
      });
    }
  }

  if (fragen.length === 0) abbruch("keine einzige Frage erzeugt.");

  // Wortgleichheit nachweisen: Ohne den Begriff muss jede Frage exakt die Vorlage sein.
  const abweichendeVorlage = fragen.filter(
    (f) => f.frage.replace(`„${f.rechenweg.begriff}“`, `„${PLATZHALTER}“`) !== vorlage);
  if (abweichendeVorlage.length > 0) {
    abbruch("Fragen weichen von der Vorlage ab: " + abweichendeVorlage.map((f) => f.id).join(", "));
  }

  fs.writeFileSync(AUSGABE_PFAD, JSON.stringify(fragen, null, 2) + "\n", "utf8");

  const zaehle = (fn) => fragen.reduce((m, f) => ((m[fn(f)] = (m[fn(f)] || 0) + 1), m), {});
  const ja = fragen.filter((f) => f.antwort === "ja").length;
  const ausschluss = fragen.filter((f) => f.kategorie === "umlage-ausschluss");

  console.log(`${LOG} ${fragen.length} Fragen geschrieben nach ${path.relative(process.cwd(), AUSGABE_PFAD)}`);
  console.log(`${LOG} Begriffe in der Datei: ${eintraege.reduce((n, e) => n + e.begriffe.length, 0)}`);
  console.log(`${LOG} Je Kategorie:`, zaehle((f) => f.kategorie));
  console.log(`${LOG} Antworten: ja ${ja} / nein ${fragen.length - ja} - Ja/Nein-Quote getrennt auswerten`);
  console.log(`${LOG} Uebersprungen:`, uebersprungen);
  for (const a of abweichungen) console.log(`${LOG}   zuordnung-abweichend: ${a}`);
  console.log(`${LOG} Wegen Einschraenkung uebersprungen (${eingeschraenkt.length}):`);
  for (const e of eingeschraenkt) console.log(`${LOG}   ${e}`);
  console.log(`${LOG} Enthalten, mit Einschraenkung "umfang" - gehoert auf die Methodenseite (${mitUmfang.length}):`);
  for (const e of mitUmfang) console.log(`${LOG}   ${e}`);
  console.log(`${LOG} Ausschluss-Fragen (§ 1 Abs. 2 BetrKV), separat auswerten: ${ausschluss.length}`);
  for (const f of ausschluss) console.log(`${LOG}   ${f.rechenweg.fundstelle.padEnd(24)} ${f.rechenweg.begriff}`);
}

main();
