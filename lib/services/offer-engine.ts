// Ported from lib/core/services/offer_engine_service.dart
// Handles single-product offer types only: BOGO, BUY_X_GET_Y, PERCENTAGE,
// FLAT_AMOUNT, TIERED_QTY, BUNDLE_PRICE, FLASH_SALE.
// NOT ported (deferred — cross-product combo matching is the most complex/
// fragile part of the original engine): BUY_X_GET_Y_CROSS, CROSS_PRODUCT.

export type CartLine = {
  barcode: string;
  name: string;
  originalPrice: number;
  quantity: number;
};

export type ProductOffer = {
  barcode?: string;
  productId?: string;
  clearanceActive?: boolean;
  clearanceType?: string;
  buyQty?: number;
  freeQty?: number;
  discountPercent?: number;
  discountAmount?: number;
  minQty?: number;
  bundleQty?: number;
  bundlePrice?: number;
  expiresAt?: { toDate: () => Date } | Date | null;
};

export type PricedLine = {
  barcode: string;
  name: string;
  originalPrice: number;
  finalUnitPrice: number;
  quantity: number;
  offerType: string;
  offerActive: boolean;
  hint: string;
  isFreeLine?: boolean;
};

export type OfferResult = {
  lines: PricedLine[];
  totalDiscount: number;
  grandTotal: number;
  totalFreeItems: number;
};

function cleanBarcode(b: string): string {
  return (b ?? "").toString().replace(/[^0-9a-zA-Z]/g, "");
}

function expiresAtToMs(exp: ProductOffer["expiresAt"]): number | null {
  if (!exp) return null;
  if (exp instanceof Date) return exp.getTime();
  if (typeof (exp as any).toDate === "function") return (exp as any).toDate().getTime();
  return null;
}

/**
 * liveStock: barcode -> current physicalStock, used for BOGO/BUY_X_GET_Y stock-aware
 * free-item allocation (never give away more free stock than actually exists).
 */
export function applyOffers(
  cartItems: CartLine[],
  activeOffers: ProductOffer[],
  liveStock: Record<string, number>
): OfferResult {
  const lines: PricedLine[] = [];
  let totalDiscount = 0;
  let grandTotal = 0;
  let totalFreeItems = 0;

  for (const item of cartItems) {
    const bc = cleanBarcode(item.barcode);
    const qty = item.quantity;
    const stock = liveStock[bc] ?? qty;
    const mrp = item.originalPrice;

    const trigger = activeOffers.find((o) => {
      const ob = cleanBarcode(o.barcode ?? "");
      const op = cleanBarcode(o.productId ?? "");
      return (ob === bc || op === bc || op.endsWith(bc)) && o.clearanceActive === true;
    });

    function pushLine(finalUnitPrice: number, offerType: string, active: boolean, hint = "", isFreeLine = false) {
      const fp = finalUnitPrice < 0 ? 0 : finalUnitPrice;
      totalDiscount += (mrp - fp) * qty;
      grandTotal += fp * qty;
      lines.push({ barcode: bc, name: item.name, originalPrice: mrp, finalUnitPrice: fp, quantity: qty, offerType, offerActive: active, hint, isFreeLine });
    }

    if (!trigger) {
      pushLine(mrp, "", false);
      continue;
    }

    const type = (trigger.clearanceType ?? "").toUpperCase();

    if (type === "BOGO" || type === "BUY_X_GET_Y") {
      const buyQty = type === "BOGO" ? 1 : (trigger.buyQty ?? 1);
      const freeQty = type === "BOGO" ? 1 : (trigger.freeQty ?? 1);
      if (buyQty <= 0) { pushLine(mrp, "", false); continue; }

      const eligibleCycles = Math.floor(qty / buyQty);
      const theoreticalFree = eligibleCycles * freeQty;
      const maxFreeAllowedByStock = Math.max(0, stock - qty);
      const actualFree = Math.min(theoreticalFree, maxFreeAllowedByStock);

      let hint = "";
      if (qty % buyQty !== 0 || qty < buyQty) {
        hint = `Add ${buyQty - (qty % buyQty)} more to get ${freeQty} FREE! 🎁`;
      }

      pushLine(mrp, type, actualFree > 0, hint);
      if (actualFree > 0) {
        totalFreeItems += actualFree;
        lines.push({ barcode: `${bc}_FREE`, name: item.name, originalPrice: mrp, finalUnitPrice: 0, quantity: actualFree, offerType: "FREE_ITEM", offerActive: true, hint: "", isFreeLine: true });
      }
      continue;
    }

    if (type === "TIERED_QTY") {
      const minQty = trigger.minQty ?? 1;
      const disc = trigger.discountPercent ?? 0;
      const met = qty >= minQty;
      const hint = !met ? `Add ${minQty - qty} more to get ${disc}% OFF! 📉` : "";
      pushLine(met ? mrp * (1 - disc / 100) : mrp, type, met, hint);
      continue;
    }

    if (type === "BUNDLE_PRICE") {
      const bundleQty = trigger.bundleQty ?? 1;
      const bundlePrice = trigger.bundlePrice ?? mrp * bundleQty;
      const fullBundles = Math.floor(qty / bundleQty);
      const remainder = qty % bundleQty;
      const total = fullBundles * bundlePrice + remainder * mrp;
      const hint = qty % bundleQty !== 0 || qty < bundleQty
        ? `Add ${bundleQty - (qty % bundleQty)} more to get ${bundleQty} for ₹${bundlePrice}! 📦`
        : "";
      pushLine(qty > 0 ? total / qty : mrp, type, fullBundles > 0, hint);
      continue;
    }

    if (type === "FLASH_SALE") {
      const expMs = expiresAtToMs(trigger.expiresAt ?? null);
      const expired = expMs !== null && Date.now() > expMs;
      const disc = trigger.discountPercent ?? 0;
      pushLine(expired ? mrp : mrp * (1 - disc / 100), type, !expired);
      continue;
    }

    if (type === "PERCENTAGE") {
      pushLine(mrp * (1 - (trigger.discountPercent ?? 0) / 100), type, true);
      continue;
    }

    if (type === "FLAT_AMOUNT") {
      pushLine(mrp - (trigger.discountAmount ?? 0), type, true);
      continue;
    }

    // Unknown/cross-product type — fall back to no discount rather than guess
    pushLine(mrp, "", false);
  }

  return { lines, totalDiscount, grandTotal, totalFreeItems };
}