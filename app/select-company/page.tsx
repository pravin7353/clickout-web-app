import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { SignOutButton } from "@/components/sign-out-button";

export default async function SelectCompanyPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const role = ((session.user as any)?.role || "").toString().toLowerCase();
  if (role !== "auditor" && role !== "super_admin") {
    redirect("/dashboard");
  }

  const accessibleTenants =
    ((session.user as any)?.accessibleTenants as {
      tenantId: string;
      companyName: string;
      branchCode: string;
    }[]) || [];

  if (accessibleTenants.length <= 1) {
    const singleTenant = accessibleTenants[0]?.tenantId;
    redirect(singleTenant ? `/auditor?tenant=${encodeURIComponent(singleTenant)}` : "/auditor");
  }

  const userName = session.user.name || session.user.email?.split("@")[0] || "Auditor";
  const userEmail = session.user.email || "";

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--scaffold-bg, #0f172a)",
        padding: 24,
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <div
        style={{
          width: 560,
          maxWidth: "100%",
          background: "var(--card-bg, #1e293b)",
          border: "1px solid var(--border, #334155)",
          borderRadius: 20,
          padding: 36,
          boxShadow: "0 20px 50px rgba(0,0,0,0.3)",
        }}
      >
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: 14,
              background: "color-mix(in srgb, #2563eb 15%, transparent)",
              color: "#3b82f6",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 26,
              marginBottom: 12,
            }}
          >
            🏢
          </div>
          <h1
            style={{
              fontSize: 22,
              fontWeight: 800,
              margin: "0 0 6px 0",
              color: "var(--text-primary, #f8fafc)",
              letterSpacing: "-0.02em",
            }}
          >
            Universal Auditor Gateway
          </h1>
          <p style={{ fontSize: 13, color: "var(--text-secondary, #94a3b8)", margin: 0 }}>
            Signed in as <strong>{userEmail}</strong>
          </p>
          <div
            style={{
              display: "inline-block",
              background: "color-mix(in srgb, #2563eb 20%, transparent)",
              border: "1px solid #2563eb",
              borderRadius: 6,
              padding: "3px 10px",
              fontSize: 11,
              fontWeight: 800,
              color: "#60a5fa",
              marginTop: 10,
              letterSpacing: "0.06em",
            }}
          >
            ROLE: UNIVERSAL AUDITOR
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <span
            style={{
              fontSize: 11,
              fontWeight: 800,
              color: "var(--text-secondary, #94a3b8)",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
            }}
          >
            Select Client Organization to Audit ({accessibleTenants.length} Assigned)
          </span>
        </div>

        <div style={{ display: "grid", gap: 12, marginBottom: 28 }}>
          {accessibleTenants.map((tenant) => (
            <Link
              key={tenant.tenantId}
              href={`/auditor?tenant=${encodeURIComponent(tenant.tenantId)}`}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "16px 20px",
                borderRadius: 14,
                background: "var(--scaffold-bg, #0f172a)",
                border: "1px solid var(--border, #334155)",
                textDecoration: "none",
                transition: "all 0.15s ease",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 12,
                    background: "var(--card-bg, #1e293b)",
                    border: "1px solid var(--border, #334155)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 20,
                  }}
                >
                  🏢
                </div>
                <div>
                  <div
                    style={{
                      fontSize: 15,
                      fontWeight: 700,
                      color: "var(--text-primary, #f8fafc)",
                    }}
                  >
                    {tenant.companyName}
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      color: "var(--text-secondary, #94a3b8)",
                      marginTop: 2,
                      fontFamily: "monospace",
                    }}
                  >
                    {tenant.tenantId} • Branch: {tenant.branchCode || "Consolidated HQ"}
                  </div>
                </div>
              </div>
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: "#3b82f6",
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                Inspect Ledger →
              </span>
            </Link>
          ))}
        </div>

        <div style={{ textAlign: "center", borderTop: "1px solid var(--border, #334155)", paddingTop: 20 }}>
          <SignOutButton />
        </div>
      </div>
    </div>
  );
}
