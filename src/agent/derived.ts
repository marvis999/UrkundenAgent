import { canonicalize } from "@/domain/value";

/**
 * Values computed from other values.
 *
 * Deliberately not a model. "Zwei Millionen sechzigtausend Euro" is a mechanical
 * transformation of a number, and a model writing it out is a way to get it quietly
 * wrong -- quietly, because the result reads perfectly either way. A deed whose amount
 * in digits and amount in words disagree is exactly the damage this system exists to
 * prevent, so the transformation is code and it is testable.
 *
 * Every derived value names the candidate it came from. When that candidate stops being
 * the chosen one the derived value is not merely unconfirmed, it is wrong, and the
 * mutation layer removes it (see `dropStaleDerived`). A later run puts it back from the
 * new source.
 */

export interface Derivation {
  /** Subfield the value is written to, as `<field>.<subfield>`. */
  readonly target: string;
  /** Subfield the value is read from. */
  readonly source: string;
  readonly compute: (value: string) => string | null;
  /** The model's own sentence would go here; a derivation states its rule instead. */
  readonly rationale: (value: string, result: string) => string;
  readonly sourceLabel: string;
}

/* ---------- Amount in digits to amount in words ---------- */

const ONES = [
  "null", "ein", "zwei", "drei", "vier", "fünf", "sechs", "sieben", "acht", "neun",
  "zehn", "elf", "zwölf", "dreizehn", "vierzehn", "fünfzehn", "sechzehn", "siebzehn", "achtzehn", "neunzehn",
] as const;

const TENS = ["", "", "zwanzig", "dreißig", "vierzig", "fünfzig", "sechzig", "siebzig", "achtzig", "neunzig"] as const;

/** German writes the unit before the ten: 21 is einundzwanzig. */
const underHundred = (n: number): string => {
  if (n < ONES.length) return ONES[n] ?? "";
  const tens = TENS[Math.floor(n / 10)] ?? "";
  const ones = n % 10;
  return ones === 0 ? tens : `${ONES[ones]}und${tens}`;
};

const underThousand = (n: number): string => {
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  if (hundreds === 0) return underHundred(rest);
  return `${ONES[hundreds]}hundert${rest === 0 ? "" : underHundred(rest)}`;
};

const MILLION = 1_000_000;
const THOUSAND = 1_000;

/** Integers up to 999.999.999. Beyond that a Kaufpreis is not the problem. */
export const spellInteger = (n: number): string | null => {
  if (!Number.isInteger(n) || n < 0 || n >= 1_000 * MILLION) return null;
  if (n === 0) return "null";

  const millions = Math.floor(n / MILLION);
  const thousands = Math.floor((n % MILLION) / THOUSAND);
  const rest = n % THOUSAND;

  // Below a million German runs the words together -- eintausendeinhundertvierundachtzig.
  // Million is a noun and stands apart: zwei Millionen sechzigtausend.
  const belowMillion = `${thousands > 0 ? `${underThousand(thousands)}tausend` : ""}${rest > 0 ? underThousand(rest) : ""}`;
  const millionPart = millions === 0 ? "" : millions === 1 ? "eine Million" : `${underThousand(millions)} Millionen`;
  return [millionPart, belowMillion].filter((part) => part !== "").join(" ");
};

/**
 * "2.060.000,00 EUR" to "zwei Millionen sechzigtausend Euro". The numeric value comes
 * from the same canonicalisation the status rules compare with, so the words can never
 * describe a different number than the one the field holds.
 */
export const spellAmount = (raw: string): string | null => {
  const canonical = canonicalize(raw, "amount");
  const amount = canonical === null ? Number.NaN : Number(canonical);
  if (!Number.isFinite(amount) || amount < 0) return null;

  const euros = Math.floor(amount);
  const cents = Math.round((amount - euros) * 100);
  const words = spellInteger(euros);
  if (words === null) return null;
  return cents === 0 ? `${words} Euro` : `${words} Euro und ${underHundred(cents)} Cent`;
};

/* ---------- Firmierung to Rechtsform ---------- */

/**
 * Longest suffix first: "GmbH & Co. KG" must not be read as a KG, and a firm ending in
 * "mbH" is a GmbH written the old way. Anything not on this list yields nothing rather
 * than a guess -- the Rechtsform belongs in a register extract, and an invented one
 * would look exactly as confident as a read one.
 */
const LEGAL_FORMS: readonly (readonly [RegExp, string])[] = [
  [/GmbH\s*&\s*Co\.?\s*KGaA$/i, "GmbH & Co. KGaA"],
  [/GmbH\s*&\s*Co\.?\s*KG$/i, "GmbH & Co. KG"],
  [/UG\s*\(haftungsbeschränkt\)$/i, "UG (haftungsbeschränkt)"],
  [/gGmbH$/i, "gGmbH"],
  [/GmbH$/i, "GmbH"],
  [/mbH$/i, "GmbH"],
  [/KGaA$/i, "KGaA"],
  [/AG$/i, "AG"],
  [/SE$/i, "SE"],
  [/OHG$/i, "OHG"],
  [/KG$/i, "KG"],
  [/GbR$/i, "GbR"],
  [/eG$/i, "eG"],
  [/e\.\s*K\.$/i, "e.K."],
];

export const legalFormOf = (company: string): string | null => {
  const trimmed = company.trim();
  return LEGAL_FORMS.find(([pattern]) => pattern.test(trimmed))?.[1] ?? null;
};

/* ---------- The derivations a run applies ---------- */

export const DERIVATIONS: readonly Derivation[] = [
  {
    target: "purchasePrice.words",
    source: "purchasePrice.digits",
    compute: spellAmount,
    sourceLabel: "aus dem Ziffernwert erzeugt, bitte gegenlesen",
    rationale: () =>
      "Aus dem gewählten Ziffernbetrag ausgeschrieben. Ändert sich der Ziffernbetrag, wird dieser Wert neu erzeugt.",
  },
  {
    target: "seller.legalForm",
    source: "seller.owner",
    compute: legalFormOf,
    sourceLabel: "abgeleitet aus der Firmierung",
    rationale: (value) =>
      `Die Firmierung endet auf „${value.trim().split(/\s+/).at(-1) ?? value}“. Rechtsform daraus abgeleitet, nicht aus einem Register gelesen.`,
  },
];
