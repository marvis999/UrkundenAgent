"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FormField";
import { Overlay } from "@/components/ui/Overlay";
import { Stack } from "@/components/ui/layout";
import { Text } from "@/components/ui/Text";
import styles from "./ManualCorrection.module.css";

interface ManualCorrectionProps {
  /** Field and value being corrected, shown in the dialog header. */
  fieldLabel: string;
  partLabel: string;
  currentValue: string;
}

const REASON_ROWS = 3;

/**
 * Manual correction of a value. Opens as a dialog so the page keeps its scroll position,
 * and the reason is mandatory: without it the value cannot be saved.
 */
export function ManualCorrection({ fieldLabel, partLabel, currentValue }: ManualCorrectionProps) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const valueInput = useRef<HTMLInputElement>(null);
  const canSave = reason.trim().length > 0;
  const close = () => setOpen(false);

  // preventScroll: focusing inside a fixed overlay would otherwise jump the page to the top.
  useEffect(() => {
    if (open) valueInput.current?.focus({ preventScroll: true });
  }, [open]);

  return (
    <>
      <Button variant="secondary" icon="pencil" onClick={() => setOpen(true)}>
        Manuell korrigieren
      </Button>
      {open && (
        <Overlay
          placement="center"
          onClose={close}
          title={
            <>
              <span>Manuell korrigieren</span>
              <Text variant="muted">
                {fieldLabel}: {partLabel}
              </Text>
            </>
          }
          footer={
            <>
              <Text variant="muted">Die Begründung geht in den Verlauf.</Text>
              <span className={styles.actions}>
                <Button variant="ghost" onClick={close}>
                  Abbrechen
                </Button>
                <Button variant="accent" disabled={!canSave}>
                  Speichern
                </Button>
              </span>
            </>
          }
        >
          <div className={styles.body}>
            <Stack gap="regular">
              <FormField label="Bisheriger Wert">
                <input defaultValue={currentValue} readOnly />
              </FormField>
              <FormField label="Neuer Wert">
                <input ref={valueInput} defaultValue={currentValue} />
              </FormField>
              <FormField label="Begründung" required hint={canSave ? undefined : "ohne Begründung kein Speichern"}>
                <textarea
                  rows={REASON_ROWS}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="z. B. telefonisch mit dem Makler bestätigt"
                />
              </FormField>
            </Stack>
          </div>
        </Overlay>
      )}
    </>
  );
}
