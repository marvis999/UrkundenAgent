import { pad, todayIso } from "./clock";
import { fromIsoDate } from "@/domain/value";

/** German count with singular/plural noun, e.g. plural(3, "Seite", "Seiten") = "3 Seiten". */
export const plural = (n: number, singular: string, pluralForm: string) => `${n} ${n === 1 ? singular : pluralForm}`;

export const formatRun = (n: number) => `Durchlauf ${n}`;

const NO_DATE = "ohne Datum";

/**
 * A document date is a plain date with no time of day, so it is formatted as written.
 * Documents without one say so rather than showing an empty cell.
 */
export const formatDate = (iso: string | null) => (iso === null ? NO_DATE : fromIsoDate(iso));

/* ---------- Timestamps ---------- */

/** Timestamps are stored in UTC and always read back through Date, so they show local time. */
const localParts = (isoTimestamp: string) => {
  const at = new Date(isoTimestamp);
  return {
    date: `${pad(at.getDate())}.${pad(at.getMonth() + 1)}.${at.getFullYear()}`,
    dayMonth: `${pad(at.getDate())}.${pad(at.getMonth() + 1)}.`,
    time: `${pad(at.getHours())}:${pad(at.getMinutes())}`,
    isoDate: todayIso(at),
  };
};

/** "04.09.2026" for a sent request or a document that arrived. */
export const formatTimestampDate = (isoTimestamp: string) => localParts(isoTimestamp).date;

/** "04.09.2026, 09:14" for a run. */
export const formatTimestamp = (isoTimestamp: string) => {
  const { date, time } = localParts(isoTimestamp);
  return `${date}, ${time}`;
};

/** "04.09. 09:14" for the compact history lines. */
export const formatLogTime = (isoTimestamp: string) => {
  const { dayMonth, time } = localParts(isoTimestamp);
  return `${dayMonth} ${time}`;
};

/** "heute, 11:42" while it is still today, "02.09.2026" afterwards. */
export const formatChangedAt = (isoTimestamp: string, today: string) => {
  const { date, time, isoDate } = localParts(isoTimestamp);
  return isoDate === today ? `heute, ${time}` : date;
};
