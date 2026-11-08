import { z } from "zod";
import { isValidDate, isValidTimezone } from "./renewals";
import { toMinor } from "./money";

export const currencyCode = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, "Use a 3-letter currency code like USD");

export const subscriptionInput = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(120),
    amount: z.string().trim().min(1, "Amount is required"),
    currency: currencyCode,
    cycle: z.enum(["weekly", "monthly", "yearly", "custom"]),
    interval_count: z.coerce.number().int().min(1, "At least 1").max(3650),
    next_renewal: z.string().refine(isValidDate, "Pick a valid date"),
    category_id: z.string().uuid("Choose a category"),
    payment_method_id: z.string().uuid("Choose a payment method"),
    status: z.enum(["active", "trial", "paused", "cancelled"]),
    notes: z.string().max(2000).optional().default(""),
  })
  .transform((v, ctx) => {
    const minor = toMinor(v.amount, v.currency);
    if (minor === null) {
      ctx.addIssue({ code: "custom", path: ["amount"], message: "Enter a valid amount for this currency" });
      return z.NEVER;
    }
    return { ...v, amount_minor: minor };
  });

export const profileInput = z.object({
  home_currency: currencyCode,
  timezone: z.string().refine(isValidTimezone, "Unknown time zone"),
});

export const nameInput = z.object({ name: z.string().trim().min(1, "Name is required").max(60) });
export const idInput = z.string().uuid();
export const emailPassword = z.object({
  email: z.string().trim().email("Enter a valid email"),
  password: z.string().min(8, "Use at least 8 characters").max(200),
});

export function firstError(err: z.ZodError): string {
  const i = err.issues[0];
  return i ? `${i.path.join(".") ? i.path.join(".") + ": " : ""}${i.message}` : "Invalid input";
}
