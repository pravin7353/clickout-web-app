import Link from "next/link";
import { requireRole } from "@/lib/rbac";
import { getStores } from "@/lib/services/store-service";
import { getTenantMetrics } from "@/lib/services/tenant-metrics-service";
import { getTenantById } from "@/lib/services/tenant-service";
import { getTenantOnboardingStatus } from "@/actions/tenant-onboarding";
import { CreateStoreForm } from "@/components/create-store-form";
import { TenantOnboardingForm } from "@/components/tenant-onboarding-form";
import { StoreTable } from "@/components/store-table";
import { Card, Badge, PageHeader } from "@/components/ui";

export default async function TenantAdminPage({
  searchParams,
}: {
  searchParams?: Promise<{ page?: string }>;
}) {
  const { role, tenantId } = await requireRole(["super_admin", "tenant_admin"]);
  const { page: pageParam } = (await searchParams) || {};

  if (role === "tenant_admin") {
    const { isOnboardingComplete } = await getTenantOnboardingStatus(tenantId);
    if (!isOnboardingComplete) return <TenantOnboardingForm />;
  }

  const [stores, tenantProfile] = await Promise.all([
    getStores(role, tenantId),
    tenantId ? getTenantById(tenantId) : null,
  ]);

  const totalStores = stores.length;
  const metrics = await getTenantMetrics(tenantId as string, totalStores);
  const companyName = tenantProfile?.companyName || "Organization HQ";
  const plan = tenantProfile?.subscriptionPlan || "PRO";

  // Pagination (pageSize = 25)
  const pageSize = 25;
  const totalPages = Math.max(1, Math.ceil(totalStores / pageSize));
  const rawPage = parseInt(pageParam || "1", 10);
  const currentPage = isNaN(rawPage) || rawPage < 1 ? 1 : Math.min(rawPage, totalPages);
  const paginatedStores = stores.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  function getPageUrl(targetPage: number) {
    const params = new URLSearchParams();
    if (targetPage > 1) params.set("page", String(targetPage));
    const qs = params.toString();
    return qs ? `/tenant-admin?${qs}` : "/tenant-admin";
  }

  return (
    <div style={{ padding: 24, maxWidth: 1280, margin: "0 auto", display: "grid", gap: 24 }}>
      {/* Top Header Card */}
      <Card style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 26 }}>🏢</span>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0, color: "var(--text-primary)" }}>
                  {companyName}
                </h1>
                <Badge color={plan === "GROWTH" ? "var(--success)" : "var(--primary)"}>
                  {plan} PLAN
                </Badge>
              </div>
              <p style={{ margin: "4px 0 0 0", color: "var(--text-secondary)", fontFamily: "monospace", fontSize: 12 }}>
                TENANT ID: {tenantId} {tenantProfile?.ownerName ? `· Owner: ${tenantProfile.ownerName}` : ""}
              </p>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <Link
            href="/usage"
            style={{
              padding: "8px 16px",
              borderRadius: 8,
              border: "1px solid var(--border)",
              background: "var(--card-bg)",
              color: "var(--text-primary)",
              textDecoration: "none",
              fontSize: 13,
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <span>📊</span> Usage & Plan Matrix
          </Link>
          <CreateStoreForm />
        </div>
      </Card>

      {/* KPI Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
        <MetricCard
          icon="🏬"
          title="Total Stores"
          value={metrics.totalStores}
          subtitle="Active branch locations"
          color="var(--primary)"
        />
        <MetricCard
          icon="👥"
          title="Staff Roster"
          value={metrics.totalStaff}
          subtitle="Cashiers & supervisors"
          color="#a855f7"
        />
        <MetricCard
          icon="🟢"
          title="Active Today"
          value={metrics.activeToday}
          subtitle="Signed in this shift"
          color="var(--success)"
        />
        <MetricCard
          icon="🚨"
          title="24h Critical Alerts"
          value={metrics.pendingAlerts}
          subtitle="Audit & risk flags"
          color={metrics.pendingAlerts > 0 ? "var(--danger)" : "var(--text-secondary)"}
        />
      </div>

      {/* Stores Section */}
      <div style={{ display: "grid", gap: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>
              Physical Store Locations
            </h2>
            <p style={{ margin: "2px 0 0 0", fontSize: 12, color: "var(--text-secondary)" }}>
              Manage retail godowns, print entrance standee QR codes, and supervise local store operations.
            </p>
          </div>
        </div>

        {stores.length === 0 ? (
          <Card style={{ padding: 40, textAlign: "center", color: "var(--text-secondary)" }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>🏬</div>
            <div style={{ fontWeight: 600 }}>No stores deployed yet</div>
            <div style={{ fontSize: 13, marginTop: 4 }}>
              Click &ldquo;+ Add Store&rdquo; above to provision your first retail branch.
            </div>
          </Card>
        ) : (
          <>
            <StoreTable stores={paginatedStores} tenantId={tenantId ?? undefined} />

            {/* Pagination Controls */}
            {totalStores > 0 && (
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: 12,
                  marginTop: 10,
                  padding: "12px 18px",
                  borderRadius: 12,
                  border: "1px solid var(--border)",
                  background: "var(--card-bg)",
                }}
              >
                <div style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 600 }}>
                  Showing{" "}
                  <strong style={{ color: "var(--text-primary)" }}>
                    {(currentPage - 1) * pageSize + 1}
                  </strong>
                  {" "}–{" "}
                  <strong style={{ color: "var(--text-primary)" }}>
                    {Math.min(currentPage * pageSize, totalStores)}
                  </strong>
                  {" "}of{" "}
                  <strong style={{ color: "var(--text-primary)" }}>{totalStores}</strong>
                  {" "}store locations
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {currentPage > 1 ? (
                    <Link
                      href={getPageUrl(currentPage - 1)}
                      style={{
                        padding: "6px 14px",
                        borderRadius: 10,
                        border: "1px solid var(--border)",
                        background: "var(--scaffold-bg)",
                        color: "var(--text-primary)",
                        textDecoration: "none",
                        fontWeight: 700,
                        fontSize: 12,
                      }}
                    >
                      ← Previous
                    </Link>
                  ) : (
                    <span
                      style={{
                        padding: "6px 14px",
                        borderRadius: 10,
                        border: "1px solid var(--border)",
                        background: "transparent",
                        color: "var(--text-secondary)",
                        opacity: 0.35,
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: "not-allowed",
                        userSelect: "none",
                      }}
                    >
                      ← Previous
                    </span>
                  )}

                  <span
                    style={{
                      padding: "4px 12px",
                      fontWeight: 800,
                      color: "var(--text-primary)",
                      fontSize: 12,
                      background: "var(--scaffold-bg)",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                    }}
                  >
                    Page {currentPage} of {totalPages}
                  </span>

                  {currentPage < totalPages ? (
                    <Link
                      href={getPageUrl(currentPage + 1)}
                      style={{
                        padding: "6px 14px",
                        borderRadius: 10,
                        border: "1px solid var(--border)",
                        background: "var(--scaffold-bg)",
                        color: "var(--text-primary)",
                        textDecoration: "none",
                        fontWeight: 700,
                        fontSize: 12,
                      }}
                    >
                      Next →
                    </Link>
                  ) : (
                    <span
                      style={{
                        padding: "6px 14px",
                        borderRadius: 10,
                        border: "1px solid var(--border)",
                        background: "transparent",
                        color: "var(--text-secondary)",
                        opacity: 0.35,
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: "not-allowed",
                        userSelect: "none",
                      }}
                    >
                      Next →
                    </span>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function MetricCard({
  icon,
  title,
  value,
  subtitle,
  color,
}: {
  icon: string;
  title: string;
  value: string | number;
  subtitle: string;
  color?: string;
}) {
  return (
    <Card style={{ display: "grid", gap: 10, padding: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 13, color: "var(--text-secondary)", fontWeight: 600 }}>{title}</span>
        <span style={{ fontSize: 20 }}>{icon}</span>
      </div>
      <div>
        <div style={{ fontSize: 28, fontWeight: 800, color: color || "var(--text-primary)" }}>
          {value}
        </div>
        <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 4 }}>
          {subtitle}
        </div>
      </div>
    </Card>
  );
}