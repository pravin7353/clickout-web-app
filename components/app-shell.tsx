"use client";

import { useSession, signOut } from "next-auth/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "./theme-toggle";
import { ProfileMenu } from "./profile-menu";

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
  { label: "Service Catalog", href: "/service-control" },
  { label: "IDT Deposits", href: "/idt-deposits" },
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
  { label: "Fraud Control", href: "/fraud" },
  { label: "QR Bailout", href: "/qr-reactivation" },
  { label: "Refunds", href: "/refund" },
];

const SETTINGS_ITEMS: NavItem[] = [
  { label: "Integrations", href: "/integrations" },
];

function NavSection({ title, items, pathname }: { title: string; items: NavItem[]; pathname: string }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 11, color: "var(--text-secondary)", textTransform: "uppercase", padding: "0 12px", marginBottom: 6 }}>
        {title}
      </div>
      {items.map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
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
  const { data: session, status } = useSession();

  if (pathname === "/login" || status !== "authenticated") {
    return <>{children}</>;
  }

  const role = (session?.user as any)?.role as string | undefined;
  const isSuperAdmin = role === "super_admin";
  const isTenantAdmin = role === "tenant_admin";
  const isManager = role === "manager";
  const showStoreMenus = isTenantAdmin || isManager;

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <aside style={{ width: 240, borderRight: "1px solid var(--border)", padding: 16, background: "var(--card-bg)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
          <div>
            <span style={{ fontWeight: 900, fontSize: 18 }}>ClickOut</span>
            <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{role}</div>
          </div>
          <ProfileMenu />
        </div>

        {isSuperAdmin && <NavSection title="Platform" items={PLATFORM_ITEMS} pathname={pathname} />}
        {isTenantAdmin && <NavSection title="Tenant HQ" items={TENANT_HQ_ITEMS} pathname={pathname} />}
        {showStoreMenus && (
          <>
            <NavSection title="Operations" items={OPERATIONS_ITEMS} pathname={pathname} />
            <NavSection title="Finance" items={FINANCE_ITEMS} pathname={pathname} />
            <NavSection title="Security" items={SECURITY_ITEMS} pathname={pathname} />
            <NavSection title="Settings" items={SETTINGS_ITEMS} pathname={pathname} />
          </>
        )}
        {isSuperAdmin && !showStoreMenus && (
          <p style={{ fontSize: 12, color: "var(--text-secondary)", padding: "0 12px" }}>
            Open a tenant to see store-level operations.
          </p>
        )}

        <div style={{ marginTop: 32, display: "flex", flexDirection: "column", gap: 8 }}>
          <ThemeToggle />
          <button onClick={() => signOut({ callbackUrl: "/login" })} style={{ padding: 8, fontSize: 13 }}>
            Sign out
          </button>
        </div>
      </aside>

      <main style={{ flex: 1, overflow: "auto" }}>{children}</main>
    </div>
  );
}
