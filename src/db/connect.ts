import { readFileSync } from "node:fs";
import path from "node:path";
import { Pool, type PoolClient } from "pg";
import { todayIso } from "@/lib/clock";

/**
 * The Postgres connection.
 *
 * One pool per process, and the schema applied once before the first query. Applying it
 * lazily rather than in a migration step means a fresh `docker compose up` produces a
 * working app without a second command, and re-running it against an existing database
 * is a no-op.
 */

const SCHEMA_FILE = path.join("src", "db", "schema.sql");
const DOCUMENTS_DIRECTORY = "dokumente";

/**
 * Original documents live here. The database holds the paths, never the bytes.
 *
 * Named by the environment and never derived from the working directory. A path the
 * build can work out is a path the build copies: with a default of `cwd/data` the file
 * tracer put every confidential original into the standalone output.
 */
export const dataDirectory = () => {
  const directory = process.env.URKUNDEN_DATA_DIR;
  if (!directory) {
    throw new Error("URKUNDEN_DATA_DIR ist nicht gesetzt. .env.example nach .env kopieren.");
  }
  return directory;
};

export const documentsDirectory = () => path.join(dataDirectory(), DOCUMENTS_DIRECTORY);

const connectionString = () => {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL ist nicht gesetzt. Postgres starten mit `docker compose up -d db` und .env.example nach .env kopieren.",
    );
  }
  return url;
};

/**
 * Next reloads server modules on every edit in development. Without caching on
 * globalThis the app would open a new pool per reload until Postgres refuses connections.
 */
const cache = globalThis as typeof globalThis & { appPool?: Pool; appReady?: Promise<void> };

const createPool = () => {
  const pool = new Pool({ connectionString: connectionString(), max: 10 });
  // An idle client dropped by the server must not take the process down with it.
  pool.on("error", (error) => console.error("Postgres-Pool:", error.message));
  return pool;
};

export const getPool = (): Pool => (cache.appPool ??= createPool());

/**
 * Applies the schema once per process. An advisory lock makes it safe when several
 * workers start at the same time: the second one waits, then finds the tables already
 * there. Nothing is written -- a fresh database has no cases, and the first one is
 * opened in the app.
 */
const SETUP_LOCK = 8_150_412;

const setUp = async () => {
  const client = await getPool().connect();
  try {
    await client.query("SELECT pg_advisory_lock($1)", [SETUP_LOCK]);
    try {
      await client.query(readFileSync(path.join(process.cwd(), SCHEMA_FILE), "utf8"));
      // Imported here rather than at the top: this module is the one the writers import,
      // and a cycle at load time would leave the pool half-built. The client is passed in
      // because `query` would wait on the bootstrap this is part of.
      const { releaseAbandonedRuns } = await import("./runWriter");
      const freed = await releaseAbandonedRuns(client);
      if (freed > 0) console.log(`${freed} Vorgang/Vorgänge aus einem abgebrochenen Durchlauf befreit.`);
    } finally {
      await client.query("SELECT pg_advisory_unlock($1)", [SETUP_LOCK]);
    }
  } finally {
    client.release();
  }
};

/**
 * A failed bootstrap -- Postgres not up yet, most often -- is not cached: the next
 * request tries again instead of rethrowing the first error until the process restarts.
 */
const ready = (): Promise<void> =>
  (cache.appReady ??= setUp().catch((error: unknown) => {
    cache.appReady = undefined;
    throw error;
  }));

/** Postgres: undefined_table. */
const UNDEFINED_TABLE = "42P01";

const isMissingTable = (error: unknown) =>
  typeof error === "object" && error !== null && (error as { code?: string }).code === UNDEFINED_TABLE;

/**
 * Runs `work` against a bootstrapped database. If the tables have gone away underneath
 * us -- which is what `npm run db:reset` does to a running dev server -- applies the schema
 * again and retries once. Without this every reset would need a restart.
 */
const withSchema = async <T>(work: () => Promise<T>): Promise<T> => {
  await ready();
  try {
    return await work();
  } catch (error) {
    if (!isMissingTable(error)) throw error;
    cache.appReady = undefined;
    await ready();
    return work();
  }
};

/* ---------- Queries ---------- */

export type Row = Record<string, unknown>;

export type Parameter = string | number | boolean | Date | null;

/** Runs `work` in a transaction on a single client and rolls back if it throws. */
export const transaction = <T>(work: (client: PoolClient) => Promise<T>): Promise<T> =>
  withSchema(async () => {
    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      const result = await work(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  });

export const query = (sql: string, ...parameters: Parameter[]): Promise<Row[]> =>
  withSchema(async () => (await getPool().query<Row>(sql, parameters)).rows);

export const queryOne = async (sql: string, ...parameters: Parameter[]): Promise<Row | undefined> =>
  (await query(sql, ...parameters))[0];

/* ---------- Narrowing columns ---------- */

/**
 * node-postgres types most columns for us, so these mainly turn "possibly absent" into
 * a decision. They live at the edge, so nothing downstream has to guess at a type.
 */

export const text = (value: unknown): string => (typeof value === "string" ? value : String(value ?? ""));

export const textOrNull = (value: unknown): string | null => (typeof value === "string" ? value : null);

export const int = (value: unknown): number => (typeof value === "number" ? value : Number(value ?? 0));

export const intOrNull = (value: unknown): number | null => (typeof value === "number" ? value : null);

export const numberOrNull = (value: unknown): number | null => {
  if (typeof value === "number") return value;
  // numeric columns come back as strings; double precision does not, but be safe.
  const parsed = typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
};

export const bool = (value: unknown): boolean => value === true;

/** timestamptz arrives as a Date; date arrives as a Date at local midnight. */
export const timestampOrNull = (value: unknown): string | null => {
  if (value instanceof Date) return value.toISOString();
  return typeof value === "string" ? value : null;
};

/** A `date` column as plain ISO, with no timezone shifting it across midnight. */
export const dateOrNull = (value: unknown): string | null => {
  if (value instanceof Date) return todayIso(value);
  return typeof value === "string" ? value.slice(0, "yyyy-mm-dd".length) : null;
};

/** jsonb arrives parsed. Returns undefined for NULL or anything unreadable. */
export const json = <T>(value: unknown): T | undefined => {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return undefined;
    }
  }
  return value as T;
};
