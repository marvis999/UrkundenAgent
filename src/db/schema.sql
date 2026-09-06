-- Urkunden-Zuarbeit: schema.
--
-- PostgreSQL. Applied on first connect and safe to re-run: every statement is
-- IF NOT EXISTS or an idempotent ALTER, so starting the app against an existing
-- database changes nothing. See docs/Plan/Datenmodell.md for the reasoning.
--
-- Two rules the schema exists to protect:
--   1. A value never exists without a source. A subfield stores no value at all;
--      value and source both come from the candidate chosen_candidate_id points at.
--   2. Status is computed, never stored. The only exception is table_row.status,
--      which stays until table cells get their own candidates.

CREATE TABLE IF NOT EXISTS case_file (
  id              text PRIMARY KEY,
  name            text NOT NULL,
  file_number     text NOT NULL,
  property        text NOT NULL,
  phase           text NOT NULL,
  current_run     integer NOT NULL DEFAULT 0,
  catalog_version text NOT NULL,
  recipient_name  text NOT NULL,
  recipient_email text NOT NULL,
  changed_at      timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS run (
  id             text PRIMARY KEY,
  case_id        text NOT NULL REFERENCES case_file(id) ON DELETE CASCADE,
  number         integer NOT NULL,
  started_at     timestamptz NOT NULL,
  finished_at    timestamptz,
  pages_read     integer NOT NULL DEFAULT 0,
  summary        text NOT NULL DEFAULT '',
  -- Provenance of the extraction, so an export can name what produced a value.
  model          text,
  prompt_version text,
  UNIQUE (case_id, number)
);

CREATE TABLE IF NOT EXISTS document (
  id              text PRIMARY KEY,
  case_id         text NOT NULL REFERENCES case_file(id) ON DELETE CASCADE,
  file_name       text NOT NULL,
  -- Relative to the data directory. NULL while only metadata is known.
  storage_path    text,
  -- SHA-256 of the file. Re-uploading the same file does not create a second row.
  hash            text NOT NULL,
  doc_type        text NOT NULL,
  kind            text NOT NULL,
  -- A plain date with no time of day, or NULL for a document that carries none.
  doc_date        date,
  page_count      integer NOT NULL DEFAULT 0,
  source_class    text NOT NULL,
  quality         text NOT NULL DEFAULT '',
  status          text NOT NULL,
  title           text NOT NULL DEFAULT '',
  subtitle        text NOT NULL DEFAULT '',
  photo_caption   text,
  photo_hint      text,
  received_in_run integer NOT NULL DEFAULT 1,
  -- Display order within the case; imports append.
  sort_order      integer NOT NULL DEFAULT 0,
  UNIQUE (case_id, hash)
);

-- One row per rendered page. The image lives next to the original in the data
-- directory; the text layer is stored so a run can tell a text page from a scan
-- before deciding whether to send the image to the model.
CREATE TABLE IF NOT EXISTS page (
  id          text PRIMARY KEY,
  document_id text NOT NULL REFERENCES document(id) ON DELETE CASCADE,
  number      integer NOT NULL,
  image_path  text NOT NULL,
  width       integer NOT NULL,
  height      integer NOT NULL,
  text        text NOT NULL DEFAULT '',
  UNIQUE (document_id, number)
);

CREATE TABLE IF NOT EXISTS field (
  id         text PRIMARY KEY,
  case_id    text NOT NULL REFERENCES case_file(id) ON DELETE CASCADE,
  key        text NOT NULL,
  label      text NOT NULL,
  group_key  text NOT NULL,
  sort_order integer NOT NULL,
  kind       text NOT NULL CHECK (kind IN ('values', 'table')),
  -- Set when a request would be wrong, e.g. deliberately redacted data.
  no_request_reason text,
  -- What a run concluded should be requested for this field. NULL falls back to the
  -- catalog template: the catalog states the general case, a run states this one.
  request_title text,
  request_text  text,
  UNIQUE (case_id, key)
);

-- The two request columns arrived after the table did, and CREATE TABLE IF NOT EXISTS
-- does not add a column to a table that already exists. Stated as an idempotent ALTER so
-- a database from before they existed picks them up on the next start, without a reset.
ALTER TABLE field ADD COLUMN IF NOT EXISTS request_title text;
ALTER TABLE field ADD COLUMN IF NOT EXISTS request_text  text;

CREATE TABLE IF NOT EXISTS subfield (
  id         text PRIMARY KEY,
  field_id   text NOT NULL REFERENCES field(id) ON DELETE CASCADE,
  -- Stable key, e.g. 'digits'. The agent addresses subfields as '<field>.<key>';
  -- labels are display text and may change without breaking extraction.
  key        text NOT NULL,
  label      text NOT NULL,
  sort_order integer NOT NULL,
  -- Drives canonicalisation, and therefore what counts as a contradiction.
  value_type text NOT NULL CHECK (value_type IN ('text', 'amount', 'date', 'area', 'register', 'measure')),
  -- Staleness rule A: the source document is older than this many days.
  stale_after_days         integer,
  -- Staleness rule B: the value is itself a date that has passed (Energieausweis).
  stale_when_value_in_past boolean NOT NULL DEFAULT false,
  confidence_threshold     double precision NOT NULL DEFAULT 0.7,
  -- Why no value exists. Written when a run concludes the value is absent.
  absence_note             text,
  -- Where the value and its source come from, and which candidate a person confirmed.
  -- The foreign keys are added further down: candidate does not exist yet here.
  chosen_candidate_id      text,
  confirmed_candidate_id   text,
  confirmed_by             text,
  confirmed_at             timestamptz,
  UNIQUE (field_id, key)
);

CREATE TABLE IF NOT EXISTS table_row (
  id          text PRIMARY KEY,
  field_id    text NOT NULL REFERENCES field(id) ON DELETE CASCADE,
  -- Short, URL-safe handle the UI addresses the row by, e.g. 'p1'. Stable for the
  -- lifetime of the row, so a link into a row survives the next run.
  key         text NOT NULL,
  -- Identity of the thing itself, e.g. 'Beispielheide|00|000/1' or 'II|1'. Lets a
  -- later run update the row it already created instead of duplicating it.
  natural_key text NOT NULL,
  sort_order  integer NOT NULL,
  data        jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Stored for now. Moves to the chosen-candidate pattern when cells get candidates.
  status          text NOT NULL,
  procedure       text,
  chosen_candidate_id text,
  UNIQUE (field_id, key),
  UNIQUE (field_id, natural_key)
);

CREATE TABLE IF NOT EXISTS candidate (
  id           text PRIMARY KEY,
  subfield_id  text REFERENCES subfield(id) ON DELETE CASCADE,
  table_row_id text REFERENCES table_row(id) ON DELETE CASCADE,
  -- The value as found. NULL for a redacted passage.
  value           text,
  -- The same value normalised for its type, so two spellings of one number are
  -- not read as a contradiction. Written at extraction time.
  canonical_value text,
  tag             text NOT NULL CHECK (tag IN ('extracted', 'manual', 'derived', 'redacted')),
  document_id     text REFERENCES document(id) ON DELETE CASCADE,
  page            integer,
  quote           text,
  source_label    text NOT NULL,
  -- Short German label shown on the card, e.g. 'spaeterer Stand'. Display only.
  note            text,
  source_class    text,
  -- Rectangle in the page image as fractions 0..1, so the marker survives any zoom.
  crop            jsonb,
  confidence      double precision,
  -- Competing readings of one passage: [{ "value": ..., "probability": ... }].
  readings        jsonb,
  -- The model's own sentence, or the person's reason for a manual correction.
  rationale       text,
  -- For tag 'derived': the candidate this was computed from.
  source_candidate_id text REFERENCES candidate(id) ON DELETE CASCADE,
  run             integer NOT NULL,
  created_by      text NOT NULL,
  created_at      timestamptz NOT NULL,
  -- A candidate writes into exactly one target.
  CHECK (num_nonnulls(subfield_id, table_row_id) = 1),
  -- Tags carry obligations; see docs/Plan/Datenmodell.md.
  CHECK (tag <> 'extracted' OR (document_id IS NOT NULL AND page IS NOT NULL)),
  CHECK (tag <> 'redacted'  OR (document_id IS NOT NULL AND page IS NOT NULL AND value IS NULL)),
  CHECK (tag <> 'manual'    OR rationale IS NOT NULL),
  CHECK (tag <> 'derived'   OR source_candidate_id IS NOT NULL)
);

-- subfield and candidate point at each other, so the circle is closed here, once both
-- tables exist. Deferred, so one transaction may insert a candidate and point the
-- subfield at it in either order.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'subfield_chosen_candidate_fk') THEN
    ALTER TABLE subfield ADD CONSTRAINT subfield_chosen_candidate_fk
      FOREIGN KEY (chosen_candidate_id) REFERENCES candidate(id) ON DELETE SET NULL
      DEFERRABLE INITIALLY DEFERRED;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'subfield_confirmed_candidate_fk') THEN
    ALTER TABLE subfield ADD CONSTRAINT subfield_confirmed_candidate_fk
      FOREIGN KEY (confirmed_candidate_id) REFERENCES candidate(id) ON DELETE SET NULL
      DEFERRABLE INITIALLY DEFERRED;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'table_row_chosen_candidate_fk') THEN
    ALTER TABLE table_row ADD CONSTRAINT table_row_chosen_candidate_fk
      FOREIGN KEY (chosen_candidate_id) REFERENCES candidate(id) ON DELETE SET NULL
      DEFERRABLE INITIALLY DEFERRED;
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS finding (
  id               text PRIMARY KEY,
  field_id         text NOT NULL REFERENCES field(id) ON DELETE CASCADE,
  subfield_id      text REFERENCES subfield(id) ON DELETE CASCADE,
  table_row_id     text REFERENCES table_row(id) ON DELETE CASCADE,
  title            text NOT NULL,
  text             text NOT NULL,
  created_in_run   integer NOT NULL,
  resolved_in_run  integer
);

CREATE TABLE IF NOT EXISTS history (
  id           text PRIMARY KEY,
  field_id     text NOT NULL REFERENCES field(id) ON DELETE CASCADE,
  subfield_id  text REFERENCES subfield(id) ON DELETE CASCADE,
  table_row_id text REFERENCES table_row(id) ON DELETE CASCADE,
  run          integer NOT NULL,
  written_at   timestamptz NOT NULL DEFAULT now(),
  actor        text NOT NULL CHECK (actor IN ('agent', 'user')),
  text         text NOT NULL
);

-- sent_at NULL is the request basket: positions collected but not yet sent.
CREATE TABLE IF NOT EXISTS request (
  id        text PRIMARY KEY,
  case_id   text NOT NULL REFERENCES case_file(id) ON DELETE CASCADE,
  run       integer NOT NULL,
  sent_at   timestamptz,
  recipient text NOT NULL DEFAULT '',
  subject   text NOT NULL DEFAULT '',
  body      text NOT NULL DEFAULT ''
);

-- At most one basket per case.
CREATE UNIQUE INDEX IF NOT EXISTS request_one_draft_per_case
  ON request (case_id) WHERE sent_at IS NULL;

CREATE TABLE IF NOT EXISTS request_item (
  id          text PRIMARY KEY,
  request_id  text NOT NULL REFERENCES request(id) ON DELETE CASCADE,
  field_id    text NOT NULL REFERENCES field(id) ON DELETE CASCADE,
  title       text NOT NULL,
  text        text NOT NULL,
  sort_order  integer NOT NULL,
  outcome     text,
  resolved_by text,
  UNIQUE (request_id, field_id)
);

-- Pages read per document within a run, for the progress strip.
CREATE TABLE IF NOT EXISTS run_document (
  run_id      text NOT NULL REFERENCES run(id) ON DELETE CASCADE,
  document_id text NOT NULL REFERENCES document(id) ON DELETE CASCADE,
  pages_read  integer NOT NULL DEFAULT 0,
  PRIMARY KEY (run_id, document_id)
);

CREATE INDEX IF NOT EXISTS candidate_by_subfield ON candidate (subfield_id);
CREATE INDEX IF NOT EXISTS candidate_by_row      ON candidate (table_row_id);
CREATE INDEX IF NOT EXISTS history_by_field      ON history (field_id, run);
CREATE INDEX IF NOT EXISTS finding_by_field      ON finding (field_id);
CREATE INDEX IF NOT EXISTS document_by_case      ON document (case_id);
CREATE INDEX IF NOT EXISTS page_by_document      ON page (document_id, number);
CREATE INDEX IF NOT EXISTS field_by_case         ON field (case_id, sort_order);
CREATE INDEX IF NOT EXISTS subfield_by_field     ON subfield (field_id, sort_order);
CREATE INDEX IF NOT EXISTS table_row_by_field    ON table_row (field_id, sort_order);
CREATE INDEX IF NOT EXISTS request_by_case       ON request (case_id);
