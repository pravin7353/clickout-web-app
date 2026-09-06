import { requireRole, resolveStoreScope } from "@/lib/rbac";
import { getStaffList } from "@/lib/services/staff-service";
import { getStores } from "@/lib/services/store-service";
import { OnboardStaffForm } from "@/components/onboard-staff-form";
import { BulkImportModal } from "@/components/bulk-import-modal";
import { StaffRow } from "@/components/staff-row";
import { Card, EmptyState, InfoTooltip } from "@/components/ui";
import Link from "next/link";

const ROLE_TABS = [
  { label: "ALL", value: "ALL" },
  { label: "CASHIER", value: "CASHIER" },
  { label: "GUARD", value: "GUARD" },
  { label: "MANAGER", value: "MANAGER" },
  { label: "AUDITOR", value: "AUDITOR" },
];

export default async function ManagerPage({
  searchParams,
}: {
  searchParams: Promise<{ store?: string; role?: string }>;
}) {
  const { role, tenantId, storeId, canEdit } = await requireRole(["super_admin", "tenant_admin", "manager"]);
  const { store: queryStore, role: queryRole } = await searchParams;
  const effectiveStoreId = resolveStoreScope(role, storeId, queryStore);
  const activeRoleFilter = (queryRole ?? "ALL").toUpperCase();

  const isManager = role === "manager";
  const [staff, stores] = await Promise.all([
    getStaffList(role, tenantId, effectiveStoreId, activeRoleFilter),
    getStores(role, tenantId),
  ]);

  // Isolation: For a manager, lock strictly to their assigned branch.
  // They must never see or assign staff to other branches or HQ.
  const managerStore = stores.find((s) => s.branchCode === effectiveStoreId);
  const branchOptions = isManager
    ? (managerStore
        ? [{ branchCode: managerStore.branchCode, storeName: managerStore.storeName }]
        : (effectiveStoreId ? [{ branchCode: effectiveStoreId, storeName: effectiveStoreId }] : []))
    : stores.map((s) => ({ branchCode: s.branchCode, storeName: s.storeName }));

  const totalCount = staff.length;
  const activeCount = staff.filter((s) => s.isActive).length;
  const atRiskCount = staff.filter((s) => s.trustScore < 80).length;

  return (
    <div style={{ padding: "24px 28px", display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Top Security Banner matching Flutter */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          background: "color-mix(in srgb, var(--success) 8%, transparent)",
          border: "1px solid color-mix(in srgb, var(--success) 24%, transparent)",
          borderRadius: 10,
          padding: "10px 16px",
        }}
      >
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--success)" }} />
        <span style={{ color: "var(--success)", fontSize: 13, fontWeight: 700, letterSpacing: "0.02em" }}>
          SYSTEM SECURE: No pending operations or fraud anomalies detected.
        </span>
      </div>

      {/* Header Bar: Command Roster & Action Buttons matching Flutter */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          marginTop: 4,
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <h1
              style={{
                fontSize: 26,
                fontWeight: 800,
                color: "var(--text-primary)",
                margin: 0,
                letterSpacing: "-0.02em",
              }}
            >
              Command Roster
            </h1>
            <span style={{ fontSize: 18 }}>🛡️</span>
          </div>
          <p style={{ color: "var(--text-secondary)", fontSize: 13, margin: "4px 0 0 0", fontWeight: 500 }}>
            Total Active Enterprise Staff: <strong style={{ color: "var(--text-primary)" }}>{activeCount}</strong>
            <span style={{ opacity: 0.6, marginLeft: 8 }}>({totalCount} enrolled)</span>
          </p>
        </div>

        {canEdit && (
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <BulkImportModal
              defaultBranchCode={effectiveStoreId ?? undefined}
              isBranchLocked={isManager}
            />
            <OnboardStaffForm
              defaultBranchCode={effectiveStoreId ?? undefined}
              branches={branchOptions}
              isBranchLocked={isManager}
            />
          </div>
        )}
      </div>

      {/* Staff Stats Summary Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16 }}>
        <Card style={{ padding: 16 }}>
          <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 4 }}>Total Staff</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: "var(--text-primary)" }}>{totalCount}</div>
        </Card>
        <Card style={{ padding: 16 }}>
          <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 4 }}>Active Staff</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: "var(--success)" }}>{activeCount}</div>
        </Card>
        <Card style={{ padding: 16 }}>
          <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 4, display: "flex", alignItems: "center" }}>
            At-Risk Staff (&lt;80 Trust)
            <InfoTooltip text="Employees whose trust score dropped below 80 due to gate rejections or leakage discrepancies." />
          </div>
          <div style={{ fontSize: 24, fontWeight: 800, color: atRiskCount > 0 ? "var(--danger)" : "var(--text-primary)" }}>
            {atRiskCount}
          </div>
        </Card>
      </div>

      {/* Category Filter matching Flutter: Filter by Category */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-secondary)" }}>
          Filter by Category:
        </span>
        <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 2 }}>
          {ROLE_TABS.map((tab) => {
            const isActive = activeRoleFilter === tab.value;
            const storeQueryPart = effectiveStoreId ? `store=${effectiveStoreId}&` : "";
            const href = `/manager?${storeQueryPart}role=${tab.value}`;

            return (
              <Link
                key={tab.value}
                href={href}
                style={{
                  padding: "6px 16px",
                  borderRadius: 20,
                  fontSize: 12,
                  fontWeight: 700,
                  textDecoration: "none",
                  transition: "all 0.15s ease",
                  color: isActive ? "var(--cta-text)" : "var(--text-secondary)",
                  background: isActive ? "var(--cta-bg)" : "var(--card-bg)",
                  border: isActive ? "1px solid var(--cta-bg)" : "1px solid var(--border)",
                  boxShadow: isActive ? "0 2px 8px color-mix(in srgb, var(--cta-bg) 25%, transparent)" : "none",
                  whiteSpace: "nowrap",
                }}
              >
                {tab.label}
              </Link>
            );
          })}
        </div>
      </div>

      {/* Staff Table matching Flutter Columns */}
      {staff.length === 0 ? (
        <EmptyState message={`No staff members found under category '${activeRoleFilter}'.`} />
      ) : (
        <Card style={{ padding: 0, overflow: "hidden", borderRadius: 16 }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
              <thead>
                <tr
                  style={{
                    borderBottom: "1px solid var(--border)",
                    textAlign: "left",
                    background: "color-mix(in srgb, var(--card-bg) 94%, var(--scaffold-bg))",
                  }}
                >
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
                {staff.map((s) => (
                  <StaffRow
                    key={s.id}
                    staff={s}
                    canEdit={canEdit}
                    branches={branchOptions}
                    isBranchLocked={isManager}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}