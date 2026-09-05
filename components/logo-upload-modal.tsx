"use client";

import { useState, useRef, useTransition } from "react";
import { uploadBrandLogo } from "@/actions/brand";
import { Modal } from "@/components/profile-menu";
import { Button, Card, ErrorBanner } from "@/components/ui";

interface LogoUploadModalProps {
  onClose: () => void;
  currentCompanyLogoUrl?: string | null;
  currentStoreLogoUrl?: string | null;
  storeName?: string | null;
  branchCode?: string | null;
  onSuccess?: () => void;
}

export function LogoUploadModal({
  onClose,
  currentCompanyLogoUrl,
  currentStoreLogoUrl,
  storeName,
  branchCode,
  onSuccess,
}: LogoUploadModalProps) {
  const [activeTab, setActiveTab] = useState<"company" | "store">("company");
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [isPending, startTransition] = useTransition();

  // Previews
  const [companyPreview, setCompanyPreview] = useState<string | null>(currentCompanyLogoUrl || null);
  const [storePreview, setStorePreview] = useState<string | null>(currentStoreLogoUrl || null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError("Please select a valid image file (PNG, JPG, SVG, WebP).");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError("File size exceeds 5MB limit.");
      return;
    }

    setError("");
    setSelectedFile(file);

    const reader = new FileReader();
    reader.onload = () => {
      if (activeTab === "company") {
        setCompanyPreview(reader.result as string);
      } else {
        setStorePreview(reader.result as string);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleUpload = () => {
    if (!selectedFile) {
      setError("Please choose an image file to upload.");
      return;
    }

    setError("");
    setSuccessMsg("");

    const formData = new FormData();
    formData.append("file", selectedFile);
    formData.append("type", activeTab);
    if (branchCode) {
      formData.append("branchCode", branchCode);
    }

    startTransition(async () => {
      const res = await uploadBrandLogo(formData);
      if (!res.ok) {
        setError(res.error || "Failed to upload logo.");
      } else {
        setSuccessMsg(
          `${activeTab === "company" ? "Company" : "Store"} Logo updated successfully!`
        );
        setSelectedFile(null);
        if (onSuccess) onSuccess();
      }
    });
  };

  return (
    <Modal onClose={onClose}>
      <Card
        style={{
          width: "100%",
          maxWidth: 520,
          background: "var(--card-bg)",
          borderRadius: 20,
          border: "1px solid var(--border)",
          boxShadow: "0 20px 50px rgba(0, 0, 0, 0.25)",
          padding: 0,
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "20px 24px",
            borderBottom: "1px solid var(--border)",
            background: "var(--scaffold-bg)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 22 }}>🖼️</span>
            <div>
              <h3 style={{ fontSize: 17, fontWeight: 800, margin: 0, color: "var(--text-primary)" }}>
                Brand Assets & Logos
              </h3>
              <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "2px 0 0 0" }}>
                Upload logos for your company profile and store invoices.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--text-secondary)",
              cursor: "pointer",
              fontSize: 20,
              padding: 4,
            }}
          >
            ✕
          </button>
        </div>

        {/* Tab Switcher */}
        <div
          style={{
            display: "flex",
            borderBottom: "1px solid var(--border)",
            background: "var(--card-bg)",
          }}
        >
          <button
            onClick={() => {
              setActiveTab("company");
              setSelectedFile(null);
              setError("");
              setSuccessMsg("");
            }}
            style={{
              flex: 1,
              padding: "13px 16px",
              background: "transparent",
              border: "none",
              borderBottom: activeTab === "company" ? "2px solid var(--success)" : "2px solid transparent",
              color: activeTab === "company" ? "var(--text-primary)" : "var(--text-secondary)",
              fontWeight: activeTab === "company" ? 800 : 600,
              fontSize: 13,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              transition: "all 0.15s ease",
            }}
          >
            <span>🏢</span> Company HQ Logo
          </button>
          <button
            onClick={() => {
              setActiveTab("store");
              setSelectedFile(null);
              setError("");
              setSuccessMsg("");
            }}
            style={{
              flex: 1,
              padding: "13px 16px",
              background: "transparent",
              border: "none",
              borderBottom: activeTab === "store" ? "2px solid var(--success)" : "2px solid transparent",
              color: activeTab === "store" ? "var(--text-primary)" : "var(--text-secondary)",
              fontWeight: activeTab === "store" ? 800 : 600,
              fontSize: 13,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              transition: "all 0.15s ease",
            }}
          >
            <span>🏪</span> Store Logo {storeName ? `(${storeName})` : ""}
          </button>
        </div>

        {/* Content Area */}
        <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 18 }}>
          {error && <ErrorBanner message={error} />}

          {successMsg && (
            <div
              style={{
                padding: "10px 14px",
                borderRadius: 10,
                background: "color-mix(in srgb, var(--success) 12%, transparent)",
                border: "1px solid color-mix(in srgb, var(--success) 30%, transparent)",
                color: "var(--success)",
                fontSize: 13,
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <span>✅</span> {successMsg}
            </div>
          )}

          {/* Logo Preview Card */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 18,
              padding: 16,
              borderRadius: 14,
              background: "var(--scaffold-bg)",
              border: "1px solid var(--border)",
            }}
          >
            <div
              style={{
                width: 76,
                height: 76,
                borderRadius: "50%",
                background: "var(--card-bg)",
                border: "2px solid var(--border)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                overflow: "hidden",
                flexShrink: 0,
                boxShadow: "0 4px 12px rgba(0, 0, 0, 0.08)",
              }}
            >
              {(activeTab === "company" ? companyPreview : storePreview) ? (
                <img
                  src={(activeTab === "company" ? companyPreview : storePreview)!}
                  alt="Logo Preview"
                  style={{ width: "100%", height: "100%", objectFit: "contain" }}
                />
              ) : (
                <span style={{ fontSize: 30, color: "var(--text-secondary)" }}>
                  {activeTab === "company" ? "🏢" : "🏪"}
                </span>
              )}
            </div>

            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: "var(--text-primary)" }}>
                {activeTab === "company" ? "Company HQ Brand Logo" : "Store & Receipt Logo"}
              </div>
              <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "4px 0 0 0", lineHeight: 1.4 }}>
                {activeTab === "company"
                  ? "Appears on Tenant HQ dashboard, admin profile, and company reports."
                  : "Appears on customer billing receipts, invoices, and the Store Entry QR Poster."}
              </p>
            </div>
          </div>

          {/* File Picker Section */}
          <div
            onClick={() => fileInputRef.current?.click()}
            style={{
              border: "2px dashed var(--border)",
              borderRadius: 14,
              padding: "24px 16px",
              textAlign: "center",
              cursor: "pointer",
              background: "color-mix(in srgb, var(--card-bg) 50%, transparent)",
              transition: "all 0.15s ease",
            }}
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              style={{ display: "none" }}
            />
            <span style={{ fontSize: 32, display: "block", marginBottom: 8 }}>📁</span>
            <div style={{ fontWeight: 700, fontSize: 13, color: "var(--text-primary)" }}>
              {selectedFile ? selectedFile.name : "Click or drag to select new logo"}
            </div>
            <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 4 }}>
              PNG, JPG, SVG or WebP • Recommended size 512x512px (Max 5MB)
            </div>
          </div>

          {/* Footer Actions */}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 6 }}>
            <Button variant="secondary" type="button" onClick={onClose} disabled={isPending}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleUpload}
              disabled={isPending || !selectedFile}
              style={{ minWidth: 120 }}
            >
              {isPending ? "Uploading..." : "Save Logo"}
            </Button>
          </div>
        </div>
      </Card>
    </Modal>
  );
}
