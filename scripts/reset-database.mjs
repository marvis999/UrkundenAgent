// Leert die Datenbank. Die App legt das Schema beim nächsten Zugriff neu an; Vorgänge
// entstehen danach in der App, nicht hier.
//
//   npm run db:reset            behält die eingespielten Unterlagen
//   npm run db:reset -- --files löscht sie mit
//
// Der Dev-Server darf weiterlaufen: er legt das Schema beim nächsten Zugriff neu an.

import { rm } from "node:fs/promises";
import path from "node:path";
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL ist nicht gesetzt. .env.example nach .env kopieren.");
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });

try {
  await client.connect();
} catch (error) {
  console.error(`Keine Verbindung zu Postgres: ${error.message}`);
  console.error("Läuft die Datenbank? `docker compose up -d db`");
  process.exit(1);
}

// Das Schema wird beim nächsten Start der App aus src/db/schema.sql neu angelegt.
await client.query("DROP SCHEMA public CASCADE");
await client.query("CREATE SCHEMA public");
await client.end();
console.log("Datenbank geleert.");

if (process.argv.includes("--files")) {
  const dataDirectory = process.env.URKUNDEN_DATA_DIR;
  if (!dataDirectory) {
    console.error("URKUNDEN_DATA_DIR ist nicht gesetzt, die Unterlagen bleiben liegen.");
    process.exit(1);
  }
  const documents = path.join(dataDirectory, "dokumente");
  await rm(documents, { recursive: true, force: true });
  console.log(`entfernt  ${documents}`);
}

console.log("Der nächste Aufruf der App legt das Schema neu an. Vorgangsliste: leer.");
