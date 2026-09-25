"use client";

import { useState } from "react";
import { HrAttendanceTable, SimpleStaff } from "@/components/hr-attendance-table";
import { HrLeaveRequests } from "@/components/hr-leave-requests";
import { HrSalaryEditor } from "@/components/hr-salary-editor";
import { HrIncentiveTable } from "@/components/hr-incentive-table";
import { HrIncentiveRulesEditor } from "@/components/hr-incentive-rules-editor";
import { HrApprovalsInbox } from "@/components/hr-approvals-inbox";
import { HrAttendanceSettings } from "@/components/hr-attendance-settings";

interface HrDashboardClientProps {
  staffList: SimpleStaff[];
  userRole: string;
  canEdit: boolean;
  storeId?: string | null;
  tenantId?: string | null;
}

export function HrDashboardClient({
  staffList,
  userRole,
  canEdit,
  storeId,
  tenantId,
}: HrDashboardClientProps) {
  const isManager = userRole === "manager";
  const [activeTab, setActiveTab] = useState<
    "inbox" | "attendance" | "leaves" | "incentives" | "rules" | "salary" | "settings"
  >("inbox");

  return (
    <div style={{ padding: "28px 24px", maxWidth: 1200, margin: "0 auto", display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: "var(--text-primary)", margin: 0, letterSpacing: "-0.01em" }}>
            HR & Workforce Operations
          </h1>
          <p style={{ color: "var(--text-secondary)", fontSize: 14, marginTop: 6, marginBottom: 0 }}>
            Manage attendance logging, approval inbox, leave quotas, performance incentives, and compensation structures
            {isManager && storeId ? ` for branch [${storeId}]` : ""}
          </p>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div style={{ display: "flex", gap: 10, borderBottom: "1px solid var(--border)", paddingBottom: 12, overflowX: "auto" }}>
        <button
          type="button"
          onClick={() => setActiveTab("inbox")}
          style={{
            padding: "8px 18px",
            borderRadius: 12,
            fontSize: 13,
            fontWeight: 800,
            cursor: "pointer",
            border: activeTab === "inbox" ? "1px solid var(--cta-bg)" : "1px solid var(--border)",
            background: activeTab === "inbox" ? "var(--cta-bg)" : "var(--card-bg)",
            color: activeTab === "inbox" ? "var(--cta-text)" : "var(--text-secondary)",
            transition: "all 0.15s ease",
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span>📥</span> Approvals Inbox
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("attendance")}
          style={{
            padding: "8px 18px",
            borderRadius: 12,
            fontSize: 13,
            fontWeight: 800,
            cursor: "pointer",
            border: activeTab === "attendance" ? "1px solid var(--cta-bg)" : "1px solid var(--border)",
            background: activeTab === "attendance" ? "var(--cta-bg)" : "var(--card-bg)",
            color: activeTab === "attendance" ? "var(--cta-text)" : "var(--text-secondary)",
            transition: "all 0.15s ease",
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span>📅</span> Monthly Attendance
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("leaves")}
          style={{
            padding: "8px 18px",
            borderRadius: 12,
            fontSize: 13,
            fontWeight: 800,
            cursor: "pointer",
            border: activeTab === "leaves" ? "1px solid var(--cta-bg)" : "1px solid var(--border)",
            background: activeTab === "leaves" ? "var(--cta-bg)" : "var(--card-bg)",
            color: activeTab === "leaves" ? "var(--cta-text)" : "var(--text-secondary)",
            transition: "all 0.15s ease",
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span>🏖️</span> Leave Management
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("incentives")}
          style={{
            padding: "8px 18px",
            borderRadius: 12,
            fontSize: 13,
            fontWeight: 800,
            cursor: "pointer",
            border: activeTab === "incentives" ? "1px solid var(--cta-bg)" : "1px solid var(--border)",
            background: activeTab === "incentives" ? "var(--cta-bg)" : "var(--card-bg)",
            color: activeTab === "incentives" ? "var(--cta-text)" : "var(--text-secondary)",
            transition: "all 0.15s ease",
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span>🏆</span> Monthly Incentives
        </button>

        {/* 🛡️ Strict: Incentive Rules configuration only rendered for tenant_admin and super_admin */}
        {!isManager && (
          <button
            type="button"
            onClick={() => setActiveTab("rules")}
            style={{
              padding: "8px 18px",
              borderRadius: 12,
              fontSize: 13,
              fontWeight: 800,
              cursor: "pointer",
              border: activeTab === "rules" ? "1px solid var(--cta-bg)" : "1px solid var(--border)",
              background: activeTab === "rules" ? "var(--cta-bg)" : "var(--card-bg)",
              color: activeTab === "rules" ? "var(--cta-text)" : "var(--text-secondary)",
              transition: "all 0.15s ease",
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span>🎯</span> Incentive Rules
          </button>
        )}

        {/* 🛡️ Strict: Only rendered for tenant_admin and super_admin, never for manager */}
        {!isManager && (
          <button
            type="button"
            onClick={() => setActiveTab("salary")}
            style={{
              padding: "8px 18px",
              borderRadius: 12,
              fontSize: 13,
              fontWeight: 800,
              cursor: "pointer",
              border: activeTab === "salary" ? "1px solid var(--cta-bg)" : "1px solid var(--border)",
              background: activeTab === "salary" ? "var(--cta-bg)" : "var(--card-bg)",
              color: activeTab === "salary" ? "var(--cta-text)" : "var(--text-secondary)",
              transition: "all 0.15s ease",
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span>💰</span> Compensation & Salary
          </button>
        )}

        <button
          type="button"
          onClick={() => setActiveTab("settings")}
          style={{
            padding: "8px 18px",
            borderRadius: 12,
            fontSize: 13,
            fontWeight: 800,
            cursor: "pointer",
            border: activeTab === "settings" ? "1px solid var(--cta-bg)" : "1px solid var(--border)",
            background: activeTab === "settings" ? "var(--cta-bg)" : "var(--card-bg)",
            color: activeTab === "settings" ? "var(--cta-text)" : "var(--text-secondary)",
            transition: "all 0.15s ease",
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span>⚙️</span> Attendance Settings
        </button>
      </div>

      {/* Tab Panels */}
      {activeTab === "inbox" && (
        <HrApprovalsInbox staffList={staffList} userRole={userRole} />
      )}

      {activeTab === "attendance" && (
        <HrAttendanceTable staffList={staffList} canEdit={canEdit} userRole={userRole} />
      )}

      {activeTab === "leaves" && (
        <HrLeaveRequests staffList={staffList} canEdit={canEdit} userRole={userRole} />
      )}

      {activeTab === "incentives" && (
        <HrIncentiveTable branchCode={storeId} userRole={userRole} />
      )}

      {activeTab === "rules" && !isManager && (
        <HrIncentiveRulesEditor tenantId={tenantId} userRole={userRole} />
      )}

      {activeTab === "salary" && !isManager && (
        <HrSalaryEditor staffList={staffList} userRole={userRole} />
      )}

      {activeTab === "settings" && (
        <HrAttendanceSettings tenantId={tenantId} canEdit={canEdit} userRole={userRole} />
      )}
    </div>
  );
}
