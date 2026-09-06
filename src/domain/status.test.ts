import assert from "node:assert/strict";
import test from "node:test";
import { computeSubfieldStatus, explainStatus, type StatusCandidate, type StatusContext, type StatusSubfield } from "./computeStatus";

/**
 * The status rules.
 *
 * Everything on screen reads from this one function -- badge, field status, the bar, the
 * counters, the banner, the finding. So these tests are not about a component rendering:
 * they are about the two sentences the whole app rests on, that a value never exists
 * without a source and a status never exists without a reason.
 */

const TODAY = "2026-09-06";

const context = (dates: Record<string, string> = {}): StatusContext => ({
  documentDate: (id) => dates[id],
  today: TODAY,
});

const subfield = (over: Partial<StatusSubfield> = {}): StatusSubfield => ({
  chosenCandidateId: "c1",
  confirmedCandidateId: null,
  staleAfterDays: null,
  staleWhenValueInPast: false,
  confidenceThreshold: 0.7,
  ...over,
});

const candidate = (over: Partial<StatusCandidate> = {}): StatusCandidate => ({
  id: "c1",
  value: "Musterhof Grundbesitz mbH",
  canonicalValue: "musterhof grundbesitz mbh",
  tag: "extracted",
  documentId: "d1",
  confidence: 0.95,
  readings: [],
  sourceLabel: "Grundbuchauszug 15.11.2011, S. 2",
  ...over,
});

test("a value read off a document is a proposal until somebody says otherwise", () => {
  assert.equal(computeSubfieldStatus(subfield(), [candidate()], context()), "proposed");
});

test("no candidate chosen is missing, whatever else lies around", () => {
  const others = [candidate({ id: "c2" }), candidate({ id: "c3" })];
  assert.equal(computeSubfieldStatus(subfield({ chosenCandidateId: null }), others, context()), "missing");
});

test("the confirmation names one candidate, so choosing another unconfirms the value", () => {
  const rows = [candidate(), candidate({ id: "c2", canonicalValue: "musterhof grundbesitz mbh" })];
  const confirmed = subfield({ confirmedCandidateId: "c1" });
  assert.equal(computeSubfieldStatus(confirmed, rows, context()), "confirmed");

  // The same confirmation, with the field now pointing at the other candidate.
  const moved = subfield({ chosenCandidateId: "c2", confirmedCandidateId: "c1" });
  assert.notEqual(computeSubfieldStatus(moved, rows, context()), "confirmed");
});

test("a redaction is a finished answer, not a missing one", () => {
  const redacted = candidate({ tag: "redacted", value: null, canonicalValue: null });
  assert.equal(computeSubfieldStatus(subfield(), [redacted], context()), "redacted");
});

test("two documents that disagree make a contradiction, and neither wins", () => {
  const rows = [candidate(), candidate({ id: "c2", canonicalValue: "andere gmbh", documentId: "d2" })];
  assert.equal(computeSubfieldStatus(subfield(), rows, context()), "conflict");
});

test("two documents that agree in different spellings do not", () => {
  const rows = [
    candidate({ value: "2.060.000 EUR", canonicalValue: "2060000.00 eur" }),
    candidate({ id: "c2", value: "2.060.000,00 EUR", canonicalValue: "2060000.00 eur", documentId: "d2" }),
  ];
  assert.equal(computeSubfieldStatus(subfield(), rows, context()), "proposed");
});

test("once a person has decided, the disagreement between documents is history", () => {
  const rows = [
    candidate({ id: "m1", tag: "manual", canonicalValue: "vom sachbearbeiter", documentId: null }),
    candidate({ id: "c2", canonicalValue: "eine lesung" }),
    candidate({ id: "c3", canonicalValue: "eine andere" }),
  ];
  assert.equal(computeSubfieldStatus(subfield({ chosenCandidateId: "m1" }), rows, context()), "proposed");
});

test("a source older than the deadline makes the value stale", () => {
  const rules = subfield({ staleAfterDays: 180 });
  const dates = context({ d1: "2011-11-15" });
  assert.equal(computeSubfieldStatus(rules, [candidate()], dates), "outdated");
});

test("a source inside the deadline does not, and a subfield without a deadline never goes stale", () => {
  const fresh = context({ d1: "2026-08-01" });
  assert.equal(computeSubfieldStatus(subfield({ staleAfterDays: 180 }), [candidate()], fresh), "proposed");

  const ancient = context({ d1: "1991-01-01" });
  assert.equal(computeSubfieldStatus(subfield(), [candidate()], ancient), "proposed");
});

test("a validity date that has passed makes the value stale by itself", () => {
  const rules = subfield({ staleWhenValueInPast: true });
  const expired = candidate({ value: "12.04.2026" });
  assert.equal(computeSubfieldStatus(rules, [expired], context()), "outdated");

  const valid = candidate({ value: "12.03.2028" });
  assert.equal(computeSubfieldStatus(rules, [valid], context()), "proposed");
});

test("a reading below the threshold is uncertain, and so is one with competing readings", () => {
  const unsure = candidate({ confidence: 0.4 });
  assert.equal(computeSubfieldStatus(subfield(), [unsure], context()), "uncertain");

  const ambiguous = candidate({ confidence: 0.99, readings: ["6", "8"] });
  assert.equal(computeSubfieldStatus(subfield(), [ambiguous], context()), "uncertain");
});

test("a finding is the rule that fired, filled with data, and nothing where no rule did", () => {
  const rows = [
    candidate({ value: "2.060.000 EUR", canonicalValue: "2060000", sourceLabel: "E-Mail 02.09.2026, S. 1" }),
    candidate({ id: "c2", value: "2.100.000 EUR", canonicalValue: "2100000", sourceLabel: "E-Mail 02.09.2026, S. 1", documentId: "d2" }),
  ];
  const conflict = explainStatus("conflict", subfield(), rows, context());
  assert.ok(conflict?.text.includes("„2.060.000 EUR“") && conflict.text.includes("„2.100.000 EUR“"));

  const stale = explainStatus("outdated", subfield({ staleAfterDays: 180 }), [candidate()], context({ d1: "2011-11-15" }));
  assert.ok(stale?.text.includes("15.11.2011") && stale.text.includes("180 Tage"));

  const readings = explainStatus("uncertain", subfield(), [candidate({ readings: ["6", "8"] })], context());
  assert.ok(readings?.text.includes("6 | 8"));

  assert.equal(explainStatus("proposed", subfield(), [candidate()], context()), undefined);
  assert.equal(explainStatus("missing", subfield({ chosenCandidateId: null }), [], context()), undefined);
});

test("a computed value says so, so that it gets read against its source", () => {
  const derived = candidate({ tag: "derived", documentId: null, confidence: null });
  assert.equal(computeSubfieldStatus(subfield(), [derived], context()), "derived");
});

test("a confirmed value stays confirmed even where a rule would otherwise fire", () => {
  // Somebody looked at the 2011 extract and signed the value off anyway; that decision
  // outranks the deadline, and the history says who made it.
  const rules = subfield({ confirmedCandidateId: "c1", staleAfterDays: 180 });
  assert.equal(computeSubfieldStatus(rules, [candidate()], context({ d1: "2011-11-15" })), "confirmed");
});

test("the worse reason wins: a contradiction is reported before staleness", () => {
  const rows = [candidate(), candidate({ id: "c2", canonicalValue: "andere gmbh", documentId: "d2" })];
  const rules = subfield({ staleAfterDays: 180 });
  assert.equal(computeSubfieldStatus(rules, rows, context({ d1: "2011-11-15", d2: "2011-11-15" })), "conflict");
});
