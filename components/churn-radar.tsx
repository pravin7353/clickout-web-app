"use client";

import { useState } from "react";
import {
  VipCustomer,
  LiveShopper,
  GhostVisitor,
  GrowthConfig,
} from "@/lib/services/churn-service";
import { AiGrowthSetupModal } from "@/components/ai-growth-setup-modal";
import { SendOfferModal } from "@/components/send-offer-modal";

function formatDuration(minutes: number): string {
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m ago` : `${h}h ago`;
}

function formatTime(timestampMs: number): string {
  const d = new Date(timestampMs);
  return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
}

function formatDate(timestampMs: number): string {
  const d = new Date(timestampMs);
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function getInitials(name: string): string {
  if (!name) return "U";
  const parts = name.trim().split(" ");
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

export function ChurnRadar({
  vips,
  liveShoppers,
  ghostVisitors,
  config,
  branchCode,
  canEdit = false,
}: {
  vips: VipCustomer[];
  liveShoppers: LiveShopper[];
  ghostVisitors: GhostVisitor[];
  config: GrowthConfig;
  branchCode?: string | null;
  canEdit?: boolean;
}) {
  const [activeTab, setActiveTab] = useState<"LIVE" | "GHOST" | "VIP">("LIVE");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());

  // Sub-filter states
  const [vipRiskFilter, setVipRiskFilter] = useState<"ALL" | "HIGH" | "MEDIUM" | "SAFE">("ALL");
  const [liveStatusFilter, setLiveStatusFilter] = useState<"ALL" | "STUCK" | "ACTIVE">("ALL");

  // Modals state
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [showOfferModal, setShowOfferModal] = useState(false);
  const [singleTarget, setSingleTarget] = useState<{ id: string; name: string } | null>(null);
  const [showInfoModal, setShowInfoModal] = useState(false);

  // Summary KPI Calculations
  const totalLiveCartValue = liveShoppers.reduce((sum, s) => sum + s.totalValue, 0);
  const totalLiveItems = liveShoppers.reduce((sum, s) => sum + s.itemCount, 0);
  const stuckLiveCount = liveShoppers.filter((s) => s.isStuck).length;

  const highRiskVipCount = vips.filter((v) => v.riskLevel === "HIGH").length;
  const medRiskVipCount = vips.filter((v) => v.riskLevel === "MEDIUM").length;
  const safeVipCount = vips.filter((v) => v.riskLevel === "SAFE").length;
  const totalVipSpend = vips.reduce((sum, v) => sum + v.totalSpent, 0);

  // Search filtering
  const q = searchQuery.toLowerCase().trim();

  const filteredLive = liveShoppers.filter((s) => {
    const matchesQuery = !q || s.userName.toLowerCase().includes(q) || s.phone.includes(q);
    if (!matchesQuery) return false;
    if (liveStatusFilter === "STUCK") return s.isStuck;
    if (liveStatusFilter === "ACTIVE") return !s.isStuck;
    return true;
  });

  const filteredGhost = ghostVisitors.filter(
    (g) => !q || g.userName.toLowerCase().includes(q) || g.phone.includes(q)
  );

  const filteredVips = vips.filter((v) => {
    const matchesQuery = !q || v.name.toLowerCase().includes(q) || v.phone.includes(q);
    if (!matchesQuery) return false;
    if (vipRiskFilter !== "ALL" && v.riskLevel !== vipRiskFilter) return false;
    return true;
  });

  // Current active list for select-all
  const currentTabIds =
    activeTab === "LIVE"
      ? filteredLive.map((s) => s.userId)
      : activeTab === "GHOST"
      ? filteredGhost.map((g) => g.userId)
      : filteredVips.map((v) => v.id);

  const isAllCurrentSelected =
    currentTabIds.length > 0 && currentTabIds.every((id) => selectedUserIds.has(id));

  function handleToggleAll() {
    setSelectedUserIds((prev) => {
      const next = new Set(prev);
      if (isAllCurrentSelected) {
        currentTabIds.forEach((id) => next.delete(id));
      } else {
        currentTabIds.forEach((id) => next.add(id));
      }
      return next;
    });
  }

  function handleToggleRow(id: string) {
    setSelectedUserIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleOpenSingleOffer(c: { id: string; name: string }) {
    setSingleTarget(c);
    setShowOfferModal(true);
  }

  function handleOpenBulkOffer() {
    if (selectedUserIds.size === 0) return;
    setSingleTarget(null);
    setShowOfferModal(true);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, position: "relative" }}>
      {/* 1. Header Command Bar */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 16,
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <h1
              style={{
                fontSize: 26,
                fontWeight: 900,
                color: "var(--text-primary)",
                margin: 0,
                letterSpacing: "-0.5px",
                display: "flex",
                alignItems: "center",
                gap: 10,
              }}
            >
              Growth Radar
              <span
                style={{
                  display: "inline-block",
                  width: 9,
                  height: 9,
                  borderRadius: "50%",
                  background: "var(--success)",
                  boxShadow: "0 0 10px var(--success)",
                }}
              />
            </h1>

            {/* Info Trigger */}
            <button
              type="button"
              onClick={() => setShowInfoModal(true)}
              style={{
                background: "rgba(255, 255, 255, 0.05)",
                border: "1px solid var(--border)",
                borderRadius: "50%",
                width: 26,
                height: 26,
                color: "var(--text-secondary)",
                fontSize: 13,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "all 0.15s ease",
              }}
              title="Click for Growth Radar Guide"
            >
              ℹ
            </button>
          </div>

          <div
            style={{
              fontSize: 13,
              fontWeight: 500,
              color: "var(--text-secondary)",
              marginTop: 4,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span>Store: <strong style={{ color: "var(--text-primary)" }}>{branchCode || "HQ (All Stores)"}</strong></span>
            <span>·</span>
            <span>Category: <strong style={{ color: "var(--text-primary)" }}>{config.businessType || "General Retail"}</strong></span>
            <span>·</span>
            <span>Cycle: <strong style={{ color: "var(--text-primary)" }}>{config.expectedCycleDays || 15} days</strong></span>
          </div>
        </div>

        {/* AI Config Gear Button */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {canEdit && (
            <button
              type="button"
              onClick={() => setShowConfigModal(true)}
              style={{
                padding: "9px 16px",
                borderRadius: 12,
                border: "1px solid var(--border)",
                background: "var(--card-bg)",
                color: "var(--text-primary)",
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 8,
                boxShadow: "0 2px 6px rgba(0, 0, 0, 0.2)",
                transition: "all 0.15s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "var(--border-hover)";
                e.currentTarget.style.transform = "translateY(-1px)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "var(--border)";
                e.currentTarget.style.transform = "translateY(0)";
              }}
            >
              <span>⚙️</span>
              <span>AI Growth Rules</span>
              <span
                style={{
                  padding: "2px 6px",
                  borderRadius: 6,
                  background: "rgba(0, 210, 106, 0.12)",
                  color: "var(--success)",
                  fontSize: 11,
                  fontWeight: 800,
                }}
              >
                VIP ≥ ₹{(config.vipThreshold || 1000).toLocaleString("en-IN")}
              </span>
            </button>
          )}
        </div>
      </div>

      {/* 2. Interactive Executive KPI Summary Cards (Clickable to switch tabs) */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: 16,
        }}
      >
        {/* KPI 1: Live Shoppers */}
        <div
          onClick={() => {
            setActiveTab("LIVE");
            setSelectedUserIds(new Set());
          }}
          style={{
            padding: "18px 20px",
            borderRadius: 16,
            background: "var(--card-bg)",
            border: activeTab === "LIVE" ? "2px solid var(--success)" : "1px solid var(--border)",
            cursor: "pointer",
            boxShadow: activeTab === "LIVE" ? "0 4px 20px rgba(0, 210, 106, 0.12)" : "0 2px 8px rgba(0,0,0,0.1)",
            transition: "all 0.2s ease",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
          }}
        >
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 6 }}>
                <span>🟢</span> Live In-Store Footfall
              </span>
              {stuckLiveCount > 0 && (
                <span
                  style={{
                    padding: "2px 8px",
                    borderRadius: 12,
                    background: "rgba(239, 68, 68, 0.15)",
                    color: "var(--danger)",
                    fontSize: 11,
                    fontWeight: 800,
                  }}
                >
                  ⚠️ {stuckLiveCount} Stuck (2h+)
                </span>
              )}
            </div>
            <div style={{ fontSize: 32, fontWeight: 900, color: "var(--success)" }}>
              {liveShoppers.length}
            </div>
          </div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 10, display: "flex", justifyContent: "space-between" }}>
            <span>Cart Items: <strong>{totalLiveItems}</strong></span>
            <span>Value: <strong style={{ color: "var(--text-primary)" }}>₹{totalLiveCartValue.toFixed(0)}</strong></span>
          </div>
        </div>

        {/* KPI 2: Ghost Visitors */}
        <div
          onClick={() => {
            setActiveTab("GHOST");
            setSelectedUserIds(new Set());
          }}
          style={{
            padding: "18px 20px",
            borderRadius: 16,
            background: "var(--card-bg)",
            border: activeTab === "GHOST" ? "2px solid var(--accent-orange)" : "1px solid var(--border)",
            cursor: "pointer",
            boxShadow: activeTab === "GHOST" ? "0 4px 20px rgba(255, 109, 0, 0.12)" : "0 2px 8px rgba(0,0,0,0.1)",
            transition: "all 0.2s ease",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
          }}
        >
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 6 }}>
                <span>👻</span> Ghost Visitors (Leakage)
              </span>
              <span
                style={{
                  padding: "2px 8px",
                  borderRadius: 12,
                  background: "rgba(255, 109, 0, 0.15)",
                  color: "var(--accent-orange)",
                  fontSize: 11,
                  fontWeight: 800,
                }}
              >
                Conversion Target
              </span>
            </div>
            <div style={{ fontSize: 32, fontWeight: 900, color: ghostVisitors.length > 0 ? "var(--accent-orange)" : "var(--text-primary)" }}>
              {ghostVisitors.length}
            </div>
          </div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 10 }}>
            Entered store &gt; 15 mins ago with 0 cart items
          </div>
        </div>

        {/* KPI 3: VIP Customers */}
        <div
          onClick={() => {
            setActiveTab("VIP");
            setSelectedUserIds(new Set());
          }}
          style={{
            padding: "18px 20px",
            borderRadius: 16,
            background: "var(--card-bg)",
            border: activeTab === "VIP" ? "2px solid var(--primary, #00D26A)" : "1px solid var(--border)",
            cursor: "pointer",
            boxShadow: activeTab === "VIP" ? "0 4px 20px rgba(0, 210, 106, 0.12)" : "0 2px 8px rgba(0,0,0,0.1)",
            transition: "all 0.2s ease",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
          }}
        >
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 6 }}>
                <span>👑</span> VIP Churn Radar
              </span>
              {highRiskVipCount > 0 && (
                <span
                  style={{
                    padding: "2px 8px",
                    borderRadius: 12,
                    background: "rgba(239, 68, 68, 0.15)",
                    color: "var(--danger)",
                    fontSize: 11,
                    fontWeight: 800,
                  }}
                >
                  🚨 {highRiskVipCount} High Risk
                </span>
              )}
            </div>
            <div style={{ fontSize: 32, fontWeight: 900, color: "var(--text-primary)" }}>
              {vips.length}{" "}
              <span style={{ fontSize: 16, fontWeight: 500, color: "var(--text-secondary)" }}>VIPs</span>
            </div>
          </div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 10, display: "flex", justifyContent: "space-between" }}>
            <span>Lifetime: <strong style={{ color: "var(--success)" }}>₹{totalVipSpend.toLocaleString("en-IN")}</strong></span>
            <span>At Risk: <strong style={{ color: "var(--danger)" }}>{highRiskVipCount + medRiskVipCount}</strong></span>
          </div>
        </div>
      </div>

      {/* 3. Controls & Filter Bar */}
      <div
        style={{
          background: "var(--card-bg)",
          borderRadius: 16,
          border: "1px solid var(--border)",
          padding: "12px 18px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        {/* Left: Tab Switcher */}
        <div style={{ display: "flex", gap: 6, background: "var(--scaffold-bg)", padding: 4, borderRadius: 12, border: "1px solid var(--border)" }}>
          <button
            type="button"
            onClick={() => {
              setActiveTab("LIVE");
              setSelectedUserIds(new Set());
            }}
            style={{
              padding: "8px 16px",
              borderRadius: 8,
              border: "none",
              background: activeTab === "LIVE" ? "var(--card-bg)" : "transparent",
              color: activeTab === "LIVE" ? "var(--success)" : "var(--text-secondary)",
              fontSize: 13,
              fontWeight: 800,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 8,
              boxShadow: activeTab === "LIVE" ? "0 2px 6px rgba(0,0,0,0.2)" : "none",
            }}
          >
            <span>🟢 Live Shoppers</span>
            <span style={{ padding: "1px 6px", borderRadius: 8, background: "rgba(0,210,106,0.15)", fontSize: 11 }}>
              {liveShoppers.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab("GHOST");
              setSelectedUserIds(new Set());
            }}
            style={{
              padding: "8px 16px",
              borderRadius: 8,
              border: "none",
              background: activeTab === "GHOST" ? "var(--card-bg)" : "transparent",
              color: activeTab === "GHOST" ? "var(--accent-orange)" : "var(--text-secondary)",
              fontSize: 13,
              fontWeight: 800,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 8,
              boxShadow: activeTab === "GHOST" ? "0 2px 6px rgba(0,0,0,0.2)" : "none",
            }}
          >
            <span>👻 Ghost Visitors</span>
            <span style={{ padding: "1px 6px", borderRadius: 8, background: "rgba(255,109,0,0.15)", fontSize: 11 }}>
              {ghostVisitors.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab("VIP");
              setSelectedUserIds(new Set());
            }}
            style={{
              padding: "8px 16px",
              borderRadius: 8,
              border: "none",
              background: activeTab === "VIP" ? "var(--card-bg)" : "transparent",
              color: activeTab === "VIP" ? "var(--text-primary)" : "var(--text-secondary)",
              fontSize: 13,
              fontWeight: 800,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 8,
              boxShadow: activeTab === "VIP" ? "0 2px 6px rgba(0,0,0,0.2)" : "none",
            }}
          >
            <span>👑 VIP Churn</span>
            <span style={{ padding: "1px 6px", borderRadius: 8, background: "rgba(255,255,255,0.1)", fontSize: 11 }}>
              {vips.length}
            </span>
          </button>
        </div>

        {/* Right: Search & Actions */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          {/* Sub-filters depending on Tab */}
          {activeTab === "VIP" && (
            <div style={{ display: "flex", gap: 4 }}>
              {(["ALL", "HIGH", "MEDIUM", "SAFE"] as const).map((lvl) => (
                <button
                  key={lvl}
                  type="button"
                  onClick={() => setVipRiskFilter(lvl)}
                  style={{
                    padding: "6px 10px",
                    borderRadius: 6,
                    border: "1px solid",
                    borderColor: vipRiskFilter === lvl ? "var(--primary, #00D26A)" : "var(--border)",
                    background: vipRiskFilter === lvl ? "rgba(0, 210, 106, 0.1)" : "transparent",
                    color: vipRiskFilter === lvl ? "var(--text-primary)" : "var(--text-secondary)",
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  {lvl}
                </button>
              ))}
            </div>
          )}

          {activeTab === "LIVE" && (
            <div style={{ display: "flex", gap: 4 }}>
              {(["ALL", "STUCK", "ACTIVE"] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setLiveStatusFilter(st)}
                  style={{
                    padding: "6px 10px",
                    borderRadius: 6,
                    border: "1px solid",
                    borderColor: liveStatusFilter === st ? "var(--primary, #00D26A)" : "var(--border)",
                    background: liveStatusFilter === st ? "rgba(0, 210, 106, 0.1)" : "transparent",
                    color: liveStatusFilter === st ? "var(--text-primary)" : "var(--text-secondary)",
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  {st === "STUCK" ? "⚠️ Stuck (2h+)" : st}
                </button>
              ))}
            </div>
          )}

          {/* Search Bar */}
          <div style={{ position: "relative", width: 220 }}>
            <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-secondary)", fontSize: 13 }}>
              🔍
            </span>
            <input
              type="text"
              placeholder="Search by name/phone..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: "100%",
                padding: "8px 12px 8px 32px",
                borderRadius: 8,
                border: "1px solid var(--border)",
                background: "var(--scaffold-bg)",
                color: "var(--text-primary)",
                fontSize: 12,
                outline: "none",
                boxSizing: "border-box",
              }}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                style={{
                  position: "absolute",
                  right: 8,
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "transparent",
                  border: "none",
                  color: "var(--text-secondary)",
                  cursor: "pointer",
                  fontSize: 12,
                }}
              >
                ✕
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 4. Main Tables Container */}
      <div
        style={{
          background: "var(--card-bg)",
          borderRadius: 16,
          border: "1px solid var(--border)",
          overflow: "hidden",
          boxShadow: "0 4px 20px rgba(0, 0, 0, 0.15)",
        }}
      >
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
            <thead>
              <tr
                style={{
                  background: "rgba(255, 255, 255, 0.02)",
                  borderBottom: "1px solid var(--border)",
                }}
              >
                {/* Header Checkbox */}
                <th style={{ width: 44, padding: "14px 16px", textAlign: "center" }}>
                  <input
                    type="checkbox"
                    checked={isAllCurrentSelected}
                    onChange={handleToggleAll}
                    style={{ width: 16, height: 16, cursor: "pointer", accentColor: "var(--success)" }}
                  />
                </th>

                {activeTab === "LIVE" && (
                  <>
                    <th style={{ padding: "14px 16px", fontSize: 11, fontWeight: 800, color: "var(--text-secondary)", letterSpacing: 0.5 }}>
                      CUSTOMER
                    </th>
                    <th style={{ padding: "14px 16px", fontSize: 11, fontWeight: 800, color: "var(--text-secondary)", letterSpacing: 0.5 }}>
                      ITEMS IN CART
                    </th>
                    <th style={{ padding: "14px 16px", fontSize: 11, fontWeight: 800, color: "var(--text-secondary)", letterSpacing: 0.5 }}>
                      TIME ACTIVE
                    </th>
                    <th style={{ padding: "14px 16px", fontSize: 11, fontWeight: 800, color: "var(--text-secondary)", letterSpacing: 0.5 }}>
                      STATUS
                    </th>
                    <th style={{ padding: "14px 16px", fontSize: 11, fontWeight: 800, color: "var(--text-secondary)", letterSpacing: 0.5, textAlign: "right" }}>
                      ACTION
                    </th>
                  </>
                )}

                {activeTab === "GHOST" && (
                  <>
                    <th style={{ padding: "14px 16px", fontSize: 11, fontWeight: 800, color: "var(--text-secondary)", letterSpacing: 0.5 }}>
                      CUSTOMER
                    </th>
                    <th style={{ padding: "14px 16px", fontSize: 11, fontWeight: 800, color: "var(--text-secondary)", letterSpacing: 0.5 }}>
                      SCANNED AT
                    </th>
                    <th style={{ padding: "14px 16px", fontSize: 11, fontWeight: 800, color: "var(--text-secondary)", letterSpacing: 0.5 }}>
                      TIME IN STORE
                    </th>
                    <th style={{ padding: "14px 16px", fontSize: 11, fontWeight: 800, color: "var(--text-secondary)", letterSpacing: 0.5 }}>
                      STATUS
                    </th>
                    <th style={{ padding: "14px 16px", fontSize: 11, fontWeight: 800, color: "var(--text-secondary)", letterSpacing: 0.5, textAlign: "right" }}>
                      ACTION
                    </th>
                  </>
                )}

                {activeTab === "VIP" && (
                  <>
                    <th style={{ padding: "14px 16px", fontSize: 11, fontWeight: 800, color: "var(--text-secondary)", letterSpacing: 0.5 }}>
                      VIP CUSTOMER
                    </th>
                    <th style={{ padding: "14px 16px", fontSize: 11, fontWeight: 800, color: "var(--text-secondary)", letterSpacing: 0.5 }}>
                      LIFETIME SPEND
                    </th>
                    <th style={{ padding: "14px 16px", fontSize: 11, fontWeight: 800, color: "var(--text-secondary)", letterSpacing: 0.5 }}>
                      CHURN RISK SCORE
                    </th>
                    <th style={{ padding: "14px 16px", fontSize: 11, fontWeight: 800, color: "var(--text-secondary)", letterSpacing: 0.5 }}>
                      LAST VISIT
                    </th>
                    <th style={{ padding: "14px 16px", fontSize: 11, fontWeight: 800, color: "var(--text-secondary)", letterSpacing: 0.5, textAlign: "right" }}>
                      ACTION
                    </th>
                  </>
                )}
              </tr>
            </thead>

            <tbody>
              {/* TAB 1: LIVE SHOPPERS */}
              {activeTab === "LIVE" && (
                <>
                  {filteredLive.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ padding: "48px 16px", textAlign: "center", color: "var(--text-secondary)" }}>
                        <div style={{ fontSize: 32, marginBottom: 8 }}>🛒</div>
                        <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)" }}>No Live Shoppers Found</div>
                        <div style={{ fontSize: 12, marginTop: 4 }}>
                          {searchQuery || liveStatusFilter !== "ALL"
                            ? "Try adjusting your filter or search query."
                            : "No customers are currently active in store with items in their cart."}
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredLive.map((shopper) => {
                      const isSelected = selectedUserIds.has(shopper.userId);
                      return (
                        <tr
                          key={shopper.userId}
                          style={{
                            borderBottom: "1px solid var(--border)",
                            background: shopper.isStuck ? "rgba(239, 68, 68, 0.04)" : isSelected ? "rgba(0, 210, 106, 0.04)" : "transparent",
                            transition: "background 0.1s ease",
                          }}
                        >
                          <td style={{ padding: "14px 16px", textAlign: "center" }}>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleToggleRow(shopper.userId)}
                              style={{ width: 16, height: 16, cursor: "pointer", accentColor: "var(--success)" }}
                            />
                          </td>

                          {/* Customer with Avatar */}
                          <td style={{ padding: "14px 16px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                              <div
                                style={{
                                  width: 36,
                                  height: 36,
                                  borderRadius: 10,
                                  background: "rgba(0, 210, 106, 0.12)",
                                  color: "var(--success)",
                                  fontWeight: 800,
                                  fontSize: 13,
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  border: "1px solid rgba(0, 210, 106, 0.25)",
                                }}
                              >
                                {getInitials(shopper.userName)}
                              </div>
                              <div>
                                <div style={{ fontWeight: 700, color: "var(--text-primary)", fontSize: 14 }}>
                                  {shopper.userName}
                                </div>
                                {shopper.phone && shopper.phone !== "N/A" && (
                                  <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
                                    {shopper.phone}
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>

                          {/* Items in Cart */}
                          <td style={{ padding: "14px 16px" }}>
                            <div style={{ color: "var(--success)", fontWeight: 900, fontSize: 14 }}>
                              {shopper.itemCount} {shopper.itemCount === 1 ? "item" : "items"}
                            </div>
                            <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
                              ₹{shopper.totalValue.toFixed(0)} est. value
                            </div>
                          </td>

                          {/* Time Active */}
                          <td style={{ padding: "14px 16px", color: "var(--text-secondary)", fontSize: 13, fontWeight: 500 }}>
                            {formatDuration(shopper.minutesActive)}
                          </td>

                          {/* Status */}
                          <td style={{ padding: "14px 16px" }}>
                            {shopper.isStuck ? (
                              <span
                                style={{
                                  padding: "4px 10px",
                                  borderRadius: 20,
                                  background: "rgba(239, 68, 68, 0.12)",
                                  border: "1px solid rgba(239, 68, 68, 0.3)",
                                  color: "var(--danger)",
                                  fontSize: 12,
                                  fontWeight: 800,
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: 4,
                                }}
                              >
                                ⚠️ Stuck (2h+)
                              </span>
                            ) : (
                              <span
                                style={{
                                  padding: "4px 10px",
                                  borderRadius: 20,
                                  background: "rgba(0, 210, 106, 0.12)",
                                  border: "1px solid rgba(0, 210, 106, 0.3)",
                                  color: "var(--success)",
                                  fontSize: 12,
                                  fontWeight: 800,
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: 4,
                                }}
                              >
                                🛒 Active Browsing
                              </span>
                            )}
                          </td>

                          {/* Action */}
                          <td style={{ padding: "14px 16px", textAlign: "right" }}>
                            {canEdit && (
                              <button
                                type="button"
                                onClick={() => handleOpenSingleOffer({ id: shopper.userId, name: shopper.userName })}
                                style={{
                                  padding: "6px 14px",
                                  borderRadius: 8,
                                  border: "1px solid var(--border)",
                                  background: "var(--scaffold-bg)",
                                  color: "var(--success)",
                                  fontSize: 12,
                                  fontWeight: 800,
                                  cursor: "pointer",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: 4,
                                  transition: "all 0.15s ease",
                                }}
                                onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--success)")}
                                onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
                              >
                                ⚡ Send Offer
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </>
              )}

              {/* TAB 2: GHOST VISITORS */}
              {activeTab === "GHOST" && (
                <>
                  {filteredGhost.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ padding: "48px 16px", textAlign: "center", color: "var(--text-secondary)" }}>
                        <div style={{ fontSize: 32, marginBottom: 8 }}>👻</div>
                        <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)" }}>No Ghost Visitors Detected</div>
                        <div style={{ fontSize: 12, marginTop: 4 }}>
                          All scanned visitors currently inside your store have added products to their cart.
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredGhost.map((ghost) => {
                      const isSelected = selectedUserIds.has(ghost.userId);
                      return (
                        <tr
                          key={ghost.userId}
                          style={{
                            borderBottom: "1px solid var(--border)",
                            background: isSelected ? "rgba(255, 109, 0, 0.04)" : "transparent",
                            transition: "background 0.1s ease",
                          }}
                        >
                          <td style={{ padding: "14px 16px", textAlign: "center" }}>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleToggleRow(ghost.userId)}
                              style={{ width: 16, height: 16, cursor: "pointer", accentColor: "var(--accent-orange)" }}
                            />
                          </td>

                          {/* Customer with Avatar */}
                          <td style={{ padding: "14px 16px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                              <div
                                style={{
                                  width: 36,
                                  height: 36,
                                  borderRadius: 10,
                                  background: "rgba(255, 109, 0, 0.12)",
                                  color: "var(--accent-orange)",
                                  fontWeight: 800,
                                  fontSize: 13,
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  border: "1px solid rgba(255, 109, 0, 0.25)",
                                }}
                              >
                                {getInitials(ghost.userName)}
                              </div>
                              <div>
                                <div style={{ fontWeight: 700, color: "var(--text-primary)", fontSize: 14 }}>
                                  {ghost.userName}
                                </div>
                                {ghost.phone && ghost.phone !== "N/A" && (
                                  <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
                                    {ghost.phone}
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>

                          {/* Scanned At */}
                          <td style={{ padding: "14px 16px", color: "var(--text-secondary)", fontSize: 13, fontWeight: 500 }}>
                            {formatTime(ghost.activeSinceMs)}
                          </td>

                          {/* Time In Store */}
                          <td style={{ padding: "14px 16px" }}>
                            <span style={{ color: "var(--accent-orange)", fontWeight: 800, fontSize: 13 }}>
                              {ghost.minutesInStore}m without adding items
                            </span>
                          </td>

                          {/* Status */}
                          <td style={{ padding: "14px 16px" }}>
                            <span
                              style={{
                                padding: "4px 10px",
                                borderRadius: 20,
                                background: "rgba(255, 109, 0, 0.12)",
                                border: "1px solid rgba(255, 109, 0, 0.3)",
                                color: "var(--accent-orange)",
                                fontSize: 12,
                                fontWeight: 800,
                              }}
                            >
                              👻 0 Items in Cart
                            </span>
                          </td>

                          {/* Action */}
                          <td style={{ padding: "14px 16px", textAlign: "right" }}>
                            {canEdit && (
                              <button
                                type="button"
                                onClick={() => handleOpenSingleOffer({ id: ghost.userId, name: ghost.userName })}
                                style={{
                                  padding: "6px 14px",
                                  borderRadius: 8,
                                  border: "1px solid var(--border)",
                                  background: "var(--scaffold-bg)",
                                  color: "var(--accent-orange)",
                                  fontSize: 12,
                                  fontWeight: 800,
                                  cursor: "pointer",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: 4,
                                  transition: "all 0.15s ease",
                                }}
                                onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--accent-orange)")}
                                onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
                              >
                                ⚡ Nudge with Offer
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </>
              )}

              {/* TAB 3: VIP CUSTOMERS */}
              {activeTab === "VIP" && (
                <>
                  {filteredVips.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ padding: "48px 16px", textAlign: "center", color: "var(--text-secondary)" }}>
                        <div style={{ fontSize: 32, marginBottom: 8 }}>👑</div>
                        <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)" }}>No VIP Customers Found</div>
                        <div style={{ fontSize: 12, marginTop: 4 }}>
                          {searchQuery || vipRiskFilter !== "ALL"
                            ? "Try adjusting your risk filter or search query."
                            : `No customers have reached the VIP threshold (₹${(config.vipThreshold || 1000).toLocaleString("en-IN")}) yet.`}
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredVips.map((vip) => {
                      const isSelected = selectedUserIds.has(vip.id);
                      const isAtRisk = vip.riskLevel === "HIGH" || vip.riskLevel === "MEDIUM";

                      const riskColor =
                        vip.riskLevel === "HIGH"
                          ? "var(--danger)"
                          : vip.riskLevel === "MEDIUM"
                          ? "var(--accent-orange)"
                          : "var(--success)";

                      const riskProgress =
                        vip.riskLevel === "HIGH" ? 90 : vip.riskLevel === "MEDIUM" ? 60 : 25;

                      return (
                        <tr
                          key={vip.id}
                          style={{
                            borderBottom: "1px solid var(--border)",
                            background:
                              vip.riskLevel === "HIGH"
                                ? "rgba(239, 68, 68, 0.04)"
                                : isSelected
                                ? "rgba(0, 210, 106, 0.04)"
                                : "transparent",
                            transition: "background 0.1s ease",
                          }}
                        >
                          <td style={{ padding: "14px 16px", textAlign: "center" }}>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleToggleRow(vip.id)}
                              style={{ width: 16, height: 16, cursor: "pointer", accentColor: "var(--success)" }}
                            />
                          </td>

                          {/* Customer with VIP Badge Avatar */}
                          <td style={{ padding: "14px 16px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                              <div
                                style={{
                                  width: 36,
                                  height: 36,
                                  borderRadius: 10,
                                  background: "rgba(255, 255, 255, 0.08)",
                                  color: "var(--text-primary)",
                                  fontWeight: 900,
                                  fontSize: 13,
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  border: `1px solid ${riskColor}55`,
                                }}
                              >
                                {getInitials(vip.name)}
                              </div>
                              <div>
                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                  <span style={{ fontWeight: 800, color: "var(--text-primary)", fontSize: 14 }}>
                                    {vip.name}
                                  </span>
                                  {vip.riskLevel === "HIGH" && (
                                    <span
                                      style={{
                                        fontSize: 10,
                                        fontWeight: 800,
                                        padding: "2px 8px",
                                        borderRadius: 12,
                                        display: "inline-flex",
                                        alignItems: "center",
                                        gap: 4,
                                        background:
                                          vip.latestWinbackStatus === "TRIGGERED"
                                            ? "rgba(139, 92, 246, 0.15)"
                                            : vip.latestWinbackStatus === "SKIPPED_COOLDOWN"
                                            ? "rgba(245, 158, 11, 0.15)"
                                            : "rgba(255, 255, 255, 0.05)",
                                        border:
                                          vip.latestWinbackStatus === "TRIGGERED"
                                            ? "1px solid rgba(139, 92, 246, 0.35)"
                                            : vip.latestWinbackStatus === "SKIPPED_COOLDOWN"
                                            ? "1px solid rgba(245, 158, 11, 0.35)"
                                            : "1px solid rgba(255, 255, 255, 0.1)",
                                        color:
                                          vip.latestWinbackStatus === "TRIGGERED"
                                            ? "#c084fc"
                                            : vip.latestWinbackStatus === "SKIPPED_COOLDOWN"
                                            ? "#fbbf24"
                                            : "var(--text-secondary)",
                                      }}
                                    >
                                      {vip.latestWinbackStatus === "TRIGGERED"
                                        ? "⚡ Triggered"
                                        : vip.latestWinbackStatus === "SKIPPED_COOLDOWN"
                                        ? "⏳ Cooldown"
                                        : "None"}
                                    </span>
                                  )}
                                </div>
                                <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
                                  {vip.phone} · Branch {vip.branchCode}
                                </div>
                              </div>
                            </div>
                          </td>

                          {/* Lifetime Spend & Visits */}
                          <td style={{ padding: "14px 16px" }}>
                            <div style={{ color: "var(--success)", fontWeight: 900, fontSize: 14 }}>
                              ₹{vip.totalSpent.toLocaleString("en-IN")}
                            </div>
                            <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>
                              {vip.totalVisits} {vip.totalVisits === 1 ? "visit" : "visits"}
                            </div>
                          </td>

                          {/* Churn Risk Meter */}
                          <td style={{ padding: "14px 16px", minWidth: 140 }}>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                              <span
                                style={{
                                  padding: "2px 6px",
                                  borderRadius: 6,
                                  background: `${riskColor}22`,
                                  color: riskColor,
                                  fontSize: 10,
                                  fontWeight: 900,
                                  letterSpacing: 0.5,
                                }}
                              >
                                {vip.riskLevel} RISK
                              </span>
                              <span style={{ fontSize: 10, color: "var(--text-secondary)", fontWeight: 700 }}>
                                {riskProgress}%
                              </span>
                            </div>
                            <div
                              style={{
                                width: "100%",
                                height: 4,
                                borderRadius: 2,
                                background: "rgba(255, 255, 255, 0.08)",
                                overflow: "hidden",
                              }}
                            >
                              <div
                                style={{
                                  width: `${riskProgress}%`,
                                  height: "100%",
                                  background: riskColor,
                                  borderRadius: 2,
                                }}
                              />
                            </div>
                          </td>

                          {/* Last Visit */}
                          <td style={{ padding: "14px 16px", color: "var(--text-secondary)", fontSize: 13 }}>
                            {formatDate(vip.lastVisitMs)}
                          </td>

                          {/* Action */}
                          <td style={{ padding: "14px 16px", textAlign: "right" }}>
                            {canEdit && (
                              <>
                                {isAtRisk ? (
                                  <button
                                    type="button"
                                    onClick={() => handleOpenSingleOffer({ id: vip.id, name: vip.name })}
                                    style={{
                                      padding: "6px 14px",
                                      borderRadius: 8,
                                      border: `1px solid ${riskColor}66`,
                                      background: `${riskColor}12`,
                                      color: riskColor,
                                      fontSize: 12,
                                      fontWeight: 800,
                                      cursor: "pointer",
                                      display: "inline-flex",
                                      alignItems: "center",
                                      gap: 4,
                                      transition: "all 0.15s ease",
                                    }}
                                    onMouseEnter={(e) => (e.currentTarget.style.borderColor = riskColor)}
                                    onMouseLeave={(e) => (e.currentTarget.style.borderColor = `${riskColor}66`)}
                                  >
                                    ⚡ Winback
                                  </button>
                                ) : (
                                  <span
                                    title="Customer is SAFE. No winback offer needed."
                                    style={{
                                      padding: "4px 8px",
                                      borderRadius: 6,
                                      background: "rgba(255, 255, 255, 0.04)",
                                      fontSize: 12,
                                      color: "var(--text-secondary)",
                                      cursor: "not-allowed",
                                      opacity: 0.6,
                                    }}
                                  >
                                    🔒 Safe
                                  </span>
                                )}
                              </>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 5. Floating Bottom Batch Selection Toolbar (Appears when items are selected) */}
      {selectedUserIds.size > 0 && canEdit && (
        <div
          style={{
            position: "fixed",
            bottom: 24,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 900,
            background: "var(--card-bg)",
            border: "1px solid var(--border-hover)",
            borderRadius: 16,
            padding: "10px 20px",
            display: "flex",
            alignItems: "center",
            gap: 16,
            boxShadow: "0 10px 30px rgba(0, 0, 0, 0.6)",
            backdropFilter: "blur(12px)",
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>
            <span style={{ color: "var(--success)" }}>{selectedUserIds.size}</span> customers selected
          </div>

          <button
            type="button"
            onClick={handleToggleAll}
            style={{
              background: "transparent",
              border: "1px solid var(--border)",
              color: "var(--text-secondary)",
              padding: "6px 12px",
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {isAllCurrentSelected ? "Deselect Tab" : "Select All Tab"}
          </button>

          <button
            type="button"
            onClick={() => setSelectedUserIds(new Set())}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--text-secondary)",
              fontSize: 12,
              cursor: "pointer",
              textDecoration: "underline",
            }}
          >
            Clear
          </button>

          <button
            type="button"
            onClick={handleOpenBulkOffer}
            style={{
              padding: "8px 20px",
              borderRadius: 10,
              border: "none",
              background: "var(--cta-bg)",
              color: "var(--cta-text)",
              fontSize: 13,
              fontWeight: 900,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 8,
              boxShadow: "0 4px 14px rgba(0, 210, 106, 0.35)",
            }}
          >
            <span>📢</span>
            <span>Send Offer ({selectedUserIds.size}) 🚀</span>
          </button>
        </div>
      )}

      {/* 6. Growth Radar Info Modal */}
      {showInfoModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            background: "rgba(0,0,0,0.75)",
            backdropFilter: "blur(6px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowInfoModal(false);
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 500,
              background: "var(--card-bg)",
              borderRadius: 16,
              border: "1px solid var(--border)",
              padding: 24,
              boxShadow: "0 25px 50px rgba(0,0,0,0.6)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0, color: "var(--text-primary)" }}>
                Growth Radar & AI Churn Intelligence
              </h2>
              <button
                type="button"
                onClick={() => setShowInfoModal(false)}
                style={{ background: "transparent", border: "none", color: "var(--text-secondary)", fontSize: 18, cursor: "pointer" }}
              >
                ✕
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 14, fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.6 }}>
              <div>
                <strong style={{ color: "var(--success)", display: "block", marginBottom: 2 }}>
                  🟢 Live Shoppers
                </strong>
                Customers physically in your store who scanned the ClickOut QR and are scanning items right now.
                If they remain active for more than 2 hours without completing checkout, they are marked as <em>Stuck (2h+)</em>.
              </div>

              <div>
                <strong style={{ color: "var(--accent-orange)", display: "block", marginBottom: 2 }}>
                  👻 Ghost Visitors
                </strong>
                Shoppers who entered the store, scanned in, but added 0 products to their cart after 15+ minutes.
                Send them a live in-store nudge coupon to convert hesitation into a sale.
              </div>

              <div>
                <strong style={{ color: "var(--danger)", display: "block", marginBottom: 2 }}>
                  👑 VIP Customers & Churn Radar
                </strong>
                Your highest-spending loyal shoppers based on the AI Spend Threshold (e.g. ₹1,000+).
                The AI automatically predicts when their repeat cycle is overdue and triggers Medium or High risk alerts so you can send winback vouchers before they defect to competitors.
              </div>
            </div>

            <div style={{ marginTop: 20, textAlign: "right" }}>
              <button
                type="button"
                onClick={() => setShowInfoModal(false)}
                style={{
                  padding: "8px 18px",
                  borderRadius: 8,
                  border: "none",
                  background: "var(--cta-bg)",
                  color: "var(--cta-text)",
                  fontWeight: 800,
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                Got It ✓
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 7. Setup & Offer Modals */}
      {showConfigModal && (
        <AiGrowthSetupModal
          config={config}
          branchCode={branchCode}
          onClose={() => setShowConfigModal(false)}
        />
      )}

      {showOfferModal && (
        <SendOfferModal
          targetCustomer={singleTarget}
          bulkUserIds={singleTarget ? undefined : Array.from(selectedUserIds)}
          branchCode={branchCode}
          onClose={() => {
            setShowOfferModal(false);
            setSingleTarget(null);
          }}
          onSuccess={() => {
            setSelectedUserIds(new Set());
          }}
        />
      )}
    </div>
  );
}