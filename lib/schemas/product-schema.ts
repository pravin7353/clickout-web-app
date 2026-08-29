import { z } from "zod";

export const addProductSchema = z.object({
  barcode: z.string().trim().min(1, "Barcode is required"),
  name: z.string().trim().min(1, "Name is required"),
  price: z.coerce.number().min(0),
  unitCost: z.coerce.number().min(0).default(0),
  gst: z.string().default("0"),
  physicalStock: z.coerce.number().int().min(0).default(0),
  weight: z.string().optional(),
  expiryDate: z.string().datetime().optional().nullable(),
});

export const updateProductSchema = z.object({
  barcode: z.string().trim().min(1),
  name: z.string().trim().min(1),
  price: z.coerce.number().min(0),
  unitCost: z.coerce.number().min(0).optional(),
  gst: z.string().optional(),
  physicalStock: z.coerce.number().int().min(0).optional(),
  weight: z.string().optional(),
});