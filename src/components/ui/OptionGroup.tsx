import styles from "./OptionGroup.module.css";

export interface Option {
  id: string;
  label: string;
  /** Secondary text, e.g. a probability. */
  detail?: string;
  selected?: boolean;
}

interface OptionGroupProps {
  options: readonly Option[];
  label: string;
}

/** A row of mutually exclusive choices: encumbrance procedure, OCR readings. */
export function OptionGroup({ options, label }: OptionGroupProps) {
  return (
    <div className={styles.group} role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          role="radio"
          aria-checked={option.selected ?? false}
          className={[styles.option, option.selected ? styles.selected : ""].join(" ")}
        >
          <span>{option.label}</span>
          {option.detail && <span className={styles.detail}>{option.detail}</span>}
        </button>
      ))}
    </div>
  );
}
