"use client";

import { useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { TonedIcon } from "@/components/ui/TonedIcon";
import { Text } from "@/components/ui/Text";
import type { Tone } from "@/domain/status";
import type { IconName } from "@/components/ui/icons";
import { ACCEPTED_EXTENSIONS } from "@/lib/documents";
import { plural } from "@/lib/format";
import styles from "./UploadZone.module.css";

interface UploadZoneProps {
  caseId: string;
  /** The button for text that arrives without a file, shown beside the picker. */
  note?: ReactNode;
}

type Stage = "uploading" | "stored" | "failed";

interface Upload {
  fileName: string;
  stage: Stage;
  note: string;
}

const STAGE_META: Record<Stage, { tone: Tone; icon: IconName }> = {
  uploading: { tone: "neutral", icon: "refresh-cw" },
  stored: { tone: "confirmed", icon: "circle-check" },
  failed: { tone: "missing", icon: "triangle-alert" },
};

/** The shape of our own import endpoint's answer; one file in, one entry back. */
interface ImportResponse {
  error?: string;
  imported?: { attachedToExisting?: boolean; pageCount?: number }[];
}

/**
 * The drop zone of the Unterlagen tab.
 *
 * Files go to the same endpoint as the import script, one request each: a scan is
 * rendered page by page while it is stored, so a batch in one request would leave the
 * clerk watching a spinner with nothing to read. One file at a time means every line
 * gets its answer as it lands, and a file the renderer cannot open costs only itself.
 *
 * The upload only files documents. Reading them is the run, and the run is started
 * deliberately -- see the button next to this zone.
 */
export function UploadZone({ caseId, note }: UploadZoneProps) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [uploads, setUploads] = useState<readonly Upload[]>([]);
  const [busy, setBusy] = useState(false);

  const send = async (file: File): Promise<Upload> => {
    try {
      const body = new FormData();
      body.append("file", file);
      const response = await fetch(`/api/cases/${caseId}/documents`, { method: "POST", body });
      const answer = (await response.json()) as ImportResponse;
      const imported = answer.imported?.[0];
      if (!response.ok || imported === undefined) {
        return { fileName: file.name, stage: "failed", note: answer.error ?? `Antwort ${response.status}` };
      }
      const pages = imported.pageCount ?? 0;
      const rendered = pages === 0 ? "kein lesbares Format, keine Seiten" : `${plural(pages, "Seite", "Seiten")} gerendert`;
      return {
        fileName: file.name,
        stage: "stored",
        note: imported.attachedToExisting === true ? `bereits im Vorgang, ${rendered}` : rendered,
      };
    } catch (error) {
      return { fileName: file.name, stage: "failed", note: error instanceof Error ? error.message : "Upload fehlgeschlagen" };
    }
  };

  const upload = async (files: readonly File[]) => {
    if (files.length === 0 || busy) return;
    setBusy(true);
    setUploads(files.map((file) => ({ fileName: file.name, stage: "uploading", note: "wird abgelegt …" })));
    for (const [index, file] of files.entries()) {
      const result = await send(file);
      setUploads((current) => current.map((entry, position) => (position === index ? result : entry)));
    }
    setBusy(false);
    // The list, the counters and the banner all come from the case, so one refresh moves
    // every one of them -- including the phase, which the ingest has just advanced.
    router.refresh();
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
        void upload([...event.dataTransfer.files]);
      }}
    >
      <Notice
        tone="neutral"
        icon="upload"
        text={
          busy
            ? "Unterlagen werden abgelegt und seitenweise gerendert …"
            : "Dateien hier ablegen, oder Text einfügen, der ohne Datei kam. Beides landet im nächsten Durchlauf."
        }
        surface="plain"
        actions={
          <>
            {note}
            <Button variant="secondary" icon="upload" onClick={() => input.current?.click()} disabled={busy}>
              Datei auswählen
            </Button>
          </>
        }
      >
        {uploads.length > 0 && (
          <ul className={styles.list}>
            {uploads.map((entry) => {
              const meta = STAGE_META[entry.stage];
              return (
                <li key={entry.fileName} className={styles.item}>
                  <TonedIcon tone={meta.tone} name={meta.icon} size="sm" />
                  <span className={styles.name}>{entry.fileName}</span>
                  <Text variant="muted">{entry.note}</Text>
                </li>
              );
            })}
          </ul>
        )}
      </Notice>
      <input
        ref={input}
        className={styles.input}
        type="file"
        multiple
        accept={ACCEPTED_EXTENSIONS}
        onChange={(event) => {
          void upload([...(event.target.files ?? [])]);
          // Cleared so re-picking the same file after a failure fires onChange again.
          event.target.value = "";
        }}
      />
    </div>
  );
}
