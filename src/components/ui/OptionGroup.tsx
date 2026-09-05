import { ActionForm } from "./ActionForm";
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
  /**
   * What choosing an option does. The chosen option's id is posted as `option`, alongside
   * `values`. Without an action the group is display only.
   */
  action?: (form: FormData) => Promise<void>;
  values?: Readonly<Record<string, string>>;
}

/** A row of mutually exclusive choices: encumbrance procedure, OCR readings. */
export function OptionGroup({ options, label, action, values = {} }: OptionGroupProps) {
  return (
    <div className={styles.group} role="radiogroup" aria-label={label}>
      {options.map((option) => {
        const button = (
          <button
            key={option.id}
            type={action ? "submit" : "button"}
            role="radio"
            aria-checked={option.selected ?? false}
            className={[styles.option, option.selected ? styles.selected : ""].join(" ")}
          >
            <span>{option.label}</span>
            {option.detail && <span className={styles.detail}>{option.detail}</span>}
          </button>
        );
        return action ? (
          <ActionForm key={option.id} action={action} values={{ ...values, option: option.id }}>
            {button}
          </ActionForm>
        ) : (
          button
        );
      })}
    </div>
  );
}
