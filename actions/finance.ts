"use server";

import { requireRole, requireRoutePlan } from "@/lib/rbac";
import {
  getLedgerAccounts,
  createLedgerAccount,
  createVoucher,
  getAccountLedger,
  getRecentVouchers,
  getTrialBalance,
  getProfitAndLoss,
  getBalanceSheet,
  getGstFilings,
  markGstFilingAsFiled,
  importBankStatement,
  reconcileBankStatement,
  linkBankStatementRow,
  unlinkBankStatementRow,
  getBankReconciliationSummary,
  getUnmatchedLedgerEntries,
  listBankStatementImports,
  deleteBankStatementImport,
  TrialBalanceResult,
  ProfitAndLossResult,
  BalanceSheetResult,
  GstComplianceReport,
  BankReconciliationSummary,
} from "@/lib/services/finance-service";
import {
  LedgerAccountDocument,
  AccountType,
  BalanceType,
  VoucherType,
  VoucherSourceType,
  GstFilingType,
} from "@/lib/schemas/finance-schema";
import { revalidatePath } from "next/cache";

/**
 * 1. Fetch Chart of Accounts for current tenant (tenant_admin / super_admin only).
 */
export async function getLedgerAccountsAction(tenantIdOverride?: string) {
  const { role, tenantId: sessionTenantId } = await requireRole([
    "super_admin",
    "tenant_admin",
  ]);

  const effectiveTenantId = role === "super_admin" ? (tenantIdOverride || sessionTenantId) : sessionTenantId;
  if (!effectiveTenantId) {
    return { ok: false, error: "Tenant ID is required." };
  }

  try {
    await requireRoutePlan(effectiveTenantId, "finance");
    const accounts = await getLedgerAccounts(effectiveTenantId);
    return { ok: true, accounts };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Failed to load Chart of Accounts." };
  }
}

/**
 * 2. Create custom Ledger Account in Chart of Accounts.
 */
export async function createLedgerAccountAction(params: {
  accountName: string;
  accountType: AccountType;
  accountGroup: string;
  openingBalance?: number;
  openingBalanceType?: BalanceType;
  tenantIdOverride?: string;
}): Promise<{ ok: true; account: LedgerAccountDocument } | { ok: false; error: string }> {
  const { role, tenantId: sessionTenantId } = await requireRole([
    "super_admin",
    "tenant_admin",
  ]);

  const effectiveTenantId = role === "super_admin" ? (params.tenantIdOverride || sessionTenantId) : sessionTenantId;
  if (!effectiveTenantId) {
    return { ok: false, error: "Tenant ID is required." };
  }

  try {
    await requireRoutePlan(effectiveTenantId, "finance");
    const result = await createLedgerAccount({
      tenantId: effectiveTenantId,
      accountName: params.accountName,
      accountType: params.accountType,
      accountGroup: params.accountGroup,
      openingBalance: params.openingBalance,
      openingBalanceType: params.openingBalanceType,
    });

    if (result.ok && result.account) {
      revalidatePath("/finance");
      return { ok: true, account: result.account };
    }
    return { ok: false, error: result.error || "Failed to create ledger account." };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Failed to create ledger account." };
  }
}

/**
 * 3. Create a manual double-entry Voucher.
 */
export async function createVoucherAction(params: {
  voucherType: VoucherType;
  date: string;
  narration?: string;
  entries: Array<{
    accountId: string;
    entryType: BalanceType;
    amount: number;
  }>;
  sourceType?: VoucherSourceType;
  sourceRefId?: string;
  tenantIdOverride?: string;
}): Promise<{ ok: true; voucherId: string; voucherNo: string } | { ok: false; error: string }> {
  const { session, role, tenantId: sessionTenantId } = await requireRole([
    "super_admin",
    "tenant_admin",
  ]);

  const effectiveTenantId = role === "super_admin" ? (params.tenantIdOverride || sessionTenantId) : sessionTenantId;
  if (!effectiveTenantId) {
    return { ok: false, error: "Tenant ID is required." };
  }

  try {
    await requireRoutePlan(effectiveTenantId, "finance");
    const actorEmail = session.user?.email || "Admin";

    const result = await createVoucher({
      tenantId: effectiveTenantId,
      voucherType: params.voucherType,
      date: params.date,
      narration: params.narration,
      createdBy: actorEmail,
      entries: params.entries,
      sourceType: params.sourceType || "MANUAL",
      sourceRefId: params.sourceRefId,
    });

    if (result.ok && result.voucherId && result.voucherNo) {
      revalidatePath("/finance");
      return { ok: true, voucherId: result.voucherId, voucherNo: result.voucherNo };
    }
    return { ok: false, error: result.error || "Failed to create voucher." };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Failed to create voucher." };
  }
}

/**
 * 4. Fetch Tally-style Account Ledger.
 */
export async function getAccountLedgerAction(params: {
  accountId: string;
  startDate?: string;
  endDate?: string;
  tenantIdOverride?: string;
}) {
  const { role, tenantId: sessionTenantId } = await requireRole([
    "super_admin",
    "tenant_admin",
  ]);

  const effectiveTenantId = role === "super_admin" ? (params.tenantIdOverride || sessionTenantId) : sessionTenantId;
  if (!effectiveTenantId) {
    return { ok: false, error: "Tenant ID is required." };
  }

  try {
    await requireRoutePlan(effectiveTenantId, "finance");
    const ledger = await getAccountLedger(effectiveTenantId, params.accountId, {
      startDate: params.startDate,
      endDate: params.endDate,
    });

    if (!ledger) {
      return { ok: false, error: "Account not found." };
    }

    return { ok: true, ledger };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Failed to load account ledger." };
  }
}

/**
 * 5. Fetch Recent Vouchers for tenant.
 */
export async function getRecentVouchersAction(tenantIdOverride?: string) {
  const { role, tenantId: sessionTenantId } = await requireRole([
    "super_admin",
    "tenant_admin",
  ]);

  const effectiveTenantId = role === "super_admin" ? (tenantIdOverride || sessionTenantId) : sessionTenantId;
  if (!effectiveTenantId) {
    return { ok: false, error: "Tenant ID is required." };
  }

  try {
    await requireRoutePlan(effectiveTenantId, "finance");
    const vouchers = await getRecentVouchers(effectiveTenantId);
    return { ok: true, vouchers };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Failed to load recent vouchers." };
  }
}

import {
  postSalesVoucher,
  postPurchaseVoucher,
  postSalaryVoucher,
  postIncentiveVoucher,
} from "@/lib/services/finance-service";

export type AutoPostResult =
  | { ok: true; alreadyPosted?: boolean; voucherId?: string; voucherNo?: string }
  | { ok: false; error: string };

/**
 * 6. Post Sales Voucher Action
 */
export async function postSalesVoucherAction(orderId: string, tenantIdOverride?: string): Promise<AutoPostResult> {
  const { role, tenantId: sessionTenantId } = await requireRole([
    "super_admin",
    "tenant_admin",
  ]);

  const effectiveTenantId = role === "super_admin" ? (tenantIdOverride || sessionTenantId) : sessionTenantId;
  if (!effectiveTenantId) {
    return { ok: false, error: "Tenant ID is required." };
  }

  try {
    await requireRoutePlan(effectiveTenantId, "finance");
    const result = await postSalesVoucher(effectiveTenantId, orderId);
    if (result.ok) revalidatePath("/finance");
    if (result.ok) {
      return { ok: true, alreadyPosted: result.alreadyPosted, voucherId: result.voucherId, voucherNo: result.voucherNo };
    }
    return { ok: false, error: result.error || "Failed to post sales voucher." };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Failed to post sales voucher." };
  }
}

/**
 * 7. Post Purchase Voucher Action (Manual trigger from PO page)
 */
export async function postPurchaseVoucherAction(poId: string, tenantIdOverride?: string): Promise<AutoPostResult> {
  const { role, tenantId: sessionTenantId } = await requireRole([
    "super_admin",
    "tenant_admin",
  ]);

  const effectiveTenantId = role === "super_admin" ? (tenantIdOverride || sessionTenantId) : sessionTenantId;
  if (!effectiveTenantId) {
    return { ok: false, error: "Tenant ID is required." };
  }

  try {
    await requireRoutePlan(effectiveTenantId, "finance");
    const result = await postPurchaseVoucher(effectiveTenantId, poId);
    if (result.ok) {
      revalidatePath("/finance");
      revalidatePath("/procurement");
      return { ok: true, alreadyPosted: result.alreadyPosted, voucherId: result.voucherId, voucherNo: result.voucherNo };
    }
    return { ok: false, error: result.error || "Failed to post purchase voucher." };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Failed to post purchase voucher." };
  }
}

/**
 * 8. Post Salary Voucher Action (Manual trigger from HR Salary page)
 */
export async function postSalaryVoucherAction(staffId: string, month: string, tenantIdOverride?: string): Promise<AutoPostResult> {
  const { role, tenantId: sessionTenantId } = await requireRole([
    "super_admin",
    "tenant_admin",
  ]);

  const effectiveTenantId = role === "super_admin" ? (tenantIdOverride || sessionTenantId) : sessionTenantId;
  if (!effectiveTenantId) {
    return { ok: false, error: "Tenant ID is required." };
  }

  try {
    await requireRoutePlan(effectiveTenantId, "finance");
    const result = await postSalaryVoucher(effectiveTenantId, staffId, month);
    if (result.ok) {
      revalidatePath("/finance");
      revalidatePath("/hr");
      return { ok: true, alreadyPosted: result.alreadyPosted, voucherId: result.voucherId, voucherNo: result.voucherNo };
    }
    return { ok: false, error: result.error || "Failed to post salary voucher." };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Failed to post salary voucher." };
  }
}

/**
 * 9. Post Incentive Voucher Action (Manual trigger from HR Incentive page)
 */
export async function postIncentiveVoucherAction(
  staffId: string,
  period: string,
  amountOverride?: number,
  tenantIdOverride?: string
): Promise<AutoPostResult> {
  const { role, tenantId: sessionTenantId } = await requireRole([
    "super_admin",
    "tenant_admin",
  ]);

  const effectiveTenantId = role === "super_admin" ? (tenantIdOverride || sessionTenantId) : sessionTenantId;
  if (!effectiveTenantId) {
    return { ok: false, error: "Tenant ID is required." };
  }

  try {
    await requireRoutePlan(effectiveTenantId, "finance");
    const result = await postIncentiveVoucher(effectiveTenantId, staffId, period, amountOverride);
    if (result.ok) {
      revalidatePath("/finance");
      revalidatePath("/hr");
      return { ok: true, alreadyPosted: result.alreadyPosted, voucherId: result.voucherId, voucherNo: result.voucherNo };
    }
    return { ok: false, error: result.error || "Failed to post incentive voucher." };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Failed to post incentive voucher." };
  }
}

/**
 * 10. Fetch All Financial Statements (Trial Balance, P&L, Balance Sheet) atomically.
 */
export async function getFinancialStatementsAction(params?: {
  asOfDate?: string;
  startDate?: string;
  endDate?: string;
  tenantIdOverride?: string;
}): Promise<
  | {
      ok: true;
      trialBalance: TrialBalanceResult;
      profitAndLoss: ProfitAndLossResult;
      balanceSheet: BalanceSheetResult;
    }
  | { ok: false; error: string }
> {
  const { role, tenantId: sessionTenantId } = await requireRole([
    "super_admin",
    "tenant_admin",
  ]);

  const effectiveTenantId = role === "super_admin" ? (params?.tenantIdOverride || sessionTenantId) : sessionTenantId;
  if (!effectiveTenantId) {
    return { ok: false, error: "Tenant ID is required." };
  }

  try {
    await requireRoutePlan(effectiveTenantId, "finance");
    const asOfDate = params?.asOfDate || new Date().toISOString().slice(0, 10);
    const startDate = params?.startDate;
    const endDate = params?.endDate || asOfDate;

    const [trialBalance, profitAndLoss, balanceSheet] = await Promise.all([
      getTrialBalance(effectiveTenantId, asOfDate),
      getProfitAndLoss(effectiveTenantId, { startDate, endDate }),
      getBalanceSheet(effectiveTenantId, asOfDate),
    ]);

    return {
      ok: true,
      trialBalance,
      profitAndLoss,
      balanceSheet,
    };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Failed to load financial statements." };
  }
}

/**
 * 11. Fetch GST Liability and Statutory Filing Tracker (GSTR-1, GSTR-3B, GSTR-9).
 */
export async function getGstFilingsAction(
  period: string,
  tenantIdOverride?: string
): Promise<{ ok: true; report: GstComplianceReport } | { ok: false; error: string }> {
  const { role, tenantId: sessionTenantId } = await requireRole([
    "super_admin",
    "tenant_admin",
  ]);

  const effectiveTenantId = role === "super_admin" ? (tenantIdOverride || sessionTenantId) : sessionTenantId;
  if (!effectiveTenantId) {
    return { ok: false, error: "Tenant ID is required." };
  }

  try {
    await requireRoutePlan(effectiveTenantId, "finance");
    const cleanPeriod = (period || new Date().toISOString().slice(0, 7)).trim();
    const report = await getGstFilings(effectiveTenantId, cleanPeriod);
    return { ok: true, report };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Failed to load GST compliance report." };
  }
}

/**
 * 12. Mark GST Return as Filed (Record-keeping tracking).
 */
export async function markGstFilingAsFiledAction(params: {
  period: string;
  filingType: GstFilingType;
  tenantIdOverride?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { session, role, tenantId: sessionTenantId } = await requireRole([
    "super_admin",
    "tenant_admin",
  ]);

  const effectiveTenantId = role === "super_admin" ? (params.tenantIdOverride || sessionTenantId) : sessionTenantId;
  if (!effectiveTenantId) {
    return { ok: false, error: "Tenant ID is required." };
  }

  try {
    await requireRoutePlan(effectiveTenantId, "finance");
    const actorEmail = session.user?.email || "Admin";
    const result = await markGstFilingAsFiled({
      tenantId: effectiveTenantId,
      period: params.period.trim(),
      filingType: params.filingType,
      filedBy: actorEmail,
    });

    if (result.ok) {
      revalidatePath("/finance");
      return { ok: true };
    }
    return { ok: false, error: result.error || "Failed to update filing status." };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Failed to mark GST return as filed." };
  }
}

/**
 * 13. Import Bank Statement Action (CSV/TSV/Text).
 */
export async function importBankStatementAction(params: {
  fileName: string;
  csvContent: string;
  bankAccountId?: string;
  autoReconcile?: boolean;
  tenantIdOverride?: string;
}): Promise<{ ok: true; importId: string; summary?: BankReconciliationSummary } | { ok: false; error: string }> {
  const { session, role, tenantId: sessionTenantId } = await requireRole([
    "super_admin",
    "tenant_admin",
  ]);

  const effectiveTenantId = role === "super_admin" ? (params.tenantIdOverride || sessionTenantId) : sessionTenantId;
  if (!effectiveTenantId) {
    return { ok: false, error: "Tenant ID is required." };
  }

  try {
    await requireRoutePlan(effectiveTenantId, "finance");
    const actorEmail = session.user?.email || "Admin";
    const result = await importBankStatement({
      tenantId: effectiveTenantId,
      fileName: params.fileName,
      csvContent: params.csvContent,
      bankAccountId: params.bankAccountId,
      uploadedBy: actorEmail,
      autoReconcile: params.autoReconcile !== false,
    });

    if (result.ok && result.importId) {
      revalidatePath("/finance");
      return { ok: true, importId: result.importId, summary: result.summary };
    }
    return { ok: false, error: result.error || "Failed to parse and import bank statement." };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Failed to import bank statement." };
  }
}

/**
 * 14. Reconcile Bank Statement Action (Trigger auto-match).
 */
export async function reconcileBankStatementAction(params: {
  importId: string;
  tenantIdOverride?: string;
}): Promise<{ ok: true; matchedCount: number; unmatchedCount: number } | { ok: false; error: string }> {
  const { role, tenantId: sessionTenantId } = await requireRole([
    "super_admin",
    "tenant_admin",
  ]);

  const effectiveTenantId = role === "super_admin" ? (params.tenantIdOverride || sessionTenantId) : sessionTenantId;
  if (!effectiveTenantId) {
    return { ok: false, error: "Tenant ID is required." };
  }

  try {
    await requireRoutePlan(effectiveTenantId, "finance");
    const result = await reconcileBankStatement(effectiveTenantId, params.importId);
    if (result.ok) {
      revalidatePath("/finance");
      return { ok: true, matchedCount: result.matchedCount, unmatchedCount: result.unmatchedCount };
    }
    return { ok: false, error: result.error || "Failed to auto-match bank statement rows." };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Failed to reconcile bank statement." };
  }
}

/**
 * 15. Link Bank Statement Row to Ledger Entry (Manual Link).
 */
export async function linkBankStatementRowAction(params: {
  importId: string;
  rowId: string;
  ledgerEntryId: string;
  tenantIdOverride?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { session, role, tenantId: sessionTenantId } = await requireRole([
    "super_admin",
    "tenant_admin",
  ]);

  const effectiveTenantId = role === "super_admin" ? (params.tenantIdOverride || sessionTenantId) : sessionTenantId;
  if (!effectiveTenantId) {
    return { ok: false, error: "Tenant ID is required." };
  }

  try {
    await requireRoutePlan(effectiveTenantId, "finance");
    const actorEmail = session.user?.email || "Admin";
    const result = await linkBankStatementRow({
      tenantId: effectiveTenantId,
      importId: params.importId,
      rowId: params.rowId,
      ledgerEntryId: params.ledgerEntryId,
      updatedBy: actorEmail,
    });

    if (result.ok) {
      revalidatePath("/finance");
      return { ok: true };
    }
    return { ok: false, error: result.error || "Failed to link row to entry." };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Failed to link bank row." };
  }
}

/**
 * 16. Unlink Bank Statement Row.
 */
export async function unlinkBankStatementRowAction(params: {
  importId: string;
  rowId: string;
  tenantIdOverride?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { session, role, tenantId: sessionTenantId } = await requireRole([
    "super_admin",
    "tenant_admin",
  ]);

  const effectiveTenantId = role === "super_admin" ? (params.tenantIdOverride || sessionTenantId) : sessionTenantId;
  if (!effectiveTenantId) {
    return { ok: false, error: "Tenant ID is required." };
  }

  try {
    await requireRoutePlan(effectiveTenantId, "finance");
    const actorEmail = session.user?.email || "Admin";
    const result = await unlinkBankStatementRow({
      tenantId: effectiveTenantId,
      importId: params.importId,
      rowId: params.rowId,
      updatedBy: actorEmail,
    });

    if (result.ok) {
      revalidatePath("/finance");
      return { ok: true };
    }
    return { ok: false, error: result.error || "Failed to unlink row." };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Failed to unlink bank row." };
  }
}

/**
 * 17. Get Bank Reconciliation Summary (BRS Statement & Row Details).
 */
export async function getBankReconciliationSummaryAction(params: {
  importId: string;
  tenantIdOverride?: string;
}): Promise<{ ok: true; summary: BankReconciliationSummary } | { ok: false; error: string }> {
  const { role, tenantId: sessionTenantId } = await requireRole([
    "super_admin",
    "tenant_admin",
  ]);

  const effectiveTenantId = role === "super_admin" ? (params.tenantIdOverride || sessionTenantId) : sessionTenantId;
  if (!effectiveTenantId) {
    return { ok: false, error: "Tenant ID is required." };
  }

  try {
    await requireRoutePlan(effectiveTenantId, "finance");
    const summary = await getBankReconciliationSummary(effectiveTenantId, params.importId);
    if (summary) {
      return { ok: true, summary };
    }
    return { ok: false, error: "Import summary not found." };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Failed to load bank reconciliation summary." };
  }
}

/**
 * 18. Get Unmatched Ledger Entries (For manual link candidate picker).
 */
export async function getUnmatchedLedgerEntriesAction(params?: {
  bankAccountId?: string;
  searchQuery?: string;
  tenantIdOverride?: string;
}) {
  const { role, tenantId: sessionTenantId } = await requireRole([
    "super_admin",
    "tenant_admin",
  ]);

  const effectiveTenantId = role === "super_admin" ? (params?.tenantIdOverride || sessionTenantId) : sessionTenantId;
  if (!effectiveTenantId) {
    return { ok: false, error: "Tenant ID is required." };
  }

  try {
    await requireRoutePlan(effectiveTenantId, "finance");
    const entries = await getUnmatchedLedgerEntries({
      tenantId: effectiveTenantId,
      bankAccountId: params?.bankAccountId,
      searchQuery: params?.searchQuery,
    });
    return { ok: true, entries };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Failed to load unmatched ledger entries." };
  }
}

/**
 * 19. List all Bank Statement Imports for tenant.
 */
export async function listBankStatementImportsAction(tenantIdOverride?: string) {
  const { role, tenantId: sessionTenantId } = await requireRole([
    "super_admin",
    "tenant_admin",
  ]);

  const effectiveTenantId = role === "super_admin" ? (tenantIdOverride || sessionTenantId) : sessionTenantId;
  if (!effectiveTenantId) {
    return { ok: false, error: "Tenant ID is required." };
  }

  try {
    await requireRoutePlan(effectiveTenantId, "finance");
    const imports = await listBankStatementImports(effectiveTenantId);
    return { ok: true, imports };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Failed to list bank statement imports." };
  }
}

/**
 * 20. Delete Bank Statement Import Record.
 */
export async function deleteBankStatementImportAction(params: {
  importId: string;
  tenantIdOverride?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { role, tenantId: sessionTenantId } = await requireRole([
    "super_admin",
    "tenant_admin",
  ]);

  const effectiveTenantId = role === "super_admin" ? (params.tenantIdOverride || sessionTenantId) : sessionTenantId;
  if (!effectiveTenantId) {
    return { ok: false, error: "Tenant ID is required." };
  }

  try {
    await requireRoutePlan(effectiveTenantId, "finance");
    const result = await deleteBankStatementImport(effectiveTenantId, params.importId);
    if (result.ok) {
      revalidatePath("/finance");
      return { ok: true };
    }
    return { ok: false, error: result.error || "Failed to delete import record." };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Failed to delete bank statement import." };
  }
}



