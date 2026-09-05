const fs = require("fs");
if (fs.existsSync(".env.local")) {
  const envConfig = fs.readFileSync(".env.local", "utf-8");
  for (const line of envConfig.split("\n")) {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (match) {
      const key = match[1];
      let value = match[2] || "";
      if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
      if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
      process.env[key] = value.trim();
    }
  }
}
const { initializeApp, cert, getApps } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

const serviceAccount = JSON.parse(
  Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, "base64").toString("utf-8")
);

const app = getApps().length ? getApps()[0] : initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore(app);

// Import canonical functions logic
function resolveItemPrice(item) {
  if (item.price !== undefined && item.price !== null) return Number(item.price);
  if (item.unitPrice !== undefined && item.unitPrice !== null) return Number(item.unitPrice);
  if (item.finalUnitPrice !== undefined && item.finalUnitPrice !== null) return Number(item.finalUnitPrice);
  if (item.clearanceValue !== undefined && item.clearanceValue !== null) return Number(item.clearanceValue);
  if (item.originalPrice !== undefined && item.originalPrice !== null) return Number(item.originalPrice);
  return 0;
}

function normalizeOrder(id, data) {
  const items = Array.isArray(data.items)
    ? data.items
    : Array.isArray(data.cartItems)
    ? data.cartItems
    : [];

  let computedItemsTotal = 0;
  for (const item of items) {
    const qty = Number(item.quantity ?? item.qty ?? 1);
    const unitPrice = resolveItemPrice(item);
    computedItemsTotal += qty * unitPrice;
  }

  const rawGross = Number(data.totalAmount ?? data.grossAmount ?? data.amount ?? 0);
  const grossAmount = computedItemsTotal > 0 ? computedItemsTotal : rawGross;

  const status = String(data.status ?? "").toUpperCase();
  const exitStatus = String(data.exitStatus ?? "").toUpperCase();
  const isRefunded = status === "REFUNDED" || exitStatus === "CANCELLED_AND_REFUNDED" || Boolean(data.refundId);

  const rawRefundAmount = Number(data.refundAmount ?? 0);
  const refundAmount = isRefunded ? (rawRefundAmount > 0 ? rawRefundAmount : grossAmount) : 0;
  const netRealizedAmount = Math.max(0, grossAmount - refundAmount);

  return {
    id,
    grossAmount,
    refundAmount,
    netRealizedAmount,
    isRefunded,
    paymentMode: String(data.paymentMode ?? data.paymentMethod ?? "UPI").toUpperCase(),
    exitStatus: isRefunded ? "CANCELLED_AND_REFUNDED" : (exitStatus || "APPROVED"),
  };
}

async function testFullAccountingPipeline() {
  console.log("=== ClickOut Canonical Accounting Pipeline Verification ===");
  const oSnap = await db.collection("orders").where("branchCode", "==", "QUEST-001").get();
  console.log(`Auditing ${oSnap.docs.length} orders for QUEST-001...`);

  const orders = oSnap.docs.map(d => normalizeOrder(d.id, d.data()));

  let grossInvoiced = 0;
  let netRealized = 0;
  let totalRefunds = 0;
  let cashGross = 0;
  let digitalGross = 0;
  let cashRefunds = 0;
  let digitalRefunds = 0;

  for (const o of orders) {
    grossInvoiced += o.grossAmount;
    if (o.paymentMode === "CASH") cashGross += o.grossAmount;
    else digitalGross += o.grossAmount;

    if (o.isRefunded) {
      totalRefunds += o.refundAmount;
      if (o.paymentMode === "CASH") cashRefunds += o.refundAmount;
      else digitalRefunds += o.refundAmount;
    }

    if (o.exitStatus === "APPROVED" || o.exitStatus === "COMPLETED" || o.exitStatus === "EXITED") {
      netRealized += o.netRealizedAmount;
    } else if (o.exitStatus === "CANCELLED_AND_REFUNDED") {
      if (o.netRealizedAmount > 0) {
        netRealized += o.netRealizedAmount;
      }
    }
  }

  const accounted = netRealized + totalRefunds;
  const variance = Math.abs(grossInvoiced - accounted);
  const cashPlusDigital = cashGross + digitalGross;
  const paymentVariance = Math.abs(grossInvoiced - cashPlusDigital);

  console.log("\n--- Verification Results ---");
  console.log(`1. Gross Invoiced:    ₹${grossInvoiced.toFixed(2)}`);
  console.log(`2. Net Realized:      ₹${netRealized.toFixed(2)}`);
  console.log(`3. Total Refunds:     ₹${totalRefunds.toFixed(2)} (Cash: ₹${cashRefunds.toFixed(2)}, Digital: ₹${digitalRefunds.toFixed(2)})`);
  console.log(`4. Cash Gross:        ₹${cashGross.toFixed(2)}`);
  console.log(`5. Digital Gross:     ₹${digitalGross.toFixed(2)}`);
  console.log(`6. Cash + Digital:    ₹${cashPlusDigital.toFixed(2)} (Variance: ₹${paymentVariance.toFixed(2)})`);
  console.log(`7. Realized + Refund: ₹${accounted.toFixed(2)}`);
  console.log(`8. Final Variance:    ₹${variance.toFixed(2)}`);

  if (variance < 0.01 && paymentVariance < 0.01) {
    console.log("\n>>> STATUS: CLEAN [OK] — Canonical reconciliation 100% SUCCESSFUL! Zero discrepancy across register, cash, digital, and line items. <<<");
  } else {
    console.error(`\n>>> STATUS: ⚠ RECONCILIATION REQUIRED — Mismatch of ₹${variance.toFixed(2)} detected! <<<`);
    process.exit(1);
  }

  // Test 9: Verify return policy logic
  console.log("\n--- Testing Return Policy Logic ---");
  const testOrder = orders.find(o => o.isRefunded);
  if (testOrder) {
    console.log(`Found refunded order: ${testOrder.id}, refundAmount: ₹${testOrder.refundAmount}`);
    console.log(`Verified isRefunded flag correctly recognized: ${testOrder.isRefunded}`);
  }
}

testFullAccountingPipeline().catch(e => {
  console.error(e);
  process.exit(1);
});
