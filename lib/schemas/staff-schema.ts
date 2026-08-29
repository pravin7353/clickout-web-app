import { z } from "zod";

export const onboardStaffSchema = z.object({
  empId: z.string().trim().min(1, "Employee ID is required"),
  role: z.enum(["manager", "cashier", "guard"]),
  name: z.string().trim().min(1, "Name is required"),
  phone: z.string().trim().regex(/^\d{10}$/, "Phone must be 10 digits"),
  email: z.string().trim().email().optional().or(z.literal("")),
  branchCode: z.string().trim().min(1, "Branch is required"),
});