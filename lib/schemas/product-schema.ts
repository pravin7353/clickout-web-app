import { z } from "zod";

export const addProductSchema = z.object({
  barcode: z.string().trim().min(1, "Barcode is required"),
  name: z.string().trim().min(1, "Name is required"),
  category: z.string().trim().optional(),
  price: z.coerce.number().min(0),
  unitCost: z.coerce.number().min(0).default(0),
  gst: z.string().default("0"),
  physicalStock: z.coerce.number().int().min(0).default(0),
  weight: z.string().optional(),
  expiryDate: z.string().datetime().optional().nullable(),
});

export const updateProductSchema = z.object({
  productId: z.string().optional(),
  barcode: z.string().trim().min(1).optional(),
  name: z.string().trim().min(1),
  category: z.string().trim().optional(),
  price: z.coerce.number().min(0),
  unitCost: z.coerce.number().min(0).optional(),
  gst: z.string().optional(),
  physicalStock: z.coerce.number().int().min(0).optional(),
  weight: z.string().optional(),
  expiryDate: z.string().optional().nullable(),
});

export const stockTransferRequestSchema = z
  .object({
    fromBranchCode: z.string().min(1, "Source branch is required"),
    toBranchCode: z.string().min(1, "Destination branch is required"),
    barcode: z.string().min(1, "Product barcode is required"),
    quantityRequested: z.coerce.number().int().min(1, "Quantity must be at least 1"),
    notes: z.string().optional(),
  })
  .refine((d) => d.fromBranchCode !== d.toBranchCode, {
    message: "Source and destination branch cannot be the same",
    path: ["toBranchCode"],
  });