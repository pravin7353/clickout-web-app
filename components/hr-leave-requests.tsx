"use client";

import { useState, useEffect, useTransition } from "react";
import { Card, Button, Badge, Input, Select, ErrorBanner } from "@/components/ui";
import { getPendingLeavesAction, approveLeave, rejectLeave, applyLeave } from "@/actions/hr";
import { LeaveType } from "@/lib/schemas/hr-schema";
import { useRouter } from "next/navigation";
import { SimpleStaff } from "./hr-attendance-table";

interface HrLeaveRequestsProps {
  staffList: SimpleStaff[];
  canEdit: boolean;
  userRole: string;
}

export function HrLeaveRequests({ staffList, canEdit }: HrLeaveRequestsProps) {
  const router = useRouter();
  const todayStr = new Date().toISOString().slice(0, 10);

  const [pendingLeaves, setPendingLeaves] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Apply Leave Modal
  const [showApplyModal, setShowApplyModal] = useState<boolean>(false);
  const [applyStaffId, setApplyStaffId] = useState<string>(staffList[0]?.id || "");
  const [applyFromDate, setApplyFromDate] = useState<string>(todayStr);
  const [applyToDate, setApplyToDate] = useState<string>(todayStr);
  const [applyType, setApplyType] = useState<LeaveType>("CASUAL");
  const [applyReason, setApplyReason] = useState<string>("");

  const [isPending, startTransition] = useTransition();

  const loadLeaves = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await getPendingLeavesAction();
      if (res.ok && res.pendingLeaves) {
        setPendingLeaves(res.pendingLeaves);
      } else {
        setPendingLeaves([]);
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to load leave requests.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLeaves();
  }, []);

  const handleApprove = (staffId: string, leaveId: string) => {
    if (!confirm("Approve this leave request?")) return;
    startTransition(async () => {
      try {
        const res = await approveLeave(staffId, leaveId);
        if (res.ok) {
          await loadLeaves();
          router.refresh();
        } else {
          alert(`Failed to approve leave: ${res.error}`);
        }
      } catch (err: any) {
        alert(`Error: ${err.message || "Failed to approve leave"}`);
      }
    });
  };

  const handleReject = (staffId: string, leaveId: string) => {
    const reason = prompt("Enter rejection reason (optional):");
    if (reason === null) return; // User cancelled prompt

    startTransition(async () => {
      try {
        const res = await rejectLeave(staffId, leaveId, reason || undefined);
        if (res.ok) {
          await loadLeaves();
          router.refresh();
        } else {
          alert(`Failed to reject leave: ${res.error}`);
        }
      } catch (err: any) {
        alert(`Error: ${err.message || "Failed to reject leave"}`);
      }
    });
  };

  const handleApplySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!applyStaffId) return;

    startTransition(async () => {
      try {
        const res = await applyLeave(applyStaffId, applyFromDate, applyToDate, applyType, applyReason);
        if (res.ok) {
          setShowApplyModal(false);
          setApplyReason("");
          await loadLeaves();
          router.refresh();
          alert("Leave application submitted successfully!");
        } else {
          alert(`Failed to apply leave: ${res.error}`);
        }
      } catch (err: any) {
        alert(`Error: ${err.message || "Failed to apply leave"}`);
      }
    });
  };

  const getLeaveTypeColor = (type: string) => {
    switch (type) {
      case "SICK":
        return "#ef4444"; // red
      case "CASUAL":
        return "#3b82f6"; // blue
      case "UNPAID":
        return "#f59e0b"; // amber
      default:
        return "var(--text-secondary)";
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Top Action Header */}
      <Card style={{ padding: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 800, margin: 0, color: "var(--text-primary)" }}>
              Pending Leave Approvals ({pendingLeaves.length})
            </h2>
            <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
              Review staff time-off requests across your organization
            </span>
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <Button variant="secondary" onClick={loadLeaves} disabled={loading || isPending}>
              🔄 Refresh
            </Button>
            {canEdit && (
              <Button
                variant="primary"
                onClick={() => setShowApplyModal(true)}
                style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
              >
                <span>➕</span> Apply Leave
              </Button>
            )}
          </div>
        </div>
      </Card>

      {errorMsg && <ErrorBanner message={errorMsg} />}

      {/* Pending Leaves List */}
      <Card style={{ padding: 0, overflow: "hidden", borderRadius: 16 }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 800 }}>
            <thead>
              <tr
                style={{
                  borderBottom: "1px solid var(--border)",
                  textAlign: "left",
                  background: "color-mix(in srgb, var(--card-bg) 94%, var(--scaffold-bg))",
                }}
              >
                <th style={{ padding: "12px 16px", fontSize: 11, color: "var(--text-secondary)", fontWeight: 700 }}>EMPLOYEE</th>
                <th style={{ padding: "12px 16px", fontSize: 11, color: "var(--text-secondary)", fontWeight: 700 }}>DATES</th>
                <th style={{ padding: "12px 16px", fontSize: 11, color: "var(--text-secondary)", fontWeight: 700 }}>TYPE</th>
                <th style={{ padding: "12px 16px", fontSize: 11, color: "var(--text-secondary)", fontWeight: 700 }}>REASON</th>
                <th style={{ padding: "12px 16px", fontSize: 11, color: "var(--text-secondary)", fontWeight: 700 }}>APPLIED ON</th>
                <th style={{ padding: "12px 16px", fontSize: 11, color: "var(--text-secondary)", fontWeight: 700 }}>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", padding: "36px 16px", color: "var(--text-secondary)" }}>
                    Loading leave requests...
                  </td>
                </tr>
              ) : pendingLeaves.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", padding: "40px 16px", color: "var(--text-secondary)", fontSize: 13 }}>
                    🎉 No pending leave requests to review.
                  </td>
                </tr>
              ) : (
                pendingLeaves.map((l) => (
                  <tr key={l.id} style={{ borderBottom: "1px solid var(--border)", fontSize: 13 }}>
                    <td style={{ padding: "14px 16px" }}>
                      <div style={{ fontWeight: 800, color: "var(--text-primary)" }}>
                        {l.staffName || "Staff Member"}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                        {l.staffEmpId ? `${l.staffEmpId} • ` : ""}{l.branchCode || "HQ"}
                      </div>
                    </td>
                    <td style={{ padding: "14px 16px", fontWeight: 700, color: "var(--text-primary)" }}>
                      {l.fromDate} {l.fromDate !== l.toDate ? `→ ${l.toDate}` : ""}
                    </td>
                    <td style={{ padding: "14px 16px" }}>
                      <Badge color={getLeaveTypeColor(l.type)}>
                        {l.type}
                      </Badge>
                    </td>
                    <td style={{ padding: "14px 16px", color: "var(--text-primary)", maxWidth: 220 }}>
                      <div style={{ wordBreak: "break-word" }}>{l.reason || "-"}</div>
                    </td>
                    <td style={{ padding: "14px 16px", color: "var(--text-secondary)", fontSize: 12 }}>
                      {l.appliedAtMs ? new Date(l.appliedAtMs).toLocaleDateString() : "-"}
                    </td>
                    <td style={{ padding: "14px 16px" }}>
                      {canEdit ? (
                        <div style={{ display: "flex", gap: 8 }}>
                          <button
                            type="button"
                            disabled={isPending}
                            onClick={() => handleApprove(l.staffId, l.id)}
                            style={{
                              background: "color-mix(in srgb, #22c55e 15%, transparent)",
                              color: "#22c55e",
                              border: "1px solid color-mix(in srgb, #22c55e 30%, transparent)",
                              borderRadius: 8,
                              padding: "5px 12px",
                              fontSize: 12,
                              fontWeight: 700,
                              cursor: "pointer",
                            }}
                          >
                            ✓ Approve
                          </button>
                          <button
                            type="button"
                            disabled={isPending}
                            onClick={() => handleReject(l.staffId, l.id)}
                            style={{
                              background: "color-mix(in srgb, #ef4444 15%, transparent)",
                              color: "#ef4444",
                              border: "1px solid color-mix(in srgb, #ef4444 30%, transparent)",
                              borderRadius: 8,
                              padding: "5px 12px",
                              fontSize: 12,
                              fontWeight: 700,
                              cursor: "pointer",
                            }}
                          >
                            ✕ Reject
                          </button>
                        </div>
                      ) : (
                        <Badge color="var(--text-secondary)">Read Only</Badge>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Apply Leave Modal */}
      {showApplyModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0, 0, 0, 0.7)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 100,
            backdropFilter: "blur(4px)",
          }}
        >
          <Card style={{ width: "100%", maxWidth: 460, padding: 24, borderRadius: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>Apply Staff Leave</h3>
              <button
                type="button"
                onClick={() => setShowApplyModal(false)}
                style={{ background: "transparent", border: "none", color: "var(--text-secondary)", fontSize: 20, cursor: "pointer" }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleApplySubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>
                  Staff Member
                </label>
                <Select
                  value={applyStaffId}
                  onChange={(e) => setApplyStaffId(e.target.value)}
                >
                  {staffList.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.empId} - {s.name} ({s.role.toUpperCase()})
                    </option>
                  ))}
                </Select>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>
                    From Date
                  </label>
                  <Input
                    type="date"
                    required
                    value={applyFromDate}
                    onChange={(e) => setApplyFromDate(e.target.value)}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>
                    To Date
                  </label>
                  <Input
                    type="date"
                    required
                    value={applyToDate}
                    onChange={(e) => setApplyToDate(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>
                  Leave Type
                </label>
                <Select
                  value={applyType}
                  onChange={(e) => setApplyType(e.target.value as LeaveType)}
                >
                  <option value="CASUAL">Casual Leave (Paid)</option>
                  <option value="SICK">Sick Leave</option>
                  <option value="UNPAID">Unpaid Leave</option>
                </Select>
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>
                  Reason (min 3 characters)
                </label>
                <Input
                  type="text"
                  required
                  placeholder="e.g. Medical checkup, family emergency"
                  value={applyReason}
                  onChange={(e) => setApplyReason(e.target.value)}
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 10 }}>
                <Button variant="ghost" onClick={() => setShowApplyModal(false)}>
                  Cancel
                </Button>
                <Button variant="primary" type="submit" disabled={isPending}>
                  {isPending ? "Submitting..." : "Submit Leave"}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}
