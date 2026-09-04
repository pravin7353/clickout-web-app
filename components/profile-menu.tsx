"use client";

import { useState, useTransition, useRef } from "react";
import { useSession } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { QRCodeSVG, QRCodeCanvas } from "qrcode.react";
import { updateTenantProfile } from "@/actions/tenant";
import { CreateStoreForm } from "@/components/create-store-form";
import { Card, Button, Input, ErrorBanner } from "@/components/ui";
import { updateStoreProfile } from "@/actions/store";

type MenuView = "closed" | "detail" | "qr";

export function ProfileMenu() {
  const { data: session } = useSession();
  const searchParams = useSearchParams();
  const [view, setView] = useState<MenuView>("closed");

  const role = (session?.user as any)?.role as string | undefined;
  const tenantId = (session?.user as any)?.tenantId as string | undefined;
  const sessionStoreId = (session?.user as any)?.storeId as string | undefined;
  const activeStore = searchParams.get("store") ?? sessionStoreId ?? null;
  const isManager = role === "manager";

  if (!session) return null;

  const name = session.user?.name ?? session.user?.email ?? "User";
  const profileImage = (session.user as any)?.image ?? null;

  // Flutter app's Uri.parse expects standard URL query parameters, not a JSON string.
  const qrPayload = activeStore
    ? `https://app.clickout.com/entry?t=${tenantId}&b=${activeStore}&s=${activeStore}`
    : null;

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setView(view === "closed" ? "detail" : "closed")}
        style={{ width: 36, height: 36, borderRadius: "50%", background: "var(--cta-bg-accent)", color: "#000", border: "none", fontWeight: 700, cursor: "pointer", overflow: "hidden", padding: 0 }}
      >
        {profileImage ? (
          <img src={profileImage} alt={name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          name.charAt(0).toUpperCase()
        )}
      </button>

      {view === "detail" && (
        <>
          <div onClick={() => setView("closed")} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
          <Card style={{ position: "absolute", right: 44, top: 0, width: 260, zIndex: 50 }}>
            <div style={{ textAlign: "center" }}>
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
              <div style={{ fontWeight: 700, marginTop: 12, color: "var(--text-primary)" }}>
                {activeStore ? `Store: ${activeStore}` : name}
              </div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--cta-bg-accent)", letterSpacing: 1 }}>
                {activeStore ? "OPERATIONAL NODE" : role?.toUpperCase()}
              </div>
              <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 4 }}>
                {activeStore ? `Manager: ${name}` : tenantId}
              </div>
            </div>
          </Card>
        </>
      )}

      {view === "qr" && qrPayload && (
        <Modal onClose={() => setView("closed")}>
          <div style={{ textAlign: "center", background: "var(--card-bg)", padding: 24, borderRadius: 12 }}>
            <QRCodeCanvas id="qr-canvas" value={qrPayload} size={240} level="H" includeMargin={true} />
            <p style={{ marginTop: 16, color: "var(--text-secondary)", fontSize: 13, fontWeight: 600 }}>Scan this to enter store: {activeStore}</p>
            <Button 
              onClick={() => {
                const qrCanvas = document.getElementById("qr-canvas") as HTMLCanvasElement;
                if (!qrCanvas) return;

                // Create high-res canvas for the poster
                const canvas = document.createElement("canvas");
                canvas.width = 600;
                canvas.height = 850;
                const ctx = canvas.getContext("2d");
                if (!ctx) return;

                // 1. Dark Background with rounded corners
                ctx.fillStyle = "#222222";
                ctx.beginPath();
                ctx.roundRect(0, 0, 600, 850, 24);
                ctx.fill();

                // 2. Green Border
                ctx.strokeStyle = "#00C853";
                ctx.lineWidth = 12;
                ctx.beginPath();
                ctx.roundRect(6, 6, 588, 838, 20);
                ctx.stroke();

                // 3. Header Icon & Text
                ctx.textAlign = "center";
                ctx.font = "50px sans-serif";
                ctx.fillText("🏪", 300, 120);

                ctx.fillStyle = "#FFFFFF";
                ctx.font = "bold 48px sans-serif";
                // Using activeStore as name if separate store name isn't in scope yet
                ctx.fillText(activeStore || "ClickOut Store", 300, 200); 

                ctx.fillStyle = "#888888";
                ctx.font = "bold 20px sans-serif";
                ctx.fillText(`STORE ID: ${activeStore}`, 300, 240);

                // 4. White Box for QR Code
                ctx.fillStyle = "#FFFFFF";
                ctx.beginPath();
                ctx.roundRect(80, 290, 440, 440, 24);
                ctx.fill();

                // 5. Draw the actual QR Code
                ctx.drawImage(qrCanvas, 100, 310, 400, 400);

                // 6. Footer Text
                ctx.fillStyle = "#666666";
                ctx.font = "bold 22px sans-serif";
                ctx.fillText("Scan to enter via ClickOut App", 300, 790);

                // Trigger Download
                const link = document.createElement("a");
                link.download = `ClickOut_QR_Poster_${activeStore}.png`;
                link.href = canvas.toDataURL("image/png");
                link.click();
              }}
              style={{ marginTop: 16, width: "100%" }}
            >
              Download Store QR Poster
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

export function CompanyEditButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Edit Company Profile"
        style={{ width: 36, height: 36, borderRadius: 10, background: "transparent", border: "1px solid var(--border)", color: "var(--text-primary)", cursor: "pointer", fontSize: 16 }}
      >
        🏢
      </button>
      {open && <CompanyProfileForm onClose={() => setOpen(false)} />}
    </>
  );
}

export function AddStoreButton() {
  // CreateStoreForm ab khud apna modal aur state handle karta hai
  return <CreateStoreForm asIcon={true} />;
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

export function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
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

 