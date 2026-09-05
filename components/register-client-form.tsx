"use client";

import { useState, useTransition } from "react";
import { registerClient } from "@/actions/register-client";
import { Card, Button, Input, Select, ErrorBanner } from "@/components/ui";

const BIZ_TYPES = [
  "Retail Supermarket",
  "Department Store",
  "Consumer Electronics",
  "Pharmacy & Healthcare",
  "Fashion & Apparel",
  "Food & Beverage",
  "Other Retail",
];

const INDIAN_STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh",
  "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka",
  "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram",
  "Nagaland", "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu",
  "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal",
  "Delhi", "Jammu and Kashmir", "Ladakh", "Puducherry"
];

export function RegisterClientForm() {
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState<Record<string, string>>({
    businessType: "Retail Supermarket",
    state: "Delhi",
    year: String(new Date().getFullYear()),
  });

  const [error, setError] = useState("");
  const [registeredTenant, setRegisteredTenant] = useState<{ id: string; branchCode: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  function updateField(key: string, val: string) {
    setFormData((prev) => ({ ...prev, [key]: val }));
  }

  function validateStep(currentStep: number): boolean {
    setError("");
    if (currentStep === 1) {
      if (!formData.storeName?.trim() || !formData.ownerName?.trim() || !formData.email?.trim() || !formData.phone?.trim()) {
        setError("Please complete all required business and contact fields.");
        return false;
      }
      if (!/^\d{10}$/.test(formData.phone.trim())) {
        setError("Please enter a valid 10-digit mobile number.");
        return false;
      }
    } else if (currentStep === 2) {
      if (!formData.pan?.trim()) {
        setError("PAN number is required for Indian tax & KYC compliance.");
        return false;
      }
      if (!formData.address?.trim() || !formData.city?.trim() || !formData.pincode?.trim()) {
        setError("Please complete location address, city, and pincode.");
        return false;
      }
    } else if (currentStep === 3) {
      if (formData.accountNo && formData.accountNo !== formData.confirmAccountNo) {
        setError("Bank Account Number and Confirmation do not match.");
        return false;
      }
    } else if (currentStep === 5) {
      if (!formData.tcAccepted || !formData.dataConsent || !formData.settlementAgreed) {
        setError("All legal and settlement agreements must be acknowledged.");
        return false;
      }
    }
    return true;
  }

  function handleNext() {
    if (validateStep(step)) {
      setStep((prev) => Math.min(5, prev + 1));
    }
  }

  function handlePrev() {
    setError("");
    setStep((prev) => Math.max(1, prev - 1));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validateStep(5)) return;

    setError("");
    startTransition(async () => {
      const res = await registerClient(formData);
      if (!res.ok) {
        setError(res.error || "Client onboarding failed.");
      } else {
        setRegisteredTenant({ id: res.tenantId!, branchCode: res.defaultBranchCode! });
      }
    });
  }

  if (registeredTenant) {
    return (
      <Card style={{ padding: 32, textAlign: "center", display: "grid", gap: 20 }}>
        <div style={{ fontSize: 44 }}>🎉</div>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 800, margin: 0, color: "var(--success)" }}>
            Client Onboarded Successfully!
          </h2>
          <p style={{ margin: "8px 0 0 0", color: "var(--text-secondary)", fontSize: 14 }}>
            Tenant organization provisioned and active on the ClickOut Cloud Network.
          </p>
        </div>

        <div
          style={{
            display: "grid",
            gap: 12,
            padding: 20,
            borderRadius: 12,
            background: "color-mix(in srgb, var(--card-bg) 60%, transparent)",
            border: "1px solid var(--border)",
            maxWidth: 420,
            margin: "0 auto",
            textAlign: "left",
            fontSize: 13,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "var(--text-secondary)" }}>Tenant ID:</span>
            <strong style={{ fontFamily: "monospace" }}>{registeredTenant.id}</strong>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "var(--text-secondary)" }}>Initial Branch Code:</span>
            <strong style={{ fontFamily: "monospace" }}>{registeredTenant.branchCode}</strong>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "var(--text-secondary)" }}>Plan Tier:</span>
            <strong style={{ color: "var(--primary)" }}>PRO (4 Staff, 3 Stores)</strong>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "center", gap: 12 }}>
          <Button
            variant="secondary"
            onClick={() => {
              setRegisteredTenant(null);
              setStep(1);
              setFormData({
                businessType: "Retail Supermarket",
                state: "Delhi",
                year: String(new Date().getFullYear()),
              });
            }}
          >
            Register Another Client
          </Button>
          <Button
            variant="primary"
            onClick={() => { window.location.href = `/tenant-admin`; }}
          >
            Go to Tenant Command Center
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card style={{ display: "grid", gap: 24, padding: 28 }}>
      {/* Wizard Steps Header */}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0, color: "var(--text-primary)" }}>
              Enterprise Client Onboarding
            </h2>
            <p style={{ margin: "2px 0 0 0", fontSize: 13, color: "var(--text-secondary)" }}>
              Provision new retail tenants, initialize multi-store quotas, and configure payment settlement rails.
            </p>
          </div>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--primary)" }}>
            Step {step} of 5
          </div>
        </div>

        {/* Step Progress Bar */}
        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          {[1, 2, 3, 4, 5].map((s) => (
            <div
              key={s}
              style={{
                flex: 1,
                height: 4,
                borderRadius: 2,
                background: s <= step ? "var(--primary)" : "var(--border)",
                transition: "background 0.2s ease",
              }}
            />
          ))}
        </div>
      </div>

      {error && <ErrorBanner message={error} />}

      <form onSubmit={handleSubmit} style={{ display: "grid", gap: 20 }}>
        {/* STEP 1: Business Details */}
        {step === 1 && (
          <div style={{ display: "grid", gap: 14 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>
              1. Business & Contact Profile
            </h3>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>
                  Store / Company Legal Name *
                </label>
                <Input
                  value={formData.storeName || ""}
                  onChange={(e) => updateField("storeName", e.target.value)}
                  placeholder="e.g. Apex Hypermarket LLP"
                  required
                />
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>
                  Owner / Authorized Signatory Name *
                </label>
                <Input
                  value={formData.ownerName || ""}
                  onChange={(e) => updateField("ownerName", e.target.value)}
                  placeholder="e.g. Rajesh Sharma"
                  required
                />
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>
                  Primary Admin Email *
                </label>
                <Input
                  type="email"
                  value={formData.email || ""}
                  onChange={(e) => updateField("email", e.target.value)}
                  placeholder="admin@apexhyper.com"
                  required
                />
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>
                  Phone Number (10 Digit Mobile) *
                </label>
                <Input
                  value={formData.phone || ""}
                  onChange={(e) => updateField("phone", e.target.value)}
                  placeholder="9876543210"
                  required
                />
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>
                  Industry Vertical
                </label>
                <Select
                  value={formData.businessType || BIZ_TYPES[0]}
                  onChange={(e) => updateField("businessType", e.target.value)}
                >
                  {BIZ_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </Select>
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>
                  Established Year
                </label>
                <Input
                  type="number"
                  value={formData.year || ""}
                  onChange={(e) => updateField("year", e.target.value)}
                  placeholder="2020"
                />
              </div>
            </div>
          </div>
        )}

        {/* STEP 2: Location & KYC */}
        {step === 2 && (
          <div style={{ display: "grid", gap: 14 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>
              2. Registered Address & Tax Compliance
            </h3>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>
                  Headquarters Street Address *
                </label>
                <Input
                  value={formData.address || ""}
                  onChange={(e) => updateField("address", e.target.value)}
                  placeholder="Plot 42, Sector 18, Commercial Belt"
                  required
                />
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>
                  City *
                </label>
                <Input
                  value={formData.city || ""}
                  onChange={(e) => updateField("city", e.target.value)}
                  placeholder="Gurugram"
                  required
                />
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>
                  State *
                </label>
                <Select
                  value={formData.state || "Delhi"}
                  onChange={(e) => updateField("state", e.target.value)}
                >
                  {INDIAN_STATES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </Select>
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>
                  Pincode *
                </label>
                <Input
                  value={formData.pincode || ""}
                  onChange={(e) => updateField("pincode", e.target.value)}
                  placeholder="122001"
                  required
                />
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>
                  Business PAN *
                </label>
                <Input
                  value={formData.pan || ""}
                  onChange={(e) => updateField("pan", e.target.value.toUpperCase())}
                  placeholder="ABCDE1234F"
                  required
                />
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>
                  GSTIN (Optional)
                </label>
                <Input
                  value={formData.gst || ""}
                  onChange={(e) => updateField("gst", e.target.value.toUpperCase())}
                  placeholder="07AAAAA0000A1Z5"
                />
              </div>
            </div>
          </div>
        )}

        {/* STEP 3: Banking & Settlement */}
        {step === 3 && (
          <div style={{ display: "grid", gap: 14 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>
              3. Banking & Settlement Rails
            </h3>
            <p style={{ margin: 0, fontSize: 12, color: "var(--text-secondary)" }}>
              Funds from in-store customer UPI & card checkouts are routed to this account.
            </p>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>
                  Bank Account Holder Name
                </label>
                <Input
                  value={formData.accountName || ""}
                  onChange={(e) => updateField("accountName", e.target.value)}
                  placeholder="Apex Hypermarket Current Account"
                />
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>
                  Bank Account Number
                </label>
                <Input
                  value={formData.accountNo || ""}
                  onChange={(e) => updateField("accountNo", e.target.value)}
                  placeholder="9876543210123"
                />
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>
                  Confirm Account Number
                </label>
                <Input
                  value={formData.confirmAccountNo || ""}
                  onChange={(e) => updateField("confirmAccountNo", e.target.value)}
                  placeholder="Re-enter account number"
                />
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>
                  Bank IFSC Code
                </label>
                <Input
                  value={formData.ifsc || ""}
                  onChange={(e) => updateField("ifsc", e.target.value.toUpperCase())}
                  placeholder="HDFC0001234"
                />
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>
                  Settlement Virtual Payment Address (UPI ID)
                </label>
                <Input
                  value={formData.upi || ""}
                  onChange={(e) => updateField("upi", e.target.value)}
                  placeholder="apexhyper@hdfcbank"
                />
              </div>
            </div>
          </div>
        )}

        {/* STEP 4: Store Operations */}
        {step === 4 && (
          <div style={{ display: "grid", gap: 14 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>
              4. Store Operations & Footfall Profile
            </h3>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>
                  Store Opening Time
                </label>
                <Input
                  type="time"
                  value={formData.openTime || "09:00"}
                  onChange={(e) => updateField("openTime", e.target.value)}
                />
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>
                  Store Closing Time
                </label>
                <Input
                  type="time"
                  value={formData.closeTime || "22:00"}
                  onChange={(e) => updateField("closeTime", e.target.value)}
                />
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>
                  Estimated In-Store Staff
                </label>
                <Input
                  type="number"
                  value={formData.empCount || "6"}
                  onChange={(e) => updateField("empCount", e.target.value)}
                />
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>
                  Estimated Monthly Billing Volume
                </label>
                <Select
                  value={formData.volume || "MEDIUM"}
                  onChange={(e) => updateField("volume", e.target.value)}
                >
                  <option value="LOW">Up to ₹5 Lakhs / month</option>
                  <option value="MEDIUM">₹5 Lakhs - ₹25 Lakhs / month</option>
                  <option value="HIGH">₹25 Lakhs - ₹1 Crore / month</option>
                  <option value="ENTERPRISE">₹1 Crore+ / month</option>
                </Select>
              </div>
            </div>
          </div>
        )}

        {/* STEP 5: Legal Agreements */}
        {step === 5 && (
          <div style={{ display: "grid", gap: 14 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>
              5. Legal Compliance & Settlement Authorization
            </h3>

            <div style={{ display: "grid", gap: 12 }}>
              <label
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 10,
                  fontSize: 13,
                  cursor: "pointer",
                  color: "var(--text-primary)",
                }}
              >
                <input
                  type="checkbox"
                  checked={Boolean(formData.tcAccepted)}
                  onChange={(e) => updateField("tcAccepted", e.target.checked ? "true" : "")}
                  style={{ marginTop: 2 }}
                />
                <span>
                  I confirm that the provided entity documents are accurate and I accept the ClickOut Merchant Terms & Conditions.
                </span>
              </label>

              <label
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 10,
                  fontSize: 13,
                  cursor: "pointer",
                  color: "var(--text-primary)",
                }}
              >
                <input
                  type="checkbox"
                  checked={Boolean(formData.dataConsent)}
                  onChange={(e) => updateField("dataConsent", e.target.checked ? "true" : "")}
                  style={{ marginTop: 2 }}
                />
                <span>
                  I consent to processing transaction and customer cart metadata under RBI/NPCI settlement guidelines.
                </span>
              </label>

              <label
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 10,
                  fontSize: 13,
                  cursor: "pointer",
                  color: "var(--text-primary)",
                }}
              >
                <input
                  type="checkbox"
                  checked={Boolean(formData.settlementAgreed)}
                  onChange={(e) => updateField("settlementAgreed", e.target.checked ? "true" : "")}
                  style={{ marginTop: 2 }}
                />
                <span>
                  I authorize automatic T+1 settlement cycles into the designated merchant bank account.
                </span>
              </label>
            </div>
          </div>
        )}

        {/* Navigation Buttons */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12 }}>
          {step > 1 ? (
            <Button variant="secondary" type="button" onClick={handlePrev} disabled={isPending}>
              ← Previous
            </Button>
          ) : <div />}

          {step < 5 ? (
            <Button variant="primary" type="button" onClick={handleNext} disabled={isPending}>
              Next Step →
            </Button>
          ) : (
            <Button variant="primary" type="submit" disabled={isPending}>
              {isPending ? "Provisioning Tenant..." : "Complete Registration & Launch"}
            </Button>
          )}
        </div>
      </form>
    </Card>
  );
}