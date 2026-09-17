"use client";

import { useState, useTransition, useEffect } from "react";
import { updateTenantProfile, getTenantProfile } from "@/actions/tenant";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/profile-menu";

interface TenantProfileData {
  companyName?: string;
  ownerName: string;
  phone: string;
  email: string;
  recoveryEmail?: string;
}

interface TenantProfileEditModalProps {
  initialData?: TenantProfileData;
  onClose?: () => void;
}

export function TenantProfileEditModal({ initialData, onClose }: TenantProfileEditModalProps) {
  const isControlled = typeof onClose === "function";
  const [isOpen, setIsOpen] = useState(isControlled);
  const [isLoading, setIsLoading] = useState(!initialData);

  const [companyName, setCompanyName] = useState(initialData?.companyName || "");
  const [ownerName, setOwnerName] = useState(initialData?.ownerName || "");
  const [phone, setPhone] = useState(initialData?.phone || "");
  const [email, setEmail] = useState(initialData?.email || "");
  const [recoveryEmail, setRecoveryEmail] = useState(initialData?.recoveryEmail || "");

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  useEffect(() => {
    if (!initialData) {
      setIsLoading(true);
      getTenantProfile().then((res) => {
        if (res.ok && res.data) {
          setCompanyName(res.data.companyName || "");
          setOwnerName(res.data.ownerName || "");
          setPhone(res.data.phone || "");
          setEmail(res.data.email || "");
          setRecoveryEmail(res.data.recoveryEmail || "");
        }
        setIsLoading(false);
      });
    } else {
      setCompanyName(initialData.companyName || "");
      setOwnerName(initialData.ownerName || "");
      setPhone(initialData.phone || "");
      setEmail(initialData.email || "");
      setRecoveryEmail(initialData.recoveryEmail || "");
      setIsLoading(false);
    }
  }, [initialData]);

  function handleOpen() {
    if (initialData) {
      setCompanyName(initialData.companyName || "");
      setOwnerName(initialData.ownerName);
      setPhone(initialData.phone);
      setEmail(initialData.email);
      setRecoveryEmail(initialData.recoveryEmail || "");
    }
    setError(null);
    setSuccess(null);
    setIsOpen(true);
  }

  function handleClose() {
    if (isPending) return;
    setIsOpen(false);
    onClose?.();
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!companyName.trim()) {
      setError("Company name cannot be empty.");
      return;
    }
    if (!ownerName.trim()) {
      setError("Owner name cannot be empty.");
      return;
    }
    const cleanPhone = phone.trim();
    if (!/^\d{10}$/.test(cleanPhone)) {
      setError("Phone number must be exactly 10 digits.");
      return;
    }
    const cleanEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setError("Please enter a valid business email address.");
      return;
    }
    const cleanRecoveryEmail = recoveryEmail.trim().toLowerCase();
    if (cleanRecoveryEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanRecoveryEmail)) {
      setError("Please enter a valid alternate login email address.");
      return;
    }

    startTransition(async () => {
      const res = await updateTenantProfile({
        companyName: companyName.trim(),
        ownerName: ownerName.trim(),
        phone: cleanPhone,
        email: cleanEmail,
        recoveryEmail: cleanRecoveryEmail,
      });

      if (!res.ok) {
        setError(res.error || "Failed to update profile.");
      } else {
        setSuccess("Profile updated successfully!");
        router.refresh();
        setTimeout(() => {
          setIsOpen(false);
          onClose?.();
        }, 600);
      }
    });
  }

  return (
    <>
      {!isControlled && (
        <button
          type="button"
          onClick={handleOpen}
          title="Edit Organization Profile"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            padding: "3px 9px",
            borderRadius: 6,
            border: "1px solid var(--border)",
            background: "color-mix(in srgb, var(--primary) 10%, var(--card-bg))",
            color: "var(--text-primary)",
            fontSize: 11,
            fontWeight: 700,
            cursor: "pointer",
            transition: "all 0.15s ease",
            userSelect: "none",
          }}
        >
          <span>✏️</span>
          <span>Edit Profile</span>
        </button>
      )}

      {isOpen && (
        <Modal onClose={handleClose}>
          <div
            style={{
              width: 440,
              maxWidth: "94vw",
              background: "var(--card-bg)",
              borderRadius: 20,
              border: "1px solid var(--border)",
              boxShadow: "0 28px 70px rgba(0, 0, 0, 0.55)",
              overflow: "hidden",
            }}
          >
            {/* Header */}
            <div
              style={{
                padding: "18px 22px",
                borderBottom: "1px solid var(--border)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                background: "color-mix(in srgb, var(--card-bg) 95%, var(--scaffold-bg))",
              }}
            >
              <div>
                <h3
                  style={{
                    fontSize: 16,
                    fontWeight: 800,
                    margin: 0,
                    color: "var(--text-primary)",
                  }}
                >
                  Edit Organization Profile
                </h3>
                <p
                  style={{
                    fontSize: 12,
                    color: "var(--text-secondary)",
                    margin: "3px 0 0 0",
                  }}
                >
                  Update owner and public business contact details
                </p>
              </div>
              <button
                type="button"
                onClick={handleClose}
                disabled={isPending}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--text-secondary)",
                  fontSize: 18,
                  cursor: isPending ? "not-allowed" : "pointer",
                  padding: 4,
                  lineHeight: 1,
                }}
              >
                ✕
              </button>
            </div>

            {isLoading ? (
              <div style={{ padding: "40px 22px", textAlign: "center", color: "var(--text-secondary)", fontSize: 13 }}>
                Loading organization profile...
              </div>
            ) : (
              /* Form */
              <form onSubmit={handleSubmit}>
              <div style={{ padding: "20px 22px", display: "grid", gap: 14 }}>
                {error && (
                  <div
                    style={{
                      padding: "10px 14px",
                      borderRadius: 8,
                      background: "color-mix(in srgb, var(--danger) 15%, transparent)",
                      border: "1px solid var(--danger)",
                      color: "var(--danger)",
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                  >
                    ⚠️ {error}
                  </div>
                )}

                {success && (
                  <div
                    style={{
                      padding: "10px 14px",
                      borderRadius: 8,
                      background: "color-mix(in srgb, var(--success) 15%, transparent)",
                      border: "1px solid var(--success)",
                      color: "var(--success)",
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                  >
                    ✅ {success}
                  </div>
                )}

                {/* Company Name */}
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: 11,
                      fontWeight: 700,
                      color: "var(--text-secondary)",
                      marginBottom: 5,
                      textTransform: "uppercase",
                      letterSpacing: "0.5px",
                    }}
                  >
                    Company Name *
                  </label>
                  <input
                    type="text"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    required
                    placeholder="e.g. Acme Retail Pvt Ltd"
                    style={{
                      width: "100%",
                      padding: "9px 12px",
                      borderRadius: 8,
                      border: "1px solid var(--border)",
                      background: "var(--scaffold-bg)",
                      color: "var(--text-primary)",
                      fontSize: 13,
                      boxSizing: "border-box",
                      outline: "none",
                    }}
                  />
                  <p
                    style={{
                      margin: "6px 0 0 0",
                      fontSize: 11,
                      color: "var(--text-secondary)",
                      lineHeight: 1.4,
                    }}
                  >
                    This is your registered business name — shown as your organization&apos;s display name throughout the app.
                  </p>
                </div>

                {/* Owner Name */}
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: 11,
                      fontWeight: 700,
                      color: "var(--text-secondary)",
                      marginBottom: 5,
                      textTransform: "uppercase",
                      letterSpacing: "0.5px",
                    }}
                  >
                    Owner Name *
                  </label>
                  <input
                    type="text"
                    value={ownerName}
                    onChange={(e) => setOwnerName(e.target.value)}
                    required
                    placeholder="e.g. Rahul Sharma"
                    style={{
                      width: "100%",
                      padding: "9px 12px",
                      borderRadius: 8,
                      border: "1px solid var(--border)",
                      background: "var(--scaffold-bg)",
                      color: "var(--text-primary)",
                      fontSize: 13,
                      boxSizing: "border-box",
                      outline: "none",
                    }}
                  />
                </div>

                {/* Phone */}
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: 11,
                      fontWeight: 700,
                      color: "var(--text-secondary)",
                      marginBottom: 5,
                      textTransform: "uppercase",
                      letterSpacing: "0.5px",
                    }}
                  >
                    Business Phone (10 digits) *
                  </label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    required
                    maxLength={10}
                    placeholder="9876543210"
                    style={{
                      width: "100%",
                      padding: "9px 12px",
                      borderRadius: 8,
                      border: "1px solid var(--border)",
                      background: "var(--scaffold-bg)",
                      color: "var(--text-primary)",
                      fontSize: 13,
                      boxSizing: "border-box",
                      outline: "none",
                    }}
                  />
                </div>

                {/* Email */}
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: 11,
                      fontWeight: 700,
                      color: "var(--text-secondary)",
                      marginBottom: 5,
                      textTransform: "uppercase",
                      letterSpacing: "0.5px",
                    }}
                  >
                    Business Email *
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    placeholder="owner@business.com"
                    style={{
                      width: "100%",
                      padding: "9px 12px",
                      borderRadius: 8,
                      border: "1px solid var(--border)",
                      background: "var(--scaffold-bg)",
                      color: "var(--text-primary)",
                      fontSize: 13,
                      boxSizing: "border-box",
                      outline: "none",
                    }}
                  />
                  <p
                    style={{
                      margin: "6px 0 0 0",
                      fontSize: 11,
                      color: "var(--text-secondary)",
                      lineHeight: 1.4,
                    }}
                  >
                    ℹ️ This is your business contact email shown on invoices and reports — it does not change your login email.
                  </p>
                </div>

                {/* Section Divider: Alternate Login Access */}
                <div
                  style={{
                    borderTop: "1px solid var(--border)",
                    paddingTop: 14,
                    marginTop: 4,
                    display: "grid",
                    gap: 10,
                  }}
                >
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 13 }}>🔑</span>
                      <h4
                        style={{
                          margin: 0,
                          fontSize: 12,
                          fontWeight: 800,
                          color: "var(--text-primary)",
                          textTransform: "uppercase",
                          letterSpacing: "0.5px",
                        }}
                      >
                        Alternate Login Access
                      </h4>
                    </div>
                    <p
                      style={{
                        margin: "2px 0 0 0",
                        fontSize: 11,
                        color: "var(--text-secondary)",
                      }}
                    >
                      Authorize an additional administrator account to access this tenant.
                    </p>
                  </div>

                  <div>
                    <label
                      style={{
                        display: "block",
                        fontSize: 11,
                        fontWeight: 700,
                        color: "var(--text-secondary)",
                        marginBottom: 5,
                        textTransform: "uppercase",
                        letterSpacing: "0.5px",
                      }}
                    >
                      Alternate Login Email (optional)
                    </label>
                    <input
                      type="email"
                      value={recoveryEmail}
                      onChange={(e) => setRecoveryEmail(e.target.value)}
                      placeholder="partner@business.com (optional)"
                      style={{
                        width: "100%",
                        padding: "9px 12px",
                        borderRadius: 8,
                        border: "1px solid var(--border)",
                        background: "var(--scaffold-bg)",
                        color: "var(--text-primary)",
                        fontSize: 13,
                        boxSizing: "border-box",
                        outline: "none",
                      }}
                    />
                    <p
                      style={{
                        margin: "6px 0 0 0",
                        fontSize: 11,
                        color: "var(--text-secondary)",
                        lineHeight: 1.4,
                      }}
                    >
                      ℹ️ Add a second email that can also log in as admin for this business. Do NOT use this to change your current login — this only ADDS a new one alongside it.
                    </p>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div
                style={{
                  padding: "14px 22px",
                  borderTop: "1px solid var(--border)",
                  background: "color-mix(in srgb, var(--card-bg) 95%, var(--scaffold-bg))",
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: 10,
                }}
              >
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={isPending}
                  style={{
                    padding: "8px 14px",
                    borderRadius: 8,
                    fontSize: 12,
                    fontWeight: 600,
                    background: "transparent",
                    border: "1px solid var(--border)",
                    color: "var(--text-secondary)",
                    cursor: isPending ? "not-allowed" : "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  style={{
                    padding: "8px 18px",
                    borderRadius: 8,
                    fontSize: 12,
                    fontWeight: 800,
                    background: "var(--cta-bg)",
                    color: "var(--cta-text)",
                    border: "none",
                    cursor: isPending ? "not-allowed" : "pointer",
                    opacity: isPending ? 0.7 : 1,
                  }}
                >
                  {isPending ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
