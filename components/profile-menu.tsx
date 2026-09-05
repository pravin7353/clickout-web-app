"use client";

import { useState, useTransition, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useSession, signOut } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { QRCodeSVG, QRCodeCanvas } from "qrcode.react";
import { updateTenantProfile } from "@/actions/tenant";
import { getBrandInfo, BrandInfo, getCurrentUserProfile, UserProfileInfo } from "@/actions/brand";
import { EditStoreForm } from "@/components/edit-store-form";
import { LogoUploadModal } from "@/components/logo-upload-modal";
import { InvoiceSettingsModal } from "@/components/invoice-settings-modal";
import { CreateStoreForm } from "@/components/create-store-form";
import { Card, Button, Input, ErrorBanner } from "@/components/ui";

export function ProfileMenu() {
  const { data: session } = useSession();
  const searchParams = useSearchParams();
  const [isOpen, setIsOpen] = useState(false);

  const [brand, setBrand] = useState<BrandInfo | null>(null);
  const [profile, setProfile] = useState<UserProfileInfo | null>(null);

  const role = (session?.user as any)?.role as string | undefined;
  const tenantId = (session?.user as any)?.tenantId as string | undefined;
  const sessionStoreId = (session?.user as any)?.storeId as string | undefined;
  const activeStore = searchParams.get("store") ?? sessionStoreId ?? null;
  const isManager = role === "manager";
  const isTenantAdmin = role === "tenant_admin";

  const fetchBrandAndProfile = () => {
    if (session) {
      getBrandInfo(activeStore).then((res) => {
        if (res.ok) setBrand(res);
      });
      getCurrentUserProfile(activeStore).then((res) => {
        if (res.ok) setProfile(res);
      });
    }
  };

  useEffect(() => {
    fetchBrandAndProfile();
  }, [session, activeStore]);

  if (!session) return null;

  const name = profile?.name || session.user?.name || session.user?.email?.split("@")[0] || "User";
  const profileImage = (session.user as any)?.image ?? null;

  // Active logo: storeLogoUrl if store active, else companyLogoUrl, else user image
  const displayLogo =
    (activeStore || isManager) && brand?.storeLogoUrl
      ? brand.storeLogoUrl
      : brand?.companyLogoUrl || brand?.storeLogoUrl || profile?.avatarUrl || profileImage;

  const currentStoreDisplayName = brand?.storeName || (activeStore ? `Store ${activeStore}` : name);

  return (
    <div style={{ position: "relative" }}>
      {/* Profile Button Avatar */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        title={currentStoreDisplayName}
        style={{
          width: 38,
          height: 38,
          borderRadius: "50%",
          background: "var(--cta-bg-accent)",
          color: "#000",
          border: "2px solid var(--border)",
          fontWeight: 800,
          cursor: "pointer",
          overflow: "hidden",
          padding: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 2px 6px rgba(0, 0, 0, 0.1)",
          transition: "transform 0.15s ease",
        }}
      >
        {displayLogo ? (
          <img
            src={displayLogo}
            alt={currentStoreDisplayName}
            style={{ width: "100%", height: "100%", objectFit: "cover", background: "#fff" }}
          />
        ) : (
          (brand?.storeName || brand?.companyName || name).charAt(0).toUpperCase()
        )}
      </button>

      {/* Profile Personal Details Dropdown */}
      {isOpen && (
        <>
          <div onClick={() => setIsOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
          <Card
            style={{
              position: "absolute",
              right: 50,
              top: 0,
              width: 310,
              zIndex: 50,
              padding: 0,
              overflow: "hidden",
              borderRadius: 20,
              boxShadow: "0 20px 45px rgba(0, 0, 0, 0.3)",
              border: "1px solid var(--border)",
              background: "var(--card-bg)",
            }}
          >
            {/* User Identity Header */}
            <div
              style={{
                padding: "22px 20px 18px",
                textAlign: "center",
                background: "linear-gradient(180deg, var(--scaffold-bg) 0%, var(--card-bg) 100%)",
                borderBottom: "1px solid var(--border)",
                position: "relative",
              }}
            >
              {/* Avatar */}
              <div
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: "50%",
                  background: "var(--card-bg)",
                  border: "3px solid #00D26A",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  margin: "0 auto 12px",
                  overflow: "hidden",
                  boxShadow: "0 4px 14px rgba(0, 210, 106, 0.25)",
                }}
              >
                {displayLogo ? (
                  <img src={displayLogo} alt="Logo" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  <span style={{ fontSize: 26, fontWeight: 900, color: "var(--text-primary)" }}>
                    {name.charAt(0).toUpperCase()}
                  </span>
                )}
              </div>

              {/* Full Name */}
              <div style={{ fontWeight: 800, fontSize: 17, color: "var(--text-primary)", letterSpacing: -0.2 }}>
                {name}
              </div>

              {/* Role Badge + Active Status */}
              <div style={{ marginTop: 8, display: "inline-flex", alignItems: "center", gap: 8 }}>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 800,
                    letterSpacing: 0.8,
                    textTransform: "uppercase",
                    padding: "3px 9px",
                    borderRadius: 6,
                    background: "rgba(0, 210, 106, 0.12)",
                    color: "#00D26A",
                    border: "1px solid rgba(0, 210, 106, 0.3)",
                  }}
                >
                  {profile?.role || role?.toUpperCase() || "USER"}
                </span>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: "var(--text-secondary)",
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#00D26A" }} />
                  Active
                </span>
              </div>
            </div>

            {/* Personal Details Section */}
            <div style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 12 }}>
              <ProfileField
                icon="📧"
                label="Email Address"
                value={profile?.email || session.user?.email || "—"}
              />
              <ProfileField
                icon="📱"
                label="Phone Number"
                value={profile?.phone ? (profile.phone.startsWith("+") ? profile.phone : `+91 ${profile.phone}`) : "—"}
              />
              <ProfileField
                icon="🆔"
                label={role === "tenant_admin" ? "Tenant / Account ID" : "Employee ID"}
                value={profile?.empId || (session.user as any)?.tenantId || "—"}
                isMono
              />
              <ProfileField
                icon="🏢"
                label="Company / Enterprise"
                value={profile?.companyName || brand?.companyName || "—"}
              />
              {(profile?.storeName || activeStore) && (
                <ProfileField
                  icon="🏪"
                  label="Assigned Store"
                  value={
                    profile?.storeName
                      ? `${profile.storeName} (${profile.branchCode || activeStore})`
                      : `Store ${activeStore}`
                  }
                />
              )}
            </div>

            {/* Sign Out Footer */}
            <div
              style={{
                padding: "12px 18px",
                borderTop: "1px solid var(--border)",
                background: "var(--scaffold-bg)",
              }}
            >
              <button
                onClick={() => signOut({ callbackUrl: "/login" })}
                style={{
                  width: "100%",
                  padding: "9px 12px",
                  borderRadius: 10,
                  background: "rgba(255, 68, 68, 0.08)",
                  border: "1px solid rgba(255, 68, 68, 0.2)",
                  color: "#ff4444",
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  transition: "all 0.15s ease",
                }}
              >
                <span>⏻</span> Sign Out
              </button>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

function ProfileField({
  icon,
  label,
  value,
  isMono,
}: {
  icon: string;
  label: string;
  value: string;
  isMono?: boolean;
}) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
      <span style={{ fontSize: 14, marginTop: 1, flexShrink: 0 }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: "var(--text-secondary)",
            textTransform: "uppercase",
            letterSpacing: 0.5,
          }}
        >
          {label}
        </div>
        <div
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: "var(--text-primary)",
            wordBreak: "break-all",
            fontFamily: isMono ? "monospace" : "inherit",
            marginTop: 1,
          }}
        >
          {value}
        </div>
      </div>
    </div>
  );
}

// ── STANDALONE RIGHT SIDEBAR ACTION BUTTONS ──

export function UploadLogoButton() {
  const [open, setOpen] = useState(false);
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const activeStore = searchParams.get("store") ?? (session?.user as any)?.storeId ?? (session?.user as any)?.branchCode;
  const [brand, setBrand] = useState<BrandInfo | null>(null);

  const fetchBrand = () => {
    if (session) {
      getBrandInfo(activeStore).then((res) => {
        if (res.ok) setBrand(res);
      });
    }
  };

  useEffect(() => {
    fetchBrand();
  }, [session, activeStore]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Upload Brand Logos"
        style={{
          width: 38,
          height: 38,
          borderRadius: 10,
          background: "var(--scaffold-bg)",
          border: "1px solid var(--border)",
          color: "var(--text-primary)",
          cursor: "pointer",
          fontSize: 16,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "all 0.15s ease",
        }}
      >
        🖼️
      </button>
      {open && (
        <LogoUploadModal
          onClose={() => setOpen(false)}
          currentCompanyLogoUrl={brand?.companyLogoUrl}
          currentStoreLogoUrl={brand?.storeLogoUrl}
          storeName={brand?.storeName}
          branchCode={activeStore || brand?.branchCode}
          onSuccess={() => {
            fetchBrand();
          }}
        />
      )}
    </>
  );
}

export function StoreQRButton() {
  const [open, setOpen] = useState(false);
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const activeStore = searchParams.get("store") ?? (session?.user as any)?.storeId ?? (session?.user as any)?.branchCode;
  const tenantId = (session?.user as any)?.tenantId;

  const [brand, setBrand] = useState<BrandInfo | null>(null);

  useEffect(() => {
    if (activeStore) {
      getBrandInfo(activeStore).then((res) => {
        if (res.ok) setBrand(res);
      });
    }
  }, [activeStore]);

  if (!activeStore) return null;

  const qrPayload = `https://app.clickout.com/entry?t=${tenantId}&b=${activeStore}&s=${activeStore}`;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Store QR Poster"
        style={{
          width: 38,
          height: 38,
          borderRadius: 10,
          background: "var(--scaffold-bg)",
          border: "1px solid var(--border)",
          color: "var(--text-primary)",
          cursor: "pointer",
          fontSize: 16,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "all 0.15s ease",
        }}
      >
        🔳
      </button>

      {open && (
        <Modal onClose={() => setOpen(false)}>
          <div
            style={{
              textAlign: "center",
              background: "var(--card-bg)",
              padding: 24,
              borderRadius: 20,
              maxWidth: 380,
              width: "100%",
              border: "1px solid var(--border)",
              boxShadow: "0 20px 50px rgba(0, 0, 0, 0.25)",
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 16 }}>
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: "50%",
                  background: "var(--scaffold-bg)",
                  border: "2px solid var(--success)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  overflow: "hidden",
                  marginBottom: 8,
                }}
              >
                {brand?.storeLogoUrl || brand?.companyLogoUrl ? (
                  <img
                    src={(brand.storeLogoUrl || brand.companyLogoUrl)!}
                    alt="Logo"
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                ) : (
                  <span style={{ fontSize: 24 }}>🏪</span>
                )}
              </div>
              <h3 style={{ fontSize: 18, fontWeight: 800, margin: 0, color: "var(--text-primary)" }}>
                {brand?.storeName || "ClickOut Store"}
              </h3>
              <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "4px 0 0 0" }}>
                Scan to enter via ClickOut App
              </p>
            </div>

            <div
              style={{
                display: "inline-block",
                padding: 12,
                background: "#ffffff",
                borderRadius: 16,
                boxShadow: "0 4px 20px rgba(0, 0, 0, 0.08)",
              }}
            >
              <QRCodeCanvas id="sidebar-qr-canvas" value={qrPayload} size={220} level="H" includeMargin={true} />
            </div>

            <Button
              onClick={async () => {
                const qrCanvas = document.getElementById("sidebar-qr-canvas") as HTMLCanvasElement;
                if (!qrCanvas) return;

                const canvas = document.createElement("canvas");
                canvas.width = 600;
                canvas.height = 850;
                const ctx = canvas.getContext("2d");
                if (!ctx) return;

                // 1. Dark Background
                ctx.fillStyle = "#1A1D1F";
                ctx.beginPath();
                ctx.roundRect(0, 0, 600, 850, 28);
                ctx.fill();

                // 2. Green Accent Border
                ctx.strokeStyle = "#00C853";
                ctx.lineWidth = 10;
                ctx.beginPath();
                ctx.roundRect(5, 5, 590, 840, 24);
                ctx.stroke();

                // 3. Draw Store Logo
                const logoUrl = brand?.storeLogoUrl || brand?.companyLogoUrl;
                let logoDrawn = false;
                if (logoUrl) {
                  try {
                    const img = new Image();
                    img.crossOrigin = "anonymous";
                    img.src = logoUrl;
                    await new Promise((resolve) => {
                      img.onload = resolve;
                      img.onerror = () => resolve(null);
                    });
                    if (img.complete && img.naturalWidth > 0) {
                      ctx.fillStyle = "#FFFFFF";
                      ctx.beginPath();
                      ctx.arc(300, 115, 52, 0, Math.PI * 2);
                      ctx.fill();

                      ctx.save();
                      ctx.beginPath();
                      ctx.arc(300, 115, 48, 0, Math.PI * 2);
                      ctx.closePath();
                      ctx.clip();
                      ctx.drawImage(img, 252, 67, 96, 96);
                      ctx.restore();

                      ctx.strokeStyle = "#00C853";
                      ctx.lineWidth = 3;
                      ctx.beginPath();
                      ctx.arc(300, 115, 52, 0, Math.PI * 2);
                      ctx.stroke();
                      logoDrawn = true;
                    }
                  } catch {}
                }

                if (!logoDrawn) {
                  ctx.textAlign = "center";
                  ctx.font = "52px sans-serif";
                  ctx.fillText("🏪", 300, 130);
                }

                // 4. Store Name ONLY
                const targetStoreName = brand?.storeName || "ClickOut Store";
                ctx.fillStyle = "#FFFFFF";
                ctx.textAlign = "center";
                ctx.font = "bold 40px sans-serif";
                ctx.fillText(targetStoreName, 300, 220);

                // 5. White Box for QR Code
                ctx.fillStyle = "#FFFFFF";
                ctx.beginPath();
                ctx.roundRect(80, 270, 440, 440, 24);
                ctx.fill();

                // 6. Draw QR Code
                ctx.drawImage(qrCanvas, 100, 290, 400, 400);

                // 7. Footer text
                ctx.fillStyle = "#888888";
                ctx.font = "bold 22px sans-serif";
                ctx.fillText("Scan to enter via ClickOut App", 300, 775);

                const cleanName = targetStoreName.replace(/[^a-zA-Z0-9_-]/g, "_");
                const link = document.createElement("a");
                link.download = `ClickOut_QR_${cleanName}.png`;
                link.href = canvas.toDataURL("image/png");
                link.click();
              }}
              style={{ marginTop: 20, width: "100%" }}
            >
              Download Store QR Poster
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}

export function EditStoreButton() {
  const [open, setOpen] = useState(false);
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const activeStore = searchParams.get("store") ?? (session?.user as any)?.storeId ?? (session?.user as any)?.branchCode;

  if (!activeStore) return null;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Edit Store Profile"
        style={{
          width: 38,
          height: 38,
          borderRadius: 10,
          background: "var(--scaffold-bg)",
          border: "1px solid var(--border)",
          color: "var(--text-primary)",
          cursor: "pointer",
          fontSize: 16,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "all 0.15s ease",
        }}
      >
        ✏️
      </button>
      {open && <EditStoreForm storeId={activeStore} onClose={() => setOpen(false)} />}
    </>
  );
}

export function InvoiceSettingsButton() {
  const [open, setOpen] = useState(false);
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const activeStore = searchParams.get("store") ?? (session?.user as any)?.storeId ?? (session?.user as any)?.branchCode;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Invoice & Receipt Rules"
        style={{
          width: 38,
          height: 38,
          borderRadius: 10,
          background: "var(--scaffold-bg)",
          border: "1px solid var(--border)",
          color: "var(--text-primary)",
          cursor: "pointer",
          fontSize: 16,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "all 0.15s ease",
        }}
      >
        🧾
      </button>
      {open && <InvoiceSettingsModal onClose={() => setOpen(false)} branchCode={activeStore} />}
    </>
  );
}

export function CompanyEditButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Edit Company Profile"
        style={{
          width: 38,
          height: 38,
          borderRadius: 10,
          background: "transparent",
          border: "1px solid var(--border)",
          color: "var(--text-primary)",
          cursor: "pointer",
          fontSize: 16,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        🏢
      </button>
      {open && <CompanyProfileForm onClose={() => setOpen(false)} />}
    </>
  );
}

export function AddStoreButton() {
  return <CreateStoreForm asIcon={true} />;
}

function MenuItem({
  icon,
  label,
  onClick,
  color,
}: {
  icon: string;
  label: string;
  onClick: () => void;
  color?: string;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 16px",
        cursor: "pointer",
        color: color ?? "var(--text-primary)",
        fontSize: 13,
        fontWeight: 600,
        transition: "background 0.15s ease",
      }}
      onMouseEnter={(e) =>
        (e.currentTarget.style.background = "color-mix(in srgb, var(--text-primary) 6%, transparent)")
      }
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      <span style={{ fontSize: 16 }}>{icon}</span> {label}
    </div>
  );
}

export function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  if (!mounted) return null;

  return createPortal(
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        padding: 16,
        backdropFilter: "blur(4px)",
      }}
      onClick={onClose}
    >
      <div onClick={(e) => e.stopPropagation()}>{children}</div>
    </div>,
    document.body
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
      const res = await updateTenantProfile({
        companyName: form.get("companyName") as string,
        ownerName: form.get("ownerName") as string,
      });
      if (!res.ok) setError(res.error ?? "Failed");
      else onClose();
    });
  }

  return (
    <Modal onClose={onClose}>
      <Card style={{ width: 380, borderRadius: 18 }}>
        <h3 style={{ fontWeight: 800, fontSize: 17, marginBottom: 16, color: "var(--text-primary)" }}>
          Company Profile
        </h3>
        <form onSubmit={handleSubmit} style={{ display: "grid", gap: 12 }}>
          <Input name="companyName" placeholder="Company name" required />
          <Input name="ownerName" placeholder="Owner name" required />
          {error && <ErrorBanner message={error} />}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
            <Button variant="secondary" type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving..." : "Save"}
            </Button>
          </div>
        </form>
      </Card>
    </Modal>
  );
}