#!/usr/bin/env node
// scripts/baue-wissen.mjs
// Erzeugt die Frageseiten unter wissen/, die Sitemap und die Liste "Was es heute gibt"
// auf der Startseite.
// Aufruf: npm run baue-wissen      danach immer: npm run pruefe-wissen
//
// Warum ein Skript und keine Seiten von Hand: Auf jeder Seite stehen Fristenden,
// Rechenschritte und Urteile. Abgeschrieben liefe jede davon beim naechsten Import
// der Gesetze oder bei der naechsten Aenderung der Engine lautlos auseinander - und
// eine falsche Frist sieht genauso aus wie eine richtige.
//
// Dieses Skript rechnet nichts selbst. Werte kommen aus scripts/wissen/daten.mjs
// (dort ruft die Engine), Titel und Texte der Suche aus scripts/wissen/konfig.mjs.
// Jeder Wert aus der Engine steht in einem <span data-pruef="...">, jedes Zitat aus
// dem Gesetz in einem Element mit data-zitat="Gesetz §". pruefe-wissen.mjs haelt
// beides gegen Engine und Wissensbasis.
//
// Reproduzierbar: Kein Datum von heute, keine Zufallswerte, feste Reihenfolge. Zweimal
// bauen ergibt dieselben Bytes - der Waechter prueft genau das.
//
// Die erzeugten Dateien nie von Hand aendern. Aenderung = konfig.mjs oder dieses
// Skript anpassen, neu bauen, pruefen.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  WURZEL, ladeDaten, rechneAlles, werte, pfadBegriff, pfadJahr, PFAD_UEBERSICHT,
} from "./wissen/daten.mjs";
import {
  SEITE, UEBERSICHT, WEITERE_SEITEN, WISSENSBEREICHE, BESTAND_WEITERE,
} from "./wissen/konfig.mjs";
import { MODULE } from "../kern/module.mjs";
import { VERDIKT } from "../kern/katalog.mjs";
import { formatiereDeutsch } from "../kern/datum.mjs";

const RECHNER = "/nebenkostenabrechnung-frist-pruefen";

export const esc = (s) => String(s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Dateiname zu einem Seitenpfad: /wissen/x -> wissen/x.html, /wissen/ -> wissen/index.html
export const dateiVon = (pfad) => (pfad.endsWith("/") ? pfad.slice(1) + "index.html" : pfad.slice(1) + ".html");

// Farbklasse des Urteils - dieselben Klassen wie im Pruefer (betriebskosten-pruefer.js).
const KLASSE = {
  [VERDIKT.KATALOG]: "ist-katalog",
  [VERDIKT.AUSGESCHLOSSEN]: "ist-ausschluss",
  [VERDIKT.MIETVERTRAG]: "ist-vorbehalt",
  [VERDIKT.ANTEILIG]: "ist-vorbehalt",
  [VERDIKT.LUECKE]: "ist-luecke",
};

// ---------------------------------------------------------------------------
// Bausteine
// ---------------------------------------------------------------------------

// Ein Wert aus der Engine. Unbekannter Schluessel = Abbruch, nie ein leerer Platz.
function werteFuer(alleWerte, pfad) {
  const w = alleWerte.get(pfad);
  if (!w) throw new Error("keine Werte fuer " + pfad);
  return (k) => {
    if (!w.has(k)) throw new Error(`${pfad}: kein Wert "${k}"`);
    return `<span data-pruef="${esc(k)}">${esc(w.get(k))}</span>`;
  };
}

const zitat = (beleg, inhalt, tag = "span") =>
  `<${tag} data-zitat="${esc(beleg.gesetz + " " + beleg.paragraph)}">${esc(inhalt)}</${tag}>`;

const quelle = (beleg, text) =>
  `<a class="bk-quelle" href="${esc(beleg.quelle)}" target="_blank" rel="noopener noreferrer">${esc(text)}</a>`;

function wortlautKarte(belege, schluessel) {
  const bloecke = schluessel.map((k) => {
    const b = belege[k];
    return `        <details class="bk-beleg">
          <summary>${esc(`${b.paragraph} ${b.gesetz} – ${b.titel}`)}</summary>
          ${zitat(b, b.text, "pre").replace("<pre ", '<pre class="bk-beleg-text" ')}
          <div class="bk-beleg-fuss">${b.stand ? `<div>Stand: ${esc(b.stand)}</div>` : ""}${quelle(b, "Amtliche Quelle öffnen")}</div>
        </details>`;
  });
  return `      <section class="bk-karte">
        <h2>Die Vorschriften im Wortlaut</h2>
        <p>Aus der Wissensbasis von Inspectora, importiert von gesetze-im-internet.de. Maßgeblich ist der amtliche Text.</p>
${bloecke.join("\n")}
      </section>`;
}

function grenzenKarte(grenzen, modulInfo) {
  return `      <section class="bk-karte">
        <h2>Was diese Seite nicht entscheidet</h2>
        <p>So steht es im Ergebnis der Engine selbst (Modul ${esc(modulInfo.id)} ${esc(modulInfo.version)}):</p>
        <ul class="wissen-liste">
${grenzen.map((g) => `          <li>${esc(g)}</li>`).join("\n")}
        </ul>
      </section>`;
}

function seite({ pfad, titel, beschreibung, h1, einleitung, inhalt }) {
  return `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${esc(titel)}</title>
  <meta name="description" content="${esc(beschreibung)}">
  <link rel="canonical" href="${SEITE}${pfad}">

  <meta property="og:type" content="article">
  <meta property="og:site_name" content="Inspectora">
  <meta property="og:title" content="${esc(titel)}">
  <meta property="og:description" content="${esc(beschreibung)}">
  <meta property="og:url" content="${SEITE}${pfad}">
  <meta property="og:image" content="${SEITE}/og-image.png">
  <meta property="og:locale" content="de_DE">

  <!-- Erzeugt von scripts/baue-wissen.mjs - nicht von Hand aendern. -->
  <link rel="stylesheet" href="/styles.css">
</head>
<body class="assistant-body">
  <header class="assistant-header">
    <a class="assistant-brand" href="/" aria-label="Inspectora Startseite">
      <span class="brand-mark">I</span>
      <span><strong>Inspectora</strong><small>Wissen</small></span>
    </a>
    <a class="button secondary small" href="${RECHNER}">Abrechnung prüfen</a>
  </header>

  <main class="assistant-main">
    <nav class="wissen-pfad" aria-label="Brotkrumen">
      <a href="/">Startseite</a> › <a href="${PFAD_UEBERSICHT}">Wissen</a>${pfad === PFAD_UEBERSICHT ? "" : ` › ${esc(h1)}`}
    </nav>

    <div class="assistant-intro">
      <h1>${esc(h1)}</h1>
${einleitung}
      <p class="assistant-notice">
        Keine Rechtsberatung – diese Seite gibt den Gesetzeswortlaut wieder und rechnet nach ihm.
        Zu jedem Schritt steht die Vorschrift.
      </p>
    </div>

${inhalt}

    <p class="bk-fuss">
      Rechtsgrundlagen aus der Wissensbasis von Inspectora, importiert von
      <a href="https://www.gesetze-im-internet.de/" target="_blank" rel="noopener noreferrer">gesetze-im-internet.de</a>.
      Diese Seite ist aus derselben Engine erzeugt wie der <a href="${RECHNER}">Rechner</a>.
      Maßgeblich ist immer der amtliche Text.
    </p>
  </main>
</body>
</html>
`;
}

// ---------------------------------------------------------------------------
// Jahresseite
// ---------------------------------------------------------------------------

// Die beiden Daten einer Frist - immer beide, wie im Pruefer.
function datenBoxen(frist, praefix, w) {
  const v = frist.verschiebung;
  const kette = v.kette.map((g) => `${formatiereDeutsch(g.iso)}: ${g.text}`).join(" · ");
  return `        <div class="bk-daten">
          <div class="bk-datum-box">
            <span class="bk-label">Fristende nach §§ 187 Abs. 1, 188 BGB</span>
            <strong class="bk-datum-wert">${w(praefix + ".basis")}</strong>
            <p>${frist.basis.abs3Angewendet ? "Der Tag gleicher Zahl fehlt im Zielmonat – § 188 Abs. 3 BGB zieht das Fristende auf den Monatsletzten." : "Ohne Anwendung des § 193 BGB."}</p>
          </div>
          <div class="bk-datum-box${v.verschoben ? " ist-verschoben" : ""}">
            <span class="bk-label">Fristende bei Anwendung des § 193 BGB</span>
            <strong class="bk-datum-wert">${w(praefix + ".p193")}</strong>
            <p>${v.verschoben ? `Verschoben nach § 193 BGB. ${esc(kette)}.` : "Keine Verschiebung – der Tag ist ein Werktag und kein Feiertag der bundeseinheitlichen Liste."}</p>
          </div>
        </div>`;
}

function rechenweg(frist, praefix, belege, w) {
  return `        <h3 class="bk-label">Rechenweg</h3>
        <ol class="bk-schritte">
${frist.schritte.map((s, i) => {
    const b = belege[s.beleg];
    return `          <li class="bk-schritt">
            <strong>${esc(s.bezeichnung)}</strong>
            <p>${w(`${praefix}.schritt.${i + 1}`)}</p>
            ${quelle(b, `${b.paragraph} ${b.gesetz} – ${b.titel} (amtliche Quelle)`)}
          </li>`;
  }).join("\n")}
        </ol>`;
}

function herkunft(frist) {
  if (!frist.verschiebung.kette.some((g) => g.art === "feiertag")) return "";
  return `        <div class="bk-herkunft">Feiertage stammen nicht aus der Wissensbasis. Berücksichtigt sind nur die neun bundesweit einheitlichen Feiertage – landesrechtliche Feiertage fehlen.</div>\n`;
}

function jahresseite(j, r, alleWerte) {
  const w = werteFuer(alleWerte, j.pfad);
  const b556 = j.belege["bgb-556"];
  const b193 = j.belege["bgb-193"];
  const zweiDaten = `        <div class="hg-hint-box">
          <strong>Warum zwei Daten? </strong>§ 193 BGB gilt, wenn ${zitat(b193, j.zitate.paragraf193Voraussetzung)} ist. Ob das auf diese Frist zutrifft, ist eine Auslegungsfrage und nicht durch Rechnen zu klären. Deshalb stehen beide Daten da.
        </div>`;
  const andere = r.jahre.filter((x) => x !== j);
  const rechnerLink = `${RECHNER}?ende=${j.ende}#frist`;

  const inhalt = `    <section class="bk-karte">
      <h2>Bis wann muss die Abrechnung beim Mieter sein?</h2>
      <span class="bk-grundlage">${esc(j.abrechnung.grundlage)}</span>
      <p>„${zitat(b556, j.abrechnung.satz)}“</p>
${datenBoxen(j.abrechnung, `jahr.${j.jahr}.abrechnung`, w)}
${zweiDaten}
${herkunft(j.abrechnung)}${rechenweg(j.abrechnung, `jahr.${j.jahr}.abrechnung`, j.belege, w)}
    </section>

    <section class="bk-karte">
      <h2>Und der Mieter? Die Einwendungsfrist</h2>
      <span class="bk-grundlage">${esc(j.einwendung.grundlage)}</span>
      <p>„${zitat(b556, j.einwendung.satz)}“</p>
      <p class="panel-intro">Die Einwendungsfrist beginnt mit dem Zugang der Abrechnung – sie ist deshalb für jede Abrechnung anders. Als Beispiel: Die Abrechnung geht am letzten Tag der Frist oben zu, am ${w(`jahr.${j.jahr}.einwendung.zugang`)}.</p>
${datenBoxen(j.einwendung, `jahr.${j.jahr}.einwendung`, w)}
${herkunft(j.einwendung)}${rechenweg(j.einwendung, `jahr.${j.jahr}.einwendung`, j.belege, w)}
      <p class="panel-intro"><a class="button secondary small" href="${rechnerLink}">Mit deinem Zugangsdatum rechnen</a></p>
    </section>

${grenzenKarte(j.grenzen, j.modul)}

${wortlautKarte(j.belege, ["bgb-556", "bgb-187", "bgb-188", "bgb-193"])}

    <section class="bk-karte">
      <h2>Andere Abrechnungsjahre</h2>
      <p>Jeweils für das Kalenderjahr als Abrechnungszeitraum.</p>
      <ul class="wissen-liste">
${andere.map((x) => `        <li><a href="${x.pfad}">Nebenkostenabrechnung ${x.jahr}</a> – Fristende nach §§ 187, 188 BGB: ${w(`jahr.${x.jahr}.fristende`)}</li>`).join("\n")}
      </ul>
      <p>Anderer Abrechnungszeitraum? Der <a href="${RECHNER}#frist">Rechner</a> rechnet mit deinem Datum. Alle Fragen: <a href="${PFAD_UEBERSICHT}">Wissen</a>.</p>
    </section>`;

  const kurz = formatiereDeutsch(j.abrechnung.basis.iso);
  return seite({
    pfad: j.pfad,
    titel: `Nebenkostenabrechnung ${j.jahr}: Bis wann muss sie kommen?`,
    beschreibung: `Abrechnungsjahr ${j.jahr}: Fristende der Nebenkostenabrechnung ist der ${kurz} `
      + "(§ 556 Abs. 3 BGB). Rechenweg mit Vorschrift zu jedem Schritt – auch für Mieter.",
    h1: `Nebenkostenabrechnung ${j.jahr} – bis wann?`,
    einleitung: `      <p class="bk-begriff">
        Wie lange hat der Vermieter Zeit? Für die Abrechnung über das Jahr ${j.jahr} rechnet diese
        Seite die Frist aus § 556 Abs. 3 BGB aus – Schritt für Schritt, mit der Vorschrift zu jedem Schritt.
      </p>
      <div class="hg-hint-box">
        <strong>Annahme: Abrechnungszeitraum = Kalenderjahr.</strong> Diese Seite geht vom Regelfall
        aus, 01.01.${j.jahr} bis ${formatiereDeutsch(j.ende)}. Endet dein Abrechnungszeitraum an einem
        anderen Tag, gilt ein anderes Datum – der <a href="${RECHNER}#frist">Rechner</a> rechnet mit deinem.
      </div>`,
    inhalt,
  });
}

// ---------------------------------------------------------------------------
// Begriffsseite
// ---------------------------------------------------------------------------

function erklaerung(b) {
  const p = b.position;
  const f = p.fundstellen[0];
  const name = `„${esc(b.konf.begriff)}“`;
  switch (p.verdikt) {
    case VERDIKT.KATALOG:
      return f.treffer.art === "wortlaut"
        ? `${name} steht so im Katalog der Betriebskosten: ${esc(f.bezeichnung)}.`
        : `${name} steht nicht wörtlich im Gesetz. Inspectora ordnet den Begriff ${esc(f.bezeichnung)} zu – prüf die Zuordnung am Wortlaut unten.`;
    case VERDIKT.ANTEILIG:
      return `${name} gehört zu ${esc(f.bezeichnung)} – aber nicht jede Arbeit. Die Nummer nimmt einen Teil selbst wieder aus.`;
    case VERDIKT.AUSGESCHLOSSEN:
      return `${name} nennt ${esc(f.bezeichnung)} ausdrücklich unter dem, was nicht zu den Betriebskosten gehört.`;
    case VERDIKT.LUECKE:
      return `${name} steht in keiner Nummer der Betriebskostenverordnung. Der Wortlaut entscheidet diesen Posten nicht – und diese Seite tut es auch nicht.`;
    default:
      throw new Error("kein Text fuer Urteil " + p.verdikt);
  }
}

function fundstelleBlock(f, beleg) {
  return `        <div class="bk-fundstelle">
          <div class="bk-fundstelle-kopf">${esc(f.bezeichnung)}</div>
          <div class="bk-fundstelle-kurz">${esc(f.kurztitel)}</div>
          <span class="bk-treffer ${f.treffer.art === "wortlaut" ? "ist-wortlaut" : "ist-suchbegriff"}">${f.treffer.art === "wortlaut"
    ? `Wortlaut: „${esc(f.treffer.begriff)}“ steht so im Gesetz`
    : `Suchbegriff: „${esc(f.treffer.begriff)}“ – Zuordnung von Inspectora, nicht aus dem Gesetz`}</span>
          ${zitat(beleg, f.text, "pre").replace("<pre ", '<pre class="bk-beleg-text wissen-zitat" ')}
          ${quelle(beleg, "Amtliche Quelle öffnen")}
        </div>`;
}

function begriffsseite(b, r, alleWerte) {
  const w = werteFuer(alleWerte, b.pfad);
  const p = b.position;
  const slug = b.konf.slug;
  const b2 = b.belege["betrkv-2"];
  const b1 = b.belege["betrkv-1"];
  const nummer = p.fundstellen.find((f) => f.art === "katalog")?.nr;
  const ausschluss = p.fundstellen.find((f) => f.art === "ausschluss")?.nr;

  const fundstellen = p.fundstellen
    .map((f) => fundstelleBlock(f, f.art === "ausschluss" ? b1 : b2)).join("\n");
  const luecken = p.luecken.map((l) => `        <div class="bk-luecke"><strong>„${esc(l.begriff)}“</strong>${esc(l.hinweis)}</div>`).join("\n");
  const vorbehalte = p.vorbehalte.map((v) => `        <div class="bk-vorbehalt"><strong>Nr. ${v.nr} ist nicht allein aus dem Gesetz zu entscheiden: </strong>${esc(v.text)}</div>`).join("\n");

  const katalogListe = b.katalog.items.map((it) => {
    const text = `Nr. ${it.nr} – ${esc(it.kurztitel)}`;
    return `          <li>${it.nr === nummer ? `<strong>${text}</strong>` : text}</li>`;
  }).join("\n");
  const katalogSatz = p.verdikt === VERDIKT.LUECKE
    ? `Der Wortlaut nennt „${esc(b.konf.begriff)}“ in keiner dieser Nummern.`
    : nummer ? `Hervorgehoben: die Nummer, die „${esc(b.konf.begriff)}“ trifft.` : `„${esc(b.konf.begriff)}“ trifft keine dieser Nummern, sondern einen Ausschluss aus § 1 Abs. 2 (unten).`;
  const ausschlussListe = b.ausschluesse.posten.map((a) => {
    const text = `Nr. ${a.nr} – ${esc(a.kurztitel)}`;
    return `          <li>${a.nr === ausschluss ? `<strong>${text}</strong>` : text}</li>`;
  }).join("\n");

  const andere = r.begriffe.filter((x) => x !== b);

  const inhalt = `    <section class="bk-karte">
      <h2>Was der Wortlaut sagt</h2>
      <div class="bk-position ${KLASSE[p.verdikt]}">
        <div class="bk-position-kopf">
          <span class="bk-position-name">${esc(b.konf.begriff)}</span>
          <span class="bk-position-marken"><span class="bk-position-urteil ${KLASSE[p.verdikt]}">${w(`begriff.${slug}.urteil`)}</span></span>
        </div>
        <p class="panel-intro">${erklaerung(b)}</p>
${p.fundstellen.length ? `        <p class="panel-intro">Fundstelle: ${w(`begriff.${slug}.fundstelle`)}</p>\n` : ""}${fundstellen}
${luecken}
${vorbehalte}
      </div>
    </section>

    <section class="bk-karte">
      <h2>Der Katalog auf einen Blick</h2>
      <p>§ 2 BetrKV zählt ${w("katalog.anzahl")} Arten von Betriebskosten auf. ${katalogSatz}</p>
      <ol class="wissen-liste">
${katalogListe}
      </ol>
      <p class="panel-intro">Was ausdrücklich nicht dazugehört (§ 1 Abs. 2 BetrKV):</p>
      <ul class="wissen-liste">
${ausschlussListe}
      </ul>
      <p class="panel-intro">${quelle(b2, "§ 2 BetrKV – amtliche Quelle")} · ${quelle(b1, "§ 1 BetrKV – amtliche Quelle")}</p>
    </section>

${grenzenKarte(b.grenzen, b.modul)}

    <section class="bk-karte">
      <h2>Deine ganze Abrechnung prüfen</h2>
      <p>Im Rechner trägst du alle Positionen deiner Abrechnung ein und siehst für jede, was der Wortlaut sagt – mit derselben Engine wie diese Seite.</p>
      <p class="panel-intro"><a class="button secondary small" href="${RECHNER}#positionen">Positionen prüfen</a></p>
    </section>

${wortlautKarte(b.belege, ["betrkv-2", "betrkv-1"])}

    <section class="bk-karte">
      <h2>Weitere Posten</h2>
      <ul class="wissen-liste">
${andere.map((x) => `        <li><a href="${x.pfad}">${esc(x.konf.anzeige)}</a> – ${w(`begriff.${x.konf.slug}.urteil`)}</li>`).join("\n")}
      </ul>
      <p>Alle Fragen: <a href="${PFAD_UEBERSICHT}">Wissen</a>.</p>
    </section>`;

  return seite({
    pfad: b.pfad,
    titel: b.konf.titel,
    beschreibung: b.konf.beschreibung,
    h1: `${b.konf.anzeige} in der Nebenkostenabrechnung`,
    einleitung: `      <p class="bk-begriff">
        Darf der Posten „${esc(b.konf.begriff)}“ in die Nebenkostenabrechnung? Diese Seite zeigt, was die
        Betriebskostenverordnung dazu im Wortlaut sagt – und wo sie aufhört.
      </p>`,
    inhalt,
  });
}

// ---------------------------------------------------------------------------
// Uebersicht /wissen/
// ---------------------------------------------------------------------------

function uebersicht(r, alleWerte) {
  const w = werteFuer(alleWerte, PFAD_UEBERSICHT);
  const inhalt = `    <section class="bk-karte">
      <h2>Bis wann muss die Nebenkostenabrechnung kommen?</h2>
      <p>Für das Kalenderjahr als Abrechnungszeitraum. Fristende nach §§ 187, 188 BGB – auf jeder Seite steht zusätzlich das Datum nach § 193 BGB.</p>
      <ul class="wissen-liste">
${r.jahre.map((j) => `        <li><a href="${j.pfad}">Nebenkostenabrechnung ${j.jahr} – bis wann?</a> ${w(`jahr.${j.jahr}.fristende`)}</li>`).join("\n")}
      </ul>
    </section>

    <section class="bk-karte">
      <h2>Welche Posten nennt die Betriebskostenverordnung?</h2>
      <p>Was der Wortlaut von §§ 1 und 2 BetrKV zu einzelnen Posten sagt – und wo er nichts entscheidet.</p>
      <ul class="wissen-liste">
${r.begriffe.map((b) => `        <li><a href="${b.pfad}">${esc(b.konf.anzeige)}</a> – ${w(`begriff.${b.konf.slug}.urteil`)}</li>`).join("\n")}
      </ul>
    </section>

    <section class="bk-karte">
      <h2>Deine eigene Abrechnung</h2>
      <p>Anderer Abrechnungszeitraum, eigenes Zugangsdatum, alle Positionen auf einmal: Der Rechner nimmt deine Angaben.</p>
      <p class="panel-intro"><a class="button primary small" href="${RECHNER}">Nebenkostenabrechnung prüfen</a></p>
    </section>`;
  return seite({
    pfad: PFAD_UEBERSICHT,
    titel: UEBERSICHT.titel,
    beschreibung: UEBERSICHT.beschreibung,
    h1: "Wissen: Nebenkostenabrechnung",
    einleitung: `      <p class="bk-begriff">
        Einzelne Fragen, einzeln beantwortet – jede Seite aus derselben Engine wie der Rechner, mit der
        Vorschrift zu jedem Schritt.
      </p>`,
    inhalt,
  });
}

// ---------------------------------------------------------------------------
// Sitemap und Startseite
// ---------------------------------------------------------------------------

export function sitemapPfade(r) {
  return [
    ...WEITERE_SEITEN.map((s) => s.pfad),
    PFAD_UEBERSICHT,
    ...r.jahre.map((j) => j.pfad),
    ...r.begriffe.map((b) => b.pfad),
  ];
}

function sitemap(r) {
  const eintraege = sitemapPfade(r).map((p) => `  <url>
    <loc>${SEITE}${p}</loc>
    <changefreq>monthly</changefreq>
    <priority>${p === "/" ? "1.0" : p.startsWith("/wissen/") ? "0.6" : "0.8"}</priority>
  </url>`);
  return `<?xml version="1.0" encoding="UTF-8"?>
<!-- Erzeugt von scripts/baue-wissen.mjs - nicht von Hand aendern. -->
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${eintraege.join("\n")}
</urlset>
`;
}

export const MARKE_START = "<!-- @@BESTAND:START -->";
export const MARKE_ENDE = "<!-- @@BESTAND:ENDE -->";

// Die Liste "Was es heute gibt": Module mit Feld "oeffentlich", dann BESTAND_WEITERE.
export function bestandEintraege(daten) {
  const kuerzel = [...new Set(daten.korpus.map((p) => p.gesetz))];
  const ohneName = kuerzel.filter((k) => !WISSENSBEREICHE[k]);
  if (ohneName.length) {
    throw new Error(`Gesetz ohne Bereichsnamen in konfig.mjs (WISSENSBEREICHE): ${ohneName.join(", ")}`);
  }
  const bereiche = [...new Set(kuerzel.map((k) => WISSENSBEREICHE[k]))];
  const aufzaehlung = bereiche.length > 1
    ? bereiche.slice(0, -1).join(", ") + " und " + bereiche[bereiche.length - 1]
    : bereiche[0];
  return [
    ...MODULE.filter((m) => m.oeffentlich).map((m) => ({ titel: m.oeffentlich.titel, url: m.oeffentlich.url })),
    ...BESTAND_WEITERE.map((e) => ({ titel: e.titel.replace("{bereiche}", aufzaehlung), url: e.url })),
  ];
}

export function bestandHtml(daten) {
  const zeilen = bestandEintraege(daten)
    .map((e) => `            <li><a href="${esc(e.url)}">${esc(e.titel)}</a></li>`);
  return `${MARKE_START}
          <ul class="bestand-liste">
${zeilen.join("\n")}
          </ul>
          ${MARKE_ENDE}`;
}

function startseite(daten) {
  const html = fs.readFileSync(path.join(WURZEL, "index.html"), "utf8");
  const a = html.indexOf(MARKE_START);
  const e = html.indexOf(MARKE_ENDE);
  if (a === -1 || e === -1 || e < a) throw new Error("index.html: BESTAND-Marken fehlen oder stehen verkehrt");
  return html.slice(0, a) + bestandHtml(daten) + html.slice(e + MARKE_ENDE.length);
}

// ---------------------------------------------------------------------------
// Alles bauen - ohne zu schreiben. Rueckgabe: Map Datei (relativ) -> Inhalt.
// ---------------------------------------------------------------------------

export function baue() {
  const daten = ladeDaten();
  const r = rechneAlles(daten);
  const alleWerte = werte(r);

  for (const s of WEITERE_SEITEN) {
    if (!fs.existsSync(path.join(WURZEL, s.datei))) throw new Error(`Sitemap-Seite fehlt: ${s.datei}`);
  }

  const dateien = new Map();
  dateien.set(dateiVon(PFAD_UEBERSICHT), uebersicht(r, alleWerte));
  for (const j of r.jahre) dateien.set(dateiVon(j.pfad), jahresseite(j, r, alleWerte));
  for (const b of r.begriffe) dateien.set(dateiVon(b.pfad), begriffsseite(b, r, alleWerte));
  dateien.set("sitemap.xml", sitemap(r));
  dateien.set("index.html", startseite(daten));
  return { dateien, r, alleWerte, daten };
}

// ---------------------------------------------------------------------------

const direkt = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (direkt) {
  try {
    const { dateien } = baue();
    // Seiten, die es nicht mehr gibt, bleiben NICHT still liegen: Der Waechter meldet
    // sie. Geloescht wird hier nichts - das entscheidet ein Mensch.
    fs.mkdirSync(path.join(WURZEL, "wissen"), { recursive: true });
    for (const [datei, inhalt] of dateien) {
      fs.writeFileSync(path.join(WURZEL, datei), inhalt, "utf8");
      console.log(`[baue-wissen] geschrieben: ${datei}`);
    }
    console.log(`[baue-wissen] ${dateien.size} Dateien. Jetzt: npm run pruefe-wissen`);
  } catch (fehler) {
    console.error("[baue-wissen] Abbruch:", fehler.message);
    process.exit(1);
  }
}

export { pfadJahr, pfadBegriff };
