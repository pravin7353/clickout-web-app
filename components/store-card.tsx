"use client";

import { useTransition } from "react";
import { toggleStoreSuspension, removeStore } from "@/actions/store";
import { StoreRow } from "@/lib/services/store-service";
import { useRouter } from "next/navigation";
import { Card, Button, Badge } from "@/components/ui";
import Link from "next/link";

export function StoreCard({ store }: { store: StoreRow }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const isActive = store.status === "ACTIVE";

  function suspend() {
    startTransition(async () => { await toggleStoreSuspension(store.id, store.status); router.refresh(); });
  }
  function remove() {
    if (!confirm(`Permanently delete "${store.storeName}"? This cannot be undone.`)) return;
    startTransition(async () => { await removeStore(store.id); router.refresh(); });
  }

  return (
    <Card style={{ opacity: isActive ? 1 : 0.6 }}>
      <div style={{ fontWeight: 700, color: "var(--text-primary)" }}>{store.storeName}</div>
      <div style={{ color: "var(--text-secondary)", fontSize: 13 }}>{store.branchCode} · {store.city}</div>
      <div style={{ fontSize: 13, marginTop: 8, color: "var(--text-primary)" }}>Manager: {store.managerName}</div>

      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        {store.bankDetailsPending && <Badge color="var(--warning)">Bank details pending</Badge>}
        {!isActive && <Badge color="var(--danger)">Suspended</Badge>}
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <Link href={`/dashboard?store=${store.branchCode}`}>
          <Button variant="secondary">Enter Store</Button>
        </Link>
        <Button variant="secondary" onClick={suspend} disabled={isPending}>
          {isActive ? "Suspend" : "Reactivate"}
        </Button>
        <Button variant="danger" onClick={remove} disabled={isPending}>Remove</Button>
      </div>
    </Card>
  );
}