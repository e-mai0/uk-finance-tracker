import type { OpportunityStatus } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { STATUS_LABEL } from "@/lib/constants";

const TONE: Record<
  OpportunityStatus,
  "success" | "info" | "danger" | "neutral"
> = {
  OPEN: "success",
  OPENING_SOON: "info",
  CLOSED: "danger",
  UNKNOWN: "neutral",
};

export function StatusBadge({ status }: { status: OpportunityStatus }) {
  return (
    <Badge tone={TONE[status]} dot>
      {STATUS_LABEL[status]}
    </Badge>
  );
}
