"use client";

import { useState, useEffect, useTransition, useMemo } from "react";
import { getIncentiveRulesAction, setIncentiveRule, deleteIncentiveRuleAction } from "@/actions/incentive";
import {
  IncentiveRuleDocument,
  CalculationType,
  PayoutFrequency,
  TierThreshold,
} from "@/lib/schemas/incentive-schema";
import {
  evaluateCategoryIncentive,
  evaluateGuardIncentiveRule,
  generateRulePlainSummary,
  simulateCalculation,
} from "@/lib/utils/incentive-calc";
import { useRouter } from "next/navigation";

interface HrIncentiveRulesEditorProps {
  tenantId?: string | null;
  userRole: string;
}

const PRODUCT_CATEGORIES = [
  "All Products",
  "Electronics",
  "Groceries",
  "Apparel & Clothing",
  "Footwear",
  "Mobile & Accessories",
  "Home & Living",
  "Cosmetics & Beauty",
  "Personal Care",
  "Beverages",
  "General",
];

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
  const [roleFilter, setRoleFilter] = useState<"ALL" | "CASHIER" | "GUARD">("ALL");

  // Wizard Modal State
  const [showWizard, setShowWizard] = useState<boolean>(false);
  const [wizardStep, setWizardStep] = useState<number>(1);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);

  // Step 1: Target Role
  const [selectedRole, setSelectedRole] = useState<"cashier" | "guard" | "all">("cashier");

  // Step 2A: Cashier Scope
  const [cashierCategoryType, setCashierCategoryType] = useState<"ALL" | "SPECIFIC">("SPECIFIC");
  const [specificCategory, setSpecificCategory] = useState<string>("Electronics");
  const [minSaleAmount, setMinSaleAmount] = useState<string>("0");

  // Step 2B: Guard Scope
  const [guardTriggerType, setGuardTriggerType] = useState<"PER_CATCH" | "MONTHLY_TARGET">("PER_CATCH");
  const [fraudCatchReward, setFraudCatchReward] = useState<string>("500");
  const [enableHighCatchReward, setEnableHighCatchReward] = useState<boolean>(false);
  const [catchValueThreshold, setCatchValueThreshold] = useState<string>("5000");
  const [catchValueReward, setCatchValueReward] = useState<string>("1000");
  const [monthlyTargetValue, setMonthlyTargetValue] = useState<string>("25000");
  const [monthlyTargetBonus, setMonthlyTargetBonus] = useState<string>("2500");

  // Step 2C / Step 3: Calculation & Amounts
  const [rewardType, setRewardType] = useState<"PERCENTAGE" | "FIXED" | "TIERED">("PERCENTAGE");
  const [percentValue, setPercentValue] = useState<string>("1.5");
  const [fixedAmount, setFixedAmount] = useState<string>("50");
  const [tiers, setTiers] = useState<TierThreshold[]>([
    { minSaleAmount: 0, percent: 1 },
    { minSaleAmount: 50000, percent: 1.5 },
    { minSaleAmount: 100000, percent: 2 },
  ]);

  // Step 4: Schedule & Approval Threshold
  const [payoutFreq, setPayoutFreq] = useState<PayoutFrequency>("MONTHLY");
  const [autoApproveThreshold, setAutoApproveThreshold] = useState<string>("500");

  // Step 5: Live Test Amount
  const [previewSampleAmount, setPreviewSampleAmount] = useState<string>("10000");

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

  const openNewWizard = () => {
    setEditingRuleId(null);
    setWizardStep(1);
    setSelectedRole("cashier");
    setCashierCategoryType("SPECIFIC");
    setSpecificCategory("Electronics");
    setMinSaleAmount("0");
    setGuardTriggerType("PER_CATCH");
    setFraudCatchReward("500");
    setEnableHighCatchReward(false);
    setCatchValueThreshold("5000");
    setCatchValueReward("1000");
    setMonthlyTargetValue("25000");
    setMonthlyTargetBonus("2500");
    setRewardType("PERCENTAGE");
    setPercentValue("1.5");
    setFixedAmount("50");
    setTiers([
      { minSaleAmount: 0, percent: 1 },
      { minSaleAmount: 50000, percent: 1.5 },
      { minSaleAmount: 100000, percent: 2 },
    ]);
    setPayoutFreq("MONTHLY");
    setAutoApproveThreshold("500");
    setPreviewSampleAmount("10000");
    setShowWizard(true);
  };

  const openEditWizard = (r: IncentiveRuleDocument) => {
    setEditingRuleId(r.id);
    const role = (r.role || r.targetRole || "cashier") as "cashier" | "guard" | "all";
    setSelectedRole(role);
    setWizardStep(1);

    if (role === "guard") {
      setGuardTriggerType(r.guardRuleType || "PER_CATCH");
      setFraudCatchReward(r.fraudCatchReward ? String(r.fraudCatchReward) : "500");
      setEnableHighCatchReward(Boolean(r.catchValueThreshold && r.catchValueReward));
      setCatchValueThreshold(r.catchValueThreshold ? String(r.catchValueThreshold) : "5000");
      setCatchValueReward(r.catchValueReward ? String(r.catchValueReward) : "1000");
      setMonthlyTargetValue(r.monthlyTargetValue ? String(r.monthlyTargetValue) : "25000");
      setMonthlyTargetBonus(r.monthlyTargetBonus ? String(r.monthlyTargetBonus) : "2500");
    } else {
      if (!r.category || r.category === "ALL") {
        setCashierCategoryType("ALL");
      } else {
        setCashierCategoryType("SPECIFIC");
        setSpecificCategory(r.category);
      }
      setMinSaleAmount(String(r.minSaleAmount || 0));

      if (r.calculationType === "PERCENT_OF_SALE") {
        setRewardType("PERCENTAGE");
        setPercentValue(String(r.percentValue ?? 1.5));
      } else if (r.calculationType === "FIXED_PER_SALE") {
        setRewardType("FIXED");
        setFixedAmount(String(r.fixedAmount ?? 50));
      } else if (r.calculationType === "TIERED") {
        setRewardType("TIERED");
        if (r.tiers && r.tiers.length > 0) {
          setTiers([...r.tiers]);
        }
      }
    }

    setPayoutFreq(r.payoutFrequency || "MONTHLY");
    setAutoApproveThreshold(String(r.autoApproveThreshold ?? 500));
    setShowWizard(true);
  };

  const handleAddTier = () => {
    const lastTier = tiers[tiers.length - 1];
    const nextMin = (lastTier ? lastTier.minSaleAmount : 0) + 50000;
    const nextPct = (lastTier ? lastTier.percent : 1) + 0.5;
    setTiers([...tiers, { minSaleAmount: nextMin, percent: nextPct }]);
  };

  const handleRemoveTier = (index: number) => {
    if (tiers.length <= 1) return;
    setTiers(tiers.filter((_, i) => i !== index));
  };

  const handleUpdateTier = (index: number, field: keyof TierThreshold, val: number) => {
    const copy = [...tiers];
    copy[index] = { ...copy[index], [field]: val };
    setTiers(copy);
  };

  // Compile current rule configuration
  const currentRuleDraft = useMemo(() => {
    const category = selectedRole === "cashier"
      ? (cashierCategoryType === "ALL" ? "ALL" : specificCategory)
      : "Security";

    let calcType: CalculationType = "PERCENT_OF_SALE";
    if (selectedRole === "cashier") {
      calcType = rewardType === "PERCENTAGE" ? "PERCENT_OF_SALE" : rewardType === "FIXED" ? "FIXED_PER_SALE" : "TIERED";
    } else if (selectedRole === "guard") {
      calcType = "FIXED_PER_SALE";
    }

    const autoApprove = parseFloat(autoApproveThreshold) || 500;
    const minSale = parseFloat(minSaleAmount) || 0;

    return {
      id: editingRuleId || undefined,
      tenantId: tenantId || "DEFAULT",
      role: selectedRole,
      targetRole: selectedRole,
      category,
      calculationType: calcType,
      percentValue: rewardType === "PERCENTAGE" ? (parseFloat(percentValue) || 0) : undefined,
      fixedAmount: rewardType === "FIXED" ? (parseFloat(fixedAmount) || 0) : undefined,
      tiers: rewardType === "TIERED" ? tiers : undefined,
      minSaleAmount: minSale,
      payoutFrequency: payoutFreq,
      autoApproveThreshold: autoApprove,
      // Guard fields
      fraudCatchReward: selectedRole === "guard" && guardTriggerType === "PER_CATCH" ? (parseFloat(fraudCatchReward) || 0) : undefined,
      catchValueThreshold: selectedRole === "guard" && enableHighCatchReward ? (parseFloat(catchValueThreshold) || 0) : undefined,
      catchValueReward: selectedRole === "guard" && enableHighCatchReward ? (parseFloat(catchValueReward) || 0) : undefined,
      monthlyTargetValue: selectedRole === "guard" && guardTriggerType === "MONTHLY_TARGET" ? (parseFloat(monthlyTargetValue) || 0) : undefined,
      monthlyTargetBonus: selectedRole === "guard" && guardTriggerType === "MONTHLY_TARGET" ? (parseFloat(monthlyTargetBonus) || 0) : undefined,
      guardRuleType: selectedRole === "guard" ? guardTriggerType : undefined,
    };
  }, [
    editingRuleId,
    tenantId,
    selectedRole,
    cashierCategoryType,
    specificCategory,
    rewardType,
    percentValue,
    fixedAmount,
    tiers,
    minSaleAmount,
    payoutFreq,
    autoApproveThreshold,
    guardTriggerType,
    fraudCatchReward,
    enableHighCatchReward,
    catchValueThreshold,
    catchValueReward,
    monthlyTargetValue,
    monthlyTargetBonus,
  ]);

  // Plain summary text and live calculation
  const ruleSummaryText = useMemo(() => {
    return generateRulePlainSummary(currentRuleDraft);
  }, [currentRuleDraft]);

  const liveSimulation = useMemo(() => {
    const sample = parseFloat(previewSampleAmount) || 10000;
    return simulateCalculation(currentRuleDraft, sample);
  }, [currentRuleDraft, previewSampleAmount]);

  // Save Rule
  const handleSaveRule = (status: "ACTIVE" | "DRAFT") => {
    setErrorMsg(null);
    setSuccessMsg(null);

    startTransition(async () => {
      try {
        const payload = {
          ...currentRuleDraft,
          status,
        };

        const res = await setIncentiveRule(payload);
        if (res.ok) {
          setShowWizard(false);
          setSuccessMsg(
            status === "ACTIVE"
              ? "Rule activated successfully! New payouts will now follow this rule."
              : "Rule saved as Draft successfully."
          );
          setTimeout(() => setSuccessMsg(null), 4000);
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

  const handleDeleteRule = (ruleId: string) => {
    if (!confirm("Are you sure you want to delete this incentive rule? Past approved payouts will remain safe.")) {
      return;
    }
    startTransition(async () => {
      try {
        const res = await deleteIncentiveRuleAction(ruleId, tenantId || "DEFAULT");
        if (res.ok) {
          setSuccessMsg("Incentive rule deleted successfully.");
          setTimeout(() => setSuccessMsg(null), 3000);
          await loadRules();
          router.refresh();
        } else {
          setErrorMsg((res as any).error || "Failed to delete rule.");
        }
      } catch (err: any) {
        setErrorMsg(err.message || "Failed to delete rule.");
      }
    });
  };

  const filteredRules = rules.filter((r) => {
    if (roleFilter === "ALL") return true;
    const rRole = (r.role || r.targetRole || "cashier").toUpperCase();
    return rRole === roleFilter;
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Top Header Card */}
      <div
        style={{
          background: "var(--card-bg)",
          borderRadius: 18,
          border: "1px solid var(--border)",
          padding: 22,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 16,
          boxShadow: "0 4px 20px rgba(0,0,0,0.06)",
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 24 }}>🎯</span>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: "var(--text-primary)", margin: 0 }}>
              Performance Incentive Rules (कमीशन व रिवार्ड)
            </h2>
          </div>
          <p style={{ color: "var(--text-secondary)", fontSize: 13, margin: "6px 0 0 0" }}>
            Set automatic commission for Cashiers and theft prevention rewards for Guards without complicated math.
          </p>
        </div>

        <button
          type="button"
          onClick={openNewWizard}
          style={{
            background: "var(--cta-bg, #22c55e)",
            color: "var(--cta-text, #000)",
            border: "none",
            borderRadius: 12,
            padding: "10px 20px",
            fontSize: 13,
            fontWeight: 800,
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            boxShadow: "0 2px 10px rgba(34, 197, 94, 0.3)",
          }}
        >
          <span>✨</span> + Naya Incentive Rule Banayein
        </button>
      </div>

      {errorMsg && (
        <div style={{ padding: "12px 18px", borderRadius: 12, background: "rgba(239, 68, 68, 0.15)", border: "1px solid rgba(239, 68, 68, 0.3)", color: "#ef4444", fontSize: 13, fontWeight: 700 }}>
          ⚠️ {errorMsg}
        </div>
      )}

      {successMsg && (
        <div style={{ padding: "12px 18px", borderRadius: 12, background: "rgba(34, 197, 94, 0.15)", border: "1px solid rgba(34, 197, 94, 0.3)", color: "#22c55e", fontSize: 13, fontWeight: 700 }}>
          ✓ {successMsg}
        </div>
      )}

      {/* Filter Tabs */}
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <button
          type="button"
          onClick={() => setRoleFilter("ALL")}
          style={{
            padding: "7px 16px",
            borderRadius: 10,
            fontSize: 12,
            fontWeight: 800,
            cursor: "pointer",
            border: roleFilter === "ALL" ? "1px solid var(--cta-bg)" : "1px solid var(--border)",
            background: roleFilter === "ALL" ? "var(--cta-bg)" : "var(--card-bg)",
            color: roleFilter === "ALL" ? "var(--cta-text)" : "var(--text-secondary)",
          }}
        >
          All Rules ({rules.length})
        </button>
        <button
          type="button"
          onClick={() => setRoleFilter("CASHIER")}
          style={{
            padding: "7px 16px",
            borderRadius: 10,
            fontSize: 12,
            fontWeight: 800,
            cursor: "pointer",
            border: roleFilter === "CASHIER" ? "1px solid #3b82f6" : "1px solid var(--border)",
            background: roleFilter === "CASHIER" ? "rgba(59, 130, 246, 0.15)" : "var(--card-bg)",
            color: roleFilter === "CASHIER" ? "#60a5fa" : "var(--text-secondary)",
          }}
        >
          🧑‍💼 Cashier Rules
        </button>
        <button
          type="button"
          onClick={() => setRoleFilter("GUARD")}
          style={{
            padding: "7px 16px",
            borderRadius: 10,
            fontSize: 12,
            fontWeight: 800,
            cursor: "pointer",
            border: roleFilter === "GUARD" ? "1px solid #f59e0b" : "1px solid var(--border)",
            background: roleFilter === "GUARD" ? "rgba(245, 158, 11, 0.15)" : "var(--card-bg)",
            color: roleFilter === "GUARD" ? "#fbbf24" : "var(--text-secondary)",
          }}
        >
          🛡️ Security Guard Rules
        </button>
      </div>

      {/* Existing Rules List */}
      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: "var(--text-secondary)", fontSize: 14 }}>
          Loading active incentive rules...
        </div>
      ) : filteredRules.length === 0 ? (
        <div
          style={{
            background: "var(--card-bg)",
            borderRadius: 18,
            border: "1px dashed var(--border)",
            padding: 40,
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: 32, marginBottom: 8 }}>📝</div>
          <h3 style={{ margin: "0 0 6px 0", fontSize: 16, fontWeight: 800, color: "var(--text-primary)" }}>
            Koi Rule Configured Nahi Hai
          </h3>
          <p style={{ margin: "0 0 16px 0", fontSize: 13, color: "var(--text-secondary)" }}>
            Naya rule banane ke liye upar "+ Naya Incentive Rule Banayein" par click karein. Default baseline (1% volume) abhi active hai.
          </p>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 16 }}>
          {filteredRules.map((r) => {
            const role = (r.role || r.targetRole || "cashier").toLowerCase();
            const summary = generateRulePlainSummary(r);
            const isDraft = r.status === "DRAFT";

            return (
              <div
                key={r.id}
                style={{
                  background: "var(--card-bg)",
                  borderRadius: 16,
                  border: isDraft ? "1px dashed #f59e0b" : "1px solid var(--border)",
                  padding: 20,
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  gap: 16,
                  boxShadow: "0 2px 12px rgba(0,0,0,0.04)",
                  position: "relative",
                }}
              >
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span
                        style={{
                          padding: "3px 10px",
                          borderRadius: 20,
                          fontSize: 11,
                          fontWeight: 800,
                          background: role === "cashier" ? "rgba(59, 130, 246, 0.15)" : role === "guard" ? "rgba(245, 158, 11, 0.15)" : "rgba(168, 85, 247, 0.15)",
                          color: role === "cashier" ? "#60a5fa" : role === "guard" ? "#fbbf24" : "#c084fc",
                        }}
                      >
                        {role === "cashier" ? "🧑‍💼 Cashier" : role === "guard" ? "🛡️ Guard" : "📦 All Staff"}
                      </span>
                      {r.category && r.category !== "ALL" && (
                        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", background: "rgba(255,255,255,0.05)", padding: "3px 8px", borderRadius: 6 }}>
                          {r.category}
                        </span>
                      )}
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      {isDraft && (
                        <span style={{ fontSize: 10, fontWeight: 800, padding: "2px 6px", borderRadius: 4, background: "rgba(245, 158, 11, 0.2)", color: "#f59e0b" }}>
                          DRAFT
                        </span>
                      )}
                      <span style={{ fontSize: 10, fontWeight: 700, color: "var(--text-secondary)" }}>
                        v{r.version || 1}
                      </span>
                    </div>
                  </div>

                  <p style={{ margin: "0 0 12px 0", fontSize: 13, lineHeight: 1.5, color: "var(--text-primary)", fontWeight: 600 }}>
                    "{summary}"
                  </p>

                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 11, color: "var(--text-secondary)" }}>
                    <div>
                      <strong>Approval:</strong> Auto-approve below ₹{r.autoApproveThreshold ?? 500}
                    </div>
                    <div>
                      <strong>Frequency:</strong> {r.payoutFrequency || "MONTHLY"}
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, borderTop: "1px solid var(--border)", paddingTop: 12 }}>
                  <button
                    type="button"
                    onClick={() => openEditWizard(r)}
                    style={{
                      background: "rgba(255,255,255,0.05)",
                      border: "1px solid var(--border)",
                      color: "var(--text-primary)",
                      borderRadius: 8,
                      padding: "6px 12px",
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    ✏️ Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteRule(r.id)}
                    style={{
                      background: "rgba(239, 68, 68, 0.1)",
                      border: "1px solid rgba(239, 68, 68, 0.2)",
                      color: "#ef4444",
                      borderRadius: 8,
                      padding: "6px 12px",
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    🗑️ Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 5-Step Non-Technical Wizard Modal */}
      {showWizard && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.75)",
            backdropFilter: "blur(6px)",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
          onClick={() => setShowWizard(false)}
        >
          <div
            style={{
              background: "var(--card-bg)",
              border: "1px solid var(--border)",
              borderRadius: 20,
              maxWidth: 640,
              width: "100%",
              maxHeight: "92vh",
              display: "flex",
              flexDirection: "column",
              boxShadow: "0 25px 60px rgba(0,0,0,0.5)",
              overflow: "hidden",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Wizard Header with Progress Bar */}
            <div style={{ padding: "20px 24px 16px 24px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: "var(--text-primary)" }}>
                    {editingRuleId ? "Edit Incentive Rule" : "Naya Incentive Rule Banayein"}
                  </h3>
                  <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                    Step {wizardStep} of 5 • {
                      wizardStep === 1
                        ? "Role Selection"
                        : wizardStep === 2
                        ? "Rule Scope"
                        : wizardStep === 3
                        ? "Reward Amount"
                        : wizardStep === 4
                        ? "Schedule & Approval"
                        : "Live Preview & Activate"
                    }
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowWizard(false)}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--text-secondary)",
                    fontSize: 20,
                    cursor: "pointer",
                    padding: 4,
                  }}
                >
                  ✕
                </button>
              </div>

              {/* Progress Steps Indicator */}
              <div style={{ display: "flex", gap: 6 }}>
                {[1, 2, 3, 4, 5].map((step) => (
                  <div
                    key={step}
                    style={{
                      flex: 1,
                      height: 4,
                      borderRadius: 4,
                      background: wizardStep >= step ? "var(--cta-bg, #22c55e)" : "var(--border)",
                      transition: "all 0.2s ease",
                    }}
                  />
                ))}
              </div>
            </div>

            {/* Wizard Body (Scrollable) */}
            <div style={{ padding: 24, overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: 20 }}>
              {/* STEP 1: Yeh rule kiske liye hai? */}
              {wizardStep === 1 && (
                <div>
                  <h4 style={{ margin: "0 0 6px 0", fontSize: 15, fontWeight: 800, color: "var(--text-primary)" }}>
                    Yeh incentive rule kiske liye banana chahte ho?
                  </h4>
                  <p style={{ margin: "0 0 16px 0", fontSize: 13, color: "var(--text-secondary)" }}>
                    Kripya select karein jisko incentive ya reward milna chahiye:
                  </p>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 14 }}>
                    {/* Card 1: Cashier */}
                    <div
                      onClick={() => setSelectedRole("cashier")}
                      style={{
                        padding: 16,
                        borderRadius: 14,
                        border: selectedRole === "cashier" ? "2px solid #3b82f6" : "1px solid var(--border)",
                        background: selectedRole === "cashier" ? "rgba(59, 130, 246, 0.12)" : "rgba(255,255,255,0.02)",
                        cursor: "pointer",
                        transition: "all 0.15s ease",
                      }}
                    >
                      <div style={{ fontSize: 26, marginBottom: 8 }}>🧑‍💼</div>
                      <div style={{ fontSize: 14, fontWeight: 800, color: "var(--text-primary)" }}>Cashier</div>
                      <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>
                        POS checkout sales, item categories aur order volume par commission.
                      </div>
                    </div>

                    {/* Card 2: Guard */}
                    <div
                      onClick={() => setSelectedRole("guard")}
                      style={{
                        padding: 16,
                        borderRadius: 14,
                        border: selectedRole === "guard" ? "2px solid #f59e0b" : "1px solid var(--border)",
                        background: selectedRole === "guard" ? "rgba(245, 158, 11, 0.12)" : "rgba(255,255,255,0.02)",
                        cursor: "pointer",
                        transition: "all 0.15s ease",
                      }}
                    >
                      <div style={{ fontSize: 26, marginBottom: 8 }}>🛡️</div>
                      <div style={{ fontSize: 14, fontWeight: 800, color: "var(--text-primary)" }}>Security Guard</div>
                      <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>
                        Theft prevention, unpaid item intercepts aur fraud catch par fixed reward.
                      </div>
                    </div>

                    {/* Card 3: All Staff */}
                    <div
                      onClick={() => setSelectedRole("all")}
                      style={{
                        padding: 16,
                        borderRadius: 14,
                        border: selectedRole === "all" ? "2px solid #a855f7" : "1px solid var(--border)",
                        background: selectedRole === "all" ? "rgba(168, 85, 247, 0.12)" : "rgba(255,255,255,0.02)",
                        cursor: "pointer",
                        transition: "all 0.15s ease",
                      }}
                    >
                      <div style={{ fontSize: 26, marginBottom: 8 }}>📦</div>
                      <div style={{ fontSize: 14, fontWeight: 800, color: "var(--text-primary)" }}>All Staff</div>
                      <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>
                        Store ke sabhi employees ke liye flat monthly performance bonus.
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 2: Rule Scope */}
              {wizardStep === 2 && selectedRole === "cashier" && (
                <div>
                  <h4 style={{ margin: "0 0 6px 0", fontSize: 15, fontWeight: 800, color: "var(--text-primary)" }}>
                    Cashier ko commission kis sales pe milegi?
                  </h4>
                  <p style={{ margin: "0 0 16px 0", fontSize: 13, color: "var(--text-secondary)" }}>
                    Select karein ki sabhi items pe commission dena hai ya specific category pe:
                  </p>

                  <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 20 }}>
                    <label
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: 12,
                        borderRadius: 10,
                        border: cashierCategoryType === "ALL" ? "1px solid var(--cta-bg)" : "1px solid var(--border)",
                        background: cashierCategoryType === "ALL" ? "rgba(34, 197, 94, 0.08)" : "transparent",
                        cursor: "pointer",
                      }}
                    >
                      <input
                        type="radio"
                        name="cashierCategory"
                        checked={cashierCategoryType === "ALL"}
                        onChange={() => setCashierCategoryType("ALL")}
                      />
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>
                          Sab products pe (Koi bhi category)
                        </div>
                        <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                          Cashier ki scan ki hui har product sale count hogi.
                        </div>
                      </div>
                    </label>

                    <label
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 10,
                        padding: 12,
                        borderRadius: 10,
                        border: cashierCategoryType === "SPECIFIC" ? "1px solid var(--cta-bg)" : "1px solid var(--border)",
                        background: cashierCategoryType === "SPECIFIC" ? "rgba(34, 197, 94, 0.08)" : "transparent",
                        cursor: "pointer",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <input
                          type="radio"
                          name="cashierCategory"
                          checked={cashierCategoryType === "SPECIFIC"}
                          onChange={() => setCashierCategoryType("SPECIFIC")}
                        />
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>
                            Sirf specific category pe (e.g. Electronics, Clothing)
                          </div>
                          <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                            Sirf chuni hui category ke items pe hi commission apply hoga.
                          </div>
                        </div>
                      </div>

                      {cashierCategoryType === "SPECIFIC" && (
                        <div style={{ paddingLeft: 26, marginTop: 4 }}>
                          <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>
                            Select Category:
                          </label>
                          <select
                            value={specificCategory}
                            onChange={(e) => setSpecificCategory(e.target.value)}
                            style={{
                              padding: "8px 12px",
                              borderRadius: 8,
                              border: "1px solid var(--border)",
                              background: "var(--card-bg)",
                              color: "var(--text-primary)",
                              fontSize: 13,
                              fontWeight: 700,
                              minWidth: 200,
                            }}
                          >
                            {PRODUCT_CATEGORIES.filter((c) => c !== "All Products").map((c) => (
                              <option key={c} value={c}>
                                {c}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </label>
                  </div>

                  <div style={{ borderTop: "1px solid var(--border)", paddingTop: 16 }}>
                    <label style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", display: "block", marginBottom: 4 }}>
                      Minimum sale amount chahiye qualify karne ke liye?
                    </label>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-secondary)" }}>₹</span>
                      <input
                        type="number"
                        min="0"
                        value={minSaleAmount}
                        onChange={(e) => setMinSaleAmount(e.target.value)}
                        placeholder="0"
                        style={{
                          width: 140,
                          padding: "8px 12px",
                          borderRadius: 8,
                          border: "1px solid var(--border)",
                          background: "var(--card-bg)",
                          color: "var(--text-primary)",
                          fontSize: 13,
                          fontWeight: 700,
                        }}
                      />
                      <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                        (Agar koi minimum condition nahi hai to 0 likhein)
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 2: Guard Scope */}
              {wizardStep === 2 && selectedRole === "guard" && (
                <div>
                  <h4 style={{ margin: "0 0 6px 0", fontSize: 15, fontWeight: 800, color: "var(--text-primary)" }}>
                    Guard ko reward kab milega?
                  </h4>
                  <p style={{ margin: "0 0 16px 0", fontSize: 13, color: "var(--text-secondary)" }}>
                    Fraud pakadne par reward dene ka tareeqa chunein:
                  </p>

                  <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                    {/* Option A: Har verified catch pe */}
                    <div
                      style={{
                        padding: 14,
                        borderRadius: 12,
                        border: guardTriggerType === "PER_CATCH" ? "1px solid #f59e0b" : "1px solid var(--border)",
                        background: guardTriggerType === "PER_CATCH" ? "rgba(245, 158, 11, 0.08)" : "transparent",
                      }}
                    >
                      <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
                        <input
                          type="radio"
                          name="guardTrigger"
                          checked={guardTriggerType === "PER_CATCH"}
                          onChange={() => setGuardTriggerType("PER_CATCH")}
                        />
                        <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>
                          Har verified fraud catch pe
                        </span>
                      </label>

                      {guardTriggerType === "PER_CATCH" && (
                        <div style={{ paddingLeft: 26, marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>Har 1 fraud catch pe:</span>
                            <span style={{ fontWeight: 700 }}>₹</span>
                            <input
                              type="number"
                              min="0"
                              value={fraudCatchReward}
                              onChange={(e) => setFraudCatchReward(e.target.value)}
                              style={{ width: 100, padding: "6px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--card-bg)", color: "var(--text-primary)", fontWeight: 700 }}
                            />
                            <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>fixed reward</span>
                          </div>

                          <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4, cursor: "pointer" }}>
                            <input
                              type="checkbox"
                              checked={enableHighCatchReward}
                              onChange={(e) => setEnableHighCatchReward(e.target.checked)}
                            />
                            <span style={{ fontSize: 12, color: "var(--text-primary)" }}>
                              Badi theft pakadne par extra bonus dein
                            </span>
                          </label>

                          {enableHighCatchReward && (
                            <div style={{ display: "flex", alignItems: "center", gap: 8, paddingLeft: 20 }}>
                              <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>Agar catch value ₹</span>
                              <input
                                type="number"
                                min="0"
                                value={catchValueThreshold}
                                onChange={(e) => setCatchValueThreshold(e.target.value)}
                                style={{ width: 90, padding: "5px 8px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--card-bg)", color: "var(--text-primary)" }}
                              />
                              <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>se zyada ho, to reward: ₹</span>
                              <input
                                type="number"
                                min="0"
                                value={catchValueReward}
                                onChange={(e) => setCatchValueReward(e.target.value)}
                                style={{ width: 90, padding: "5px 8px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--card-bg)", color: "var(--text-primary)" }}
                              />
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Option B: Monthly target pe */}
                    <div
                      style={{
                        padding: 14,
                        borderRadius: 12,
                        border: guardTriggerType === "MONTHLY_TARGET" ? "1px solid #f59e0b" : "1px solid var(--border)",
                        background: guardTriggerType === "MONTHLY_TARGET" ? "rgba(245, 158, 11, 0.08)" : "transparent",
                      }}
                    >
                      <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
                        <input
                          type="radio"
                          name="guardTrigger"
                          checked={guardTriggerType === "MONTHLY_TARGET"}
                          onChange={() => setGuardTriggerType("MONTHLY_TARGET")}
                        />
                        <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>
                          Monthly fraud prevention target pe
                        </span>
                      </label>

                      {guardTriggerType === "MONTHLY_TARGET" && (
                        <div style={{ paddingLeft: 26, marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>Monthly Target Value: ₹</span>
                            <input
                              type="number"
                              min="0"
                              value={monthlyTargetValue}
                              onChange={(e) => setMonthlyTargetValue(e.target.value)}
                              style={{ width: 110, padding: "6px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--card-bg)", color: "var(--text-primary)", fontWeight: 700 }}
                            />
                          </div>

                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>Target achieve karne pe: ₹</span>
                            <input
                              type="number"
                              min="0"
                              value={monthlyTargetBonus}
                              onChange={(e) => setMonthlyTargetBonus(e.target.value)}
                              style={{ width: 110, padding: "6px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--card-bg)", color: "var(--text-primary)", fontWeight: 700 }}
                            />
                            <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>flat bonus</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 2: All Staff Scope */}
              {wizardStep === 2 && selectedRole === "all" && (
                <div>
                  <h4 style={{ margin: "0 0 6px 0", fontSize: 15, fontWeight: 800, color: "var(--text-primary)" }}>
                    All Staff Bonus Amount
                  </h4>
                  <p style={{ margin: "0 0 16px 0", fontSize: 13, color: "var(--text-secondary)" }}>
                    Sabhi active staff ke liye monthly fixed performance reward set karein:
                  </p>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 14, fontWeight: 700 }}>₹</span>
                    <input
                      type="number"
                      min="0"
                      value={fixedAmount}
                      onChange={(e) => setFixedAmount(e.target.value)}
                      style={{ width: 140, padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--card-bg)", color: "var(--text-primary)", fontWeight: 700 }}
                    />
                    <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>per employee (flat bonus)</span>
                  </div>
                </div>
              )}

              {/* STEP 3: Kitna milega? (For Cashier) */}
              {wizardStep === 3 && (
                <div>
                  <h4 style={{ margin: "0 0 6px 0", fontSize: 15, fontWeight: 800, color: "var(--text-primary)" }}>
                    Kitna commission ya reward milega?
                  </h4>
                  <p style={{ margin: "0 0 16px 0", fontSize: 13, color: "var(--text-secondary)" }}>
                    Reward calculate karne ka tareeqa chunein:
                  </p>

                  {selectedRole === "cashier" ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                      {/* Option 1: Percentage */}
                      <div
                        style={{
                          padding: 14,
                          borderRadius: 12,
                          border: rewardType === "PERCENTAGE" ? "1px solid #3b82f6" : "1px solid var(--border)",
                          background: rewardType === "PERCENTAGE" ? "rgba(59, 130, 246, 0.08)" : "transparent",
                        }}
                      >
                        <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
                          <input
                            type="radio"
                            name="rewardType"
                            checked={rewardType === "PERCENTAGE"}
                            onChange={() => setRewardType("PERCENTAGE")}
                          />
                          <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>
                            Percentage of Sale (Recommended)
                          </span>
                        </label>

                        {rewardType === "PERCENTAGE" && (
                          <div style={{ paddingLeft: 26, marginTop: 10, display: "flex", alignItems: "center", gap: 8 }}>
                            <input
                              type="number"
                              step="0.1"
                              min="0"
                              value={percentValue}
                              onChange={(e) => setPercentValue(e.target.value)}
                              style={{ width: 90, padding: "6px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--card-bg)", color: "var(--text-primary)", fontWeight: 700 }}
                            />
                            <span style={{ fontSize: 13, fontWeight: 700 }}>%</span>
                            <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                              eligible sale amount ka (e.g. 1.5%)
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Option 2: Fixed amount */}
                      <div
                        style={{
                          padding: 14,
                          borderRadius: 12,
                          border: rewardType === "FIXED" ? "1px solid #3b82f6" : "1px solid var(--border)",
                          background: rewardType === "FIXED" ? "rgba(59, 130, 246, 0.08)" : "transparent",
                        }}
                      >
                        <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
                          <input
                            type="radio"
                            name="rewardType"
                            checked={rewardType === "FIXED"}
                            onChange={() => setRewardType("FIXED")}
                          />
                          <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>
                            Fixed Amount per Sale
                          </span>
                        </label>

                        {rewardType === "FIXED" && (
                          <div style={{ paddingLeft: 26, marginTop: 10, display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ fontWeight: 700 }}>₹</span>
                            <input
                              type="number"
                              min="0"
                              value={fixedAmount}
                              onChange={(e) => setFixedAmount(e.target.value)}
                              style={{ width: 90, padding: "6px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--card-bg)", color: "var(--text-primary)", fontWeight: 700 }}
                            />
                            <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                              har qualifying order / bill pe
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Option 3: Tiered */}
                      <div
                        style={{
                          padding: 14,
                          borderRadius: 12,
                          border: rewardType === "TIERED" ? "1px solid #3b82f6" : "1px solid var(--border)",
                          background: rewardType === "TIERED" ? "rgba(59, 130, 246, 0.08)" : "transparent",
                        }}
                      >
                        <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
                          <input
                            type="radio"
                            name="rewardType"
                            checked={rewardType === "TIERED"}
                            onChange={() => setRewardType("TIERED")}
                          />
                          <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>
                            Tiered (Zyada beche, zyada milega)
                          </span>
                        </label>

                        {rewardType === "TIERED" && (
                          <div style={{ paddingLeft: 26, marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
                            {tiers.map((t, idx) => (
                              <div key={idx} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                <span style={{ fontSize: 12, color: "var(--text-secondary)", minWidth: 50 }}>
                                  Tier {idx + 1}:
                                </span>
                                <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>Sales ≥ ₹</span>
                                <input
                                  type="number"
                                  min="0"
                                  value={t.minSaleAmount}
                                  onChange={(e) => handleUpdateTier(idx, "minSaleAmount", parseFloat(e.target.value) || 0)}
                                  style={{ width: 100, padding: "5px 8px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--card-bg)", color: "var(--text-primary)" }}
                                />
                                <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>→</span>
                                <input
                                  type="number"
                                  step="0.1"
                                  min="0"
                                  value={t.percent}
                                  onChange={(e) => handleUpdateTier(idx, "percent", parseFloat(e.target.value) || 0)}
                                  style={{ width: 65, padding: "5px 8px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--card-bg)", color: "var(--text-primary)" }}
                                />
                                <span style={{ fontSize: 12, fontWeight: 700 }}>%</span>

                                {tiers.length > 1 && (
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveTier(idx)}
                                    style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontSize: 14 }}
                                  >
                                    ✕
                                  </button>
                                )}
                              </div>
                            ))}

                            <button
                              type="button"
                              onClick={handleAddTier}
                              style={{
                                alignSelf: "flex-start",
                                background: "rgba(59, 130, 246, 0.1)",
                                border: "1px dashed rgba(59, 130, 246, 0.4)",
                                color: "#60a5fa",
                                borderRadius: 8,
                                padding: "6px 12px",
                                fontSize: 12,
                                fontWeight: 700,
                                cursor: "pointer",
                                marginTop: 4,
                              }}
                            >
                              + Add Tier
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div style={{ background: "rgba(255,255,255,0.03)", padding: 16, borderRadius: 12, border: "1px solid var(--border)" }}>
                      <p style={{ margin: 0, fontSize: 13, color: "var(--text-secondary)" }}>
                        {selectedRole === "guard"
                          ? `Security Guard reward config: ₹${fraudCatchReward} per catch.`
                          : `All Staff bonus config: ₹${fixedAmount} flat bonus.`}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* STEP 4: Kab milega aur kaun approve karega? */}
              {wizardStep === 4 && (
                <div>
                  <h4 style={{ margin: "0 0 6px 0", fontSize: 15, fontWeight: 800, color: "var(--text-primary)" }}>
                    Kab milega aur kaun approve karega?
                  </h4>
                  <p style={{ margin: "0 0 16px 0", fontSize: 13, color: "var(--text-secondary)" }}>
                    Payout cycle aur manager approval limit configure karein:
                  </p>

                  <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    <div>
                      <label style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", display: "block", marginBottom: 8 }}>
                        Payout Frequency (Kab hisaab hoga):
                      </label>
                      <div style={{ display: "flex", gap: 14 }}>
                        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                          <input
                            type="radio"
                            name="payoutFreq"
                            checked={payoutFreq === "MONTHLY"}
                            onChange={() => setPayoutFreq("MONTHLY")}
                          />
                          <span style={{ fontSize: 13, fontWeight: 700 }}>Monthly (Har mahine ke end pe)</span>
                        </label>
                        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                          <input
                            type="radio"
                            name="payoutFreq"
                            checked={payoutFreq === "WEEKLY"}
                            onChange={() => setPayoutFreq("WEEKLY")}
                          />
                          <span style={{ fontSize: 13, fontWeight: 700 }}>Weekly (Har hafte)</span>
                        </label>
                      </div>
                    </div>

                    <div style={{ borderTop: "1px solid var(--border)", paddingTop: 16 }}>
                      <label style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", display: "block", marginBottom: 6 }}>
                        Manager Approval Rule:
                      </label>
                      <div style={{ background: "rgba(255,255,255,0.03)", padding: 14, borderRadius: 12, border: "1px solid var(--border)" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                          <span style={{ fontSize: 13, color: "var(--text-primary)" }}>₹</span>
                          <input
                            type="number"
                            min="0"
                            value={autoApproveThreshold}
                            onChange={(e) => setAutoApproveThreshold(e.target.value)}
                            style={{
                              width: 100,
                              padding: "6px 10px",
                              borderRadius: 8,
                              border: "1px solid var(--border)",
                              background: "var(--card-bg)",
                              color: "var(--text-primary)",
                              fontWeight: 800,
                              fontSize: 13,
                            }}
                          />
                          <span style={{ fontSize: 13, color: "var(--text-primary)" }}>
                            se kam amount — <strong>Auto Approve</strong> (koi approval nahi chahiye)
                          </span>
                        </div>
                        <p style={{ margin: 0, fontSize: 12, color: "var(--text-secondary)" }}>
                          Agar incentive amount ₹{autoApproveThreshold || 500} se zyada banta hai, to Branch Manager ko manually approve karna padega taaki store owner ka budget safe rahe.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 5: Live Preview & Plain Summary */}
              {wizardStep === 5 && (
                <div>
                  <h4 style={{ margin: "0 0 6px 0", fontSize: 15, fontWeight: 800, color: "var(--text-primary)" }}>
                    Rule Summary & Live Calculation Preview
                  </h4>
                  <p style={{ margin: "0 0 16px 0", fontSize: 13, color: "var(--text-secondary)" }}>
                    Review karein ki yeh rule real sales par kaise operate karega:
                  </p>

                  {/* Plain Language Summary Card */}
                  <div
                    style={{
                      background: "rgba(34, 197, 94, 0.08)",
                      border: "1px solid rgba(34, 197, 94, 0.3)",
                      borderRadius: 14,
                      padding: 16,
                      marginBottom: 16,
                    }}
                  >
                    <div style={{ fontSize: 11, fontWeight: 800, color: "#22c55e", marginBottom: 4, letterSpacing: "0.05em" }}>
                      📋 PLAIN LANGUAGE RULE SUMMARY
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", lineHeight: 1.5 }}>
                      "{ruleSummaryText}"
                    </div>
                  </div>

                  {/* Interactive Live Preview */}
                  <div
                    style={{
                      background: "var(--card-bg)",
                      border: "1px solid var(--border)",
                      borderRadius: 14,
                      padding: 16,
                      display: "flex",
                      flexDirection: "column",
                      gap: 12,
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                      <span style={{ fontSize: 12, fontWeight: 800, color: "var(--text-secondary)" }}>
                        LIVE CALCULATION TEST:
                      </span>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>Sample sale amount: ₹</span>
                        <input
                          type="number"
                          value={previewSampleAmount}
                          onChange={(e) => setPreviewSampleAmount(e.target.value)}
                          style={{
                            width: 100,
                            padding: "4px 8px",
                            borderRadius: 6,
                            border: "1px solid var(--border)",
                            background: "rgba(255,255,255,0.05)",
                            color: "var(--text-primary)",
                            fontWeight: 700,
                            fontSize: 12,
                          }}
                        />
                      </div>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10, borderTop: "1px solid var(--border)", paddingTop: 10 }}>
                      <div>
                        <div style={{ fontSize: 10, color: "var(--text-secondary)" }}>MATCHED RULE</div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)" }}>{liveSimulation.matchedRule}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 10, color: "var(--text-secondary)" }}>QUALIFYING AMOUNT</div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)" }}>₹{liveSimulation.qualifyingAmount.toLocaleString("en-IN")}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 10, color: "var(--text-secondary)" }}>ESTIMATED INCENTIVE</div>
                        <div style={{ fontSize: 16, fontWeight: 900, color: "#22c55e" }}>₹{liveSimulation.estimatedIncentive.toFixed(2)}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 10, color: "var(--text-secondary)" }}>APPROVAL FLOW</div>
                        <div style={{ fontSize: 11, fontWeight: 800, color: liveSimulation.approvalFlow.includes("AUTO") ? "#22c55e" : "#f59e0b" }}>
                          {liveSimulation.approvalFlow}
                        </div>
                      </div>
                    </div>

                    <div style={{ fontSize: 11, color: "var(--text-secondary)", fontStyle: "italic", marginTop: 4 }}>
                      ⚠️ Yeh ek live estimate hai. Final payout month-end calculation ke baad confirm hota hai.
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Wizard Footer Actions (Sticky) */}
            <div
              style={{
                padding: "16px 24px",
                borderTop: "1px solid var(--border)",
                background: "var(--card-bg)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexShrink: 0,
              }}
            >
              {wizardStep > 1 ? (
                <button
                  type="button"
                  onClick={() => setWizardStep(wizardStep - 1)}
                  style={{
                    background: "rgba(255,255,255,0.06)",
                    border: "1px solid var(--border)",
                    color: "var(--text-primary)",
                    borderRadius: 10,
                    padding: "8px 16px",
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  ⬅️ Back
                </button>
              ) : (
                <div />
              )}

              <div style={{ display: "flex", gap: 10 }}>
                {wizardStep < 5 ? (
                  <button
                    type="button"
                    onClick={() => setWizardStep(wizardStep + 1)}
                    style={{
                      background: "var(--cta-bg, #22c55e)",
                      color: "var(--cta-text, #000)",
                      border: "none",
                      borderRadius: 10,
                      padding: "8px 20px",
                      fontSize: 13,
                      fontWeight: 800,
                      cursor: "pointer",
                    }}
                  >
                    Aage Badhein ➡️
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => handleSaveRule("DRAFT")}
                      style={{
                        background: "rgba(255,255,255,0.06)",
                        border: "1px solid var(--border)",
                        color: "var(--text-primary)",
                        borderRadius: 10,
                        padding: "8px 16px",
                        fontSize: 13,
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      {isPending ? "Saving..." : "Save as Draft"}
                    </button>
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => handleSaveRule("ACTIVE")}
                      style={{
                        background: "var(--cta-bg, #22c55e)",
                        color: "var(--cta-text, #000)",
                        border: "none",
                        borderRadius: 10,
                        padding: "8px 22px",
                        fontSize: 13,
                        fontWeight: 800,
                        cursor: "pointer",
                        boxShadow: "0 2px 10px rgba(34, 197, 94, 0.3)",
                      }}
                    >
                      {isPending ? "Activating..." : "🚀 Activate Rule"}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
