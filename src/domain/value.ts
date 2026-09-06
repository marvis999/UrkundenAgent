/**
 * Value types and canonicalisation.
 *
 * Status rule 4 says two candidates contradict each other when their values differ
 * "nach Kanonisierung". Without this, "2.060.000 EUR" and "2.060.000,00 EUR" would be
 * read as a contradiction and every field with two sources would turn orange.
 * The canonical form is written once at extraction time and compared as a string.
 */

import { pad } from "@/lib/clock";

export type ValueType = "text" | "amount" | "date" | "area" | "register" | "measure";

const GERMAN_DATE = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** German or ISO date to ISO. Returns undefined for anything else, including "ohne Datum". */
export const toIsoDate = (raw: string): string | undefined => {
  const trimmed = raw.trim();
  const iso = ISO_DATE.exec(trimmed);
  if (iso) return trimmed;
  const german = GERMAN_DATE.exec(trimmed);
  if (!german) return undefined;
  const [, day, month, year] = german as unknown as [string, string, string, string];
  return `${year}-${pad(Number(month))}-${pad(Number(day))}`;
};

/** ISO date to the German form the UI shows. */
export const fromIsoDate = (iso: string): string => {
  const match = ISO_DATE.exec(iso);
  if (!match) return iso;
  const [, year, month, day] = match as unknown as [string, string, string, string];
  return `${day}.${month}.${year}`;
};

/** Whole days from `from` to `to`, both ISO. Negative when `to` lies before `from`. */
export const daysBetween = (from: string, to: string) => {
  const MS_PER_DAY = 86_400_000;
  return Math.floor((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / MS_PER_DAY);
};

/** First number in a German-formatted string, e.g. "1.184,60 m²" -> 1184.6. */
const germanNumber = (raw: string): number | undefined => {
  const match = /-?\d[\d.]*(?:,\d+)?/.exec(raw);
  if (!match) return undefined;
  const parsed = Number(match[0].replace(/\./g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : undefined;
};

const squash = (raw: string) => raw.trim().replace(/\s+/g, " ");

/**
 * The comparable form of a value. Two candidates agree when these are equal.
 * Falls back to squashed lowercase text whenever the value does not parse,
 * so an unparseable value is never silently treated as equal to another.
 */
export const canonicalize = (value: string | null, type: ValueType): string | null => {
  if (value === null) return null;
  const text = squash(value);
  if (text === "") return "";

  switch (type) {
    case "amount":
    case "area":
    case "measure": {
      const n = germanNumber(text);
      return n === undefined ? text.toLowerCase() : String(n);
    }
    case "date":
      return toIsoDate(text) ?? text.toLowerCase();
    case "register":
      // Register numbers differ only in punctuation and case: "HRB 12 345" = "hrb12345".
      return text.toLowerCase().replace(/[\s.\-/]/g, "");
    case "text":
      return text.toLowerCase();
  }
};
