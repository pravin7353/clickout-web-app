"use client";

import { useState, useTransition } from "react";
import { StaffRow as StaffRowType } from "@/lib/services/staff-service";
import { StaffRow } from "@/components/staff-row";
import { bulkToggleStaffStatus, bulkSoftDeleteStaff } from "@/actions/staff";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui";

type BranchOption = { branchCode: string; storeName: string };

interface StaffTableClientProps {
  paginatedStaff: StaffRowType[];
  canEdit: boolean;
  branches?: BranchOption[];
  isBranchLocked?: boolean;
}

export function StaffTableClient({
  paginatedStaff,
  canEdit,
  branches = [],
  isBranchLocked = false,
}: StaffTableClientProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const currentPageIds = paginatedStaff.map((s) => s.id);
  const isAllSelected =
    paginatedStaff.length > 0 &&
    currentPageIds.every((id) => selectedIds.includes(id));

  function handleToggleAll() {
    if (isAllSelected) {
      // Unselect all items on the current page
      setSelectedIds((prev) => prev.filter((id) => !currentPageIds.includes(id)));
    } else {
      // Select all items on the current page
      const nextSet = new Set(selectedIds);
      currentPageIds.forEach((id) => nextSet.add(id));
      setSelectedIds(Array.from(nextSet));
    }
  }

  function handleToggleRow(staffId: string) {
    setSelectedIds((prev) =>
      prev.includes(staffId)
        ? prev.filter((id) => id !== staffId)
        : [...prev, staffId]
    );
  }

  function handleClear() {
    setSelectedIds([]);
  }

  function handleBulkDeactivate() {
    if (selectedIds.length === 0) return;
    if (confirm(`Deactivate ${selectedIds.length} staff members?`)) {
      startTransition(async () => {
        const res = await bulkToggleStaffStatus(selectedIds, false);
        if (!res.ok && res.errors.length > 0) {
          alert(`Bulk deactivation encountered issues:\n${res.errors.join("\n")}`);
        }
        setSelectedIds([]);
        router.refresh();
      });
    }
  }

  function handleBulkDelete() {
    if (selectedIds.length === 0) return;
    if (confirm(`Remove ${selectedIds.length} staff members?`)) {
      startTransition(async () => {
        const res = await bulkSoftDeleteStaff(selectedIds);
        if (!res.ok && res.errors.length > 0) {
          alert(`Bulk delete encountered issues:\n${res.errors.join("\n")}`);
        }
        setSelectedIds([]);
        router.refresh();
      });
    }
  }

  return (
    <>
      <Card style={{ padding: 0, overflow: "hidden", borderRadius: 16, position: "relative" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 960 }}>
            <thead>
              <tr
                style={{
                  borderBottom: "1px solid var(--border)",
                  textAlign: "left",
                  background: "color-mix(in srgb, var(--card-bg) 94%, var(--scaffold-bg))",
                }}
              >
                {canEdit && (
                  <th
                    style={{
                      padding: "14px 16px",
                      width: 40,
                      textAlign: "center",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isAllSelected}
                      onChange={handleToggleAll}
                      aria-label="Select all staff on this page"
                      style={{
                        cursor: "pointer",
                        width: 16,
                        height: 16,
                        accentColor: "var(--cta-bg-accent, #F9A826)",
                      }}
                    />
                  </th>
                )}
                <th style={{ padding: "14px 16px", fontSize: 11, color: "var(--text-secondary)", fontWeight: 700, letterSpacing: "0.05em" }}>
                  TENANT ID
                </th>
                <th style={{ padding: "14px 16px", fontSize: 11, color: "var(--text-secondary)", fontWeight: 700, letterSpacing: "0.05em" }}>
                  EMP ID
                </th>
                <th style={{ padding: "14px 16px", fontSize: 11, color: "var(--text-secondary)", fontWeight: 700, letterSpacing: "0.05em" }}>
                  NAME
                </th>
                <th style={{ padding: "14px 16px", fontSize: 11, color: "var(--text-secondary)", fontWeight: 700, letterSpacing: "0.05em" }}>
                  DESIGNATION
                </th>
                <th style={{ padding: "14px 16px", fontSize: 11, color: "var(--text-secondary)", fontWeight: 700, letterSpacing: "0.05em" }}>
                  BRANCH
                </th>
                <th style={{ padding: "14px 16px", fontSize: 11, color: "var(--text-secondary)", fontWeight: 700, letterSpacing: "0.05em" }}>
                  CONTACT
                </th>
                <th style={{ padding: "14px 16px", fontSize: 11, color: "var(--text-secondary)", fontWeight: 700, letterSpacing: "0.05em" }}>
                  SECURITY
                </th>
                <th style={{ padding: "14px 16px", fontSize: 11, color: "var(--text-secondary)", fontWeight: 700, letterSpacing: "0.05em" }}>
                  ACTIONS
                </th>
              </tr>
            </thead>
            <tbody>
              {paginatedStaff.map((s) => (
                <StaffRow
                  key={s.id}
                  staff={s}
                  canEdit={canEdit}
                  branches={branches}
                  isBranchLocked={isBranchLocked}
                  isSelected={selectedIds.includes(s.id)}
                  onToggleSelect={() => handleToggleRow(s.id)}
                />
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Floating Bulk Action Bar */}
      {canEdit && selectedIds.length > 0 && (
        <div
          style={{
            position: "fixed",
            bottom: 24,
            left: "50%",
            transform: "translateX(-50%)",
            background: "var(--card-bg)",
            border: "1px solid var(--border)",
            boxShadow: "0 16px 48px rgba(0, 0, 0, 0.45)",
            borderRadius: 16,
            padding: "10px 20px",
            display: "flex",
            alignItems: "center",
            gap: 14,
            zIndex: 90,
            backdropFilter: "blur(16px)",
            color: "var(--text-primary)",
          }}
        >
          <span
            style={{
              fontWeight: 800,
              fontSize: 13,
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <span
              style={{
                background: "var(--cta-bg-accent, #F9A826)",
                color: "#0A0A0A",
                padding: "2px 8px",
                borderRadius: 12,
                fontSize: 12,
                fontWeight: 800,
              }}
            >
              {selectedIds.length}
            </span>
            selected
          </span>

          <span style={{ color: "var(--border)", userSelect: "none" }}>|</span>

          <button
            type="button"
            disabled={isPending}
            onClick={handleBulkDeactivate}
            style={{
              background: "color-mix(in srgb, var(--warning, #f59e0b) 15%, transparent)",
              color: "var(--warning, #f59e0b)",
              border: "1px solid color-mix(in srgb, var(--warning, #f59e0b) 30%, transparent)",
              borderRadius: 10,
              padding: "6px 14px",
              fontSize: 12,
              fontWeight: 700,
              cursor: isPending ? "not-allowed" : "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            ⏸️ Deactivate
          </button>

          <button
            type="button"
            disabled={isPending}
            onClick={handleBulkDelete}
            style={{
              background: "color-mix(in srgb, var(--danger, #ef4444) 15%, transparent)",
              color: "var(--danger, #ef4444)",
              border: "1px solid color-mix(in srgb, var(--danger, #ef4444) 30%, transparent)",
              borderRadius: 10,
              padding: "6px 14px",
              fontSize: 12,
              fontWeight: 700,
              cursor: isPending ? "not-allowed" : "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            🗑️ Delete
          </button>

          <span style={{ color: "var(--border)", userSelect: "none" }}>|</span>

          <button
            type="button"
            disabled={isPending}
            onClick={handleClear}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--text-secondary)",
              fontSize: 12,
              fontWeight: 600,
              cursor: isPending ? "not-allowed" : "pointer",
              padding: "4px 8px",
            }}
          >
            Clear
          </button>
        </div>
      )}
    </>
  );
}
