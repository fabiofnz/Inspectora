# Inspectora – Projektanweisungen für Claude Code

## Kontext

Inspectora ist ein Lern- und Übungsprojekt von Fabio (Immobilienkaufmann-Azubi, Anfänger in Web-Entwicklung). Ziel: Web-Entwicklung lernen und das Projekt langfristig so weit bringen, dass Abos möglich sind.

Website: inspectora.tech · Hosting: Netlify · Repo: fabiofnz/Inspectora (öffentlich)

---

## Arbeitsregeln (wichtig)

**Immer erst den Plan zeigen.** Bei jeder Aufgabe zuerst beschreiben, was geändert wird und warum – erst nach Freigabe umsetzen.

**Direkt auf `main` arbeiten.** Keine Feature-Branches, keine Pull Requests. Ein Entwickler, kein Review-Bedarf – und jeder zusätzliche Branch-Deploy kostet Netlify-Credits.

**Änderungen bündeln.** Ein Commit, ein Push pro Aufgabenpaket. Jeder Deploy kostet 15 Netlify-Credits (1.000/Monat verfügbar). Nicht für jede Kleinigkeit einzeln pushen.

**Bei reinen Doku-/Textänderungen** (README, Kommentare, .md-Dateien) `[skip netlify]` in die Commit-Nachricht schreiben – spart einen unnötigen Deploy.

**Nichts stillschweigend löschen.** Wenn totem Code gefunden wird: erst auflisten, dann auf Freigabe warten.

**Ehrlich sein, wenn etwas nicht getestet werden kann.** Claude Code Web hat keinen externen Netzzugang (403 vom Proxy) und kein Netlify/Deno-CLI. Wenn etwas nicht end-to-end prüfbar ist: sagen, nicht behaupten.

---

## Technischer Stand

**Kernstück: KI-Assistent** (`ki-assistent.html` + `assistant.js`)
- Läuft als **Netlify Edge Function**: `netlify/edge-functions/assistant-chat.js` (Deno-Runtime, ESM)
- Modell: `claude-sonnet-5`, API-Key ausschließlich als Netlify-Umgebungsvariable `ANTHROPIC_API_KEY`
- Zugangsschutz über `ASSISTANT_ACCESS_CODE` (serverseitig geprüft)
- Streaming (wortweise), Web-Suche (`web_search_20250305`), Datei-Upload (PDF + Bilder)
- Mehrere parallele Chats mit Volltextsuche, localStorage-Keys `inspectora_chats_v1` / `inspectora_active_chat_v1`
- Markdown via marked + DOMPurify (jsDelivr CDN)
- Feedback-Buttons (👍/👎) → `netlify/functions/feedback.mjs` (Functions v2!) → Netlify Blobs, Store `assistant-feedback`

**Wissensbasis**
- `wissensbasis/gesetze.json` – 181 Paragraphen (WEG, BGB §§ 535–580a, BetrKV, HeizkostenV, WoFlV)
- `wissensbasis/themen-mapping.json` – Alltags-Suchbegriffe je Paragraph, mit `titel_pruefung` als Sicherung
- `scripts/import-gesetze.js` – Import von gesetze-im-internet.de, **läuft nur lokal** (Netzzugang nötig)
- Die Edge Function lädt gesetze.json per statischem Import `with { type: "json" }`

**Ältere Tools** (clientseitig, localStorage, PDF-Export): WEG-Einladungs-Generator, WEG-Protokoll-Generator (mit KI über `netlify/functions/generate-protokoll.js`, Functions v1), Hausgeld-/Wirtschaftsplan-Rechner, Objektaufnahme (zurückgestuft)

---

## Konventionen

- **Netlify Functions:** Neue Functions immer im **v2-Format** (`export default`, Web Request/Response, `.mjs`). Nur so funktioniert Netlify Blobs ohne Zusatzkonfiguration. `generate-protokoll.js` ist noch v1 – nicht anfassen, läuft.
- **Design:** dunkel mit Lila-Akzenten. Immer die vorhandenen CSS-Variablen in `styles.css` nutzen, keine neuen Farbwerte hart eintragen.
- **Sprache:** Alle Texte im Interface auf Deutsch.
- **Keine Secrets im Code.** Niemals API-Keys, Zugangscodes oder Token in Dateien schreiben – ausschließlich Netlify-Umgebungsvariablen.
- **Kein base64 im localStorage.** Datei-Uploads nur als Platzhalter `[Datei: name.pdf]` im Verlauf speichern.
- **Fehler nicht still verschlucken**, wenn sie diagnostisch wichtig sind. Bei Hintergrund-Operationen (z.B. Feedback senden) auch **Erfolg** loggen, nicht nur Fehler – sonst ist im Netlify-Log nicht unterscheidbar, ob etwas lief oder gar nicht aufgerufen wurde.

---

## Leitplanken (bei jeder Änderung prüfen)

- **Keine personenbezogenen Daten** durch die externe KI (DSGVO). Hinweise im Interface entsprechend formulieren – warnen, nicht beruhigen.
- **Keine Rechtsberatung** (RDG). Alle Ausgaben sind unverbindliche Entwürfe, der Mensch trägt die Verantwortung.
- **Der Assistent zitiert nur, was in der Wissensbasis steht.** Niemals Paragraphen oder Wortlaute erfinden lassen.
- **Ton des Assistenten:** natürlich, dialogisch, kurz. Die Wissensbasis verbessert das Wissen, nicht den Ton. Keine Disclaimer-Wände, kein Gesetzesstil.

---

## Nicht neu aufrollen (ist entschieden)

- Hosting = Netlify (nicht Vercel)
- Repo bleibt öffentlich
- Der KI-Assistent ist ein allgemeiner Chat, **kein** Tool mit Vorlagen-Buttons
- Einladungs-Generator und Beschluss-Sammlung werden **nicht** mit KI verbunden
