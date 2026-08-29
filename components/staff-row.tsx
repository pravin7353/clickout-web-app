"use client";

import { useTransition } from "react";
import { toggleStaffStatus, softDeleteStaff } from "@/actions/staff";
import { StaffRow as StaffRowType } from "@/lib/services/staff-service";
import { useRouter } from "next/navigation";

export function StaffRow({ staff }: { staff: StaffRowType }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <tr style={{ borderBottom: "1px solid #222", opacity: staff.isActive ? 1 : 0.5 }}>
      <td style={{ padding: 10 }}>{staff.empId}</td>
      <td style={{ padding: 10 }}>{staff.name}</td>
      <td style={{ padding: 10 }}>{staff.role}</td>
      <td style={{ padding: 10 }}>{staff.branchCode}</td>
      <td style={{ padding: 10 }}>{staff.phone}</td>
      <td style={{ padding: 10, display: "flex", gap: 8 }}>
        <button
          disabled={isPending}
          onClick={() => startTransition(async () => { await toggleStaffStatus(staff.id, staff.isActive); router.refresh(); })}
        >
          {staff.isActive ? "Deactivate" : "Activate"}
        </button>
        <button
          disabled={isPending}
          onClick={() => startTransition(async () => { await softDeleteStaff(staff.id); router.refresh(); })}
          style={{ color: "#ef4444" }}
        >
          Remove
        </button>
      </td>
    </tr>
  );
}