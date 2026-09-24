# Datenschutz – Bestandsaufnahme (Grundlage, kein Rechtstext)

Stand: 24.09.2026, aktualisiert nach Befunden C–F (Feedback-Frist, Dateinamen, Zusagen entfernt, GitHub Pages abgeschaltet).
Zweck: Grundlage für die spätere Datenschutzerklärung. **Das hier ist keine
Datenschutzerklärung** und ersetzt keine rechtliche Durchsicht.

**Methode:** Alles unter „Aus dem Code" ist im Repo nachgesehen, mit Datei und Zeile.
Was der Code nicht zeigen kann (Einstellungen im Netlify-Dashboard, Aufbewahrung bei
Anbietern, Serverstandorte), ist als **OFFEN** markiert, mit der Stelle, an der man es
nachliest. Anbieterangaben „laut Quelle" sind am 24.09.2026 abgerufen und müssen vor
dem Rechtstext noch einmal geprüft werden – sie können sich ändern und gelten
teilweise je nach Tarif.

---

## Übersicht

| # | Verarbeitung | Welche Daten | Wohin | Wie lange | Außerhalb EU? |
|---|---|---|---|---|---|
| 1 | Hosting (jeder Seitenaufruf) | IP-Adresse, Zeitpunkt, URL, User-Agent, Referrer | Netlify | OFFEN (tarifabhängig) | Ja – Netlify Inc., USA |
| 2 | Netlify Analytics | aus den Server-Logs abgeleitet | Netlify | OFFEN | Ja |
| 3 | KI-Assistent | Chatverlauf (bis 60 Nachrichten), hochgeladene PDFs/Bilder (ohne Dateinamen) | Netlify Edge Function → Anthropic | Anthropic laut Quelle 30 Tage, Ausnahmen – OFFEN für dieses Konto | Ja – Anthropic PBC, USA |
| 4 | Web-Suche des Assistenten | Suchanfragen, die das Modell aus der Frage bildet | Anthropic → Suchanbieter | OFFEN | Ja |
| 5 | ~~KI-Protokollformulierung (WEG)~~ – **entfernt 24.09.2026** | bis dahin: WEG-Bezeichnung, Ort, Versammlungsleiter, TOP-Texte | Netlify Function → Anthropic | wie 3 | Ja |
| 6 | Feedback (👍/👎) | Frage, Antwort, Kommentar, Zeitstempel, Metadaten | Netlify Blobs | **sechs Monate**, täglich geprüft – Nachweis im Betrieb offen (O12) | Ja (Netlify); Speicherort OFFEN |
| 7 | localStorage im Browser | Chats, Zugangscode (Assistent) | nur Gerät der Nutzer | bis der Nutzer löscht | Nein |
| 8 | Kontakt per E-Mail | alles, was jemand schreibt, + Absenderadresse | Gmail (Google) | OFFEN | Ja – Google LLC, USA |
| 9 | Bis 24.09.2026: Google Fonts, jsDelivr, cdnjs | IP-Adresse, User-Agent, Referrer | Google, jsDelivr, Cloudflare | bei den Anbietern | Ja – **seit `ed53a21` abgestellt** |
| 10 | ~~GitHub Pages (zweite Kopie der Website)~~ – **abgeschaltet 24.09.2026** | bis dahin: IP-Adresse, User-Agent, Referrer | GitHub (Microsoft) | bei GitHub, OFFEN | Ja – USA; geschlossen |

Nicht gefunden: Cookies, Tracking-Skripte, Analyse-Snippets, Netlify Forms, Netlify
Identity, eingebettete Karten/Videos, Social-Media-Plugins. Nach dem Stand von heute
lädt keine Seite etwas von fremden Servern (`npm run validate-site`, Abschnitt 7).

---

## ⚠ Befunde, die vor dem Rechtstext geklärt werden müssen

Das sind keine Formulierungsfragen – hier stimmt die Seite heute nicht mit sich selbst
oder mit den Projektleitplanken überein.

**A. ✓ Erledigt (24.09.2026): Der Protokoll-Generator versprach „keine externe
Verarbeitung", schickte aber auf Knopfdruck Protokolldaten an Anthropic.** Die
WEG-Werkzeuge sind samt Seite entfernt (siehe 5). Mit ihnen entfallen auch die
Werbe-Aussagen „Lokal gespeichert, keine Cloud-Pflicht" (Startseite) und „ohne
Online-Datenspeicherung" (Fußzeile) – Grundsatz jetzt in CLAUDE.md:
Datenschutz-Aussagen gehören in die Datenschutzerklärung, nicht in Werbetexte.

**B. ✓ Erledigt (24.09.2026): Der KI-Endpunkt `generate-protokoll` hatte keinen
Zugangscode.** Die Function ist gelöscht; `/.netlify/functions/generate-protokoll`
gibt es nicht mehr.

**C. ✓ Umgesetzt (24.09.2026) – Nachweis im Betrieb steht aus: Feedback wird nach
sechs Monaten gelöscht.** Geplante Function `netlify/functions/feedback-aufraeumen.mjs`,
täglich 00:00 UTC; Logik in `netlify/lib/feedback-frist.mjs`, geprüft mit
`npm run pruefe-feedback-frist` (Grenzfälle + Negativkontrolle, läuft auch in GitHub
Actions). Einzelheiten unter 6. **Offen (O12):** Ob Netlify sie tatsächlich täglich
startet, zeigt nur das Function-Log – erst danach stimmt die Frist im Rechtstext.

**D. ✓ Erledigt (24.09.2026): Dateinamen verlassen das Gerät nicht mehr.** Im Verlauf,
in Folgefragen an Anthropic und im Feedback steht nur noch `[Datei: PDF]` bzw.
`[Datei: Bild]` (`assistant.js`, `userContentToText`). Ältere Verläufe mit
`[Datei: Abrechnung_Müller.pdf]` werden beim Laden umgeschrieben und gespeichert
(`stripFileNames` in `loadChats`), und vor jedem Senden noch einmal. Im Browser
nachgeprüft: alter Verlauf mit zwei Dateinamen, Feedback, Folgefrage und ein echter
Upload – in keiner Anfrage und nicht im localStorage ein Name. Der Name steht nur
noch lokal im Anhang-Chip vor dem Absenden. **Grenze:** Metadaten *in* der Datei
(z. B. Autor im PDF) gehen mit dem Dateiinhalt an Anthropic.

**E. ✓ Erledigt (24.09.2026): Datenschutz-Zusagen außerhalb der
Datenschutzerklärung entfernt**, nach dem Grundsatz in CLAUDE.md:
- Startseite `#werkzeug`: Chip „Nichts verlässt deinen Browser" und die Sätze „Die
  Berechnung läuft vollständig in deinem Browser. Es wird nichts übertragen, nichts
  gespeichert und nichts an eine KI geschickt." entfernt. „Ohne Anmeldung" bleibt
  (keine Datenschutz-Zusage). Meta-Beschreibung: „Ohne Anmeldung, im Browser." →
  „Ohne Anmeldung."
- Assistent: „Verlauf wird nur lokal in diesem Browser gespeichert." entfernt. Unter dem
  Eingabefeld (`ki-assistent.html:84`) jetzt die Warnung: „Deine Nachrichten und
  Dateien gehen zur Beantwortung an Anthropic (USA). Keine Namen, Anschriften oder
  Vertragsdaten eingeben."
- Nebenkosten-Seite: Zusagen („nichts übertragen", „damit keine Daten das Gerät
  verlassen", „Zwar verlässt nichts … deinen Browser", Meta „nichts wird übertragen")
  entfernt; Warnungen („Bitte keine personenbezogenen Daten …") bleiben.
- Feedback-Hinweis nennt jetzt die Frist (Warnung an der Eingabestelle, siehe 6).

**F. ✓ Erledigt (24.09.2026): GitHub Pages veröffentlichte das ganze Repo als zweite
Website.** Abgeschaltet, nachgemessen – siehe 11.

---

## 1 · Hosting bei Netlify

**Aus dem Code:** `netlify.toml` – statische Seite, Functions und eine Edge Function,
alles bei Netlify. Jeder Seitenaufruf, jede Datei (auch `fonts/`, `vendor/`) und jeder
Function-Aufruf läuft über Netlify.

**Daten:** Bei jedem HTTP-Abruf technisch zwangsläufig: IP-Adresse, Zeitpunkt,
aufgerufene URL, User-Agent, Referrer. Laut Netlify-Doku steht die Client-IP in den
Traffic-Logs.

**Eigene Logs im Code** (landen in den Function-/Edge-Logs bei Netlify):
- `feedback.mjs`: `[feedback] gespeichert: <key>` bzw. Fehlerobjekt – **kein Inhalt**.
- `assistant-chat.js`: nur eine Fehlermeldung, wenn `gesetze.json` kaputt ist – **kein
  Chatinhalt**.
- `wissensbasis-status.mjs`: nur Fehlermeldung, keine Nutzerdaten.
- `feedback-aufraeumen.mjs`: Zahlen je Lauf; bei Problemen die betroffenen Schlüssel.
  Schlüssel enthalten nur Zeitstempel und Zufallsteil – keinen Inhalt.

**Wie lange:** OFFEN. Laut Netlify-Doku zeigen Function-Logs je nach Tarif bis zu
7 Tage; die Aufbewahrung der Traffic-/Zugriffslogs hängt vom Tarif ab. Allgemein laut
Datenschutzerklärung: „so lange wie für den Zweck nötig".
→ [docs.netlify.com/manage/monitoring/logs](https://docs.netlify.com/manage/monitoring/logs/),
[docs.netlify.com/build/functions/logs](https://docs.netlify.com/build/functions/logs/),
[netlify.com/privacy](https://www.netlify.com/privacy/)

**Außerhalb EU:** Ja, Netlify Inc. sitzt in den USA. OFFEN: Rechtsgrundlage der
Übermittlung (EU-US Data Privacy Framework oder Standardvertragsklauseln), und ob der
Auftragsverarbeitungsvertrag (DPA) für dieses Konto gilt – laut Netlify ist er Teil
der AGB.
→ [netlify.com/gdpr-ccpa](https://www.netlify.com/gdpr-ccpa/),
[dataprivacyframework.gov/list](https://www.dataprivacyframework.gov/list)

**Edge Functions:** Laufen bei Netlify weltweit am nächstgelegenen Standort. OFFEN,
welcher Unterauftragnehmer sie betreibt → Netlify-Unterauftragsverarbeiterliste (über
die DPA-Seite).

## 2 · Netlify Analytics

**Aus dem Code:** Kein Analyse-Skript in irgendeiner Seite. Netlify Analytics
bräuchte keins – es wertet serverseitig die Zugriffe aus und wird im Dashboard
eingeschaltet. **Ob es für inspectora.tech aktiv ist, lässt sich aus dem Code nicht
sehen.**

**OFFEN:** Netlify-Dashboard → Site → Analytics (bzw. „Observability") nachsehen.
Falls aktiv: welche Daten, wie lange → Netlify-Doku zu Analytics/Observability,
[docs.netlify.com/manage/monitoring/observability/overview](https://docs.netlify.com/manage/monitoring/observability/overview/).

## 3 · KI-Assistent → Anthropic

**Weg:** `ki-assistent.html` → `assistant.js` → `POST /.netlify/functions/assistant-chat`
(Edge Function `netlify/edge-functions/assistant-chat.js`) → `https://api.anthropic.com/v1/messages`.

**Was der Browser an Netlify schickt** (`assistant.js`, ab Zeile ~910):
- Header `x-access-code` (Zugangscode – kein personenbezogenes Datum, aber ein Geheimnis)
- `messages`: der **gesamte bisherige Verlauf des Chats** als Text (bis 60 Nachrichten,
  je bis 8.000 Zeichen – Grenzen in `assistant-chat.js:175–176`), plus bei der
  aktuellen Nachricht die angehängten Dateien.
- **Datei-Uploads:** PDF, JPEG, PNG, GIF, WebP (`ALLOWED_MEDIA_TYPES`,
  `assistant-chat.js:177`) als base64. Der volle Dateiinhalt geht **einmal** mit der
  Nachricht mit, bei der er hochgeladen wird; frühere Nachrichten gehen nur als Text mit
  (`[Datei: PDF]` / `[Datei: Bild]`, **ohne Dateinamen** – Befund D). Der
  Dateiinhalt selbst (samt eingebetteter Metadaten) geht unverändert mit.

**Was die Edge Function an Anthropic schickt** (`assistant-chat.js:281–299`):
`model`, `max_tokens`, `stream`, `system` (System-Prompt + Paragraphen aus der
Wissensbasis – keine Nutzerdaten), `tools` (Web-Suche), `messages` (Rolle + Inhalt,
unverändert durchgereicht, inklusive Dateien).
**Nicht** mitgeschickt: IP-Adresse, User-Agent, Zugangscode, irgendeine Nutzerkennung
(kein `metadata.user_id`). Anthropic sieht als Absender Netlify, nicht die Nutzer.

**Was zurückkommt und wo es bleibt:** Die Antwort wird gestreamt und im Browser im
localStorage gespeichert (siehe 7). Serverseitig speichert die Edge Function nichts.

**Wie lange bei Anthropic:** Laut Anthropic werden Ein- und Ausgaben der API
standardmäßig innerhalb von 30 Tagen gelöscht – Ausnahmen: abweichende Vereinbarung
(z. B. Zero Data Retention), Dienste mit eigener Speicherung (z. B. Files API – hier
nicht genutzt), und Inhalte, die zur Durchsetzung der Nutzungsrichtlinien
aufbewahrt werden. **OFFEN:** was für dieses API-Konto gilt, und die Frist bei
Richtlinien-Fällen.
→ [platform.claude.com/docs/en/manage-claude/api-and-data-retention](https://platform.claude.com/docs/en/manage-claude/api-and-data-retention),
[privacy.anthropic.com – How long do you store my organization's data?](https://privacy.anthropic.com/en/articles/7996866-how-long-do-you-store-personal-data)

**Außerhalb EU:** Ja, Anthropic PBC, USA. OFFEN: DPA mit Anthropic (Commercial Terms),
Rechtsgrundlage der Übermittlung, Unterauftragsverarbeiter.
→ [trust.anthropic.com](https://trust.anthropic.com/faq), Anthropic Commercial Terms / DPA,
[dataprivacyframework.gov/list](https://www.dataprivacyframework.gov/list)

**Hinweise im Interface heute:** `ki-assistent.html:40` („keine echten Mieterdaten"),
`:85` („Bitte keine Dokumente mit echten personenbezogenen Daten hochladen"). Beide
sind Warnungen, keine Beruhigung – passt zur Leitplanke.

## 4 · Web-Suche des Assistenten

**Aus dem Code:** `tools: [{ type: "web_search_20250305" }]` (`assistant-chat.js:294`).
Das Modell entscheidet selbst, ob und wonach es sucht. Die Suchanfragen bildet es aus
dem Chatinhalt – sie können also Teile der Frage enthalten.

**OFFEN:** Welcher Suchanbieter die Suche für Anthropic ausführt, was er speichert, wo
er sitzt → Anthropic-Unterauftragsverarbeiterliste und Doku zum Web-Search-Tool.
Ob eine Suche stattfand, wird dem Browser gemeldet (`webSearchUsed`) und landet beim
Feedback in den Blobs.

## 5 · KI-Protokollformulierung (WEG-Protokoll-Generator) – entfernt

**Bis 24.09.2026** schickte der WEG-Protokoll-Generator auf Knopfdruck über
`netlify/functions/generate-protokoll.js` an Anthropic: WEG-Bezeichnung, Datum, Ort,
Versammlungsleiter (Name), Anzahl anwesender/vertretener Eigentümer,
Beschlussfähigkeit + Notiz, je TOP Titel, Notizen (Freitext), Beschlussantrag,
Stimmenzahlen. Ohne Zugangscode (Befund B), mit falschem Hinweis (Befund A).

**Seit Commit „WEG-Werkzeuge entfernt"** gibt es weder Seite noch Function; die
Adressen `/weg-verwaltung` und `/weg-verwaltung.html` leiten per 301 auf `/`. Relevant
nur, falls der Rechtstext auch die Vergangenheit abdecken soll (Aufbewahrung bei
Anthropic wie unter 3).

## 6 · Feedback → Netlify Blobs

**Weg:** 👍/👎 unter einer Antwort → `assistant.js:417` `sendFeedback` →
`POST /.netlify/functions/feedback` (mit Zugangscode) → Netlify Blobs, Store
`assistant-feedback`, Schlüssel `feedback:<ISO-Zeitstempel>-<Zufall>`.

**Gespeicherte Felder** (`feedback.mjs`, Objekt `entry`) – genau diese, nichts sonst:

| Feld | Inhalt | Grenze |
|---|---|---|
| `timestamp` | Zeitpunkt (Server) | – |
| `rating` | `positiv` / `negativ` | – |
| `question` | die Frage zur Antwort (ggf. mit `[Datei: PDF]`/`[Datei: Bild]`, ohne Dateinamen) | 20.000 Zeichen |
| `answer` | die Antwort des Assistenten | 20.000 Zeichen |
| `comment` | Freitext bei 👎 | 2.000 Zeichen |
| `kbUsed` | ob die Wissensbasis gegriffen hat | – |
| `kbIds` | IDs der verwendeten Paragraphen | 30 |
| `webSearchUsed` | ob gesucht wurde | – |

**Nicht** gespeichert: IP, Zugangscode, Nutzerkennung, User-Agent (Kommentar und Code
in `feedback.mjs` stimmen hier überein).

**Hinweis im Interface:** einmalig beim ersten Feedback ein Toast: „Rückmeldungen
werden mit Frage und Antwort sechs Monate gespeichert, um den Assistenten zu
verbessern." (`assistant.js:433`). Danach nie wieder (`inspectora_feedback_hint_v1`).

**Wie lange:** sechs Kalendermonate, danach gelöscht (Befund C). Umsetzung:
- `netlify/functions/feedback-aufraeumen.mjs` – geplante Function (v2,
  `schedule: "@daily"`, 00:00 UTC). Läuft nur im Produktions-Deploy, ist nicht per URL
  aufrufbar.
- `netlify/lib/feedback-frist.mjs` – die Logik. Das Datum steht im Schlüssel
  (`feedback:<ISO-Zeitstempel>-<Zufall>`), der Eintrag muss dafür nicht gelesen werden.
  Grenze = heute minus sechs Kalendermonate; gibt es den Tag im Zielmonat nicht, der
  letzte Tag des Monats (31.08. → 28.02.). Gelöscht wird, was **älter** ist.
- Ein Schlüssel ohne lesbares Datum wird **nicht** gelöscht, sondern im Log gemeldet.
- Jeder Lauf loggt, auch ohne Löschung: `[feedback-aufraeumen] Grenze …: N geprueft,
  M geloescht, …` (Netlify → Logs & metrics → Functions).
- **Formulierung für den Rechtstext:** „…nach sechs Monaten gelöscht (täglich
  geprüft)" – gelöscht wird spätestens einen Tag nach Fristablauf.
- **Nachweis im Betrieb: OFFEN (O12)** – erste Log-Zeile nach dem Deploy ansehen.
**Wo:** OFFEN – in welcher Region Netlify Blobs speichert.
→ Netlify-Doku zu Blobs (docs.netlify.com → Netlify Blobs), Netlify-DPA.
**Außerhalb EU:** Netlify USA; Speicherort OFFEN.

## 7 · localStorage im Browser, je Seite

Bleibt auf dem Gerät, geht an niemanden (außer wie unter 3/6 beschrieben, wenn der
Nutzer etwas absendet). Keine Ablaufzeit – bleibt, bis der Nutzer es löscht (im
Assistenten oder über die Browser-Einstellungen). Keine Cookies.

| Seite | Schlüssel | Inhalt | Personenbezug möglich |
|---|---|---|---|
| `ki-assistent.html` | `inspectora_chats_v1` | alle Chats: Titel, Nachrichten, Antworten, Bewertungen, Zeitstempel | ja – was Nutzer eintippen |
| | `inspectora_active_chat_v1` | ID des offenen Chats | nein |
| | `inspectora_assistant_chat_v1` | Altformat, wird beim Laden übernommen und dann entfernt (`assistant.js:190`) | ja |
| | `inspectora_assistant_code_v1` | Zugangscode im Klartext | nein, aber Geheimnis |
| | `inspectora_feedback_hint_v1` | `"1"`, wenn der Feedback-Hinweis gezeigt wurde | nein |
| `nebenkostenabrechnung-frist-pruefen.html` | – | **bewusst nichts** (`betriebskosten-pruefer.js`, Kopfkommentar) | – |
| `index.html`, `mietrecht-benchmark.html` | – | nichts | – |

Datei-Uploads werden **nicht** im localStorage gespeichert, nur der Platzhalter
`[Datei: PDF]` / `[Datei: Bild]` – ohne Dateinamen (Projektregel „kein base64 im
localStorage", im Code eingehalten; Befund D).

Andere Browser-Zugriffe: `navigator.clipboard.writeText` (Antwort kopieren,
`assistant.js`) – schreibt nur in die lokale Zwischenablage.

**Entfallen mit den WEG-Werkzeugen (24.09.2026):** `inspectora_weg_protocols_v1`,
`inspectora_weg_draft_v1`, `inspectora_invitations_v1`, `inspectora_invitation_draft_v1`,
`inspectora_hg_plans_v1`, `inspectora_hg_draft_v1`. Kein Code liest oder schreibt sie
mehr. Wer die Werkzeuge früher benutzt hat, hat die Daten noch in seinem Browser –
Inspectora zeigt sie nicht mehr an und löscht sie auch nicht.

## 8 · Kontakt per E-Mail

**Aus dem Code:** `mailto:kontakt.inspectora@gmail.com` in `index.html:203`,
`index.html:213`, `ki-assistent.html:99` (Zugangscode anfragen). Kein Kontaktformular.

**Daten:** Absenderadresse, Name (falls im Absender), Inhalt der Mail, Anhänge.
**Wohin:** Google (Gmail). **Wie lange:** OFFEN – so lange die Mails im Postfach liegen;
eine eigene Löschregel gibt es nicht (nicht im Code regelbar).
**Außerhalb EU:** Ja, Google LLC, USA. OFFEN: ob ein privates Gmail-Konto für eine
geschäftliche Kontaktadresse datenschutzrechtlich trägt (kein Auftragsverarbeitungs-
vertrag bei privaten Konten) → rechtliche Durchsicht;
[policies.google.com/privacy](https://policies.google.com/privacy).

## 9 · Bis 24.09.2026: externe Einbindungen (erledigt)

Bis Commit `ed53a21` luden alle Seiten Google Fonts (`fonts.googleapis.com`,
`fonts.gstatic.com`), `ki-assistent.html` zusätzlich marked und DOMPurify von
`cdn.jsdelivr.net`, `weg-verwaltung.html` jsPDF von `cdnjs.cloudflare.com`. Dabei gingen
bei jedem Seitenaufruf IP-Adresse, User-Agent und Referrer an diese Anbieter (Google
USA, jsDelivr, Cloudflare USA). Seit dem Deploy am 24.09.2026 nicht mehr – im
Live-Betrieb nachgemessen: 0 Anfragen an fremde Server. Relevant nur, falls der
Rechtstext auch die Vergangenheit abdecken soll.

## 10 · Sonstiges, geprüft

- **`wissensbasis-status`** (`netlify/functions/wissensbasis-status.mjs`, aufgerufen von
  `app.js:136` auf der Startseite): GET ohne Nutzerdaten, liefert nur Zählwerte. Nur
  der normale Hosting-Log (1).
- **Betriebskosten-Prüfer** lädt nur `wissensbasis/*.json` von der eigenen Domain;
  Eingaben verlassen das Gerät nicht.
- **Vorschaubild** (`og:image`): Wird von Messengern/sozialen Netzwerken abgerufen,
  wenn jemand einen Link teilt – dabei sieht Netlify die IP des Abrufdienstes, nicht
  die der Nutzer.
- **Öffentliches GitHub-Repo:** enthält keine Nutzerdaten (Feedback liegt in Blobs,
  nicht im Repo; `benchmark/ergebnisse/` enthält nur Modellantworten auf eigene
  Testfragen).

## 11 · GitHub Pages: zweite Website aus dem Repo – geschlossen

**Gefunden am 24.09.2026:** Neben Netlify veröffentlichte GitHub Pages bei jedem Push
das **ganze Repo** unter `https://fabiofnz.github.io/Inspectora/` – die Seiten, aber
auch `DATENSCHUTZ-GRUNDLAGE.md`, `benchmark/run.mjs` und alles andere (jeweils HTTP 200
gemessen; GitHub-Actions-Lauf „pages build and deployment" bei jedem Commit).

**Daten:** Wer diese Adresse aufrief, schickte IP-Adresse, User-Agent und Referrer an
GitHub (Microsoft, **USA**). Der Assistent funktionierte dort nicht (die Functions gibt es
nur auf Netlify) – Chat-Inhalte sind darüber also nicht abgeflossen.
**Wie lange:** bei GitHub, OFFEN → GitHub-Datenschutzerklärung
([docs.github.com/site-policy/privacy-policies](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement)).

**Status: geschlossen.** Von Fabio abgeschaltet (GitHub → Settings → Pages), am
24.09.2026 nachgemessen: `https://fabiofnz.github.io/Inspectora/`, `/index.html`,
`/ki-assistent.html`, `/DATENSCHUTZ-GRUNDLAGE.md`, `/benchmark/run.mjs` antworten mit
**404**. Für Commit `d4ae17e` gab es keinen Lauf „pages build and deployment" mehr.
Relevant nur noch, falls der Rechtstext die Vergangenheit abdecken soll.

---

## Offene Punkte – Sammelliste zum Abarbeiten

| # | Frage | Wo nachsehen |
|---|---|---|
| O1 | Aufbewahrung Traffic-/Zugriffslogs bei Netlify für diesen Tarif | Netlify-Dashboard, docs.netlify.com/manage/monitoring/logs |
| O2 | Ist Netlify Analytics / Observability aktiv? | Netlify-Dashboard → Site |
| O3 | Rechtsgrundlage Drittlandübermittlung Netlify, DPA gültig? | netlify.com/gdpr-ccpa, dataprivacyframework.gov/list |
| O4 | Speicherregion Netlify Blobs | Netlify-Doku Blobs, DPA |
| O5 | Anthropic: Aufbewahrung für dieses Konto (30 Tage? ZDR?), Frist bei Richtlinien-Fällen | platform.claude.com/docs/en/manage-claude/api-and-data-retention, Anthropic Console |
| O6 | Anthropic: DPA / Commercial Terms, Rechtsgrundlage Übermittlung, Unterauftragsverarbeiter | trust.anthropic.com, Commercial Terms |
| O7 | Suchanbieter hinter der Web-Suche | Anthropic-Unterauftragsverarbeiterliste |
| O8 | Gmail als geschäftliche Kontaktadresse | rechtliche Durchsicht |
| O9 | ✓ erledigt 24.09.2026 – sechs Monate, geplante Function (Befund C) | Nachweis siehe O12 |
| O10 | ✓ erledigt 24.09.2026 – Protokoll-Generator samt Function entfernt | Befunde A, B |
| O11 | ✓ erledigt 24.09.2026 – Zusagen entfernt, Warnungen bleiben (Befund E) | – |
| O12 | Läuft `feedback-aufraeumen` täglich? Erste Log-Zeile `[feedback-aufraeumen] …` | Netlify → Logs & metrics → Functions |
| O13 | ✓ erledigt 24.09.2026 – GitHub Pages abgeschaltet, alle Adressen 404 | – |
