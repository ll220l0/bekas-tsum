import { prisma } from "@/lib/prisma";
import {
  DEFAULT_RESTAURANT_SLUG,
  LEGACY_DEFAULT_RESTAURANT_SLUG,
} from "@/lib/restaurantConfig";

export const DEFAULT_RESTAURANT_NAME = "Beka's Burger";
const LEGACY_RESTAURANT_NAME = "Dordoi Food";
const DEFAULT_QR_IMAGE = "/qr/demo-restaurant.png";

async function canReplaceLegacySlug(restaurantId: string, currentSlug: string) {
  if (currentSlug !== LEGACY_DEFAULT_RESTAURANT_SLUG) return false;
  if (DEFAULT_RESTAURANT_SLUG === LEGACY_DEFAULT_RESTAURANT_SLUG) return false;
  const existing = await prisma.restaurant.findUnique({
    where: { slug: DEFAULT_RESTAURANT_SLUG },
    select: { id: true },
  });
  return !existing || existing.id === restaurantId;
}

export function getRestaurantDisplayName(name: string | null | undefined) {
  const normalized = (name ?? "").trim();
  if (!normalized || normalized === LEGACY_RESTAURANT_NAME) return DEFAULT_RESTAURANT_NAME;
  return normalized;
}

export async function ensureActiveRestaurant() {
  const active = await prisma.restaurant.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: "asc" },
  });
  if (active) {
    const shouldUpdateLegacySlug = await canReplaceLegacySlug(active.id, active.slug);
    if (active.name === LEGACY_RESTAURANT_NAME || shouldUpdateLegacySlug) {
      return prisma.restaurant.update({
        where: { id: active.id },
        data: {
          name: getRestaurantDisplayName(active.name),
          ...(shouldUpdateLegacySlug ? { slug: DEFAULT_RESTAURANT_SLUG } : {}),
        },
      });
    }
    return active;
  }

  const firstExisting = await prisma.restaurant.findFirst({
    orderBy: { createdAt: "asc" },
  });
  if (firstExisting) {
    const shouldUpdateLegacySlug = await canReplaceLegacySlug(firstExisting.id, firstExisting.slug);
    return prisma.restaurant.update({
      where: { id: firstExisting.id },
      data: {
        isActive: true,
        name: getRestaurantDisplayName(firstExisting.name),
        ...(shouldUpdateLegacySlug ? { slug: DEFAULT_RESTAURANT_SLUG } : {}),
      },
    });
  }

  const appName = (process.env.NEXT_PUBLIC_APP_NAME || DEFAULT_RESTAURANT_NAME).trim();
  return prisma.restaurant.create({
    data: {
      slug: DEFAULT_RESTAURANT_SLUG,
      name: appName || DEFAULT_RESTAURANT_NAME,
      qrImageUrl: DEFAULT_QR_IMAGE,
      isActive: true,
    },
  });
}
