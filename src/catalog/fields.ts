import type { Clause, FieldGroup, FieldId, RequestTemplate } from "@/domain/model";
import type { ValueType } from "@/domain/value";
import { plural } from "@/lib/format";

/**
 * The field catalog: the ten fields of the deed and the subfields they consist of.
 *
 * This is the authority, not the database. Every case is built from it when it is opened,
 * so the shape is identical everywhere and a subfield can be addressed by a stable key
 * across runs.
 *
 * The request templates here state the general case: what this kind of field always needs
 * before it is usable. What *this* case is missing is written by a run, which overrides
 * them per field -- so nothing here may name a party, a date or an amount.
 */

export interface SubfieldDefinition {
  key: string;
  label: string;
  valueType: ValueType;
  /** Rule 5a: the source document may not be older than this many days. Omit = never stale. */
  staleAfterDays?: number;
  /** Rule 5b: the value is itself a validity date, and a date in the past makes it stale. */
  staleWhenValueInPast?: boolean;
  /** Rule 6: below this the reading counts as uncertain. */
  confidenceThreshold?: number;
}

/** Values of a field's subfields, by subfield key. Null where no value has been chosen. */
export interface SummaryInput {
  value: (subfieldKey: string) => string | null;
  /** The `data` object of each table row, in display order. */
  rows: readonly Record<string, string>[];
}

export interface FieldDefinition {
  key: FieldId;
  label: string;
  groupKey: string;
  kind: "values" | "table";
  subfields: readonly SubfieldDefinition[];
  request?: RequestTemplate;
  /** The one-line value shown in the collapsed field header. Derived, never stored. */
  summary: (input: SummaryInput) => string;
}

/* ---------- Helpers for the summary lines ---------- */

/** Joins the parts that actually have a value, so a partly filled field still reads well. */
const join = (...parts: readonly (string | null)[]) => parts.filter((p): p is string => p !== null && p !== "").join(", ");

const prefixed = (prefix: string, value: string | null) => (value === null ? null : `${prefix}${value}`);

const suffixed = (value: string | null, suffix: string) => (value === null ? null : `${value}${suffix}`);

const countWhere = (rows: readonly Record<string, string>[], key: string, value: string) =>
  rows.filter((row) => row[key] === value).length;

/* ---------- Deadlines, as days ---------- */

/**
 * How old a source may be before the value it carries is no longer usable for a deed.
 * A register extract goes stale because the register moves on; an architect's floor area
 * calculation does not, so it carries no deadline and its reading is judged instead.
 */
const REGISTER_EXTRACT = 180;
const PARTY_OVERVIEW = 365;

/** Below this a reading counts as uncertain, unless a subfield sets its own. */
const DEFAULT_THRESHOLD = 0.7;

/* ---------- Groups and clauses ---------- */

export const FIELD_GROUPS: readonly FieldGroup[] = [
  { id: "parties", title: "Beteiligte", fieldIds: ["seller", "buyer"] },
  { id: "property", title: "Grundbuch und Kaufgegenstand", fieldIds: ["landRegister", "parcels"] },
  { id: "price", title: "Kaufpreis und Finanzierung", fieldIds: ["purchasePrice", "financing"] },
  { id: "burdens", title: "Lasten und Nutzung", fieldIds: ["encumbrances", "tenancies"] },
  { id: "proofs", title: "Nachweise und Termine", fieldIds: ["energyCertificate", "handover"] },
];

export const CLAUSES: readonly Clause[] = [
  { number: "§ 1", title: "Grundbuchstand und Eigentümerin", fieldIds: ["landRegister", "seller"] },
  { number: "§ 2", title: "Beteiligte", fieldIds: ["buyer"] },
  { number: "§ 3", title: "Kaufgegenstand", fieldIds: ["parcels"] },
  { number: "§ 4", title: "Kaufpreis", fieldIds: ["purchasePrice"] },
  { number: "§ 5", title: "Belastungen", fieldIds: ["encumbrances"] },
  { number: "§ 6", title: "Finanzierung und Grundschuldbestellung", fieldIds: ["financing"] },
  { number: "§ 7", title: "Mietverhältnisse", fieldIds: ["tenancies"] },
  { number: "§ 8", title: "Besitzübergang", fieldIds: ["handover"] },
  { number: "§ 9", title: "Energieausweis", fieldIds: ["energyCertificate"] },
];

/* ---------- The ten fields ---------- */

export const FIELD_CATALOG: readonly FieldDefinition[] = [
  {
    key: "seller",
    label: "Verkäuferin",
    groupKey: "parties",
    kind: "values",
    subfields: [
      { key: "owner", label: "Eingetragene Eigentümerin", valueType: "text", staleAfterDays: REGISTER_EXTRACT },
      { key: "legalForm", label: "Rechtsform", valueType: "text" },
      { key: "representatives", label: "Vertretungsberechtigte", valueType: "text", staleAfterDays: REGISTER_EXTRACT },
      { key: "proofs", label: "Nachweise", valueType: "text" },
    ],
    request: {
      title: "Aktueller Registerauszug der Verkäuferin",
      text: "Handelsregisterauszug nebst Gesellschafterliste und Nachweis der Vertretungsberechtigung.",
    },
    summary: ({ value }) => join(value("owner")),
  },
  {
    key: "buyer",
    label: "Käuferin",
    groupKey: "parties",
    kind: "values",
    subfields: [
      { key: "company", label: "Firma", valueType: "text" },
      { key: "registerData", label: "Registerdaten", valueType: "register", staleAfterDays: REGISTER_EXTRACT },
      { key: "representation", label: "Vertretung", valueType: "text", staleAfterDays: REGISTER_EXTRACT },
      { key: "address", label: "Anschrift", valueType: "text" },
    ],
    request: {
      title: "Handelsregisterauszug und Vertretungsnachweis der Käuferin",
      text: "Aktueller Registerauszug, Nachweis der Vertretungsberechtigung und Geschäftsanschrift der Käuferin.",
    },
    summary: ({ value }) => join(value("company")),
  },
  {
    key: "landRegister",
    label: "Grundbuch",
    groupKey: "property",
    kind: "values",
    subfields: [
      { key: "court", label: "Amtsgericht", valueType: "text", staleAfterDays: REGISTER_EXTRACT },
      { key: "registerOf", label: "Grundbuch von", valueType: "text", staleAfterDays: REGISTER_EXTRACT },
      { key: "sheet", label: "Blatt", valueType: "register", staleAfterDays: REGISTER_EXTRACT },
    ],
    request: {
      title: "Aktueller Grundbuchauszug",
      text: "Beglaubigter Auszug neueren Datums mit Aufschrift, Bestandsverzeichnis und den Abteilungen I bis III.",
    },
    summary: ({ value }) => join(prefixed("AG ", value("court")), value("registerOf"), prefixed("Blatt ", value("sheet"))),
  },
  {
    key: "parcels",
    label: "Grundstücke",
    groupKey: "property",
    kind: "table",
    subfields: [
      { key: "address", label: "Anschrift des Objekts", valueType: "text" },
      { key: "soldParcels", label: "Verkaufte Flurstücke", valueType: "text", staleAfterDays: REGISTER_EXTRACT },
    ],
    request: {
      title: "Bestandsverzeichnis im aktuellen Auszug",
      text: "Sämtliche verkauften Flurstücke mit Gemarkung, Flur, Größe und Wirtschaftsart.",
    },
    summary: ({ value, rows }) =>
      join(value("address"), plural(rows.length, "Flurstück", "Flurstücke"), prefixed("Flur ", rows[0]?.section ?? null)),
  },
  {
    key: "purchasePrice",
    label: "Kaufpreis",
    groupKey: "price",
    kind: "values",
    subfields: [
      { key: "digits", label: "Betrag in Ziffern", valueType: "amount" },
      { key: "words", label: "Betrag in Worten", valueType: "text" },
    ],
    request: {
      title: "Schriftliche Bestätigung des Kaufpreises",
      text: "Bestätigung beider Parteien über den vereinbarten Betrag, damit er nicht nur als Angabe im Schriftverkehr vorliegt.",
    },
    summary: ({ value }) => join(value("digits")),
  },
  {
    key: "financing",
    label: "Finanzierung",
    groupKey: "price",
    kind: "values",
    subfields: [
      { key: "creditor", label: "Gläubigerin", valueType: "text" },
      { key: "chargeAmount", label: "Grundschuldbetrag", valueType: "amount" },
    ],
    request: {
      title: "Finanzierungsbestätigung der Bank",
      text: "Bestätigung des finanzierenden Instituts über Gläubigerin und Höhe der zu bestellenden Grundschuld.",
    },
    summary: ({ value }) => join(value("creditor"), value("chargeAmount")),
  },
  {
    key: "encumbrances",
    label: "Belastungen",
    groupKey: "burdens",
    kind: "table",
    subfields: [{ key: "asOf", label: "Stand der Abteilungen", valueType: "date", staleAfterDays: REGISTER_EXTRACT }],
    request: {
      title: "Abteilungen II und III im aktuellen Auszug",
      text: "Zusätzlich: Soll die Grundschuld in Abteilung III gelöscht, übernommen oder abgelöst werden? Löschungsbewilligung der Gläubigerin, falls Löschung.",
    },
    summary: ({ rows }) =>
      join(
        `Abt. II: ${plural(countWhere(rows, "section", "II"), "Eintrag", "Einträge")}`,
        `Abt. III: ${plural(countWhere(rows, "section", "III"), "Eintrag", "Einträge")}`,
      ),
  },
  {
    key: "tenancies",
    label: "Mietverhältnisse",
    groupKey: "burdens",
    kind: "values",
    subfields: [
      { key: "transfer", label: "Übergehende Mietverhältnisse", valueType: "text", staleAfterDays: PARTY_OVERVIEW },
      { key: "area", label: "Wohn- und Nutzfläche", valueType: "area" },
      { key: "annualRent", label: "Jahresnettomiete", valueType: "amount", staleAfterDays: PARTY_OVERVIEW },
      { key: "tenantNames", label: "Mieternamen", valueType: "text" },
    ],
    request: {
      title: "Mietverträge und aktuelle Flächenaufstellung",
      text: "Sämtliche Mietverträge nebst Nachträgen sowie eine aktuelle Aufstellung der Flächen und der Jahresnettomiete.",
    },
    summary: ({ value }) => join(value("transfer"), suffixed(value("annualRent"), " p. a.")),
  },
  {
    key: "energyCertificate",
    label: "Energieausweis",
    groupKey: "proofs",
    kind: "values",
    subfields: [
      { key: "type", label: "Art", valueType: "text" },
      { key: "value", label: "Kennwert", valueType: "measure" },
      { key: "validity", label: "Gültigkeit", valueType: "date", staleWhenValueInPast: true },
    ],
    request: {
      title: "Gültiger Energieausweis",
      text: "Energieausweis mit Art, Kennwert und Gültigkeitsdatum, gültig am Tag der Beurkundung.",
    },
    summary: ({ value }) => join(value("type"), prefixed("gültig bis ", value("validity"))),
  },
  {
    key: "handover",
    label: "Übergabe",
    groupKey: "proofs",
    kind: "values",
    subfields: [
      { key: "date", label: "Besitzübergang", valueType: "date" },
      { key: "rule", label: "Regelung", valueType: "text" },
    ],
    request: {
      title: "Bestätigung des Übergabetermins",
      text: "Von beiden Parteien bestätigtes Datum des Besitzübergangs und die Regelung, die daran hängt.",
    },
    summary: ({ value }) => join(value("date")),
  },
];

const BY_KEY = new Map(FIELD_CATALOG.map((definition) => [definition.key, definition]));

export const fieldDefinition = (key: FieldId): FieldDefinition | undefined => BY_KEY.get(key);

export const subfieldDefaults = (definition: SubfieldDefinition) => ({
  staleAfterDays: definition.staleAfterDays ?? null,
  staleWhenValueInPast: definition.staleWhenValueInPast ?? false,
  confidenceThreshold: definition.confidenceThreshold ?? DEFAULT_THRESHOLD,
});
