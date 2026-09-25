import { z } from "zod";

// ==========================================
// 1. Chart of Accounts Schemas & Types
// ==========================================

export const accountTypeEnum = z.enum(["ASSET", "LIABILITY", "EQUITY", "INCOME", "EXPENSE"]);
export type AccountType = z.infer<typeof accountTypeEnum>;

export const balanceTypeEnum = z.enum(["DR", "CR"]);
export type BalanceType = z.infer<typeof balanceTypeEnum>;

export const ledgerAccountSchema = z.object({
  id: z.string().optional(),
  tenantId: z.string().min(1, "Tenant ID is required"),
  accountName: z.string().min(1, "Account name is required").trim(),
  accountType: accountTypeEnum,
  accountGroup: z.string().min(1, "Account group is required").trim(),
  openingBalance: z.number().default(0),
  openingBalanceType: balanceTypeEnum.default("DR"),
  isSystemAccount: z.boolean().default(false),
  createdAtMs: z.number().optional(),
});

export type LedgerAccountDocument = z.infer<typeof ledgerAccountSchema>;

// ==========================================
// 2. Standard Default Chart of Accounts Seed
// ==========================================

export interface DefaultAccountSeed {
  accountName: string;
  accountType: AccountType;
  accountGroup: string;
  openingBalance: number;
  openingBalanceType: BalanceType;
  isSystemAccount: boolean;
}

export const DEFAULT_CHART_OF_ACCOUNTS: DefaultAccountSeed[] = [
  {
    accountName: "Cash in Hand",
    accountType: "ASSET",
    accountGroup: "Cash in Hand",
    openingBalance: 0,
    openingBalanceType: "DR",
    isSystemAccount: true,
  },
  {
    accountName: "Bank Account",
    accountType: "ASSET",
    accountGroup: "Bank Account",
    openingBalance: 0,
    openingBalanceType: "DR",
    isSystemAccount: true,
  },
  {
    accountName: "Sales A/c",
    accountType: "INCOME",
    accountGroup: "Sales A/c",
    openingBalance: 0,
    openingBalanceType: "CR",
    isSystemAccount: true,
  },
  {
    accountName: "Purchase A/c",
    accountType: "EXPENSE",
    accountGroup: "Purchase A/c",
    openingBalance: 0,
    openingBalanceType: "DR",
    isSystemAccount: true,
  },
  {
    accountName: "Sundry Debtors",
    accountType: "ASSET",
    accountGroup: "Sundry Debtors",
    openingBalance: 0,
    openingBalanceType: "DR",
    isSystemAccount: true,
  },
  {
    accountName: "Sundry Creditors",
    accountType: "LIABILITY",
    accountGroup: "Sundry Creditors",
    openingBalance: 0,
    openingBalanceType: "CR",
    isSystemAccount: true,
  },
  {
    accountName: "Salary Expense",
    accountType: "EXPENSE",
    accountGroup: "Salary Expense",
    openingBalance: 0,
    openingBalanceType: "DR",
    isSystemAccount: true,
  },
  {
    accountName: "Commission Expense",
    accountType: "EXPENSE",
    accountGroup: "Commission Expense",
    openingBalance: 0,
    openingBalanceType: "DR",
    isSystemAccount: true,
  },
  {
    accountName: "GST Payable",
    accountType: "LIABILITY",
    accountGroup: "GST Payable",
    openingBalance: 0,
    openingBalanceType: "CR",
    isSystemAccount: true,
  },
  {
    accountName: "GST Receivable",
    accountType: "ASSET",
    accountGroup: "GST Receivable",
    openingBalance: 0,
    openingBalanceType: "DR",
    isSystemAccount: true,
  },
  {
    accountName: "Salary Payable",
    accountType: "LIABILITY",
    accountGroup: "Salary Payable",
    openingBalance: 0,
    openingBalanceType: "CR",
    isSystemAccount: true,
  },
  {
    accountName: "Incentive Payable",
    accountType: "LIABILITY",
    accountGroup: "Incentive Payable",
    openingBalance: 0,
    openingBalanceType: "CR",
    isSystemAccount: true,
  },
  {
    accountName: "Capital Account",
    accountType: "EQUITY",
    accountGroup: "Capital Account",
    openingBalance: 0,
    openingBalanceType: "CR",
    isSystemAccount: true,
  },
];

// ==========================================
// 3. Vouchers Schemas & Types
// ==========================================

export const voucherTypeEnum = z.enum(["PAYMENT", "RECEIPT", "JOURNAL", "CONTRA", "SALES", "PURCHASE"]);
export type VoucherType = z.infer<typeof voucherTypeEnum>;

export const voucherSourceTypeEnum = z.enum([
  "MANUAL",
  "AUTO_SALES",
  "AUTO_PURCHASE",
  "AUTO_SALARY",
  "AUTO_INCENTIVE",
]);
export type VoucherSourceType = z.infer<typeof voucherSourceTypeEnum>;

export const ledgerVoucherSchema = z.object({
  id: z.string().optional(),
  tenantId: z.string().min(1, "Tenant ID is required"),
  voucherType: voucherTypeEnum,
  voucherNo: z.string().min(1, "Voucher number is required").trim(),
  date: z.string().min(1, "Voucher date is required").trim(),
  narration: z.string().trim().default(""),
  createdBy: z.string().min(1, "Creator email/id is required").trim(),
  createdAtMs: z.number(),
  sourceType: voucherSourceTypeEnum.default("MANUAL").nullable().optional(),
  sourceRefId: z.string().trim().nullable().optional(),
});

export type LedgerVoucherDocument = z.infer<typeof ledgerVoucherSchema>;

// ==========================================
// 4. Ledger Entries Schemas & Balanced Validation
// ==========================================

export const ledgerEntrySchema = z.object({
  id: z.string().optional(),
  tenantId: z.string().min(1, "Tenant ID is required"),
  voucherId: z.string().min(1, "Voucher ID is required"),
  accountId: z.string().min(1, "Account ID is required"),
  entryType: balanceTypeEnum, // "DR" | "CR"
  amount: z.number().positive("Entry amount must be greater than zero"),
  date: z.string().min(1, "Entry date is required").trim(),
});

export type LedgerEntryDocument = z.infer<typeof ledgerEntrySchema>;

/**
 * Pure validation helper for balanced double-entry accounting.
 * Returns { isBalanced: true, totalDr, totalCr } or { isBalanced: false, totalDr, totalCr, diff }.
 */
export function validateBalancedLedgerEntries(
  entries: Array<{ entryType: "DR" | "CR"; amount: number }>
): { isBalanced: boolean; totalDr: number; totalCr: number; diff: number } {
  let totalDr = 0;
  let totalCr = 0;

  for (const entry of entries) {
    if (entry.entryType === "DR") {
      totalDr += entry.amount;
    } else if (entry.entryType === "CR") {
      totalCr += entry.amount;
    }
  }

  // Floating-point tolerance for currency (0.001)
  const diff = Math.abs(totalDr - totalCr);
  const isBalanced = entries.length >= 2 && diff <= 0.001;

  return {
    isBalanced,
    totalDr: Math.round(totalDr * 100) / 100,
    totalCr: Math.round(totalCr * 100) / 100,
    diff: Math.round(diff * 100) / 100,
  };
}

/**
 * Composite voucher creation schema enforcing double-entry balance:
 * 1. At least 2 entries.
 * 2. Sum of DR amounts == Sum of CR amounts.
 */
export const createVoucherWithEntriesSchema = z
  .object({
    voucher: ledgerVoucherSchema,
    entries: z.array(ledgerEntrySchema).min(2, "A voucher must contain at least 2 ledger entries."),
  })
  .superRefine((data, ctx) => {
    const { isBalanced, totalDr, totalCr, diff } = validateBalancedLedgerEntries(data.entries);
    if (!isBalanced) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Unbalanced voucher: Total DR (₹${totalDr.toFixed(2)}) must equal Total CR (₹${totalCr.toFixed(2)}). Difference: ₹${diff.toFixed(2)}.`,
        path: ["entries"],
      });
    }
  });

export type CreateVoucherWithEntriesInput = z.infer<typeof createVoucherWithEntriesSchema>;

// ==========================================
// 5. GST Compliance & Filings Schemas & Types (Chunk 26)
// ==========================================

export const gstFilingTypeEnum = z.enum(["GSTR1", "GSTR3B", "GSTR9"]);
export type GstFilingType = z.infer<typeof gstFilingTypeEnum>;

export const gstFilingStatusEnum = z.enum(["NOT_DUE", "DUE_SOON", "OVERDUE", "FILED"]);
export type GstFilingStatus = z.infer<typeof gstFilingStatusEnum>;

export const gstFilingSchema = z.object({
  id: z.string().optional(),
  tenantId: z.string().min(1, "Tenant ID is required"),
  period: z.string().min(1, "Period (e.g. 2026-09) is required"),
  filingType: gstFilingTypeEnum,
  dueDate: z.string().min(1, "Due date is required"),
  status: gstFilingStatusEnum.default("NOT_DUE"),
  filedAtMs: z.number().nullable().optional(),
  filedBy: z.string().nullable().optional(),
  updatedAtMs: z.number().optional(),
});

export type GstFilingDocument = z.infer<typeof gstFilingSchema>;

/**
 * Calculates standard statutory GST return due dates for a given monthly period YYYY-MM.
 */
export function getStandardGstDueDates(period: string): {
  gstr1DueDate: string;
  gstr3bDueDate: string;
  gstr9DueDate: string;
} {
  const [yearStr, monthStr] = period.split("-");
  const year = parseInt(yearStr, 10) || new Date().getFullYear();
  const month = parseInt(monthStr, 10) || (new Date().getMonth() + 1);

  // Next month calculation
  let nextMonth = month + 1;
  let nextYear = year;
  if (nextMonth > 12) {
    nextMonth = 1;
    nextYear = year + 1;
  }
  const nextMonthPadded = String(nextMonth).padStart(2, "0");

  return {
    gstr1DueDate: `${nextYear}-${nextMonthPadded}-11`,
    gstr3bDueDate: `${nextYear}-${nextMonthPadded}-20`,
    gstr9DueDate: `${year + 1}-12-31`,
  };
}

/**
 * Pure function to compute filing status dynamically based on current date and filing state.
 */
export function computeGstFilingStatus(
  dueDate: string,
  filedAtMs?: number | null,
  currentDateStr?: string
): { status: GstFilingStatus; daysRemaining: number } {
  if (filedAtMs && filedAtMs > 0) {
    return { status: "FILED", daysRemaining: 0 };
  }

  const today = currentDateStr ? new Date(currentDateStr) : new Date();
  today.setHours(0, 0, 0, 0);

  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);

  const diffMs = due.getTime() - today.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return { status: "OVERDUE", daysRemaining: diffDays };
  } else if (diffDays <= 7) {
    return { status: "DUE_SOON", daysRemaining: diffDays };
  } else {
    return { status: "NOT_DUE", daysRemaining: diffDays };
  }
}

// ==========================================
// 6. Bank Statement Import & Reconciliation (Chunk 27)
// ==========================================

export const bankStatementRowTypeEnum = z.enum(["DEBIT", "CREDIT"]);
export type BankStatementRowType = z.infer<typeof bankStatementRowTypeEnum>;

export const bankStatementMatchModeEnum = z.enum(["AUTO", "MANUAL"]);
export type BankStatementMatchMode = z.infer<typeof bankStatementMatchModeEnum>;

export const bankStatementRowSchema = z.object({
  id: z.string(),
  date: z.string().min(1, "Date is required"), // YYYY-MM-DD
  description: z.string().trim().default(""),
  amount: z.number().positive("Amount must be greater than zero"),
  type: bankStatementRowTypeEnum, // DEBIT = Withdrawal/Outflow, CREDIT = Deposit/Inflow
  matchedLedgerEntryId: z.string().nullable().optional(),
  matchedAtMs: z.number().nullable().optional(),
  matchType: bankStatementMatchModeEnum.nullable().optional(),
});

export type BankStatementRow = z.infer<typeof bankStatementRowSchema>;

export const bankStatementImportSchema = z.object({
  id: z.string().optional(),
  tenantId: z.string().min(1, "Tenant ID is required"),
  bankAccountId: z.string().optional(),
  fileName: z.string().min(1, "File name is required"),
  uploadedAtMs: z.number(),
  uploadedBy: z.string().min(1, "Uploaded by is required"),
  rows: z.array(bankStatementRowSchema).default([]),
});

export type BankStatementImportDocument = z.infer<typeof bankStatementImportSchema>;

/**
 * Parses a standard date string into canonical YYYY-MM-DD.
 * Supports YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY, MM/DD/YYYY, and DD-MMM-YYYY (e.g. 25-Sep-2026).
 */
export function normalizeDateToIso(dateStr: string): string | null {
  const clean = dateStr.trim();
  if (!clean) return null;

  // YYYY-MM-DD or YYYY/MM/DD
  if (/^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}$/.test(clean)) {
    const parts = clean.split(/[-/.]/);
    const y = parts[0];
    const m = parts[1].padStart(2, "0");
    const d = parts[2].padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  // DD-MMM-YYYY or DD MMM YYYY (e.g. 25-Sep-2026 or 25 Sep 2026)
  const monthNames: Record<string, string> = {
    jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
    jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
  };
  const mmmMatch = clean.match(/^(\d{1,2})[-/\s]([a-zA-Z]{3})[-/\s](\d{2,4})$/);
  if (mmmMatch) {
    const day = mmmMatch[1].padStart(2, "0");
    const monStr = mmmMatch[2].toLowerCase();
    const mon = monthNames[monStr] || "01";
    let yr = mmmMatch[3];
    if (yr.length === 2) yr = `20${yr}`;
    return `${yr}-${mon}-${day}`;
  }

  // DD/MM/YYYY or DD-MM-YYYY
  if (/^\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}$/.test(clean)) {
    const parts = clean.split(/[-/.]/);
    let p1 = parts[0];
    let p2 = parts[1];
    let yr = parts[2];
    if (yr.length === 2) yr = `20${yr}`;

    // If first part is > 12, it's definitely DD-MM-YYYY
    let day = p1.padStart(2, "0");
    let mon = p2.padStart(2, "0");
    if (parseInt(p1, 10) > 12 || parseInt(p2, 10) <= 12) {
      day = p1.padStart(2, "0");
      mon = p2.padStart(2, "0");
    }
    return `${yr}-${mon}-${day}`;
  }

  const d = new Date(clean);
  if (!isNaN(d.getTime())) {
    return d.toISOString().slice(0, 10);
  }

  return null;
}

/**
 * Pure helper to parse CSV/TSV lines taking quotes into account.
 */
function parseCsvLine(line: string, delimiter: string = ","): string[] {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      values.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  values.push(current.trim());
  return values;
}

/**
 * Pure CSV/Excel-text parser for bank statements.
 * Returns parsed BankStatementRow objects.
 */
export function parseBankStatementCsv(csvContent: string): {
  ok: boolean;
  rows: BankStatementRow[];
  error?: string;
} {
  if (!csvContent || typeof csvContent !== "string") {
    return { ok: false, rows: [], error: "Empty or invalid statement content." };
  }

  const lines = csvContent
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length < 2) {
    return { ok: false, rows: [], error: "File must contain a header row and at least one transaction row." };
  }

  // Detect delimiter (, or \t or ;)
  const firstLine = lines[0];
  let delimiter = ",";
  if (firstLine.includes("\t")) delimiter = "\t";
  else if (firstLine.includes(";") && !firstLine.includes(",")) delimiter = ";";

  // Find header line index
  let headerIndex = -1;
  let headerCols: string[] = [];

  for (let i = 0; i < Math.min(10, lines.length); i++) {
    const cols = parseCsvLine(lines[i], delimiter).map((c) => c.toLowerCase().replace(/[^a-z0-9]/g, ""));
    const hasDate = cols.some((c) => c.includes("date") || c.includes("txn") || c.includes("trans"));
    const hasDesc = cols.some(
      (c) =>
        c.includes("desc") ||
        c.includes("particular") ||
        c.includes("narration") ||
        c.includes("detail") ||
        c.includes("remark")
    );
    const hasAmtOrDrCr = cols.some(
      (c) =>
        c.includes("debit") ||
        c.includes("credit") ||
        c.includes("withdrawal") ||
        c.includes("deposit") ||
        c.includes("amount") ||
        c.includes("dr") ||
        c.includes("cr")
    );

    if (hasDate && (hasDesc || hasAmtOrDrCr)) {
      headerIndex = i;
      headerCols = parseCsvLine(lines[i], delimiter).map((c) => c.toLowerCase().trim());
      break;
    }
  }

  if (headerIndex === -1) {
    return {
      ok: false,
      rows: [],
      error: "Could not identify header columns. Ensure your file contains headers like Date, Description, Debit/Withdrawal, Credit/Deposit or Amount.",
    };
  }

  // Identify column indices
  let dateIdx = -1;
  let descIdx = -1;
  let debitIdx = -1;
  let creditIdx = -1;
  let amountIdx = -1;
  let typeIdx = -1;

  headerCols.forEach((col, idx) => {
    const c = col.replace(/[^a-z0-9]/g, "");
    if (dateIdx === -1 && (c.includes("date") || c.includes("txn") || c.includes("valuedate"))) {
      dateIdx = idx;
    } else if (
      descIdx === -1 &&
      (c.includes("desc") || c.includes("particular") || c.includes("narration") || c.includes("detail") || c.includes("remark"))
    ) {
      descIdx = idx;
    } else if (debitIdx === -1 && (c.includes("debit") || c.includes("withdrawal") || c.includes("dr"))) {
      debitIdx = idx;
    } else if (creditIdx === -1 && (c.includes("credit") || c.includes("deposit") || c.includes("cr"))) {
      creditIdx = idx;
    } else if (amountIdx === -1 && c.includes("amount")) {
      amountIdx = idx;
    } else if (typeIdx === -1 && (c.includes("type") || c.includes("drcr"))) {
      typeIdx = idx;
    }
  });

  if (dateIdx === -1) {
    return { ok: false, rows: [], error: "Missing Date column in statement header." };
  }

  const cleanNum = (val: string): number => {
    if (!val) return 0;
    const sanitized = val.replace(/[^0-9.-]/g, "");
    const parsed = parseFloat(sanitized);
    return isNaN(parsed) ? 0 : parsed;
  };

  const parsedRows: BankStatementRow[] = [];
  let rowCounter = 1;

  for (let i = headerIndex + 1; i < lines.length; i++) {
    const rawCols = parseCsvLine(lines[i], delimiter);
    if (rawCols.length <= dateIdx) continue;

    const rawDate = rawCols[dateIdx];
    const isoDate = normalizeDateToIso(rawDate);
    if (!isoDate) continue; // Skip totals or footer rows without valid dates

    const description = descIdx >= 0 && rawCols[descIdx] ? rawCols[descIdx].trim() : "Bank Transaction";

    let amount = 0;
    let type: BankStatementRowType = "DEBIT";

    if (debitIdx >= 0 && creditIdx >= 0) {
      const debitVal = cleanNum(rawCols[debitIdx] || "");
      const creditVal = cleanNum(rawCols[creditIdx] || "");

      if (creditVal > 0) {
        amount = creditVal;
        type = "CREDIT";
      } else if (debitVal > 0) {
        amount = debitVal;
        type = "DEBIT";
      } else {
        continue; // Skip 0 or empty rows
      }
    } else if (amountIdx >= 0) {
      const amtVal = cleanNum(rawCols[amountIdx] || "");
      if (amtVal === 0) continue;

      if (typeIdx >= 0 && rawCols[typeIdx]) {
        const tStr = rawCols[typeIdx].toUpperCase();
        if (tStr.includes("CR") || tStr.includes("DEP") || tStr.includes("CREDIT")) {
          type = "CREDIT";
        } else {
          type = "DEBIT";
        }
        amount = Math.abs(amtVal);
      } else {
        // Negative = Debit, Positive = Credit
        if (amtVal < 0) {
          type = "DEBIT";
          amount = Math.abs(amtVal);
        } else {
          type = "CREDIT";
          amount = amtVal;
        }
      }
    } else if (debitIdx >= 0) {
      const debitVal = cleanNum(rawCols[debitIdx] || "");
      if (debitVal > 0) {
        amount = debitVal;
        type = "DEBIT";
      }
    } else if (creditIdx >= 0) {
      const creditVal = cleanNum(rawCols[creditIdx] || "");
      if (creditVal > 0) {
        amount = creditVal;
        type = "CREDIT";
      }
    }

    if (amount > 0) {
      parsedRows.push({
        id: `row_${Date.now()}_${rowCounter++}`,
        date: isoDate,
        description,
        amount: Math.round(amount * 100) / 100,
        type,
        matchedLedgerEntryId: null,
        matchedAtMs: null,
        matchType: null,
      });
    }
  }

  if (parsedRows.length === 0) {
    return {
      ok: false,
      rows: [],
      error: "No valid transaction rows found in file. Please check that amounts and dates are populated.",
    };
  }

  return {
    ok: true,
    rows: parsedRows,
  };
}
