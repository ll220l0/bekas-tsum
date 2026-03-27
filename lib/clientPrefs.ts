export type SavedOrderLine = {
  menuItemId: string;
  title: string;
  photoUrl: string;
  priceKgs: number;
  qty: number;
};

export type OrderHistoryEntry = {
  orderId: string;
  restaurantSlug: string;
  customerPhone: string;
  totalKgs: number;
  createdAt: string;
  lines: SavedOrderLine[];
};

export type SavedLocation = {
  market: string;
  line: string;
  container: string;
};

const PHONE_COOKIE = "dordoi_phone";
const PAYER_NAME_COOKIE = "dordoi_payer_name";
const HISTORY_COOKIE = "dordoi_order_history";
const HISTORY_STORAGE_KEY = "dordoi_order_history";
const PENDING_PAY_ORDER_KEY = "dordoi_pending_pay_order_id";
const PENDING_PAY_ORDER_COOKIE = "dordoi_pending_pay_order_id_cookie";
const ACTIVE_ORDER_KEY = "dordoi_active_order_id";
const ACTIVE_ORDER_COOKIE = "dordoi_active_order_id_cookie";
const LOCATION_COOKIE = "dordoi_last_location";
const COOKIE_DAYS = 120;
const HISTORY_LIMIT = 8;

function isBrowser() {
  return typeof document !== "undefined";
}

function getCookie(name: string) {
  if (!isBrowser()) return "";
  const entry = document.cookie.split("; ").find((item) => item.startsWith(`${name}=`));
  return entry ? decodeURIComponent(entry.slice(name.length + 1)) : "";
}

function setCookie(name: string, value: string, days = COOKIE_DAYS) {
  if (!isBrowser()) return;
  const expires = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`;
}

function removeCookie(name: string) {
  if (!isBrowser()) return;
  document.cookie = `${name}=; expires=${new Date(0).toUTCString()}; path=/; SameSite=Lax`;
}

function safeParse<T>(value: string, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function getSavedPhone() {
  return getCookie(PHONE_COOKIE);
}

export function setSavedPhone(phone: string) {
  setCookie(PHONE_COOKIE, phone);
}

export function getSavedPayerName() {
  return getCookie(PAYER_NAME_COOKIE);
}

export function setSavedPayerName(name: string) {
  const normalized = name.trim().slice(0, 60);
  if (!normalized) return;
  setCookie(PAYER_NAME_COOKIE, normalized);
}

export function getOrderHistory() {
  if (typeof window !== "undefined") {
    const localRaw = window.localStorage.getItem(HISTORY_STORAGE_KEY);
    if (localRaw) return safeParse<OrderHistoryEntry[]>(localRaw, []);
  }
  return safeParse<OrderHistoryEntry[]>(getCookie(HISTORY_COOKIE), []);
}

export function getOrderHistoryEntry(orderId: string) {
  return getOrderHistory().find((entry) => entry.orderId === orderId) ?? null;
}

export function addOrderToHistory(entry: OrderHistoryEntry) {
  const next = [entry, ...getOrderHistory()]
    .filter((item, index, arr) => arr.findIndex((x) => x.orderId === item.orderId) === index)
    .slice(0, HISTORY_LIMIT);
  if (typeof window !== "undefined") {
    window.localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(next));
  } else {
    setCookie(HISTORY_COOKIE, JSON.stringify(next));
  }
}

export function removeOrderFromHistory(orderId: string) {
  const next = getOrderHistory().filter((entry) => entry.orderId !== orderId);
  if (typeof window !== "undefined") {
    window.localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(next));
  } else {
    setCookie(HISTORY_COOKIE, JSON.stringify(next));
  }
}

export function getLastOrderId() {
  return getOrderHistory()[0]?.orderId ?? null;
}

export function getPendingPayOrderId() {
  if (typeof window === "undefined") return null;
  const localValue = window.localStorage.getItem(PENDING_PAY_ORDER_KEY)?.trim() ?? "";
  if (localValue) return localValue;
  const cookieValue = getCookie(PENDING_PAY_ORDER_COOKIE).trim();
  return cookieValue || null;
}

export function setPendingPayOrderId(orderId: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PENDING_PAY_ORDER_KEY, orderId);
  setCookie(PENDING_PAY_ORDER_COOKIE, orderId);
}

export function clearPendingPayOrderId(orderId?: string) {
  if (typeof window === "undefined") return;
  if (!orderId) {
    window.localStorage.removeItem(PENDING_PAY_ORDER_KEY);
    removeCookie(PENDING_PAY_ORDER_COOKIE);
    return;
  }

  const currentLocal = window.localStorage.getItem(PENDING_PAY_ORDER_KEY);
  if (currentLocal === orderId) {
    window.localStorage.removeItem(PENDING_PAY_ORDER_KEY);
  }
  const currentCookie = getCookie(PENDING_PAY_ORDER_COOKIE);
  if (currentCookie === orderId) {
    removeCookie(PENDING_PAY_ORDER_COOKIE);
  }
}

export function getActiveOrderId() {
  if (typeof window === "undefined") return null;
  const localValue = window.localStorage.getItem(ACTIVE_ORDER_KEY)?.trim() ?? "";
  if (localValue) return localValue;
  const cookieValue = getCookie(ACTIVE_ORDER_COOKIE).trim();
  return cookieValue || null;
}

export function setActiveOrderId(orderId: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ACTIVE_ORDER_KEY, orderId);
  setCookie(ACTIVE_ORDER_COOKIE, orderId);
}

export function clearActiveOrderId(orderId?: string) {
  if (typeof window === "undefined") return;
  if (!orderId) {
    window.localStorage.removeItem(ACTIVE_ORDER_KEY);
    removeCookie(ACTIVE_ORDER_COOKIE);
    return;
  }

  const currentLocal = window.localStorage.getItem(ACTIVE_ORDER_KEY);
  if (currentLocal === orderId) {
    window.localStorage.removeItem(ACTIVE_ORDER_KEY);
  }
  const currentCookie = getCookie(ACTIVE_ORDER_COOKIE);
  if (currentCookie === orderId) {
    removeCookie(ACTIVE_ORDER_COOKIE);
  }
}

export function getSavedLocation(): SavedLocation {
  const parsed = safeParse<Partial<SavedLocation>>(getCookie(LOCATION_COOKIE), {});
  return {
    market: typeof parsed.market === "string" ? parsed.market : "Дордой",
    line: typeof parsed.line === "string" ? parsed.line : "",
    container: typeof parsed.container === "string" ? parsed.container : "",
  };
}

export function setSavedLocation(location: SavedLocation) {
  const market = location.market.trim() || "Дордой";
  const line = location.line.trim();
  const container = location.container.trim();
  if (!line && !container) return;
  setCookie(LOCATION_COOKIE, JSON.stringify({ market, line, container }));
}

export function getFrequentMenuItems(restaurantSlug: string) {
  const counters = new Map<string, number>();

  for (const order of getOrderHistory()) {
    if (order.restaurantSlug !== restaurantSlug) continue;
    for (const line of order.lines) {
      counters.set(line.menuItemId, (counters.get(line.menuItemId) ?? 0) + line.qty);
    }
  }

  return [...counters.entries()]
    .map(([menuItemId, qty]) => ({ menuItemId, qty }))
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 4);
}

const SAVED_ADDRESSES_KEY = "dordoi_saved_addresses";
const SAVED_ADDRESSES_LIMIT = 3;

export type SavedAddress = { market: string; line: string; container: string; label?: string };

export function getSavedAddresses(): SavedAddress[] {
  if (typeof window === "undefined") return [];
  const raw = window.localStorage.getItem(SAVED_ADDRESSES_KEY);
  return safeParse<SavedAddress[]>(raw ?? "", []).filter(
    (a) => a.market?.trim() || a.line?.trim() || a.container?.trim(),
  );
}

export function addSavedAddress(addr: SavedAddress) {
  if (typeof window === "undefined") return;
  const market = addr.market.trim() || "Дордой";
  const line = addr.line.trim();
  const container = addr.container.trim();
  if (!line && !container) return;
  const existing = getSavedAddresses().filter(
    (a) => !(a.market === market && a.line === line && a.container === container),
  );
  const next = [{ market, line, container }, ...existing].slice(0, SAVED_ADDRESSES_LIMIT);
  window.localStorage.setItem(SAVED_ADDRESSES_KEY, JSON.stringify(next));
}
