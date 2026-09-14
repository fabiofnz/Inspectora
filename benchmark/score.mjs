// benchmark/score.mjs
// Wertet eine Ergebnisdatei von run.mjs gegen den Schluessel der zugehoerigen Fragendatei aus.
//
// Aufruf:
//   node benchmark/score.mjs --ergebnis benchmark/ergebnisse/2026-09-14-claude-sonnet-5.json
//
// Schreibt die Auswertung ins Terminal und daneben als <ergebnis>-auswertung.json.
// Eine vorhandene Auswertung wird nicht ueberschrieben.
//
// ---------------------------------------------------------------------------
// REGELN - rein mechanisch, kein Modell als Schiedsrichter, keine Auslegung
// ---------------------------------------------------------------------------
//   - Gelesen wird nur die letzte nicht-leere Zeile der Roh-Antwort. Entfernt wird nur
//     Leerraum am Zeilenanfang und -ende, sonst nichts.
//   - Datum: Die Zeile muss exakt "ANTWORT: TT.MM.JJJJ" sein. Verglichen wird exakt mit
//     dem Schluessel. Ja/Nein: exakt "ANTWORT: ja" oder "ANTWORT: nein".
//   - Nichts wird gerettet oder nachgebessert. Was nicht exakt passt, ist
//     nicht-auswertbar und wird nur genauer benannt:
//       format-abweichung   die letzte Zeile ist als Antwortzeile erkennbar, aber nicht
//                           exakt (Fettung, Grossschreibung, anderes Datumsformat, Text dahinter)
//       falsche-position    eine Antwortzeile steht weiter oben, die letzte Zeile ist keine
//       keine-schlusszeile  nirgends eine Antwortzeile
//     "Erkennbar" heisst: das Wort ANTWORT (Gross-/Kleinschreibung egal), danach nur
//     Nicht-Buchstaben bis zu einem Doppelpunkt, dahinter bei Datumsfragen eine Ziffer,
//     bei Ja/Nein-Fragen das Wort ja oder nein. Die Erkennung entscheidet nur den
//     Untergrund, nie richtig oder falsch.
//   - Vorrang: API-Fehler, dann Ablehnung (stop_reason "refusal"), dann abgeschnitten,
//     erst dann wird die Schlusszeile gelesen.
//   - Quote = richtig / (richtig + falsch). Nicht-auswertbar, abgeschnitten, fehler und
//     abgelehnt fliessen nicht ein und stehen immer als Anzahl daneben.
//   - Quoten nur je Antworttyp und je Kategorie x Antworttyp, nie gemischt. Ja/Nein
//     zusaetzlich getrennt nach Schluessel-Antwort (ja / nein).
//
// ---------------------------------------------------------------------------
// VOR DER AUSWERTUNG - jede Abweichung bricht ab
// ---------------------------------------------------------------------------
//   - Die Fragendatei kommt aus herkunft.fragendatei der Ergebnisdatei, nicht vom Aufrufer.
//     Ihr SHA-256 muss dem gespeicherten entsprechen - sonst passt der Schluessel
//     womoeglich nicht mehr zu den gestellten Fragen.
//   - Jede frage_id existiert genau einmal in der Fragendatei und kommt im Lauf nur einmal vor.
//   - Jede gesendete Nachricht ist exakt Frage + Leerzeile + Vorlage ihres Antworttyps.
//   - Jeder Schluessel hat das Format seines Antworttyps.
//
// BENCHMARK_WURZEL (optional) setzt das Verzeichnis, gegen das herkunft.fragendatei
// aufgeloest wird. Nur fuer score-negativkontrolle.mjs; Standard ist das Repo.

"use strict";

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const LOG = "[score]";
const HIER = path.dirname(fileURLToPath(import.meta.url));
const WURZEL = process.env.BENCHMARK_WURZEL
  ? path.resolve(process.env.BENCHMARK_WURZEL)
  : path.resolve(HIER, "..");

const STRENG = {
  "datum": /^ANTWORT: (\d{2})\.(\d{2})\.(\d{4})$/,
  "ja-nein": /^ANTWORT: (ja|nein)$/,
};

const MARKE = String.raw`(?<!\p{L})antwort[^\p{L}\p{N}]*:`;
const ERKENNBAR = {
  "datum": new RegExp(MARKE + String.raw`.*\p{N}`, "iu"),
  "ja-nein": new RegExp(MARKE + String.raw`.*(?<!\p{L})(?:ja|nein)(?!\p{L})`, "iu"),
};

const SCHLUESSEL_FORMAT = {
  "datum": /^\d{4}-\d{2}-\d{2}$/,
  "ja-nein": /^(ja|nein)$/,
};

const UNTERGRUENDE = ["format-abweichung", "keine-schlusszeile", "falsche-position"];

const REGELN = {
  gelesen: "letzte nicht-leere Zeile der Roh-Antwort, nur Leerraum am Zeilenanfang und -ende entfernt",
  streng: { "datum": STRENG["datum"].source, "ja-nein": STRENG["ja-nein"].source },
  erkennbar: { "datum": ERKENNBAR["datum"].source, "ja-nein": ERKENNBAR["ja-nein"].source },
  vorrang: ["fehler", "abgelehnt", "abgeschnitten", "Schlusszeile"],
  quote: "richtig / (richtig + falsch); nicht-auswertbar, abgeschnitten, fehler, abgelehnt fliessen nicht ein",
  nicht_auswertbar: {
    "format-abweichung": "letzte Zeile als Antwortzeile erkennbar, aber nicht exakt",
    "falsche-position": "Antwortzeile vorhanden, aber nicht die letzte Zeile",
    "keine-schlusszeile": "keine Antwortzeile in der gesamten Antwort",
  },
};

// ---------------------------------------------------------------------------
// Bewertung einer Antwort
// ---------------------------------------------------------------------------

function bewerte(eintrag, frage) {
  if (eintrag.fehler) return { status: "fehler" };
  if (eintrag.stop_reason === "refusal") return { status: "abgelehnt" };
  if (eintrag.abgeschnitten === true || eintrag.stop_reason === "max_tokens") {
    return { status: "abgeschnitten" };
  }

  const typ = frage.antwort_typ;
  const zeilen = String(eintrag.roh_antwort ?? "")
    .split(/\r?\n/)
    .map((z) => z.trim())
    .filter((z) => z !== "");
  const letzte = zeilen.length > 0 ? zeilen[zeilen.length - 1] : null;

  const treffer = letzte === null ? null : letzte.match(STRENG[typ]);
  if (treffer) {
    const modellAntwort = typ === "datum" ? `${treffer[3]}-${treffer[2]}-${treffer[1]}` : treffer[1];
    return {
      status: modellAntwort === frage.antwort ? "richtig" : "falsch",
      schlusszeile: letzte,
      modell_antwort: modellAntwort,
    };
  }

  if (letzte !== null && ERKENNBAR[typ].test(letzte)) {
    return { status: "nicht-auswertbar", grund: "format-abweichung", schlusszeile: letzte };
  }

  for (let i = zeilen.length - 2; i >= 0; i--) {
    if (STRENG[typ].test(zeilen[i]) || ERKENNBAR[typ].test(zeilen[i])) {
      return {
        status: "nicht-auswertbar",
        grund: "falsche-position",
        schlusszeile: letzte,
        antwortzeile: zeilen[i],
        zeilen_vor_ende: zeilen.length - 1 - i,
      };
    }
  }

  return { status: "nicht-auswertbar", grund: "keine-schlusszeile", schlusszeile: letzte };
}

// ---------------------------------------------------------------------------
// Zaehlen
// ---------------------------------------------------------------------------

function leereZeile() {
  return {
    gewertet: 0,
    richtig: 0,
    falsch: 0,
    quote_richtig: null,
    nicht_auswertbar: Object.fromEntries(UNTERGRUENDE.map((u) => [u, 0])),
    abgeschnitten: 0,
    fehler: 0,
    abgelehnt: 0,
  };
}

function zaehle(zeile, bewertung) {
  if (bewertung.status === "nicht-auswertbar") zeile.nicht_auswertbar[bewertung.grund]++;
  else zeile[bewertung.status]++;
  zeile.gewertet = zeile.richtig + zeile.falsch;
  zeile.quote_richtig = zeile.gewertet > 0 ? zeile.richtig / zeile.gewertet : null;
}

function mitSchluesselSplit(typ) {
  const zeile = leereZeile();
  if (typ === "ja-nein") zeile.nach_schluessel = { ja: leereZeile(), nein: leereZeile() };
  return zeile;
}

// ---------------------------------------------------------------------------
// Hilfen
// ---------------------------------------------------------------------------

function argument(name) {
  const i = process.argv.indexOf(name);
  return i === -1 ? null : (process.argv[i + 1] || null);
}

function abbruch(text) {
  console.error(`${LOG} Abbruch: ${text}`);
  process.exit(1);
}

function gitCommit() {
  try {
    return execSync("git rev-parse HEAD", { cwd: HIER, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
}

const relativ = (p) => path.relative(WURZEL, p).replace(/\\/g, "/");
const sha256 = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const alsDeutschesDatum = (iso) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;
const zeigeSchluessel = (frage) => (frage.antwort_typ === "datum"
  ? `${alsDeutschesDatum(frage.antwort)} (${frage.antwort})`
  : frage.antwort);

function quoteText(z) {
  const teile = [];
  teile.push(z.gewertet > 0
    ? `${z.richtig}/${z.gewertet} richtig (${(z.quote_richtig * 100).toFixed(1).replace(".", ",")} %)`
    : "keine gewerteten Antworten");
  const nicht = [
    ...UNTERGRUENDE.filter((u) => z.nicht_auswertbar[u] > 0).map((u) => `${z.nicht_auswertbar[u]} ${u}`),
    ...["abgeschnitten", "fehler", "abgelehnt"].filter((s) => z[s] > 0).map((s) => `${z[s]} ${s}`),
  ];
  if (nicht.length > 0) teile.push(`nicht gewertet: ${nicht.join(", ")}`);
  return teile.join("   ");
}

// Gibt den rechenweg generisch aus - Fristen- und Umlagefragen haben verschiedene Felder.
function formatiere(wert, einzug) {
  const zeilen = [];
  const skalar = (v) => (v !== null && typeof v === "object" ? JSON.stringify(v) : String(v));
  for (const [k, v] of Object.entries(wert)) {
    if (v === null || typeof v !== "object") {
      zeilen.push(`${einzug}${k}: ${v}`);
    } else if (Array.isArray(v)) {
      if (v.length === 0) { zeilen.push(`${einzug}${k}: (keine)`); continue; }
      zeilen.push(`${einzug}${k}:`);
      for (const e of v) {
        zeilen.push(`${einzug}  - ${e !== null && typeof e === "object" ? Object.values(e).map(skalar).join(" | ") : e}`);
      }
    } else {
      zeilen.push(`${einzug}${k}:`);
      zeilen.push(...formatiere(v, einzug + "  "));
    }
  }
  return zeilen;
}

// ---------------------------------------------------------------------------

function main() {
  const ergebnisArg = argument("--ergebnis");
  if (!ergebnisArg) abbruch("--ergebnis fehlt.");
  const ergebnisPfad = path.resolve(ergebnisArg);
  if (ergebnisPfad.endsWith("-auswertung.json")) abbruch("Das ist bereits eine Auswertung, keine Ergebnisdatei.");
  if (!fs.existsSync(ergebnisPfad)) abbruch(`${ergebnisArg} existiert nicht.`);

  const zielPfad = ergebnisPfad.replace(/\.json$/, "") + "-auswertung.json";
  if (fs.existsSync(zielPfad)) abbruch(`${zielPfad} existiert bereits - wird nicht ueberschrieben.`);

  const ergebnisRoh = fs.readFileSync(ergebnisPfad);
  const ergebnis = JSON.parse(ergebnisRoh.toString("utf8"));

  // --- Eingaben pruefen -----------------------------------------------------
  if (!Array.isArray(ergebnis.antworten)) abbruch("Ergebnisdatei ohne antworten-Liste.");
  const herkunft = ergebnis.herkunft ?? {};
  if (typeof herkunft.fragendatei !== "string" || typeof herkunft.fragendatei_sha256 !== "string") {
    abbruch("Ergebnisdatei ohne herkunft.fragendatei / herkunft.fragendatei_sha256.");
  }
  if (!ergebnis.vorlagen || typeof ergebnis.vorlagen !== "object") abbruch("Ergebnisdatei ohne vorlagen.");

  const fragenPfad = path.resolve(WURZEL, herkunft.fragendatei);
  if (!fs.existsSync(fragenPfad)) abbruch(`Fragendatei ${herkunft.fragendatei} existiert nicht.`);
  const fragenRoh = fs.readFileSync(fragenPfad);
  const fragenHash = sha256(fragenRoh);
  if (fragenHash !== herkunft.fragendatei_sha256) {
    abbruch(`SHA-256 der Fragendatei weicht ab. Im Lauf: ${herkunft.fragendatei_sha256}, jetzt: ${fragenHash}. `
      + "Die Fragendatei wurde seit dem Lauf veraendert - der Schluessel passt womoeglich nicht mehr.");
  }

  const fragen = JSON.parse(fragenRoh.toString("utf8"));
  const fragenNachId = new Map();
  for (const f of fragen) {
    if (fragenNachId.has(f.id)) abbruch(`Fragendatei enthaelt ${f.id} doppelt.`);
    fragenNachId.set(f.id, f);
  }

  const probleme = [];
  const gesehen = new Set();
  for (const a of ergebnis.antworten) {
    const f = fragenNachId.get(a.frage_id);
    if (!f) { probleme.push(`${a.frage_id}: nicht in der Fragendatei`); continue; }
    if (gesehen.has(a.frage_id)) probleme.push(`${a.frage_id}: im Lauf doppelt`);
    gesehen.add(a.frage_id);
    if (!STRENG[f.antwort_typ]) { probleme.push(`${f.id}: unbekannter Antworttyp ${f.antwort_typ}`); continue; }
    if (typeof ergebnis.vorlagen[f.antwort_typ] !== "string") {
      probleme.push(`${f.id}: keine Vorlage fuer ${f.antwort_typ} in der Ergebnisdatei`);
    } else if (a.nachricht !== `${f.frage}\n\n${ergebnis.vorlagen[f.antwort_typ]}`) {
      probleme.push(`${f.id}: gesendete Nachricht ist nicht exakt Frage + Vorlage`);
    }
    if (typeof f.antwort !== "string" || !SCHLUESSEL_FORMAT[f.antwort_typ].test(f.antwort)) {
      probleme.push(`${f.id}: Schluessel "${f.antwort}" hat nicht das Format von ${f.antwort_typ}`);
    }
  }
  if (probleme.length > 0) abbruch("Eingabepruefung: " + probleme.join(" | "));

  // --- Bewerten --------------------------------------------------------------
  const einzel = ergebnis.antworten.map((a) => {
    const f = fragenNachId.get(a.frage_id);
    return { eintrag: a, frage: f, bewertung: bewerte(a, f) };
  });

  const status = { richtig: 0, falsch: 0, nicht_auswertbar: Object.fromEntries(UNTERGRUENDE.map((u) => [u, 0])),
    abgeschnitten: 0, fehler: 0, abgelehnt: 0 };
  const nachTyp = {};
  const nachKategorie = {};
  for (const { frage: f, bewertung: b } of einzel) {
    if (b.status === "nicht-auswertbar") status.nicht_auswertbar[b.grund]++;
    else status[b.status]++;

    nachTyp[f.antwort_typ] ??= mitSchluesselSplit(f.antwort_typ);
    const kategorieSchluessel = `${f.kategorie} | ${f.antwort_typ}`;
    nachKategorie[kategorieSchluessel] ??= { kategorie: f.kategorie, antwort_typ: f.antwort_typ,
      ...mitSchluesselSplit(f.antwort_typ) };
    for (const zeile of [nachTyp[f.antwort_typ], nachKategorie[kategorieSchluessel]]) {
      zaehle(zeile, b);
      if (zeile.nach_schluessel) zaehle(zeile.nach_schluessel[f.antwort], b);
    }
  }

  const geplant = Array.isArray(ergebnis.auswahl?.kontingent)
    ? ergebnis.auswahl.kontingent.reduce((s, k) => s + k.anzahl, 0)
    : null;

  const liste = (filter, felder) => einzel.filter(filter).map(felder);
  const falscheAntworten = liste((e) => e.bewertung.status === "falsch", ({ eintrag: a, frage: f, bewertung: b }) => ({
    frage_id: f.id, kategorie: f.kategorie, antwort_typ: f.antwort_typ, frage: f.frage,
    schlusszeile: b.schlusszeile, modell_antwort: b.modell_antwort, schluessel: f.antwort,
    beleg_gesetz: f.beleg_gesetz, beleg_paragraph: f.beleg_paragraph, beleg_link: f.beleg_link,
    rechenweg: f.rechenweg, roh_antwort: a.roh_antwort,
  }));
  const nichtAuswertbar = Object.fromEntries(UNTERGRUENDE.map((u) => [u, liste(
    (e) => e.bewertung.grund === u,
    ({ eintrag: a, frage: f, bewertung: b }) => ({
      frage_id: f.id, kategorie: f.kategorie, antwort_typ: f.antwort_typ, frage: f.frage,
      schlusszeile: b.schlusszeile,
      ...(b.antwortzeile !== undefined ? { antwortzeile: b.antwortzeile, zeilen_vor_ende: b.zeilen_vor_ende } : {}),
      schluessel: f.antwort, roh_antwort: a.roh_antwort,
    }),
  )]));
  const apiFehler = liste((e) => e.bewertung.status === "fehler",
    ({ eintrag: a }) => ({ frage_id: a.frage_id, fehler: a.fehler }));
  const abgelehnt = liste((e) => e.bewertung.status === "abgelehnt",
    ({ eintrag: a }) => ({ frage_id: a.frage_id, stop_reason: a.stop_reason, stop_details: a.stop_details ?? null }));
  const abgeschnitten = liste((e) => e.bewertung.status === "abgeschnitten",
    ({ eintrag: a }) => ({ frage_id: a.frage_id, stop_reason: a.stop_reason }));

  const auswertung = {
    auswertung: {
      erstellt: new Date().toISOString(),
      scorer: "benchmark/score.mjs",
      git_commit: gitCommit(),
      regeln: REGELN,
    },
    quelle: {
      ergebnisdatei: relativ(ergebnisPfad),
      ergebnisdatei_sha256: sha256(ergebnisRoh),
      fragendatei: herkunft.fragendatei,
      fragendatei_sha256: fragenHash,
      lauf: ergebnis.lauf ?? null,
      lauf_status: ergebnis.status ?? null,
      gestartet: ergebnis.gestartet ?? null,
      beendet: ergebnis.beendet ?? null,
      modell: ergebnis.modell ?? null,
      konfiguration: ergebnis.konfiguration ?? null,
    },
    zusammenfassung: { antworten: einzel.length, geplant, status },
    quoten: {
      nach_antworttyp: nachTyp,
      nach_kategorie: Object.values(nachKategorie),
    },
    falsche_antworten: falscheAntworten,
    nicht_auswertbar: nichtAuswertbar,
    api_fehler: apiFehler,
    abgelehnt,
    abgeschnitten,
    einzelwertung: einzel.map(({ frage: f, bewertung: b }) => ({
      frage_id: f.id, kategorie: f.kategorie, antwort_typ: f.antwort_typ,
      status: b.status, grund: b.grund ?? null,
      schlusszeile: b.schlusszeile ?? null, modell_antwort: b.modell_antwort ?? null, schluessel: f.antwort,
    })),
  };

  // --- Terminal --------------------------------------------------------------
  const out = [];
  const modellName = ergebnis.modell?.info?.display_name ?? "?";
  out.push(`${LOG} Ergebnisdatei: ${relativ(ergebnisPfad)}`);
  out.push(`${LOG} Modell: ${ergebnis.modell?.angefragt} (${modellName}), Lauf: ${ergebnis.lauf}, Status: ${ergebnis.status}`);
  if (ergebnis.status !== "abgeschlossen") {
    out.push(`${LOG} WARNUNG: Der Lauf ist nicht abgeschlossen (Status "${ergebnis.status}"). Ausgewertet wird nur, was vorliegt.`);
  }
  if (geplant !== null && geplant !== einzel.length) {
    out.push(`${LOG} WARNUNG: ${geplant} Fragen geplant, ${einzel.length} Antworten in der Datei.`);
  }
  out.push(`${LOG} Fragendatei: ${herkunft.fragendatei}, SHA-256 stimmt mit dem Lauf ueberein`);
  out.push(`${LOG} Eingabepruefung: ${einzel.length} Nachrichten exakt Frage + Vorlage, alle Schluessel im Format`);

  out.push("", "== Status (Anzahl, keine Quote) ==");
  out.push(`  richtig ${status.richtig} | falsch ${status.falsch} | abgeschnitten ${status.abgeschnitten} `
    + `| fehler ${status.fehler} | abgelehnt ${status.abgelehnt}`);
  out.push(`  nicht-auswertbar: ${UNTERGRUENDE.map((u) => `${u} ${status.nicht_auswertbar[u]}`).join(" | ")}`);

  out.push("", "== Quote nach Antworttyp (nie gemischt) ==");
  for (const [typ, z] of Object.entries(nachTyp)) {
    out.push(`  ${typ.padEnd(8)} ${quoteText(z)}`);
    if (z.nach_schluessel) {
      for (const s of ["ja", "nein"]) out.push(`    Schluessel ${s.padEnd(4)} ${quoteText(z.nach_schluessel[s])}`);
    }
  }

  out.push("", "== Quote nach Kategorie ==");
  for (const z of Object.values(nachKategorie)) {
    out.push(`  ${z.kategorie} | ${z.antwort_typ}`);
    out.push(`    ${quoteText(z)}`);
    if (z.nach_schluessel) {
      for (const s of ["ja", "nein"]) out.push(`    Schluessel ${s.padEnd(4)} ${quoteText(z.nach_schluessel[s])}`);
    }
  }

  out.push("", `== Falsche Antworten (${falscheAntworten.length}) ==`);
  for (const e of falscheAntworten) {
    const f = fragenNachId.get(e.frage_id);
    out.push("", `--- ${e.frage_id}`);
    out.push(`  Kategorie: ${e.kategorie} | Antworttyp: ${e.antwort_typ}`);
    out.push(`  Frage: ${e.frage}`);
    out.push(`  Modell (Schlusszeile): ${e.schlusszeile}`);
    out.push(`  Schluessel: ${zeigeSchluessel(f)}`);
    out.push(`  Beleg: ${e.beleg_link}`);
    out.push("  Rechenweg:");
    out.push(...formatiere(e.rechenweg ?? {}, "    "));
  }

  for (const u of UNTERGRUENDE) {
    out.push("", `== Nicht auswertbar: ${u} (${nichtAuswertbar[u].length}) ==`);
    for (const e of nichtAuswertbar[u]) {
      out.push(`--- ${e.frage_id}`);
      out.push(`  Letzte Zeile: ${e.schlusszeile === null ? "(Antwort leer)" : JSON.stringify(e.schlusszeile)}`);
      if (e.antwortzeile !== undefined) {
        out.push(`  Antwortzeile: ${JSON.stringify(e.antwortzeile)} (${e.zeilen_vor_ende} Zeile(n) vor dem Ende)`);
      }
    }
  }

  out.push("", `== API-Fehler (${apiFehler.length}) ==`);
  for (const e of apiFehler) out.push(`--- ${e.frage_id}: ${JSON.stringify(e.fehler)}`);
  out.push("", `== Abgelehnt (${abgelehnt.length}) ==`);
  for (const e of abgelehnt) out.push(`--- ${e.frage_id}: ${JSON.stringify(e.stop_details)}`);
  out.push("", `== Abgeschnitten (${abgeschnitten.length}) ==`);
  for (const e of abgeschnitten) out.push(`--- ${e.frage_id}`);

  console.log(out.join("\n"));

  // "wx": schlaegt fehl, falls die Datei zwischen Pruefung und Schreiben entstanden ist.
  fs.writeFileSync(zielPfad, JSON.stringify(auswertung, null, 2) + "\n", { encoding: "utf8", flag: "wx" });
  console.log(`\n${LOG} Auswertung geschrieben: ${relativ(zielPfad)}`);
}

main();
