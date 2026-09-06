"use client";

import { useEffect, useRef, useState } from "react";
import { correctValueAction } from "@/app/actions";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FormField";
import { Overlay } from "@/components/ui/Overlay";
import { Stack } from "@/components/ui/layout";
import { Text } from "@/components/ui/Text";
import styles from "./ManualCorrection.module.css";

interface ManualCorrectionProps {
  caseId: string;
  fieldId: string;
  partId: string;
  /** Field and value being corrected, shown in the dialog header. */
  fieldLabel: string;
  partLabel: string;
  currentValue: string;
}

const REASON_ROWS = 3;
const FORM_ID = "manual-correction";

/**
 * Manual correction of a value. Opens as a dialog so the page keeps its scroll position,
 * and the reason is mandatory: without a document behind it, the reason is the source.
 */
export function ManualCorrection({ caseId, fieldId, partId, fieldLabel, partLabel, currentValue }: ManualCorrectionProps) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const valueInput = useRef<HTMLInputElement>(null);
  const canSave = reason.trim().length > 0;
  const close = () => setOpen(false);
  // The dialog is done once the value is written; the page behind it re-renders with it.
  const save = async (form: FormData) => {
    await correctValueAction(form);
    setReason("");
    close();
  };

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
                {/* The form lives in the body; the footer button reaches it by id. */}
                <Button variant="accent" form={FORM_ID} disabled={!canSave}>
                  Speichern
                </Button>
              </span>
            </>
          }
        >
          <div className={styles.body}>
            <form id={FORM_ID} action={save}>
              <input type="hidden" name="case" value={caseId} />
              <input type="hidden" name="field" value={fieldId} />
              <input type="hidden" name="part" value={partId} />
              <Stack gap="regular">
                <FormField label="Bisheriger Wert">
                  <input defaultValue={currentValue} readOnly />
                </FormField>
                <FormField label="Neuer Wert">
                  <input ref={valueInput} name="value" defaultValue={currentValue} required />
                </FormField>
                <FormField label="Begründung" required hint={canSave ? undefined : "ohne Begründung kein Speichern"}>
                  <textarea
                    name="reason"
                    rows={REASON_ROWS}
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    placeholder="z. B. telefonisch mit dem Makler bestätigt"
                    required
                  />
                </FormField>
              </Stack>
            </form>
          </div>
        </Overlay>
      )}
    </>
  );
}
