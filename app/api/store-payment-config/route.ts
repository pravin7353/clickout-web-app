import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const branchCode = searchParams.get("branchCode")?.trim() || "";

    if (!branchCode) {
      return NextResponse.json(
        { ok: false, error: "branchCode parameter is required" },
        { status: 400 }
      );
    }

    let tenantId = "";
    let storeName = "";

    // 1. Look up store
    const storeQuery = await adminDb
      .collection("stores")
      .where("branchCode", "==", branchCode)
      .limit(1)
      .get();

    if (!storeQuery.empty) {
      const sData = storeQuery.docs[0].data();
      tenantId = sData.tenantId || "";
      storeName = sData.storeName || sData.name || branchCode;
    } else {
      // Check if branchCode is direct store doc id
      const directDoc = await adminDb.collection("stores").doc(branchCode).get();
      if (directDoc.exists) {
        const sData = directDoc.data()!;
        tenantId = sData.tenantId || "";
        storeName = sData.storeName || sData.name || branchCode;
      }
    }

    if (!tenantId) {
      return NextResponse.json(
        {
          ok: true,
          upiId: "",
          upiName: storeName,
          acceptsUpi: false,
          acceptsCash: true,
        }
      );
    }

    // 2. Fetch tenant payment settings
    const tenantDoc = await adminDb.collection("tenants").doc(tenantId).get();
    if (!tenantDoc.exists) {
      return NextResponse.json(
        {
          ok: true,
          upiId: "",
          upiName: storeName,
          acceptsUpi: false,
          acceptsCash: true,
        }
      );
    }

    const tData = tenantDoc.data() || {};
    const rawSettings = tData.paymentSettings || {};

    return NextResponse.json({
      ok: true,
      storeName: storeName || tData.name || tData.companyName || "Store",
      upiId: rawSettings.upiId || "",
      upiName: rawSettings.upiName || storeName || tData.name || "",
      acceptsUpi: Boolean(rawSettings.acceptsUpi && rawSettings.upiId),
      acceptsCash: true,
    });
  } catch (err: any) {
    console.error("Error in store-payment-config API:", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "Failed to load store payment config" },
      { status: 500 }
    );
  }
}
