/** Visual tone. Every colored element in the UI resolves to one of these. */
export const TONES = ["confirmed", "proposed", "attention", "missing", "neutral", "accent"] as const;
export type Tone = (typeof TONES)[number];
