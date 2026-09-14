# Inspectora – Spickzettel für wiederkehrende Aufgaben

Nachschlagen statt nachfragen. Alle Pfade beziehen sich auf `C:\Users\fabio\Projekte\Inspectora`.

---

## PowerShell öffnen – im richtigen Ordner

**Schnellster Weg:** Im Explorer zum Inspectora-Ordner navigieren → **Rechtsklick auf den Ordner** → **"In Terminal öffnen"**
(Windows 10: Shift+Rechtsklick → "PowerShell-Fenster hier öffnen")

**Oder per Befehl**, wenn PowerShell schon offen ist:
```powershell
cd C:\Users\fabio\Projekte\Inspectora
```

**Prüfen, ob du richtig bist:**
```powershell
ls
```
Dort müssen `netlify`, `scripts`, `wissensbasis`, `index.html`, `styles.css` auftauchen.

---

## Claude Code starten

```powershell
cd C:\Users\fabio\Projekte\Inspectora
claude
```

Oben im Fenster muss `~\Projekte\Inspectora` stehen. Steht dort etwas anderes, sieht Claude Code das Projekt nicht.

**Alle Projekte liegen unter** `C:\Users\fabio\Projekte\`. Claude Code immer im **Projektordner** öffnen, nie im Wurzelordner `Projekte` – sonst landen alle Projekte gleichzeitig im Kontext.

**Globale Regeln** (gelten für alle Projekte): `C:\Users\fabio\.claude\CLAUDE.md`
**Projektregeln** (haben Vorrang): `CLAUDE.md` im jeweiligen Projektordner

**Auto-Modus:** Unten links steht, ob er an ist. Mit **Shift+Tab** umschalten. Bei aktivem Auto-Modus handelt Claude Code ohne zu fragen – das widerspricht der Regel "Zeig zuerst den Plan".

**Anmeldung abgelaufen?** Im Claude-Code-Fenster eingeben:
```
/login
```

**Beenden:** `/exit` oder Strg+C

---

## Die vier Git-Befehle, die du wirklich brauchst

**Änderungen von GitHub holen** (nachdem Claude Code gepusht hat):
```powershell
git pull
```

**Eigene Änderungen hochladen:**
```powershell
git add .
git commit -m "Beschreibung der Änderung"
git push
```

**Wenn die Änderung die Website NICHT betrifft** (Doku, Notizen, CLAUDE.md) – spart 15 Netlify-Credits:
```powershell
git commit -m "Beschreibung [skip netlify]"
```

**Wo stehe ich gerade?**
```powershell
git status
```

---

## Wichtige Stolperfallen (schon mehrfach passiert)

**`npm` funktioniert nicht** – Fehlermeldung "Ausführung von Skripts ist deaktiviert":
```powershell
npm.cmd install
```
Also immer `npm.cmd` statt `npm` verwenden.

**Claude Code arbeitet auf einem Branch statt auf main:**
Steht in der CLAUDE.md, sollte nicht mehr passieren. Falls doch – im Auftrag ergänzen:
"Arbeite direkt auf main, nicht auf einem Branch."

**Claude Code Web hat keinen Internetzugang.**
Skripte, die etwas herunterladen (z.B. `import-gesetze.js`), müssen lokal am PC laufen.

**Änderung ist live nicht sichtbar:**
Browser-Cache. Hard-Refresh mit **Strg+Shift+R**.

**Ordner umgezogen (September 2026):** Projekte lagen früher direkt auf dem Desktop. Alte Anleitungen, Notizen und Claude-Code-Sitzungsverläufe können noch `C:\Users\fabio\Desktop\...` enthalten. Immer auf `C:\Users\fabio\Projekte\...` korrigieren.

---

## Wissensbasis neu importieren

Nur nötig, wenn sich Gesetze geändert haben oder das Themen-Mapping angepasst wurde.

```powershell
cd C:\Users\fabio\Projekte\Inspectora
git pull
npm.cmd install
node scripts/import-gesetze.js > import-log.txt 2>&1
notepad import-log.txt
```

Im Log prüfen: Paragraphen-Anzahl je Gesetz, Links auf HTTP 200, keine Warnungen im Themen-Block.

Wenn alles passt:
```powershell
git add wissensbasis/gesetze.json
git commit -m "Wissensbasis aktualisiert"
git push
```

---

## Fehlersuche – wo schaue ich nach?

| Problem | Wo nachschauen |
|---|---|
| Website zeigt Änderung nicht | Netlify → **Deploys** (steht "Published"?), dann Strg+Shift+R |
| Assistent antwortet nicht | Netlify → **Logs & metrics → Edge Functions** |
| Feedback/Protokoll-Generator hakt | Netlify → **Logs & metrics → Functions** |
| Etwas im Browser kaputt | **F12** → Tab **Console** (rote Fehler) |
| Wird überhaupt etwas gesendet? | **F12** → Tab **Netzwerk**, dann Aktion auslösen |
| Gespeicherte Rückmeldungen ansehen | Netlify → **Blobs** → Store `assistant-feedback` |

**Statuscodes im Netzwerk-Tab:**
- **200 / 204** = hat funktioniert
- **401 / 403** = Zugangscode-Problem
- **404** = Datei/Function existiert nicht (meist: nicht deployed)
- **405** = falscher Server (früher das GitHub-Pages-Problem)
- **500** = Function läuft, scheitert aber intern → ins Function-Log schauen

---

## Netlify-Credits im Blick behalten

- **1.000 Credits/Monat** (Personal-Tarif), Reset am 15.
- **15 Credits pro Deploy** – deshalb Änderungen bündeln
- Aktueller Stand: Netlify → Konto/Billing → Usage
- `[skip netlify]` in der Commit-Nachricht spart einen Deploy

---

## Zugänge und wo was liegt

| Was | Wo |
|---|---|
| Code | github.com/fabiofnz/Inspectora |
| Hosting, Logs, Blobs | app.netlify.com |
| API-Guthaben | platform.claude.com |
| Domain/DNS | Checkdomain |
| API-Key, Zugangscode | Netlify → Project configuration → Environment variables |

**Nie im Code speichern:** API-Keys, Zugangscodes, Token. Ausschließlich Netlify-Umgebungsvariablen.
