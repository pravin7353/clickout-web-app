import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { adminDb } from "@/lib/firebase-admin";
import { getActiveShiftById } from "@/lib/services/pos-counter-service";
import { PosTerminal } from "@/components/pos-terminal";

export default async function PosBillingPage({
  searchParams,
}: {
  searchParams: Promise<{ store?: string; shift?: string }>;
}) {
  const { store: queryStore, shift: shiftId } = await searchParams;
  const session = await auth();

  let effectiveTenantId = (session?.user as any)?.tenantId as string | undefined;
  let effectiveStoreId = queryStore || (session?.user as any)?.storeId;

  // Resolve tenant from store if not in session
  if (!effectiveTenantId && effectiveStoreId) {
    const storeSnap = await adminDb
      .collection("stores")
      .where("branchCode", "==", effectiveStoreId)
      .limit(1)
      .get();
    if (!storeSnap.empty) {
      effectiveTenantId = storeSnap.docs[0].data().tenantId;
    }
  }

  // If we have a shift ID but no tenant, search across tenant collections or redirect
  if (!shiftId) {
    const redirectUrl = effectiveStoreId ? `/pos?store=${effectiveStoreId}` : "/pos";
    redirect(redirectUrl);
  }

  let shiftInfo = null;
  if (effectiveTenantId && shiftId) {
    shiftInfo = await getActiveShiftById(effectiveTenantId, shiftId);
  } else if (shiftId) {
    // Lookup shift across tenants if tenantId not in session
    const shiftGroupSnap = await adminDb
      .collectionGroup("posShifts")
      .where("id", "==", shiftId)
      .limit(1)
      .get();

    if (!shiftGroupSnap.empty) {
      const sDoc = shiftGroupSnap.docs[0];
      const sData = sDoc.data();
      effectiveTenantId = sData.tenantId;
      shiftInfo = {
        id: sDoc.id,
        counterId: sData.counterId,
        counterName: sData.counterName || "Counter",
        openedBy: sData.openedBy || "",
        openedByName: sData.openedByName || "Cashier",
        openedAt: sData.openedAt?.toDate?.() ? sData.openedAt.toDate().toISOString() : sData.openedAt,
        closedAt: sData.closedAt?.toDate?.() ? sData.closedAt.toDate().toISOString() : sData.closedAt,
        closedBy: sData.closedBy || null,
        status: sData.status || "OPEN",
        shiftTotalAmount: Number(sData.shiftTotalAmount || 0),
        transactionCount: Number(sData.transactionCount || 0),
        openingCash: Number(sData.openingCash || 0),
        closingCash: sData.closingCash !== null && sData.closingCash !== undefined ? Number(sData.closingCash) : null,
        branchCode: sData.branchCode,
      };
    }
  }

  // If shift is closed or doesn't exist, redirect to counter selection
  if (!shiftInfo || shiftInfo.status === "CLOSED") {
    const redirectUrl = effectiveStoreId ? `/pos?store=${effectiveStoreId}` : "/pos";
    redirect(redirectUrl);
  }

  return (
    <div style={{ padding: "20px 24px", maxWidth: 1400, margin: "0 auto", minHeight: "100vh" }}>
      <PosTerminal
        branchCode={effectiveStoreId || shiftInfo.branchCode}
        canEdit={true}
        shiftInfo={{
          shiftId: shiftInfo.id,
          counterName: shiftInfo.counterName,
          openedByName: shiftInfo.openedByName,
          shiftTotalAmount: shiftInfo.shiftTotalAmount,
          transactionCount: shiftInfo.transactionCount,
        }}
      />
    </div>
  );
}
