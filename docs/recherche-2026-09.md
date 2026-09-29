# Recherche September 2026 – wonach Menschen fragen

Festgehalten am 29.09.2026. Die Recherche selbst stammt aus einer früheren Sitzung, die
nicht gespeichert war; hier steht ihr Ergebnis, damit es nicht noch einmal verloren geht.
Die Rohdaten (einzelne Abfragen, Vervollständigungen, Forenlinks) sind **nicht** erhalten.

**Kennzeichnung: Das sind Signale, keine Suchvolumen.** Grundlage waren
Autovervollständigung und Foren – also woran Menschen sichtbar hängen bleiben, nicht wie
viele es sind. Eine Zahl („x Suchen im Monat“) gibt es hier nicht und darf auch nicht
nachträglich dazugeschrieben werden.

---

## Stärkste Signale

- **„Nebenkostenabrechnung bis wann“** – das stärkste Signal überhaupt.
  Top-Präfix „bis wann“, Top-Vervollständigung „wie lange hat der Vermieter Zeit“.
- **Einzelne Umlage-Posten:** Rauchwarnmelder, Legionellenprüfung, Grundsteuer.
- **Kündigungsfrist**
- **Mieterhöhung / Kappungsgrenze**
- **Kaution**
- **Grunderwerbsteuer je Bundesland**

## Kein Modul

| Thema | Warum nicht |
|---|---|
| Kautionsrückzahlung | keine gesetzliche Frist – nichts, was sich rechnen ließe |
| „Darf der Vermieter …“ | Einzelfall, keine Rechenregel |
| Rendite / Tilgung | keine Rechtsregel (siehe aber Vertriebs-Input unten) |

## Später

Mietpreisbremse und Indexmiete (brauchen externe Daten), Wohnfläche, WEG-Fristen,
Verjährung.

## Wer keine Spur hinterlässt

Vertrieb und Wohnungsunternehmen tauchen in Foren und Autovervollständigung nicht auf.
Das heißt nicht, dass sie nichts fragen – nur, dass diese Methode sie nicht sieht. Für
sie zählt direkter Input (nächster Abschnitt), nicht Suchsignale.

---

## Vertriebs-Input

Aus dem Gespräch mit dem Vertrieb, nicht aus Suchsignalen:

- Am häufigsten mit KI gerechnet werden **Restschuld / Restlaufzeit von Krediten** und
  **Brutto-/Nettomietrendite**.
- Dazu **Standortanalyse** – das sind Marktdaten, nicht errechenbar. Kein Modul.

Idee für später (nicht entschieden, nicht angekündigt):

- Leitsatz erweitern auf „wo sich die Antwort errechnen lässt – **aus dem Gesetz oder aus
  der Formel**“.
- Finanz-Modul mit **Tilgungsplan als Beleg** – der Plan ist dort, was der Paragraph im
  Rechtsmodul ist: der nachprüfbare Rechenweg.
- Eigene Benchmark-Kategorie dafür.

**Grenze:** keine Finanzierungs- oder Anlageberatung (§ 34i GewO). Ein Finanz-Modul
rechnet eine Formel nach, es empfiehlt nichts.

---

## Begriffsliste für die Frageseiten (Schritt 1), nach den Signalen geordnet

Reihenfolge = Reihenfolge des Bauens. Eine Seite entsteht nur, wenn die Engine den
Begriff sauber beantwortet (ganze Zeile bewertet, genau eine Nummer, Begriff steht so in
der Begriffsdatei).

**1 · Mit Signal aus der Recherche**

| Seite | Engine sagt | Stand |
|---|---|---|
| Nebenkostenabrechnung 2024 / 2025 / 2026 – bis wann? | Frist nach § 556 Abs. 3 BGB | bauen |
| Rauchwarnmelder | im Gesetz nicht genannt | bauen – Seite sagt genau das, kein Urteil |
| Grundsteuer | im Katalog, Wortlaut (§ 2 Nr. 1) | bauen |
| Legionellenprüfung | nicht zuordenbar (Wort unbekannt) | **zurückgestellt**, bis die Zuordnung geklärt ist (Entscheidung 29.09.2026) |

**2 · Ohne eigenes Signal – drin, weil jede einen anderen Urteilstyp zeigt**

| Seite | Engine sagt |
|---|---|
| Hausmeister | im Katalog, nur anteilig (§ 2 Nr. 14) |
| Winterdienst | im Gesetz nicht genannt |
| Verwaltungskosten | nicht umlagefähig (§ 1 Abs. 2 Nr. 1) |

**3 · Später, wenn Stufe 1 und 2 laufen:** Gartenpflege, Aufzug, Dachrinnenreinigung,
Reparatur/Instandhaltung.

Nicht als Seite: Kabelfernsehen (die Änderung 2024 macht den Wortlaut allein
irreführend), alles aus der Liste unten.

---

## Offen: Begriffe, die seit nebenkosten-positionen 1.1.0 zu Unrecht „nicht zuordenbar“ zeigen

Seit Commit 601d9fd zählen Begriffe mit engem Umfang („Versicherung“, „Heizung“,
„Reinigung“, „Garten“, „Beleuchtung“) nur am Wortanfang. Das hat Rechtsschutz- und
Mietausfallversicherung aus Nr. 13 geholt – aber auch Zeilen, die der Wortlaut deckt:

| Zeile | gehört nach Wortlaut zu |
|---|---|
| Zentralheizung | § 2 Nr. 4 a („zentralen Heizungsanlage“) |
| Etagenheizung | § 2 Nr. 4 d – aber nur „der Reinigung und Wartung von Etagenheizungen“, also Umfang wieder eng |
| Fernheizung / Fernwärme-Zeilen mit „-heizung“ | § 2 Nr. 4 c („der eigenständig gewerblichen Lieferung von Wärme“) – prüfen |
| Gebäudehaftpflichtversicherung | § 2 Nr. 13 („Haftpflichtversicherung für das Gebäude“) |
| Öltankhaftpflichtversicherung | § 2 Nr. 13 („… den Öltank …“) |

Vor dem Eintragen jede Zeile gegen den Wortlaut in `gesetze.json` prüfen – die rechte
Spalte ist eine Arbeitsnotiz, kein Beleg.

**Diese Begriffe gehören in die nächste Fassung der Begriffsdatei – zusammen mit einer
neuen Umlage-Messreihe.** Jeder neue Begriff ändert `benchmark/fragen-umlage.json`; eine
neue Fragedatei heißt eine neue Messreihe, nicht ein stiller Nachtrag zur alten.

**Zentralheizung steht auf fast jeder echten Abrechnung. Das darf nicht lange so
bleiben.**
