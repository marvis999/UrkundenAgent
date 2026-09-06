"use client";

import { useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { ACCEPTED_EXTENSIONS } from "@/lib/documents";
import styles from "./DropZone.module.css";

interface DropZoneProps {
  text: string;
  busy?: boolean;
  /**
   * Given, the hidden input keeps the files and submits them with the surrounding form.
   * Without it the files are handed out once and the input is cleared, so the same file
   * can be picked again after a failure.
   */
  name?: string;
  /** Buttons beside the picker. */
  actions?: ReactNode;
  children?: ReactNode;
  onFiles: (files: File[]) => void;
}

/** The dashed drop target with its "Datei auswählen" button. What becomes of the files is the caller's. */
export function DropZone({ text, busy = false, name, actions, children, onFiles }: DropZoneProps) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const take = (files: FileList | null) => {
    const list = [...(files ?? [])];
    if (list.length > 0) onFiles(list);
  };

  return (
    <div
      className={[styles.zone, dragging ? styles.dragging : ""].join(" ")}
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        // Dropped files go into the input as well, so a form submits them like picked ones.
        if (name && input.current) input.current.files = event.dataTransfer.files;
        take(event.dataTransfer.files);
      }}
    >
      <Notice
        tone="neutral"
        icon="upload"
        text={text}
        surface="plain"
        actions={
          <>
            {actions}
            <Button variant="secondary" icon="upload" onClick={() => input.current?.click()} disabled={busy}>
              Datei auswählen
            </Button>
          </>
        }
      >
        {children}
      </Notice>
      <input
        ref={input}
        className={styles.input}
        type="file"
        multiple
        name={name}
        accept={ACCEPTED_EXTENSIONS}
        onChange={(event) => {
          take(event.target.files);
          if (!name) event.target.value = "";
        }}
      />
    </div>
  );
}
