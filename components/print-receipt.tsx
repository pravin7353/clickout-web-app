"use client";

type ReceiptItem = { name: string; quantity: number; price: number; originalPrice: number };

export type ReceiptData = {
  invoiceNo: string;
  storeName: string;
  address: string;
  phone: string;
  gstin: string;
  items: ReceiptItem[];
  taxableValue: number;
  gstTotal: number;
  discount: number;
  totalWeight: number;
  grandTotal: number;
  terms: string[];
  timestamp: string;
};

export function PrintReceipt({ data }: { data: ReceiptData }) {
  const grossSubtotal = data.items.reduce((sum, i) => sum + i.originalPrice * i.quantity, 0);
  const totalSavings = data.items.reduce((sum, i) => sum + (i.originalPrice - i.price) * i.quantity, 0);

  return (
    <>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #receipt, #receipt * { visibility: visible; }
          #receipt { position: absolute; top: 0; left: 0; width: 80mm; }
          @page { size: 80mm auto; margin: 0; }
        }
      `}</style>
      <div id="receipt" style={{ width: 300, margin: "0 auto", padding: 10, fontFamily: "monospace", fontSize: 11, color: "#000", background: "#fff" }}>
        <div style={{ textAlign: "center", fontWeight: 700, fontSize: 13 }}>{data.storeName.toUpperCase()}</div>
        <div style={{ textAlign: "center", fontSize: 9 }}>{data.address}</div>
        <div style={{ textAlign: "center", fontSize: 9 }}>Ph: {data.phone} {data.gstin !== "N/A" && `| GSTIN: ${data.gstin}`}</div>

        <Dashed />
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{ fontWeight: 700 }}>Invoice: {data.invoiceNo}</span>
          <span style={{ fontSize: 9 }}>{data.timestamp}</span>
        </div>
        <Dashed />

        <div style={{ display: "flex", fontWeight: 700, fontSize: 9 }}>
          <div style={{ flex: 4 }}>Item</div>
          <div style={{ flex: 1, textAlign: "center" }}>Qty</div>
          <div style={{ flex: 2, textAlign: "right" }}>Price</div>
          <div style={{ flex: 2, textAlign: "right" }}>Total</div>
        </div>
        {data.items.map((item, i) => (
          <div key={i} style={{ display: "flex", marginBottom: 4, fontSize: 9 }}>
            <div style={{ flex: 4 }}>{item.name}</div>
            <div style={{ flex: 1, textAlign: "center" }}>{item.quantity}</div>
            <div style={{ flex: 2, textAlign: "right" }}>{item.price.toFixed(2)}</div>
            <div style={{ flex: 2, textAlign: "right", fontWeight: 700 }}>{(item.price * item.quantity).toFixed(2)}</div>
          </div>
        ))}

        <Dashed />
        <TotalRow label="Gross Subtotal:" value={grossSubtotal.toFixed(2)} />
        <TotalRow label="Taxable Value:" value={data.taxableValue.toFixed(2)} />
        <TotalRow label="Total GST:" value={data.gstTotal.toFixed(2)} />
        {data.totalWeight > 0 && (
          <TotalRow label="Total Weight:" value={data.totalWeight >= 1000 ? `${(data.totalWeight / 1000).toFixed(2)} KG` : `${data.totalWeight.toFixed(0)} g`} />
        )}
        {data.discount > 0 && <TotalRow label="Discount:" value={`-${data.discount.toFixed(2)}`} />}
        {totalSavings > 0 && <TotalRow label="Total Savings:" value={`Rs. ${totalSavings.toFixed(2)}`} />}

        <Dashed />
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{ fontWeight: 700, fontSize: 12 }}>GRAND TOTAL</span>
          <span style={{ fontWeight: 700, fontSize: 16 }}>Rs. {data.grandTotal.toFixed(2)}</span>
        </div>
        <Dashed />

        <div style={{ textAlign: "center", fontWeight: 700, fontSize: 10, marginTop: 8 }}>Thank you for shopping with us!</div>

        <div style={{ marginTop: 8, fontSize: 8 }}>
          {data.terms.map((t, i) => <div key={i}>{t}</div>)}
        </div>
      </div>

      <div style={{ textAlign: "center", marginTop: 16 }} className="no-print">
        <button onClick={() => window.print()} style={{ padding: "10px 20px", background: "var(--cta-bg-accent)", color: "#000", border: "none", borderRadius: 8, fontWeight: 700 }}>
          🖨️ Print Receipt
        </button>
      </div>
    </>
  );
}

function Dashed() {
  return <div style={{ borderTop: "1px dashed #000", margin: "6px 0" }} />;
}

function TotalRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10 }}>
      <span>{label}</span><span>{value}</span>
    </div>
  );
}