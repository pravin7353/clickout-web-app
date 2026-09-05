"use client";

import { useTransition } from "react";
import { blockBatchSafely, undoBlockBatch } from "@/actions/inventory";
import { Button } from "@/components/ui";

export function BlockBatchButton({
  productId,
  isBlocked = false,
}: {
  productId: string;
  isBlocked?: boolean;
}) {
  const [isPending, startTransition] = useTransition();

  const handleBlock = () => {
    if (confirm("🚨 EMERGENCY: Are you sure you want to block this product batch? This sets physical stock to 0 and logs it as expired/blocked.")) {
      startTransition(async () => {
        const res = await blockBatchSafely(productId);
        if (!res.ok) alert(res.error);
      });
    }
  };

  const handleUnblock = () => {
    const qty = prompt("Enter stock quantity to restore for this unblocked product:", "10");
    if (!qty) return;
    const restored = parseInt(qty, 10);
    if (isNaN(restored) || restored <= 0) {
      alert("Invalid quantity!");
      return;
    }
    startTransition(async () => {
      const res = await undoBlockBatch(productId, restored);
      if (!res.ok) alert(res.error);
    });
  };

  if (isBlocked) {
    return (
      <Button
        variant="secondary"
        onClick={handleUnblock}
        disabled={isPending}
        style={{ padding: "4px 8px", fontSize: 11 }}
      >
        {isPending ? "Restoring..." : "Unblock Batch"}
      </Button>
    );
  }

  return (
    <Button
      variant="danger"
      onClick={handleBlock}
      disabled={isPending}
      style={{ padding: "4px 8px", fontSize: 11 }}
    >
      {isPending ? "Blocking..." : "Block Batch"}
    </Button>
  );
}