import { z } from "zod";

export const MIN_PASSWORD = 10;

export const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().max(128),
});

export const signupSchema = credentialsSchema.extend({
  password: z.string().min(MIN_PASSWORD).max(128),
});

// Ethiopian mobile/landline: 09xxxxxxxx, 07xxxxxxxx or +2519xxxxxxxx; spaces and dashes allowed.
export const phoneSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s-]/g, ""))
  .pipe(z.string().regex(/^(\+251|0)[1-9]\d{8}$/));

export const onboardingSchema = z.object({
  pharmacyName: z.string().trim().min(2).max(120),
  fullName: z.string().trim().min(2).max(120),
  phone: phoneSchema,
});

export function formToObject(formData: FormData, keys: readonly string[]) {
  return Object.fromEntries(keys.map((k) => [k, formData.get(k) ?? ""]));
}

const positiveNumber = z.number().finite().positive().max(10_000_000);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const supplierSchema = z.object({
  name: z.string().trim().min(1).max(120),
  phone: z.string().trim().max(20).optional(),
});

export const deliverySchema = z.object({
  supplierId: z.uuid(),
  clientRef: z.uuid(),
  lines: z
    .array(
      z.object({
        itemId: z.uuid(),
        qty: positiveNumber,
        unitCost: z.number().finite().min(0).max(10_000_000),
        batchNo: z.string().trim().max(60).optional(),
        expiryDate: isoDate.optional(),
      }),
    )
    .min(1)
    .max(200),
});

const moneyField = z.coerce.number().finite().min(0).max(10_000_000);
const optionalName = z
  .string()
  .trim()
  .max(120)
  .transform((v) => v || undefined);

export const ITEM_UNITS = ["strip", "bottle", "sachet", "tube", "tablet", "pack", "piece", "pair", "roll", "bag"] as const;

export const itemSchema = z.object({
  nameEn: z.string().trim().min(2).max(120),
  nameAm: optionalName,
  nameOm: optionalName,
  sku: z
    .string()
    .trim()
    .max(40)
    .transform((v) => v || undefined),
  unit: z.enum(ITEM_UNITS),
  price: moneyField,
  cost: moneyField,
  reorderLevel: moneyField,
  tracksExpiry: z.boolean(),
});
