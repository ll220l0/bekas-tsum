import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const menuItemBaseSelect = {
  id: true,
  restaurantId: true,
  categoryId: true,
  title: true,
  description: true,
  photoUrl: true,
  priceKgs: true,
  isAvailable: true,
  sortOrder: true,
} satisfies Prisma.MenuItemSelect;

const menuItemWithVariantsSelect = {
  ...menuItemBaseSelect,
  variantGroupId: true,
  variantGroupTitle: true,
  variantLabel: true,
} satisfies Prisma.MenuItemSelect;

type LegacyMenuItemRecord = Prisma.MenuItemGetPayload<{ select: typeof menuItemBaseSelect }>;
export type CompatMenuItemRecord = Prisma.MenuItemGetPayload<{
  select: typeof menuItemWithVariantsSelect;
}>;

type SingleMenuItemData = {
  restaurantId: string;
  categoryId: string;
  title: string;
  description: string | null;
  photoUrl: string;
  priceKgs: number;
  isAvailable: boolean;
  sortOrder: number;
  variantGroupId: string | null;
  variantGroupTitle: string | null;
  variantLabel: string | null;
};

type SingleMenuItemUpdateData = Omit<SingleMenuItemData, "restaurantId" | "sortOrder">;

function withNullVariantFields(item: LegacyMenuItemRecord): CompatMenuItemRecord {
  return {
    ...item,
    variantGroupId: null,
    variantGroupTitle: null,
    variantLabel: null,
  };
}

function stripVariantFields<T extends Record<string, unknown>>(data: T) {
  const legacyData = { ...data };
  delete legacyData.variantGroupId;
  delete legacyData.variantGroupTitle;
  delete legacyData.variantLabel;
  return legacyData;
}

export function isVariantFieldsMissingError(error: unknown) {
  if (!(error instanceof Error)) return false;
  return /variantGroupId|variantGroupTitle|variantLabel|does not exist|Unknown column/i.test(
    error.message,
  );
}

async function withVariantFallback<T>(options: {
  withVariants: () => Promise<T>;
  withoutVariants: () => Promise<T>;
}) {
  try {
    return await options.withVariants();
  } catch (error) {
    if (!isVariantFieldsMissingError(error)) throw error;
    return options.withoutVariants();
  }
}

export async function listMenuItemsByRestaurant(restaurantId: string) {
  return withVariantFallback({
    withVariants: () =>
      prisma.menuItem.findMany({
        where: { restaurantId },
        orderBy: { sortOrder: "asc" },
        select: menuItemWithVariantsSelect,
      }),
    withoutVariants: async () =>
      (
        await prisma.menuItem.findMany({
          where: { restaurantId },
          orderBy: { sortOrder: "asc" },
          select: menuItemBaseSelect,
        })
      ).map(withNullVariantFields),
  });
}

export async function listMenuItemsByIds(restaurantId: string, ids: string[]) {
  return withVariantFallback({
    withVariants: () =>
      prisma.menuItem.findMany({
        where: { restaurantId, id: { in: ids } },
        orderBy: { sortOrder: "asc" },
        select: menuItemWithVariantsSelect,
      }),
    withoutVariants: async () =>
      (
        await prisma.menuItem.findMany({
          where: { restaurantId, id: { in: ids } },
          orderBy: { sortOrder: "asc" },
          select: menuItemBaseSelect,
        })
      ).map(withNullVariantFields),
  });
}

export async function getMenuItemById(id: string) {
  return withVariantFallback({
    withVariants: () =>
      prisma.menuItem.findUnique({
        where: { id },
        select: menuItemWithVariantsSelect,
      }),
    withoutVariants: async () => {
      const item = await prisma.menuItem.findUnique({
        where: { id },
        select: menuItemBaseSelect,
      });
      return item ? withNullVariantFields(item) : null;
    },
  });
}

export async function countMenuItemsInVariantGroup(variantGroupId: string) {
  try {
    return await prisma.menuItem.count({ where: { variantGroupId } });
  } catch (error) {
    if (!isVariantFieldsMissingError(error)) throw error;
    return 0;
  }
}

export async function listMenuItemsByVariantGroup(restaurantId: string, variantGroupId: string) {
  try {
    return await prisma.menuItem.findMany({
      where: { restaurantId, variantGroupId },
      orderBy: { sortOrder: "asc" },
      select: menuItemWithVariantsSelect,
    });
  } catch (error) {
    if (!isVariantFieldsMissingError(error)) throw error;
    return [] satisfies CompatMenuItemRecord[];
  }
}

export async function createSingleMenuItem(data: SingleMenuItemData) {
  try {
    return await prisma.menuItem.create({ data });
  } catch (error) {
    if (!isVariantFieldsMissingError(error)) throw error;
    return prisma.menuItem.create({ data: stripVariantFields(data) });
  }
}

export async function updateSingleMenuItem(id: string, data: SingleMenuItemUpdateData) {
  try {
    return await prisma.menuItem.update({ where: { id }, data });
  } catch (error) {
    if (!isVariantFieldsMissingError(error)) throw error;
    return prisma.menuItem.update({ where: { id }, data: stripVariantFields(data) });
  }
}
