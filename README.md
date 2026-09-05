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
Schema an und befüllt es mit dem Beispielvorgang; ein zweiter Befehl ist nicht nötig.

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

## Unterlagen einspielen

Die Originalunterlagen sind vertraulich und liegen **nicht** im Repository. Der
Beispielvorgang beschreibt sie bereits mit Dateiname, Typ und Seitenzahl; das Einspielen
ergänzt die Dateien selbst:

```bash
npm run import -- 2026-0412 pfad/zu/den/unterlagen/*.pdf pfad/zu/den/unterlagen/*.jpg
```

Das Skript sendet die Dateien an die laufende Anwendung. Diese legt sie unter
`<datenverzeichnis>/dokumente/<vorgang>/<sha256>.<endung>` ab und verknüpft sie mit dem
passenden Dokumenteintrag. Derselbe Inhalt wird nur einmal gespeichert, ein zweiter Import
legt kein zweites Dokument an. Zum Schluss meldet das Skript, welche Unterlagen noch ohne
Datei sind.

In Docker liegen die Dateien im Volume `documents`, lokal unter `data/`. Beides steht in
`.gitignore` beziehungsweise außerhalb des Images. Weder Datenbank noch Unterlagen können
versehentlich committet werden.

## Weitere Befehle

| Befehl | Wirkung |
|---|---|
| `npm run typecheck` | TypeScript ohne Emit |
| `npm run build` | Produktionsbuild |
| `npm run db:reset` | Datenbank leeren, beim nächsten Zugriff neu befüllen |
| `npm run db:reset -- --files` | zusätzlich die eingespielten Unterlagen löschen |
| `docker compose down -v` | alles entfernen, auch die Volumes |

Der Dev-Server darf während `db:reset` weiterlaufen: er legt das Schema beim nächsten
Zugriff neu an. Nach einer Schemaänderung ist `db:reset` nötig, denn das Schema wird
angelegt, nicht migriert.

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
Badge, Feldstatus, Balken, Zähler und Export, deshalb kann ein Wert nicht an einer Stelle
bestätigt und an anderer offen aussehen. Die Bestätigung gilt genau einem Kandidaten: wird
ein anderer gewählt, ist das Unterfeld ohne weiteres Zutun wieder unbestätigt, und ein davon
abgeleiteter Wert verfällt.

Das vollständige Schema mit Begründungen steht in [`src/db/schema.sql`](src/db/schema.sql),
das Modell dahinter in [`docs/Plan/Datenmodell.md`](docs/Plan/Datenmodell.md).

Die Datenbank hält Pfade, keine Dateien. Ein Grundbuchauszug wird als Ganzes gelesen, an
einen Menschen ausgeliefert und nie abgefragt; er gehört ins Dateisystem, und die Sicherung
bleibt ein Verzeichnis plus ein Dump.

## Aufbau

```
src/catalog/     Feldkatalog: die zehn Felder, ihre Unterfelder, Fristen, Anforderungstexte
src/db/          Schema, Verbindung, Repository, Mutationen, Dateiablage, Seed
src/domain/      Modell, Statusberechnung, Kanonisierung, abgeleitete Werte
src/components/  UI, nach Bausteinen (ui/) und Vorgangsansicht (case/) getrennt
src/app/         Routen und Server Actions
```

Der Feldkatalog ist die Autorität, nicht die Datenbank: jeder Vorgang wird daraus angelegt
und merkt sich seine Katalogversion, damit ältere Vorgänge ihre Form behalten.

Eine Vorgangsansicht kostet ein Bündel paralleler Abfragen, unabhängig davon, wie viele
Felder sie enthält; die Vorgangsliste kostet dasselbe wie ein einzelner Vorgang.

## Bezeichner

Code und Bezeichner sind englisch, angezeigte Texte und Fachbegriffe deutsch. Die Tabelle
heißt `subfield`, im Gespräch heißt sie Unterfeld.

## Vertraulichkeit

Die Unterlagen des Beispielvorgangs stammen aus einer echten Transaktion. Sie gehören nicht
in ein Repository, nicht in einen öffentlichen Speicher und nicht als Kontext an Dienste, die
eine Trainingsnutzung nicht ausschließen. Die Anwendung gibt eine Datei nur über
`/api/cases/<vorgang>/documents/<dokument>` heraus, nie als statische Datei aus `public/`.
Postgres und die App sind an `127.0.0.1` gebunden und aus dem Netz nicht erreichbar. Nach
Abschluss des Verfahrens werden die Unterlagen gelöscht: `docker compose down -v`.
