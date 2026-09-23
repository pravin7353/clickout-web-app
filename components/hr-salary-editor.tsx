"use client";

import { useState, useEffect, useTransition } from "react";
import { Card, Button, Input, Select, ErrorBanner } from "@/components/ui";
import { setSalaryStructure, getStaffSalaryHistoryAction } from "@/actions/hr";
import { SalaryStructureDocument } from "@/lib/schemas/hr-schema";
import { useRouter } from "next/navigation";
import { SimpleStaff } from "./hr-attendance-table";

interface HrSalaryEditorProps {
  staffList: SimpleStaff[];
  userRole: string;
}

export function HrSalaryEditor({ staffList, userRole }: HrSalaryEditorProps) {
  const router = useRouter();

  // 🛡️ STRICT CLIENT-SIDE CHECK: Only tenant_admin and super_admin can view or edit salary structures
  const isAuthorized = userRole === "tenant_admin" || userRole === "super_admin";
  if (!isAuthorized) {
    return null; // A manager never sees this component or button
  }

  const todayStr = new Date().toISOString().slice(0, 10);
  const [selectedStaffId, setSelectedStaffId] = useState<string>(staffList[0]?.id || "");
  const [history, setHistory] = useState<SalaryStructureDocument[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Form state
  const [baseSalary, setBaseSalary] = useState<string>("");
  const [effectiveDate, setEffectiveDate] = useState<string>(todayStr);
  const [showEditModal, setShowEditModal] = useState<boolean>(false);
  const [isPending, startTransition] = useTransition();

  const activeStaff = staffList.find((s) => s.id === selectedStaffId) || staffList[0];

  const loadHistory = async (staffId: string) => {
    if (!staffId) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await getStaffSalaryHistoryAction(staffId);
      if (res.ok && res.history) {
        setHistory(res.history);
        if (res.history.length > 0) {
          setBaseSalary(String(res.history[0].baseSalary));
        } else {
          setBaseSalary("");
        }
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to load salary history.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedStaffId) {
      loadHistory(selectedStaffId);
    }
  }, [selectedStaffId]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStaffId) return;
    const salaryNum = parseFloat(baseSalary);
    if (isNaN(salaryNum) || salaryNum < 0) {
      alert("Please enter a valid base salary amount.");
      return;
    }

    startTransition(async () => {
      try {
        const res = await setSalaryStructure(selectedStaffId, salaryNum, effectiveDate);
        if (res.ok) {
          setShowEditModal(false);
          await loadHistory(selectedStaffId);
          router.refresh();
          alert("Salary structure updated successfully!");
        } else {
          alert(`Failed to update salary structure: ${res.error}`);
        }
      } catch (err: any) {
        alert(`Error: ${err.message || "Unauthorized"}`);
      }
    });
  };

  const currentStructure = history[0];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <Card style={{ padding: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>
                SELECT EMPLOYEE COMPENSATION
              </label>
              <Select
                value={selectedStaffId}
                onChange={(e) => setSelectedStaffId(e.target.value)}
                style={{ minWidth: 260 }}
              >
                {staffList.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.empId} - {s.name} ({s.role.toUpperCase()}) [{s.branchCode}]
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <Button
            variant="primary"
            onClick={() => {
              setEffectiveDate(todayStr);
              setShowEditModal(true);
            }}
            style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
          >
            <span>💰</span> Edit Salary Structure
          </Button>
        </div>
      </Card>

      {errorMsg && <ErrorBanner message={errorMsg} />}

      {/* Current Active Structure Card */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
        <Card style={{ padding: 18 }}>
          <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 4 }}>Current Base Salary</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: "var(--text-primary)" }}>
            {currentStructure ? `₹${currentStructure.baseSalary.toLocaleString("en-IN")}` : "Not Set"}
          </div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>
            {currentStructure ? `Monthly Base Compensation` : "No compensation recorded"}
          </div>
        </Card>

        <Card style={{ padding: 18 }}>
          <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 4 }}>Effective Since</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: "var(--text-primary)" }}>
            {currentStructure?.effectiveFromMs
              ? new Date(currentStructure.effectiveFromMs).toLocaleDateString()
              : "-"}
          </div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>
            {currentStructure ? `Updated by: ${currentStructure.createdBy}` : "-"}
          </div>
        </Card>
      </div>

      {/* Compensation Audit History Table */}
      <Card style={{ padding: 0, overflow: "hidden", borderRadius: 16 }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)" }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: "var(--text-primary)" }}>
            {activeStaff?.name} - Compensation History Trail
          </h3>
          <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
            Immutable append-only compensation ledger
          </span>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 600 }}>
            <thead>
              <tr
                style={{
                  borderBottom: "1px solid var(--border)",
                  textAlign: "left",
                  background: "color-mix(in srgb, var(--card-bg) 94%, var(--scaffold-bg))",
                }}
              >
                <th style={{ padding: "12px 16px", fontSize: 11, color: "var(--text-secondary)", fontWeight: 700 }}>BASE SALARY</th>
                <th style={{ padding: "12px 16px", fontSize: 11, color: "var(--text-secondary)", fontWeight: 700 }}>EFFECTIVE DATE</th>
                <th style={{ padding: "12px 16px", fontSize: 11, color: "var(--text-secondary)", fontWeight: 700 }}>BRANCH</th>
                <th style={{ padding: "12px 16px", fontSize: 11, color: "var(--text-secondary)", fontWeight: 700 }}>CREATED BY</th>
                <th style={{ padding: "12px 16px", fontSize: 11, color: "var(--text-secondary)", fontWeight: 700 }}>LOGGED AT</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: "center", padding: "32px 16px", color: "var(--text-secondary)" }}>
                    Loading salary history...
                  </td>
                </tr>
              ) : history.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: "center", padding: "36px 16px", color: "var(--text-secondary)", fontSize: 13 }}>
                    No salary records defined yet for this staff member.
                  </td>
                </tr>
              ) : (
                history.map((s, idx) => (
                  <tr key={s.id || idx} style={{ borderBottom: "1px solid var(--border)", fontSize: 13 }}>
                    <td style={{ padding: "14px 16px", fontWeight: 800, color: "var(--text-primary)" }}>
                      ₹{s.baseSalary.toLocaleString("en-IN")}
                    </td>
                    <td style={{ padding: "14px 16px", fontWeight: 700, color: "var(--text-primary)" }}>
                      {new Date(s.effectiveFromMs).toLocaleDateString()}
                    </td>
                    <td style={{ padding: "14px 16px", color: "var(--text-secondary)" }}>
                      {s.branchCode || "HQ"}
                    </td>
                    <td style={{ padding: "14px 16px", color: "var(--text-secondary)", fontSize: 12 }}>
                      {s.createdBy}
                    </td>
                    <td style={{ padding: "14px 16px", color: "var(--text-secondary)", fontSize: 12 }}>
                      {s.createdAtMs ? new Date(s.createdAtMs).toLocaleString() : "-"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Edit Salary Modal */}
      {showEditModal && (
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
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>Update Salary Structure</h3>
              <button
                type="button"
                onClick={() => setShowEditModal(false)}
                style={{ background: "transparent", border: "none", color: "var(--text-secondary)", fontSize: 20, cursor: "pointer" }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>
                  Staff Member
                </label>
                <div style={{ fontSize: 14, fontWeight: 800, color: "var(--text-primary)" }}>
                  {activeStaff?.name} ({activeStaff?.empId})
                </div>
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>
                  New Monthly Base Salary (₹)
                </label>
                <Input
                  type="number"
                  required
                  min={0}
                  step="100"
                  placeholder="e.g. 45000"
                  value={baseSalary}
                  onChange={(e) => setBaseSalary(e.target.value)}
                />
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>
                  Effective Date
                </label>
                <Input
                  type="date"
                  required
                  value={effectiveDate}
                  onChange={(e) => setEffectiveDate(e.target.value)}
                />
              </div>

              <div style={{ padding: "10px 14px", borderRadius: 10, background: "rgba(245, 158, 11, 0.1)", border: "1px solid rgba(245, 158, 11, 0.3)", color: "#f59e0b", fontSize: 12 }}>
                ⚠️ <strong>Audit Notice:</strong> Salary changes are permanently logged to the audit trail with WARNING severity.
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 10 }}>
                <Button variant="ghost" onClick={() => setShowEditModal(false)}>
                  Cancel
                </Button>
                <Button variant="primary" type="submit" disabled={isPending}>
                  {isPending ? "Saving..." : "Commit Salary Change"}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}
