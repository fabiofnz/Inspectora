// netlify/lib/feedback-frist.mjs
// Loeschfrist fuer Feedback im Blob-Store "assistant-feedback": sechs Monate.
//
// Warum eine eigene Datei: Die Logik soll ohne Netlify pruefbar sein
// (npm run pruefe-feedback-frist). Die geplante Function
// netlify/functions/feedback-aufraeumen.mjs gibt nur den echten Store hinein.
// Diese Datei liegt bewusst NICHT in netlify/functions - sonst waere sie selbst
// eine Function.
//
// Grundsatz: Ein Schluessel, dessen Datum sich nicht lesen laesst, wird NICHT
// geloescht, sondern gemeldet. Etwas zu loeschen, das man nicht datieren kann,
// waere der schlimmere Fehler von beiden.

export const FRIST_MONATE = 6;

// Schluesselformat aus feedback.mjs: feedback:<ISO-Zeitstempel>-<Zufall>
// Beispiel: feedback:2026-09-24T14:03:11.512Z-k3j9x2
// Der Zufallsteil (Math.random().toString(36).slice(2, 8)) kann kurz oder im
// Extremfall leer sein - daher "*", nicht "+".
const SCHLUESSEL = /^feedback:(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z)-[a-z0-9]*$/;

export function datumAusSchluessel(schluessel) {
  const treffer = SCHLUESSEL.exec(schluessel);
  if (!treffer) return null;
  const zeit = Date.parse(treffer[1]);
  return Number.isNaN(zeit) ? null : new Date(zeit);
}

// Sechs Kalendermonate zurueck, nicht 183 Tage - so steht es auch in der
// Datenschutzerklaerung. Gibt es den Tag im Zielmonat nicht (31.08. -> Februar),
// gilt der letzte Tag des Zielmonats. Ein einfaches setUTCMonth wuerde in den
// Maerz ueberlaufen und damit bis zu drei Tage laenger aufbewahren.
export function fristGrenze(jetzt) {
  const j = new Date(jetzt);
  const zielMonat = j.getUTCMonth() - FRIST_MONATE;
  const letzterTag = new Date(Date.UTC(j.getUTCFullYear(), zielMonat + 1, 0)).getUTCDate();
  return new Date(Date.UTC(
    j.getUTCFullYear(), zielMonat, Math.min(j.getUTCDate(), letzterTag),
    j.getUTCHours(), j.getUTCMinutes(), j.getUTCSeconds(), j.getUTCMilliseconds(),
  ));
}

// Teilt Schluessel in: loeschen (aelter als die Grenze), behalten, ohneDatum.
export function sortiere(schluessel, jetzt) {
  const grenze = fristGrenze(jetzt);
  const ergebnis = { grenze, loeschen: [], behalten: [], ohneDatum: [] };
  for (const s of schluessel) {
    const datum = datumAusSchluessel(s);
    if (!datum) ergebnis.ohneDatum.push(s);
    else if (datum < grenze) ergebnis.loeschen.push(s);
    else ergebnis.behalten.push(s);
  }
  return ergebnis;
}

// Der eigentliche Lauf. `store` braucht nur list() und delete() - im Betrieb der
// Netlify-Blob-Store, im Test ein Nachbau. Gibt die Zahlen zurueck, loggt selbst
// nicht: Das Logging macht die Function, mit ihrem Praefix.
export async function aufraeumen(store, jetzt = Date.now()) {
  const { blobs } = await store.list(); // ohne paginate: alle Seiten
  const s = sortiere(blobs.map((b) => b.key), jetzt);
  const fehlgeschlagen = [];
  for (const schluessel of s.loeschen) {
    try {
      await store.delete(schluessel);
    } catch (fehler) {
      fehlgeschlagen.push({ schluessel, fehler: String(fehler?.message ?? fehler) });
    }
  }
  return {
    grenze: s.grenze.toISOString(),
    geprueft: blobs.length,
    geloescht: s.loeschen.length - fehlgeschlagen.length,
    behalten: s.behalten.length,
    ohneDatum: s.ohneDatum,
    fehlgeschlagen,
  };
}
