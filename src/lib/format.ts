/** German count with singular/plural noun, e.g. plural(3, "Seite", "Seiten") = "3 Seiten". */
export const plural = (n: number, singular: string, pluralForm: string) => `${n} ${n === 1 ? singular : pluralForm}`;

export const formatPositions = (n: number) => plural(n, "Position", "Positionen");

export const formatPages = (n: number) => plural(n, "Seite", "Seiten");

export const formatFiles = (n: number) => plural(n, "Datei", "Dateien");

export const formatRun = (n: number) => `Durchlauf ${n}`;
