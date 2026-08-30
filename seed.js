// seed.js — run once to populate test data so the admin panel shows real numbers.
//
// SETUP:
//   1. Place this file in your clickout-admin-web project root.
//   2. npm install firebase-admin --save-dev  (if not already installed)
//   3. Make sure .env.local has FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL,
//      FIREBASE_PRIVATE_KEY (same service account you already use).
//   4. node seed.js
//
// This creates: 1 tenant, 1 store, 1 manager staff (Firebase Auth user + staff
// doc), 3 products, 1 supplier, and 5 sample orders (mix of paid/pending/rejected)
// so Dashboard, Inventory, Fraud Control, Risk Engine etc. all show real data.

const { loadEnvConfig } = require("@next/env");
loadEnvConfig(process.cwd());

const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore, FieldValue, Timestamp } = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");

const serviceAccountJson = Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, "base64").toString("utf-8");
const serviceAccount = JSON.parse(serviceAccountJson);
console.log("Loaded project:", serviceAccount.project_id);

const app = initializeApp({
  credential: cert(serviceAccount),
});

const db = getFirestore(app);
const auth = getAuth(app);

async function seed() {
  const tenantId = "tenant_demo_store";
  const branchCode = "HQ";
  const managerEmail = "manager@demo.com";
  const managerPassword = "Demo@1234";

  console.log("1. Creating tenant...");
  await db.collection("tenants").doc(tenantId).set({
    tenantId,
    companyName: "Demo Retail Pvt Ltd",
    subscriptionPlan: "PRO",
    billingStatus: "ACTIVE",
    maxStores: 50,
    maxUsers: 1000,
    isActive: true,
    createdAt: FieldValue.serverTimestamp(),
  });

  console.log("2. Creating store...");
  const storeRef = db.collection("stores").doc();
  await storeRef.set({
    storeId: storeRef.id,
    tenantId,
    storeName: "Demo Store - Main Branch",
    branchCode,
    managerEmail,
    managerName: "Demo Manager",
    managerPhone: "9876543210",
    location: { address: "123 MG Road", city: "Mumbai", state: "Maharashtra", pincode: "400001" },
    status: "ACTIVE",
    isActive: true,
    bankDetailsPending: false,
    createdAt: FieldValue.serverTimestamp(),
  });

  console.log("3. Creating manager (Firebase Auth + staff doc)...");
  let uid;
  try {
    const existing = await auth.getUserByEmail(managerEmail);
    uid = existing.uid;
    console.log("   Auth user already exists, reusing.");
  } catch {
    const userRecord = await auth.createUser({ email: managerEmail, password: managerPassword, displayName: "Demo Manager" });
    uid = userRecord.uid;
  }

  await db.collection("staff").doc(uid).set({
    docId: uid,
    empId: "MGR-001",
    email: managerEmail,
    phone: "9876543210",
    name: "Demo Manager",
    role: "MANAGER",
    tenantId,
    branchCode,
    isActive: true,
    isDeleted: false,
    createdAt: FieldValue.serverTimestamp(),
  });

  console.log("4. Creating supplier...");
  const supplierRef = db.collection("suppliers").doc();
  await supplierRef.set({
    supplierID: "SUP-001",
    name: "Fresh Goods Distributors",
    email: "orders@freshgoods.com",
    phone: "9123456780",
    categories: "Grocery, Dairy",
    tenantId,
    isActive: true,
  });

  console.log("5. Creating products...");
  const products = [
    { barcode: "1001", name: "Amul Milk 1L", price: 60, unitCost: 45, physicalStock: 8 },
    { barcode: "1002", name: "Britannia Bread", price: 40, unitCost: 28, physicalStock: 15 },
    { barcode: "1003", name: "Tata Salt 1kg", price: 25, unitCost: 18, physicalStock: 5 },
  ];
  for (const p of products) {
    const docId = `${tenantId}_${branchCode}_${p.barcode}`;
    await db.collection("products").doc(docId).set({
      ...p,
      itemType: "PRODUCT",
      gst: "5",
      openingStock: p.physicalStock,
      purchasedStock: 0,
      soldStock: 12,
      damagedStock: 0,
      expiredStock: 0,
      reservedStock: 0,
      searchKey: p.name.toLowerCase(),
      supplierId: supplierRef.id,
      tenantId,
      branchCode,
      createdAt: FieldValue.serverTimestamp(),
    });
  }

  console.log("6. Creating sample orders...");
  const now = Timestamp.now();
  const orders = [
    { amount: 500, paymentStatus: "PAID", exitStatus: "APPROVED", paymentMode: "UPI" },
    { amount: 250, paymentStatus: "PAID", exitStatus: "PENDING", paymentMode: "CASH" },
    { amount: 150, paymentStatus: "PAID", exitStatus: "REJECTED", paymentMode: "UPI" },
    { amount: 800, paymentStatus: "PAID", exitStatus: "APPROVED", paymentMode: "CARD" },
    { amount: 300, paymentStatus: "REFUNDED", exitStatus: "CANCELLED_AND_REFUNDED", paymentMode: "UPI" },
  ];
  for (const o of orders) {
    const orderRef = db.collection("orders").doc();
    await orderRef.set({
      ...o,
      totalAmount: o.amount,
      items: [{ name: "Sample Item", price: o.amount, quantity: 1 }],
      wasEverRejected: o.exitStatus === "REJECTED",
      tenantId,
      branchCode,
      timestamp: now,
    });
  }

  console.log("\n✅ Seed complete!");
  console.log(`   Login at /login with: ${managerEmail} / ${managerPassword}`);
  console.log(`   Tenant ID: ${tenantId}  |  Branch: ${branchCode}`);
  process.exit(0);
}

seed().catch((e) => { console.error("Seed failed:", e); process.exit(1); });
