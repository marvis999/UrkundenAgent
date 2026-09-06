/**
 * The one place the app reads the wall clock.
 *
 * Status depends on today's date -- a Grundbuchauszug goes stale, an Energieausweis
 * expires -- so "now" is a value that gets passed in, never read from inside a rule.
 * That keeps every derivation reproducible and testable.
 *
 * Timestamps are stored in UTC and rendered in the office's local time; "today" is the
 * local day, because a deadline runs out at local midnight, not at midnight in Greenwich.
 */

/** Two-digit day, month, hour or minute. */
export const pad = (value: number) => String(value).padStart(2, "0");

export const nowIso = () => new Date().toISOString();

export const todayIso = (now = new Date()) => `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
