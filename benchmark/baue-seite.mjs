#!/usr/bin/env node
// benchmark/baue-seite.mjs
// Erzeugt mietrecht-benchmark.html aus benchmark/seite-vorlage.html und den
// Auswertungs- und Ergebnisdateien.
// Aufruf: npm run baue-seite      danach immer: npm run pruefe-seite
//
// Warum es dieses Skript gibt: Auf der Seite stehen ueber 300 Zahlen, 30
// Rohantworten und 13 Tabellen. Keine davon ist abgeschrieben - alle werden
// hier aus den Daten eingesetzt. Ein Schritt, der nicht festgehalten ist, wird
// beim naechsten Mal falsch rekonstruiert, und eine falsche Zahl faellt auf
// einer Seite, deren einziges Kapital Nachpruefbarkeit ist, niemandem auf.
//
// Arbeitsteilung mit pruefe-seite.mjs: Dort stehen die Serien, die
// Begriffsgruppe, die Downloadliste und die gesamte Rechnung. Dieses Skript
// rechnet nichts selbst - es holt sich die Werte von dort und ordnet sie an.
// Deshalb kann der Waechter spaeter melden, dass die Seite nicht mehr zu den
// Daten passt: Er rechnet neu, die Seite nicht.
//
// Die Vorlage enthaelt den Fliesstext von Hand und Marken der Form @@NAME@@
// fuer alles, was aus den Daten kommt.
import fs from "node:fs";
import path from "node:path";
import {
  werteBerechnen, rohantwort, SERIEN, GRUPPE, REINIGUNG, DOWNLOADS,
  ausw, ergeb, alsDatum, groesse, WURZEL,
} from "./pruefe-seite.mjs";

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const W = werteBerechnen();
const v = (k) => {
  if (!W.has(k)) throw new Error("kein Wert: " + k);
  return W.get(k);
};

const fragenFristen = JSON.parse(fs.readFileSync(path.join(WURZEL, "benchmark/fragen-fristen.json"), "utf8"));
const fragenUmlage = JSON.parse(fs.readFileSync(path.join(WURZEL, "benchmark/fragen-umlage.json"), "utf8"));
const frage = (id) => fragenFristen.find((f) => f.id === id) || fragenUmlage.find((f) => f.id === id);

const zelle = (wert, schluessel) => {
  if (wert === "richtig") return `<td class="hg-check-ok"><span data-pruef="${schluessel}">richtig</span></td>`;
  if (wert === "n. a.") return `<td class="hg-check-warn"><span data-pruef="${schluessel}">n. a.</span></td>`;
  return `<td><strong><span data-pruef="${schluessel}">${esc(wert)}</span></strong></td>`;
};

// --- Kurzbeschreibung einer Fristenfrage aus ihrem Rechenweg ---------------
function kurz(f) {
  const r = f.rechenweg;
  const start = alsDatum(r.startereignis.datum);
  const ereignis = r.ereignis ? alsDatum(r.ereignis.datum) : null;
  const istEinwendung = r.frist === "einwendungsfrist";
  let text;
  if (f.antwort_typ === "datum") {
    text = istEinwendung
      ? `Zugang ${start} – Einwendungen bis wann?`
      : `Zeitraum bis ${start} – Abrechnung bis wann?`;
  } else {
    text = istEinwendung
      ? `Zugang ${start}, Einwendungen am ${ereignis} – gewahrt?`
      : `Zeitraum bis ${start}, Zugang am ${ereignis} – gewahrt?`;
  }
  if (f.kategorie === "frist-193-verschiebung") text += " · § 193 BGB genannt";
  return text;
}

// --- Fehlerzeilen Fristen --------------------------------------------------
function fristenFehlerZeilen() {
  const a = SERIEN.fristen.map(ausw);
  const einzel = a.map((j) => new Map(j.einzelwertung.map((x) => [x.frage_id, x])));
  const ids = [...einzel[0].keys()].filter((id) => einzel.some((m) => m.get(id).status === "falsch"));
  return ids
    .map((id) => {
      const f = frage(id);
      const zeilen = [1, 2, 3].map((n) => zelle(v(`fristen.fehler.${id}.l${n}`), `fristen.fehler.${id}.l${n}`));
      return `            <tr>
              <td><a href="#bsp-${id}">${esc(kurz(f))}</a><br><small>Pos. <span data-pruef="fristen.fehler.${id}.position">${v(`fristen.fehler.${id}.position`)}</span> · ${esc(id)}</small></td>
              <td><span data-pruef="fristen.fehler.${id}.schluessel">${esc(v(`fristen.fehler.${id}.schluessel`))}</span></td>
              ${zeilen.join("\n              ")}
            </tr>`;
    })
    .join("\n");
}

// --- Beispielkarten Fristen ------------------------------------------------
const ANMERKUNG = {
  "frist-einwendung-2026-05-11-datum": `<div class="hg-hint-box hg-hint-warn"><strong>Hier ist der Schlüssel selbst eine Entscheidung.</strong> Die Antwort aus Lauf 2 liest „Ablauf des zwölften Monats“ als Kalendermonat und landet beim Monatsletzten – sie sagt das auch offen. Der Benchmark folgt der anderen Lesart: zwölf Monate nach §§ 187 Abs. 1, 188 Abs. 2 BGB, gleiche Tageszahl. Das ist die herrschende – der BGH spricht von einer „zwölfmonatigen Einwendungsfrist“, die Kalendermonats-Lesart wird nirgends vertreten. Die Antwort wird also unter einer dokumentierten Entscheidung als falsch gewertet, nicht als schlichter Rechenfehler. Die Fälle, in denen beide Lesarten ernsthaft auseinandergehen (Start am 28.02. vor einem Schaltjahr), sind aus dem Fragensatz heraus.</div>`,
};

function fristenBeispiele() {
  const a = SERIEN.fristen.map(ausw);
  const einzel = a.map((j) => new Map(j.einzelwertung.map((x) => [x.frage_id, x])));
  const ids = [...einzel[0].keys()].filter((id) => einzel.some((m) => m.get(id).status === "falsch"));

  const karten = ids.map((id) => {
    const f = frage(id);
    const r = f.rechenweg;
    const schritte = r.schritte
      .map(
        (s) => `          <li class="bk-schritt">
            <strong>${esc(s.bezeichnung)}</strong>
            <p>${esc(s.erklaerung)}</p>
            <a class="bk-quelle" href="${s.beleg_link}" target="_blank" rel="noopener noreferrer">${esc(s.bezeichnung)} im Wortlaut →</a>
          </li>`
      )
      .join("\n");
    const antworten = [1, 2, 3]
      .map((n) => {
        const st = einzel[n - 1].get(id).status;
        const marke = st === "richtig" ? "richtig" : st === "falsch" ? "falsch" : "nicht auswertbar";
        return `        <details class="bk-beleg">
          <summary>Antwort Lauf ${n} im Wortlaut (${marke})</summary>
          <pre class="bk-beleg-text" data-roh="fristen:${id}:${n}">${esc(rohantwort("fristen", id, n))}</pre>
          <p class="bk-beleg-fuss">Aus <code>${esc(SERIEN.fristen[n - 1])}.json</code>, Position ${v(`fristen.fehler.${id}.position`)} von ${v("fristen.fragen")}. SHA-256 der Datei: <code><span data-pruef="lauf.fristen.${n}.sha16">${v(`lauf.fristen.${n}.sha16`)}</span>…</code> (vollständig in der Lauftabelle)</p>
        </details>`;
      })
      .join("\n");

    return `    <section class="bk-karte" id="bsp-${id}">
      <h2>${esc(kurz(f))}</h2>
      <p>${esc(id)} · Position ${v(`fristen.fehler.${id}.position`)} von ${v("fristen.fragen")}</p>
      <p>${esc(f.frage)}</p>
      <p class="bk-grundlage">Schlüssel: ${esc(v(`fristen.fehler.${id}.schluessel`))} · ${esc(r.grundlage)}</p>
      <ol class="bk-schritte">
${schritte}
      </ol>
${ANMERKUNG[id] ?? ""}
${antworten}
    </section>`;
  });

  return `    <h2 class="bk-abschnitt" id="fristen-beispiele">Die <span data-pruef="fristen.falsch.antworten">${v("fristen.falsch.antworten")}</span> Fristenfehler, jeder in allen drei Läufen</h2>
    <p class="hg-result-note">Jede dieser Fragen wurde zweimal richtig und einmal falsch beantwortet. Der Rechenweg darunter ist der des Schlüssels – Schritt für Schritt, mit der Vorschrift zu jedem Schritt.</p>
${karten.join("\n\n")}`;
}

// --- Umlage: Gruppen- und Vergleichszeilen ---------------------------------
function umlageGruppeZeilen(serie) {
  return Object.entries(GRUPPE)
    .map(([id, nr]) => {
      const f = frage(id);
      const zellen = [1, 2, 3].map((n) => zelle(v(`${serie}.gruppe.${id}.l${n}`), `${serie}.gruppe.${id}.l${n}`));
      return `            <tr>
              <td><a href="#bsp-${id}">${esc(f.rechenweg.begriff)}</a><br><small>${esc(id)}</small></td>
              <td>§ 2 Nr. ${nr} BetrKV</td>
              <td><span data-pruef="${serie}.gruppe.${id}.position">${v(`${serie}.gruppe.${id}.position`)}</span></td>
              ${zellen.join("\n              ")}
            </tr>`;
    })
    .join("\n");
}

function umlageVergleichZeilen() {
  const kuerzel = (serie, id) =>
    [1, 2, 3]
      .map((n) => {
        const s = v(`${serie}.gruppe.${id}.l${n}`);
        const zeichen = s === "richtig" ? "✔" : s === "falsch" ? "✗" : "–";
        return `<span data-pruef="${serie}.gruppe.${id}.l${n}" hidden>${s}</span>${zeichen}`;
      })
      .join(" ");
  return Object.entries(GRUPPE)
    .map(
      ([id, nr]) => `            <tr>
              <td>${esc(frage(id).rechenweg.begriff)}<br><small>§ 2 Nr. ${nr} BetrKV</small></td>
              <td>${kuerzel("umlage-alt", id)}</td>
              <td>${kuerzel("umlage-neu", id)}</td>
              <td><span data-pruef="umlage-alt.gruppe.${id}.position">${v(`umlage-alt.gruppe.${id}.position`)}</span> → <span data-pruef="umlage-neu.gruppe.${id}.position">${v(`umlage-neu.gruppe.${id}.position`)}</span></td>
            </tr>`
    )
    .join("\n");
}

// --- Beispielkarten Umlage (alle 12 Antworten der Gruppe) ------------------
const UMLAGE_ANMERKUNG = {
  "umlage-waeschepflege": `<div class="hg-hint-box hg-hint-warn"><strong>Auch hier ist der Schlüssel eine Entscheidung.</strong> Lauf 2 findet Nr. 16 und führt sie richtig auf, argumentiert dann aber: Die Vorschrift spricht von den Kosten des <em>Betriebs der Einrichtungen</em> für die Wäschepflege; eine blanke Rechnungszeile „Wäschepflege“ zeigt nicht, dass es um eine solche Einrichtung geht. Das ist kein Nachschlagefehler – es ist derselbe Einwand, den wir bei den Gerätebegriffen (Waschküche, Waschmaschine, Trockner) akzeptiert und die Fragen deshalb gestrichen haben. „Wäschepflege“ ist in der Begriffsdatei als Kostenart geführt, deshalb steht der Schlüssel – und deshalb wird diese Antwort unter einer dokumentierten Entscheidung als falsch gewertet. Ob die Einstufung als Kostenart gegen diesen Einwand hält, ist offen.</div>`,
  "umlage-ungezieferbekaempfung": `<div class="hg-hint-box"><strong>Dreimal richtig, dreimal aus falschem Grund.</strong> Das Wort steht wörtlich in § 2 Nr. 9 BetrKV. Keine der drei Antworten nennt Nr. 9; alle drei argumentieren über Nr. 17 („sonstige Betriebskosten“, nur mit Mietvertragsvereinbarung) und kippen in der Schlusszeile trotzdem auf „ja“. In der älteren Serie führte dieselbe Argumentation einmal zu „nein“.</div>`,
};

function umlageBeispiele() {
  const a = SERIEN["umlage-neu"].map(ausw);
  const einzel = a.map((j) => new Map(j.einzelwertung.map((x) => [x.frage_id, x])));

  const karten = Object.keys(GRUPPE).map((id) => {
    const f = frage(id);
    const r = f.rechenweg;
    const antworten = [1, 2, 3]
      .map((n) => {
        const st = einzel[n - 1].get(id).status;
        const marke = st === "richtig" ? "richtig" : st === "falsch" ? "falsch" : "nicht auswertbar";
        return `        <details class="bk-beleg">
          <summary>Antwort Lauf ${n} im Wortlaut (${marke})</summary>
          <pre class="bk-beleg-text" data-roh="umlage-neu:${id}:${n}">${esc(rohantwort("umlage-neu", id, n))}</pre>
          <p class="bk-beleg-fuss">Aus <code>${esc(SERIEN["umlage-neu"][n - 1])}.json</code>, Position ${v(`umlage-neu.gruppe.${id}.position`)} von ${v("umlage-neu.fragen")}. SHA-256 der Datei: <code><span data-pruef="lauf.umlage-neu.${n}.sha16">${v(`lauf.umlage-neu.${n}.sha16`)}</span>…</code> (vollständig in der Lauftabelle)</p>
        </details>`;
      })
      .join("\n");

    return `    <section class="bk-karte" id="bsp-${id}">
      <h2>„${esc(r.begriff)}“</h2>
      <p>${esc(id)} · Position ${v(`umlage-neu.gruppe.${id}.position`)} von ${v("umlage-neu.fragen")}</p>
      <p>${esc(f.frage)}</p>
      <p class="bk-grundlage">Schlüssel: ${esc(f.antwort)} · ${esc(r.fundstelle)}</p>
      <details class="bk-beleg">
        <summary>Der Gesetzestext, gegen den geprüft wurde</summary>
        <pre class="bk-beleg-text">${esc(r.gesetzestext)}</pre>
        <p class="bk-beleg-fuss">Aus <code>wissensbasis/gesetze.json</code>, Eintrag <code>${esc(r.eintrag)}</code>. Amtliche Quelle: <a href="${r.beleg_link}" target="_blank" rel="noopener noreferrer">${esc(r.fundstelle)}</a></p>
      </details>
${UMLAGE_ANMERKUNG[id] ?? ""}
${antworten}
    </section>`;
  });

  return `    <h2 class="bk-abschnitt" id="umlage-beispiele">Die Begriffsgruppe, alle <span data-pruef="umlage-neu.gruppe.antworten">${v("umlage-neu.gruppe.antworten")}</span> Antworten im Wortlaut</h2>
    <p class="hg-result-note">Diese <span data-pruef="umlage-neu.gruppe.antworten">${v("umlage-neu.gruppe.antworten")}</span> Antworten tragen beide Befunde. Wer nachlesen will, ob eine als richtig gewertete Antwort auf der richtigen Vorschrift steht, findet das hier – ungekürzt.</p>
${karten.join("\n\n")}`;
}

// --- Quotenzeilen ----------------------------------------------------------
const TYPNAME = { datum: "Datum", "ja-nein": "Ja/Nein" };
const KATNAME = {
  "frist-193-verschiebung": "§ 193 BGB verschiebt das Fristende",
  "frist-einwendung-datum": "Einwendungsfrist – Datum",
  "frist-einwendung-gewahrt": "Einwendungsfrist – gewahrt?",
  "frist-abrechnung-datum": "Abrechnungsfrist – Datum",
  "frist-abrechnung-gewahrt": "Abrechnungsfrist – gewahrt?",
  "frist-februar": "Fälle rund um den 29.02.",
  "umlage-katalog-wortlaut": "Begriff steht als ganzes Wort im Gesetz",
  "umlage-katalog-suchbegriff": "Begriff über Suchbegriff zugeordnet",
  "umlage-ausschluss": "Ausschluss nach § 1 Abs. 2 BetrKV",
};

function quotenZeile(bezeichnung, praefix) {
  const zellen = [1, 2, 3]
    .map(
      (n) =>
        `<td><span data-pruef="${praefix}.l${n}">${v(`${praefix}.l${n}`)}</span></td>`
    )
    .join("");
  const nas = [1, 2, 3]
    .map((n) => `<span data-pruef="${praefix}.l${n}.na">${v(`${praefix}.l${n}.na`)}</span>`)
    .join(" / ");
  return `            <tr>
              <td>${bezeichnung}</td>
              <td><strong><span data-pruef="${praefix}.spanne">${esc(v(`${praefix}.spanne`))}</span></strong></td>
              ${zellen}
              <td>${nas}</td>
            </tr>`;
}

function typZeilen(serie) {
  const a = ausw(SERIEN[serie][0]);
  const zeilen = [];
  for (const typ of Object.keys(a.quoten.nach_antworttyp)) {
    zeilen.push(quotenZeile(`<strong>${TYPNAME[typ] ?? typ}</strong>`, `${serie}.typ.${typ}`));
    for (const s of Object.keys(a.quoten.nach_antworttyp[typ].nach_schluessel ?? {})) {
      zeilen.push(quotenZeile(`↳ Schlüssel „${s}“`, `${serie}.typ.${typ}.${s}`));
    }
  }
  return zeilen.join("\n");
}

function katZeilen(serie) {
  const a = ausw(SERIEN[serie][0]);
  return a.quoten.nach_kategorie
    .map((k) =>
      quotenZeile(
        `${KATNAME[k.kategorie] ?? k.kategorie}<br><small>${k.kategorie} · ${TYPNAME[k.antwort_typ]}</small>`,
        `${serie}.kat.${k.kategorie}.${k.antwort_typ}`
      )
    )
    .join("\n");
}

// --- Lauftabelle -----------------------------------------------------------
const SERIENNAME = { fristen: "Fristen", "umlage-neu": "Umlage (veröffentlicht)", "umlage-alt": "Umlage (ältere Serie)" };

function laufZeilen() {
  const zeilen = [];
  for (const serie of Object.keys(SERIEN)) {
    for (const n of [1, 2, 3]) {
      zeilen.push(`            <tr>
              <td>${SERIENNAME[serie]} · Lauf ${n}</td>
              <td><span data-pruef="lauf.${serie}.${n}.gestartet">${v(`lauf.${serie}.${n}.gestartet`)}</span></td>
              <td><span data-pruef="lauf.${serie}.${n}.beendet">${v(`lauf.${serie}.${n}.beendet`)}</span></td>
              <td><span data-pruef="lauf.${serie}.${n}.antworten">${v(`lauf.${serie}.${n}.antworten`)}</span></td>
              <td><span data-pruef="lauf.${serie}.${n}.fehler">${v(`lauf.${serie}.${n}.fehler`)}</span></td>
              <td><span data-pruef="lauf.${serie}.${n}.abgeschnitten">${v(`lauf.${serie}.${n}.abgeschnitten`)}</span></td>
              <td><small><span data-pruef="lauf.${serie}.${n}.sha256">${v(`lauf.${serie}.${n}.sha256`)}</span></small></td>
            </tr>`);
    }
  }
  return zeilen.join("\n");
}

// --- Downloadtabelle -------------------------------------------------------
function downloadZeilen() {
  return DOWNLOADS.map(
    ([datei, was]) => `            <tr>
              <td><a href="${datei}" download>${esc(datei.replace(/^benchmark\//, ""))}</a></td>
              <td>${esc(was)}</td>
              <td><span data-pruef="download.${datei}.groesse">${v(`download.${datei}.groesse`)}</span></td>
            </tr>`
  ).join("\n");
}

// --- Zusammenbau -----------------------------------------------------------
const VORLAGE = process.env.BENCHMARK_VORLAGE || path.join(WURZEL, "benchmark", "seite-vorlage.html");
const ZIEL = process.env.BENCHMARK_SEITE || path.join(WURZEL, "mietrecht-benchmark.html");
let html = fs.readFileSync(VORLAGE, "utf8");

const bausteine = {
  "@@FRISTEN_FEHLER_ZEILEN@@": fristenFehlerZeilen(),
  "@@FRISTEN_BEISPIELE@@": fristenBeispiele(),
  "@@UMLAGE_GRUPPE_ZEILEN@@": umlageGruppeZeilen("umlage-neu"),
  "@@UMLAGE_VERGLEICH_ZEILEN@@": umlageVergleichZeilen(),
  "@@UMLAGE_BEISPIELE@@": umlageBeispiele(),
  "@@FRISTEN_TYP_ZEILEN@@": typZeilen("fristen"),
  "@@FRISTEN_KAT_ZEILEN@@": katZeilen("fristen"),
  "@@UMLAGE_NEU_ZEILEN@@": typZeilen("umlage-neu") + "\n" + katZeilen("umlage-neu"),
  "@@UMLAGE_ALT_ZEILEN@@": typZeilen("umlage-alt") + "\n" + katZeilen("umlage-alt"),
  "@@LAUF_ZEILEN@@": laufZeilen(),
  "@@DOWNLOAD_ZEILEN@@": downloadZeilen(),
};
for (const [marke, inhalt] of Object.entries(bausteine)) {
  if (!html.includes(marke)) throw new Error("Marke fehlt in der Vorlage: " + marke);
  html = html.replace(marke, inhalt);
}

// Alle von Hand getippten data-pruef-Werte durch die gerechneten ersetzen.
// Nichts auf dieser Seite soll abgeschrieben sein.
let ersetzt = 0, unbekannt = [];
html = html.replace(/data-pruef="([^"]+)"([^>]*)>([\s\S]*?)<\/span>/g, (treffer, schluessel, rest, inhalt) => {
  if (!W.has(schluessel)) { unbekannt.push(schluessel); return treffer; }
  ersetzt++;
  return `data-pruef="${schluessel}"${rest}>${esc(W.get(schluessel))}</span>`;
});

fs.writeFileSync(ZIEL, html, "utf8");
console.log(`Seite gebaut: ${path.relative(WURZEL, ZIEL)} - ${ersetzt} Zahlen eingesetzt.`);
console.log("Jetzt pruefen: npm run pruefe-seite");
if (unbekannt.length) console.log("OHNE WERT:", [...new Set(unbekannt)].join(", "));
