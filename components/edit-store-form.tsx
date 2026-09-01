"use client";

import { useState, useTransition } from "react";
import { updateStoreProfile } from "@/actions/store";
import { Card, Button, Input, ErrorBanner } from "@/components/ui";
import { Modal } from "@/components/profile-menu";

export function EditStoreForm({ storeId, onClose }: { storeId: string; onClose: () => void }) {
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const form = new FormData(e.currentTarget);
    startTransition(async () => {
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