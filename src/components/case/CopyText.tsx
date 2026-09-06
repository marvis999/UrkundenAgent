"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";

interface CopyTextProps {
  /** Id of the field whose current content is copied. */
  targetId: string;
  label: string;
}

const CONFIRMATION_MS = 1600;

/**
 * Copies what is in the field right now, not what was generated for it.
 *
 * The letter is editable, and the reason to copy it is to paste it into a mail client, so
 * copying the generated text instead of the edited text would quietly undo the edit.
 */
export function CopyText({ targetId, label }: CopyTextProps) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    const field = document.getElementById(targetId);
    if (!(field instanceof HTMLTextAreaElement || field instanceof HTMLInputElement)) return;
    try {
      await navigator.clipboard.writeText(field.value);
      setCopied(true);
      setTimeout(() => setCopied(false), CONFIRMATION_MS);
    } catch {
      // A browser that refuses the clipboard leaves the text selected instead.
      field.select();
    }
  };

  return (
    <Button variant="secondary" icon={copied ? "check" : "copy"} onClick={() => void copy()}>
      {copied ? "Kopiert" : label}
    </Button>
  );
}
