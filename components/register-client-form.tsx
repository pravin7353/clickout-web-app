"use client";

import { useState, useTransition } from "react";
import { registerClient } from "@/actions/register-client";

export function RegisterClientForm() {
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(""); setSuccess("");
    const form = new FormData(e.currentTarget);
    const payload = Object.fromEntries(form.entries()) as Record<string, string>;

    startTransition(async () => {
      const res = await registerClient(payload);
      if (!res.ok) setError(res.error ?? "Failed");
      else { setSuccess(`Registered! Tenant ID: ${res.tenantId}`); (document.getElementById("register-form") as HTMLFormElement)?.reset(); }
    });
  }

  return (
    <div style={{ padding: 24, fontFamily: "sans-serif", maxWidth: 480 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 20 }}>Register New Client</h1>
      <form id="register-form" onSubmit={handleSubmit} style={{ display: "grid", gap: 10 }}>
        <strong>Business</strong>
        <input name="storeName" placeholder="Store / Company name" required style={{ padding: 8 }} />
        <input name="ownerName" placeholder="Owner name" required style={{ padding: 8 }} />
        <input name="year" type="number" placeholder="Established year" style={{ padding: 8 }} />
        <select name="businessType" style={{ padding: 8 }}>
          <option value="RETAIL">Retail</option>
          <option value="RESTAURANT">Restaurant</option>
          <option value="SERVICES">Services</option>
        </select>

        <strong>Contact</strong>
        <input name="email" type="email" placeholder="Admin email" required style={{ padding: 8 }} />
        <input name="phone" placeholder="Phone (10 digit)" required style={{ padding: 8 }} />

        <strong>Location</strong>
        <input name="address" placeholder="Address" style={{ padding: 8 }} />
        <input name="city" placeholder="City" style={{ padding: 8 }} />
        <input name="state" placeholder="State" style={{ padding: 8 }} />
        <input name="pincode" placeholder="Pincode" style={{ padding: 8 }} />

        <strong>KYC</strong>
        <input name="pan" placeholder="PAN number" required style={{ padding: 8 }} />
        <input name="gst" placeholder="GSTIN (optional)" style={{ padding: 8 }} />

        <strong>Bank details</strong>
        <input name="accountName" placeholder="Account holder name" style={{ padding: 8 }} />
        <input name="accountNo" placeholder="Account number" style={{ padding: 8 }} />
        <input name="ifsc" placeholder="IFSC code" style={{ padding: 8 }} />
        <input name="upi" placeholder="UPI ID" style={{ padding: 8 }} />

        <label style={{ fontSize: 13 }}><input type="checkbox" name="tcAccepted" required /> I accept Terms & Conditions</label>
        <label style={{ fontSize: 13 }}><input type="checkbox" name="dataConsent" required /> I consent to data processing</label>
        <label style={{ fontSize: 13 }}><input type="checkbox" name="settlementAgreed" required /> I agree to settlement terms</label>

        {error && <p style={{ color: "#ef4444", fontSize: 13 }}>🚨 {error}</p>}
        {success && <p style={{ color: "#22c55e", fontSize: 13 }}>✅ {success}</p>}

        <button type="submit" disabled={isPending} style={{ padding: 10, background: "#22c55e", color: "#000", border: "none", borderRadius: 6, fontWeight: 700 }}>
          {isPending ? "Registering..." : "Register Client"}
        </button>
      </form>
    </div>
  );
}