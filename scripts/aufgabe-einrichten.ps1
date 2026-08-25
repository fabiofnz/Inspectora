#Requires -Version 5.1
<#
.SYNOPSIS
  Richtet die woechentliche Aktualitaetspruefung in der Windows-Aufgabenplanung ein.

.BEISPIEL
  powershell -ExecutionPolicy Bypass -File scripts\aufgabe-einrichten.ps1
  powershell -ExecutionPolicy Bypass -File scripts\aufgabe-einrichten.ps1 -Status
  powershell -ExecutionPolicy Bypass -File scripts\aufgabe-einrichten.ps1 -JetztAusfuehren
  powershell -ExecutionPolicy Bypass -File scripts\aufgabe-einrichten.ps1 -Entfernen

.HINWEIS
  Laeuft im Benutzerkontext, ohne gespeichertes Kennwort und ohne Administrator-
  rechte. Die Aufgabe startet nur, wenn der Benutzer angemeldet ist; verpasste
  Termine werden dank StartWhenAvailable nachgeholt.
#>

[CmdletBinding(DefaultParameterSetName = "Einrichten")]
param(
    [Parameter(ParameterSetName = "Entfernen")]       [switch]$Entfernen,
    [Parameter(ParameterSetName = "Status")]          [switch]$Status,
    [Parameter(ParameterSetName = "JetztAusfuehren")] [switch]$JetztAusfuehren
)

$ErrorActionPreference = "Stop"

$AufgabeName = "Inspectora Wissensbasis-Aktualitaet"
$skript = Join-Path $PSScriptRoot "aktualitaet-pruefen.ps1"

function Vorhanden {
    $null -ne (Get-ScheduledTask -TaskName $AufgabeName -ErrorAction SilentlyContinue)
}

if ($Entfernen) {
    if (Vorhanden) {
        Unregister-ScheduledTask -TaskName $AufgabeName -Confirm:$false
        Write-Host "Aufgabe '$AufgabeName' entfernt."
    } else {
        Write-Host "Aufgabe '$AufgabeName' war nicht eingerichtet."
    }
    return
}

if ($Status) {
    if (-not (Vorhanden)) {
        Write-Host "Aufgabe '$AufgabeName' ist NICHT eingerichtet."
        Write-Host "Es wird nichts geprueft. Einrichten mit: scripts\aufgabe-einrichten.ps1"
        return
    }
    $a = Get-ScheduledTask -TaskName $AufgabeName
    $i = Get-ScheduledTaskInfo -TaskName $AufgabeName
    Write-Host "Aufgabe:        $AufgabeName"
    Write-Host "Zustand:        $($a.State)"
    Write-Host "Naechster Lauf: $($i.NextRunTime)"
    Write-Host "Letzter Start:  $($i.LastRunTime)  (Ergebnis des Planers: $($i.LastTaskResult))"
    Write-Host ""

    # Der Planer sagt nur, ob er das Skript gestartet hat. Was die Pruefung
    # ergeben hat - und ob sie ueberhaupt durchlief - steht in der Statusdatei.
    $statusDatei = Join-Path $env:LOCALAPPDATA "Inspectora\aktualitaet\letzter-lauf.json"
    if (-not (Test-Path $statusDatei)) {
        Write-Host "ERGEBNIS: Es liegt noch kein Lauf vor."
        Write-Host "Bis zum ersten Lauf ist ueber die Aktualitaet der Wissensbasis nichts bekannt."
        return
    }

    $s = Get-Content $statusDatei -Raw | ConvertFrom-Json
    $alter = (Get-Date) - [datetime]$s.zeitpunkt
    $tage = [math]::Round($alter.TotalDays, 1)

    Write-Host ("Letzte Pruefung: {0:yyyy-MM-dd HH:mm}  (vor {1} Tagen)" -f [datetime]$s.zeitpunkt, $tage)
    Write-Host "Ergebnis:        $($s.ergebnis)"
    Write-Host "Protokoll:       $($s.protokoll)"
    Write-Host ""

    # Ein leerer Desktop allein sagt nichts. Erst das Alter des letzten Laufs
    # trennt "sauber durchgelaufen" von "laeuft seit Wochen nicht mehr".
    if ($alter.TotalDays -gt 10) {
        Write-Host "URTEIL: UEBERFAELLIG - der letzte Lauf ist mehr als 10 Tage her."
        Write-Host "Die Aufgabe feuert offenbar nicht. Pruefen: Zustand oben, Anmeldung"
        Write-Host "am Montag, Aufgabe ggf. neu einrichten. Bis dahin ist NICHT bekannt,"
        Write-Host "ob die Wissensbasis aktuell ist."
    } elseif ($s.exitCode -eq 0) {
        Write-Host "URTEIL: in Ordnung - zuletzt geprueft und deckungsgleich."
    } elseif ($s.exitCode -eq 1) {
        Write-Host "URTEIL: FUND offen - die Quelle hatte sich geaendert. Siehe Desktop-Datei."
    } else {
        Write-Host "URTEIL: letzte Pruefung lief nicht durch (kein Fund, nichts festgestellt)."
    }
    Write-Host ""
    Write-Host "Exit-Codes: 0 = aktuell | 1 = Gesetzesaenderung (Fund) | 2 = Quelle nicht erreichbar (kein Fund)"
    return
}

if ($JetztAusfuehren) {
    if (-not (Vorhanden)) { throw "Aufgabe '$AufgabeName' ist nicht eingerichtet." }
    Start-ScheduledTask -TaskName $AufgabeName
    Write-Host "Aufgabe gestartet. Ergebnis mit -Status ansehen."
    return
}

if (-not (Test-Path $skript)) { throw "Nicht gefunden: $skript" }

$argBasis = "-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File `"{0}`"" -f $skript

# Zwei Ausloeser, zwei verschiedene Aufgaben:
#
# 1. Montags 09:00 - der eigentliche Termin. Bewusst nicht nachts: Der Rechner
#    soll an sein, und ein Fund soll gesehen werden, wenn jemand davorsitzt.
# 2. Bei der Anmeldung, aber mit -NurWennFaellig, also nur wenn seit dem letzten
#    Lauf mehr als sechs Tage vergangen sind.
#
# Der zweite Ausloeser schliesst die Luecke "Rechner war am Montag aus". Zwar holt
# StartWhenAvailable einen verpassten Termin nach, aber nur solange der Termin im
# Zeitfenster des Planers liegt. Der Anmelde-Ausloeser macht daraus eine Pruefung,
# die spaetestens beim naechsten Einschalten nachgeholt wird - und dank Drosselung
# nicht bei jeder Anmeldung erneut laeuft.
# Eine Aufgabe hat Ausloeser UND Aktionen, aber die Aktionen haengen nicht am
# einzelnen Ausloeser - bei jedem Ausloeser laufen alle Aktionen. Deshalb laeuft
# auch der Montagstermin mit -NurWennFaellig. Das passt: Die Drosselung greift bei
# sechs Tagen, der Termin kommt alle sieben - der Montagslauf ist also immer faellig,
# ausser es hat kurz vorher schon ein Anmeldelauf geprueft. Dann ist es ohnehin
# frisch geprueft und ein zweiter Lauf waere reine Wiederholung.
$aktion = New-ScheduledTaskAction -Execute "powershell.exe" -Argument ($argBasis + " -NurWennFaellig")

$ausloeser = @(
    (New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday -At 9am),
    (New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME)
)
# Nach der Anmeldung kurz warten, damit Netz und Anmeldevorgang stehen.
$ausloeser[1].Delay = "PT5M"

$einstellungen = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 15) `
    -MultipleInstances IgnoreNew

# Leerlauf darf den Lauf weder ausloesen noch abbrechen: Die Pruefung soll
# stattfinden, egal ob am Rechner gerade gearbeitet wird.
$einstellungen.RunOnlyIfIdle = $false
$einstellungen.IdleSettings.StopOnIdleEnd = $false

Register-ScheduledTask -TaskName $AufgabeName `
    -Action $aktion -Trigger $ausloeser -Settings $einstellungen -Force `
    -Description "Vergleicht wissensbasis/gesetze.json woechentlich mit gesetze-im-internet.de. Nur Bericht, schreibt die Wissensbasis nicht. Bei einem Fund oder Fehler erscheint eine Datei auf dem Desktop." | Out-Null

$info = Get-ScheduledTaskInfo -TaskName $AufgabeName
Write-Host "Aufgabe '$AufgabeName' eingerichtet."
Write-Host "Naechster Lauf: $($info.NextRunTime)"
Write-Host ""
Write-Host "Bei einem Fund oder Fehler erscheint eine Datei auf dem Desktop."
Write-Host "Protokolle: $env:LOCALAPPDATA\Inspectora\aktualitaet"
Write-Host "Entfernen:  powershell -ExecutionPolicy Bypass -File scripts\aufgabe-einrichten.ps1 -Entfernen"
