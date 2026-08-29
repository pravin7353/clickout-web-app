import { z } from "zod";

export const createStoreSchema = z.object({
  storeName: z.string().trim().min(1, "Store name is required"),
  branchCode: z.string().trim().min(1, "Branch code is required"),
  managerEmpId: z.string().trim().min(1, "Manager Employee ID is required"),
  managerName: z.string().trim().min(1, "Manager name is required"),
  managerPhone: z.string().trim().regex(/^\d{10}$/, "Phone must be 10 digits"),
  managerEmail: z.string().trim().email(),
  address: z.string().trim().optional(),
  city: z.string().trim().optional(),
  state: z.string().trim().optional(),
  pincode: z.string().trim().optional(),
});