# Selbst gehostete Fremddateien

Seit dem 24.09.2026 lädt keine Seite mehr etwas von fremden Servern. Alles, was vorher
von Google Fonts oder jsDelivr kam, liegt hier im Repo. `npm run validate-site`
schlägt an, sobald wieder eine externe Einbindung auftaucht.

**Warum:** Jeder Aufruf eines fremden Servers überträgt die IP-Adresse der Besucher
dorthin (DSGVO), und eine Datei hinter einer schwimmenden Versionsangabe wie `marked@13`
kann sich ändern, ohne dass hier ein Commit passiert.

## Bibliotheken (`vendor/`)

Die Dateien sind **byteweise unverändert** übernommen. Nicht von Hand bearbeiten – sonst
stimmt die Prüfsumme nicht mehr, und niemand kann mehr nachweisen, was hier läuft.

| Datei | Paket | Lizenz | SHA-256 |
|---|---|---|---|
| `marked-13.0.3.min.js` | marked 13.0.3, `marked.min.js` | MIT (`LICENSE-marked.md`) | `5adea7d8ee41a700fccc14bb9d503104f0470cc17a84ad3e167d3f5251eae0da` |
| `purify-3.4.16.min.js` | dompurify 3.4.16, `dist/purify.min.js` | MPL-2.0 oder Apache-2.0 (`LICENSE-dompurify.txt`) | `2c90a9b46d6463f26038a29b686e82bc91de01fdac9d5229e7cfe3b360134ea2` |

**Welche Version:** Vorher standen `marked@13` und `dompurify@3` in der Seite – also die
jeweils neueste 13.x bzw. 3.x. Festgelegt wurde die Version, die jsDelivr am 24.09.2026
dafür tatsächlich ausgeliefert hat (Antwort-Header `X-JSD-Version`), nicht die neueste.
Sonst hätte sich beim Umzug nebenbei das Verhalten des Assistenten geändert.

**Entfernt:** jsPDF 2.5.1 (PDF-Export der WEG-Werkzeuge) – mit den WEG-Werkzeugen am
24.09.2026 gelöscht, nichts anderes hat es benutzt. Datei und Lizenz stehen in der git-Historie.

**Wie geprüft:**
1. npm-Tarball gegen `dist.integrity` aus der npm-Registry (SHA-512 über das ganze Paket –
   npm veröffentlicht keine Prüfsumme je Datei).
2. SHA-256 der Datei aus dem Tarball verglichen mit
   - der Datei-Prüfsumme der jsDelivr-API (`data.jsdelivr.com/v1/packages/npm/<paket>@<version>?structure=flat`),
   - den Bytes, die die bisher eingebundene CDN-Adresse am 24.09.2026 ausgeliefert hat.

Alle drei Quellen stimmten je Datei überein.

## Schrift (`fonts/`)

Plus Jakarta Sans, Lizenz: SIL Open Font License 1.1 (`fonts/OFL.txt`).
Die vier woff2-Dateien sind die Dateien, die Google Fonts am 24.09.2026 für
`family=Plus+Jakarta+Sans:wght@400;500;600;700;800` an Chrome ausgeliefert hat
(`fonts.gstatic.com/s/plusjakartasans/v12/…`) – je Zeichenbereich eine variable Datei.
Google veröffentlicht dafür keine Prüfsummen; die Werte hier sind die der geladenen Dateien.

| Datei | Zeichenbereich | SHA-256 |
|---|---|---|
| `plus-jakarta-sans-latin.woff2` | latin | `153fc85b70298beeb1d61a5f723331649e7f23bb77302a66e61cb3e2fbdb5e79` |
| `plus-jakarta-sans-latin-ext.woff2` | latin-ext | `38e3b8fd8045048eb311d90170a4429ed2c8f405852dc3d91b5af8452758703f` |
| `plus-jakarta-sans-vietnamese.woff2` | vietnamese | `b275d1258601dda240fc6a1d4a6cad56e691d898f5cdf1b0e4fd6ca0022d8e40` |
| `plus-jakarta-sans-cyrillic-ext.woff2` | cyrillic-ext | `c46a510ab43925a55ecfe6c2d5fad0ce1902cd48ab276621d41f7afa42e4daee` |

Die `@font-face`-Regeln oben in `styles.css` sind Googles Regeln **wortgleich**, nur mit
lokalen Pfaden: 5 Gewichte × 4 Zeichenbereiche. Nicht zu einer Regel mit
`font-weight: 400 800` zusammenfassen – `styles.css` nutzt auch `font-weight: 900`, und
das soll weiter genau so aussehen wie vorher.

## Aktualisieren

Neue Version = bewusste Entscheidung, nicht Nebenwirkung. Datei mit neuer Versionsnummer
im Namen ablegen, Prüfung wie oben wiederholen, Tabelle anpassen, Verweis in der Seite
umstellen, alte Datei löschen.
