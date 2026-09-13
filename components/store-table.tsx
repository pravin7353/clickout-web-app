"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { StoreRow } from "@/lib/services/store-service";
import { toggleStoreSuspension, removeStore } from "@/actions/store";
import { getBrandInfo } from "@/actions/brand";
import { EditStoreForm } from "@/components/edit-store-form";
import { Modal } from "@/components/profile-menu";
import { Card, Button, Badge } from "@/components/ui";

export function StoreTable({ stores, tenantId }: { stores: StoreRow[]; tenantId?: string }) {
  const [editingStoreId, setEditingStoreId] = useState<string | null>(null);
  const [qrStore, setQrStore] = useState<StoreRow | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (qrStore) {
      getBrandInfo(qrStore.branchCode)
        .then((res) => {
          if (active && res.ok) {
            setLogoUrl(res.storeLogoUrl || res.companyLogoUrl || null);
          }
        })
        .catch(() => {
          if (active) setLogoUrl(null);
        });
    } else {
      setLogoUrl(null);
    }
    return () => {
      active = false;
    };
  }, [qrStore]);

  // Custom confirmation modal state
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    type: "pause" | "resume" | "delete" | null;
    storeId: string | null;
    storeName: string;
  }>({ isOpen: false, type: null, storeId: null, storeName: "" });

  const openConfirm = (type: "pause" | "resume" | "delete", id: string, name: string) => {
    setConfirmDialog({ isOpen: true, type, storeId: id, storeName: name });
  };

  const executeAction = async () => {
    const { type, storeId } = confirmDialog;
    if (!storeId || !type) return;

    setLoadingId(storeId);
    setConfirmDialog({ isOpen: false, type: null, storeId: null, storeName: "" });

    if (type === "delete") {
      await removeStore(storeId);
    } else {
      await toggleStoreSuspension(storeId, type === "pause" ? "ACTIVE" : "SUSPENDED");
    }
    
    setLoadingId(null);
  };

  return (
    <div style={{ overflowX: "auto", background: "var(--card-bg)", borderRadius: 12, border: "1px solid var(--border)", position: "relative" }}>
      <table className="co-table" style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
        <thead>
          <tr style={{ borderBottom: "1px solid var(--border)", background: "var(--scaffold-bg)" }}>
            <th style={{ padding: "14px 16px" }}>Store Name</th>
            <th style={{ padding: "14px 16px" }}>Branch Code</th>
            <th style={{ padding: "14px 16px" }}>City</th>
            <th style={{ padding: "14px 16px" }}>Status</th>
            <th style={{ padding: "14px 16px", textAlign: "right" }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {stores.map((s) => (
            <tr key={s.id} style={{ borderBottom: "1px solid var(--border)" }}>
              <td style={{ padding: "14px 16px", fontWeight: 700, color: "var(--text-primary)" }}>{s.storeName}</td>
              <td style={{ padding: "14px 16px", fontFamily: "monospace", color: "var(--text-secondary)" }}>{s.branchCode}</td>
              <td style={{ padding: "14px 16px", color: "var(--text-secondary)" }}>{s.city || "—"}</td>
              <td style={{ padding: "14px 16px" }}>
                <span
                  style={{
                    background: s.isActive ? "color-mix(in srgb, var(--success) 15%, transparent)" : "color-mix(in srgb, var(--warning, #f59e0b) 15%, transparent)",
                    color: s.isActive ? "var(--success)" : "var(--warning, #f59e0b)",
                    padding: "4px 10px",
                    borderRadius: 6,
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  {s.status}
                </span>
              </td>
              <td style={{ padding: "14px 16px" }}>
                <div style={{ display: "flex", gap: 14, alignItems: "center", justifyContent: "flex-end" }}>
                  {/* Enter Store */}
                  <Link
                    href={`/dashboard?store=${s.branchCode}`}
                    title="Enter Store Session"
                    style={{ color: "var(--text-primary)", display: "flex", opacity: 0.8 }}
                    onMouseEnter={e => e.currentTarget.style.opacity="1"}
                    onMouseLeave={e => e.currentTarget.style.opacity="0.8"}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>
                  </Link>

                  {/* QR Entry Modal Button */}
                  <button
                    onClick={() => setQrStore(s)}
                    title="View In-Store Entry QR"
                    style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0, display: "flex", color: "var(--primary)" }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
                  </button>

                  {/* Edit Store Profile */}
                  <button
                    onClick={() => setEditingStoreId(s.id)}
                    disabled={loadingId === s.id}
                    title="Edit Store Profile"
                    style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0, display: "flex", color: "#3B82F6" }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
                  </button>

                  {/* Pause / Resume */}
                  <button
                    onClick={() => openConfirm(s.isActive ? "pause" : "resume", s.id, s.storeName)}
                    disabled={loadingId === s.id}
                    title={s.isActive ? "Pause Store" : "Resume Store"}
                    style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0, display: "flex" }}
                  >
                    {s.isActive ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="#FACC15"><circle cx="12" cy="12" r="12"/><rect x="9" y="7" width="2" height="10" fill="#1A1A1A" rx="1"/><rect x="13" y="7" width="2" height="10" fill="#1A1A1A" rx="1"/></svg>
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="#FACC15"><circle cx="12" cy="12" r="12"/><polygon points="10 7 16 12 10 17" fill="#1A1A1A"/></svg>
                    )}
                  </button>

                  {/* Delete */}
                  <button
                    onClick={() => openConfirm("delete", s.id, s.storeName)}
                    disabled={loadingId === s.id}
                    title="Delete Store"
                    style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0, display: "flex", color: "#EF4444" }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Edit Store Modal */}
      {editingStoreId && <EditStoreForm storeId={editingStoreId} onClose={() => setEditingStoreId(null)} />}

      {/* Store Entrance QR Modal */}
      {qrStore && (
        <Modal onClose={() => setQrStore(null)}>
          <div style={{ width: 380, maxWidth: "94vw" }}>
            <style>{`
              @media print {
                body * { visibility: hidden !important; }
                #qr-standee, #qr-standee * { visibility: visible !important; }
                #qr-standee {
                  position: absolute !important;
                  top: 0 !important;
                  left: 0 !important;
                  width: 100% !important;
                  box-shadow: none !important;
                  border-radius: 0 !important;
                  -webkit-print-color-adjust: exact !important;
                  print-color-adjust: exact !important;
                }
                @page { margin: 0; }
                .no-print { display: none !important; }
              }
            `}</style>

            {/* Printable Standee Card */}
            <div
              id="qr-standee"
              style={{
                background: "#161616",
                border: "2px solid #10B981",
                borderRadius: 24,
                padding: "32px 24px",
                textAlign: "center",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 18,
                boxShadow: "0 20px 50px rgba(0, 0, 0, 0.6)",
                color: "#FFFFFF",
              }}
            >
              {/* Centered Circular Logo */}
              <div
                style={{
                  width: 68,
                  height: 68,
                  borderRadius: "50%",
                  background: "#222222",
                  border: "2px solid #10B981",
                  overflow: "hidden",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: "0 4px 14px rgba(16, 185, 129, 0.2)",
                  flexShrink: 0,
                }}
              >
                {logoUrl ? (
                  <img
                    src={logoUrl}
                    alt="Store Logo"
                    style={{ width: "100%", height: "100%", objectFit: "contain" }}
                  />
                ) : (
                  <div
                    style={{
                      width: "100%",
                      height: "100%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: "linear-gradient(135deg, #10B981, #059669)",
                      color: "#FFFFFF",
                      fontWeight: 900,
                      fontSize: 20,
                      letterSpacing: "0.5px",
                    }}
                  >
                    CO
                  </div>
                )}
              </div>

              {/* Store Name in Bold */}
              <div>
                <h3
                  style={{
                    margin: 0,
                    fontSize: 20,
                    fontWeight: 800,
                    color: "#FFFFFF",
                    letterSpacing: "-0.3px",
                    lineHeight: 1.2,
                  }}
                >
                  {qrStore.storeName}
                </h3>
                <p
                  style={{
                    margin: "6px 0 0 0",
                    fontSize: 12,
                    color: "#9CA3AF",
                    fontFamily: "monospace",
                    letterSpacing: "0.5px",
                  }}
                >
                  BRANCH: {qrStore.branchCode}
                </p>
              </div>

              {/* QR Code in White Rounded Box */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                  padding: 16,
                  background: "#FFFFFF",
                  borderRadius: 16,
                  boxShadow: "0 8px 24px rgba(0, 0, 0, 0.3)",
                }}
              >
                <QRCodeSVG
                  value={`https://app.clickout.in/entry?t=${tenantId || ""}&b=${qrStore.branchCode}&s=${qrStore.branchCode}`}
                  size={190}
                  level="H"
                />
              </div>

              {/* Footer Caption */}
              <div>
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "6px 14px",
                    borderRadius: 20,
                    background: "rgba(16, 185, 129, 0.12)",
                    border: "1px solid rgba(16, 185, 129, 0.3)",
                    color: "#10B981",
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  <span>📱</span>
                  <span>Scan to enter via ClickOut App</span>
                </div>
              </div>
            </div>

            {/* Non-printable action buttons outside the #qr-standee container */}
            <div
              className="no-print"
              style={{
                display: "flex",
                justifyContent: "center",
                gap: 12,
                marginTop: 16,
              }}
            >
              <Button variant="secondary" onClick={() => setQrStore(null)}>
                Close
              </Button>
              <Button variant="primary" onClick={() => window.print()}>
                🖨️ Print QR Standee
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Custom Confirmation Modal */}
      {confirmDialog.isOpen && (
        <Modal onClose={() => setConfirmDialog({ isOpen: false, type: null, storeId: null, storeName: "" })}>
          <Card style={{ width: 340, textAlign: "center" }}>
            <div style={{ fontSize: 28, marginBottom: 16 }}>
              {confirmDialog.type === "delete" ? "🗑️" : confirmDialog.type === "pause" ? "⏸️" : "▶️"}
            </div>
            <h3 style={{ margin: "0 0 8px 0", fontSize: 16, color: "var(--text-primary)" }}>
              {confirmDialog.type === "delete" ? "Delete Store?" : confirmDialog.type === "pause" ? "Pause Store?" : "Resume Store?"}
            </h3>
            <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 24 }}>
              Are you sure you want to {confirmDialog.type} operations for &ldquo;{confirmDialog.storeName}&rdquo;?
            </p>
            <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
              <Button variant="secondary" type="button" onClick={() => setConfirmDialog({ isOpen: false, type: null, storeId: null, storeName: "" })}>
                Cancel
              </Button>
              <Button
                variant={confirmDialog.type === "delete" ? "danger" : "primary"}
                onClick={executeAction}
              >
                Confirm
              </Button>
            </div>
          </Card>
        </Modal>
      )}
    </div>
  );
}