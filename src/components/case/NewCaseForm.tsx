"use client";

import { useActionState } from "react";
import { createCaseAction } from "@/app/actions";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FormField";
import { Notice } from "@/components/ui/Notice";
import { Stack } from "@/components/ui/layout";

const TEXT_ROWS = 14;

/** The note is filed under this name, so the first run has something to cite. */
const NOTE_NAME = "Notiz oder E-Mail";

/**
 * Opening a case: a name, and whatever was written about it so far.
 *
 * The text is not a description of the case, it is the first document in it. Pasting the
 * broker's e-mail here files it exactly as a scan would be filed, which is what lets the
 * Kaufpreis in its last paragraph become a value with a Fundstelle rather than something
 * a clerk retyped.
 */
export function NewCaseForm() {
  const [problem, create, pending] = useActionState(createCaseAction, undefined);

  return (
    <form action={create}>
      <input type="hidden" name="noteName" value={NOTE_NAME} />
      <Stack gap="regular">
        <FormField label="Vorgangsname" hint="Objekt und Beteiligte folgen aus den Unterlagen">
          <input name="name" placeholder="Mehrfamilienhaus Nordstadt" required />
        </FormField>
        <FormField label="Notiz oder E-Mail" hint="vollständig einfügen, inklusive Nachträgen">
          <textarea name="text" rows={TEXT_ROWS} placeholder="E-Mail des Maklers, Telefonnotiz, Nachtrag …" />
        </FormField>
        {problem !== undefined && <Notice tone="missing" icon="triangle-alert" text={problem} size="compact" surface="tint" />}
        <div>
          <Button variant="accent" iconEnd="arrow-right" submit disabled={pending}>
            {pending ? "wird angelegt …" : "Vorgang anlegen"}
          </Button>
        </div>
      </Stack>
    </form>
  );
}
