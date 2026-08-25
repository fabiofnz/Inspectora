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
    if (-not (Vorhanden)) { Write-Host "Aufgabe '$AufgabeName' ist NICHT eingerichtet."; return }
    $a = Get-ScheduledTask -TaskName $AufgabeName
    $i = Get-ScheduledTaskInfo -TaskName $AufgabeName
    Write-Host "Aufgabe:        $AufgabeName"
    Write-Host "Zustand:        $($a.State)"
    Write-Host "Naechster Lauf: $($i.NextRunTime)"
    Write-Host "Letzter Lauf:   $($i.LastRunTime)  Ergebnis: $($i.LastTaskResult)"
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

$aktion = New-ScheduledTaskAction -Execute "powershell.exe" `
    -Argument ("-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File `"{0}`"" -f $skript)

# Montags 09:00. Bewusst nicht nachts: Der Rechner soll an sein, und ein Fund
# soll gesehen werden, wenn jemand davorsitzt.
$ausloeser = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday -At 9am

$einstellungen = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 15) `
    -MultipleInstances IgnoreNew

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
