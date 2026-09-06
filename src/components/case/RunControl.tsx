"use client";

import { useActionState } from "react";
import { startRunAction } from "@/app/actions";
import { Button } from "@/components/ui/Button";
import { Text } from "@/components/ui/Text";
import styles from "./RunControl.module.css";

interface StartRunProps {
  caseId: string;
  label: string;
}

/**
 * Starts the next run.
 *
 * The click returns as soon as the case is in the analysis phase; everything after that
 * is the progress strip, which reads the database like every other number on the page.
 * The one thing the pages cannot work out for themselves is why a run did not start --
 * no unread documents, or none that could be rendered -- so that sentence comes back with
 * the action and is shown next to the button.
 */
export function StartRun({ caseId, label }: StartRunProps) {
  const [refusal, start, pending] = useActionState(startRunAction, undefined);

  return (
    <form action={start} className={styles.control}>
      <input type="hidden" name="case" value={caseId} />
      {/* Always the primary action wherever it appears: there is nothing else to do. */}
      <Button variant="accent" icon="refresh-cw" submit disabled={pending}>
        {pending ? "wird gestartet …" : label}
      </Button>
      {refusal !== undefined && <Text variant="muted">{refusal}</Text>}
    </form>
  );
}
