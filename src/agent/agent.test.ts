import assert from "node:assert/strict";
import { test } from "node:test";
import { legalFormOf, spellAmount, spellInteger } from "./derived";
import { prepareCandidates, preferredCandidate, type MergeInput, type PreparedCandidate } from "./merge";
import type { DocumentFacts } from "./tasks/classifyDocument";
import type { RawCandidate } from "./tasks/extractCandidates";
import type { PlannedPage } from "./plan";

/**
 * The parts of the run that no model touches.
 *
 * These two modules exist precisely because a model cannot be trusted with them: one
 * writes out a Kaufpreis in words, the other decides whether a quoted passage really
 * stands on the page it claims to. A fault in either is invisible -- the output reads
 * perfectly either way -- which is what makes them worth testing and not worth prompting.
 */

/* ---------- Amount in digits to amount in words ---------- */

test("an amount is written out the way a deed writes it", () => {
  assert.equal(spellAmount("2.060.000,00 EUR"), "zwei Millionen sechzigtausend Euro");
  assert.equal(spellAmount("2.100.000 EUR"), "zwei Millionen einhunderttausend Euro");
  assert.equal(spellAmount("1.650.000,00 EUR"), "eine Million sechshundertfünfzigtausend Euro");
});

test("German runs the words together below a million and keeps Million apart", () => {
  assert.equal(spellInteger(1_184), "eintausendeinhundertvierundachtzig");
  assert.equal(spellInteger(21), "einundzwanzig");
  assert.equal(spellInteger(1_000_000), "eine Million");
  assert.equal(spellInteger(2_060_184), "zwei Millionen sechzigtausendeinhundertvierundachtzig");
});

test("cents are written out rather than dropped", () => {
  assert.equal(spellAmount("1.184,60 EUR"), "eintausendeinhundertvierundachtzig Euro und sechzig Cent");
});

test("an amount that does not parse yields nothing rather than a wrong number", () => {
  assert.equal(spellAmount("etwa zwei Millionen"), null);
  assert.equal(spellInteger(-1), null);
  assert.equal(spellInteger(1.5), null);
});

/* ---------- Firmierung to Rechtsform ---------- */

test("the legal form comes off the end of the Firmierung, longest suffix first", () => {
  assert.equal(legalFormOf("Musterhof Grundbesitz mbH"), "GmbH");
  assert.equal(legalFormOf("Beispiel Wohnbau GmbH"), "GmbH");
  assert.equal(legalFormOf("Beispiel Verwaltung GmbH & Co. KG"), "GmbH & Co. KG");
  assert.equal(legalFormOf("Nordwind UG (haftungsbeschränkt)"), "UG (haftungsbeschränkt)");
});

test("an unknown Firmierung yields nothing, because a guessed Rechtsform looks like a read one", () => {
  assert.equal(legalFormOf("Erbengemeinschaft Meier"), null);
});

/* ---------- The quote check ---------- */

const PAGE_TEXT =
  "Amtsgericht Musterstadt, Grundbuch von Beispielheide, Blatt 00000.\nAbteilung I, Nr. 1:\nMusterhof Grundbesitz mbH.";

const textPage = (): PlannedPage => ({ number: 2, imagePath: "irrelevant.png", width: 1124, height: 1600, text: PAGE_TEXT });

const imagePage = (): PlannedPage => ({ number: 1, imagePath: "photo.png", width: 1600, height: 1200, text: "" });

const FACTS: DocumentFacts = {
  docType: "Grundbuchauszug",
  docDate: "2011-11-15",
  sourceClass: "register",
  status: "outdated",
  quality: "Scan, gut lesbar",
  title: "Grundbuch von Beispielheide",
  subtitle: "Amtsgericht Musterstadt",
  photoCaption: null,
  photoHint: null,
};

const raw = (over: Partial<RawCandidate> = {}): RawCandidate => ({
  targetKind: "subfield",
  subfieldKey: "owner",
  rowNaturalKey: null,
  cells: [],
  value: "Musterhof Grundbesitz mbH",
  tag: "extracted",
  pageRef: 1,
  quote: "Musterhof Grundbesitz mbH.",
  crop: null,
  cropHint: null,
  cropQuestion: null,
  confidence: 0.71,
  readings: null,
  rationale: "In Abteilung I als Eigentümerin eingetragen.",
  ...over,
});

const merge = (candidates: readonly RawCandidate[], page: PlannedPage = textPage()): MergeInput => ({
  fieldKey: "seller",
  offered: [{ documentId: "case:doc", fileName: "grundbuch.pdf", page }],
  candidates,
  facts: new Map([["case:doc", FACTS]]),
});

test("a quote that stands on the page is admitted, with its canonical form written", () => {
  const { prepared, rejected } = prepareCandidates(merge([raw()]));
  assert.equal(rejected.length, 0);
  assert.equal(prepared.length, 1);
  assert.equal(prepared[0]?.value, "Musterhof Grundbesitz mbH");
  assert.equal(prepared[0]?.canonicalValue, "musterhof grundbesitz mbh");
  assert.equal(prepared[0]?.page, 2);
  assert.equal(prepared[0]?.sourceLabel, "Grundbuchauszug 15.11.2011, S. 2");
});

test("whitespace is not evidence: a quote broken across lines still counts as verbatim", () => {
  const { prepared } = prepareCandidates(merge([raw({ quote: "Abteilung I,   Nr. 1:\n Musterhof" })]));
  assert.equal(prepared.length, 1);
});

test("a quote that does not stand on the page is discarded, however confident", () => {
  const { prepared, rejected } = prepareCandidates(
    merge([raw({ value: "Musterhof Grundbesitz GmbH", quote: "Musterhof Grundbesitz GmbH.", confidence: 0.99 })]),
  );
  assert.equal(prepared.length, 0);
  assert.match(rejected[0]?.reason ?? "", /nicht wörtlich/);
});

test("a text page with no quote at all is discarded", () => {
  const { prepared, rejected } = prepareCandidates(merge([raw({ quote: null })]));
  assert.equal(prepared.length, 0);
  assert.match(rejected[0]?.reason ?? "", /ohne Zitat/);
});

test("an image page needs no quote, and its crop is kept", () => {
  const { prepared } = prepareCandidates(
    merge(
      [raw({ quote: null, crop: { x: 0.24, y: 0.58, w: 0.44, h: 0.16 }, cropHint: "Summenzeile überschrieben" })],
      imagePage(),
    ),
  );
  assert.equal(prepared.length, 1);
  assert.equal(prepared[0]?.crop?.x, 0.24);
  assert.equal(prepared[0]?.crop?.hint, "Summenzeile überschrieben");
  assert.equal(prepared[0]?.note, "Bildlesung");
});

test("a readable value outranks the label: the evidence decides the tag", () => {
  // A struck-through Grundbuch entry gets called "geschwärzt" often enough that trusting
  // the label would throw away a value that is plainly legible.
  const { prepared, rejected } = prepareCandidates(
    merge([raw({ tag: "redacted", value: "Musterhof Grundbesitz mbH" })]),
  );
  assert.equal(rejected.length, 0);
  assert.equal(prepared[0]?.tag, "extracted");
  assert.equal(prepared[0]?.value, "Musterhof Grundbesitz mbH");
});

test("a passage that yields nothing is a redaction only when it says so", () => {
  const claimed = prepareCandidates(merge([raw({ tag: "redacted", value: null })], imagePage()));
  assert.equal(claimed.rejected.length, 0);
  assert.equal(claimed.prepared[0]?.tag, "redacted");
  assert.equal(claimed.prepared[0]?.value, null);

  // No value and no claim of a redaction is a candidate about nothing.
  const empty = prepareCandidates(merge([raw({ value: "   " })]));
  assert.match(empty.rejected[0]?.reason ?? "", /ohne Wert/);
});

test("a table row without an identity cannot be recognised again and is discarded", () => {
  const noRowKey = prepareCandidates(merge([raw({ targetKind: "row", rowNaturalKey: "  " })]));
  assert.match(noRowKey.rejected[0]?.reason ?? "", /ohne rowNaturalKey/);
});

test("the target comes from targetKind, so a placeholder in the unused half is ignored", () => {
  // A model that must fill every property puts something in the half that does not apply.
  const { prepared, rejected } = prepareCandidates(merge([raw({ rowNaturalKey: "n/a" })]));
  assert.equal(rejected.length, 0);
  assert.equal(prepared[0]?.subfieldKey, "owner");
  assert.equal(prepared[0]?.rowNaturalKey, null);
});

test("a subfield key the catalog does not know is discarded, not written nowhere", () => {
  const { prepared, rejected } = prepareCandidates(merge([raw({ subfieldKey: "row" })]));
  assert.equal(prepared.length, 0);
  assert.match(rejected[0]?.reason ?? "", /unbekanntes Unterfeld/);
});

test("a pageRef that belongs to no page in the request is discarded", () => {
  const { rejected } = prepareCandidates(merge([raw({ pageRef: 7 })]));
  assert.match(rejected[0]?.reason ?? "", /keiner Seite/);
});

test("the same passage read twice in one run is one candidate", () => {
  const { prepared } = prepareCandidates(merge([raw(), raw({ confidence: 0.7 })]));
  assert.equal(prepared.length, 1);
});

/* ---------- Which candidate sits in the field ---------- */

const candidate = (over: Partial<PreparedCandidate>): PreparedCandidate => ({
  id: "c1",
  fieldKey: "purchasePrice",
  subfieldKey: "digits",
  rowNaturalKey: null,
  cells: {},
  value: "2.060.000,00 EUR",
  canonicalValue: "2060000",
  tag: "extracted",
  documentId: "case:mail",
  page: 1,
  quote: "2.060.000 EUR",
  sourceLabel: "E-Mail",
  note: null,
  sourceClass: "partyStatement",
  crop: null,
  confidence: 0.8,
  readings: null,
  rationale: "",
  ...over,
});

test("the default choice is the more confident reading, then the more recent document", () => {
  const dates = new Map([
    ["case:old", "2011-11-15"],
    ["case:new", "2026-09-03"],
  ]);
  const documentDate = (id: string) => dates.get(id) ?? null;

  const byConfidence = preferredCandidate(
    [candidate({ id: "a", confidence: 0.6 }), candidate({ id: "b", confidence: 0.9 })],
    documentDate,
  );
  assert.equal(byConfidence?.id, "b");

  const byDate = preferredCandidate(
    [candidate({ id: "old", documentId: "case:old" }), candidate({ id: "new", documentId: "case:new" })],
    documentDate,
  );
  assert.equal(byDate?.id, "new");
});

test("a redaction becomes the value only when nothing readable competes with it", () => {
  const documentDate = () => null;
  const both = preferredCandidate(
    [candidate({ id: "hidden", tag: "redacted", value: null, confidence: 1 }), candidate({ id: "read", confidence: 0.2 })],
    documentDate,
  );
  assert.equal(both?.id, "read");

  const alone = preferredCandidate([candidate({ id: "hidden", tag: "redacted", value: null })], documentDate);
  assert.equal(alone?.id, "hidden");
});
