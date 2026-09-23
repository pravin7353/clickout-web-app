"use client";

import { useState, useEffect, useTransition } from "react";
import { Card, Button, Badge, Input, Select, ErrorBanner } from "@/components/ui";
import { getIncentiveRulesAction, setIncentiveRule, deleteIncentiveRuleAction } from "@/actions/incentive";
import { IncentiveRuleDocument, IncentiveMetric, IncentiveRole } from "@/lib/schemas/incentive-schema";
import { useRouter } from "next/navigation";

interface HrIncentiveRulesEditorProps {
  tenantId?: string | null;
  userRole: string;
}

export function HrIncentiveRulesEditor({ tenantId, userRole }: HrIncentiveRulesEditorProps) {
  const router = useRouter();

  // 🛡️ STRICT ROLE GATING: Only tenant_admin and super_admin
  const isAuthorized = userRole === "tenant_admin" || userRole === "super_admin";
  if (!isAuthorized) {
    return null;
  }

  const [rules, setRules] = useState<IncentiveRuleDocument[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Form modal
  const [showModal, setShowModal] = useState<boolean>(false);
  const [role, setRole] = useState<IncentiveRole>("cashier");
  const [metric, setMetric] = useState<IncentiveMetric>("ORDER_COUNT");
  const [threshold, setThreshold] = useState<string>("100");
  const [rewardAmount, setRewardAmount] = useState<string>("5");
  const [rewardType, setRewardType] = useState<"FLAT" | "PER_UNIT" | "PERCENTAGE">("PER_UNIT");
  const [description, setDescription] = useState<string>("");

  const [isPending, startTransition] = useTransition();

  const loadRules = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await getIncentiveRulesAction();
      if (res.ok && res.rules) {
        setRules(res.rules);
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to load incentive rules.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRules();
  }, []);

  const handleRoleChange = (newRole: IncentiveRole) => {
    setRole(newRole);
    if (newRole === "cashier") {
      setMetric("ORDER_COUNT");
      setThreshold("100");
      setRewardAmount("5");
      setRewardType("PER_UNIT");
    } else {
      setMetric("FRAUD_CATCH_COUNT");
      setThreshold("1");
      setRewardAmount("500");
      setRewardType("PER_UNIT");
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const threshNum = parseFloat(threshold);
    const rewardNum = parseFloat(rewardAmount);

    if (isNaN(threshNum) || isNaN(rewardNum)) {
      alert("Please enter valid numeric values for threshold and reward amount.");
      return;
    }

    startTransition(async () => {
      try {
        const res = await setIncentiveRule({
          tenantId: tenantId || "DEFAULT",
          role,
          metric,
          threshold: threshNum,
          rewardAmount: rewardNum,
          rewardType,
          description: description.trim() || undefined,
        });

        if (res.ok) {
          setShowModal(false);
          setDescription("");
          await loadRules();
          router.refresh();
          alert("Incentive rule saved successfully!");
        } else {
          alert(`Error saving rule: ${res.error}`);
        }
      } catch (err: any) {
        alert(`Error: ${err.message || "Unauthorized"}`);
      }
    });
  };

  const handleDelete = (ruleId: string) => {
    if (!confirm("Are you sure you want to delete this incentive rule?")) return;
    startTransition(async () => {
      try {
        const res = await deleteIncentiveRuleAction(ruleId, tenantId || "DEFAULT");
        if (res.ok) {
          await loadRules();
          router.refresh();
        } else {
          alert(`Error: ${(res as any).error || "Failed to delete rule"}`);
        }
      } catch (err: any) {
        alert(`Error: ${err.message || "Failed to delete rule"}`);
      }
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <Card style={{ padding: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: "var(--text-primary)" }}>
              Custom Incentive Configuration
            </h3>
            <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
              Define automated reward formulas for cashiers and guards across your organization
            </span>
          </div>

          <Button
            variant="primary"
            onClick={() => setShowModal(true)}
            style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
          >
            <span>➕</span> Add Incentive Rule
          </Button>
        </div>
      </Card>

      {errorMsg && <ErrorBanner message={errorMsg} />}

      {/* Rules Table */}
      <Card style={{ padding: 0, overflow: "hidden", borderRadius: 16 }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 750 }}>
            <thead>
              <tr
                style={{
                  borderBottom: "1px solid var(--border)",
                  textAlign: "left",
                  background: "color-mix(in srgb, var(--card-bg) 94%, var(--scaffold-bg))",
                }}
              >
                <th style={{ padding: "12px 16px", fontSize: 11, color: "var(--text-secondary)", fontWeight: 700 }}>ROLE</th>
                <th style={{ padding: "12px 16px", fontSize: 11, color: "var(--text-secondary)", fontWeight: 700 }}>PERFORMANCE METRIC</th>
                <th style={{ padding: "12px 16px", fontSize: 11, color: "var(--text-secondary)", fontWeight: 700 }}>THRESHOLD</th>
                <th style={{ padding: "12px 16px", fontSize: 11, color: "var(--text-secondary)", fontWeight: 700 }}>REWARD FORMULA</th>
                <th style={{ padding: "12px 16px", fontSize: 11, color: "var(--text-secondary)", fontWeight: 700 }}>DESCRIPTION</th>
                <th style={{ padding: "12px 16px", fontSize: 11, color: "var(--text-secondary)", fontWeight: 700 }}>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", padding: "32px 16px", color: "var(--text-secondary)" }}>
                    Loading incentive rules...
                  </td>
                </tr>
              ) : rules.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", padding: "36px 16px", color: "var(--text-secondary)", fontSize: 13 }}>
                    No custom incentive rules configured. System is currently using default baseline tiers.
                  </td>
                </tr>
              ) : (
                rules.map((r) => (
                  <tr key={r.id} style={{ borderBottom: "1px solid var(--border)", fontSize: 13 }}>
                    <td style={{ padding: "14px 16px" }}>
                      <Badge color={r.role === "cashier" ? "#3b82f6" : "#f59e0b"}>
                        {r.role.toUpperCase()}
                      </Badge>
                    </td>
                    <td style={{ padding: "14px 16px", fontWeight: 700, color: "var(--text-primary)" }}>
                      {r.metric}
                    </td>
                    <td style={{ padding: "14px 16px", color: "var(--text-primary)" }}>
                      {r.metric.includes("VOLUME") || r.metric.includes("VALUE") ? `₹${r.threshold.toLocaleString("en-IN")}` : `${r.threshold} units`}
                    </td>
                    <td style={{ padding: "14px 16px", fontWeight: 800, color: "#22c55e" }}>
                      {r.rewardType === "PERCENTAGE"
                        ? `${r.rewardAmount}%`
                        : r.rewardType === "FLAT"
                        ? `₹${r.rewardAmount} Flat`
                        : `₹${r.rewardAmount} / unit`}
                    </td>
                    <td style={{ padding: "14px 16px", color: "var(--text-secondary)", fontSize: 12 }}>
                      {r.description || "-"}
                    </td>
                    <td style={{ padding: "14px 16px" }}>
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => handleDelete(r.id)}
                        style={{
                          background: "color-mix(in srgb, var(--danger, #ef4444) 15%, transparent)",
                          color: "var(--danger, #ef4444)",
                          border: "1px solid color-mix(in srgb, var(--danger, #ef4444) 30%, transparent)",
                          borderRadius: 8,
                          padding: "4px 10px",
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Add Rule Modal */}
      {showModal && (
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
          <Card style={{ width: "100%", maxWidth: 480, padding: 24, borderRadius: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>Configure Incentive Rule</h3>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                style={{ background: "transparent", border: "none", color: "var(--text-secondary)", fontSize: 20, cursor: "pointer" }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>
                  Target Role
                </label>
                <Select value={role} onChange={(e) => handleRoleChange(e.target.value as IncentiveRole)}>
                  <option value="cashier">Cashier (Point of Sale)</option>
                  <option value="guard">Guard (Exit Gate Security)</option>
                </Select>
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>
                  Performance Metric
                </label>
                {role === "cashier" ? (
                  <Select value={metric} onChange={(e) => setMetric(e.target.value as IncentiveMetric)}>
                    <option value="ORDER_COUNT">ORDER_COUNT (Total Orders Scanned & Processed)</option>
                    <option value="ORDER_VOLUME">ORDER_VOLUME (Total Turnover ₹ Handled)</option>
                  </Select>
                ) : (
                  <Select value={metric} onChange={(e) => setMetric(e.target.value as IncentiveMetric)}>
                    <option value="FRAUD_CATCH_COUNT">FRAUD_CATCH_COUNT (Confirmed Exit Rejections)</option>
                    <option value="FRAUD_VALUE_PREVENTED">FRAUD_VALUE_PREVENTED (Total ₹ Value of Caught Discrepancies)</option>
                  </Select>
                )}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>
                    Threshold
                  </label>
                  <Input
                    type="number"
                    required
                    min={0}
                    value={threshold}
                    onChange={(e) => setThreshold(e.target.value)}
                    placeholder="e.g. 100"
                  />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>
                    Reward Amount
                  </label>
                  <Input
                    type="number"
                    required
                    min={0}
                    step="0.1"
                    value={rewardAmount}
                    onChange={(e) => setRewardAmount(e.target.value)}
                    placeholder="e.g. 5"
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>
                  Reward Calculation Type
                </label>
                <Select value={rewardType} onChange={(e) => setRewardType(e.target.value as any)}>
                  <option value="PER_UNIT">PER_UNIT (₹ per item / order / catch above threshold)</option>
                  <option value="FLAT">FLAT (Fixed bonus upon achieving threshold)</option>
                  <option value="PERCENTAGE">PERCENTAGE (% of total volume / prevented value)</option>
                </Select>
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>
                  Description (Optional)
                </label>
                <Input
                  type="text"
                  placeholder="e.g. ₹5 bonus per checkout beyond 100 orders"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 10 }}>
                <Button variant="ghost" onClick={() => setShowModal(false)}>
                  Cancel
                </Button>
                <Button variant="primary" type="submit" disabled={isPending}>
                  {isPending ? "Saving..." : "Save Rule"}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}
