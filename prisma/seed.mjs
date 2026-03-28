import { randomBytes, scryptSync } from "node:crypto";
import { AdminUserRole, PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const DEFAULT_ADMIN_USERNAME = "admin";
const DEFAULT_ADMIN_PASSWORD = "admin123";
const DEFAULT_ADMIN_FIRST_NAME = "Admin";
const DEFAULT_ADMIN_LAST_NAME = "Owner";
const DEFAULT_ADMIN_PHONE = "996555000000";
const DEFAULT_RESTAURANT_NAME = "Beka's Burger";
const LEGACY_DEFAULT_RESTAURANT_SLUG = "dordoi-food";
const DEFAULT_RESTAURANT_SLUG =
  process.env.NEXT_PUBLIC_DEFAULT_RESTAURANT_SLUG?.trim() || LEGACY_DEFAULT_RESTAURANT_SLUG;

function hashPassword(password) {
  const salt = randomBytes(16);
  const derived = scryptSync(password, salt, 64);
  return `scrypt$${salt.toString("base64")}$${derived.toString("base64")}`;
}

async function canReplaceLegacySlug(restaurantId, currentSlug) {
  if (currentSlug !== LEGACY_DEFAULT_RESTAURANT_SLUG) return false;
  if (DEFAULT_RESTAURANT_SLUG === LEGACY_DEFAULT_RESTAURANT_SLUG) return false;
  const existing = await prisma.restaurant.findUnique({
    where: { slug: DEFAULT_RESTAURANT_SLUG },
    select: { id: true },
  });
  return !existing || existing.id === restaurantId;
}

async function ensureDefaultAdmin() {
  const activeAdmin = await prisma.adminUser.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: "asc" },
  });

  if (activeAdmin) {
    console.log(`Active admin already exists: ${activeAdmin.username}`);
    return activeAdmin;
  }

  const passwordHash = hashPassword(DEFAULT_ADMIN_PASSWORD);
  const admin = await prisma.$transaction(async (tx) => {
    const user = await tx.adminUser.upsert({
      where: { username: DEFAULT_ADMIN_USERNAME },
      update: {
        passwordHash,
        role: AdminUserRole.owner,
        isActive: true,
      },
      create: {
        username: DEFAULT_ADMIN_USERNAME,
        passwordHash,
        role: AdminUserRole.owner,
        isActive: true,
      },
    });

    await tx.adminProfile.upsert({
      where: { username: DEFAULT_ADMIN_USERNAME },
      update: {
        firstName: DEFAULT_ADMIN_FIRST_NAME,
        lastName: DEFAULT_ADMIN_LAST_NAME,
        phone: DEFAULT_ADMIN_PHONE,
      },
      create: {
        username: DEFAULT_ADMIN_USERNAME,
        firstName: DEFAULT_ADMIN_FIRST_NAME,
        lastName: DEFAULT_ADMIN_LAST_NAME,
        phone: DEFAULT_ADMIN_PHONE,
        avatarUrl: null,
      },
    });

    return user;
  });

  console.log(`Ensured default admin in DB: ${admin.username}`);
  return admin;
}

async function ensureBaseRestaurant() {
  const activeRestaurant = await prisma.restaurant.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: "asc" },
  });

  if (activeRestaurant) {
    const shouldUpdateLegacySlug = await canReplaceLegacySlug(
      activeRestaurant.id,
      activeRestaurant.slug,
    );

    if (activeRestaurant.name === "Dordoi Food" || shouldUpdateLegacySlug) {
      const updated = await prisma.restaurant.update({
        where: { id: activeRestaurant.id },
        data: {
          name:
            activeRestaurant.name === "Dordoi Food"
              ? DEFAULT_RESTAURANT_NAME
              : activeRestaurant.name,
          ...(shouldUpdateLegacySlug ? { slug: DEFAULT_RESTAURANT_SLUG } : {}),
        },
      });
      console.log(`Updated restaurant brand: ${updated.slug}`);
      return updated;
    }
    console.log(`Active restaurant already exists: ${activeRestaurant.slug}`);
    return activeRestaurant;
  }

  const restaurant = await prisma.restaurant.create({
    data: {
      slug: DEFAULT_RESTAURANT_SLUG,
      name: DEFAULT_RESTAURANT_NAME,
      qrImageUrl: "/qr/demo-restaurant.png",
      isActive: true,
    },
  });

  console.log(`Created empty restaurant: ${restaurant.slug}`);
  return restaurant;
}

async function main() {
  await ensureDefaultAdmin();
  await ensureBaseRestaurant();
  console.log("Seed completed without creating test menu items");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
