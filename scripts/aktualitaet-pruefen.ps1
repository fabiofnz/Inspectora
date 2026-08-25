#Requires -Version 5.1
<#
.SYNOPSIS
  Woechentliche Aktualitaetspruefung der Wissensbasis - Huelle fuer die
  Windows-Aufgabenplanung.

.BESCHREIBUNG
  Ruft "npm run pruefe-aktualitaet" im Repo auf, schreibt ein Protokoll und legt
  bei einem Fund oder Fehler eine Datei auf dem Desktop ab.

  Warum lokal und nicht in GitHub Actions: Der Runner kommt an die Quelle nicht
  heran. Gemessen am 26.08.2026 (Run 32902121662): TCP-Verbindung zu
  195.74.94.216 kommt weder ueber Port 443 noch ueber Port 80 zustande, auch
  nicht direkt ueber die IP - die Pakete werden verworfen, nicht abgelehnt.
  DNS loest korrekt auf, andere deutsche Hosts sind vom Runner aus in 400ms
  erreichbar, und curl scheitert genauso wie Node. Es liegt also nicht an unserer
  Anfrage, sondern an einer Sperre auf Netzebene gegen die Cloud-Adressen.
  Diese Maschine erreicht die Quelle nachweislich - deshalb laeuft die Pruefung hier.

  Die Unterscheidung zwischen Fund und Fehler wird bis auf den Desktop
  durchgehalten. Sie ist der Kern der ganzen Pruefung:
    Exit 1 = die Quelle hat sich geaendert   -> echter Fund, Handlung noetig
    Exit 2 = die Quelle war nicht erreichbar -> KEIN Fund, nichts festgestellt
  Beides faellt auf, aber nur eines behauptet etwas ueber die Gesetzeslage.
#>

[CmdletBinding()]
param(
    # Nur laufen, wenn seit dem letzten Lauf mindestens $FaelligNachTagen vergangen
    # sind. Der Anmelde-Ausloeser benutzt das: Er holt einen verpassten Montag nach,
    # ohne bei jeder Anmeldung erneut zu pruefen.
    [switch]$NurWennFaellig
)

$ErrorActionPreference = "Continue"

$FaelligNachTagen = 6

$repo    = Split-Path -Parent $PSScriptRoot
$logDir  = Join-Path $env:LOCALAPPDATA "Inspectora\aktualitaet"
$desktop = [Environment]::GetFolderPath("Desktop")

# Wird bei JEDEM Lauf geschrieben, auch bei Erfolg, und nie geloescht.
#
# Grund: Ein erfolgreicher Lauf raeumt die Desktop-Markierungen weg. Ohne diese
# Datei waere ein leerer Desktop mehrdeutig - "sauber durchgelaufen" und "seit
# Wochen gar nicht gelaufen" saehen gleich aus. Genau die Verwechslung, gegen die
# die ganze Pruefkette gebaut ist, nur eine Ebene hoeher: nicht "Fund gegen
# Fehler", sondern "geprueft gegen ungeprueft".
$statusDatei = Join-Path $logDir "letzter-lauf.json"

$markeFund   = Join-Path $desktop "INSPECTORA - Gesetzesaenderung.txt"
$markeFehler = Join-Path $desktop "INSPECTORA - Aktualitaetspruefung fehlgeschlagen.txt"

if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Force -Path $logDir | Out-Null }
$stamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$log   = Join-Path $logDir "$stamp.log"

if ($NurWennFaellig -and (Test-Path $statusDatei)) {
    try {
        $letzter = Get-Content $statusDatei -Raw | ConvertFrom-Json
        $alter = (Get-Date) - [datetime]$letzter.zeitpunkt
        if ($alter.TotalDays -lt $FaelligNachTagen) {
            Write-Host ("Uebersprungen: letzter Lauf vor {0:N1} Tagen (faellig nach {1})." -f $alter.TotalDays, $FaelligNachTagen)
            exit 0
        }
    } catch {
        # Statusdatei unlesbar - dann lieber pruefen als ueberspringen.
    }
}

Push-Location $repo
try {
    $ausgabe = & npm run --silent pruefe-aktualitaet 2>&1
    $code = $LASTEXITCODE
} catch {
    $ausgabe = "Aufruf fehlgeschlagen: $_"
    $code = 2
} finally {
    Pop-Location
}

$kopf = @(
    "Inspectora - Aktualitaetspruefung der Wissensbasis"
    "Zeitpunkt: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
    "Repo:      $repo"
    "Exit-Code: $code"
    ""
)
($kopf + $ausgabe) | Out-File -FilePath $log -Encoding utf8

# Alte Markierungen zuerst weg - sonst steht eine Meldung von vor drei Wochen
# noch da, obwohl inzwischen alles in Ordnung ist.
Remove-Item $markeFund, $markeFehler -ErrorAction SilentlyContinue

switch ($code) {
    0 {
        Add-Content -Path $log -Value "`nERGEBNIS: Bestand deckt sich mit der Quelle."
    }
    1 {
        @(
            "GESETZESAENDERUNG FESTGESTELLT"
            ""
            "Die Quelle war erreichbar und weicht vom gespeicherten Bestand ab."
            "Das ist ein echter Fund - hier muss etwas getan werden."
            ""
            "Naechster Schritt:"
            "  1. cd `"$repo`""
            "  2. npm run import-gesetze"
            "  3. git diff wissensbasis/gesetze.json  -  Aenderungen ansehen"
            "  4. Neue Paragraphen brauchen einen Eintrag in themen-mapping.json,"
            "     sonst sind sie fuer den Assistenten nicht erreichbar."
            "  5. npm run pruefe-wissensbasis"
            "  6. committen und pushen (gesetze.json wird zur Laufzeit gelesen,"
            "     also normaler Commit ohne [skip netlify])"
            ""
            "Vollstaendige Ausgabe: $log"
            ""
            "----------------------------------------"
            ($ausgabe | Out-String)
        ) | Out-File -FilePath $markeFund -Encoding utf8
    }
    2 {
        @(
            "AKTUALITAETSPRUEFUNG FEHLGESCHLAGEN - KEIN FUND"
            ""
            "Es ist NICHT festgestellt, dass sich ein Gesetz geaendert hat."
            "Es ist ueberhaupt nichts festgestellt: Die Quelle war nicht"
            "erreichbar oder nicht lesbar. Der Bestand kann veraltet sein,"
            "ohne dass dieser Lauf es zeigen wuerde."
            ""
            "Meist ist die Ursache voruebergehend (kein Netz, Quelle gerade nicht"
            "erreichbar). Bleibt es dabei, die Fehlerart in der Ausgabe unten"
            "ansehen - TIMEOUT, DNS und HTTP_STATUS bedeuten Verschiedenes."
            ""
            "Vollstaendige Ausgabe: $log"
            ""
            "----------------------------------------"
            ($ausgabe | Out-String)
        ) | Out-File -FilePath $markeFehler -Encoding utf8
    }
    default {
        @(
            "UNERWARTETER EXIT-CODE: $code"
            ""
            "Vollstaendige Ausgabe: $log"
            ""
            ($ausgabe | Out-String)
        ) | Out-File -FilePath $markeFehler -Encoding utf8
    }
}

$ergebnisText = switch ($code) {
    0       { "aktuell - Bestand deckt sich mit der Quelle" }
    1       { "FUND - die Quelle hat sich geaendert" }
    2       { "FEHLER - Quelle nicht erreichbar, nichts festgestellt" }
    default { "unerwarteter Exit-Code $code" }
}

# Immer schreiben, auch bei Erfolg. Diese Datei ist der Beleg, DASS geprueft wurde.
[pscustomobject]@{
    zeitpunkt  = (Get-Date).ToString("o")
    exitCode   = $code
    ergebnis   = $ergebnisText
    protokoll  = $log
    repo       = $repo
} | ConvertTo-Json | Out-File -FilePath $statusDatei -Encoding utf8

# Protokolle aelter als ein halbes Jahr aufraeumen.
Get-ChildItem -Path $logDir -Filter "*.log" -ErrorAction SilentlyContinue |
    Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-183) } |
    Remove-Item -ErrorAction SilentlyContinue

exit $code
