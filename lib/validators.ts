import { z } from "zod";

export const DeliveryLocationSchema = z
  .object({
    market: z.enum(["Цум", "Гум", "Олд Бишкек", "Берен Голд"]).default("Цум"),
    line: z.string().max(32),
    container: z.string().min(1).max(32),
    landmark: z.string().max(80).optional().or(z.literal("")),
  })
  .superRefine((location, ctx) => {
    if (location.market !== "Олд Бишкек" && location.line.trim().length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["line"],
        message: "Этаж обязателен",
      });
    }
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

const UpsertItemCommonSchema = z.object({
  restaurantSlug: z.string().min(1),
  categoryId: z.string().min(1),
  title: z.string().min(1).max(60),
  description: z.string().max(200).optional().or(z.literal("")),
  photoUrl: z.string().min(1),
});

export const UpsertSingleItemSchema = UpsertItemCommonSchema.extend({
  mode: z.literal("single"),
  id: z.string().optional(),
  priceKgs: z.number().int().min(0).max(1_000_000),
  isAvailable: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(999).optional(),
});

export const UpsertVariantGroupSchema = UpsertItemCommonSchema.extend({
  mode: z.literal("variants"),
  groupId: z.string().optional(),
  sourceItemIds: z.array(z.string().min(1)).max(20).optional(),
  variants: z
    .array(
      z.object({
        id: z.string().optional(),
        label: z.string().trim().min(1).max(24),
        priceKgs: z.number().int().min(0).max(1_000_000),
        isAvailable: z.boolean().default(true),
      }),
    )
    .min(2)
    .max(10)
    .superRefine((variants, ctx) => {
      const labels = new Set<string>();
      for (const [index, variant] of variants.entries()) {
        const label = variant.label.trim().toLowerCase();
        if (labels.has(label)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Названия вариантов должны быть уникальными",
            path: [index, "label"],
          });
          continue;
        }

        labels.add(label);
      }
    }),
});

export const UpsertItemSchema = z.discriminatedUnion("mode", [
  UpsertSingleItemSchema,
  UpsertVariantGroupSchema,
]);

export const DeleteItemGroupSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(20),
});
