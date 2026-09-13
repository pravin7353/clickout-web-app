import Link from "next/link";
import { requireRole } from "@/lib/rbac";
import { getTenants } from "@/lib/services/tenant-service";
import { OnboardTenantForm } from "@/components/onboard-tenant-form";

export default async function SuperAdminPage({
  searchParams,
}: {
  searchParams?: Promise<{ page?: string }>;
}) {
  await requireRole(["super_admin"]);

  const { page: pageParam } = (await searchParams) || {};
  const rawPage = parseInt(pageParam || "1", 10);
  const page = isNaN(rawPage) || rawPage < 1 ? 1 : rawPage;
  const pageSize = 20;

  const { tenants, totalCount, totalPages, currentPage } = await getTenants({
    page,
    pageSize,
  });

  function getPageUrl(targetPage: number) {
    if (targetPage <= 1) return "/tenant-dashboard";
    return `/tenant-dashboard?page=${targetPage}`;
  }

  return (
    <div style={{ padding: 24, fontFamily: "sans-serif", maxWidth: 1400, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Tenant Network</h1>
          <p style={{ margin: "4px 0 0 0", color: "#888", fontSize: 13 }}>
            Platform tenants, subscription tier management, and billing administration.
          </p>
        </div>
        <OnboardTenantForm />
      </div>

      {tenants.length === 0 ? (
        <p style={{ color: "#888" }}>No tenants found.</p>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 }}>
            {tenants.map((t) => (
              <div
                key={t.id}
                style={{
                  padding: 16,
                  border: "1px solid var(--border, #333)",
                  borderRadius: 12,
                  background: "var(--card-bg, #1a1a1a)",
                }}
              >
                <div style={{ fontWeight: 700, fontSize: 15, color: "var(--text-primary, #fff)" }}>
                  {t.companyName}
                </div>
                <div style={{ fontSize: 12, color: "var(--text-secondary, #888)", marginTop: 4 }}>
                  ID: {t.id}
                </div>
                <div style={{ fontSize: 12, color: "var(--primary, #3b82f6)", marginTop: 6, fontWeight: 600 }}>
                  {t.subscriptionPlan} · {t.billingStatus}
                </div>
              </div>
            ))}
          </div>

          {/* Pagination Controls */}
          {totalCount > 0 && (
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: 12,
                marginTop: 24,
                padding: "14px 20px",
                border: "1px solid var(--border, #333)",
                borderRadius: 12,
                background: "var(--card-bg, #1a1a1a)",
              }}
            >
              <div style={{ fontSize: 12, color: "var(--text-secondary, #888)", fontWeight: 600 }}>
                Showing{" "}
                <strong style={{ color: "var(--text-primary, #fff)" }}>
                  {(currentPage - 1) * pageSize + 1}
                </strong>
                {" "}–{" "}
                <strong style={{ color: "var(--text-primary, #fff)" }}>
                  {Math.min(currentPage * pageSize, totalCount)}
                </strong>
                {" "}of{" "}
                <strong style={{ color: "var(--text-primary, #fff)" }}>{totalCount}</strong>
                {" "}tenants
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {currentPage > 1 ? (
                  <Link
                    href={getPageUrl(currentPage - 1)}
                    style={{
                      padding: "6px 14px",
                      borderRadius: 10,
                      border: "1px solid var(--border, #333)",
                      background: "var(--scaffold-bg, #111)",
                      color: "var(--text-primary, #fff)",
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
                      border: "1px solid var(--border, #333)",
                      background: "transparent",
                      color: "var(--text-secondary, #888)",
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
                    color: "var(--text-primary, #fff)",
                    fontSize: 12,
                    background: "var(--scaffold-bg, #111)",
                    border: "1px solid var(--border, #333)",
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
                      border: "1px solid var(--border, #333)",
                      background: "var(--scaffold-bg, #111)",
                      color: "var(--text-primary, #fff)",
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
                      border: "1px solid var(--border, #333)",
                      background: "transparent",
                      color: "var(--text-secondary, #888)",
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
  );
}