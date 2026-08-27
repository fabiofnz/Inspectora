// betriebskosten-pruefer.js
// Oberflaeche fuer die Fristberechnung (Teil A des Betriebskosten-Pruefers).
//
// Diese Datei rechnet nichts. Sie sammelt zwei Datumsangaben ein, uebergibt sie an
// kern/frist.mjs und baut aus dem Ergebnis die Ausgabe. Genau dieselbe Kern-Datei
// laeuft in scripts/pruefe-betriebskosten.js unter Test - was hier im Browser
// angezeigt wird, ist damit dasselbe, was dort nachgerechnet wurde.
//
// Kein localStorage, bewusst. Die anderen Werkzeuge speichern ihre Projekte lokal;
// hier waere das falsch: In einer Betriebskostenabrechnung stehen Name und Anschrift
// des Mieters. Was nicht gespeichert wird, kann auch nicht liegen bleiben.
//
// Es gibt auf dieser Seite ausserdem keinen einzigen Netzaufruf ausser dem Laden der
// Wissensbasis - keine Function, keine Edge Function, keine KI. Die Eingaben des
// Nutzers verlassen das Geraet nicht, weil es keinen Weg gibt, auf dem sie es
// koennten.

"use strict";

import { pruefeFristen } from "./kern/frist.mjs";
import { formatiereMitWochentag } from "./kern/datum.mjs";
import { pruefePositionen, VERDIKT } from "./kern/katalog.mjs";

const LOG = "[betriebskosten-pruefer]";
const WISSENSBASIS = "wissensbasis/gesetze.json";
const BEGRIFFE = "wissensbasis/betriebskosten-begriffe.json";

const form         = document.getElementById("bkForm");
const eingabeEnde  = document.getElementById("bkZeitraumEnde");
const eingabeZugang = document.getElementById("bkZugang");
const knopfSenden  = document.getElementById("bkSubmitButton");
const knopfLeeren  = document.getElementById("bkResetButton");
const statusBereich = document.getElementById("bkStatus");
const ergebnisBereich = document.getElementById("bkErgebnis");

// Teil B
const eingabePositionen  = document.getElementById("bkPositionen");
const schalterAlleZeilen = document.getElementById("bkAlleZeilen");
const knopfPositionen    = document.getElementById("bkPositionenButton");
const knopfPositionenLeeren = document.getElementById("bkPositionenReset");
const positionenStatus   = document.getElementById("bkPositionenStatus");
const positionenErgebnis = document.getElementById("bkPositionenErgebnis");

// Zustand der Seite. Vom Nutzer bestaetigte Feiertage werden hier gehalten und bei
// jeder Neuberechnung mitgegeben - sie gehoeren zur Eingabe, nicht zur Anzeige.
let korpus = null;
let begriffe = null;
let feiertageBestaetigt = [];

// ---------------------------------------------------------------------------
// Kleine DOM-Hilfen
// ---------------------------------------------------------------------------

// Alles wird ueber textContent gesetzt, nicht ueber innerHTML. Der Gesetzestext
// kommt zwar aus der eigenen Wissensbasis, aber eine Ausgabe, die HTML
// interpretiert, ist eine Tuer, die man nicht aufmacht, wenn man sie nicht braucht.
function el(tag, klasse, text) {
  const knoten = document.createElement(tag);
  if (klasse) knoten.className = klasse;
  if (text !== undefined && text !== null) knoten.textContent = text;
  return knoten;
}

function link(url, text) {
  const a = el("a", "bk-quelle", text);
  a.href = url;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  return a;
}

function leere(knoten) {
  while (knoten.firstChild) knoten.removeChild(knoten.firstChild);
}

// Lokales Datum als ISO - ohne den Umweg ueber toISOString(), der in Zeitzonen
// oestlich von UTC den Vortag liefern kann.
function heuteIso() {
  const jetzt = new Date();
  const zwei = (n) => String(n).padStart(2, "0");
  return `${jetzt.getFullYear()}-${zwei(jetzt.getMonth() + 1)}-${zwei(jetzt.getDate())}`;
}

// ---------------------------------------------------------------------------
// Wissensbasis laden
// ---------------------------------------------------------------------------

// Solange die Wissensbasis nicht geladen ist, bleibt der Knopf gesperrt. Das ist
// keine Bequemlichkeit, sondern die Regel dieser Seite: keine Regel ohne Beleg.
async function ladeWissensbasis() {
  zeigeStatus("laden");
  try {
    const antwort = await fetch(WISSENSBASIS, { cache: "no-cache" });
    if (!antwort.ok) throw new Error("HTTP " + antwort.status);
    const daten = await antwort.json();
    if (!Array.isArray(daten) || daten.length === 0) throw new Error("Wissensbasis ist leer");

    // Probelauf: Sind die vier benoetigten Paragraphen samt Quell-Link da? Erst
    // wenn das steht, wird das Formular freigegeben. Sonst faellt der Ausfall erst
    // auf, nachdem der Nutzer schon auf "Berechnen" gedrueckt hat.
    const probe = pruefeFristen({ zeitraumEndeIso: "2024-12-31" }, daten);
    if (!probe.ok && probe.grund === "belege-fehlen") {
      korpus = null;
      zeigeStatus("belege-fehlen", probe.fehlend);
      console.error(LOG, "Wissensbasis geladen, aber unvollstaendig:", probe.fehlend);
      return;
    }

    korpus = daten;
    knopfSenden.disabled = false;
    zeigeStatus("bereit");
    console.log(LOG, `Wissensbasis geladen: ${daten.length} Paragraphen, Fristmodul einsatzbereit.`);

    await ladeBegriffe();
  } catch (fehler) {
    korpus = null;
    zeigeStatus("ausfall", null, fehler.message);
    console.error(LOG, "Wissensbasis konnte nicht geladen werden:", fehler);
  }
}

// Teil B haengt an zwei Dateien: der Wissensbasis (Gesetzestext) und der
// Begriffsdatei (Zuordnung der Alltagswoerter). Faellt eine davon aus, bleibt
// die Positionspruefung gesperrt - die Fristberechnung oben laeuft weiter.
// Die beiden Teile sind bewusst unabhaengig voneinander.
async function ladeBegriffe() {
  try {
    const antwort = await fetch(BEGRIFFE, { cache: "no-cache" });
    if (!antwort.ok) throw new Error("HTTP " + antwort.status);
    const daten = await antwort.json();

    const probe = pruefePositionen({ text: "Grundsteuer" }, korpus, daten);
    if (!probe.ok) throw new Error("Probelauf fehlgeschlagen: " + probe.grund);

    begriffe = daten;
    knopfPositionen.disabled = false;
    leere(positionenStatus);
    console.log(LOG, "Begriffsdatei geladen, Positionspruefung einsatzbereit.");
  } catch (fehler) {
    begriffe = null;
    knopfPositionen.disabled = true;
    leere(positionenStatus);
    const kasten = el("div", "bk-ausfall");
    kasten.appendChild(el("strong", null, "Die Positionsprüfung ist nicht verfügbar."));
    kasten.appendChild(el("p", null,
      "Der Katalog der Betriebskostenverordnung konnte nicht geladen werden. Diese Seite "
      + "zeigt keine Zuordnung an, die sie nicht belegen kann. Die Fristberechnung oben "
      + "ist davon nicht betroffen."));
    kasten.appendChild(el("p", null, "Technischer Hinweis: " + fehler.message));
    positionenStatus.appendChild(kasten);
    console.error(LOG, "Begriffsdatei konnte nicht geladen werden:", fehler);
  }
}

function zeigeStatus(art, fehlend, meldung) {
  leere(statusBereich);

  if (art === "bereit") return;

  if (art === "laden") {
    const kasten = el("div", "hg-hint-box");
    kasten.appendChild(el("strong", null, "Wissensbasis wird geladen …"));
    statusBereich.appendChild(kasten);
    return;
  }

  const kasten = el("div", "bk-ausfall");
  kasten.appendChild(el("strong", null, "Die Wissensbasis ist nicht verfügbar."));
  kasten.appendChild(el("p", null,
    "Diese Seite zeigt keine Frist an, die sie nicht belegen kann. Ein Datum ohne "
    + "Quellenangabe sieht genauso zuverlässig aus wie eines mit – deshalb bleibt die "
    + "Berechnung gesperrt, bis die Gesetzestexte geladen sind. Bitte die Seite neu laden."));

  if (art === "belege-fehlen" && Array.isArray(fehlend)) {
    const liste = el("ul");
    for (const eintrag of fehlend) {
      liste.appendChild(el("li", null,
        `${eintrag.paragraph} ${eintrag.gesetz} (${eintrag.zweck}): ${eintrag.grund}`));
    }
    kasten.appendChild(liste);
  }
  if (meldung) kasten.appendChild(el("p", null, "Technischer Hinweis: " + meldung));

  statusBereich.appendChild(kasten);
}

// ---------------------------------------------------------------------------
// Ausgabe
// ---------------------------------------------------------------------------

const VERDIKT_TEXT = {
  abrechnungsfrist: {
    gewahrt: {
      klasse: "ist-gewahrt", kopf: "Zugang innerhalb der Frist",
      text: "Der Zugang liegt vor dem Ablauf der Frist nach §§ 187 Abs. 1, 188 BGB.",
    },
    abhaengig: {
      klasse: "ist-abhaengig", kopf: "Nicht eindeutig",
      text: "Der Zugang liegt zwischen den beiden Daten. Ob die Frist gewahrt ist, hängt "
        + "davon ab, ob § 193 BGB auf diese Frist anzuwenden ist. Das entscheidet dieses "
        + "Werkzeug nicht.",
    },
    versaeumt: {
      klasse: "ist-versaeumt", kopf: "Zugang nach beiden Daten",
      text: "Der Zugang liegt nach dem Fristende nach §§ 187 Abs. 1, 188 BGB und auch nach "
        + "dem nach § 193 BGB verschobenen Datum.",
    },
  },
  einwendungsfrist: {
    gewahrt: {
      klasse: "ist-gewahrt", kopf: "Frist läuft noch",
      text: "Der heutige Tag liegt vor dem Ablauf der Frist nach §§ 187 Abs. 1, 188 BGB.",
    },
    abhaengig: {
      klasse: "ist-abhaengig", kopf: "Nicht eindeutig",
      text: "Der heutige Tag liegt zwischen den beiden Daten. Ob die Frist noch läuft, hängt "
        + "davon ab, ob § 193 BGB auf diese Frist anzuwenden ist. Das entscheidet dieses "
        + "Werkzeug nicht.",
    },
    versaeumt: {
      klasse: "ist-versaeumt", kopf: "Frist abgelaufen",
      text: "Der heutige Tag liegt nach dem Fristende nach §§ 187 Abs. 1, 188 BGB und auch "
        + "nach dem nach § 193 BGB verschobenen Datum.",
    },
  },
};

function baueFeiertagsfrage(iso, anzeige, bereitsGesetzt) {
  const label = el("label", "bk-feiertagsfrage");
  const kasten = document.createElement("input");
  kasten.type = "checkbox";
  kasten.checked = bereitsGesetzt;
  kasten.addEventListener("change", () => {
    feiertageBestaetigt = kasten.checked
      ? [...new Set([...feiertageBestaetigt, iso])]
      : feiertageBestaetigt.filter((d) => d !== iso);
    berechne();
  });
  label.appendChild(kasten);

  const text = el("span");
  text.appendChild(document.createTextNode(
    `Ist der ${anzeige} an Ihrem Ort ein gesetzlicher Feiertag?`));
  text.appendChild(el("small", null, bereitsGesetzt
    ? "Ihre Angabe. Das Häkchen entfernen nimmt sie zurück."
    : "Landesrechtliche Feiertage wie Fronleichnam, Reformationstag oder Allerheiligen "
      + "kennt dieses Werkzeug nicht. Wenn Sie hier ankreuzen, wird die Verschiebung nach "
      + "§ 193 BGB mit Ihrer Angabe gerechnet und als Ihre Angabe ausgewiesen."));
  label.appendChild(text);
  return label;
}

function baueFristKarte(frist, belege, zitate) {
  const karte = el("section", "bk-karte");
  karte.appendChild(el("h2", null, frist.titel));

  const grundlage = el("span", "bk-grundlage", frist.grundlage);
  karte.appendChild(grundlage);

  karte.appendChild(el("p", null, "„" + frist.satz + "“"));

  const start = el("p", null,
    `Fristbeginn: ${frist.startLabel} am `
    + `${frist.startIso.split("-").reverse().join(".")}.`);
  start.className = "panel-intro";
  karte.appendChild(start);

  // Die beiden Daten. Immer beide, auch wenn sie identisch sind.
  const daten = el("div", "bk-daten");

  const linkeBox = el("div", "bk-datum-box");
  linkeBox.appendChild(el("span", "bk-label", "Fristende nach §§ 187 Abs. 1, 188 BGB"));
  linkeBox.appendChild(el("strong", "bk-datum-wert", frist.basis.anzeige));
  linkeBox.appendChild(el("p", null, frist.basis.abs3Angewendet
    ? "Der Tag gleicher Zahl fehlt im Zielmonat – § 188 Abs. 3 BGB zieht das Fristende auf "
      + "den Monatsletzten."
    : "Ohne Anwendung des § 193 BGB."));
  daten.appendChild(linkeBox);

  const rechteBox = el("div", "bk-datum-box"
    + (frist.verschiebung.verschoben ? " ist-verschoben" : ""));
  rechteBox.appendChild(el("span", "bk-label", "Fristende bei Anwendung des § 193 BGB"));
  rechteBox.appendChild(el("strong", "bk-datum-wert", frist.verschiebung.anzeige));
  rechteBox.appendChild(el("p", null, frist.verschiebung.verschoben
    ? `Verschoben nach § 193 BGB. Grund: ${frist.verschiebung.grund.text}.`
    : "Keine Verschiebung – der Tag ist ein Werktag und kein Feiertag der "
      + "bundeseinheitlichen Liste."));
  daten.appendChild(rechteBox);

  karte.appendChild(daten);

  // Der Grund, warum hier zwei Daten stehen und nicht eines.
  const zweiDaten = el("div", "hg-hint-box");
  zweiDaten.appendChild(el("strong", null, "Warum zwei Daten? "));
  // Der Tatbestand des § 193 BGB kommt aus dem Kern und wird dort gegen die
  // Wissensbasis geprueft - nicht hier aus dem Gedaechtnis getippt.
  zweiDaten.appendChild(document.createTextNode(
    `§ 193 BGB gilt, wenn ${zitate.paragraf193Voraussetzung} ist. Ob das auf diese Frist `
    + "zutrifft, ist eine Auslegungsfrage und nicht durch Rechnen zu klären. Dieses "
    + "Werkzeug zeigt deshalb beide Daten und entscheidet nicht, welches gilt."));
  karte.appendChild(zweiDaten);

  // Herkunftsmarke, sobald ein Feiertag im Spiel ist.
  if (frist.verschiebung.verschoben && frist.verschiebung.grund.art === "feiertag") {
    const herkunft = el("div", "bk-herkunft");
    herkunft.textContent = frist.verschiebung.grund.herkunft === "nutzerangabe"
      ? "Diese Verschiebung beruht auf Ihrer eigenen Angabe, nicht auf einer Berechnung."
      : "Feiertage stammen nicht aus der Wissensbasis. Berücksichtigt sind nur die neun "
        + "bundesweit einheitlichen Feiertage – landesrechtliche Feiertage fehlen.";
    karte.appendChild(herkunft);
  }

  // Bewertung.
  if (frist.bewertung) {
    const texte = VERDIKT_TEXT[frist.schluessel][frist.bewertung.status];
    const verdikt = el("div", "bk-verdikt " + texte.klasse);
    verdikt.appendChild(el("strong", null, texte.kopf + " "));
    verdikt.appendChild(el("span", null, texte.text));
    karte.appendChild(verdikt);
  }

  // Frage nach einem landesrechtlichen Feiertag - und die Moeglichkeit, eine
  // bereits gesetzte Angabe wieder zurueckzunehmen.
  //
  // Wichtig: Sobald ein Tag bestaetigt ist, wandert die offene Frage auf den
  // naechsten Werktag. Ohne die bereits bestaetigten Tage hier waere das Haekchen
  // nach dem Setzen verschwunden und nicht mehr abwaehlbar - eine Angabe, die man
  // nicht zuruecknehmen kann, ist eine Falle.
  const bestaetigteHier = frist.verschiebung.kette
    .filter((glied) => glied.herkunft === "nutzerangabe")
    .map((glied) => glied.iso);

  for (const iso of bestaetigteHier) {
    karte.appendChild(baueFeiertagsfrage(iso, formatiereMitWochentag(iso), true));
  }
  if (frist.feiertagsfrage) {
    karte.appendChild(baueFeiertagsfrage(
      frist.feiertagsfrage.iso, frist.feiertagsfrage.anzeige, false));
  }

  // Rechenweg mit Beleg je Schritt.
  karte.appendChild(el("h3", "bk-label", "Rechenweg"));
  const schritte = el("ol", "bk-schritte");
  for (const schritt of frist.schritte) {
    const beleg = belege[schritt.beleg];
    const eintrag = el("li", "bk-schritt");
    eintrag.appendChild(el("strong", null, schritt.bezeichnung));
    eintrag.appendChild(el("p", null, schritt.erklaerung));
    if (beleg) {
      eintrag.appendChild(link(beleg.quelle,
        `${beleg.paragraph} ${beleg.gesetz} – ${beleg.titel} (amtliche Quelle)`));
    }
    schritte.appendChild(eintrag);
  }
  karte.appendChild(schritte);

  return karte;
}

function baueBelegKarte(belege) {
  const karte = el("section", "bk-karte");
  karte.appendChild(el("h2", null, "Die zitierten Vorschriften im Wortlaut"));
  karte.appendChild(el("p", null,
    "Alle Texte stammen aus der Wissensbasis von Inspectora und sind von "
    + "gesetze-im-internet.de importiert. Maßgeblich ist der amtliche Text."));

  for (const schluessel of Object.keys(belege)) {
    const beleg = belege[schluessel];
    const block = document.createElement("details");
    block.className = "bk-beleg";
    const kopf = document.createElement("summary");
    kopf.textContent = `${beleg.paragraph} ${beleg.gesetz} – ${beleg.titel}`;
    block.appendChild(kopf);
    block.appendChild(el("pre", "bk-beleg-text", beleg.text));
    const fuss = el("div", "bk-beleg-fuss");
    if (beleg.stand) fuss.appendChild(el("div", null, "Stand: " + beleg.stand));
    if (beleg.hinweis) fuss.appendChild(el("div", null, beleg.hinweis));
    fuss.appendChild(link(beleg.quelle, "Amtliche Quelle öffnen"));
    block.appendChild(fuss);
    karte.appendChild(block);
  }
  return karte;
}

function baueRechtshinweis() {
  const kasten = el("div", "hg-hint-box hg-hint-warn");
  kasten.appendChild(el("strong", null, "Keine Rechtsberatung. "));
  kasten.appendChild(document.createTextNode(
    "Dieses Werkzeug rechnet zwei Fristen nach dem Wortlaut des Gesetzes aus und nennt zu "
    + "jedem Schritt die Vorschrift. Es sagt nicht, was aus einem Ergebnis folgt – ob eine "
    + "Frist im Einzelfall anders läuft, ob Gründe für eine verspätete Geltendmachung "
    + "vorliegen und welche Folgen das hat, ist eine rechtliche Bewertung. Die trifft ein "
    + "Mensch, nicht diese Seite."));
  return kasten;
}

// ---------------------------------------------------------------------------
// Berechnung ausloesen
// ---------------------------------------------------------------------------

function berechne() {
  leere(ergebnisBereich);

  if (!korpus) {
    console.warn(LOG, "Berechnung abgelehnt: keine Wissensbasis.");
    return;
  }

  const ergebnis = pruefeFristen({
    zeitraumEndeIso: eingabeEnde.value || null,
    zugangIso: eingabeZugang.value || null,
    heuteIso: heuteIso(),
    feiertageBestaetigt,
  }, korpus);

  if (!ergebnis.ok) {
    const kasten = el("div", "bk-fehlerliste");
    const liste = el("ul");
    for (const meldung of (ergebnis.fehler || ["Die Berechnung ist nicht möglich."])) {
      liste.appendChild(el("li", null, meldung));
    }
    kasten.appendChild(liste);
    ergebnisBereich.appendChild(kasten);
    console.warn(LOG, "Eingabe zurueckgewiesen:", ergebnis.fehler || ergebnis.grund);
    return;
  }

  for (const hinweis of ergebnis.hinweise) {
    const kasten = el("div", "hg-hint-box");
    kasten.textContent = hinweis;
    ergebnisBereich.appendChild(kasten);
  }

  if (ergebnis.abrechnungsfrist) {
    ergebnisBereich.appendChild(
      baueFristKarte(ergebnis.abrechnungsfrist, ergebnis.belege, ergebnis.zitate));
  }
  if (ergebnis.einwendungsfrist) {
    ergebnisBereich.appendChild(
      baueFristKarte(ergebnis.einwendungsfrist, ergebnis.belege, ergebnis.zitate));
  }

  ergebnisBereich.appendChild(baueBelegKarte(ergebnis.belege));

  const hinweisKarte = el("section", "bk-karte");
  hinweisKarte.appendChild(baueRechtshinweis());
  ergebnisBereich.appendChild(hinweisKarte);

  console.log(LOG, "Fristen berechnet.",
    "Abrechnungsfrist:", ergebnis.abrechnungsfrist
      ? ergebnis.abrechnungsfrist.basis.iso + " / " + ergebnis.abrechnungsfrist.verschiebung.zielIso
      : "nicht berechnet",
    "| Einwendungsfrist:", ergebnis.einwendungsfrist
      ? ergebnis.einwendungsfrist.basis.iso + " / " + ergebnis.einwendungsfrist.verschiebung.zielIso
      : "nicht berechnet");
}

// ---------------------------------------------------------------------------
// Teil B - Ausgabe der Positionspruefung
// ---------------------------------------------------------------------------

const URTEIL = {
  [VERDIKT.KATALOG]: { klasse: "ist-katalog", text: "Im Katalog" },
  [VERDIKT.AUSGESCHLOSSEN]: { klasse: "ist-ausschluss", text: "Nicht umlagefähig" },
  [VERDIKT.MIETVERTRAG]: { klasse: "ist-vertrag", text: "Mietvertrag erforderlich" },
  [VERDIKT.UNBEKANNT]: { klasse: "ist-unbekannt", text: "Nicht zuordenbar" },
};

function baueFundstelle(fundstelle) {
  const block = el("div", "bk-fundstelle");
  block.appendChild(el("div", "bk-fundstelle-kopf", fundstelle.bezeichnung));
  block.appendChild(el("div", "bk-fundstelle-kurz", fundstelle.kurztitel));

  // Woran der Treffer haengt. Ein Suchbegriff ist eine redaktionelle Zuordnung
  // und wird als solche benannt - samt dem Wort, das ihn ausgeloest hat.
  const marke = el("span", "bk-treffer "
    + (fundstelle.treffer.art === "wortlaut" ? "ist-wortlaut" : "ist-suchbegriff"));
  marke.textContent = fundstelle.treffer.art === "wortlaut"
    ? `Wortlaut: „${fundstelle.treffer.begriff}“ steht so im Gesetz`
    : `Suchbegriff: „${fundstelle.treffer.begriff}“ – Zuordnung von Inspectora, nicht aus dem Gesetz`;
  block.appendChild(marke);

  const text = document.createElement("details");
  text.className = "bk-beleg";
  const kopf = document.createElement("summary");
  kopf.textContent = "Wortlaut der Vorschrift";
  text.appendChild(kopf);
  text.appendChild(el("pre", "bk-beleg-text", fundstelle.text));
  const fuss = el("div", "bk-beleg-fuss");
  fuss.appendChild(link(fundstelle.quelle, "Amtliche Quelle öffnen"));
  text.appendChild(fuss);
  block.appendChild(text);

  return block;
}

function bauePosition(position) {
  const urteil = URTEIL[position.verdikt];
  const karte = el("div", "bk-position " + urteil.klasse);

  const kopf = el("div", "bk-position-kopf");
  kopf.appendChild(el("span", "bk-position-name", position.bezeichnung || position.rohzeile));
  kopf.appendChild(el("span", "bk-position-urteil " + urteil.klasse, urteil.text));
  karte.appendChild(kopf);

  for (const fundstelle of position.fundstellen) karte.appendChild(baueFundstelle(fundstelle));

  for (const vorbehalt of position.vorbehalte) {
    const kasten = el("div", "bk-vorbehalt");
    kasten.appendChild(el("strong", null, `Nr. ${vorbehalt.nr} ist nicht allein aus dem Gesetz zu entscheiden: `));
    kasten.appendChild(document.createTextNode(vorbehalt.text));
    karte.appendChild(kasten);
  }

  // "Nicht zuordenbar" ist eine Aussage ueber dieses Werkzeug, nicht ueber die
  // Position. Der Text sagt genau das - und nichts darueber hinaus.
  if (position.verdikt === VERDIKT.UNBEKANNT) {
    karte.appendChild(el("div", "bk-unbekannt-text",
      "Dieser Begriff ist keiner Nummer des Katalogs und keinem Ausschluss zugeordnet. "
      + "Das heißt nicht, dass die Position unzulässig ist – es heißt, dass dieses Werkzeug "
      + "sie nicht einordnen kann."));
  }

  return karte;
}

function baueZaehler(z) {
  const leiste = el("div", "bk-zaehler");
  const zeige = (klasse, wert, text) => {
    const span = el("span", klasse || null);
    span.appendChild(el("b", null, String(wert)));
    span.appendChild(document.createTextNode(text));
    leiste.appendChild(span);
  };
  zeige("ist-katalog", z.imKatalog, "im Katalog");
  zeige("ist-ausschluss", z.nichtUmlagefaehig, "nicht umlagefähig");
  zeige("ist-vertrag", z.mietvertrag, "Mietvertrag erforderlich");
  zeige(null, z.nichtZuordenbar, "nicht zuordenbar");
  zeige(null, z.nichtGewertet, "nicht als Position gewertet");
  return leiste;
}

function pruefeListe() {
  leere(positionenErgebnis);

  if (!korpus || !begriffe) {
    console.warn(LOG, "Positionspruefung abgelehnt: Katalog oder Begriffsdatei fehlt.");
    return;
  }

  const text = eingabePositionen.value;
  if (text.trim() === "") {
    const kasten = el("div", "bk-fehlerliste");
    kasten.textContent = "Bitte zuerst die Positionen aus der Abrechnung eintragen.";
    positionenErgebnis.appendChild(kasten);
    return;
  }

  const ergebnis = pruefePositionen(
    { text, alleZeilenPruefen: schalterAlleZeilen.checked }, korpus, begriffe);

  if (!ergebnis.ok) {
    const kasten = el("div", "bk-ausfall");
    kasten.appendChild(el("strong", null, "Die Positionsprüfung ist nicht verfügbar."));
    kasten.appendChild(el("p", null,
      "Ohne den Katalog aus der Betriebskostenverordnung wird hier nichts zugeordnet."));
    positionenErgebnis.appendChild(kasten);
    console.error(LOG, "Positionspruefung nicht moeglich:", ergebnis.grund);
    return;
  }

  const karte = el("section", "bk-karte");
  karte.appendChild(el("h2", null, "Ergebnis der Positionsprüfung"));
  karte.appendChild(el("p", null,
    `${ergebnis.zusammenfassung.zeilenGesamt} Zeilen gelesen, `
    + `${ergebnis.zusammenfassung.geprueft} davon als Position geprüft. Geprüft wird gegen den `
    + `Katalog in § 2 BetrKV und die Ausschlüsse in § 1 Abs. 2 BetrKV.`));
  karte.appendChild(baueZaehler(ergebnis.zusammenfassung));

  for (const position of ergebnis.positionen) karte.appendChild(bauePosition(position));

  // Aussortierte Zeilen: eingeklappt, aber vollstaendig und mit Grund. Nichts
  // wird geloescht - eine still verschwundene Zeile waere eine Position, die
  // niemand geprueft hat, auf einer Seite, die aussieht, als waere alles geprueft.
  if (ergebnis.nichtGewertet.length > 0) {
    const block = document.createElement("details");
    block.className = "bk-aussortiert";
    const kopf = document.createElement("summary");
    kopf.textContent = `${ergebnis.nichtGewertet.length} Zeilen nicht als Position gewertet `
      + "– nichts davon wurde gelöscht";
    block.appendChild(kopf);
    const liste = el("ul");
    for (const zeile of ergebnis.nichtGewertet) {
      const eintrag = el("li");
      eintrag.appendChild(el("span", null, zeile.rohzeile));
      eintrag.appendChild(document.createTextNode(" – " + zeile.grund));
      liste.appendChild(eintrag);
    }
    block.appendChild(liste);
    karte.appendChild(block);
  }

  positionenErgebnis.appendChild(karte);

  const hinweisKarte = el("section", "bk-karte");
  const kasten = el("div", "hg-hint-box hg-hint-warn");
  kasten.appendChild(el("strong", null, "Keine Rechtsberatung. "));
  kasten.appendChild(document.createTextNode(
    "Diese Prüfung sagt, ob eine Bezeichnung im Katalog der Betriebskostenverordnung steht "
    + "oder von ihm ausgenommen ist – mit dem Wortlaut daneben. Sie sagt nicht, ob die "
    + "Position in Ihrem Fall zu Recht abgerechnet wurde und was daraus folgt. Ob eine "
    + "Umlage wirksam vereinbart ist, steht im Mietvertrag; alles Weitere ist eine "
    + "rechtliche Bewertung, die ein Mensch treffen muss."));
  hinweisKarte.appendChild(kasten);
  positionenErgebnis.appendChild(hinweisKarte);

  const z = ergebnis.zusammenfassung;
  console.log(LOG, "Positionen geprueft.",
    `${z.geprueft} Positionen, ${z.imKatalog} im Katalog, ${z.nichtUmlagefaehig} ausgeschlossen, `
    + `${z.mietvertrag} mit Vertragsvorbehalt, ${z.nichtZuordenbar} nicht zuordenbar, `
    + `${z.nichtGewertet} nicht gewertet.`);
}

// ---------------------------------------------------------------------------
// Ereignisse
// ---------------------------------------------------------------------------

form.addEventListener("submit", (ereignis) => {
  ereignis.preventDefault();
  // Eine neue Berechnung startet ohne die alten Feiertagsangaben - sie gehoerten
  // zu anderen Daten und waeren hier stille Altlasten.
  feiertageBestaetigt = [];
  berechne();
});

knopfLeeren.addEventListener("click", () => {
  eingabeEnde.value = "";
  eingabeZugang.value = "";
  feiertageBestaetigt = [];
  leere(ergebnisBereich);
});

knopfPositionen.addEventListener("click", pruefeListe);

// Der Schalter aendert das Ergebnis, also wird sofort neu geprueft - aber nur,
// wenn schon ein Ergebnis dasteht. Sonst waere es ein Klick ins Leere.
schalterAlleZeilen.addEventListener("change", () => {
  if (positionenErgebnis.childElementCount > 0) pruefeListe();
});

knopfPositionenLeeren.addEventListener("click", () => {
  eingabePositionen.value = "";
  leere(positionenErgebnis);
});

ladeWissensbasis();
