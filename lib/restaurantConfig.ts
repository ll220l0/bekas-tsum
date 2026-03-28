const LEGACY_DEFAULT_RESTAURANT_SLUG = "dordoi-food";

const configuredDefaultSlug = process.env.NEXT_PUBLIC_DEFAULT_RESTAURANT_SLUG?.trim();

export const DEFAULT_RESTAURANT_SLUG =
  configuredDefaultSlug && configuredDefaultSlug.length > 0
    ? configuredDefaultSlug
    : LEGACY_DEFAULT_RESTAURANT_SLUG;

export { LEGACY_DEFAULT_RESTAURANT_SLUG };
