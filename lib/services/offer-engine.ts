// Full enterprise port from lib/core/services/offer_engine_service.dart
// Supports: BOGO, B1G1, BUY_X_GET_Y, BUY_X_GET_Y_CROSS, PERCENTAGE,
// FLAT_AMOUNT, TIERED_QTY, BUNDLE_PRICE, FLASH_SALE, CROSS_PRODUCT.

export type CartLine = {
  barcode: string;
  name: string;
  originalPrice: number;
  quantity: number;
  gst?: string;
  weight?: string;
  category?: string;
};

export type ProductOffer = {
  id?: string;
  productId?: string;
  barcode?: string;
  productName?: string;
  name?: string;
  clearanceActive?: boolean;
  clearanceType?: string;
  clearanceTag?: string;
  buyQty?: number;
  freeQty?: number;
  discountPercent?: number;
  discountAmount?: number;
  minQty?: number;
  bundleQty?: number;
  bundlePrice?: number;
  offerPrice?: number;
  targetProductId?: string;
  targetProductName?: string;
  expiresAt?: { toDate: () => Date } | { _seconds: number } | Date | string | null;
  value1?: any;
  value2?: any;
  stock?: number;
  physicalStock?: number;
};

export type PricedLine = {
  key: string;
  barcode: string;
  name: string;
  originalPrice: number;
  finalUnitPrice: number;
  quantity: number;
  offerType: string;
  offerActive: boolean;
  hint: string;
  isFreeLine: boolean;
  isOverflow: boolean;
  freeQtyGiven: number;
  flashExpiry: number;
  targetId?: string;
};

export type OfferResult = {
  lines: PricedLine[];
  updatedCartItems: Record<string, PricedLine>;
  totalRetailValue: number;
  paidItemsSubtotal: number;
  freeItemsWorth: number;
  cashDiscount: number;
  totalAppliedDiscount: number;
  totalDiscount: number;
  newGrandTotal: number;
  grandTotal: number;
  totalFreeItems: number;
};

export type CartGroup = {
  baseKey: string;
  name: string;
  originalPrice: number;
  totalQuantity: number;
  paidQuantity: number;
  baseItem?: PricedLine;
  freeItem?: PricedLine;
  overflowItem?: PricedLine;
  effectiveUnitPrice: number;
  totalLinePrice: number;
  hint: string;
  hasOffer: boolean;
  offerType: string;
  flashExpiry?: number;
};

export function cleanBarcode(b: any): string {
  if (b === null || b === undefined) return "";
  return b.toString().replace(/[^0-9a-zA-Z]/g, "");
}

export function safeParse(v: any): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return v;
  const s = v.toString().replace(/[^0-9.]/g, "");
  const p = parseFloat(s);
  return isNaN(p) ? 0 : p;
}

export function parseExpiryMs(exp: ProductOffer["expiresAt"]): number {
  if (!exp) return 0;
  if (typeof exp === "number") return exp;
  if (exp instanceof Date) return exp.getTime();
  if (typeof exp === "object") {
    if ("toDate" in exp && typeof (exp as any).toDate === "function") {
      return (exp as any).toDate().getTime();
    }
    if ("_seconds" in exp && typeof (exp as any)._seconds === "number") {
      return (exp as any)._seconds * 1000;
    }
    if ("seconds" in exp && typeof (exp as any).seconds === "number") {
      return (exp as any).seconds * 1000;
    }
  }
  if (typeof exp === "string") {
    const ms = new Date(exp).getTime();
    return isNaN(ms) ? 0 : ms;
  }
  return 0;
}

export function normalizeOffer(raw: Record<string, any>): Record<string, any> {
  const rawType = (raw.clearanceType ?? "").toString().toUpperCase();
  let t = rawType;
  if (t === "B1G1") t = "BOGO";
  else if (t.startsWith("B") && t.includes("G")) {
    const match = t.match(/^B(\d+)G(\d+)$/);
    if (match) {
      return {
        ...raw,
        clearanceType: "BUY_X_GET_Y",
        buyQty: parseInt(match[1], 10) || 1,
        freeQty: parseInt(match[2], 10) || 1,
      };
    }
  }

  switch (t) {
    case "BOGO":
      return { ...raw, clearanceType: "BOGO", buyQty: 1, freeQty: 1 };
    case "BUY_X_GET_Y": {
      const bq = Math.round(safeParse(raw.buyQty ?? raw.value1));
      const fq = Math.round(safeParse(raw.freeQty ?? raw.value2));
      return { ...raw, clearanceType: "BUY_X_GET_Y", buyQty: bq > 0 ? bq : 1, freeQty: fq > 0 ? fq : 1 };
    }
    case "BUY_X_GET_Y_CROSS": {
      const bq = Math.round(safeParse(raw.buyQty ?? raw.value1));
      const fq = Math.round(safeParse(raw.freeQty ?? raw.value2));
      return {
        ...raw,
        clearanceType: "BUY_X_GET_Y_CROSS",
        buyQty: bq > 0 ? bq : 1,
        freeQty: fq > 0 ? fq : 1,
        targetProductId: cleanBarcode(raw.targetProductId),
      };
    }
    case "PERCENTAGE":
      return { ...raw, clearanceType: "PERCENTAGE", discount: safeParse(raw.discountPercent ?? raw.value1) };
    case "CROSS_PRODUCT":
      return {
        ...raw,
        clearanceType: "CROSS_PRODUCT",
        discount: safeParse(raw.discountPercent ?? raw.value1),
        targetProductId: cleanBarcode(raw.targetProductId),
      };
    case "FLAT_AMOUNT":
      return { ...raw, clearanceType: "FLAT_AMOUNT", discount: safeParse(raw.discountAmount ?? raw.value1) };
    case "TIERED_QTY":
      return {
        ...raw,
        clearanceType: "TIERED_QTY",
        minQty: Math.round(safeParse(raw.minQty ?? raw.value1)) || 1,
        discount: safeParse(raw.discountPercent ?? raw.value2),
      };
    case "BUNDLE_PRICE":
      return {
        ...raw,
        clearanceType: "BUNDLE_PRICE",
        bundleQty: Math.round(safeParse(raw.bundleQty ?? raw.value1)) || 1,
        bundlePrice: safeParse(raw.bundlePrice ?? raw.value2),
      };
    case "FLASH_SALE":
      return {
        ...raw,
        clearanceType: "FLASH_SALE",
        discount: safeParse(raw.discountPercent ?? raw.value1),
        expiresAt: raw.expiresAt,
      };
    default:
      return raw;
  }
}

// Collapse any _FREE / _OVERFLOW split keys back to base items before calculating
export function collapseToBase(items: CartLine[]): Record<string, CartLine> {
  const out: Record<string, CartLine> = {};
  for (const item of items) {
    const rawBc = cleanBarcode(item.barcode);
    const baseBc = rawBc.replace(/_FREE$/, "").replace(/_OVERFLOW$/, "");
    if (out[baseBc]) {
      out[baseBc] = {
        ...out[baseBc],
        quantity: out[baseBc].quantity + item.quantity,
      };
    } else {
      out[baseBc] = {
        barcode: baseBc,
        name: item.name,
        originalPrice: item.originalPrice,
        quantity: item.quantity,
        gst: item.gst,
        weight: item.weight,
        category: item.category,
      };
    }
  }
  return out;
}

export function applyOffers(
  cartItems: CartLine[],
  activeOffers: ProductOffer[],
  liveStock: Record<string, number> = {}
): OfferResult {
  const safe = collapseToBase(cartItems);
  const result: Record<string, PricedLine> = {};
  const lines: PricedLine[] = [];
  let totalDiscount = 0;
  let grandTotal = 0;
  let freeCount = 0;

  const normalizedOffers = activeOffers.map((o) => normalizeOffer(o));

  function writeLine(params: {
    key: string;
    barcode: string;
    name: string;
    originalPrice: number;
    quantity: number;
    active: boolean;
    type: string;
    unitPrice: number;
    isFreeLine?: boolean;
    isOverflow?: boolean;
    hint?: string;
    expiry?: number;
    targetId?: string;
    freeQtyGiven?: number;
  }) {
    const fp = Math.max(0, params.unitPrice);
    const lineDiscount = (params.originalPrice - fp) * params.quantity;
    totalDiscount += lineDiscount;
    grandTotal += fp * params.quantity;

    const line: PricedLine = {
      key: params.key,
      barcode: params.barcode,
      name: params.name,
      originalPrice: params.originalPrice,
      finalUnitPrice: fp,
      quantity: params.quantity,
      offerType: params.type,
      offerActive: params.active,
      hint: params.hint ?? "",
      isFreeLine: params.isFreeLine ?? false,
      isOverflow: params.isOverflow ?? false,
      freeQtyGiven: params.freeQtyGiven ?? 0,
      flashExpiry: params.expiry ?? 0,
      targetId: params.targetId ?? "",
    };

    result[params.key] = line;
    lines.push(line);
  }

  for (const rawKey of Object.keys(safe)) {
    if (rawKey.endsWith("_FREE") || rawKey.endsWith("_OVERFLOW")) continue;

    const original = safe[rawKey];
    const bc = cleanBarcode(rawKey);
    const qty = original.quantity;
    // Direct product offer matching (exact barcode, productId, or endsWith prefix)
    const trigger = normalizedOffers.find((o) => {
      if (o.clearanceActive !== true) return false;
      const op = cleanBarcode(o.productId ?? o.id ?? "");
      const ob = cleanBarcode(o.barcode ?? "");
      return (
        ob === bc ||
        op === bc ||
        (op.length > 0 && op.endsWith(bc)) ||
        (ob.length > 0 && bc.endsWith(ob)) ||
        (op.length > 0 && bc.endsWith(op))
      );
    });

    const stock =
      liveStock[bc] ??
      liveStock[rawKey] ??
      (trigger?.stock ?? trigger?.physicalStock ?? 999);
    const mrp = original.originalPrice;

    // Cross-product offer matching (this item is the target free / discounted item)
    const crossTarget = normalizedOffers.find((o) => {
      if (o.clearanceActive !== true) return false;
      const tp = cleanBarcode(o.targetProductId ?? "");
      return tp.length > 0 && (tp === bc || tp.endsWith(bc) || bc.endsWith(tp));
    });

    let currentHint = "";
    let currentExpiry = 0;

    if (trigger) {
      const ot = (trigger.clearanceType ?? "").toUpperCase();

      // Dynamic Hint calculation
      if (ot === "BOGO" || ot === "BUY_X_GET_Y") {
        const bQ = trigger.buyQty ?? 1;
        const fQ = trigger.freeQty ?? 1;
        if (qty % bQ !== 0 || qty < bQ) {
          currentHint = `Add ${bQ - (qty % bQ)} more to get ${fQ} FREE! 🎁`;
        }
      } else if (ot === "TIERED_QTY") {
        const minQ = trigger.minQty ?? 1;
        if (qty < minQ) {
          currentHint = `Add ${minQ - qty} more to get ${safeParse(trigger.discount)}% OFF! 📉`;
        }
      } else if (ot === "BUNDLE_PRICE") {
        const bQ = trigger.bundleQty ?? 1;
        if (qty % bQ !== 0 || qty < bQ) {
          currentHint = `Add ${bQ - (qty % bQ)} more to get ${bQ} for ₹${trigger.bundlePrice}! 📦`;
        }
      } else if (ot === "FLASH_SALE") {
        currentExpiry = parseExpiryMs(trigger.expiresAt);
      }

      // ── CROSS OFFER TRIGGER IDENTIFICATION ──────────────────────────
      if (ot === "BUY_X_GET_Y_CROSS" || ot === "CROSS_PRODUCT") {
        const tp = cleanBarcode(trigger.targetProductId ?? "");
        const targetInCart = Object.keys(safe).some((k) => tp.endsWith(cleanBarcode(k)));
        const targetName = trigger.targetProductName ?? "Combo Item";
        const comboHint = targetInCart ? "" : `Combo Starter: Add ${targetName} to unlock offer! 🎁`;

        writeLine({
          key: bc,
          barcode: bc,
          name: original.name,
          originalPrice: mrp,
          quantity: qty,
          active: true,
          type: ot,
          unitPrice: mrp,
          hint: comboHint,
          targetId: cleanBarcode(trigger.targetProductId),
        });
        continue;
      }

      // ── BOGO / BUY_X_GET_Y: The core retail cycle math ──────────────
      if (ot === "BOGO" || ot === "BUY_X_GET_Y") {
        const bQty = trigger.buyQty ?? 1;
        const fQty = trigger.freeQty ?? 1;
        if (bQty <= 0) continue;

        const eligibleCycles = Math.floor(qty / bQty);
        const theoreticalFree = eligibleCycles * fQty;

        // Stock guard check: services and unconstrained items always get full promo
        const isService =
          (original.category ?? "").toUpperCase() === "SERVICE" ||
          (original.name ?? "").toLowerCase().includes("service") ||
          (original.name ?? "").toLowerCase().includes("repair") ||
          (original.name ?? "").toLowerCase().includes("subscription") ||
          (trigger.itemType ?? "").toUpperCase() === "SERVICE";

        let actualFreeEarned = theoreticalFree;
        if (!isService && stock > 0 && stock >= qty) {
          const maxFreeAllowedByStock = Math.max(0, stock - qty);
          actualFreeEarned = Math.min(theoreticalFree, maxFreeAllowedByStock);
        }

        writeLine({
          key: bc,
          barcode: bc,
          name: original.name,
          originalPrice: mrp,
          quantity: qty,
          active: actualFreeEarned > 0,
          type: ot,
          unitPrice: mrp,
          hint: currentHint,
          freeQtyGiven: actualFreeEarned,
        });

        // Append free line if earned
        if (actualFreeEarned > 0) {
          freeCount += actualFreeEarned;
          writeLine({
            key: `${bc}_FREE`,
            barcode: bc,
            name: `${original.name} (FREE)`,
            originalPrice: mrp,
            quantity: actualFreeEarned,
            active: true,
            type: "FREE_ITEM",
            unitPrice: 0.0,
            isFreeLine: true,
          });
        }
        continue;
      }

      // ── TIERED_QTY ──────────────────────────────────────────────────
      if (ot === "TIERED_QTY") {
        const minQ = trigger.minQty ?? 1;
        const disc = safeParse(trigger.discount);
        const met = qty >= minQ;
        writeLine({
          key: bc,
          barcode: bc,
          name: original.name,
          originalPrice: mrp,
          quantity: qty,
          active: met,
          type: ot,
          unitPrice: met ? mrp * (1 - disc / 100) : mrp,
          hint: currentHint,
        });
        continue;
      }

      // ── FLASH_SALE ──────────────────────────────────────────────────
      if (ot === "FLASH_SALE") {
        const expMs = currentExpiry || parseExpiryMs(trigger.expiresAt);
        const expired = expMs > 0 && Date.now() > expMs;
        const disc = safeParse(trigger.discount ?? trigger.discountPercent ?? trigger.value1);
        writeLine({
          key: bc,
          barcode: bc,
          name: original.name,
          originalPrice: mrp,
          quantity: qty,
          active: !expired,
          type: expired ? "" : ot,
          unitPrice: expired ? mrp : mrp * (1 - disc / 100),
          expiry: expired ? 0 : expMs,
        });
        continue;
      }

      // ── BUNDLE_PRICE ────────────────────────────────────────────────
      if (ot === "BUNDLE_PRICE") {
        const bunQty = trigger.bundleQty ?? 1;
        const bunPrice = safeParse(trigger.bundlePrice);
        const fullB = Math.floor(qty / bunQty);
        const rem = qty % bunQty;
        const total = fullB * bunPrice + rem * mrp;
        writeLine({
          key: bc,
          barcode: bc,
          name: original.name,
          originalPrice: mrp,
          quantity: qty,
          active: fullB > 0,
          type: ot,
          unitPrice: qty > 0 ? total / qty : mrp,
          hint: currentHint,
        });
        continue;
      }

      // ── PERCENTAGE ──────────────────────────────────────────────────
      if (ot === "PERCENTAGE") {
        const disc = safeParse(trigger.discount ?? trigger.discountPercent);
        writeLine({
          key: bc,
          barcode: bc,
          name: original.name,
          originalPrice: mrp,
          quantity: qty,
          active: true,
          type: ot,
          unitPrice: mrp * (1 - disc / 100),
        });
        continue;
      }

      // ── FLAT_AMOUNT ─────────────────────────────────────────────────
      if (ot === "FLAT_AMOUNT") {
        const flat = safeParse(trigger.discount ?? trigger.discountAmount);
        writeLine({
          key: bc,
          barcode: bc,
          name: original.name,
          originalPrice: mrp,
          quantity: qty,
          active: true,
          type: ot,
          unitPrice: Math.max(0, mrp - flat),
        });
        continue;
      }
    }

    // ── CROSS TARGET LOGIC ────────────────────────────────────────────
    if (crossTarget) {
      const ct = (crossTarget.clearanceType ?? "").toUpperCase();
      const trigId = cleanBarcode(crossTarget.productId ?? "");
      const trigBc = cleanBarcode(crossTarget.barcode ?? "");

      const trigEntry = Object.entries(safe).find(([k]) => {
        const cleanK = cleanBarcode(k);
        return cleanK === trigBc || cleanK === trigId || (trigId.length > 0 && cleanK.endsWith(trigId));
      });

      if (!trigEntry) {
        const trigName = crossTarget.productName ?? crossTarget.name ?? "Combo Item";
        writeLine({
          key: bc,
          barcode: bc,
          name: original.name,
          originalPrice: mrp,
          quantity: qty,
          active: false,
          type: "",
          unitPrice: mrp,
          hint: `Unlock FREE with ${trigName}! 🔗`,
        });
        continue;
      }

      const trigQty = trigEntry[1].quantity;

      if (ct === "BUY_X_GET_Y_CROSS") {
        const cbQty = crossTarget.buyQty ?? 1;
        const cfQty = crossTarget.freeQty ?? 1;
        const earnedFree = cbQty > 0 ? Math.floor(trigQty / cbQty) * cfQty : 0;
        const isService =
          (original.category ?? "").toUpperCase() === "SERVICE" ||
          (original.name ?? "").toLowerCase().includes("service") ||
          (original.name ?? "").toLowerCase().includes("repair") ||
          (original.name ?? "").toLowerCase().includes("subscription") ||
          (crossTarget.itemType ?? "").toUpperCase() === "SERVICE";

        let maxFreeAllowed = earnedFree;
        if (!isService && stock > 0) {
          maxFreeAllowed = Math.min(earnedFree, stock);
        }
        const freeToGive = Math.min(maxFreeAllowed, qty);
        const paidCount = qty - freeToGive;

        if (freeToGive > 0) {
          freeCount += freeToGive;
          writeLine({
            key: `${bc}_FREE`,
            barcode: bc,
            name: `${original.name} (FREE)`,
            originalPrice: mrp,
            quantity: freeToGive,
            active: true,
            type: "FREE_ITEM",
            unitPrice: 0.0,
            isFreeLine: true,
            targetId: trigId,
          });
        }

        if (paidCount > 0) {
          writeLine({
            key: freeToGive > 0 ? `${bc}_OVERFLOW` : bc,
            barcode: bc,
            name: original.name,
            originalPrice: mrp,
            quantity: paidCount,
            active: false,
            type: "",
            unitPrice: mrp,
            isOverflow: freeToGive > 0,
          });
        }
        continue;
      }

      if (ct === "CROSS_PRODUCT") {
        const disc = safeParse(crossTarget.discount ?? crossTarget.discountPercent);
        const discountedQty = Math.min(qty, trigQty);
        const normalQty = qty - discountedQty;

        if (discountedQty > 0) {
          writeLine({
            key: bc,
            barcode: bc,
            name: original.name,
            originalPrice: mrp,
            quantity: discountedQty,
            active: true,
            type: ct,
            unitPrice: mrp * (1 - disc / 100),
            targetId: trigId,
          });
        }

        if (normalQty > 0) {
          writeLine({
            key: discountedQty > 0 ? `${bc}_OVERFLOW` : bc,
            barcode: bc,
            name: original.name,
            originalPrice: mrp,
            quantity: normalQty,
            active: false,
            type: "",
            unitPrice: mrp,
            isOverflow: discountedQty > 0,
          });
        }
        continue;
      }
    }

    // No offer applied — standard line
    writeLine({
      key: bc,
      barcode: bc,
      name: original.name,
      originalPrice: mrp,
      quantity: qty,
      active: false,
      type: "",
      unitPrice: mrp,
    });
  }

  let totalRetailValue = 0;
  let paidItemsSubtotal = 0;
  let freeItemsWorth = 0;
  let cashDiscount = 0;

  for (const line of lines) {
    const lineRetail = line.originalPrice * line.quantity;
    totalRetailValue += lineRetail;
    if (line.isFreeLine) {
      freeItemsWorth += lineRetail;
    } else {
      paidItemsSubtotal += lineRetail;
      cashDiscount += (line.originalPrice - line.finalUnitPrice) * line.quantity;
    }
  }

  const finalDiscount = Math.max(0, freeItemsWorth + cashDiscount);

  return {
    lines,
    updatedCartItems: result,
    totalRetailValue,
    paidItemsSubtotal,
    freeItemsWorth,
    cashDiscount,
    totalAppliedDiscount: finalDiscount,
    totalDiscount: finalDiscount,
    newGrandTotal: grandTotal,
    grandTotal,
    totalFreeItems: freeCount,
  };
}

// Helper to group items by base barcode for clean POS Cart UI display
export function buildCartGroups(lines: PricedLine[]): CartGroup[] {
  const groups: Record<string, CartGroup> = {};

  for (const line of lines) {
    const baseBc = line.barcode;
    if (!groups[baseBc]) {
      groups[baseBc] = {
        baseKey: baseBc,
        name: line.name.replace(/ \(FREE\)$/, ""),
        originalPrice: line.originalPrice,
        totalQuantity: 0,
        paidQuantity: 0,
        effectiveUnitPrice: line.originalPrice,
        totalLinePrice: 0,
        hint: "",
        hasOffer: false,
        offerType: "",
      };
    }

    const g = groups[baseBc];
    g.totalQuantity += line.quantity;
    g.totalLinePrice += line.finalUnitPrice * line.quantity;

    if (line.flashExpiry && line.flashExpiry > 0) {
      g.flashExpiry = line.flashExpiry;
    }

    if (line.isFreeLine) {
      g.freeItem = line;
      g.hasOffer = true;
    } else if (line.isOverflow) {
      g.overflowItem = line;
      g.paidQuantity += line.quantity;
    } else {
      g.baseItem = line;
      g.paidQuantity += line.quantity;
      if (line.offerActive || (line.offerType && line.offerType.trim().length > 0)) {
        g.hasOffer = true;
      }
      if (line.offerType) {
        g.offerType = line.offerType;
      }
      if (line.hint) {
        g.hint = line.hint;
      }
      g.effectiveUnitPrice = line.finalUnitPrice;
    }
  }

  return Object.values(groups);
}