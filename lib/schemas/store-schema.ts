import { z } from "zod";

export const licenseSchema = z.object({
  type: z.string().min(1, "Type is required"),
  number: z.string().min(1, "Number is required")
}).superRefine((val, ctx) => {
  if (val.type === "GSTIN" && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[A-Z0-9]{3}$/.test(val.number.toUpperCase())) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid 15-char GSTIN", path: ["number"] });
  }
  if (val.type === "FSSAI" && !/^[0-9]{14}$/.test(val.number)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "FSSAI must be 14 digits", path: ["number"] });
  }
});

export const bankSchema = z.object({
  label: z.string().default("Primary Settlement"),
  accountName: z.string().trim().optional(),
  accountNo: z.string().trim().optional(),
  ifsc: z.string().trim().toUpperCase().optional(),
  bankName: z.string().trim().optional(),
  upi: z.string().trim().optional(),
}).superRefine((val, ctx) => {
  const hasAny = !!(val.accountName || val.accountNo || val.ifsc);
  if (hasAny) {
    if (!val.accountName) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Required", path: ["accountName"] });
    if (!val.accountNo) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Required", path: ["accountNo"] });
    if (!val.ifsc || !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(val.ifsc)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid IFSC", path: ["ifsc"] });
  }
});

export const createStoreSchema = z.object({
  storeName: z.string().trim().min(1, "Store name is required"),
  branchCode: z.string().trim().min(1, "Branch code is required"),
  storePhone: z.string().trim().regex(/^[6-9]\d{9}$/, "Must be 10 digits").optional().or(z.literal("")),

  managerEmpId: z.string().trim().optional(),
  managerName: z.string().trim().optional(),
  managerPhone: z.string().trim().optional(),
  managerEmail: z.string().trim().email("Invalid email").optional().or(z.literal("")),

  address: z.string().trim().min(1, "Address is required"),
  city: z.string().trim().min(1, "City is required"),
  state: z.string().trim().min(1, "State is required"),
  pincode: z.string().trim().regex(/^\d{6}$/, "Must be 6 digits"),
  gstin: z.string().trim().optional(), // Added gstin

  licenses: z.array(licenseSchema).max(5, "Max 5 licenses allowed").optional(),
  bankAccounts: z.array(bankSchema).max(5, "Max 5 bank accounts allowed").optional(),
}).superRefine((val, ctx) => {
  const hasManager = !!(val.managerEmail || val.managerName || val.managerPhone);
  if (hasManager) {
    if (!val.managerEmail) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Email required to assign manager", path: ["managerEmail"] });
    if (!val.managerName) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Name required", path: ["managerName"] });
    if (!val.managerPhone || !/^[6-9]\d{9}$/.test(val.managerPhone)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid 10-digit phone", path: ["managerPhone"] });
  }
});