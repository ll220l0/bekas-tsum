import { z } from "zod";

export const DeliveryLocationSchema = z.object({
  market: z.enum(["Дордой", "АЗС", "Восток", "Алкан", "Европа"]).default("Дордой"),
  line: z.string().min(1).max(32),
  container: z.string().min(1).max(32),
  landmark: z.string().max(80).optional().or(z.literal("")),
});

export const CreateOrderSchema = z.object({
  restaurantSlug: z.string().min(1),
  paymentMethod: z.enum(["bank", "cash", "qr_image"]).default("bank"),
  customerPhone: z
    .string()
    .trim()
    .regex(/^996\d{9}$/),
  payerName: z.string().trim().max(60).optional().or(z.literal("")),
  comment: z.string().max(120).optional().or(z.literal("")),
  location: DeliveryLocationSchema,
  items: z
    .array(z.object({ menuItemId: z.string().min(1), qty: z.number().int().min(1).max(50) }))
    .min(1),
  idempotencyKey: z.string().trim().min(8).max(120).optional().or(z.literal("")),
});

export const UpsertCategorySchema = z.object({
  restaurantSlug: z.string().min(1),
  title: z.string().min(1).max(40),
  sortOrder: z.number().int().min(0).max(999).default(0),
});

export const UpsertItemSchema = z.object({
  id: z.string().optional(),
  restaurantSlug: z.string().min(1),
  categoryId: z.string().min(1),
  title: z.string().min(1).max(60),
  description: z.string().max(200).optional().or(z.literal("")),
  photoUrl: z.string().min(1),
  priceKgs: z.number().int().min(0).max(1_000_000),
  isAvailable: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(999).optional(),
});
