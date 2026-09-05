import type { ReactNode } from "react";
import styles from "./FormField.module.css";

interface FormFieldProps {
  label: string;
  required?: boolean;
  hint?: ReactNode;
  children: ReactNode;
}

export function FormField({ label, required, hint, children }: FormFieldProps) {
  return (
    <label className={styles.field}>
      <span className={styles.label}>
        {label}
        {required && <span className={styles.required}>Pflichtfeld</span>}
        {hint && <span className={styles.hint}>{hint}</span>}
      </span>
      {children}
    </label>
  );
}
