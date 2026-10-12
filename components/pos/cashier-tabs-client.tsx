"use client";

import { useState } from "react";
import Link from "next/link";
import { PosTerminal } from "@/components/pos-terminal";
import { CounterManagement } from "@/components/pos/counter-management";
import { PosCounterWithShift } from "@/lib/services/pos-counter-service";
import { StaffRow } from "@/lib/services/staff-service";

interface CashierTabsClientProps {
  branchCode?: string | null;
  canEdit?: boolean;
  role: string;
  counters: PosCounterWithShift[];
  staffList: StaffRow[];
  maxAllowedCounters: number;
  planName: string;
}

export function CashierTabsClient({
  branchCode,
  canEdit = true,
  role,
  counters,
  staffList,
  maxAllowedCounters,
  planName,
}: CashierTabsClientProps) {
  const [activeTab, setActiveTab] = useState<"TERMINAL" | "COUNTERS">("TERMINAL");

  const isManager = role === "super_admin" || role === "tenant_admin" || role === "manager";
  const activeShiftsCount = counters.filter((c) => c.activeShift && c.activeShift.status === "OPEN").length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Top Tab Bar & Tablet Mode Launcher */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        {isManager && (
          <div
            style={{
              display: "inline-flex",
              gap: 6,
              background: "var(--card-bg)",
              padding: 4,
              borderRadius: 14,
              border: "1px solid var(--border)",
            }}
          >
            <button
              type="button"
              onClick={() => setActiveTab("TERMINAL")}
              style={{
                padding: "8px 18px",
                borderRadius: 10,
                border: "none",
                background: activeTab === "TERMINAL" ? "var(--scaffold-bg)" : "transparent",
                color: activeTab === "TERMINAL" ? "var(--text-primary)" : "var(--text-secondary)",
                fontSize: 13,
                fontWeight: 800,
                cursor: "pointer",
                boxShadow: activeTab === "TERMINAL" ? "0 2px 8px rgba(0,0,0,0.2)" : "none",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <span>🛒</span>
              <span>Checkout Terminal</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("COUNTERS")}
              style={{
                padding: "8px 18px",
                borderRadius: 10,
                border: "none",
                background: activeTab === "COUNTERS" ? "var(--scaffold-bg)" : "transparent",
                color: activeTab === "COUNTERS" ? "var(--text-primary)" : "var(--text-secondary)",
                fontSize: 13,
                fontWeight: 800,
                cursor: "pointer",
                boxShadow: activeTab === "COUNTERS" ? "0 2px 8px rgba(0,0,0,0.2)" : "none",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <span>🖥️</span>
              <span>Counters &amp; Shifts</span>
              {activeShiftsCount > 0 && (
                <span
                  style={{
                    padding: "1px 7px",
                    borderRadius: 10,
                    background: "rgba(0, 210, 106, 0.15)",
                    color: "var(--success)",
                    fontSize: 11,
                    fontWeight: 800,
                  }}
                >
                  {activeShiftsCount} Live
                </span>
              )}
            </button>
          </div>
        )}

        {/* Public Tablet Cashier Launcher Link */}
        <div style={{ marginLeft: "auto" }}>
          <Link
            href={branchCode ? `/pos?store=${branchCode}` : "/pos"}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              padding: "8px 16px",
              borderRadius: 12,
              border: "1px solid rgba(0, 210, 106, 0.3)",
              background: "rgba(0, 210, 106, 0.1)",
              color: "var(--success)",
              fontSize: 13,
              fontWeight: 800,
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <span>📱 Open Cashier Tablet View</span>
            <span>↗</span>
          </Link>
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === "TERMINAL" ? (
        <PosTerminal branchCode={branchCode} canEdit={canEdit} />
      ) : (
        <CounterManagement
          counters={counters}
          staffList={staffList}
          maxAllowedCounters={maxAllowedCounters}
          planName={planName}
          branchCode={branchCode}
          canEdit={canEdit}
        />
      )}
    </div>
  );
}
