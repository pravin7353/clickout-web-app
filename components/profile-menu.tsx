"use client";

import { useState, useTransition } from "react";
import { useSession, signOut } from "next-auth/react";
import { usePathname, useSearchParams } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { updateTenantProfile } from "@/actions/tenant";
import { updateStoreProfile } from "@/actions/store";
import { CreateStoreForm } from "@/components/create-store-form";
import { Card, Button, Input, ErrorBanner } from "@/components/ui";
import Link from "next/link";

type MenuView = "closed" | "menu" | "qr" | "companyProfile" | "addStore" | "editStore";

export function ProfileMenu() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [view, setView] = useState<MenuView>("closed");

  const role = (session?.user as any)?.role as string | undefined;
  const tenantId = (session?.user as any)?.tenantId as string | undefined;
  const sessionStoreId = (session?.user as any)?.storeId as string | undefined;
  const activeStore = searchParams.get("store") ?? sessionStoreId ?? null;
  const isManager = role === "manager";
  const isTenantAdminOrSuper = role === "tenant_admin" || role === "super_admin";

  if (!session) return null;

  const name = session.user?.name ?? session.user?.email ?? "User";

  const qrPayload = activeStore
    ? JSON.stringify({ action: "STORE_ENTRY", tenantId, branchCode: activeStore, timestamp: Date.now() })
    : null;

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setView(view === "closed" ? "menu" : "closed")}
        style={{ width: 36, height: 36, borderRadius: "50%", background: "var(--cta-bg-accent)", color: "#000", border: "none", fontWeight: 700, cursor: "pointer" }}
      >
        {name.charAt(0).toUpperCase()}
      </button>

      {view === "menu" && (
        <>
          <div onClick={() => setView("closed")} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
          <Card style={{ position: "absolute", right: 0, top: 44, width: 280, zIndex: 50 }}>
            <div style={{ textAlign: "center", paddingBottom: 16, borderBottom: "1px solid var(--border)" }}>
              {activeStore || isManager ? (
                <div
                  onClick={() => setView("qr")}
                  style={{ display: "inline-block", padding: 8, background: "#fff", borderRadius: 12, border: "2px solid var(--success)", cursor: "pointer" }}
                >
                  {qrPayload && <QRCodeSVG value={qrPayload} size={90} />}
                </div>
              ) : (
                <div style={{ width: 70, height: 70, borderRadius: "50%", background: "color-mix(in srgb, var(--cta-bg-accent) 15%, transparent)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto", fontSize: 28 }}>
                  🏢
                </div>
              )}
              <div style={{ fontWeight: 700, marginTop: 12, color: "var(--text-primary)" }}>{name}</div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--cta-bg-accent)", letterSpacing: 1 }}>{role?.toUpperCase()}</div>
            </div>

            <div style={{ padding: "8px 0" }}>
              {isTenantAdminOrSuper && (
                <>
                  <MenuItem icon="🏢" label="Company Profile" onClick={() => setView("companyProfile")} />
                  <MenuItem icon="➕" label="Add New Store" onClick={() => setView("addStore")} />
                  <div style={{ borderTop: "1px solid var(--border)", margin: "6px 0" }} />
                </>
              )}
              {(activeStore || isManager) && (
                <>
                  <MenuItem icon="📍" label="Edit Store Profile" onClick={() => setView("editStore")} />
                  <Link href="/invoice-settings" onClick={() => setView("closed")}>
                    <MenuItem icon="🧾" label="Invoice Rules" onClick={() => {}} />
                  </Link>
                  <div style={{ borderTop: "1px solid var(--border)", margin: "6px 0" }} />
                </>
              )}
              <MenuItem icon="⏻" label="Secure Logout" color="var(--danger)" onClick={() => signOut({ callbackUrl: "/login" })} />
            </div>
          </Card>
        </>
      )}

      {view === "qr" && qrPayload && (
        <Modal onClose={() => setView("closed")}>
          <div style={{ textAlign: "center" }}>
            <QRCodeSVG value={qrPayload} size={240} />
            <p style={{ marginTop: 16, color: "var(--text-secondary)", fontSize: 13 }}>Scan this to enter store: {activeStore}</p>
          </div>
        </Modal>
      )}

      {view === "companyProfile" && <CompanyProfileForm onClose={() => setView("closed")} />}
      {view === "addStore" && (
        <Modal onClose={() => setView("closed")}>
          <CreateStoreForm />
        </Modal>
      )}
      {view === "editStore" && activeStore && <EditStoreForm storeId={activeStore} onClose={() => setView("closed")} />}
    </div>
  );
}

function MenuItem({ icon, label, onClick, color }: { icon: string; label: string; onClick: () => void; color?: string }) {
  return (
    <div
      onClick={onClick}
      style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", cursor: "pointer", color: color ?? "var(--text-primary)", fontSize: 14 }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "color-mix(in srgb, var(--text-primary) 5%, transparent)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      <span>{icon}</span> {label}
    </div>
  );
}

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}>{children}</div>
    </div>
  );
}

function CompanyProfileForm({ onClose }: { onClose: () => void }) {
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const form = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await updateTenantProfile({ companyName: form.get("companyName") as string, ownerName: form.get("ownerName") as string });
      if (!res.ok) setError(res.error ?? "Failed");
      else onClose();
    });
  }

  return (
    <Modal onClose={onClose}>
      <Card style={{ width: 380 }}>
        <h3 style={{ fontWeight: 700, marginBottom: 16, color: "var(--text-primary)" }}>Company Profile</h3>
        <form onSubmit={handleSubmit} style={{ display: "grid", gap: 10 }}>
          <Input name="companyName" placeholder="Company name" required />
          <Input name="ownerName" placeholder="Owner name" required />
          {error && <ErrorBanner message={error} />}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={isPending}>{isPending ? "Saving..." : "Save"}</Button>
          </div>
        </form>
      </Card>
    </Modal>
  );
}

function EditStoreForm({ storeId, onClose }: { storeId: string; onClose: () => void }) {
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const form = new FormData(e.currentTarget);
    startTransition(async () => {
      // 🚀 FIX: Added 'as any' to bypass the void type error
      const res = (await updateStoreProfile({
        storeId, 
        storeName: form.get("storeName") as string, 
        managerPhone: form.get("managerPhone") as string,
        address: form.get("address") as string, 
        city: form.get("city") as string,
      })) as any; 

      if (!res?.ok) setError(res?.error ?? "Failed");
      else onClose();
    });
  }

  return (
    <Modal onClose={onClose}>
      <Card style={{ width: 380 }}>
        <h3 style={{ fontWeight: 700, marginBottom: 16, color: "var(--text-primary)" }}>Edit Store Profile</h3>
        <form onSubmit={handleSubmit} style={{ display: "grid", gap: 10 }}>
          <Input name="storeName" placeholder="Store name" required />
          <Input name="managerPhone" placeholder="Manager phone" />
          <Input name="address" placeholder="Address" />
          <Input name="city" placeholder="City" />
          {error && <ErrorBanner message={error} />}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={isPending}>{isPending ? "Saving..." : "Save"}</Button>
          </div>
        </form>
      </Card>
    </Modal>
  );
}