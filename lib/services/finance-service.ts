import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import {
  LedgerAccountDocument,
  LedgerVoucherDocument,
  LedgerEntryDocument,
  DEFAULT_CHART_OF_ACCOUNTS,
  VoucherType,
  VoucherSourceType,
  validateBalancedLedgerEntries,
  AccountType,
  BalanceType,
  GstFilingDocument,
  GstFilingType,
  GstFilingStatus,
  getStandardGstDueDates,
  computeGstFilingStatus,
  BankStatementRow,
  BankStatementImportDocument,
  parseBankStatementCsv,
} from "@/lib/schemas/finance-schema";

const VOUCHER_TYPE_PREFIX: Record<VoucherType, string> = {
  PAYMENT: "P",
  RECEIPT: "R",
  JOURNAL: "J",
  CONTRA: "C",
  SALES: "S",
  PURCHASE: "PUR",
};

/**
 * 1. Fetch all chart of accounts for a tenant.
 * Automatically seeds standard DEFAULT_CHART_OF_ACCOUNTS on first tenant activation.
 */
export async function getLedgerAccounts(tenantId: string): Promise<LedgerAccountDocument[]> {
  const snap = await adminDb
    .collection("ledger_accounts")
    .where("tenantId", "==", tenantId)
    .get();

  if (snap.empty) {
    // First-time activation seed
    const batch = adminDb.batch();
    const seededAccounts: LedgerAccountDocument[] = [];
    const now = Date.now();

    for (const seed of DEFAULT_CHART_OF_ACCOUNTS) {
      const docRef = adminDb.collection("ledger_accounts").doc();
      const accData: LedgerAccountDocument = {
        id: docRef.id,
        tenantId,
        accountName: seed.accountName,
        accountType: seed.accountType,
        accountGroup: seed.accountGroup,
        openingBalance: seed.openingBalance,
        openingBalanceType: seed.openingBalanceType,
        isSystemAccount: true,
        createdAtMs: now,
      };
      batch.set(docRef, accData);
      seededAccounts.push(accData);
    }

    await batch.commit();
    return seededAccounts;
  }

  const accounts: LedgerAccountDocument[] = snap.docs.map((doc) => {
    const d = doc.data();
    return {
      id: doc.id,
      tenantId: d.tenantId,
      accountName: d.accountName,
      accountType: d.accountType,
      accountGroup: d.accountGroup,
      openingBalance: Number(d.openingBalance || 0),
      openingBalanceType: d.openingBalanceType || "DR",
      isSystemAccount: d.isSystemAccount === true,
      createdAtMs: Number(d.createdAtMs || 0),
    };
  });

  return accounts.sort((a, b) => a.accountName.localeCompare(b.accountName));
}

/**
 * 2. Create a custom Ledger Account for a tenant.
 * Rejects creating an account with the same name as an existing system account or duplicate name.
 */
export async function createLedgerAccount(params: {
  tenantId: string;
  accountName: string;
  accountType: AccountType;
  accountGroup: string;
  openingBalance?: number;
  openingBalanceType?: BalanceType;
}): Promise<{ ok: boolean; account?: LedgerAccountDocument; error?: string }> {
  const cleanName = params.accountName.trim();
  if (!cleanName) {
    return { ok: false, error: "Account name is required." };
  }

  // Check if system account name or existing duplicate in tenant
  const isSystemName = DEFAULT_CHART_OF_ACCOUNTS.some(
    (s) => s.accountName.toLowerCase() === cleanName.toLowerCase()
  );
  if (isSystemName) {
    return {
      ok: false,
      error: `Cannot create account '${cleanName}' as it is reserved by the standard System Chart of Accounts.`,
    };
  }

  const existingSnap = await adminDb
    .collection("ledger_accounts")
    .where("tenantId", "==", params.tenantId)
    .where("accountName", "==", cleanName)
    .get();

  if (!existingSnap.empty) {
    return {
      ok: false,
      error: `An account named '${cleanName}' already exists in your Chart of Accounts.`,
    };
  }

  const docRef = adminDb.collection("ledger_accounts").doc();
  const accData: LedgerAccountDocument = {
    id: docRef.id,
    tenantId: params.tenantId,
    accountName: cleanName,
    accountType: params.accountType,
    accountGroup: params.accountGroup.trim(),
    openingBalance: Number(params.openingBalance || 0),
    openingBalanceType: params.openingBalanceType || "DR",
    isSystemAccount: false,
    createdAtMs: Date.now(),
  };

  await docRef.set(accData);
  return { ok: true, account: accData };
}

/**
 * 3. Generate the next auto-incrementing voucher number per tenant per voucherType.
 * (e.g., P-1001, R-1001, J-1001, C-1001, S-1001, PUR-1001).
 */
export async function getNextVoucherNo(tenantId: string, voucherType: VoucherType): Promise<string> {
  const prefix = VOUCHER_TYPE_PREFIX[voucherType] || "V";

  const snap = await adminDb
    .collection("ledger_vouchers")
    .where("tenantId", "==", tenantId)
    .where("voucherType", "==", voucherType)
    .orderBy("createdAtMs", "desc")
    .limit(1)
    .get();

  if (snap.empty) {
    return `${prefix}-1001`;
  }

  const lastVoucher = snap.docs[0].data();
  const lastNoStr = String(lastVoucher.voucherNo || "");
  const numPart = parseInt(lastNoStr.replace(/\D/g, ""), 10);

  if (isNaN(numPart) || numPart < 1000) {
    return `${prefix}-1001`;
  }

  return `${prefix}-${numPart + 1}`;
}

/**
 * 4. Atomic Double-Entry Voucher Creation:
 * Validates double-entry balance (sum DR == sum CR), auto-generates voucherNo,
 * and writes the voucher + all entries in a single Firestore transaction/batch.
 */
export async function createVoucher(params: {
  tenantId: string;
  voucherType: VoucherType;
  date: string;
  narration?: string;
  createdBy: string;
  entries: Array<{
    accountId: string;
    entryType: BalanceType;
    amount: number;
  }>;
  sourceType?: VoucherSourceType;
  sourceRefId?: string;
}): Promise<{ ok: boolean; voucherId?: string; voucherNo?: string; error?: string }> {
  const { tenantId, voucherType, date, narration = "", createdBy, entries, sourceType = "MANUAL", sourceRefId } = params;

  if (!entries || entries.length < 2) {
    return { ok: false, error: "A voucher must contain at least 2 ledger entries (double-entry principle)." };
  }

  // 1. Double-Entry Balance Check
  const balanceCheck = validateBalancedLedgerEntries(entries);
  if (!balanceCheck.isBalanced) {
    return {
      ok: false,
      error: `Unbalanced voucher: Total DR (₹${balanceCheck.totalDr.toFixed(2)}) does not equal Total CR (₹${balanceCheck.totalCr.toFixed(2)}). Difference: ₹${balanceCheck.diff.toFixed(2)}.`,
    };
  }

  // 2. Validate all referenced accounts exist for this tenant
  const accountsSnap = await adminDb
    .collection("ledger_accounts")
    .where("tenantId", "==", tenantId)
    .get();

  const accountIdMap = new Map<string, string>();
  accountsSnap.docs.forEach((d) => accountIdMap.set(d.id, d.data().accountName || d.id));

  for (const entry of entries) {
    if (!accountIdMap.has(entry.accountId)) {
      return { ok: false, error: `Invalid account ID '${entry.accountId}' for this organization.` };
    }
  }

  // 3. Generate next voucher number
  const voucherNo = await getNextVoucherNo(tenantId, voucherType);
  const now = Date.now();

  const batch = adminDb.batch();

  // 4. Voucher Document
  const voucherRef = adminDb.collection("ledger_vouchers").doc();
  const voucherData: LedgerVoucherDocument = {
    id: voucherRef.id,
    tenantId,
    voucherType,
    voucherNo,
    date: date.trim(),
    narration: narration.trim(),
    createdBy: createdBy.trim(),
    createdAtMs: now,
    sourceType: sourceType || "MANUAL",
    sourceRefId: sourceRefId || null,
  };
  batch.set(voucherRef, voucherData);

  // 5. Entry Documents (Atomic with Voucher)
  for (const entry of entries) {
    const entryRef = adminDb.collection("ledger_entries").doc();
    const entryData: LedgerEntryDocument = {
      id: entryRef.id,
      tenantId,
      voucherId: voucherRef.id,
      accountId: entry.accountId,
      entryType: entry.entryType,
      amount: Math.round(entry.amount * 100) / 100,
      date: date.trim(),
    };
    batch.set(entryRef, entryData);
  }

  // 6. Audit Log
  const auditRef = adminDb.collection("admin_audit_logs").doc();
  batch.set(auditRef, {
    action: "FINANCE_VOUCHER_CREATED",
    actionType: "FINANCE_VOUCHER_CREATED",
    targetCollection: "ledger_vouchers",
    targetId: voucherRef.id,
    voucherNo,
    voucherType,
    tenantId,
    amount: balanceCheck.totalDr,
    actorId: createdBy,
    actorEmail: createdBy,
    details: `Created ${voucherType} voucher ${voucherNo} with ${entries.length} balanced entries totaling ₹${balanceCheck.totalDr.toFixed(2)}.`,
    severity: "INFO",
    timestamp: FieldValue.serverTimestamp(),
  });

  await batch.commit();

  return {
    ok: true,
    voucherId: voucherRef.id,
    voucherNo,
  };
}

export interface LedgerViewRow {
  entryId: string;
  voucherId: string;
  voucherNo: string;
  voucherType: VoucherType;
  date: string;
  particulars: string;
  narration: string;
  debit: number | null;
  credit: number | null;
  runningBalance: number;
  runningBalanceType: BalanceType;
}

export interface AccountLedgerResult {
  account: LedgerAccountDocument;
  openingBalance: { amount: number; type: BalanceType };
  closingBalance: { amount: number; type: BalanceType };
  totalDebit: number;
  totalCredit: number;
  rows: LedgerViewRow[];
}

/**
 * 5. Tally-Style Chronological Account Ledger View:
 * Returns chronological entries for one account with a running balance computed entry-by-entry:
 * Date | Particulars | Vch Type | Vch No. | Debit | Credit | Running Balance (DR/CR).
 */
export async function getAccountLedger(
  tenantId: string,
  accountId: string,
  dateRange?: { startDate?: string; endDate?: string }
): Promise<AccountLedgerResult | null> {
  const accountDoc = await adminDb.collection("ledger_accounts").doc(accountId).get();
  if (!accountDoc.exists) return null;

  const accountData = accountDoc.data() as LedgerAccountDocument;
  accountData.id = accountDoc.id;

  // 1. Fetch all accounts for particulars resolution
  const allAccountsSnap = await adminDb
    .collection("ledger_accounts")
    .where("tenantId", "==", tenantId)
    .get();
  const accountNames = new Map<string, string>();
  allAccountsSnap.docs.forEach((d) => accountNames.set(d.id, d.data().accountName || d.id));

  // 2. Query all entries for this account
  const entriesSnap = await adminDb
    .collection("ledger_entries")
    .where("tenantId", "==", tenantId)
    .where("accountId", "==", accountId)
    .get();

  if (entriesSnap.empty) {
    const ob = accountData.openingBalance || 0;
    const obType = accountData.openingBalanceType || "DR";
    return {
      account: accountData,
      openingBalance: { amount: ob, type: obType },
      closingBalance: { amount: ob, type: obType },
      totalDebit: 0,
      totalCredit: 0,
      rows: [],
    };
  }

  // 3. Fetch unique vouchers for metadata
  const voucherIds = Array.from(new Set(entriesSnap.docs.map((d) => d.data().voucherId)));
  const voucherMap = new Map<string, LedgerVoucherDocument>();

  // Chunk voucher fetches in groups of 30 for Firestore 'in' limit
  for (let i = 0; i < voucherIds.length; i += 30) {
    const chunk = voucherIds.slice(i, i + 30);
    const vSnap = await adminDb
      .collection("ledger_vouchers")
      .where("id", "in", chunk)
      .get();
    vSnap.docs.forEach((d) => voucherMap.set(d.id, d.data() as LedgerVoucherDocument));
  }

  // 4. Fetch opposing entries for all these vouchers to build accurate "Particulars"
  const allVoucherEntriesSnap = await adminDb
    .collection("ledger_entries")
    .where("tenantId", "==", tenantId)
    .where("voucherId", "in", voucherIds.slice(0, 30))
    .get();

  const voucherOpposingMap = new Map<string, string[]>();
  allVoucherEntriesSnap.docs.forEach((d) => {
    const data = d.data();
    if (data.accountId !== accountId) {
      const name = accountNames.get(data.accountId) || "Opposing Account";
      if (!voucherOpposingMap.has(data.voucherId)) {
        voucherOpposingMap.set(data.voucherId, []);
      }
      voucherOpposingMap.get(data.voucherId)!.push(name);
    }
  });

  // 5. Sort entries chronologically by date
  const sortedEntries = entriesSnap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as LedgerEntryDocument),
  }));

  sortedEntries.sort((a, b) => {
    const dateComp = (a.date || "").localeCompare(b.date || "");
    if (dateComp !== 0) return dateComp;
    return (voucherMap.get(a.voucherId)?.createdAtMs || 0) - (voucherMap.get(b.voucherId)?.createdAtMs || 0);
  });

  // 6. Compute running balances
  const isNormalDebit = accountData.accountType === "ASSET" || accountData.accountType === "EXPENSE";
  let netBalance = (accountData.openingBalanceType === "DR" ? 1 : -1) * (accountData.openingBalance || 0);

  const rawRows: LedgerViewRow[] = [];
  let totalDr = 0;
  let totalCr = 0;

  for (const entry of sortedEntries) {
    const v = voucherMap.get(entry.voucherId);
    const dr = entry.entryType === "DR" ? entry.amount : null;
    const cr = entry.entryType === "CR" ? entry.amount : null;

    if (dr) {
      netBalance += dr;
      totalDr += dr;
    }
    if (cr) {
      netBalance -= cr;
      totalCr += cr;
    }

    const opposing = voucherOpposingMap.get(entry.voucherId) || [];
    const particularsPrefix = entry.entryType === "DR" ? "To " : "By ";
    const particularsName = opposing.length > 0 ? opposing.join(", ") : accountData.accountName;
    const particulars = `${particularsPrefix}${particularsName}`;

    let runningBalanceType: BalanceType = "DR";
    let displayBalance = netBalance;

    if (isNormalDebit) {
      runningBalanceType = netBalance >= 0 ? "DR" : "CR";
      displayBalance = Math.abs(netBalance);
    } else {
      // Normal Credit Account (LIABILITY, EQUITY, INCOME)
      runningBalanceType = netBalance <= 0 ? "CR" : "DR";
      displayBalance = Math.abs(netBalance);
    }

    rawRows.push({
      entryId: entry.id,
      voucherId: entry.voucherId,
      voucherNo: v?.voucherNo || "—",
      voucherType: v?.voucherType || "JOURNAL",
      date: entry.date,
      particulars,
      narration: v?.narration || "",
      debit: dr,
      credit: cr,
      runningBalance: Math.round(displayBalance * 100) / 100,
      runningBalanceType,
    });
  }

  // Filter by date range if provided
  let filteredRows = rawRows;
  if (dateRange?.startDate) {
    filteredRows = filteredRows.filter((r) => r.date >= dateRange.startDate!);
  }
  if (dateRange?.endDate) {
    filteredRows = filteredRows.filter((r) => r.date <= dateRange.endDate!);
  }

  const closingAmount = Math.abs(netBalance);
  const closingType: BalanceType = isNormalDebit
    ? netBalance >= 0 ? "DR" : "CR"
    : netBalance <= 0 ? "CR" : "DR";

  return {
    account: accountData,
    openingBalance: {
      amount: accountData.openingBalance || 0,
      type: accountData.openingBalanceType || "DR",
    },
    closingBalance: {
      amount: Math.round(closingAmount * 100) / 100,
      type: closingType,
    },
    totalDebit: Math.round(totalDr * 100) / 100,
    totalCredit: Math.round(totalCr * 100) / 100,
    rows: filteredRows,
  };
}

/**
 * Fetch recent vouchers for tenant.
 */
export async function getRecentVouchers(tenantId: string, limitCount = 50): Promise<LedgerVoucherDocument[]> {
  const snap = await adminDb
    .collection("ledger_vouchers")
    .where("tenantId", "==", tenantId)
    .orderBy("createdAtMs", "desc")
    .limit(limitCount)
    .get();

  return snap.docs.map((doc) => {
    const d = doc.data();
    return {
      id: doc.id,
      tenantId: d.tenantId,
      voucherType: d.voucherType,
      voucherNo: d.voucherNo,
      date: d.date,
      narration: d.narration || "",
      createdBy: d.createdBy,
      createdAtMs: Number(d.createdAtMs || 0),
      sourceType: d.sourceType || "MANUAL",
      sourceRefId: d.sourceRefId || null,
    };
  });
}

/**
 * Helper to lookup account ID by name or auto-seed/create if missing
 */
async function getOrSeedAccountId(
  tenantId: string,
  accountName: string,
  accountType: AccountType,
  accountGroup: string
): Promise<string> {
  const accounts = await getLedgerAccounts(tenantId);
  const found = accounts.find((a) => a.accountName.toLowerCase() === accountName.toLowerCase());
  if (found && found.id) return found.id;

  const created = await createLedgerAccount({
    tenantId,
    accountName,
    accountType,
    accountGroup,
    openingBalance: 0,
    openingBalanceType: "DR",
  });

  if (created.ok && created.account?.id) {
    return created.account.id;
  }
  throw new Error(`Failed to resolve ledger account '${accountName}'.`);
}

/**
 * 6. Auto-Post Sales Voucher (idempotent per orderId)
 * Reads order from orders/{orderId} (READ-ONLY).
 * Dr Cash in Hand / Bank Account for netRealizedAmount
 * Cr Sales A/c for taxableBase
 * Cr GST Payable for gstTotal (if > 0)
 */
export async function postSalesVoucher(
  tenantId: string,
  orderId: string
): Promise<{ ok: boolean; alreadyPosted?: boolean; voucherId?: string; voucherNo?: string; error?: string }> {
  // Idempotency check
  const existingVoucherSnap = await adminDb
    .collection("ledger_vouchers")
    .where("tenantId", "==", tenantId)
    .where("sourceRefId", "==", orderId)
    .where("sourceType", "==", "AUTO_SALES")
    .limit(1)
    .get();

  if (!existingVoucherSnap.empty) {
    const v = existingVoucherSnap.docs[0].data();
    return { ok: true, alreadyPosted: true, voucherId: existingVoucherSnap.docs[0].id, voucherNo: v.voucherNo };
  }

  const orderDoc = await adminDb.collection("orders").doc(orderId).get();
  if (!orderDoc.exists) {
    return { ok: false, error: `Order '${orderId}' not found.` };
  }

  const orderData = orderDoc.data()!;
  const netRealizedAmount = Number(orderData.totalAmount ?? orderData.netAmount ?? orderData.totalPrice ?? 0);
  if (netRealizedAmount <= 0) {
    return { ok: false, error: "Order has zero realized amount." };
  }

  let gstTotal = Number(orderData.gstTotal ?? orderData.taxAmount ?? orderData.gstAmount ?? 0);
  let taxableBase = netRealizedAmount;

  if (gstTotal > 0 && gstTotal < netRealizedAmount) {
    taxableBase = Math.round((netRealizedAmount - gstTotal) * 100) / 100;
  } else {
    gstTotal = 0;
  }

  const paymentMode = String(orderData.paymentMode || "").toUpperCase();
  const isCash = paymentMode === "CASH";
  const debitAccountName = isCash ? "Cash in Hand" : "Bank Account";

  const [debitAccId, salesAccId, gstAccId] = await Promise.all([
    getOrSeedAccountId(tenantId, debitAccountName, "ASSET", isCash ? "Cash in Hand" : "Bank Account"),
    getOrSeedAccountId(tenantId, "Sales A/c", "INCOME", "Sales A/c"),
    gstTotal > 0 ? getOrSeedAccountId(tenantId, "GST Payable", "LIABILITY", "GST Payable") : Promise.resolve(null),
  ]);

  const entries: Array<{ accountId: string; entryType: BalanceType; amount: number }> = [
    { accountId: debitAccId, entryType: "DR", amount: netRealizedAmount },
    { accountId: salesAccId, entryType: "CR", amount: taxableBase },
  ];

  if (gstTotal > 0 && gstAccId) {
    entries.push({ accountId: gstAccId, entryType: "CR", amount: gstTotal });
  }

  let dateStr = new Date().toISOString().slice(0, 10);
  if (orderData.exitTimestamp?.toDate) {
    dateStr = orderData.exitTimestamp.toDate().toISOString().slice(0, 10);
  } else if (orderData.timestamp?.toDate) {
    dateStr = orderData.timestamp.toDate().toISOString().slice(0, 10);
  }

  return await createVoucher({
    tenantId,
    voucherType: "SALES",
    date: dateStr,
    narration: `Auto-posted Sales invoice for Order #${orderId.slice(0, 8)} via ${paymentMode || "Online"}`,
    createdBy: "SYSTEM_SALES_AUTOPOST",
    entries,
    sourceType: "AUTO_SALES",
    sourceRefId: orderId,
  });
}

/**
 * 7. Auto-Post Purchase Voucher (idempotent per poId)
 * Reads PO from purchase_orders/{poId} (READ-ONLY).
 * Dr Purchase A/c for total PO value
 * Cr Supplier account (or Sundry Creditors) for total PO value
 */
export async function postPurchaseVoucher(
  tenantId: string,
  poId: string
): Promise<{ ok: boolean; alreadyPosted?: boolean; voucherId?: string; voucherNo?: string; error?: string }> {
  // Idempotency check
  const existingVoucherSnap = await adminDb
    .collection("ledger_vouchers")
    .where("tenantId", "==", tenantId)
    .where("sourceRefId", "==", poId)
    .where("sourceType", "==", "AUTO_PURCHASE")
    .limit(1)
    .get();

  if (!existingVoucherSnap.empty) {
    const v = existingVoucherSnap.docs[0].data();
    return { ok: true, alreadyPosted: true, voucherId: existingVoucherSnap.docs[0].id, voucherNo: v.voucherNo };
  }

  const poDoc = await adminDb.collection("purchase_orders").doc(poId).get();
  if (!poDoc.exists) {
    return { ok: false, error: `Purchase Order '${poId}' not found.` };
  }

  const poData = poDoc.data()!;
  const totalValue = Number(poData.totalOrderValue ?? poData.grandTotal ?? poData.totalAmount ?? 0);
  if (totalValue <= 0) {
    return { ok: false, error: "Purchase Order has zero order value." };
  }

  const rawSupplierName = String(poData.supplierName || "").trim();
  const supplierAccountName = rawSupplierName || `Supplier_${(poData.supplierId || poId).slice(0, 6)}`;

  // Check if PO includes tax/GST data
  let gstTotal = Number(poData.gstTotal ?? poData.taxAmount ?? poData.gstAmount ?? 0);
  let taxableBase = totalValue;

  if (gstTotal > 0 && gstTotal < totalValue) {
    taxableBase = Math.round((totalValue - gstTotal) * 100) / 100;
  } else {
    gstTotal = 0;
  }

  const [purchaseAccId, supplierAccId, gstRecAccId] = await Promise.all([
    getOrSeedAccountId(tenantId, "Purchase A/c", "EXPENSE", "Purchase A/c"),
    getOrSeedAccountId(tenantId, supplierAccountName, "LIABILITY", "Sundry Creditors"),
    gstTotal > 0 ? getOrSeedAccountId(tenantId, "GST Receivable", "ASSET", "GST Receivable") : Promise.resolve(null),
  ]);

  const dateStr = poData.createdAtMs
    ? new Date(poData.createdAtMs).toISOString().slice(0, 10)
    : new Date().toISOString().slice(0, 10);

  const entries: Array<{ accountId: string; entryType: BalanceType; amount: number }> = [
    { accountId: purchaseAccId, entryType: "DR", amount: taxableBase },
  ];

  if (gstTotal > 0 && gstRecAccId) {
    entries.push({ accountId: gstRecAccId, entryType: "DR", amount: gstTotal });
  }

  entries.push({ accountId: supplierAccId, entryType: "CR", amount: totalValue });

  return await createVoucher({
    tenantId,
    voucherType: "PURCHASE",
    date: dateStr,
    narration: `Auto-posted Purchase Order #${poId.slice(0, 8)} (${supplierAccountName})${gstTotal > 0 ? ` with ₹${gstTotal.toFixed(2)} ITC GST` : ""}`,
    createdBy: "SYSTEM_PO_AUTOPOST",
    entries,
    sourceType: "AUTO_PURCHASE",
    sourceRefId: poId,
  });
}

/**
 * 8. Auto-Post Salary Voucher (idempotent per staffId + month)
 * Reads salary structure (READ-ONLY).
 * Dr Salary Expense
 * Cr Salary Payable
 */
export async function postSalaryVoucher(
  tenantId: string,
  staffId: string,
  month: string
): Promise<{ ok: boolean; alreadyPosted?: boolean; voucherId?: string; voucherNo?: string; error?: string }> {
  const sourceRefKey = `${staffId}_${month}`;

  // Idempotency check
  const existingVoucherSnap = await adminDb
    .collection("ledger_vouchers")
    .where("tenantId", "==", tenantId)
    .where("sourceRefId", "==", sourceRefKey)
    .where("sourceType", "==", "AUTO_SALARY")
    .limit(1)
    .get();

  if (!existingVoucherSnap.empty) {
    const v = existingVoucherSnap.docs[0].data();
    return { ok: true, alreadyPosted: true, voucherId: existingVoucherSnap.docs[0].id, voucherNo: v.voucherNo };
  }

  // Fetch staff & salary structure
  const [staffDoc, salarySnap] = await Promise.all([
    adminDb.collection("staff").doc(staffId).get(),
    adminDb.collection("salary_structures").where("staffId", "==", staffId).orderBy("effectiveDate", "desc").limit(1).get(),
  ]);

  const staffData = staffDoc.data() || {};
  const staffName = staffData.name || staffData.empId || staffId;

  let baseSalary = 0;
  if (!salarySnap.empty) {
    baseSalary = Number(salarySnap.docs[0].data().baseSalary || 0);
  } else if (staffData.baseSalary) {
    baseSalary = Number(staffData.baseSalary || 0);
  }

  if (baseSalary <= 0) {
    return { ok: false, error: `Base salary structure is zero or not configured for ${staffName}.` };
  }

  const [salaryExpAccId, salaryPayableAccId] = await Promise.all([
    getOrSeedAccountId(tenantId, "Salary Expense", "EXPENSE", "Salary Expense"),
    getOrSeedAccountId(tenantId, "Salary Payable", "LIABILITY", "Salary Payable"),
  ]);

  const dateStr = `${month}-28`;

  return await createVoucher({
    tenantId,
    voucherType: "JOURNAL",
    date: dateStr,
    narration: `Auto-posted Salary booking for ${staffName} for period ${month}`,
    createdBy: "SYSTEM_SALARY_AUTOPOST",
    entries: [
      { accountId: salaryExpAccId, entryType: "DR", amount: baseSalary },
      { accountId: salaryPayableAccId, entryType: "CR", amount: baseSalary },
    ],
    sourceType: "AUTO_SALARY",
    sourceRefId: sourceRefKey,
  });
}

/**
 * 9. Auto-Post Incentive Voucher (idempotent per staffId + period)
 * Reads approved incentive payout (READ-ONLY).
 * Dr Commission Expense
 * Cr Incentive Payable
 */
export async function postIncentiveVoucher(
  tenantId: string,
  staffId: string,
  period: string,
  amountOverride?: number
): Promise<{ ok: boolean; alreadyPosted?: boolean; voucherId?: string; voucherNo?: string; error?: string }> {
  const sourceRefKey = `${staffId}_${period}`;

  // Idempotency check
  const existingVoucherSnap = await adminDb
    .collection("ledger_vouchers")
    .where("tenantId", "==", tenantId)
    .where("sourceRefId", "==", sourceRefKey)
    .where("sourceType", "==", "AUTO_INCENTIVE")
    .limit(1)
    .get();

  if (!existingVoucherSnap.empty) {
    const v = existingVoucherSnap.docs[0].data();
    return { ok: true, alreadyPosted: true, voucherId: existingVoucherSnap.docs[0].id, voucherNo: v.voucherNo };
  }

  let amount = amountOverride || 0;
  let staffName = staffId;

  const staffDoc = await adminDb.collection("staff").doc(staffId).get();
  if (staffDoc.exists) {
    staffName = staffDoc.data()?.name || staffDoc.data()?.empId || staffId;
  }

  if (amount <= 0) {
    // Try to find in incentive_payouts collection
    const payoutDoc = await adminDb.collection("incentive_payouts").doc(sourceRefKey).get();
    if (payoutDoc.exists) {
      amount = Number(payoutDoc.data()?.incentiveAmount ?? payoutDoc.data()?.amount ?? 0);
    }
  }

  if (amount <= 0) {
    return { ok: false, error: `Incentive amount is zero or not found for ${staffName} (${period}).` };
  }

  const [commExpAccId, incPayableAccId] = await Promise.all([
    getOrSeedAccountId(tenantId, "Commission Expense", "EXPENSE", "Commission Expense"),
    getOrSeedAccountId(tenantId, "Incentive Payable", "LIABILITY", "Incentive Payable"),
  ]);

  const dateStr = new Date().toISOString().slice(0, 10);

  return await createVoucher({
    tenantId,
    voucherType: "JOURNAL",
    date: dateStr,
    narration: `Auto-posted Performance Incentive for ${staffName} for period ${period}`,
    createdBy: "SYSTEM_INCENTIVE_AUTOPOST",
    entries: [
      { accountId: commExpAccId, entryType: "DR", amount: Math.round(amount * 100) / 100 },
      { accountId: incPayableAccId, entryType: "CR", amount: Math.round(amount * 100) / 100 },
    ],
    sourceType: "AUTO_INCENTIVE",
    sourceRefId: sourceRefKey,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 10. FINANCIAL STATEMENTS: TRIAL BALANCE, P&L, AND BALANCE SHEET (Chunk 25)
// ─────────────────────────────────────────────────────────────────────────────

export interface TrialBalanceRow {
  accountId: string;
  accountName: string;
  accountType: AccountType;
  accountGroup: string;
  debit: number;
  credit: number;
}

export interface TrialBalanceResult {
  asOfDate: string;
  rows: TrialBalanceRow[];
  totalDebit: number;
  totalCredit: number;
  isBalanced: boolean;
  imbalanceAmount: number;
}

export interface StatementLineItem {
  accountId: string;
  accountName: string;
  accountGroup: string;
  amount: number;
}

export interface ProfitAndLossResult {
  startDate: string;
  endDate: string;
  incomeRows: StatementLineItem[];
  expenseRows: StatementLineItem[];
  totalIncome: number;
  totalExpense: number;
  netProfit: number;
  isProfit: boolean;
}

export interface BalanceSheetResult {
  asOfDate: string;
  assetRows: StatementLineItem[];
  liabilityRows: StatementLineItem[];
  equityRows: StatementLineItem[];
  retainedEarnings: number;
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
  totalLiabilitiesAndEquity: number;
  isBalanced: boolean;
  imbalanceAmount: number;
}

/**
 * 1. Generates Trial Balance as of a specified date.
 * For every account, sums all DR and CR entries up to asOfDate, nets against openingBalance,
 * and ensures Total Debit == Total Credit.
 */
export async function getTrialBalance(
  tenantId: string,
  asOfDate?: string
): Promise<TrialBalanceResult> {
  const effectiveDate = asOfDate || new Date().toISOString().slice(0, 10);

  // 1. Fetch all accounts
  const accounts = await getLedgerAccounts(tenantId);

  // 2. Fetch all entries for this tenant up to asOfDate
  const entriesSnap = await adminDb
    .collection("ledger_entries")
    .where("tenantId", "==", tenantId)
    .get();

  // Filter by asOfDate in-memory to avoid requiring composite indexes on date
  const filteredEntries = entriesSnap.docs
    .map((d) => d.data() as LedgerEntryDocument)
    .filter((e) => (e.date || "") <= effectiveDate);

  // 3. Aggregate debits and credits per account
  const accountTotals = new Map<string, { dr: number; cr: number }>();
  for (const entry of filteredEntries) {
    const curr = accountTotals.get(entry.accountId) || { dr: 0, cr: 0 };
    if (entry.entryType === "DR") {
      curr.dr += Number(entry.amount || 0);
    } else {
      curr.cr += Number(entry.amount || 0);
    }
    accountTotals.set(entry.accountId, curr);
  }

  // 4. Build Trial Balance rows
  const rows: TrialBalanceRow[] = [];
  let totalDebit = 0;
  let totalCredit = 0;

  for (const acc of accounts) {
    const totals = accountTotals.get(acc.id!) || { dr: 0, cr: 0 };
    const ob = Number(acc.openingBalance || 0);
    const obType = acc.openingBalanceType || "DR";

    // Calculate Net Balance: positive = Net DR, negative = Net CR
    const obFactor = obType === "DR" ? 1 : -1;
    const netBalance = ob * obFactor + totals.dr - totals.cr;

    const roundedNet = Math.round(netBalance * 100) / 100;
    let debit = 0;
    let credit = 0;

    if (roundedNet > 0) {
      debit = roundedNet;
      totalDebit += debit;
    } else if (roundedNet < 0) {
      credit = Math.abs(roundedNet);
      totalCredit += credit;
    }

    rows.push({
      accountId: acc.id!,
      accountName: acc.accountName,
      accountType: acc.accountType,
      accountGroup: acc.accountGroup,
      debit: Math.round(debit * 100) / 100,
      credit: Math.round(credit * 100) / 100,
    });
  }

  const roundedTotalDr = Math.round(totalDebit * 100) / 100;
  const roundedTotalCr = Math.round(totalCredit * 100) / 100;
  const imbalance = Math.abs(Math.round((roundedTotalDr - roundedTotalCr) * 100) / 100);

  return {
    asOfDate: effectiveDate,
    rows,
    totalDebit: roundedTotalDr,
    totalCredit: roundedTotalCr,
    isBalanced: imbalance < 0.01,
    imbalanceAmount: imbalance,
  };
}

/**
 * 2. Generates Profit & Loss Statement for a given date range.
 * Sums accounts where accountType is "INCOME" minus accounts where accountType is "EXPENSE".
 */
export async function getProfitAndLoss(
  tenantId: string,
  dateRange?: { startDate?: string; endDate?: string }
): Promise<ProfitAndLossResult> {
  const startDate = dateRange?.startDate || "1970-01-01";
  const endDate = dateRange?.endDate || new Date().toISOString().slice(0, 10);

  const accounts = await getLedgerAccounts(tenantId);
  const incomeAccounts = accounts.filter((a) => a.accountType === "INCOME");
  const expenseAccounts = accounts.filter((a) => a.accountType === "EXPENSE");

  const entriesSnap = await adminDb
    .collection("ledger_entries")
    .where("tenantId", "==", tenantId)
    .get();

  const filteredEntries = entriesSnap.docs
    .map((d) => d.data() as LedgerEntryDocument)
    .filter((e) => (e.date || "") >= startDate && (e.date || "") <= endDate);

  const accountTotals = new Map<string, { dr: number; cr: number }>();
  for (const entry of filteredEntries) {
    const curr = accountTotals.get(entry.accountId) || { dr: 0, cr: 0 };
    if (entry.entryType === "DR") {
      curr.dr += Number(entry.amount || 0);
    } else {
      curr.cr += Number(entry.amount || 0);
    }
    accountTotals.set(entry.accountId, curr);
  }

  const incomeRows: StatementLineItem[] = [];
  let totalIncome = 0;

  for (const acc of incomeAccounts) {
    const totals = accountTotals.get(acc.id!) || { dr: 0, cr: 0 };
    // Normal Credit for Income: Cr - Dr
    const netIncome = Math.round((totals.cr - totals.dr) * 100) / 100;
    if (netIncome !== 0) {
      incomeRows.push({
        accountId: acc.id!,
        accountName: acc.accountName,
        accountGroup: acc.accountGroup,
        amount: netIncome,
      });
      totalIncome += netIncome;
    }
  }

  const expenseRows: StatementLineItem[] = [];
  let totalExpense = 0;

  for (const acc of expenseAccounts) {
    const totals = accountTotals.get(acc.id!) || { dr: 0, cr: 0 };
    // Normal Debit for Expense: Dr - Cr
    const netExpense = Math.round((totals.dr - totals.cr) * 100) / 100;
    if (netExpense !== 0) {
      expenseRows.push({
        accountId: acc.id!,
        accountName: acc.accountName,
        accountGroup: acc.accountGroup,
        amount: netExpense,
      });
      totalExpense += netExpense;
    }
  }

  const roundedIncome = Math.round(totalIncome * 100) / 100;
  const roundedExpense = Math.round(totalExpense * 100) / 100;
  const netProfit = Math.round((roundedIncome - roundedExpense) * 100) / 100;

  return {
    startDate,
    endDate,
    incomeRows,
    expenseRows,
    totalIncome: roundedIncome,
    totalExpense: roundedExpense,
    netProfit,
    isProfit: netProfit >= 0,
  };
}

/**
 * 3. Generates Balance Sheet as of a specified date.
 * Groups accounts by ASSET / LIABILITY / EQUITY, sums each, and includes
 * current period's net profit rolled into EQUITY so Assets == Liabilities + Equity.
 */
export async function getBalanceSheet(
  tenantId: string,
  asOfDate?: string
): Promise<BalanceSheetResult> {
  const effectiveDate = asOfDate || new Date().toISOString().slice(0, 10);

  const [accounts, pnl] = await Promise.all([
    getLedgerAccounts(tenantId),
    getProfitAndLoss(tenantId, { endDate: effectiveDate }),
  ]);

  const assetAccounts = accounts.filter((a) => a.accountType === "ASSET");
  const liabilityAccounts = accounts.filter((a) => a.accountType === "LIABILITY");
  const equityAccounts = accounts.filter((a) => a.accountType === "EQUITY");

  const entriesSnap = await adminDb
    .collection("ledger_entries")
    .where("tenantId", "==", tenantId)
    .get();

  const filteredEntries = entriesSnap.docs
    .map((d) => d.data() as LedgerEntryDocument)
    .filter((e) => (e.date || "") <= effectiveDate);

  const accountTotals = new Map<string, { dr: number; cr: number }>();
  for (const entry of filteredEntries) {
    const curr = accountTotals.get(entry.accountId) || { dr: 0, cr: 0 };
    if (entry.entryType === "DR") {
      curr.dr += Number(entry.amount || 0);
    } else {
      curr.cr += Number(entry.amount || 0);
    }
    accountTotals.set(entry.accountId, curr);
  }

  // 1. Assets: Normal Debit (OB_DR + Dr - Cr)
  const assetRows: StatementLineItem[] = [];
  let totalAssets = 0;

  for (const acc of assetAccounts) {
    const totals = accountTotals.get(acc.id!) || { dr: 0, cr: 0 };
    const ob = Number(acc.openingBalance || 0);
    const obFactor = (acc.openingBalanceType || "DR") === "DR" ? 1 : -1;
    const balance = Math.round((ob * obFactor + totals.dr - totals.cr) * 100) / 100;

    if (balance !== 0) {
      assetRows.push({
        accountId: acc.id!,
        accountName: acc.accountName,
        accountGroup: acc.accountGroup,
        amount: balance,
      });
      totalAssets += balance;
    }
  }

  // 2. Liabilities: Normal Credit (OB_CR + Cr - Dr)
  const liabilityRows: StatementLineItem[] = [];
  let totalLiabilities = 0;

  for (const acc of liabilityAccounts) {
    const totals = accountTotals.get(acc.id!) || { dr: 0, cr: 0 };
    const ob = Number(acc.openingBalance || 0);
    const obFactor = (acc.openingBalanceType || "CR") === "CR" ? 1 : -1;
    const balance = Math.round((ob * obFactor + totals.cr - totals.dr) * 100) / 100;

    if (balance !== 0) {
      liabilityRows.push({
        accountId: acc.id!,
        accountName: acc.accountName,
        accountGroup: acc.accountGroup,
        amount: balance,
      });
      totalLiabilities += balance;
    }
  }

  // 3. Equity: Normal Credit (OB_CR + Cr - Dr) + Retained Current Period Net Profit
  const equityRows: StatementLineItem[] = [];
  let totalBaseEquity = 0;

  for (const acc of equityAccounts) {
    const totals = accountTotals.get(acc.id!) || { dr: 0, cr: 0 };
    const ob = Number(acc.openingBalance || 0);
    const obFactor = (acc.openingBalanceType || "CR") === "CR" ? 1 : -1;
    const balance = Math.round((ob * obFactor + totals.cr - totals.dr) * 100) / 100;

    if (balance !== 0) {
      equityRows.push({
        accountId: acc.id!,
        accountName: acc.accountName,
        accountGroup: acc.accountGroup,
        amount: balance,
      });
      totalBaseEquity += balance;
    }
  }

  // Add Retained Earnings / Current Period Net Profit to Equity
  if (pnl.netProfit !== 0) {
    equityRows.push({
      accountId: "RETAINED_EARNINGS",
      accountName: "Current Period Net Profit / (Loss)",
      accountGroup: "Retained Earnings",
      amount: pnl.netProfit,
    });
  }

  const roundedTotalAssets = Math.round(totalAssets * 100) / 100;
  const roundedTotalLiabilities = Math.round(totalLiabilities * 100) / 100;
  const roundedTotalEquity = Math.round((totalBaseEquity + pnl.netProfit) * 100) / 100;
  const totalLiabilitiesAndEquity = Math.round((roundedTotalLiabilities + roundedTotalEquity) * 100) / 100;
  const imbalance = Math.abs(Math.round((roundedTotalAssets - totalLiabilitiesAndEquity) * 100) / 100);

  return {
    asOfDate: effectiveDate,
    assetRows,
    liabilityRows,
    equityRows,
    retainedEarnings: pnl.netProfit,
    totalAssets: roundedTotalAssets,
    totalLiabilities: roundedTotalLiabilities,
    totalEquity: roundedTotalEquity,
    totalLiabilitiesAndEquity,
    isBalanced: imbalance < 0.01,
    imbalanceAmount: imbalance,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 11. GST COMPLIANCE & STATUTORY FILING TRACKER (Chunk 26)
// ─────────────────────────────────────────────────────────────────────────────

export interface GstLiabilityResult {
  period: string;
  outputGst: number;
  inputGst: number;
  netGstPayable: number;
  itcCarryForward: number;
  isInputItemized: boolean;
}

export interface GstFilingTrackerItem {
  filingType: GstFilingType;
  filingName: string;
  description: string;
  dueDate: string;
  status: GstFilingStatus;
  daysRemaining: number;
  filedAtMs: number | null;
  filedBy: string | null;
}

export interface GstComplianceReport {
  period: string;
  liability: GstLiabilityResult;
  filings: GstFilingTrackerItem[];
}

/**
 * Computes statutory GST Liability for a period (e.g. "2026-09"):
 * Output GST (sum of GST Payable from Sales ledger entries) minus
 * Input GST (sum of GST Receivable from Purchase ledger entries).
 */
export async function getGstLiability(
  tenantId: string,
  period: string
): Promise<GstLiabilityResult> {
  const accounts = await getLedgerAccounts(tenantId);
  const gstPayableAcc = accounts.find((a) => a.accountName === "GST Payable");
  const gstReceivableAcc = accounts.find((a) => a.accountName === "GST Receivable");

  const gstPayableId = gstPayableAcc?.id;
  const gstReceivableId = gstReceivableAcc?.id;

  const startDate = `${period}-01`;
  const endDate = `${period}-31`;

  const entriesSnap = await adminDb
    .collection("ledger_entries")
    .where("tenantId", "==", tenantId)
    .get();

  let outputGst = 0;
  let inputGst = 0;

  for (const doc of entriesSnap.docs) {
    const entry = doc.data() as LedgerEntryDocument;
    const date = entry.date || "";
    if (date >= startDate && date <= endDate) {
      if (gstPayableId && entry.accountId === gstPayableId) {
        // GST Payable Credit entries = Output Tax Liability
        if (entry.entryType === "CR") {
          outputGst += Number(entry.amount || 0);
        } else {
          outputGst -= Number(entry.amount || 0);
        }
      }
      if (gstReceivableId && entry.accountId === gstReceivableId) {
        // GST Receivable Debit entries = Input Tax Credit (ITC)
        if (entry.entryType === "DR") {
          inputGst += Number(entry.amount || 0);
        } else {
          inputGst -= Number(entry.amount || 0);
        }
      }
    }
  }

  const roundedOutput = Math.max(0, Math.round(outputGst * 100) / 100);
  const roundedInput = Math.max(0, Math.round(inputGst * 100) / 100);
  const netGstPayable = Math.max(0, Math.round((roundedOutput - roundedInput) * 100) / 100);
  const itcCarryForward = Math.max(0, Math.round((roundedInput - roundedOutput) * 100) / 100);

  return {
    period,
    outputGst: roundedOutput,
    inputGst: roundedInput,
    netGstPayable,
    itcCarryForward,
    isInputItemized: roundedInput > 0,
  };
}

/**
 * Fetches compliance filing tracker items (GSTR-1, GSTR-3B, GSTR-9) with computed statuses.
 */
export async function getGstFilings(
  tenantId: string,
  period: string
): Promise<GstComplianceReport> {
  const [liability, filingsSnap] = await Promise.all([
    getGstLiability(tenantId, period),
    adminDb.collection("gst_filings").where("tenantId", "==", tenantId).where("period", "==", period).get(),
  ]);

  const existingDocsMap = new Map<GstFilingType, GstFilingDocument>();
  filingsSnap.docs.forEach((d) => {
    const data = d.data() as GstFilingDocument;
    existingDocsMap.set(data.filingType, data);
  });

  const dueDates = getStandardGstDueDates(period);

  const configs: Array<{
    type: GstFilingType;
    name: string;
    desc: string;
    dueDate: string;
  }> = [
    {
      type: "GSTR1",
      name: "GSTR-1",
      desc: "Monthly Outward Supplies & Sales Register (Table 4 / 7)",
      dueDate: dueDates.gstr1DueDate,
    },
    {
      type: "GSTR3B",
      name: "GSTR-3B",
      desc: "Monthly Summary Return & Statutory Tax Settlement",
      dueDate: dueDates.gstr3bDueDate,
    },
    {
      type: "GSTR9",
      name: "GSTR-9",
      desc: "Annual Statutory Reconciliation Return",
      dueDate: dueDates.gstr9DueDate,
    },
  ];

  const filings: GstFilingTrackerItem[] = configs.map((cfg) => {
    const existing = existingDocsMap.get(cfg.type);
    const dueDate = existing?.dueDate || cfg.dueDate;
    const filedAtMs = existing?.filedAtMs || null;
    const filedBy = existing?.filedBy || null;

    const { status, daysRemaining } = computeGstFilingStatus(dueDate, filedAtMs);

    return {
      filingType: cfg.type,
      filingName: cfg.name,
      description: cfg.desc,
      dueDate,
      status,
      daysRemaining,
      filedAtMs,
      filedBy,
    };
  });

  return {
    period,
    liability,
    filings,
  };
}

/**
 * Marks a GST return as filed (record-keeping / reminder tracking).
 */
export async function markGstFilingAsFiled(params: {
  tenantId: string;
  period: string;
  filingType: GstFilingType;
  filedBy: string;
}): Promise<{ ok: boolean; error?: string }> {
  const { tenantId, period, filingType, filedBy } = params;
  const docId = `${tenantId}_${period}_${filingType}`;
  const dueDates = getStandardGstDueDates(period);

  let dueDate = dueDates.gstr1DueDate;
  if (filingType === "GSTR3B") dueDate = dueDates.gstr3bDueDate;
  if (filingType === "GSTR9") dueDate = dueDates.gstr9DueDate;

  const now = Date.now();
  const docRef = adminDb.collection("gst_filings").doc(docId);

  const batch = adminDb.batch();
  batch.set(
    docRef,
    {
      id: docId,
      tenantId,
      period,
      filingType,
      dueDate,
      status: "FILED",
      filedAtMs: now,
      filedBy,
      updatedAtMs: now,
    },
    { merge: true }
  );

  batch.set(adminDb.collection("admin_audit_logs").doc(), {
    action: "GST_FILING_MARKED_FILED",
    actionType: "GST_FILING_MARKED_FILED",
    targetCollection: "gst_filings",
    targetId: docId,
    tenantId,
    actorId: filedBy,
    actorEmail: filedBy,
    details: `Marked ${filingType} for period ${period} as filed.`,
    severity: "INFO",
    timestamp: FieldValue.serverTimestamp(),
  });

  await batch.commit();
  return { ok: true };
}

// ==========================================
// 12. Bank Statement Import & Reconciliation (Chunk 27)
// ==========================================

export interface EnrichedBankStatementRow extends BankStatementRow {
  matchedEntry?: {
    id: string;
    date: string;
    amount: number;
    entryType: "DR" | "CR";
    voucherId: string;
    voucherNo?: string;
    narration?: string;
    voucherType?: VoucherType;
  } | null;
}

export interface BankReconciliationSummary {
  importDoc: BankStatementImportDocument;
  bankAccount: LedgerAccountDocument | null;
  statementBalance: number;
  bookBalance: number;
  totalRowsCount: number;
  matchedCount: number;
  unmatchedCount: number;
  matchedCreditTotal: number;
  matchedDebitTotal: number;
  unmatchedCreditTotal: number;
  unmatchedDebitTotal: number;
  reconciledVariance: number;
  matchedRows: EnrichedBankStatementRow[];
  unmatchedRows: EnrichedBankStatementRow[];
}

/**
 * 1. Import a bank statement file (CSV/Text) and optionally run auto-matching immediately.
 */
export async function importBankStatement(params: {
  tenantId: string;
  bankAccountId?: string;
  fileName: string;
  csvContent: string;
  uploadedBy: string;
  autoReconcile?: boolean;
}): Promise<{ ok: boolean; importId?: string; error?: string; summary?: BankReconciliationSummary }> {
  const { tenantId, bankAccountId, fileName, csvContent, uploadedBy, autoReconcile = true } = params;

  const parsed = parseBankStatementCsv(csvContent);
  if (!parsed.ok || parsed.rows.length === 0) {
    return { ok: false, error: parsed.error || "No valid rows found in file." };
  }

  // Resolve target Bank Account ID
  let resolvedBankAccountId = bankAccountId;
  if (!resolvedBankAccountId) {
    const accounts = await getLedgerAccounts(tenantId);
    const bankAcc = accounts.find(
      (a) =>
        a.accountName.toLowerCase() === "bank account" ||
        a.accountGroup.toLowerCase() === "bank account"
    );
    resolvedBankAccountId = bankAcc?.id;
  }

  const now = Date.now();
  const docRef = adminDb.collection("bank_statement_imports").doc();
  const importDoc: BankStatementImportDocument = {
    id: docRef.id,
    tenantId,
    bankAccountId: resolvedBankAccountId,
    fileName,
    uploadedAtMs: now,
    uploadedBy,
    rows: parsed.rows,
  };

  await docRef.set(importDoc);

  // Log audit
  await adminDb.collection("admin_audit_logs").add({
    action: "BANK_STATEMENT_IMPORTED",
    actionType: "BANK_STATEMENT_IMPORTED",
    targetCollection: "bank_statement_imports",
    targetId: docRef.id,
    tenantId,
    actorId: uploadedBy,
    actorEmail: uploadedBy,
    details: `Imported bank statement '${fileName}' with ${parsed.rows.length} transaction rows.`,
    severity: "INFO",
    timestamp: FieldValue.serverTimestamp(),
  });

  if (autoReconcile) {
    await reconcileBankStatement(tenantId, docRef.id);
  }

  const summary = await getBankReconciliationSummary(tenantId, docRef.id);
  return {
    ok: true,
    importId: docRef.id,
    summary: summary || undefined,
  };
}

/**
 * 2. Auto-match imported statement rows against ledger entries for the Bank Account.
 * Match criteria:
 * - Bank statement CREDIT (deposit) <-> Ledger DR (Debit to Bank Asset)
 * - Bank statement DEBIT (withdrawal) <-> Ledger CR (Credit from Bank Asset)
 * - Amount equals within ₹0.01
 * - Date within +/- 2 calendar days
 * - Not already matched to another entry
 */
export async function reconcileBankStatement(
  tenantId: string,
  importId: string
): Promise<{ ok: boolean; matchedCount: number; unmatchedCount: number; error?: string }> {
  const docRef = adminDb.collection("bank_statement_imports").doc(importId);
  const snap = await docRef.get();

  if (!snap.exists) {
    return { ok: false, matchedCount: 0, unmatchedCount: 0, error: "Import record not found." };
  }

  const data = snap.data() as BankStatementImportDocument;
  if (data.tenantId !== tenantId) {
    return { ok: false, matchedCount: 0, unmatchedCount: 0, error: "Unauthorized tenant." };
  }

  // Resolve bank account ID
  let targetAccountId = data.bankAccountId;
  if (!targetAccountId) {
    const accounts = await getLedgerAccounts(tenantId);
    const bankAcc = accounts.find(
      (a) =>
        a.accountName.toLowerCase() === "bank account" ||
        a.accountGroup.toLowerCase() === "bank account"
    );
    targetAccountId = bankAcc?.id;
  }

  if (!targetAccountId) {
    return { ok: false, matchedCount: 0, unmatchedCount: 0, error: "Bank Account not configured for this tenant." };
  }

  // Fetch all ledger entries for this bank account
  const entriesSnap = await adminDb
    .collection("ledger_entries")
    .where("tenantId", "==", tenantId)
    .where("accountId", "==", targetAccountId)
    .get();

  const entries: LedgerEntryDocument[] = entriesSnap.docs.map((d) => {
    const raw = d.data();
    return {
      id: d.id,
      tenantId: raw.tenantId,
      voucherId: raw.voucherId,
      accountId: raw.accountId,
      entryType: raw.entryType,
      amount: Number(raw.amount || 0),
      date: String(raw.date || "").trim(),
    };
  });

  // Track already linked entries in current import (manual or auto)
  const usedEntryIds = new Set<string>();
  data.rows.forEach((r) => {
    if (r.matchedLedgerEntryId) {
      usedEntryIds.add(r.matchedLedgerEntryId);
    }
  });

  let matchedThisRun = 0;
  const now = Date.now();

  const updatedRows: BankStatementRow[] = data.rows.map((row) => {
    // If already matched, keep existing match
    if (row.matchedLedgerEntryId) {
      return row;
    }

    // Expected corresponding ledger entryType
    // Statement CREDIT (money in) -> Book DR (Asset increase)
    // Statement DEBIT (money out) -> Book CR (Asset decrease)
    const expectedEntryType = row.type === "CREDIT" ? "DR" : "CR";

    const rowDateMs = new Date(row.date).getTime();

    // Find candidate matching entries
    const candidates = entries.filter((e) => {
      if (usedEntryIds.has(e.id || "")) return false;
      if (e.entryType !== expectedEntryType) return false;
      if (Math.abs(e.amount - row.amount) > 0.01) return false;

      const entryDateMs = new Date(e.date).getTime();
      const diffDays = Math.abs(rowDateMs - entryDateMs) / (1000 * 60 * 60 * 24);
      return diffDays <= 2.05; // +/- 2 calendar days
    });

    if (candidates.length > 0) {
      // Pick closest date candidate
      candidates.sort((a, b) => {
        const diffA = Math.abs(new Date(a.date).getTime() - rowDateMs);
        const diffB = Math.abs(new Date(b.date).getTime() - rowDateMs);
        return diffA - diffB;
      });

      const matchedCandidate = candidates[0];
      const entryId = matchedCandidate.id!;
      usedEntryIds.add(entryId);
      matchedThisRun++;

      return {
        ...row,
        matchedLedgerEntryId: entryId,
        matchedAtMs: now,
        matchType: "AUTO" as const,
      };
    }

    return row;
  });

  await docRef.update({
    rows: updatedRows,
    bankAccountId: targetAccountId,
  });

  const totalMatched = updatedRows.filter((r) => !!r.matchedLedgerEntryId).length;
  const totalUnmatched = updatedRows.length - totalMatched;

  return {
    ok: true,
    matchedCount: totalMatched,
    unmatchedCount: totalUnmatched,
  };
}

/**
 * 3. Manually link an unmatched statement row to a specific ledger entry.
 */
export async function linkBankStatementRow(params: {
  tenantId: string;
  importId: string;
  rowId: string;
  ledgerEntryId: string;
  updatedBy: string;
}): Promise<{ ok: boolean; error?: string }> {
  const { tenantId, importId, rowId, ledgerEntryId, updatedBy } = params;

  const docRef = adminDb.collection("bank_statement_imports").doc(importId);
  const snap = await docRef.get();
  if (!snap.exists) {
    return { ok: false, error: "Import statement not found." };
  }

  const data = snap.data() as BankStatementImportDocument;
  if (data.tenantId !== tenantId) {
    return { ok: false, error: "Unauthorized tenant." };
  }

  // Verify the ledger entry exists and belongs to this tenant
  const entrySnap = await adminDb.collection("ledger_entries").doc(ledgerEntryId).get();
  if (!entrySnap.exists) {
    return { ok: false, error: "Target ledger entry not found." };
  }
  const entryData = entrySnap.data() as LedgerEntryDocument;
  if (entryData.tenantId !== tenantId) {
    return { ok: false, error: "Unauthorized ledger entry tenant." };
  }

  let rowFound = false;
  const now = Date.now();
  const updatedRows = data.rows.map((row) => {
    if (row.id === rowId) {
      rowFound = true;
      return {
        ...row,
        matchedLedgerEntryId: ledgerEntryId,
        matchedAtMs: now,
        matchType: "MANUAL" as const,
      };
    }
    return row;
  });

  if (!rowFound) {
    return { ok: false, error: "Statement row ID not found." };
  }

  await docRef.update({ rows: updatedRows });

  await adminDb.collection("admin_audit_logs").add({
    action: "BANK_ROW_MANUALLY_LINKED",
    actionType: "BANK_ROW_MANUALLY_LINKED",
    targetCollection: "bank_statement_imports",
    targetId: importId,
    tenantId,
    actorId: updatedBy,
    actorEmail: updatedBy,
    details: `Manually linked statement row '${rowId}' to ledger entry '${ledgerEntryId}'.`,
    severity: "INFO",
    timestamp: FieldValue.serverTimestamp(),
  });

  return { ok: true };
}

/**
 * 4. Manually unlink a previously matched statement row.
 */
export async function unlinkBankStatementRow(params: {
  tenantId: string;
  importId: string;
  rowId: string;
  updatedBy: string;
}): Promise<{ ok: boolean; error?: string }> {
  const { tenantId, importId, rowId, updatedBy } = params;

  const docRef = adminDb.collection("bank_statement_imports").doc(importId);
  const snap = await docRef.get();
  if (!snap.exists) {
    return { ok: false, error: "Import statement not found." };
  }

  const data = snap.data() as BankStatementImportDocument;
  if (data.tenantId !== tenantId) {
    return { ok: false, error: "Unauthorized tenant." };
  }

  let rowFound = false;
  const updatedRows = data.rows.map((row) => {
    if (row.id === rowId) {
      rowFound = true;
      return {
        ...row,
        matchedLedgerEntryId: null,
        matchedAtMs: null,
        matchType: null,
      };
    }
    return row;
  });

  if (!rowFound) {
    return { ok: false, error: "Statement row ID not found." };
  }

  await docRef.update({ rows: updatedRows });

  await adminDb.collection("admin_audit_logs").add({
    action: "BANK_ROW_UNLINKED",
    actionType: "BANK_ROW_UNLINKED",
    targetCollection: "bank_statement_imports",
    targetId: importId,
    tenantId,
    actorId: updatedBy,
    actorEmail: updatedBy,
    details: `Unlinked statement row '${rowId}' from ledger entry.`,
    severity: "INFO",
    timestamp: FieldValue.serverTimestamp(),
  });

  return { ok: true };
}

/**
 * 5. Generate comprehensive Bank Reconciliation Statement (BRS) summary.
 */
export async function getBankReconciliationSummary(
  tenantId: string,
  importId: string
): Promise<BankReconciliationSummary | null> {
  const docRef = adminDb.collection("bank_statement_imports").doc(importId);
  const snap = await docRef.get();
  if (!snap.exists) return null;

  const importDoc = { id: snap.id, ...(snap.data() as BankStatementImportDocument) };
  if (importDoc.tenantId !== tenantId) return null;

  // Resolve target Bank Account
  const accounts = await getLedgerAccounts(tenantId);
  const bankAccount =
    accounts.find((a) => a.id === importDoc.bankAccountId) ||
    accounts.find(
      (a) =>
        a.accountName.toLowerCase() === "bank account" ||
        a.accountGroup.toLowerCase() === "bank account"
    ) ||
    null;

  // Calculate Book Balance for Bank Account
  let bookBalance = 0;
  if (bankAccount?.id) {
    const entriesSnap = await adminDb
      .collection("ledger_entries")
      .where("tenantId", "==", tenantId)
      .where("accountId", "==", bankAccount.id)
      .get();

    let drSum = 0;
    let crSum = 0;
    entriesSnap.docs.forEach((d) => {
      const e = d.data();
      if (e.entryType === "DR") drSum += Number(e.amount || 0);
      else if (e.entryType === "CR") crSum += Number(e.amount || 0);
    });

    const openBal = bankAccount.openingBalance || 0;
    const isDr = bankAccount.openingBalanceType !== "CR";
    bookBalance = (isDr ? openBal : -openBal) + drSum - crSum;
  }

  // Load matched ledger entries and vouchers for enrichment
  const matchedEntryIds = importDoc.rows
    .map((r) => r.matchedLedgerEntryId)
    .filter((id): id is string => !!id);

  const entryMap = new Map<string, any>();
  const voucherMap = new Map<string, LedgerVoucherDocument>();

  if (matchedEntryIds.length > 0) {
    // Fetch entries in batches of 30
    for (let i = 0; i < matchedEntryIds.length; i += 30) {
      const batchIds = matchedEntryIds.slice(i, i + 30);
      const batchSnap = await adminDb
        .collection("ledger_entries")
        .where("__name__", "in", batchIds)
        .get();

      batchSnap.docs.forEach((d) => {
        entryMap.set(d.id, { id: d.id, ...d.data() });
      });
    }

    const voucherIds = Array.from(
      new Set(Array.from(entryMap.values()).map((e) => e.voucherId).filter(Boolean))
    );

    for (let i = 0; i < voucherIds.length; i += 30) {
      const batchVoucherIds = voucherIds.slice(i, i + 30);
      const vSnap = await adminDb
        .collection("ledger_vouchers")
        .where("__name__", "in", batchVoucherIds)
        .get();

      vSnap.docs.forEach((d) => {
        voucherMap.set(d.id, { id: d.id, ...d.data() } as LedgerVoucherDocument);
      });
    }
  }

  // Enrich rows
  let statementCreditTotal = 0;
  let statementDebitTotal = 0;
  let matchedCreditTotal = 0;
  let matchedDebitTotal = 0;
  let unmatchedCreditTotal = 0;
  let unmatchedDebitTotal = 0;

  const matchedRows: EnrichedBankStatementRow[] = [];
  const unmatchedRows: EnrichedBankStatementRow[] = [];

  for (const row of importDoc.rows) {
    if (row.type === "CREDIT") {
      statementCreditTotal += row.amount;
    } else {
      statementDebitTotal += row.amount;
    }

    if (row.matchedLedgerEntryId && entryMap.has(row.matchedLedgerEntryId)) {
      const entry = entryMap.get(row.matchedLedgerEntryId);
      const v = entry ? voucherMap.get(entry.voucherId) : undefined;

      const enriched: EnrichedBankStatementRow = {
        ...row,
        matchedEntry: {
          id: entry.id,
          date: entry.date,
          amount: entry.amount,
          entryType: entry.entryType,
          voucherId: entry.voucherId,
          voucherNo: v?.voucherNo,
          narration: v?.narration,
          voucherType: v?.voucherType,
        },
      };

      matchedRows.push(enriched);
      if (row.type === "CREDIT") matchedCreditTotal += row.amount;
      else matchedDebitTotal += row.amount;
    } else {
      const enriched: EnrichedBankStatementRow = {
        ...row,
        matchedEntry: null,
      };

      unmatchedRows.push(enriched);
      if (row.type === "CREDIT") unmatchedCreditTotal += row.amount;
      else unmatchedDebitTotal += row.amount;
    }
  }

  const statementBalance = statementCreditTotal - statementDebitTotal;
  // Reconciled variance = Statement Balance minus (Book Balance + Unmatched Credits - Unmatched Debits)
  const adjustedBookBalance = bookBalance + unmatchedCreditTotal - unmatchedDebitTotal;
  const reconciledVariance = Math.round((statementBalance - adjustedBookBalance) * 100) / 100;

  return {
    importDoc,
    bankAccount,
    statementBalance: Math.round(statementBalance * 100) / 100,
    bookBalance: Math.round(bookBalance * 100) / 100,
    totalRowsCount: importDoc.rows.length,
    matchedCount: matchedRows.length,
    unmatchedCount: unmatchedRows.length,
    matchedCreditTotal: Math.round(matchedCreditTotal * 100) / 100,
    matchedDebitTotal: Math.round(matchedDebitTotal * 100) / 100,
    unmatchedCreditTotal: Math.round(unmatchedCreditTotal * 100) / 100,
    unmatchedDebitTotal: Math.round(unmatchedDebitTotal * 100) / 100,
    reconciledVariance,
    matchedRows,
    unmatchedRows,
  };
}

/**
 * 6. Fetch unmatched ledger entries on the Bank Account for manual reconciliation candidate picker.
 */
export async function getUnmatchedLedgerEntries(params: {
  tenantId: string;
  bankAccountId?: string;
  searchQuery?: string;
}): Promise<
  Array<{
    id: string;
    date: string;
    amount: number;
    entryType: "DR" | "CR";
    voucherId: string;
    voucherNo: string;
    narration: string;
    voucherType: VoucherType;
  }>
> {
  const { tenantId, bankAccountId, searchQuery } = params;

  let targetAccountId = bankAccountId;
  if (!targetAccountId) {
    const accounts = await getLedgerAccounts(tenantId);
    const bankAcc = accounts.find(
      (a) =>
        a.accountName.toLowerCase() === "bank account" ||
        a.accountGroup.toLowerCase() === "bank account"
    );
    targetAccountId = bankAcc?.id;
  }

  if (!targetAccountId) return [];

  // Find all matched entry IDs across all imports for this tenant
  const importsSnap = await adminDb
    .collection("bank_statement_imports")
    .where("tenantId", "==", tenantId)
    .get();

  const matchedEntryIds = new Set<string>();
  importsSnap.docs.forEach((doc) => {
    const d = doc.data() as BankStatementImportDocument;
    (d.rows || []).forEach((r) => {
      if (r.matchedLedgerEntryId) {
        matchedEntryIds.add(r.matchedLedgerEntryId);
      }
    });
  });

  // Fetch all ledger entries for this account
  const entriesSnap = await adminDb
    .collection("ledger_entries")
    .where("tenantId", "==", tenantId)
    .where("accountId", "==", targetAccountId)
    .get();

  const unmatchedEntries = entriesSnap.docs
    .filter((d) => !matchedEntryIds.has(d.id))
    .map((d) => {
      const raw = d.data();
      return {
        id: d.id,
        tenantId: raw.tenantId,
        voucherId: raw.voucherId,
        accountId: raw.accountId,
        entryType: raw.entryType as "DR" | "CR",
        amount: Number(raw.amount || 0),
        date: String(raw.date || "").trim(),
      };
    });

  if (unmatchedEntries.length === 0) return [];

  // Fetch vouchers
  const voucherIds = Array.from(new Set(unmatchedEntries.map((e) => e.voucherId)));
  const voucherMap = new Map<string, LedgerVoucherDocument>();

  for (let i = 0; i < voucherIds.length; i += 30) {
    const batchIds = voucherIds.slice(i, i + 30);
    const vSnap = await adminDb
      .collection("ledger_vouchers")
      .where("__name__", "in", batchIds)
      .get();

    vSnap.docs.forEach((d) => {
      voucherMap.set(d.id, { id: d.id, ...d.data() } as LedgerVoucherDocument);
    });
  }

  const results = unmatchedEntries.map((e) => {
    const v = voucherMap.get(e.voucherId);
    return {
      id: e.id,
      date: e.date,
      amount: e.amount,
      entryType: e.entryType,
      voucherId: e.voucherId,
      voucherNo: v?.voucherNo || "—",
      narration: v?.narration || "",
      voucherType: v?.voucherType || ("JOURNAL" as VoucherType),
    };
  });

  if (searchQuery) {
    const q = searchQuery.toLowerCase().trim();
    return results.filter(
      (r) =>
        r.voucherNo.toLowerCase().includes(q) ||
        r.narration.toLowerCase().includes(q) ||
        r.amount.toString().includes(q) ||
        r.date.includes(q)
    );
  }

  return results.sort((a, b) => b.date.localeCompare(a.date));
}

/**
 * 7. List all bank statement import sessions for a tenant.
 */
export async function listBankStatementImports(
  tenantId: string
): Promise<Array<{ id: string; fileName: string; uploadedAtMs: number; uploadedBy: string; rowCount: number; matchedCount: number }>> {
  const snap = await adminDb
    .collection("bank_statement_imports")
    .where("tenantId", "==", tenantId)
    .get();

  const items = snap.docs.map((doc) => {
    const d = doc.data() as BankStatementImportDocument;
    const rows = d.rows || [];
    const matchedCount = rows.filter((r) => !!r.matchedLedgerEntryId).length;
    return {
      id: doc.id,
      fileName: d.fileName || "Bank Statement",
      uploadedAtMs: Number(d.uploadedAtMs || 0),
      uploadedBy: d.uploadedBy || "—",
      rowCount: rows.length,
      matchedCount,
    };
  });

  return items.sort((a, b) => b.uploadedAtMs - a.uploadedAtMs);
}

/**
 * 8. Delete a bank statement import record.
 */
export async function deleteBankStatementImport(
  tenantId: string,
  importId: string
): Promise<{ ok: boolean; error?: string }> {
  const docRef = adminDb.collection("bank_statement_imports").doc(importId);
  const snap = await docRef.get();
  if (!snap.exists) return { ok: false, error: "Import record not found." };

  const data = snap.data() as BankStatementImportDocument;
  if (data.tenantId !== tenantId) return { ok: false, error: "Unauthorized tenant." };

  await docRef.delete();
  return { ok: true };
}


