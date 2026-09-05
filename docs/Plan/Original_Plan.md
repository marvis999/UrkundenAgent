## Auftrag

Baue eine Web-App, in der ein agentischer Workflow die notarielle Zuarbeit für einen
Immobilienkaufvertrag übernimmt: Aus hochgeladenen Dokumenten (z. B. einer Makler-E-Mail und 
einem Stapel echter Objektunterlagen wie Scans, Handy-Fotos, geschwärzte Tabellen) entsteht 
ein befüllter, belegter und geprüfter Datensatz für den Kaufvertrag — plus ein belastbarer 
Umgang mit allem, was fehlt, veraltet, unklar oder widersprüchlich ist.

**Stack:** TypeScript end-to-end. Next.js (App Router), Supabase (Postgres + Storage).
Claude CLI für Entwicklung, OpenRouter API für Production, API-Key aus `.env`. 

## Das Leitprinzip

Ein falsch übertragener Wert richtet echten Schaden an. Deshalb gilt durchgehend:
**Kein Wert ohne Herkunft, kein Status ohne Grund, keine Bestätigung ohne Menschen.**
Der Agent liest, schlägt vor und begründet. Er entscheidet nie, was gilt. Der Nutzer entscheidet.

## Abgeleitete Größen

Diese Regeln sind der Kern. Jede Zahl auf dem Bildschirm kommt aus dem Zustand; nichts wird
parallel gepflegt.

1. **Feldstatus** = schlechtester Status seiner Unterfelder und Tabellenzeilen. `bestaetigt` nur,
   wenn alle Unterfelder `bestaetigt` oder `geschwaerzt` sind. `abgeleitet` zählt als offen.
2. **Feldwert und Feldquelle** in der Kopfzeile = aus den Unterfeldern zusammengesetzt. Unterfelder
   mit Status `fehlt` oder `geschwaerzt` tragen keine Quelle, sondern eine Negation — sie zählen
   nicht als Quelle.
3. **Befund ≠ unbestätigt.** Ein Befund entsteht nur bei `fehlt`, `veraltet`, `widerspruch`,
   `unsicher`. Ein bloß vorgeschlagener Wert trägt sein Badge und keine Warnung. Der Befund hängt
   am Unterfeld, um das er geht: ist dieses bestätigt, verfällt er, und der nächste offene
   Problemstatus im Feld erzeugt den Folgebefund.
4. **Abgeleitete Werte verfallen.** Ändert sich das Unterfeld, aus dem ein anderes abgeleitet ist
   (Ziffern → Worte, Firmierung → Rechtsform), wird das abgeleitete neu erzeugt und fällt auf
   `abgeleitet`/unbestätigt zurück, mit Verlaufseintrag des Agenten. Ein Kaufpreis, dessen Ziffern
   und Worte einander widersprechen, darf nicht grün stehen können.
5. **Bilanzen, Balken, Ergebnisstreifen, Protokolltexte** lesen dieselbe Zählfunktion. Keine
   hartkodierten Zahlen in Texten.

## Zwei Arten von Entscheidung, nie in einem Knopf

- **Wert wählen** — welche Fundstelle in das Unterfeld schreibt. Mehrere Kandidaten stehen
  gleichrangig nebeneinander, mit Quellenklasse, Zitat, Seitenverweis, Konfidenz. Der aktive
  Kandidat ist als solcher markiert („im Feld, nicht bestätigt" / „im Feld, bestätigt").
- **Wert bestätigen** — ein Mensch steht für den Wert ein. Am aktiven Kandidaten heißt der Knopf
  „Wert bestätigen", an jedem anderen „Diesen Wert nehmen". Abgeleitete Werte ohne eigene
  Fundstelle bekommen „Gegengelesen, bestätigen".
- Bei Belastungen kommt eine dritte hinzu: **Verfahren je Eintragung** (Übernahme, Löschung,
  Ablösung). Die Wahl setzt die Klauselvariante und schreibt die Folge in die Nachweiszeile
  („Löschungsbewilligung der Berechtigten erforderlich").
- Manuelle Korrektur nur mit **Pflichtbegründung**, die in den Verlauf geht.

## Extraktion (die Agentenseite)

Pipeline je Dokument: Upload → Seitenaufteilung → OCR (Text-PDF direkt, Scans und Fotos über ein
Vision-Modell) → Kandidatenextraktion je Unterfeld → Widerspruchs- und Aktualitätsprüfung.

Das Modell liefert **Kandidaten, keine Entscheidungen**. Erzwungenes Schema:

```ts
type Kandidat = {
  unterfeld: string;         // key, z.B. "kaufpreis.betrag_ziffern"
  wert: string;
  zitat: string;             // wörtlich aus dem Dokument, sonst verwerfen
  dokument: string;
  seite: number;
  bild_ausschnitt?: { x: number; y: number; w: number; h: number };  // bei Fotos/Scans
  konfidenz: number;         // 0..1
  lesarten?: { wert: string; p: number }[];                          // bei unsicherer OCR
  begruendung: string;       // ein Satz, warum das der Wert ist
};
```

Regeln, die der Code durchsetzt, nicht das Modell:

- Ein Kandidat ohne wörtliches Zitat aus dem Quelltext wird verworfen.
- Zwei Kandidaten mit abweichendem Wert für dasselbe Unterfeld → Status `widerspruch`, beide
  bleiben sichtbar, keiner wird stillschweigend bevorzugt.
- Datum der Quelle älter als eine feldabhängige Frist (Grundbuchauszug, Registerauszug) → `veraltet`.
- Ablaufdatum in der Vergangenheit (Energieausweis) → `veraltet`, mit Befund.
- Konfidenz unter Schwelle oder mehrere Lesarten → `unsicher`, Lesarten zur Auswahl anbieten.
- Kein Kandidat → `fehlt`, Anforderungsvorschlag erzeugen.
- Bewusst unlesbar gemachte Felder (geschwärzte Mieternamen) → `geschwaerzt`, **kein**
  Anforderungsgrund. Diese Unterscheidung darf nicht verloren gehen.

## Bildverarbeitung sichtbar machen

Bei Fotos und Scans ist die Fundstelle ein **Bildausschnitt** mit markierter Stelle, kein Textzitat.
Dazu: OCR-Konfidenz, ein Qualitätshinweis („Foto, schräg, Handschrift", „Stempel überdeckt die
Spalte"), und bei mehrdeutiger Lesung zwei bis drei Lesarten mit Wahrscheinlichkeit zur Auswahl.
Der Dokumentbetrachter zeigt Fotos als Bild mit Markierung, Text-PDFs mit hervorgehobener Passage.

## Oberfläche

Zwei Ebenen: Vorgangsliste → Vorgangsansicht. Die Vorgangsansicht hat drei Reiter und darüber das
Statusband.

**Urkundendaten** (Standard) — Proportionsbalken über vier Gruppen (bestätigt, vorgeschlagen, zu
klären, fehlt), anklickbar, dann die Felder nach Vertragsreihenfolge gruppiert. Ein Feld klappt auf:
Unterfeldzeilen nach Status gefärbt und einzeln wählbar (mit Angabe, ob eine Fundstelle existiert),
Tabelle bei Grundstücken und Belastungen, darunter die Fundstellen des gewählten Unterfelds, in der
Seitenspalte Befund, Aktionen und Verlauf mit Durchlauf-Marke.

**Unterlagen** — Dateiliste mit Typ, Datum, Seitenzahl, Bildqualität und Status; Upload; darunter
das Durchlaufprotokoll mit der Positionszuordnung.

**Entwurf** — Paragraphen mit den zugeordneten Feldwerten, nach Status gefärbt, Stempel mit Stand
und Zahl der unbestätigten Felder, Liste „Was nicht im Entwurf steht", Export.

**Export**: JSON mit Wert, Quelle, Zitat, Konfidenz, Status, Durchlauf und Bestätiger je Unterfeld.
Der Datensatz ist das Ergebnis des Systems, nicht der Vertragstext.

## Bewusst nicht bauen

- Empfängerrouting der Anforderung (Grundbuchamt, Bank, Käuferin getrennt) — ein Empfänger genügt.
- Freigabe durch den Notar / Vier-Augen-Prinzip. Der Verlauf trägt die Daten dafür, die Stufe fehlt.
- Rollen, Rechte, echte Authentifizierung. Ein Benutzer, hart verdrahtet.
- Anbindung an Grundbuch, Handelsregister, DE-Mail.
- Erzeugung des fertigen Vertragstexts. Der Entwurf zeigt die Zuordnung, nicht die Urkunde.

Nimm diese Liste ins README und begründe sie dort in je einem Satz.

## Abnahmekriterien

1. Unterlagen hochladen, Durchlauf 1 starten: alle zehn Felder befüllt oder als `fehlt` markiert,
   jeder Wert mit Fundstelle und Konfidenz.
2. Der Kaufpreis-Widerspruch aus der E-Mail wird erkannt, beide Beträge stehen gleichrangig
   nebeneinander, das System entscheidet nicht selbst.
3. Der abgelaufene Energieausweis erzeugt einen Befund, obwohl alle Pflichtangaben vorliegen.
4. Die Fläche aus dem Foto von 1991 wird mit zwei Lesarten angeboten, die Wahl landet im Verlauf.
5. Geschwärzte Mieternamen sind `geschwaerzt` und erzeugen keine Anforderung.
6. Positionen anfordern, senden, Rückmeldung einspielen, Durchlauf 2: betroffene Felder aktualisiert,
   Positionen protokolliert, ein neuer Widerspruch möglich (12 von 14 Mietverträgen).
7. Nach Wechsel des Kaufpreises ist „Betrag in Worten" wieder unbestätigt.
8. Alle Zählungen auf einem Bildschirm stimmen überein.
9. Kein Wert ohne Herkunft im JSON-Export.

## Abgabe

Privates Repo mit README (Setup, Env-Variablen, Ladeanleitung für die Dokumente, Deployment),
drei Minuten Screenwalkthrough, eine Seite Notizen: Annahmen, wichtigste Entscheidungen und
Trade-offs, bewusste Auslassungen, und wie KI beim Bauen eingesetzt wurde — was funktioniert hat
und wo eingegriffen wurde.
