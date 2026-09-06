"use client";

import { useActionState, useState } from "react";
import { createCaseAction } from "@/app/actions";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FormField";
import { Notice } from "@/components/ui/Notice";
import { Stack } from "@/components/ui/layout";
import { DropZone } from "./DropZone";
import { UploadList, type Upload } from "./UploadZone";

const TEXT_ROWS = 14;
const KILOBYTE = 1024;

/** The note is filed under this name, so the first run has something to cite. */
const NOTE_NAME = "Notiz oder E-Mail";

/** What a picked file will become, said before the case exists. */
const picked = (file: File): Upload => ({
  fileName: file.name,
  stage: "picked",
  note: `${Math.max(1, Math.round(file.size / KILOBYTE))} KB, wird mit dem Vorgang abgelegt`,
});

/**
 * Opening a case: a name, whatever was written about it so far, and the files that came
 * with it.
 *
 * The text is not a description of the case, it is the first document in it. Pasting the
 * broker's e-mail here files it exactly as a scan would be filed, which is what lets the
 * Kaufpreis in its last paragraph become a value with a Fundstelle rather than something
 * a clerk retyped. Files dropped here travel with the form and are filed the moment the
 * case exists, the same way the Unterlagen tab files them.
 */
export function NewCaseForm() {
  const [problem, create, pending] = useActionState(createCaseAction, undefined);
  const [files, setFiles] = useState<readonly File[]>([]);

  return (
    <form action={create}>
      <input type="hidden" name="noteName" value={NOTE_NAME} />
      <Stack gap="regular">
        <FormField label="Vorgangsname" hint="Objekt und Beteiligte folgen aus den Unterlagen">
          <input name="name" placeholder="Bezeichnung des Vorgangs" required />
        </FormField>
        <FormField label="Notiz oder E-Mail" hint="vollständig einfügen, inklusive Nachträgen">
          <textarea name="text" rows={TEXT_ROWS} placeholder="Text, wie er eingegangen ist: E-Mail, Telefonnotiz, Nachtrag …" />
        </FormField>
        <DropZone
          name="files"
          text="Unterlagen hier ablegen. Sie werden mit dem Vorgang gespeichert, gerendert und vom ersten Durchlauf gelesen."
          busy={pending}
          onFiles={setFiles}
        >
          <UploadList uploads={files.map(picked)} />
        </DropZone>
        {problem !== undefined && <Notice tone="missing" icon="triangle-alert" text={problem} size="compact" surface="tint" />}
        <div>
          <Button variant="accent" iconEnd="arrow-right" submit disabled={pending}>
            {pending ? (files.length > 0 ? "wird angelegt, Unterlagen werden gerendert …" : "wird angelegt …") : "Vorgang anlegen"}
          </Button>
        </div>
      </Stack>
    </form>
  );
}
