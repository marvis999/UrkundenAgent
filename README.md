# Urkunden-Zuarbeit

Agentische Zuarbeit für die Vorbereitung eines Grundstückskaufvertrags. Aus den Unterlagen
eines Vorgangs entsteht ein geprüfter Datensatz für die Urkunde: jeder Wert mit Fundstelle,
jeder Status mit Grund, jede Bestätigung durch einen Menschen.

Next.js und PostgreSQL, alles in Docker, nichts in der Cloud.

## Starten

```bash
cp .env.example .env
docker compose up
```

Danach [http://localhost:3000](http://localhost:3000). Beim ersten Zugriff legt die App ihr
Schema an; ein zweiter Befehl ist nicht nötig. Die Vorgangsliste ist leer, denn es gibt
keine Beispieldaten: **Neuer Vorgang** legt den ersten an.

### Entwicklung

Nur die Datenbank im Container, die App lokal mit Hot Reload:

```bash
cp .env.example .env
docker compose up -d db
npm install
npm run dev
```

`.env.example` enthält funktionierende Vorgaben für die lokale Entwicklung. Für einen
Betrieb außerhalb des eigenen Rechners gehören dort ein eigenes Passwort und eine eigene
`DATABASE_URL` hinein.

| Variable | Bedeutung |
|---|---|
| `DATABASE_URL` | Verbindung zu Postgres |
| `URKUNDEN_DATA_DIR` | Ablage der Originalunterlagen (Vorgabe `./data`) |
| `POSTGRES_PORT`, `APP_PORT` | Ports auf dem Host, beide nur an `127.0.0.1` gebunden |

## Einen Vorgang anlegen

**Neuer Vorgang** fragt nach einem Namen und nach dem, was bisher geschrieben wurde: der
E-Mail des Maklers, einer Telefonnotiz, einem Nachtrag. Mehr nicht. Die Anschrift des
Objekts wird nicht abgefragt — sie steht in den Unterlagen, und der erste Durchlauf trägt
sie ein. Wer sie abtippt, schafft nur die zweite Stelle, an der sie falsch stehen kann.

Der eingefügte Text wird **eine Unterlage wie jede andere**: unter dem Hash seiner Bytes
abgelegt, zu einer Seite gemacht, vom nächsten Durchlauf gelesen. Deshalb bekommt ein Wert
daraus eine Fundstelle mit wörtlichem Zitat, statt als Behauptung im Feld zu stehen. Später
kommt weiterer Text über **Notiz oder E-Mail** im Unterlagen-Tab dazu, mit Namen und Text.

## Unterlagen einspielen

Dateien gehören in die Ablagefläche im Unterlagen-Tab. Für einen ganzen Ordner ist die
Kommandozeile schneller — dieselbe Schnittstelle, nur ohne Ziehen:

```bash
npm run import -- 2026-0001 pfad/zu/den/unterlagen/*.pdf pfad/zu/den/unterlagen/*.jpg
```

Das Skript sendet die Dateien an die laufende Anwendung. Diese legt sie unter
`<datenverzeichnis>/dokumente/<vorgang>/<sha256>.<endung>` ab. Derselbe Inhalt wird nur
einmal gespeichert, ein zweiter Import legt kein zweites Dokument an. Jede Datei wird beim
Einspielen seitenweise gerendert; die Seitenansicht zeigt danach die echten Seiten. Der
Vorgang muss vorher in der App existieren.

In Docker liegen die Dateien im Volume `documents`, lokal unter `data/`. Beides steht in
`.gitignore` beziehungsweise außerhalb des Images. Weder Datenbank noch Unterlagen können
versehentlich committet werden.

## Der Kreis

Der Vorgang läuft im Browser rund, ohne Kommandozeile:

1. **Unterlagen** — Dateien in die Ablagefläche ziehen, oder unter **Notiz oder E-Mail**
   Text einfügen, der ohne Datei kam. Beides wird gespeichert und sofort zu Seiten gemacht;
   danach steht der Vorgang auf „Eingang" und das Neue ist als „neu" markiert.
2. **Durchlauf starten** — der Knopf im Banner und über der Dateiliste. Er kommt sofort
   zurück, der Durchlauf läuft im Hintergrund weiter. Die Seite zeigt währenddessen den
   Fortschritt je Dokument und lädt sich selbst nach; **Abbrechen** stoppt die laufenden
   Modellaufrufe und gibt die Dateien für einen erneuten Durchlauf frei. Eine Seite, die
   auf der Seite liegt, wird vor dem Lesen aufrecht gedreht, damit Fundstellen und
   Seitenansicht dasselbe Bild zeigen.
3. **Urkundendaten** — jeder Wert mit seiner Fundstelle: dem Zitat aus der Seite und dem
   Ausschnitt des Seitenbilds, auf dem es steht. Bestätigen, einen anderen Kandidaten
   wählen oder mit Begründung korrigieren.
4. **Anfordern** — was aus den Unterlagen nicht zu klären ist, wandert in den Korb und wird
   ein Schreiben. Nach dem Senden wartet der Vorgang.
5. Kommen die angeforderten Unterlagen an, geht es bei 1. weiter. Der nächste Durchlauf
   vermerkt zu jeder Position der Anforderung, wodurch sie erledigt wurde: erledigt,
   teilweise oder offen, mit Dateiname.

Das Modell muss Bilder lesen können. Die meisten Objektunterlagen sind Scans und Fotos ohne
Textebene; ein reines Textmodell wird von OpenRouter mit „no endpoints found that support
image input" abgewiesen, und der Durchlauf findet dann nur in den wenigen Dateien mit
Textebene etwas.

## Weitere Befehle

| Befehl | Wirkung |
|---|---|
| `npm run typecheck` | TypeScript ohne Emit |
| `npm run build` | Produktionsbuild |
| `npm run agent -- <vorgang>` | Durchlauf auf der Kommandozeile, mit vollem Protokoll |
| `npm run agent -- <vorgang> --dry` | nur der Plan, keine Modellaufrufe, keine Kosten |
| `npm run db:reset` | Datenbank leeren, beim nächsten Zugriff neu befüllen |
| `npm run db:reset -- --files` | zusätzlich die eingespielten Unterlagen löschen |
| `docker compose down -v` | alles entfernen, auch die Volumes |

Der Dev-Server darf während `db:reset` weiterlaufen: er legt das Schema beim nächsten
Zugriff neu an. Schemaänderungen stehen als idempotente `ALTER`-Anweisungen im Schema und
ziehen beim nächsten Start nach; ein Reset ist dafür nicht nötig.

## Wie die Daten liegen

Die atomare Einheit ist das **Unterfeld**, nicht das Feld. „Kaufpreis" ist eine Gruppierung;
geprüft, korrigiert und bestätigt wird „Betrag in Ziffern".

Zwei Regeln tragen das Modell:

**Kein Wert ohne Herkunft.** Ein Unterfeld speichert weder Wert noch Quelle. Beides kommt aus
dem Kandidaten, auf den `chosen_candidate_id` zeigt. Ein Kandidat trägt entweder eine
Fundstelle im Dokument, eine Begründung eines Menschen oder den Kandidaten, aus dem er
abgeleitet wurde. Ohne eines davon weist die Datenbank ihn per CHECK zurück.

**Kein Status ohne Grund.** Der Status wird nie gespeichert, sondern aus den Zeilen berechnet
([`src/domain/computeStatus.ts`](src/domain/computeStatus.ts)). Dieselbe Funktion liefert
Badge, Feldstatus, Balken, Zähler und Befund, deshalb kann ein Wert nicht an einer Stelle
bestätigt und an anderer offen aussehen. Die Bestätigung gilt genau einem Kandidaten: wird
ein anderer gewählt, ist das Unterfeld ohne weiteres Zutun wieder unbestätigt, und ein davon
abgeleiteter Wert verfällt.

**Kein Satz vom Modell.** Auch der Befund unter einem Wert ist berechnet, nicht geschrieben:
zu jeder Regel gibt es einen Satz, und was ihn füllt, sind Daten — der Wert, seine Quelle,
ein Datum, eine Schwelle (`explainStatus`). Passt keine Regel, steht der Status allein; ein
nacktes „widersprüchlich" ist wahr, eine erfundene Erklärung sähe nur so aus. Das Modell
liest Werte, nennt Fundstellen und wählt aus festen Listen; formulieren tut es nichts, was
im Browser erscheint.

Das vollständige Schema mit Begründungen steht in [`src/db/schema.sql`](src/db/schema.sql),
das Modell dahinter in [`docs/Plan/Datenmodell.md`](docs/Plan/Datenmodell.md).

Die Datenbank hält Pfade, keine Dateien. Ein Grundbuchauszug wird als Ganzes gelesen, an
einen Menschen ausgeliefert und nie abgefragt; er gehört ins Dateisystem, und die Sicherung
bleibt ein Verzeichnis plus ein Dump.

## Aufbau

```
src/catalog/     Feldkatalog: die zehn Felder, ihre Unterfelder, Fristen, Anforderungstexte
src/db/          Schema, Verbindung, Repository, Mutationen, Dateiablage, Vorgangsanlage
src/agent/       Der Durchlauf: Plan, zwei Modellstufen (Einordnung, Extraktion), Merge, Ableitungen
src/domain/      Modell, Statusberechnung, Kanonisierung, abgeleitete Werte
src/components/  UI, nach Bausteinen (ui/) und Vorgangsansicht (case/) getrennt
src/app/         Routen und Server Actions
```

Der Feldkatalog ist die Autorität, nicht die Datenbank: jeder Vorgang wird daraus angelegt,
und ein Durchlauf ergänzt vorher, was der Katalog seither dazubekommen hat.

Eine Vorgangsansicht kostet ein Bündel paralleler Abfragen, unabhängig davon, wie viele
Felder sie enthält; die Vorgangsliste kostet dasselbe wie ein einzelner Vorgang.

## Bezeichner

Code und Bezeichner sind englisch, angezeigte Texte und Fachbegriffe deutsch. Die Tabelle
heißt `subfield`, im Gespräch heißt sie Unterfeld.

## Vertraulichkeit

Die Unterlagen eines Vorgangs stammen aus einer echten Transaktion. Sie gehören nicht
in ein Repository, nicht in einen öffentlichen Speicher und nicht als Kontext an Dienste, die
eine Trainingsnutzung nicht ausschließen. Das Repository enthält keine: es gibt keine
Beispieldaten, und was eingespielt wird, bleibt im Datenverzeichnis. Die Anwendung gibt eine Datei nur über
`/api/cases/<vorgang>/documents/<dokument>` heraus, nie als statische Datei aus `public/`.
Postgres und die App sind an `127.0.0.1` gebunden und aus dem Netz nicht erreichbar. Nach
Abschluss des Verfahrens werden die Unterlagen gelöscht: `docker compose down -v`.
