"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { addNoteAction } from "@/app/actions";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FormField";
import { Notice } from "@/components/ui/Notice";
import { Overlay } from "@/components/ui/Overlay";
import { Stack } from "@/components/ui/layout";
import { Text } from "@/components/ui/Text";
import styles from "./AddNote.module.css";

interface AddNoteProps {
  caseId: string;
}

const TEXT_ROWS = 14;
const FORM_ID = "add-note";

/**
 * Files text that arrived without a file: an e-mail, a telephone note, a correction.
 *
 * A name and a body, because a Fundstelle has to be able to say where a value came from,
 * and "die Notiz" is not an answer when there are four of them. What it becomes is a
 * document like any other -- it appears in the list, the next run reads it, and the values
 * it yields carry a quote from it.
 */
export function AddNote({ caseId }: AddNoteProps) {
  const [open, setOpen] = useState(false);
  const [problem, add, pending] = useActionState(addNoteAction, undefined);
  const nameInput = useRef<HTMLInputElement>(null);
  const wasPending = useRef(false);

  // preventScroll: focusing inside a fixed overlay would otherwise jump the page to the top.
  useEffect(() => {
    if (open) nameInput.current?.focus({ preventScroll: true });
  }, [open]);

  // Closes once the action has come back without a complaint; a rejected note stays open
  // with its text, because retyping it is the one thing the dialog must never cost.
  useEffect(() => {
    if (wasPending.current && !pending && problem === undefined) setOpen(false);
    wasPending.current = pending;
  }, [pending, problem]);

  return (
    <>
      <Button variant="secondary" icon="sticky-note" onClick={() => setOpen(true)}>
        Notiz oder E-Mail
      </Button>
      {open && (
        <Overlay
          placement="center"
          onClose={() => setOpen(false)}
          title={
            <>
              <span>Notiz oder E-Mail ablegen</span>
              <Text variant="muted">wird zu einer Unterlage im Vorgang</Text>
            </>
          }
          footer={
            <>
              <Text variant="muted">Der nächste Durchlauf liest sie mit.</Text>
              <span className={styles.actions}>
                <Button variant="ghost" onClick={() => setOpen(false)}>
                  Abbrechen
                </Button>
                <Button variant="accent" form={FORM_ID} disabled={pending}>
                  {pending ? "wird abgelegt …" : "Ablegen"}
                </Button>
              </span>
            </>
          }
        >
          <div className={styles.body}>
            <form id={FORM_ID} action={add}>
              <input type="hidden" name="case" value={caseId} />
              <Stack gap="regular">
                <FormField label="Name" hint="steht später an jeder Fundstelle aus diesem Text">
                  <input ref={nameInput} name="name" placeholder="Makler-E-Mail vom 02.09." required />
                </FormField>
                <FormField label="Text">
                  <textarea name="text" rows={TEXT_ROWS} placeholder="Vollständig einfügen, inklusive Nachträgen." required />
                </FormField>
                {problem !== undefined && <Notice tone="missing" icon="triangle-alert" text={problem} size="compact" surface="tint" />}
              </Stack>
            </form>
          </div>
        </Overlay>
      )}
    </>
  );
}
