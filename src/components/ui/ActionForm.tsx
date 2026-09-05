import type { ReactNode } from "react";
import styles from "./ActionForm.module.css";

interface ActionFormProps {
  action: (form: FormData) => Promise<void>;
  /** Hidden values the action needs: which case, which field, which candidate. */
  values: Readonly<Record<string, string>>;
  children: ReactNode;
}

/**
 * Wraps a control in the form that carries it out.
 *
 * A single place for this keeps every action posting the same shape, and keeps the
 * buttons working without JavaScript: the app is server-rendered and a click is a form
 * submission, not a fetch that has to be kept in sync with the page.
 */
export function ActionForm({ action, values, children }: ActionFormProps) {
  return (
    <form action={action} className={styles.form}>
      {Object.entries(values).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      {children}
    </form>
  );
}
