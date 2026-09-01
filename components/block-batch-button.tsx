"use client";

import { useTransition } from "react";
import { blockBatchSafely } from "@/actions/inventory";

export function BlockBatchButton({ productId }: { productId: string }) {
  const [isPending, startTransition] = useTransition();

  const handleBlock = () => {
    if (confirm("🚨 EMERGENCY: Are you sure you want to block this product batch? This sets physical stock to 0 and logs it as expired/blocked.")) {
      startTransition(async () => {
        const res = await blockBatchSafely(productId);
        if (!res.ok) alert(res.error);
      });
    }
  };

  return (
    <button 
      onClick={handleBlock} 
      disabled={isPending}
      className="co-btn-danger" 
      style={{ padding: "4px 8px", fontSize: 11, borderRadius: 4 }}
    >
      {isPending ? "Blocking..." : "Block Batch"}
    </button>
  );
}