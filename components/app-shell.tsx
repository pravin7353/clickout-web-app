"use client";

import { useSession, signOut } from "next-auth/react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ThemeToggle } from "./theme-toggle";
import {
  ProfileMenu,
  UploadLogoButton,
  CompanyEditButton,
  AddStoreButton,
  StoreQRButton,
  EditStoreButton,
  InvoiceSettingsButton,
} from "./profile-menu";
import { TrialCountdownBadge } from "./subscription/TrialCountdownBadge";
import { UsageLimitBanner } from "./subscription/UsageLimitBanner";
import { useTenantSubscription } from "@/lib/subscription/use-subscription";
import { isRouteAllowed, getRequiredPlanName } from "@/lib/subscription/access-engine";
import { SubscriptionPlan } from "@/lib/subscription/plan";

type NavItem = { label: string; href: string; routeKey?: string };

const PLATFORM_ITEMS: NavItem[] = [
  { label: "All Tenants", href: "/" },
  { label: "Register Client", href: "/register-client" },
  { label: "Campaign Manager", href: "/campaign-manager", routeKey: "campaign-manager" },
];

const TENANT_HQ_ITEMS: NavItem[] = [
  { label: "My Company", href: "/tenant-admin" },
  { label: "Usage & Plan", href: "/usage" },
];

const OPERATIONS_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Staff", href: "/manager", routeKey: "manager-dashboard" },
  { label: "HR & Workforce", href: "/hr", routeKey: "hr" },
  { label: "Inventory", href: "/inventory" },
  { label: "Service Catalog", href: "/service" },
  { label: "IDT Deposits", href: "/idt", routeKey: "idt" },
  { label: "Cashier / POS", href: "/cashier" },
  { label: "Procurement", href: "/procurement", routeKey: "procurement" },
  { label: "Growth Radar", href: "/growth", routeKey: "growth" },
];

const FINANCE_ITEMS: NavItem[] = [
  { label: "General Ledger", href: "/finance", routeKey: "finance" },
  { label: "Auditor", href: "/auditor", routeKey: "auditor" },
  { label: "Guard Console", href: "/guard", routeKey: "guard" },
];

const AUDITOR_ITEMS: NavItem[] = [
  { label: "Auditor Console", href: "/auditor", routeKey: "auditor" },
  { label: "Audit Terminal", href: "/auditor/terminal" },
];

const SECURITY_ITEMS: NavItem[] = [
  { label: "Risk Engine", href: "/risk", routeKey: "risk" },
  { label: "Fraud Control", href: "/fraud-control", routeKey: "fraud-control" },
  { label: "QR Bailout", href: "/qr-reactivation", routeKey: "qr-reactivation" },
  { label: "Refunds", href: "/refund", routeKey: "refund" },
];

const SETTINGS_ITEMS: NavItem[] = [
  { label: "Integrations", href: "/integrations", routeKey: "integrations" },
];

function NavSection({
  title,
  items,
  pathname,
  storeCode,
  plan,
  isTrialActive,
  isSuperAdmin,
}: {
  title: string;
  items: NavItem[];
  pathname: string;
  storeCode?: string | null;
  plan: SubscriptionPlan | string;
  isTrialActive: boolean;
  isSuperAdmin: boolean;
}) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 11, color: "var(--text-secondary)", textTransform: "uppercase", padding: "0 12px", marginBottom: 6 }}>
        {title}
      </div>
      {items.map((item) => {
        const active = pathname === item.href;
        const hrefWithContext = storeCode ? `${item.href}?store=${storeCode}` : item.href;
        const isAllowed =
          isSuperAdmin ||
          !item.routeKey ||
          isRouteAllowed({
            route: item.routeKey,
            plan,
            isTrialActive,
          });

        const requiredPlan = item.routeKey ? getRequiredPlanName(item.routeKey) : "";

        return (
          <Link
            key={item.href}
            href={hrefWithContext}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "9px 12px",
              borderRadius: 8,
              marginBottom: 2,
              fontSize: 13,
              fontWeight: active ? 700 : 500,
              textDecoration: "none",
              color: active
                ? "var(--text-primary)"
                : isAllowed
                ? "var(--text-primary)"
                : "rgba(148, 163, 184, 0.65)",
              background: active
                ? "color-mix(in srgb, var(--text-primary) 8%, transparent)"
                : "transparent",
              transition: "all 0.15s ease",
            }}
          >
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span>{item.label}</span>
            </span>

            {active && (
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: "var(--success)",
                  boxShadow: "0 0 6px var(--success)",
                }}
              />
            )}

            {!isAllowed && (
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  padding: "1px 6px",
                  borderRadius: 6,
                  background: "rgba(234, 179, 8, 0.12)",
                  color: "#eab308",
                  border: "1px solid rgba(234, 179, 8, 0.25)",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 3,
                }}
              >
                🔒 {requiredPlan || "Pro"}
              </span>
            )}
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
  const sub = useTenantSubscription();

  if (pathname === "/login" || pathname?.startsWith("/employee") || status !== "authenticated") {
    return <>{children}</>;
  }

  const role = (session?.user as any)?.role as string | undefined;
  const isSuperAdmin = role === "super_admin";
  const isTenantAdmin = role === "tenant_admin";
  const isManager = role === "manager";
  const isAuditor = role === "auditor";
  
  const isStoreContext = !!storeCode;
  const showStoreMenus = (isManager || isStoreContext) && !isAuditor;

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden" }}>
      <aside style={{ width: 240, flexShrink: 0, borderRight: "1px solid var(--border)", padding: 16, background: "var(--card-bg)", height: "100vh", overflowY: "auto" }}>
        <div style={{ marginBottom: 20 }}>
          <span style={{ fontWeight: 900, fontSize: 18 }}>ClickOut</span>
          <div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 8 }}>{role}</div>
          <TrialCountdownBadge />
        </div>

        {isSuperAdmin && !isStoreContext && (
          <NavSection
            title="Platform"
            items={PLATFORM_ITEMS}
            pathname={pathname}
            plan={sub.plan}
            isTrialActive={sub.isTrialActive}
            isSuperAdmin={isSuperAdmin}
          />
        )}
        {isTenantAdmin && !isStoreContext && (
          <NavSection
            title="Tenant HQ"
            items={TENANT_HQ_ITEMS}
            pathname={pathname}
            plan={sub.plan}
            isTrialActive={sub.isTrialActive}
            isSuperAdmin={isSuperAdmin}
          />
        )}
        
        {(isTenantAdmin || isSuperAdmin) && isStoreContext && (
          <div style={{ marginBottom: 20 }}>
            <Link href={isTenantAdmin ? "/tenant-admin" : "/"} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: "var(--card-bg)", color: "var(--text-secondary)", borderRadius: 8, fontSize: 13, textDecoration: "none", border: "1px solid var(--border)" }}>
              ← Back to Overview
            </Link>
          </div>
        )}

        {isAuditor && (
          <NavSection
            title="Financial Audit"
            items={AUDITOR_ITEMS}
            pathname={pathname}
            storeCode={storeCode}
            plan={sub.plan}
            isTrialActive={sub.isTrialActive}
            isSuperAdmin={isSuperAdmin}
          />
        )}

        {showStoreMenus && (
          <>
            <NavSection
              title="Operations"
              items={OPERATIONS_ITEMS}
              pathname={pathname}
              storeCode={storeCode}
              plan={sub.plan}
              isTrialActive={sub.isTrialActive}
              isSuperAdmin={isSuperAdmin}
            />
            <NavSection
              title="Finance"
              items={FINANCE_ITEMS}
              pathname={pathname}
              storeCode={storeCode}
              plan={sub.plan}
              isTrialActive={sub.isTrialActive}
              isSuperAdmin={isSuperAdmin}
            />
            <NavSection
              title="Security"
              items={SECURITY_ITEMS}
              pathname={pathname}
              storeCode={storeCode}
              plan={sub.plan}
              isTrialActive={sub.isTrialActive}
              isSuperAdmin={isSuperAdmin}
            />
            <NavSection
              title="Settings"
              items={SETTINGS_ITEMS}
              pathname={pathname}
              storeCode={storeCode}
              plan={sub.plan}
              isTrialActive={sub.isTrialActive}
              isSuperAdmin={isSuperAdmin}
            />
          </>
        )}
        {(isSuperAdmin || isTenantAdmin) && !showStoreMenus && !isAuditor && (
          <p style={{ fontSize: 12, color: "var(--text-secondary)", padding: "0 12px" }}>
            Enter a store to see operations.
          </p>
        )}
      </aside>

      <main style={{ flex: 1, overflow: "auto" }}>
        <UsageLimitBanner />
        {children}
      </main>

      <aside style={{ width: 64, flexShrink: 0, borderLeft: "1px solid var(--border)", background: "var(--card-bg)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "space-between", padding: "16px 0", height: "100vh" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
          <ProfileMenu />
          {(isTenantAdmin || isManager) && <UploadLogoButton />}
          {isTenantAdmin && !isStoreContext && (
            <>
              <CompanyEditButton />
              <AddStoreButton />
              <InvoiceSettingsButton />
            </>
          )}
          {((isStoreContext && !isAuditor) || isManager) && (
            <>
              <StoreQRButton />
              <EditStoreButton />
              <InvoiceSettingsButton />
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
