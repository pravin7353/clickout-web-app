"use client";

import { useState, useTransition } from "react";
import { completeTenantOnboarding } from "@/actions/tenant-onboarding";
import { useRouter } from "next/navigation";
import { Card, Button, Input, ErrorBanner } from "@/components/ui";

export function TenantOnboardingForm() {
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const form = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await completeTenantOnboarding({
        companyName: form.get("companyName") as string,
        hoAddress: form.get("hoAddress") as string,
        hoCity: form.get("hoCity") as string,
        hoState: form.get("hoState") as string,
        hoPincode: form.get("hoPincode") as string,
        gstins: form.get("gstins") as string,
        contactName: form.get("contactName") as string,
        contactPhone: form.get("contactPhone") as string,
        industryType: form.get("industryType") as string,
      });
      if (!res.ok) setError(res.error ?? "Failed");
      else router.refresh();
    });
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--scaffold-bg)", padding: 24 }}>
      <Card style={{ width: 480 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4, color: "var(--text-primary)" }}>Welcome to ClickOut</h1>
        <p style={{ color: "var(--text-secondary)", fontSize: 13, marginBottom: 20 }}>Let&apos;s set up your business before you continue.</p>

        <form onSubmit={handleSubmit} style={{ display: "grid", gap: 10 }}>
          <Input name="companyName" placeholder="Company name" required />
          <Input name="industryType" placeholder="Industry (e.g. Retail, Restaurant)" required />
          <Input name="hoAddress" placeholder="HQ Address" required />
          <div style={{ display: "flex", gap: 10 }}>
            <Input name="hoCity" placeholder="City" required style={{ flex: 1 }} />
            <Input name="hoState" placeholder="State" required style={{ flex: 1 }} />
            <Input name="hoPincode" placeholder="Pincode" required style={{ flex: 1 }} />
          </div>
          <Input name="gstins" placeholder="GSTIN(s), comma-separated" />
          <Input name="contactName" placeholder="Primary contact name" required />
          <Input name="contactPhone" placeholder="Primary contact phone" required />
          {error && <ErrorBanner message={error} />}
          <Button type="submit" disabled={isPending}>{isPending ? "Saving..." : "Complete Setup"}</Button>
        </form>
      </Card>
    </div>
  );
}