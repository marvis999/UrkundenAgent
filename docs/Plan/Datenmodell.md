## Datenmodell

Die atomare Einheit ist das **Unterfeld**, nicht das Feld. Das Feld ist eine logische Gruppierung 
von Unterfeldern, die in der App als Collapsible dargestellt werden.

Umgesetzt in PostgreSQL, im Container per `docker compose`. Maßgeblich ist
[`src/db/schema.sql`](../../src/db/schema.sql); es wird beim ersten Zugriff angelegt und ist
wiederholt anwendbar. Bezeichner sind englisch, gespeicherte Inhalte deutsch.

`data JSONB` und `crop`/`readings` sind `jsonb`, Zeitstempel `timestamptz`, `doc_date` ein
reines `date`. `subfield` und `candidate` zeigen aufeinander; die beiden Fremdschlüssel sind
`DEFERRABLE INITIALLY DEFERRED`, damit eine Transaktion den Kandidaten anlegen und das
Unterfeld darauf zeigen lassen kann, in beliebiger Reihenfolge.

```
case_file      (id, name, file_number, property, phase, current_run, catalog_version,
                recipient_name, recipient_email, changed_at)
document       (id, case_id, file_name, storage_path, hash, doc_type, kind, doc_date,
                page_count, source_class, quality, status, title, subtitle,
                photo_caption, photo_hint, received_in_run, sort_order)
                                                             -- UNIQUE (case_id, hash)
page           (id, document_id, number, image_path, width, height, text)
                                                             -- UNIQUE (document_id, number)
field          (id, case_id, key, label, group_key, sort_order, kind, no_request_reason)
                                                             -- kind: values | table
subfield       (id, field_id, key, label, sort_order, value_type,
                stale_after_days NULL, stale_when_value_in_past, confidence_threshold,
                absence_note NULL, chosen_candidate_id NULL, confirmed_candidate_id NULL,
                confirmed_by NULL, confirmed_at NULL)        -- UNIQUE (field_id, key)
table_row      (id, field_id, key, natural_key, sort_order, data JSONB, status,
                procedure NULL, chosen_candidate_id NULL)
candidate      (id, subfield_id NULL, table_row_id NULL, value NULL, canonical_value NULL,
                tag, document_id NULL, page NULL, quote NULL, source_label, note NULL,
                source_class NULL, crop JSONB NULL, confidence NULL, readings JSONB NULL,
                rationale NULL, source_candidate_id NULL, run, created_by, created_at)
finding        (id, field_id, subfield_id NULL, table_row_id NULL, title, text,
                created_in_run, resolved_in_run NULL)
history        (id, field_id, subfield_id NULL, table_row_id NULL, run, written_at, actor, text)
request        (id, case_id, run, sent_at NULL, recipient, subject, body)
request_item   (id, request_id, field_id, title, text, sort_order,
                outcome NULL, resolved_by NULL)
run            (id, case_id, number, started_at, finished_at NULL, pages_read, summary,
                model NULL, prompt_version NULL)             -- UNIQUE (case_id, number)
run_document   (run_id, document_id, pages_read)             -- Fortschritt je Dokument
```

### Ein Wert, eine Quelle

Das Unterfeld speichert keinen Wert und keine Quelle. Beides kommt aus dem Kandidaten, auf den
`chosen_candidate_id` zeigt. Nur ein Kandidat kann gewählt sein. Die Bestätigung gilt für genau
einen Kandidaten (`confirmed_candidate_id`); wird ein anderer gewählt, ist das Unterfeld
automatisch wieder unbestätigt. `confirmed_by` und `confirmed_at` liefern den Bestätiger für
den Export.

`document.hash` ist der SHA-256 der Datei. Ein erneuter Upload derselben Datei legt kein zweites
Dokument an. `storage_path` zeigt relativ in das Datenverzeichnis; die Datei selbst liegt nie
im Repository und nie unter `public/`.

### Seiten

Beim Einspielen wird jede Datei mit MuPDF (WebAssembly, kein nativer Baustein) seitenweise
gerendert: ein PNG je Seite unter `<hash>.pages/` neben dem Original, dazu die Textebene in
`page.text`. Leerer Text heißt Scan oder Foto, also eine Seite, die das Sichtmodell braucht.
Ein Durchlauf bekommt Seiten einzeln; `candidate.page` zeigt auf genau eine davon.
`POST /api/cases/<id>/documents/<dok>/pages` rendert nach, etwa nach einem Wechsel des Renderers.

### Vom Zitat zur Fundstelle

Das Modell bekommt den Seitentext und wird nie nach Koordinaten gefragt. Es liefert den Wert
und das Zitat, aus dem der Wert stammt; das Zitat wird danach in genau demselben Text gesucht,
den es gelesen hat. Seitentext und Zeichenpositionen entstehen in einem Durchgang, damit
zwischen "was das Modell gelesen hat" und "worauf die Markierung zeigt" nichts auseinanderlaufen
kann. Gefunden wird auch, was das Modell unterwegs ändert: Groß- und Kleinschreibung,
zusammengefasste Leerzeichen, ein Zeilenumbruch mitten im Satz, ein am Zeilenende getrenntes Wort.

Aus dem Treffer wird `candidate.crop`. Zwei Fälle bekommen bewusst keine Markierung:

- Das Zitat steht nicht auf der genannten Seite. Dann wurde der Wert dort nicht abgelesen,
  und das ist ein Prüfsignal, kein Darstellungsproblem.
- Das Zitat kommt auf der Seite mehrfach vor. Dann legt es keine Stelle fest.

Reine Scans haben keine Textebene, also auch kein Zitat zum Suchen. Dort bleibt es vorerst bei
der Seite als Fundstelle.

### Der Feldkatalog steht im Code

`field` und `subfield` werden je Vorgang aus [`src/catalog/fields.ts`](../../src/catalog/fields.ts)
angelegt. Dort stehen Schlüssel, Label, Werttyp, Frist, Schwelle und Anforderungstext. Der
Vorgang merkt sich in `catalog_version`, mit welcher Fassung er angelegt wurde, damit ältere
Vorgänge ihre Form behalten, wenn der Katalog wächst.

Der `key` ist stabil und unabhängig vom Label. Die Extraktion adressiert ein Unterfeld als
`kaufpreis.betrag_ziffern`-Analogon `purchasePrice.digits`; Labels sind Anzeigetext und dürfen
sich ändern.

### Kandidaten-Tags

| Tag | Pflicht (per CHECK erzwungen) | Bedeutung |
|---|---|---|
| `extracted` | document_id, page | Fundstelle des Agenten. `rationale` ist der Satz des Modells, `run` der Lauf, der ihn erzeugt hat. |
| `manual` | rationale | Korrektur durch eine Person, ohne Dokument. Die Begründung ist die Herkunft. |
| `derived` | source_candidate_id | Aus einem anderen Kandidaten berechnet (Ziffern → Worte, Firmierung → Rechtsform). Ist der Quellkandidat nicht mehr gewählt, verfällt der Wert. |
| `geschwärzt` = `redacted` | document_id, page, value IS NULL | Bewusst unlesbar gemachte Stelle. Die Schwärzung hat eine Fundstelle und ist kein Anforderungsgrund. |

`CHECK (num_nonnulls(subfield_id, table_row_id) = 1)` stellt sicher, dass ein Kandidat
genau ein Ziel hat.

### Werttyp und Kanonisierung

Regel 4 vergleicht Werte „nach Kanonisierung". Dafür trägt jedes Unterfeld einen `value_type`
(`text`, `amount`, `date`, `area`, `register`, `measure`) und jeder Kandidat den daraus
erzeugten `canonical_value`. Ohne das wären „2.060.000 EUR" und „2.060.000,00 EUR" ein
Widerspruch und jedes Feld mit zwei Quellen stünde auf orange.

### Statuswerte

`bestaetigt` · `vorgeschlagen` · `abgeleitet` · `veraltet` · `widerspruch` · `unsicher` ·
`fehlt` · `geschwaerzt`

Der Status eines Unterfelds wird berechnet, nicht gespeichert
([`src/domain/computeStatus.ts`](../../src/domain/computeStatus.ts)). Eine Funktion, erster
Treffer gewinnt:

1. `bestaetigt`, wenn `chosen_candidate_id` gleich `confirmed_candidate_id` ist.
2. `geschwaerzt`, wenn der gewählte Kandidat das Tag `redacted` trägt.
3. `fehlt`, wenn kein Kandidat gewählt ist.
4. `widerspruch`, wenn zwei Kandidaten nach Kanonisierung verschiedene Werte haben.
5. `veraltet`, wenn die Quelle zu alt ist oder der Wert selbst abgelaufen ist.
6. `unsicher`, wenn Lesarten vorliegen oder die Konfidenz unter der Schwelle liegt.
7. `abgeleitet`, wenn der gewählte Kandidat das Tag `derived` trägt.
8. sonst `vorgeschlagen`.

Zwei Präzisierungen, die sich beim Bauen ergeben haben:

**Regel 4 vergleicht Quellen miteinander.** Nur Kandidaten mit Tag `extracted` nehmen teil, und
nur solange der gewählte Wert selbst eine Quellenlesung ist. Sobald eine Person einen manuellen
Wert in das Feld gestellt hat, ist der Widerspruch zwischen den Dokumenten entschieden und
gehört in den Verlauf, nicht in den Status.

**Regel 5 hat zwei Mechanismen.** Der Grundbuchauszug ist veraltet, weil das *Dokument* zu alt
ist (`stale_after_days`, gemessen am `document.doc_date`). Der Energieausweis ist veraltet,
weil ein *im Dokument stehendes Datum* verstrichen ist (`stale_when_value_in_past`, gemessen am
Wert selbst). Eine Frist allein deckt beides nicht ab.

Dieselbe Funktion liefert Feldstatus, Balken, Zähler und Export. `table_row.status` bleibt
vorerst gespeichert; das Muster mit `chosen_candidate_id` je Zelle folgt, wenn die Tabellen
gebaut werden. `table_row.natural_key` (etwa `Beispielheide|00|000/1` oder `II|1`) macht die
Zeile über Durchläufe hinweg wiedererkennbar, damit ein zweiter Lauf sie aktualisiert statt sie
zu verdoppeln; `key` ist die kurze Form für Links.

### Der Korb ist eine ungesendete Anforderung

`request` mit `sent_at IS NULL` ist der Korb, je Vorgang höchstens einer (Partial Unique Index).
Senden setzt `sent_at` und die Phase auf `waiting`. Eine gesendete Anforderung gilt als offen,
bis ein späterer Durchlauf sie abgeglichen hat; solange trägt jedes betroffene Feld
„angefordert am …". Danach berichtet der Durchlauf je Position, wodurch sie erledigt wurde.

### Was der Mensch ändert

[`src/db/mutations.ts`](../../src/db/mutations.ts) ist die einzige Stelle, die schreibt.
Jede Änderung schreibt einen Verlaufseintrag mit Person und Grund. Zwei Regeln setzt sie
durch, die keine Oberfläche vergessen kann:

- Ein anderer Kandidat wird gewählt → die Bestätigung wird nicht gelöscht, sie zeigt weiter
  auf den alten Kandidaten und der Status liest sich deshalb von selbst wieder als unbestätigt.
- Ein abgeleiteter Wert, dessen Quellkandidat nicht mehr gewählt ist, ist nicht bloß
  unbestätigt, sondern falsch. Er wird entfernt, das Unterfeld steht wieder ohne Wert da.
  Das Löschen genügt: die Fremdschlüssel räumen `chosen_candidate_id` und
  `confirmed_candidate_id` selbst auf, und nur dort, wo sie auf ihn zeigten.
- Tabellenzeilen kennen die Kandidatenwahl bereits (`table_row.chosen_candidate_id`);
  Bestätigen setzt dort vorerst `status`, weil die Zeile ihren Status noch speichert.
  Manuell korrigieren gibt es für Zeilen noch nicht: sie haben kein einzelnes Wertfeld.
- Solange eine gesendete Anforderung offen ist, lässt sich kein Korb füllen. Der Korb
  und die offene Anforderung teilen sich eine Ansicht; ein zweites Schreiben wartet auf
  die Rückmeldung zum ersten.

### Zeitangaben

Zeitstempel werden als `timestamptz` gespeichert und in Ortszeit angezeigt; die Container
laufen auf `Europe/Berlin`. `document.doc_date` ist ein reines Datum ohne Uhrzeit. „Heute" ist der lokale Tag, weil eine Frist um lokale Mitternacht
abläuft. Die Uhr wird an genau einer Stelle gelesen ([`src/lib/clock.ts`](../../src/lib/clock.ts))
und als Wert in die Statusberechnung gegeben, damit dieselben Zeilen immer denselben Status
ergeben.

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

## Offen

- Tabellenzellen bekommen eigene Kandidaten; `table_row.status` entfällt dann.
- `page.text` ist die Textebene der Datei, kein OCR. Für reine Scans bleibt sie leer, bis
  ein Durchlauf das Bild gelesen hat.
- Ein abgeleiteter Wert wird beim Wechsel der Quelle entfernt, aber noch nicht neu erzeugt.
  Das gehört in den nächsten Durchlauf.
- Das Schema wird beim Start angelegt, nicht migriert. Sobald es Daten gibt, die eine
  Änderung überleben müssen, braucht es versionierte Migrationen.
