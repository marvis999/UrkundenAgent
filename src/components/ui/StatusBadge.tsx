import type { StatusMeta } from "@/domain/status";
import { Badge } from "./Badge";

/** Badge for any status enum that carries label, tone and icon. */
export function StatusBadge({ meta }: { meta: StatusMeta }) {
  return (
    <Badge tone={meta.tone} icon={meta.icon}>
      {meta.label}
    </Badge>
  );
}
