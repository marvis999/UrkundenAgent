import { SectionHeading } from "@/components/ui/SectionHeading";
import { Stack } from "@/components/ui/layout";
import type { CaseView, FieldId } from "@/domain/model";
import { FieldRow } from "./FieldRow";

interface FieldListProps {
  view: CaseView;
  activeFieldId?: FieldId;
  activePartId?: string;
}

/** Fields grouped in contract order. The active field is expanded. */
export function FieldList({ view, activeFieldId, activePartId }: FieldListProps) {
  return (
    <Stack gap="loose">
      {view.groups.map((group) => (
        <Stack key={group.id} gap="rows">
          <SectionHeading>{group.title}</SectionHeading>
          {group.fieldIds
            .flatMap((id) => view.fields.filter((f) => f.id === id))
            .map((field) => {
              const expanded = field.id === activeFieldId;
              return <FieldRow key={field.id} view={view} field={field} expanded={expanded} activePartId={expanded ? activePartId : undefined} />;
            })}
        </Stack>
      ))}
    </Stack>
  );
}
