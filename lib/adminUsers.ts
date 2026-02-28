import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { AdminUserRole, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isAdminRole, listAdminAccounts, type AdminRole } from "@/lib/adminSession";

export type StaffProfileFields = {
  firstName: string;
  lastName: string;
  phone: string;
  avatarUrl: string | null;
};

export type ManagedAdminUser = {
  id: string;
  user: string;
  role: AdminRole;
  createdAt: string;
} & StaffProfileFields;

const PASSWORD_SALT_BYTES = 16;
const PASSWORD_KEY_LENGTH = 64;
const HASH_PREFIX = "scrypt";

function toDbRole(role: AdminRole): AdminUserRole {
  if (role === "owner") return AdminUserRole.owner;
  if (role === "operator") return AdminUserRole.operator;
  return AdminUserRole.courier;
}

function fromDbRole(role: AdminUserRole): AdminRole {
  if (role === AdminUserRole.owner) return "owner";
  if (role === AdminUserRole.operator) return "operator";
  return "courier";
}

function normalizeText(input: string) {
  return input.trim();
}

function normalizePhone(input: string) {
  return input.replace(/\D/g, "");
}

function normalizeAvatarUrl(input?: string | null) {
  const raw = (input ?? "").trim();
  if (!raw) return null;
  if (raw.length > 500) throw new Error("\u0421\u0441\u044b\u043b\u043a\u0430 \u043d\u0430 \u0430\u0432\u0430\u0442\u0430\u0440 \u0441\u043b\u0438\u0448\u043a\u043e\u043c \u0434\u043b\u0438\u043d\u043d\u0430\u044f");

  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("\u0410\u0432\u0430\u0442\u0430\u0440: \u0438\u0441\u043f\u043e\u043b\u044c\u0437\u0443\u0439\u0442\u0435 \u0441\u0441\u044b\u043b\u043a\u0443 http/https");
    }
    return url.toString();
  } catch {
    throw new Error("\u041d\u0435\u043a\u043e\u0440\u0440\u0435\u043a\u0442\u043d\u0430\u044f \u0441\u0441\u044b\u043b\u043a\u0430 \u043d\u0430 \u0430\u0432\u0430\u0442\u0430\u0440");
  }
}

function ensureProfileFields(value: Partial<StaffProfileFields> | undefined): StaffProfileFields {
  return {
    firstName: value?.firstName?.trim() ?? "",
    lastName: value?.lastName?.trim() ?? "",
    phone: value?.phone?.trim() ?? "",
    avatarUrl: value?.avatarUrl?.trim() ? value.avatarUrl : null
  };
}

export function normalizeAdminUsername(input: string) {
  return normalizeText(input);
}

export function validateStaffProfileInput(firstName: string, lastName: string, phone: string) {
  const fn = normalizeText(firstName);
  const ln = normalizeText(lastName);
  const phoneDigits = normalizePhone(phone);

  if (!fn) return { ok: false as const, error: "\u0423\u043a\u0430\u0436\u0438\u0442\u0435 \u0438\u043c\u044f" };
  if (fn.length < 2 || fn.length > 40) return { ok: false as const, error: "\u0418\u043c\u044f: \u043e\u0442 2 \u0434\u043e 40 \u0441\u0438\u043c\u0432\u043e\u043b\u043e\u0432" };

  if (!ln) return { ok: false as const, error: "\u0423\u043a\u0430\u0436\u0438\u0442\u0435 \u0444\u0430\u043c\u0438\u043b\u0438\u044e" };
  if (ln.length < 2 || ln.length > 40) return { ok: false as const, error: "\u0424\u0430\u043c\u0438\u043b\u0438\u044f: \u043e\u0442 2 \u0434\u043e 40 \u0441\u0438\u043c\u0432\u043e\u043b\u043e\u0432" };

  if (!/^996\d{9}$/.test(phoneDigits)) {
    return { ok: false as const, error: "\u041d\u043e\u043c\u0435\u0440: \u0444\u043e\u0440\u043c\u0430\u0442 996XXXXXXXXX" };
  }

  return { ok: true as const, firstName: fn, lastName: ln, phone: phoneDigits };
}

export function validateManagedAdminInput(input: {
  username: string;
  password: string;
  role: string;
  firstName: string;
  lastName: string;
  phone: string;
}) {
  const user = normalizeAdminUsername(input.username);
  const roleOk = isAdminRole(input.role);

  if (!user) return { ok: false as const, error: "\u0423\u043a\u0430\u0436\u0438\u0442\u0435 \u043b\u043e\u0433\u0438\u043d" };
  if (user.length < 3 || user.length > 48) return { ok: false as const, error: "\u041b\u043e\u0433\u0438\u043d: \u043e\u0442 3 \u0434\u043e 48 \u0441\u0438\u043c\u0432\u043e\u043b\u043e\u0432" };
  if (!/^[a-zA-Z0-9._-]+$/.test(user)) return { ok: false as const, error: "\u041b\u043e\u0433\u0438\u043d: \u0442\u043e\u043b\u044c\u043a\u043e \u043b\u0430\u0442\u0438\u043d\u0438\u0446\u0430, \u0446\u0438\u0444\u0440\u044b, ., _, -" };
  if (input.password.length < 6) return { ok: false as const, error: "\u041f\u0430\u0440\u043e\u043b\u044c: \u043c\u0438\u043d\u0438\u043c\u0443\u043c 6 \u0441\u0438\u043c\u0432\u043e\u043b\u043e\u0432" };
  if (!roleOk) return { ok: false as const, error: "\u041d\u0435\u043a\u043e\u0440\u0440\u0435\u043a\u0442\u043d\u0430\u044f \u0440\u043e\u043b\u044c" };

  const profileCheck = validateStaffProfileInput(input.firstName, input.lastName, input.phone);
  if (!profileCheck.ok) return profileCheck;

  return {
    ok: true as const,
    user,
    role: input.role as AdminRole,
    firstName: profileCheck.firstName,
    lastName: profileCheck.lastName,
    phone: profileCheck.phone
  };
}

function hashPassword(password: string) {
  const salt = randomBytes(PASSWORD_SALT_BYTES);
  const derived = scryptSync(password, salt, PASSWORD_KEY_LENGTH);
  return `${HASH_PREFIX}$${salt.toString("base64")}$${derived.toString("base64")}`;
}

function verifyPassword(password: string, hashValue: string) {
  const [prefix, saltB64, hashB64] = hashValue.split("$");
  if (prefix !== HASH_PREFIX || !saltB64 || !hashB64) return false;

  const salt = Buffer.from(saltB64, "base64");
  const expected = Buffer.from(hashB64, "base64");
  if (!salt.length || !expected.length) return false;

  const actual = scryptSync(password, salt, expected.length);
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

async function getProfilesMap(usernames: string[]) {
  if (usernames.length === 0) return new Map<string, StaffProfileFields>();

  const profiles = await prisma.adminProfile.findMany({
    where: { username: { in: usernames } }
  });

  const map = new Map<string, StaffProfileFields>();
  for (const profile of profiles) {
    map.set(profile.username, {
      firstName: profile.firstName,
      lastName: profile.lastName,
      phone: profile.phone,
      avatarUrl: profile.avatarUrl ?? null
    });
  }

  return map;
}

function readProfile(map: Map<string, StaffProfileFields>, username: string): StaffProfileFields {
  return ensureProfileFields(map.get(username));
}

export async function listAdminProfilesByUsernames(usernames: string[]) {
  const unique = [...new Set(usernames.filter(Boolean))];
  const map = await getProfilesMap(unique);
  const out = new Map<string, StaffProfileFields>();

  for (const username of unique) {
    out.set(username, readProfile(map, username));
  }

  return out;
}

export async function hasDatabaseAdminUsers() {
  const count = await prisma.adminUser.count({ where: { isActive: true } });
  return count > 0;
}

export async function listDatabaseAdminUsers(): Promise<ManagedAdminUser[]> {
  const users = await prisma.adminUser.findMany({
    where: { isActive: true },
    orderBy: [{ role: "asc" }, { username: "asc" }]
  });

  const profiles = await getProfilesMap(users.map((user) => user.username));

  return users.map((user) => {
    const profile = readProfile(profiles, user.username);
    return {
      id: user.id,
      user: user.username,
      role: fromDbRole(user.role),
      createdAt: user.createdAt.toISOString(),
      ...profile
    };
  });
}

export async function createDatabaseAdminUser(input: {
  username: string;
  password: string;
  role: AdminRole;
  firstName: string;
  lastName: string;
  phone: string;
}) {
  const username = normalizeAdminUsername(input.username);
  const passwordHash = hashPassword(input.password);

  const created = await prisma.$transaction(async (tx) => {
    const user = await tx.adminUser.create({
      data: {
        username,
        passwordHash,
        role: toDbRole(input.role)
      }
    });

    await tx.adminProfile.upsert({
      where: { username },
      update: {
        firstName: input.firstName,
        lastName: input.lastName,
        phone: input.phone
      },
      create: {
        username,
        firstName: input.firstName,
        lastName: input.lastName,
        phone: input.phone,
        avatarUrl: null
      }
    });

    return user;
  });

  return {
    id: created.id,
    user: created.username,
    role: fromDbRole(created.role),
    createdAt: created.createdAt.toISOString(),
    firstName: input.firstName,
    lastName: input.lastName,
    phone: input.phone,
    avatarUrl: null
  } satisfies ManagedAdminUser;
}

export async function updateDatabaseAdminUserRole(userId: string, role: AdminRole) {
  const existing = await prisma.adminUser.findUnique({ where: { id: userId } });
  if (!existing || !existing.isActive) return null;

  const currentRole = fromDbRole(existing.role);
  if (currentRole !== role) {
    if (currentRole === "owner" && role !== "owner") {
      const envOwners = listAdminAccounts().filter((x) => x.role === "owner").length;
      const dbOwners = await prisma.adminUser.count({
        where: {
          id: { not: userId },
          isActive: true,
          role: AdminUserRole.owner
        }
      });

      if (envOwners + dbOwners < 1) {
        throw new Error("\u041d\u0435\u043b\u044c\u0437\u044f \u0441\u043d\u044f\u0442\u044c \u0440\u043e\u043b\u044c \u0432\u043b\u0430\u0434\u0435\u043b\u044c\u0446\u0430 \u0443 \u043f\u043e\u0441\u043b\u0435\u0434\u043d\u0435\u0433\u043e \u0432\u043b\u0430\u0434\u0435\u043b\u044c\u0446\u0430");
      }
    }

    await prisma.adminUser.update({
      where: { id: userId },
      data: { role: toDbRole(role) }
    });
  }

  const refreshed = await prisma.adminUser.findUnique({ where: { id: userId } });
  if (!refreshed) return null;

  const profiles = await getProfilesMap([refreshed.username]);
  const profile = readProfile(profiles, refreshed.username);

  return {
    id: refreshed.id,
    user: refreshed.username,
    role: fromDbRole(refreshed.role),
    createdAt: refreshed.createdAt.toISOString(),
    ...profile
  } satisfies ManagedAdminUser;
}

export async function upsertAdminProfileByUsername(
  usernameInput: string,
  input: {
    firstName: string;
    lastName: string;
    phone: string;
    avatarUrl?: string | null;
  }
): Promise<StaffProfileFields> {
  const username = normalizeAdminUsername(usernameInput);
  if (!username) throw new Error("\u041d\u0435\u043a\u043e\u0440\u0440\u0435\u043a\u0442\u043d\u044b\u0439 \u043f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u044c");

  const profileCheck = validateStaffProfileInput(input.firstName, input.lastName, input.phone);
  if (!profileCheck.ok) throw new Error(profileCheck.error);

  const current = await prisma.adminProfile.findUnique({ where: { username } });
  const avatarUrl = input.avatarUrl === undefined ? current?.avatarUrl ?? null : normalizeAvatarUrl(input.avatarUrl);

  const profile = await prisma.adminProfile.upsert({
    where: { username },
    update: {
      firstName: profileCheck.firstName,
      lastName: profileCheck.lastName,
      phone: profileCheck.phone,
      avatarUrl
    },
    create: {
      username,
      firstName: profileCheck.firstName,
      lastName: profileCheck.lastName,
      phone: profileCheck.phone,
      avatarUrl
    }
  });

  return {
    firstName: profile.firstName,
    lastName: profile.lastName,
    phone: profile.phone,
    avatarUrl: profile.avatarUrl ?? null
  };
}

export async function authenticateDatabaseAdminUser(inputUser: string, inputPass: string): Promise<{ user: string; role: AdminRole } | null> {
  const user = normalizeAdminUsername(inputUser);
  if (!user || !inputPass) return null;

  const dbUser = await prisma.adminUser.findUnique({ where: { username: user } });
  if (!dbUser || !dbUser.isActive) return null;
  if (!verifyPassword(inputPass, dbUser.passwordHash)) return null;

  return {
    user: dbUser.username,
    role: fromDbRole(dbUser.role)
  };
}

export function isUniqueViolation(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}