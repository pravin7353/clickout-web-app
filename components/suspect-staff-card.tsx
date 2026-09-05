"use client";

import { useTransition } from "react";
import { toggleStaffSuspension } from "@/actions/fraud";
import { SuspectStaff } from "@/lib/services/fraud-service";
import { Card, Button, Badge } from "@/components/ui";

export function SuspectStaffCard({
  staff,
  canEdit = false,
}: {
  staff: SuspectStaff;
  canEdit?: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const isSuspended = staff.status === "SUSPENDED";

  return (
    <Card
      style={{
        padding: 16,
        border: `1px solid ${isSuspended ? "var(--border)" : "rgba(239, 68, 68, 0.4)"}`,
        opacity: isSuspended ? 0.65 : 1,
        background: isSuspended ? "var(--scaffold-bg)" : "var(--card-bg)",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
      }}
    >
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
          <span
            style={{
              fontWeight: 700,
              fontSize: 15,
              color: "var(--text-primary)",
              textDecoration: isSuspended ? "line-through" : "none",
            }}
          >
            {staff.displayTitle}
          </span>
          <Badge color="var(--danger)">Trust: {staff.trustScore}</Badge>
        </div>

        {isSuspended ? (
          <div style={{ color: "var(--danger)", fontSize: 12, fontWeight: 700, marginTop: 4 }}>
            Status: SUSPENDED
          </div>
        ) : (
          <div style={{ color: "var(--warning)", fontSize: 12, marginTop: 4 }}>
            Risk Score Low (&lt;80)
          </div>
        )}
      </div>

      {canEdit && (
        <Button
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              await toggleStaffSuspension(staff.id, staff.status, staff.displayTitle);
            })
          }
          variant={isSuspended ? "primary" : "secondary"}
          style={{
            marginTop: 14,
            width: "100%",
            fontSize: 12,
            padding: "6px 0",
            color: isSuspended ? "#fff" : "var(--danger)",
          }}
        >
          {isPending ? "Updating..." : isSuspended ? "Restore Access" : "Suspend Access"}
        </Button>
      )}
    </Card>
  );
}