"use client";

import { useSession, signOut } from "next-auth/react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ThemeToggle } from "./theme-toggle";
import { ProfileMenu, CompanyEditButton, AddStoreButton } from "./profile-menu";

type NavItem = { label: string; href: string };

const PLATFORM_ITEMS: NavItem[] = [
  { label: "All Tenants", href: "/" },
  { label: "Register Client", href: "/register-client" },
  { label: "Campaign Manager", href: "/campaign-manager" },
];

const TENANT_HQ_ITEMS: NavItem[] = [
  { label: "My Company", href: "/tenant-admin" },
  { label: "Usage & Plan", href: "/usage" },
];

const OPERATIONS_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Staff", href: "/manager" },
  { label: "Inventory", href: "/inventory" },
  { label: "Service Catalog", href: "/service" },
  { label: "IDT Deposits", href: "/idt" },
  { label: "Cashier / POS", href: "/cashier" },
  { label: "Procurement", href: "/procurement" },
  { label: "Growth Radar", href: "/growth" },
];

const FINANCE_ITEMS: NavItem[] = [
  { label: "Auditor", href: "/auditor" },
  { label: "Guard Console", href: "/guard" },
];

const SECURITY_ITEMS: NavItem[] = [
  { label: "Risk Engine", href: "/risk" },
  { label: "Fraud Control", href: "/fraud-control" },
  { label: "QR Bailout", href: "/qr-reactivation" },
  { label: "Refunds", href: "/refund" },
];

const SETTINGS_ITEMS: NavItem[] = [
  { label: "Integrations", href: "/integrations" },
];

function NavSection({ title, items, pathname, storeCode }: { title: string; items: NavItem[]; pathname: string; storeCode?: string | null }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 11, color: "var(--text-secondary)", textTransform: "uppercase", padding: "0 12px", marginBottom: 6 }}>
        {title}
      </div>
      {items.map((item) => {
        const active = pathname === item.href;
        const hrefWithContext = storeCode ? `${item.href}?store=${storeCode}` : item.href;
        return (
          <Link
            key={item.href}
            href={hrefWithContext}
            style={{
              display: "block",
              padding: "8px 12px",
              borderRadius: 8,
              marginBottom: 2,
              fontSize: 14,
              textDecoration: "none",
              color: active ? "var(--cta-text)" : "var(--text-primary)",
              background: active ? "var(--cta-bg)" : "transparent",
            }}
          >
            {item.label}
          </Link>
        );
      })}
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const storeCode = searchParams.get("store");
  const { data: session, status } = useSession();

  if (pathname === "/login" || status !== "authenticated") {
    return <>{children}</>;
  }

  const role = (session?.user as any)?.role as string | undefined;
  const isSuperAdmin = role === "super_admin";
  const isTenantAdmin = role === "tenant_admin";
  const isManager = role === "manager";
  
  const isStoreContext = !!storeCode;
  const showStoreMenus = isManager || (isTenantAdmin && isStoreContext);

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden" }}>
      <aside style={{ width: 240, flexShrink: 0, borderRight: "1px solid var(--border)", padding: 16, background: "var(--card-bg)", height: "100vh", overflowY: "auto" }}>
        <div style={{ marginBottom: 24 }}>
          <span style={{ fontWeight: 900, fontSize: 18 }}>ClickOut</span>
          <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{role}</div>
        </div>

        {isSuperAdmin && <NavSection title="Platform" items={PLATFORM_ITEMS} pathname={pathname} />}
        {isTenantAdmin && !isStoreContext && <NavSection title="Tenant HQ" items={TENANT_HQ_ITEMS} pathname={pathname} />}
        
        {isTenantAdmin && isStoreContext && (
          <div style={{ marginBottom: 20 }}>
            <Link href="/tenant-admin" style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: "var(--card-bg)", color: "var(--text-secondary)", borderRadius: 8, fontSize: 13, textDecoration: "none", border: "1px solid var(--border)" }}>
              ← Back to Command Center
            </Link>
          </div>
        )}

        {showStoreMenus && (
          <>
            <NavSection title="Operations" items={OPERATIONS_ITEMS} pathname={pathname} storeCode={storeCode} />
            <NavSection title="Finance" items={FINANCE_ITEMS} pathname={pathname} storeCode={storeCode} />
            <NavSection title="Security" items={SECURITY_ITEMS} pathname={pathname} storeCode={storeCode} />
            <NavSection title="Settings" items={SETTINGS_ITEMS} pathname={pathname} storeCode={storeCode} />
          </>
        )}
        {(isSuperAdmin || isTenantAdmin) && !showStoreMenus && (
          <p style={{ fontSize: 12, color: "var(--text-secondary)", padding: "0 12px" }}>
            Enter a store to see operations.
          </p>
        )}
      </aside>

      <main style={{ flex: 1, overflow: "auto" }}>{children}</main>

      <aside style={{ width: 64, flexShrink: 0, borderLeft: "1px solid var(--border)", background: "var(--card-bg)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "space-between", padding: "16px 0", height: "100vh" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
          <ProfileMenu />
          {isTenantAdmin && !isStoreContext && (
            <>
              <CompanyEditButton />
              <AddStoreButton />
            </>
          )}
          {isStoreContext && (
            <>
              <button title="Store QR / Details" style={{ width: 36, height: 36, borderRadius: 10, background: "var(--scaffold-bg)", border: "1px solid var(--border)", color: "var(--text-primary)", cursor: "pointer", fontSize: 16 }}>🔳</button>
              <button title="Edit Store" style={{ width: 36, height: 36, borderRadius: 10, background: "var(--scaffold-bg)", border: "1px solid var(--border)", color: "var(--text-primary)", cursor: "pointer", fontSize: 16 }}>✏️</button>
              <button title="Invoice Rules" style={{ width: 36, height: 36, borderRadius: 10, background: "var(--scaffold-bg)", border: "1px solid var(--border)", color: "var(--text-primary)", cursor: "pointer", fontSize: 16 }}>🧾</button>
            </>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
          <ThemeToggle />
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            title="Logout"
            style={{ width: 36, height: 36, borderRadius: 10, background: "transparent", border: "1px solid var(--danger)", color: "var(--danger)", cursor: "pointer", fontSize: 16 }}
          >
            ⏻
          </button>
        </div>
      </aside>
    </div>
  );
}
