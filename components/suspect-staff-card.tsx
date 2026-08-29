"use client";

import { useTransition } from "react";
import { toggleStaffSuspension } from "@/actions/fraud";
import { SuspectStaff } from "@/lib/services/fraud-service";

export function SuspectStaffCard({ staff }: { staff: SuspectStaff }) {
  const [isPending, startTransition] = useTransition();
  const isSuspended = staff.status === "SUSPENDED";

  return (
    <div style={{
      padding: 16, borderRadius: 12,
      border: `1px solid ${isSuspended ? "#555" : "rgba(239,68,68,0.5)"}`,
      opacity: isSuspended ? 0.6 : 1,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <span style={{ fontWeight: 700, textDecoration: isSuspended ? "line-through" : "none" }}>{staff.displayTitle}</span>
        <span style={{ padding: 6, borderRadius: "50%", background: "rgba(239,68,68,0.1)", color: "#ef4444", fontWeight: 900, fontSize: 12 }}>
          {staff.trustScore}
        </span>
      </div>
      {isSuspended && <div style={{ color: "#ef4444", fontSize: 11, fontWeight: 700, marginTop: 4 }}>Status: SUSPENDED</div>}
      <button
        disabled={isPending}
        onClick={() => startTransition(() => { toggleStaffSuspension(staff.id, staff.status, staff.displayTitle); })}
        style={{
          marginTop: 12, width: "100%", padding: 8, borderRadius: 8,
          border: `1px solid ${isSuspended ? "#22c55e" : "#ef4444"}`,
          background: "transparent", color: isSuspended ? "#22c55e" : "#ef4444",
        }}
      >
        {isPending ? "..." : isSuspended ? "Restore Access" : "Suspend Access"}
      </button>
    </div>
  );
}