import { z } from "zod";

export const onboardStaffSchema = z
  .object({
    empId: z.string().trim().min(1, "Employee ID is required"),
    role: z.string().trim().min(1, "Role is required"),
    name: z.string().trim().min(1, "Name is required"),
    phone: z
      .string()
      .trim()
      .regex(/^\d{10}$/, "Phone must be 10 digits")
      .optional()
      .or(z.literal("")),
    email: z.string().trim().email("Invalid email format").optional().or(z.literal("")),
    branchCode: z.string().trim().min(1, "Branch is required"),
  })
  .superRefine((data, ctx) => {
    const isAuditor = data.role.toUpperCase() === "AUDITOR";
    if (isAuditor) {
      if (!data.email || data.email.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Official email address is required for Auditor login",
          path: ["email"],
        });
      }
    } else {
      if (!data.phone || !/^\d{10}$/.test(data.phone)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "10-digit mobile phone number is required for operational staff",
          path: ["phone"],
        });
      }
    }
  });

export const updateStaffSchema = z.object({
  id: z.string().min(1, "Staff ID is required"),
  role: z.string().trim().min(1, "Role is required"),
  phone: z
    .string()
    .trim()
    .regex(/^\d{10}$/, "Phone must be 10 digits")
    .optional()
    .or(z.literal("")),
  email: z.string().trim().email("Invalid email format").optional().or(z.literal("")),
  branchCode: z.string().trim().min(1, "Branch is required"),
});