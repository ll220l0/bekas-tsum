const encoder = new TextEncoder();
const decoder = new TextDecoder();

export const ADMIN_SESSION_COOKIE = "dordoi_admin_session";
export const ADMIN_SESSION_TTL_SECONDS = 60 * 60 * 24 * 14;

export const ADMIN_ROLES = ["owner", "operator", "courier"] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

export type AdminSessionIdentity = {
  user: string;
  role: AdminRole;
  exp: number;
};

type AdminSessionPayload = {
  u: string;
  r?: string;
  exp: number;
};

type AdminAccount = {
  user: string;
  pass: string;
  role: AdminRole;
};

export type AdminAccountPublic = {
  user: string;
  role: AdminRole;
};

function isNonEmpty(value: string | undefined | null) {
  return Boolean(value && value.trim().length > 0);
}

function getAdminAccounts(): AdminAccount[] {
  const accounts: AdminAccount[] = [];

  const ownerUser = process.env.ADMIN_USER?.trim() ?? "";
  const ownerPass = process.env.ADMIN_PASS?.trim() ?? "";
  if (ownerUser && ownerPass) {
    accounts.push({ user: ownerUser, pass: ownerPass, role: "owner" });
  }

  const operatorUser = process.env.ADMIN_OPERATOR_USER?.trim() ?? "";
  const operatorPass = process.env.ADMIN_OPERATOR_PASS?.trim() ?? "";
  if (operatorUser && operatorPass) {
    accounts.push({ user: operatorUser, pass: operatorPass, role: "operator" });
  }

  const courierUser = process.env.ADMIN_COURIER_USER?.trim() ?? "";
  const courierPass = process.env.ADMIN_COURIER_PASS?.trim() ?? "";
  if (courierUser && courierPass) {
    accounts.push({ user: courierUser, pass: courierPass, role: "courier" });
  }

  return accounts;
}

function getSessionSecret() {
  const explicit = process.env.ADMIN_SESSION_SECRET?.trim() ?? "";
  if (explicit) return explicit.slice(0, 512);

  const accounts = getAdminAccounts();
  const fallback = accounts.map((x) => `${x.user}:${x.pass}:${x.role}`).join("|") || "admin-session";
  return fallback.slice(0, 512);
}

function toBase64Url(bytes: Uint8Array) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  let out = "";

  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]!;
    const b = i + 1 < bytes.length ? bytes[i + 1]! : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2]! : 0;

    const n = (a << 16) | (b << 8) | c;

    out += alphabet[(n >> 18) & 63]!;
    out += alphabet[(n >> 12) & 63]!;
    if (i + 1 < bytes.length) out += alphabet[(n >> 6) & 63]!;
    if (i + 2 < bytes.length) out += alphabet[n & 63]!;
  }

  return out;
}

function fromBase64Url(input: string) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  const table = new Map<string, number>();
  for (let i = 0; i < alphabet.length; i += 1) table.set(alphabet[i]!, i);

  if (!input) return new Uint8Array(0);
  if (input.length % 4 === 1) return null;

  const bytes: number[] = [];
  let i = 0;
  while (i < input.length) {
    const c0 = table.get(input[i] ?? "");
    const c1 = table.get(input[i + 1] ?? "");
    if (c0 == null || c1 == null) return null;

    const c2Char = input[i + 2] ?? "";
    const c3Char = input[i + 3] ?? "";
    const c2 = c2Char ? table.get(c2Char) : undefined;
    const c3 = c3Char ? table.get(c3Char) : undefined;

    if (c2Char && c2 == null) return null;
    if (c3Char && c3 == null) return null;

    const n = (c0 << 18) | (c1 << 12) | ((c2 ?? 0) << 6) | (c3 ?? 0);
    bytes.push((n >> 16) & 255);
    if (c2Char) bytes.push((n >> 8) & 255);
    if (c3Char) bytes.push(n & 255);

    i += 4;
  }

  return new Uint8Array(bytes);
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

async function signValue(value: string, secret: string) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return toBase64Url(new Uint8Array(signature));
}

export function isAdminRole(value: unknown): value is AdminRole {
  return typeof value === "string" && (ADMIN_ROLES as readonly string[]).includes(value);
}

export function hasAdminCredentials() {
  return getAdminAccounts().length > 0;
}

export function listAdminAccounts(): AdminAccountPublic[] {
  return getAdminAccounts().map((account) => ({
    user: account.user,
    role: account.role
  }));
}

export function validateAdminPassword(inputUser: string, inputPass: string): Omit<AdminSessionIdentity, "exp"> | null {
  const user = inputUser.trim();
  if (!isNonEmpty(user) || !isNonEmpty(inputPass)) return null;

  const account = getAdminAccounts().find((x) => timingSafeEqual(user, x.user) && timingSafeEqual(inputPass, x.pass));
  if (!account) return null;

  return { user: account.user, role: account.role };
}

export async function createAdminSessionToken(identity: Omit<AdminSessionIdentity, "exp">) {
  if (!isNonEmpty(identity.user) || !isAdminRole(identity.role)) return null;

  const payload: AdminSessionPayload = {
    u: identity.user,
    r: identity.role,
    exp: Date.now() + ADMIN_SESSION_TTL_SECONDS * 1000
  };

  const payloadEncoded = toBase64Url(encoder.encode(JSON.stringify(payload)));
  const sig = await signValue(payloadEncoded, getSessionSecret());
  return `${payloadEncoded}.${sig}`;
}

export async function verifyAdminSessionToken(token: string): Promise<AdminSessionIdentity | null> {
  const [payloadEncoded, signature] = token.split(".");
  if (!payloadEncoded || !signature) return null;

  const expectedSig = await signValue(payloadEncoded, getSessionSecret());
  if (!timingSafeEqual(signature, expectedSig)) return null;

  const decoded = fromBase64Url(payloadEncoded);
  if (!decoded) return null;

  let payload: AdminSessionPayload;
  try {
    payload = JSON.parse(decoder.decode(decoded)) as AdminSessionPayload;
  } catch {
    return null;
  }

  if (!payload?.u || typeof payload.exp !== "number") return null;
  if (Date.now() >= payload.exp) return null;

  if (!isNonEmpty(payload.u)) return null;
  if (!isAdminRole(payload.r)) return null;

  return { user: payload.u, role: payload.r, exp: payload.exp };
}

