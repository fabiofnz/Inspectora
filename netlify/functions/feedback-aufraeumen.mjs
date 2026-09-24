import { getStore } from "@netlify/blobs";
import { aufraeumen } from "../lib/feedback-frist.mjs";

// Netlify Functions v2, geplant: laeuft einmal taeglich um 00:00 UTC.
//
// Loescht Feedback, das aelter als sechs Monate ist. Ein Skript, das man von
// Hand starten muss, wird vergessen - und dann steht in der
// Datenschutzerklaerung eine Frist, die nicht eingehalten wird.
//
// Geplante Functions laufen nur im veroeffentlichten Produktions-Deploy und
// sind dort nicht per URL aufrufbar. Ob sie laeuft, zeigt nur das Log:
// Netlify -> Logs & metrics -> Functions -> feedback-aufraeumen.
// Deshalb wird JEDER Lauf geloggt, auch einer, der nichts zu loeschen hatte.

export const config = { schedule: "@daily" };

export default async () => {
  try {
    const r = await aufraeumen(getStore("assistant-feedback"));
    console.log(
      `[feedback-aufraeumen] Grenze ${r.grenze}: ${r.geprueft} geprueft, ` +
        `${r.geloescht} geloescht, ${r.behalten} behalten, ` +
        `${r.ohneDatum.length} ohne lesbares Datum, ${r.fehlgeschlagen.length} Loeschfehler`
    );
    // Nicht still verschlucken: Diese Schluessel bleiben liegen, bis jemand hinsieht.
    if (r.ohneDatum.length) {
      console.error("[feedback-aufraeumen] Nicht geloescht, Datum unlesbar:", r.ohneDatum.join(", "));
    }
    for (const f of r.fehlgeschlagen) {
      console.error(`[feedback-aufraeumen] Loeschen fehlgeschlagen: ${f.schluessel} - ${f.fehler}`);
    }
  } catch (fehler) {
    console.error("[feedback-aufraeumen] Lauf fehlgeschlagen:", fehler);
  }
};
