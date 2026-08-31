"use client";

import { useState, useTransition } from "react";
import { searchProductByBarcode, createPosOrder } from "@/actions/pos";
import { PrintReceipt, ReceiptData } from "@/components/print-receipt";

type CartItem = { barcode: string; name: string; price: number; gst: string; weight: string; quantity: number };

export function PosTerminal() {
  const [barcodeInput, setBarcodeInput] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const [paymentMode, setPaymentMode] = useState("CASH");
  const [customerPhone, setCustomerPhone] = useState("");
  const [isPending, startTransition] = useTransition();

  function scan() {
    if (!barcodeInput.trim()) return;
    setError("");
    startTransition(async () => {
      const res = await searchProductByBarcode(barcodeInput.trim());
      if (!res.ok) { setError(res.error!); return; }
      const p = res.product!;
      setCart((prev) => {
        const existing = prev.find((i) => i.barcode === p.barcode);
        if (existing) return prev.map((i) => i.barcode === p.barcode ? { ...i, quantity: i.quantity + 1 } : i);
        return [...prev, { barcode: p.barcode, name: p.name, price: p.price, gst: p.gst, weight: p.weight, quantity: 1 }];
      });
      setBarcodeInput("");
    });
  }

  function updateQty(barcode: string, delta: number) {
    setCart((prev) => prev.map((i) => i.barcode === barcode ? { ...i, quantity: Math.max(1, i.quantity + delta) } : i).filter((i) => i.quantity > 0));
  }
  function removeItem(barcode: string) {
    setCart((prev) => prev.filter((i) => i.barcode !== barcode));
  }

  const total = cart.reduce((sum, i) => sum + i.price * i.quantity, 0);

  function checkout() {
    setError(""); setSuccess("");
    startTransition(async () => {
      const res = await createPosOrder({ items: cart, paymentMode, customerPhone: customerPhone || undefined });
      if (!res.ok) setError(res.error!);
      else {
        const discountMsg = res.discountApplied! > 0 ? ` · Saved ₹${res.discountApplied!.toFixed(0)}` : "";
        const freeMsg = res.freeItems! > 0 ? ` · ${res.freeItems} free item(s)!` : "";
        setSuccess(`✅ Sale complete! Invoice: ${res.invoiceNo}${discountMsg}${freeMsg}`);
        setCart([]); setCustomerPhone("");
        setReceipt(res.receipt as ReceiptData);
      }
    });
  }

  return (
    <div style={{ padding: 24, fontFamily: "sans-serif", maxWidth: 600 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700 }}>POS Checkout (Manager Terminal)</h1>

      <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
        <input
          value={barcodeInput}
          onChange={(e) => setBarcodeInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && scan()}
          placeholder="Scan or type barcode..."
          autoFocus
          style={{ flex: 1, padding: 10, borderRadius: 8, border: "1px solid #444", background: "transparent", color: "inherit" }}
        />
        <button onClick={scan} disabled={isPending} style={{ padding: "10px 16px", background: "#3b82f6", color: "#fff", border: "none", borderRadius: 8 }}>Add</button>
      </div>

      {error && <p style={{ color: "#ef4444", marginTop: 12 }}>🚨 {error}</p>}
      {success && <p style={{ color: "#22c55e", marginTop: 12 }}>{success}</p>}

      <div style={{ marginTop: 20 }}>
        {cart.length === 0 ? (
          <p style={{ color: "#888" }}>Cart is empty — scan a product to begin.</p>
        ) : (
          cart.map((item) => (
            <div key={item.barcode} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: 10, borderBottom: "1px solid #222" }}>
              <span>{item.name}</span>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button onClick={() => updateQty(item.barcode, -1)}>-</button>
                <span>{item.quantity}</span>
                <button onClick={() => updateQty(item.barcode, 1)}>+</button>
              </div>
              <span style={{ fontWeight: 700 }}>₹{(item.price * item.quantity).toFixed(2)}</span>
              <button onClick={() => removeItem(item.barcode)} style={{ color: "#ef4444" }}>✕</button>
            </div>
          ))
        )}
      </div>

      {cart.length > 0 && (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "16px 0", fontSize: 20, fontWeight: 900 }}>
            <span>Total</span><span>₹{total.toFixed(2)}</span>
          </div>

          <input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="Customer phone (optional)" style={{ width: "100%", padding: 8, marginBottom: 8 }} />
          <select value={paymentMode} onChange={(e) => setPaymentMode(e.target.value)} style={{ width: "100%", padding: 8, marginBottom: 12 }}>
            <option value="CASH">Cash</option>
            <option value="UPI">UPI</option>
            <option value="CARD">Card</option>
          </select>

          <button onClick={checkout} disabled={isPending} style={{ width: "100%", padding: 14, background: "#22c55e", color: "#000", border: "none", borderRadius: 8, fontWeight: 700, fontSize: 16 }}>
            {isPending ? "Processing..." : "Complete Sale"}
          </button>
        </>
      )}
      {receipt && (
        <div style={{ marginTop: 24 }}>
          <PrintReceipt data={receipt} />
        </div>
      )}
    </div>
  );
}