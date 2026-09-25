"use client";

import { useState, useEffect, useTransition, useMemo } from "react";
import { getIncentiveRulesAction, setIncentiveRule, deleteIncentiveRuleAction } from "@/actions/incentive";
import {
  IncentiveRuleDocument,
  CalculationType,
  PayoutFrequency,
  TierThreshold,
} from "@/lib/schemas/incentive-schema";
import { evaluateCategoryIncentive } from "@/lib/utils/incentive-calc";
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
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Form modal for adding new rule
  const [showModal, setShowModal] = useState<boolean>(false);
  const [newCategory, setNewCategory] = useState<string>("Electronics");
  const [newCalcType, setNewCalcType] = useState<CalculationType>("PERCENT_OF_SALE");
  const [newPercentValue, setNewPercentValue] = useState<string>("3");
  const [newFixedAmount, setNewFixedAmount] = useState<string>("50");
  const [newMinSaleAmount, setNewMinSaleAmount] = useState<string>("100");
  const [newPayoutFreq, setNewPayoutFreq] = useState<PayoutFrequency>("MONTHLY");
  const [newAutoApproveThreshold, setNewAutoApproveThreshold] = useState<string>("500");
  const [newTiers, setNewTiers] = useState<TierThreshold[]>([
    { minSaleAmount: 5000, percent: 2 },
    { minSaleAmount: 20000, percent: 5 },
  ]);
  const [newDescription, setNewDescription] = useState<string>("");

  // Inline editing state: ruleId -> editing object
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<IncentiveRuleDocument>>({});

  // Live Simulator State
  const [simCategory, setSimCategory] = useState<string>("Electronics");
  const [simSaleAmount, setSimSaleAmount] = useState<string>("25000");
  const [simOrderCount, setSimOrderCount] = useState<string>("1");

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

  // Handler for adding a new tier in modal
  const handleAddModalTier = () => {
    setNewTiers([...newTiers, { minSaleAmount: 50000, percent: 8 }]);
  };

  const handleRemoveModalTier = (index: number) => {
    setNewTiers(newTiers.filter((_, i) => i !== index));
  };

  const handleUpdateModalTier = (index: number, field: keyof TierThreshold, val: number) => {
    const copy = [...newTiers];
    copy[index] = { ...copy[index], [field]: val };
    setNewTiers(copy);
  };

  // Submit new rule
  const handleCreateRule = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    const minSale = parseFloat(newMinSaleAmount) || 0;
    const autoApprove = parseFloat(newAutoApproveThreshold) || 500;
    const pct = parseFloat(newPercentValue) || 0;
    const fixed = parseFloat(newFixedAmount) || 0;

    startTransition(async () => {
      try {
        const res = await setIncentiveRule({
          tenantId: tenantId || "DEFAULT",
          role: "cashier",
          category: newCategory.trim() || "ALL",
          calculationType: newCalcType,
          percentValue: newCalcType === "PERCENT_OF_SALE" ? pct : undefined,
          fixedAmount: newCalcType === "FIXED_PER_SALE" ? fixed : undefined,
          tiers: newCalcType === "TIERED" ? newTiers : undefined,
          minSaleAmount: minSale,
          payoutFrequency: newPayoutFreq,
          autoApproveThreshold: autoApprove,
          description: newDescription.trim() || undefined,
        });

        if (res.ok) {
          setShowModal(false);
          setSuccessMsg("Category incentive rule created successfully!");
          setTimeout(() => setSuccessMsg(null), 3500);
          await loadRules();
          router.refresh();
        } else {
          setErrorMsg(res.error || "Failed to save rule.");
        }
      } catch (err: any) {
        setErrorMsg(err.message || "Unexpected error saving rule.");
      }
    });
  };

  // Start inline edit
  const startEdit = (r: IncentiveRuleDocument) => {
    setEditingRuleId(r.id);
    setEditForm({
      category: r.category || "ALL",
      calculationType: r.calculationType || "PERCENT_OF_SALE",
      percentValue: r.percentValue ?? r.rewardAmount ?? 3,
      fixedAmount: r.fixedAmount ?? r.rewardAmount ?? 50,
      minSaleAmount: r.minSaleAmount ?? 0,
      payoutFrequency: r.payoutFrequency || "MONTHLY",
      autoApproveThreshold: r.autoApproveThreshold ?? 500,
      tiers: r.tiers ? [...r.tiers] : [{ minSaleAmount: 10000, percent: 3 }],
      description: r.description || "",
    });
  };

  const cancelEdit = () => {
    setEditingRuleId(null);
    setEditForm({});
  };

  // Save inline edit
  const handleSaveEdit = (ruleId: string) => {
    setErrorMsg(null);
    setSuccessMsg(null);

    startTransition(async () => {
      try {
        const res = await setIncentiveRule({
          id: ruleId,
          tenantId: tenantId || "DEFAULT",
          role: "cashier",
          category: editForm.category?.trim() || "ALL",
          calculationType: editForm.calculationType || "PERCENT_OF_SALE",
          percentValue: editForm.calculationType === "PERCENT_OF_SALE" ? Number(editForm.percentValue) : undefined,
          fixedAmount: editForm.calculationType === "FIXED_PER_SALE" ? Number(editForm.fixedAmount) : undefined,
          tiers: editForm.calculationType === "TIERED" ? editForm.tiers : undefined,
          minSaleAmount: Number(editForm.minSaleAmount || 0),
          payoutFrequency: editForm.payoutFrequency || "MONTHLY",
          autoApproveThreshold: Number(editForm.autoApproveThreshold || 500),
          description: editForm.description?.trim() || undefined,
        });

        if (res.ok) {
          setEditingRuleId(null);
          setSuccessMsg("Incentive rule updated successfully!");
          setTimeout(() => setSuccessMsg(null), 3500);
          await loadRules();
          router.refresh();
        } else {
          setErrorMsg(res.error || "Failed to update rule.");
        }
      } catch (err: any) {
        setErrorMsg(err.message || "Failed to update rule.");
      }
    });
  };

  // Delete rule
  const handleDelete = (ruleId: string) => {
    if (!confirm("Are you sure you want to delete this incentive rule?")) return;
    startTransition(async () => {
      try {
        const res = await deleteIncentiveRuleAction(ruleId, tenantId || "DEFAULT");
        if (res.ok) {
          await loadRules();
          router.refresh();
        } else {
          setErrorMsg((res as any).error || "Failed to delete rule");
        }
      } catch (err: any) {
        setErrorMsg(err.message || "Failed to delete rule");
      }
    });
  };

  // Live calculation preview: finds matching rule for simCategory (or active edit form rule)
  const simulationResult = useMemo(() => {
    const saleAmt = parseFloat(simSaleAmount) || 0;
    const orderCnt = parseInt(simOrderCount, 10) || 1;
    const cat = simCategory.trim().toUpperCase();

    // Find rule in loaded rules or if currently editing
    let matchedRule: any = rules.find((r) => (r.category || "").toUpperCase().trim() === cat);
    if (!matchedRule) {
      matchedRule = rules.find((r) => (r.category || "").toUpperCase().trim() === "ALL" || (r.category || "").toUpperCase().trim() === "DEFAULT");
    }

    // If admin is currently editing this category, use editForm values
    if (editingRuleId && (editForm.category || "").toUpperCase().trim() === cat) {
      matchedRule = editForm;
    }

    const result = evaluateCategoryIncentive(matchedRule, saleAmt, orderCnt);
    const threshold = matchedRule?.autoApproveThreshold ?? 500;
    const autoApproved = result.incentiveAmount <= threshold;

    return {
      ...result,
      matchedRuleName: matchedRule ? (matchedRule.category || "ALL") : "Default Baseline (1%)",
      threshold,
      autoApproved,
    };
  }, [simCategory, simSaleAmount, simOrderCount, rules, editingRuleId, editForm]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Top Header Card */}
      <div
        style={{
          background: "var(--card-bg)",
          border: "1px solid var(--border)",
          borderRadius: 18,
          padding: "20px 24px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 16,
          boxShadow: "0 4px 20px rgba(0,0,0,0.06)",
        }}
      >
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 800, color: "var(--text-primary)", margin: 0 }}>
            Category-Based Incentive Rules & Simulator
          </h2>
          <p style={{ margin: "4px 0 0 0", fontSize: 13, color: "var(--text-secondary)" }}>
            Configure percentage, fixed, or tiered payout rules per product category with automated manager approval thresholds.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowModal(true)}
          style={{
            padding: "10px 18px",
            borderRadius: 12,
            background: "var(--cta-bg)",
            color: "var(--cta-text)",
            fontWeight: 800,
            fontSize: 13,
            border: "none",
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            boxShadow: "0 2px 10px rgba(59, 130, 246, 0.3)",
          }}
        >
          <span>➕</span> Add Category Rule
        </button>
      </div>

      {successMsg && (
        <div
          style={{
            padding: "12px 16px",
            borderRadius: 12,
            background: "rgba(34, 197, 94, 0.12)",
            border: "1px solid rgba(34, 197, 94, 0.3)",
            color: "#22c55e",
            fontSize: 13,
            fontWeight: 700,
          }}
        >
          ✅ {successMsg}
        </div>
      )}

      {errorMsg && (
        <div
          style={{
            padding: "12px 16px",
            borderRadius: 12,
            background: "rgba(239, 68, 68, 0.12)",
            border: "1px solid rgba(239, 68, 68, 0.3)",
            color: "#ef4444",
            fontSize: 13,
            fontWeight: 700,
          }}
        >
          ⚠️ {errorMsg}
        </div>
      )}

      {/* 3. Real-Time Live Preview / Calculation Simulator Panel */}
      <div
        style={{
          background: "linear-gradient(135deg, rgba(59, 130, 246, 0.08), rgba(168, 85, 247, 0.08))",
          border: "1px solid rgba(59, 130, 246, 0.25)",
          borderRadius: 18,
          padding: 22,
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 20 }}>⚡</span>
            <div>
              <div style={{ fontWeight: 800, fontSize: 15, color: "var(--text-primary)" }}>
                Live Incentive Calculation Preview (Real-Time Sandbox)
              </div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                Test rule calculations instantly against sample transactions before applying payouts.
              </div>
            </div>
          </div>
          <span
            style={{
              padding: "4px 10px",
              borderRadius: 20,
              fontSize: 11,
              fontWeight: 800,
              background: "rgba(59, 130, 246, 0.15)",
              color: "#3b82f6",
              border: "1px solid rgba(59, 130, 246, 0.3)",
            }}
          >
            Client-Side Verified • Zero Server Latency
          </span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 800, color: "var(--text-secondary)", display: "block", marginBottom: 6 }}>
              SAMPLE PRODUCT CATEGORY
            </label>
            <input
              type="text"
              value={simCategory}
              onChange={(e) => setSimCategory(e.target.value)}
              placeholder="e.g. Electronics, Clothing"
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid var(--border)",
                background: "var(--card-bg)",
                color: "var(--text-primary)",
                fontSize: 13,
                fontWeight: 700,
              }}
            />
          </div>

          <div>
            <label style={{ fontSize: 11, fontWeight: 800, color: "var(--text-secondary)", display: "block", marginBottom: 6 }}>
              SAMPLE SALE AMOUNT (₹)
            </label>
            <input
              type="number"
              min={0}
              value={simSaleAmount}
              onChange={(e) => setSimSaleAmount(e.target.value)}
              placeholder="e.g. 25000"
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid var(--border)",
                background: "var(--card-bg)",
                color: "var(--text-primary)",
                fontSize: 13,
                fontWeight: 700,
              }}
            />
          </div>

          <div>
            <label style={{ fontSize: 11, fontWeight: 800, color: "var(--text-secondary)", display: "block", marginBottom: 6 }}>
              NUMBER OF ORDERS / SALES
            </label>
            <input
              type="number"
              min={1}
              value={simOrderCount}
              onChange={(e) => setSimOrderCount(e.target.value)}
              placeholder="e.g. 1"
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid var(--border)",
                background: "var(--card-bg)",
                color: "var(--text-primary)",
                fontSize: 13,
                fontWeight: 700,
              }}
            />
          </div>
        </div>

        {/* Simulator Output Result Banner */}
        <div
          style={{
            padding: 16,
            borderRadius: 14,
            background: "rgba(0, 0, 0, 0.2)",
            border: "1px solid var(--border)",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 16,
            alignItems: "center",
          }}
        >
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-secondary)" }}>MATCHED RULE</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: "var(--text-primary)", marginTop: 2 }}>
              Category: {simulationResult.matchedRuleName}
            </div>
            <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
              {simulationResult.ruleDetail}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-secondary)" }}>COMPUTED INCENTIVE</div>
            <div style={{ fontSize: 24, fontWeight: 900, color: simulationResult.isEligible ? "#22c55e" : "#ef4444", marginTop: 2 }}>
              ₹{simulationResult.incentiveAmount.toFixed(2)}
            </div>
            <div style={{ fontSize: 11, color: simulationResult.isEligible ? "#22c55e" : "#ef4444" }}>
              {simulationResult.isEligible ? "● Transaction Eligible" : "○ Below Category Min Sale"}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-secondary)" }}>PROJECTED APPROVAL FLOW</div>
            <div style={{ marginTop: 4 }}>
              {simulationResult.autoApproved ? (
                <span
                  style={{
                    padding: "4px 10px",
                    borderRadius: 8,
                    background: "rgba(34, 197, 94, 0.15)",
                    color: "#22c55e",
                    border: "1px solid rgba(34, 197, 94, 0.3)",
                    fontSize: 12,
                    fontWeight: 800,
                  }}
                >
                  🟢 AUTO_APPROVED (≤ ₹{simulationResult.threshold})
                </span>
              ) : (
                <span
                  style={{
                    padding: "4px 10px",
                    borderRadius: 8,
                    background: "rgba(245, 158, 11, 0.15)",
                    color: "#f59e0b",
                    border: "1px solid rgba(245, 158, 11, 0.3)",
                    fontSize: 12,
                    fontWeight: 800,
                  }}
                >
                  🟡 PENDING_MANAGER_APPROVAL (&gt; ₹{simulationResult.threshold})
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 1. Existing Rules Table with Inline Editing */}
      <div
        style={{
          background: "var(--card-bg)",
          borderRadius: 18,
          border: "1px solid var(--border)",
          overflow: "hidden",
          boxShadow: "0 4px 20px rgba(0,0,0,0.06)",
        }}
      >
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: "var(--text-primary)" }}>
            Configured Category Rules ({rules.length})
          </h3>
          <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
            Click "Edit" on any row to modify formulas inline
          </span>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
            <thead>
              <tr style={{ background: "rgba(255,255,255,0.02)", borderBottom: "1px solid var(--border)", textAlign: "left" }}>
                <th style={{ padding: "12px 16px", fontSize: 11, fontWeight: 800, color: "var(--text-secondary)" }}>CATEGORY</th>
                <th style={{ padding: "12px 16px", fontSize: 11, fontWeight: 800, color: "var(--text-secondary)" }}>CALCULATION TYPE</th>
                <th style={{ padding: "12px 16px", fontSize: 11, fontWeight: 800, color: "var(--text-secondary)" }}>FORMULA / TIERS</th>
                <th style={{ padding: "12px 16px", fontSize: 11, fontWeight: 800, color: "var(--text-secondary)" }}>MIN SALE</th>
                <th style={{ padding: "12px 16px", fontSize: 11, fontWeight: 800, color: "var(--text-secondary)" }}>FREQUENCY</th>
                <th style={{ padding: "12px 16px", fontSize: 11, fontWeight: 800, color: "var(--text-secondary)" }}>APPROVAL THRESHOLD</th>
                <th style={{ padding: "12px 16px", fontSize: 11, fontWeight: 800, color: "var(--text-secondary)", textAlign: "right" }}>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} style={{ padding: 32, textAlign: "center", color: "var(--text-secondary)" }}>
                    Loading incentive configuration...
                  </td>
                </tr>
              ) : rules.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: 36, textAlign: "center", color: "var(--text-secondary)", fontSize: 13 }}>
                    No custom category rules configured. Baseline default (1% volume) is active.
                  </td>
                </tr>
              ) : (
                rules.map((r) => {
                  const isEditing = editingRuleId === r.id;

                  if (isEditing) {
                    return (
                      <tr key={r.id} style={{ background: "rgba(59, 130, 246, 0.05)", borderBottom: "1px solid var(--border)" }}>
                        {/* Edit Category */}
                        <td style={{ padding: "12px 16px" }}>
                          <input
                            type="text"
                            value={editForm.category || ""}
                            onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
                            style={{
                              width: 120,
                              padding: "6px 8px",
                              borderRadius: 6,
                              border: "1px solid var(--border)",
                              background: "var(--bg)",
                              color: "var(--text-primary)",
                              fontSize: 12,
                              fontWeight: 700,
                            }}
                          />
                        </td>

                        {/* Edit Calculation Type */}
                        <td style={{ padding: "12px 16px" }}>
                          <select
                            value={editForm.calculationType || "PERCENT_OF_SALE"}
                            onChange={(e) => setEditForm({ ...editForm, calculationType: e.target.value as any })}
                            style={{
                              padding: "6px 8px",
                              borderRadius: 6,
                              border: "1px solid var(--border)",
                              background: "var(--bg)",
                              color: "var(--text-primary)",
                              fontSize: 12,
                            }}
                          >
                            <option value="PERCENT_OF_SALE">% of Sale</option>
                            <option value="FIXED_PER_SALE">Fixed ₹/Sale</option>
                            <option value="TIERED">Tiered Thresholds</option>
                          </select>
                        </td>

                        {/* Edit Value / Tiers */}
                        <td style={{ padding: "12px 16px" }}>
                          {editForm.calculationType === "PERCENT_OF_SALE" && (
                            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                              <input
                                type="number"
                                step="0.1"
                                min={0}
                                value={editForm.percentValue ?? ""}
                                onChange={(e) => setEditForm({ ...editForm, percentValue: parseFloat(e.target.value) || 0 })}
                                style={{ width: 70, padding: "6px 8px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text-primary)", fontSize: 12 }}
                              />
                              <span style={{ fontSize: 12 }}>%</span>
                            </div>
                          )}

                          {editForm.calculationType === "FIXED_PER_SALE" && (
                            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                              <span style={{ fontSize: 12 }}>₹</span>
                              <input
                                type="number"
                                min={0}
                                value={editForm.fixedAmount ?? ""}
                                onChange={(e) => setEditForm({ ...editForm, fixedAmount: parseFloat(e.target.value) || 0 })}
                                style={{ width: 80, padding: "6px 8px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text-primary)", fontSize: 12 }}
                              />
                            </div>
                          )}

                          {editForm.calculationType === "TIERED" && (
                            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                              {(editForm.tiers || []).map((t, idx) => (
                                <div key={idx} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11 }}>
                                  <span>≥₹</span>
                                  <input
                                    type="number"
                                    value={t.minSaleAmount}
                                    onChange={(e) => {
                                      const copy = [...(editForm.tiers || [])];
                                      copy[idx].minSaleAmount = parseFloat(e.target.value) || 0;
                                      setEditForm({ ...editForm, tiers: copy });
                                    }}
                                    style={{ width: 65, padding: "4px 6px", borderRadius: 4, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text-primary)", fontSize: 11 }}
                                  />
                                  <span>:</span>
                                  <input
                                    type="number"
                                    value={t.percent}
                                    onChange={(e) => {
                                      const copy = [...(editForm.tiers || [])];
                                      copy[idx].percent = parseFloat(e.target.value) || 0;
                                      setEditForm({ ...editForm, tiers: copy });
                                    }}
                                    style={{ width: 45, padding: "4px 6px", borderRadius: 4, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text-primary)", fontSize: 11 }}
                                  />
                                  <span>%</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </td>

                        {/* Edit minSaleAmount */}
                        <td style={{ padding: "12px 16px" }}>
                          <input
                            type="number"
                            min={0}
                            value={editForm.minSaleAmount ?? 0}
                            onChange={(e) => setEditForm({ ...editForm, minSaleAmount: parseFloat(e.target.value) || 0 })}
                            style={{ width: 75, padding: "6px 8px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text-primary)", fontSize: 12 }}
                          />
                        </td>

                        {/* Edit Frequency */}
                        <td style={{ padding: "12px 16px" }}>
                          <select
                            value={editForm.payoutFrequency || "MONTHLY"}
                            onChange={(e) => setEditForm({ ...editForm, payoutFrequency: e.target.value as any })}
                            style={{ padding: "6px 8px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text-primary)", fontSize: 12 }}
                          >
                            <option value="DAILY">Daily</option>
                            <option value="WEEKLY">Weekly</option>
                            <option value="MONTHLY">Monthly</option>
                          </select>
                        </td>

                        {/* Edit Auto Approve Threshold */}
                        <td style={{ padding: "12px 16px" }}>
                          <input
                            type="number"
                            min={0}
                            value={editForm.autoApproveThreshold ?? 500}
                            onChange={(e) => setEditForm({ ...editForm, autoApproveThreshold: parseFloat(e.target.value) || 0 })}
                            style={{ width: 75, padding: "6px 8px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text-primary)", fontSize: 12 }}
                          />
                        </td>

                        {/* Inline Actions */}
                        <td style={{ padding: "12px 16px", textAlign: "right" }}>
                          <div style={{ display: "inline-flex", gap: 6 }}>
                            <button
                              type="button"
                              onClick={() => handleSaveEdit(r.id)}
                              disabled={isPending}
                              style={{
                                padding: "6px 12px",
                                borderRadius: 6,
                                background: "#22c55e",
                                color: "#ffffff",
                                fontWeight: 800,
                                fontSize: 11,
                                border: "none",
                                cursor: "pointer",
                              }}
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              onClick={cancelEdit}
                              style={{
                                padding: "6px 10px",
                                borderRadius: 6,
                                background: "rgba(255,255,255,0.05)",
                                border: "1px solid var(--border)",
                                color: "var(--text-secondary)",
                                fontSize: 11,
                                cursor: "pointer",
                              }}
                            >
                              Cancel
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  }

                  // Read-Only Row
                  const catLabel = r.category || (r.metric ? String(r.metric) : "ALL");
                  const calcType = r.calculationType || (r.rewardType === "FLAT" ? "FIXED_PER_SALE" : "PERCENT_OF_SALE");

                  let formulaStr = "";
                  if (calcType === "PERCENT_OF_SALE") {
                    formulaStr = `${r.percentValue ?? r.rewardAmount ?? 0}% of Sale`;
                  } else if (calcType === "FIXED_PER_SALE") {
                    formulaStr = `₹${r.fixedAmount ?? r.rewardAmount ?? 0} Fixed / Sale`;
                  } else if (calcType === "TIERED") {
                    formulaStr = (r.tiers || []).map((t) => `≥₹${t.minSaleAmount}: ${t.percent}%`).join(" | ");
                  } else {
                    formulaStr = `${r.rewardAmount ?? 0} (${r.rewardType || "PER_UNIT"})`;
                  }

                  return (
                    <tr key={r.id} style={{ borderBottom: "1px solid var(--border)", fontSize: 13 }}>
                      <td style={{ padding: "14px 16px", fontWeight: 800, color: "var(--text-primary)" }}>
                        <span
                          style={{
                            padding: "4px 8px",
                            borderRadius: 6,
                            background: "rgba(59, 130, 246, 0.1)",
                            color: "#3b82f6",
                            border: "1px solid rgba(59, 130, 246, 0.25)",
                            fontSize: 12,
                          }}
                        >
                          {catLabel}
                        </span>
                      </td>
                      <td style={{ padding: "14px 16px", color: "var(--text-primary)" }}>
                        {calcType}
                      </td>
                      <td style={{ padding: "14px 16px", fontWeight: 800, color: "#22c55e" }}>
                        {formulaStr}
                      </td>
                      <td style={{ padding: "14px 16px", color: "var(--text-secondary)" }}>
                        ₹{r.minSaleAmount ?? 0}
                      </td>
                      <td style={{ padding: "14px 16px", color: "var(--text-secondary)", fontSize: 12 }}>
                        {r.payoutFrequency || "MONTHLY"}
                      </td>
                      <td style={{ padding: "14px 16px", color: "var(--text-secondary)" }}>
                        ₹{r.autoApproveThreshold ?? 500}
                      </td>
                      <td style={{ padding: "14px 16px", textAlign: "right" }}>
                        <div style={{ display: "inline-flex", gap: 6 }}>
                          <button
                            type="button"
                            onClick={() => startEdit(r)}
                            style={{
                              padding: "5px 10px",
                              borderRadius: 6,
                              background: "rgba(59, 130, 246, 0.1)",
                              border: "1px solid rgba(59, 130, 246, 0.3)",
                              color: "#3b82f6",
                              fontSize: 12,
                              fontWeight: 700,
                              cursor: "pointer",
                            }}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(r.id)}
                            style={{
                              padding: "5px 10px",
                              borderRadius: 6,
                              background: "rgba(239, 68, 68, 0.1)",
                              border: "1px solid rgba(239, 68, 68, 0.3)",
                              color: "#ef4444",
                              fontSize: 12,
                              fontWeight: 700,
                              cursor: "pointer",
                            }}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 2. Add New Category Rule Modal */}
      {showModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0, 0, 0, 0.75)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            backdropFilter: "blur(6px)",
            padding: 16,
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 540,
              background: "var(--card-bg)",
              border: "1px solid var(--border)",
              borderRadius: 20,
              padding: 24,
              boxShadow: "0 20px 50px rgba(0,0,0,0.5)",
              maxHeight: "90vh",
              overflowY: "auto",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: "var(--text-primary)" }}>
                Add Category Incentive Rule
              </h3>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                style={{ background: "transparent", border: "none", color: "var(--text-secondary)", fontSize: 20, cursor: "pointer" }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateRule} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>
                  Product Category
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Automotive, Electronics, Clothing, Grocery, ALL"
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: 10,
                    border: "1px solid var(--border)",
                    background: "var(--bg)",
                    color: "var(--text-primary)",
                    fontSize: 13,
                    fontWeight: 700,
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>
                  Calculation Type
                </label>
                <select
                  value={newCalcType}
                  onChange={(e) => setNewCalcType(e.target.value as CalculationType)}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: 10,
                    border: "1px solid var(--border)",
                    background: "var(--bg)",
                    color: "var(--text-primary)",
                    fontSize: 13,
                    fontWeight: 700,
                  }}
                >
                  <option value="PERCENT_OF_SALE">PERCENT_OF_SALE (% of total category order turnover)</option>
                  <option value="FIXED_PER_SALE">FIXED_PER_SALE (Fixed ₹ amount per qualifying sale)</option>
                  <option value="TIERED">TIERED (Percentage escalates based on sales thresholds)</option>
                </select>
              </div>

              {/* Dynamic inputs based on calc type */}
              {newCalcType === "PERCENT_OF_SALE" && (
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>
                    Incentive Percentage (%)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min={0}
                    required
                    value={newPercentValue}
                    onChange={(e) => setNewPercentValue(e.target.value)}
                    placeholder="e.g. 3 for 3%"
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      borderRadius: 10,
                      border: "1px solid var(--border)",
                      background: "var(--bg)",
                      color: "var(--text-primary)",
                      fontSize: 13,
                    }}
                  />
                </div>
              )}

              {newCalcType === "FIXED_PER_SALE" && (
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>
                    Fixed Reward Amount (₹ per qualifying sale)
                  </label>
                  <input
                    type="number"
                    min={0}
                    required
                    value={newFixedAmount}
                    onChange={(e) => setNewFixedAmount(e.target.value)}
                    placeholder="e.g. 50"
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      borderRadius: 10,
                      border: "1px solid var(--border)",
                      background: "var(--bg)",
                      color: "var(--text-primary)",
                      fontSize: 13,
                    }}
                  />
                </div>
              )}

              {newCalcType === "TIERED" && (
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)" }}>
                      Tier Thresholds
                    </label>
                    <button
                      type="button"
                      onClick={handleAddModalTier}
                      style={{
                        padding: "3px 8px",
                        borderRadius: 6,
                        background: "rgba(59, 130, 246, 0.1)",
                        border: "1px solid rgba(59, 130, 246, 0.3)",
                        color: "#3b82f6",
                        fontSize: 11,
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      + Add Tier
                    </button>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {newTiers.map((t, idx) => (
                      <div key={idx} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>Min ₹</span>
                        <input
                          type="number"
                          value={t.minSaleAmount}
                          onChange={(e) => handleUpdateModalTier(idx, "minSaleAmount", parseFloat(e.target.value) || 0)}
                          placeholder="Min Sale"
                          style={{
                            flex: 1,
                            padding: "8px 10px",
                            borderRadius: 8,
                            border: "1px solid var(--border)",
                            background: "var(--bg)",
                            color: "var(--text-primary)",
                            fontSize: 12,
                          }}
                        />
                        <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>Rate</span>
                        <input
                          type="number"
                          step="0.1"
                          value={t.percent}
                          onChange={(e) => handleUpdateModalTier(idx, "percent", parseFloat(e.target.value) || 0)}
                          placeholder="%"
                          style={{
                            width: 70,
                            padding: "8px 10px",
                            borderRadius: 8,
                            border: "1px solid var(--border)",
                            background: "var(--bg)",
                            color: "var(--text-primary)",
                            fontSize: 12,
                          }}
                        />
                        <span style={{ fontSize: 12 }}>%</span>
                        {newTiers.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveModalTier(idx)}
                            style={{ background: "transparent", border: "none", color: "#ef4444", cursor: "pointer", fontSize: 14 }}
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>
                    Min Order/Sale Amount (₹)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={newMinSaleAmount}
                    onChange={(e) => setNewMinSaleAmount(e.target.value)}
                    placeholder="0"
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      borderRadius: 10,
                      border: "1px solid var(--border)",
                      background: "var(--bg)",
                      color: "var(--text-primary)",
                      fontSize: 13,
                    }}
                  />
                  <span style={{ fontSize: 10, color: "var(--text-secondary)" }}>
                    Orders below this amount are excluded
                  </span>
                </div>

                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>
                    Auto-Approve Threshold (₹)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={newAutoApproveThreshold}
                    onChange={(e) => setNewAutoApproveThreshold(e.target.value)}
                    placeholder="500"
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      borderRadius: 10,
                      border: "1px solid var(--border)",
                      background: "var(--bg)",
                      color: "var(--text-primary)",
                      fontSize: 13,
                    }}
                  />
                  <span style={{ fontSize: 10, color: "var(--text-secondary)" }}>
                    Payouts above this need manager sign-off
                  </span>
                </div>
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>
                  Payout Frequency
                </label>
                <select
                  value={newPayoutFreq}
                  onChange={(e) => setNewPayoutFreq(e.target.value as PayoutFrequency)}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: 10,
                    border: "1px solid var(--border)",
                    background: "var(--bg)",
                    color: "var(--text-primary)",
                    fontSize: 13,
                  }}
                >
                  <option value="MONTHLY">Monthly Payout</option>
                  <option value="WEEKLY">Weekly Payout</option>
                  <option value="DAILY">Daily Payout</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>
                  Rule Description (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. 3% turnover bonus on high-margin Electronics"
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: 10,
                    border: "1px solid var(--border)",
                    background: "var(--bg)",
                    color: "var(--text-primary)",
                    fontSize: 13,
                  }}
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 14 }}>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  style={{
                    padding: "10px 16px",
                    borderRadius: 10,
                    background: "transparent",
                    border: "1px solid var(--border)",
                    color: "var(--text-secondary)",
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  style={{
                    padding: "10px 20px",
                    borderRadius: 10,
                    background: "var(--cta-bg)",
                    color: "var(--cta-text)",
                    fontWeight: 800,
                    fontSize: 13,
                    border: "none",
                    cursor: isPending ? "not-allowed" : "pointer",
                    boxShadow: "0 2px 10px rgba(59, 130, 246, 0.3)",
                  }}
                >
                  {isPending ? "Saving..." : "Create Rule"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
