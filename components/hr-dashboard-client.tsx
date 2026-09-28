"use client";

import { useState, useEffect } from "react";
import { HrAttendanceTable, SimpleStaff } from "@/components/hr-attendance-table";
import { HrLeaveRequests } from "@/components/hr-leave-requests";
import { HrSalaryEditor } from "@/components/hr-salary-editor";
import { HrIncentiveTable } from "@/components/hr-incentive-table";
import { HrIncentiveRulesEditor } from "@/components/hr-incentive-rules-editor";
import { HrApprovalsInbox } from "@/components/hr-approvals-inbox";
import { HrAttendanceSettings } from "@/components/hr-attendance-settings";
import { QRCodeSVG } from "qrcode.react";

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
  const [showQrModal, setShowQrModal] = useState(false);
  const [employeePortalUrl, setEmployeePortalUrl] = useState("/employee/login");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setEmployeePortalUrl(`${window.location.origin}/employee/login`);
    }
  }, []);

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

        <button
          type="button"
          onClick={() => setShowQrModal(true)}
          style={{
            padding: "9px 16px",
            borderRadius: 12,
            fontSize: 13,
            fontWeight: 800,
            cursor: "pointer",
            border: "1px solid rgba(59, 130, 246, 0.4)",
            background: "rgba(59, 130, 246, 0.1)",
            color: "var(--text-primary)",
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            boxShadow: "0 2px 8px rgba(59, 130, 246, 0.15)",
            transition: "all 0.15s ease",
          }}
        >
          <span>📱</span> Get Employee App
        </button>
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

      {/* 📱 Get Employee App Modal */}
      {showQrModal && (
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
            padding: 20,
          }}
          onClick={() => setShowQrModal(false)}
        >
          <div
            style={{
              background: "var(--card-bg)",
              border: "1px solid var(--border)",
              borderRadius: 20,
              padding: 28,
              maxWidth: 460,
              width: "100%",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 16,
              boxShadow: "0 20px 50px rgba(0, 0, 0, 0.4)",
              position: "relative",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: 8 }}>
                <span>📱</span> Employee Mobile App (PWA)
              </div>
              <button
                type="button"
                onClick={() => setShowQrModal(false)}
                style={{
                  background: "transparent",
                  border: "none",
                  fontSize: 18,
                  cursor: "pointer",
                  color: "var(--text-secondary)",
                }}
              >
                ✕
              </button>
            </div>

            <p style={{ margin: 0, fontSize: 13, color: "var(--text-secondary)", textAlign: "center", lineHeight: 1.5 }}>
              Show this QR code to staff members (Cashiers, Guards, Sales Staff) during onboarding to install the app on their phone.
            </p>

            {/* QR Code Container */}
            <div
              style={{
                background: "#ffffff",
                padding: 16,
                borderRadius: 16,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
                margin: "8px 0",
              }}
            >
              <QRCodeSVG
                value={employeePortalUrl}
                size={180}
                level="H"
                includeMargin={false}
              />
            </div>

            <div style={{ width: "100%", background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)", borderRadius: 12, padding: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)", marginBottom: 6 }}>
                Quick Instructions:
              </div>
              <ol style={{ margin: 0, paddingLeft: 16, fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.6 }}>
                <li>Scan QR code with phone camera to open <b>/employee/login</b></li>
                <li>Log in using phone number & OTP</li>
                <li>Tap <b>"Add to Home Screen"</b> in browser to install as PWA</li>
              </ol>
            </div>

            <div style={{ display: "flex", gap: 10, width: "100%" }}>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(employeePortalUrl);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 3000);
                }}
                style={{
                  flex: 1,
                  padding: "10px 16px",
                  borderRadius: 10,
                  fontSize: 13,
                  fontWeight: 800,
                  cursor: "pointer",
                  background: copied ? "rgba(34, 197, 94, 0.15)" : "var(--cta-bg)",
                  color: copied ? "#22c55e" : "var(--cta-text)",
                  border: "none",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  transition: "all 0.15s ease",
                }}
              >
                <span>{copied ? "✅" : "📋"}</span>
                {copied ? "Link Copied!" : "Copy Link"}
              </button>

              <button
                type="button"
                onClick={() => setShowQrModal(false)}
                style={{
                  padding: "10px 16px",
                  borderRadius: 10,
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: "pointer",
                  background: "transparent",
                  color: "var(--text-secondary)",
                  border: "1px solid var(--border)",
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
