export type MenuCategoryLike = {
  id: string;
  title: string;
  sortOrder: number;
};

export type VariantCapableMenuItem = {
  id: string;
  categoryId: string;
  title: string;
  description?: string;
  photoUrl: string;
  priceKgs: number;
  isAvailable: boolean;
  sortOrder?: number;
  variantGroupId?: string | null;
  variantGroupTitle?: string | null;
  variantLabel?: string | null;
};

export type MenuVariant<T extends VariantCapableMenuItem> = T & {
  resolvedVariantLabel: string;
};

export type MenuDisplayEntry<T extends VariantCapableMenuItem> =
  | { type: "item"; key: string; item: T }
  | {
      type: "group";
      key: string;
      title: string;
      description: string;
      photoUrl: string;
      variants: MenuVariant<T>[];
      sourceIds: string[];
      explicit: boolean;
      groupId?: string | null;
    };

export type MenuDisplayCategory<
  TCategory extends MenuCategoryLike,
  TItem extends VariantCapableMenuItem,
> = {
  category: TCategory;
  entries: MenuDisplayEntry<TItem>[];
};

const DRINKS_CATEGORY_TITLES = new Set(["Напитки"]);
const LEGACY_VARIANT_SUFFIX_RE = /\s+(1,5л|1л|0,5л|ж\/б)$/i;

export function normalizeVariantLabel(label: string) {
  const normalized = label.trim();
  return normalized.toLowerCase() === "ж/б" ? "ж/б" : normalized;
}

export function buildVariantItemTitle(groupTitle: string, variantLabel: string) {
  return `${groupTitle.trim()} ${normalizeVariantLabel(variantLabel)}`.trim();
}

export function parseLegacyVariantTitle(title: string) {
  const match = title.match(LEGACY_VARIANT_SUFFIX_RE);
  if (!match) return null;

  return {
    groupTitle: title.slice(0, -match[0].length).trim(),
    variantLabel: normalizeVariantLabel(match[1]),
  };
}

export function getVariantSortOrder(label: string) {
  const normalized = normalizeVariantLabel(label).toLowerCase();
  if (normalized === "0,5л") return 0;
  if (normalized === "1л") return 1;
  if (normalized === "1,5л") return 2;
  if (normalized === "ж/б") return 3;
  return 9;
}

function compareVariants<T extends VariantCapableMenuItem>(
  left: MenuVariant<T>,
  right: MenuVariant<T>,
) {
  const orderDiff =
    getVariantSortOrder(left.resolvedVariantLabel) - getVariantSortOrder(right.resolvedVariantLabel);
  if (orderDiff !== 0) return orderDiff;

  const sortOrderDiff = (left.sortOrder ?? Number.MAX_SAFE_INTEGER) - (right.sortOrder ?? Number.MAX_SAFE_INTEGER);
  if (sortOrderDiff !== 0) return sortOrderDiff;

  const priceDiff = left.priceKgs - right.priceKgs;
  if (priceDiff !== 0) return priceDiff;

  return left.id.localeCompare(right.id);
}

function resolveGroupMeta<T extends VariantCapableMenuItem>(
  item: T,
  category: MenuCategoryLike,
) {
  if (item.variantGroupId && item.variantGroupTitle && item.variantLabel) {
    return {
      key: `group:${item.variantGroupId}`,
      groupId: item.variantGroupId,
      groupTitle: item.variantGroupTitle,
      variantLabel: normalizeVariantLabel(item.variantLabel),
      explicit: true,
    };
  }

  if (!DRINKS_CATEGORY_TITLES.has(category.title)) return null;

  const legacy = parseLegacyVariantTitle(item.title);
  if (!legacy) return null;

  return {
    key: `legacy:${category.id}:${legacy.groupTitle.toLowerCase()}`,
    groupId: null,
    groupTitle: legacy.groupTitle,
    variantLabel: legacy.variantLabel,
    explicit: false,
  };
}

export function groupMenuEntries<
  TCategory extends MenuCategoryLike,
  TItem extends VariantCapableMenuItem,
>(categories: TCategory[], items: TItem[]): Array<MenuDisplayCategory<TCategory, TItem>> {
  return categories
    .map((category) => {
      const categoryItems = items.filter((item) => item.categoryId === category.id);
      if (categoryItems.length === 0) {
        return { category, entries: [] as Array<MenuDisplayEntry<TItem>> };
      }

      const groups = new Map<
        string,
        {
          title: string;
          description: string;
          photoUrl: string;
          variants: Array<MenuVariant<TItem>>;
          explicit: boolean;
          groupId?: string | null;
        }
      >();
      const entries: Array<MenuDisplayEntry<TItem>> = [];

      for (const item of categoryItems) {
        const groupMeta = resolveGroupMeta(item, category);
        if (!groupMeta) {
          entries.push({ type: "item", key: `item:${item.id}`, item });
          continue;
        }

        const variant: MenuVariant<TItem> = {
          ...item,
          resolvedVariantLabel: groupMeta.variantLabel,
        };
        const existing = groups.get(groupMeta.key);
        if (existing) {
          existing.variants.push(variant);
          if (groupMeta.explicit && !existing.description && item.description) {
            existing.description = item.description;
          }
          if (!existing.photoUrl && item.photoUrl) existing.photoUrl = item.photoUrl;
          continue;
        }

        groups.set(groupMeta.key, {
          title: groupMeta.groupTitle,
          description: groupMeta.explicit ? item.description ?? "" : "",
          photoUrl: item.photoUrl,
          variants: [variant],
          explicit: groupMeta.explicit,
          groupId: groupMeta.groupId,
        });
        entries.push({
          type: "group",
          key: groupMeta.key,
          title: groupMeta.groupTitle,
          description: groupMeta.explicit ? item.description ?? "" : "",
          photoUrl: item.photoUrl,
          variants: [],
          sourceIds: [],
          explicit: groupMeta.explicit,
          groupId: groupMeta.groupId,
        });
      }

      const normalizedEntries: Array<MenuDisplayEntry<TItem>> = [];
      for (const entry of entries) {
        if (entry.type === "item") {
          normalizedEntries.push(entry);
          continue;
        }

        const group = groups.get(entry.key);
        if (!group) continue;

        const variants = [...group.variants].sort(compareVariants);
        if (variants.length < 2) {
          const [firstVariant] = variants;
          if (!firstVariant) continue;
          normalizedEntries.push({
            type: "item",
            key: `item:${firstVariant.id}`,
            item: { ...firstVariant } as TItem,
          });
          continue;
        }

        const preferredPhoto =
          variants.find((variant) => variant.photoUrl)?.photoUrl ?? group.photoUrl;
        normalizedEntries.push({
          type: "group",
          key: entry.key,
          title: group.title,
          description: group.description,
          photoUrl: preferredPhoto,
          variants,
          sourceIds: variants.map((variant) => variant.id),
          explicit: group.explicit,
          groupId: group.groupId,
        });
      }

      return { category, entries: normalizedEntries };
    })
    .filter((entry) => entry.entries.length > 0);
}
