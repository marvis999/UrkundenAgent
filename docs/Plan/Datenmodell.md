## Datenmodell

Die atomare Einheit ist das **Unterfeld**, nicht das Feld. Das Feld ist eine logische Gruppierung 
von Unterfeldern, die in der App als Collapsible dargestellt werden.

```
vorgang        (id, name, aktenzeichen, objekt, phase, durchlauf_aktuell)
dokument       (id, vorgang_id, dateiname, speicher_pfad, hash, typ, datum, seiten,
                quellenklasse, bildqualitaet, status, eingegangen_in_durchlauf)
                                                                    -- UNIQUE (vorgang_id, hash)
seite          (id, dokument_id, nummer, text, bild_pfad)          -- OCR-Ergebnis je Seite
feld           (id, vorgang_id, key, label, gruppe, reihenfolge, art)  -- art: werte | tabelle
unterfeld      (id, feld_id, label, reihenfolge, abgeleitet_von_unterfeld_id NULL,
                gewaehlter_kandidat_id NULL, bestaetigt_kandidat_id NULL,
                bestaetigt_von NULL, bestaetigt_am NULL)
tabellenzeile  (id, feld_id, reihenfolge, daten JSONB, status,
                beleg_bestaetigt BOOL, verfahren NULL)             -- Flurstücke, Belastungen
kandidat       (id, unterfeld_id NULL, tabellenzeile_id NULL, wert NULL, tag,
                dokument_id NULL, seite NULL, zitat NULL, bild_ausschnitt JSONB NULL,
                konfidenz NUMERIC NULL, lesarten JSONB NULL, begruendung,
                quell_kandidat_id NULL, durchlauf, erstellt_von, erstellt_am)
befund         (id, feld_id, unterfeld_id NULL, art, titel, text, erledigt_in_durchlauf NULL)
verlauf        (id, feld_id, unterfeld_id NULL, durchlauf, wann, wer, was)
anforderung    (id, vorgang_id, durchlauf, gesendet_am, empfaenger, betreff, text)
position       (id, anforderung_id, feld_id, titel, text, status,
                erledigt_durch_dokument_id NULL)
durchlauf      (id, vorgang_id, nummer, gestartet, beendet, seiten_gelesen)
```

### Ein Wert, eine Quelle

Das Unterfeld speichert keinen Wert und keine Quelle. Beides kommt aus dem Kandidaten, auf den
`gewaehlter_kandidat_id` zeigt. Nur ein Kandidat kann gewählt sein. Die Bestätigung gilt für genau
einen Kandidaten (`bestaetigt_kandidat_id`); wird ein anderer gewählt, ist das Unterfeld
automatisch wieder unbestätigt. `bestaetigt_von` und `bestaetigt_am` liefern den Bestätiger für
den Export.

`dokument.hash` ist der SHA-256 der Datei. Ein erneuter Upload derselben Datei legt kein zweites
Dokument an.

### Kandidaten-Tags

| Tag | Pflicht | Bedeutung |
|---|---|---|
| `extrahiert` | dokument_id, seite, zitat, konfidenz | Fundstelle des Agenten. `begruendung` ist der Satz des Modells, `durchlauf` der Lauf, der ihn erzeugt hat. |
| `manuell` | begruendung, erstellt_von | Korrektur durch eine Person, ohne Dokument. Die Begründung ist die Herkunft. |
| `abgeleitet` | quell_kandidat_id | Aus einem anderen Kandidaten berechnet (Ziffern → Worte, Firmierung → Rechtsform). Ist der Quellkandidat nicht mehr gewählt, wird neu erzeugt und die Bestätigung fällt weg. |
| `geschwaerzt` | dokument_id, seite | Bewusst unlesbar gemachte Stelle. `wert` bleibt NULL. Die Schwärzung hat eine Fundstelle und ist kein Anforderungsgrund. |

### Statuswerte

`bestaetigt` · `vorgeschlagen` · `abgeleitet` · `veraltet` · `widerspruch` · `unsicher` ·
`fehlt` · `geschwaerzt`

Der Status eines Unterfelds wird berechnet, nicht gespeichert. Eine Funktion, erster Treffer gewinnt:

1. `bestaetigt`, wenn `gewaehlter_kandidat_id` gleich `bestaetigt_kandidat_id` ist.
2. `geschwaerzt`, wenn der gewählte Kandidat das Tag `geschwaerzt` trägt.
3. `fehlt`, wenn kein Kandidat existiert.
4. `widerspruch`, wenn zwei Kandidaten nach Kanonisierung verschiedene Werte haben.
5. `veraltet`, wenn das Dokumentdatum des gewählten Kandidaten die Frist des Unterfelds überschreitet.
6. `unsicher`, wenn Lesarten vorliegen oder die Konfidenz unter der Schwelle liegt.
7. `abgeleitet`, wenn der gewählte Kandidat das Tag `abgeleitet` trägt.
8. sonst `vorgeschlagen`.

Dieselbe Funktion liefert Feldstatus, Balken, Zähler und Export. `tabellenzeile.status` bleibt
vorerst gespeichert; das Muster mit `gewaehlter_kandidat_id` je Zelle folgt, wenn die Tabellen
gebaut werden.

### Quellenklassen
`Register` · `Amtlicher Nachweis` · `Nachweis Dritter` · `Parteiangabe`

## Feldliste

Dies ist die Feldliste aus der Aufgabe.

| Feld | Unterfelder |
|---|---|
| Verkäuferin | Eingetragene Eigentümerin, Rechtsform, Vertretungsberechtigte, Nachweise |
| Käuferin | Firma, Registerdaten, Vertretung, Anschrift |
| Grundbuch | Amtsgericht, Grundbuch von, Blatt |
| Grundstücke | Verkaufte Flurstücke + Tabelle: Gemarkung, Flur, Flurstück, Größe, Wirtschaftsart |
| Kaufpreis | Betrag in Ziffern, Betrag in Worten (abgeleitet) |
| Finanzierung | Gläubigerin, Grundschuldbetrag |
| Belastungen | Stand der Abteilungen + Tabelle je Eintragung Abt. II/III mit Verfahren |
| Mietverhältnisse | Bestand nach § 566 BGB, Wohn- und Nutzfläche, Jahresnettomiete, Mieternamen |
| Energieausweis | Art, Kennwert, Gültigkeit |
| Übergabe | Besitzübergang, Regelung |