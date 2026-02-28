import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { AdminUserRole, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isAdminRole, listAdminAccounts, type AdminRole } from "@/lib/adminSession";

export type ManagedAdminUser = {
  id: string;
  user: string;
  role: AdminRole;
  createdAt: string;
};

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

export function normalizeAdminUsername(input: string) {
  return input.trim();
}

export function validateManagedAdminInput(username: string, password: string, role: string) {
  const user = normalizeAdminUsername(username);
  const roleOk = isAdminRole(role);

  if (!user) return { ok: false as const, error: "Укажите логин" };
  if (user.length < 3 || user.length > 48) return { ok: false as const, error: "Логин: от 3 до 48 символов" };
  if (!/^[a-zA-Z0-9._-]+$/.test(user)) return { ok: false as const, error: "Логин: только латиница, цифры, ., _, -" };
  if (password.length < 6) return { ok: false as const, error: "Пароль: минимум 6 символов" };
  if (!roleOk) return { ok: false as const, error: "Некорректная роль" };

  return { ok: true as const, user, role };
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

export async function hasDatabaseAdminUsers() {
  const count = await prisma.adminUser.count({ where: { isActive: true } });
  return count > 0;
}

export async function listDatabaseAdminUsers(): Promise<ManagedAdminUser[]> {
  const users = await prisma.adminUser.findMany({
    where: { isActive: true },
    orderBy: [{ role: "asc" }, { username: "asc" }]
  });

  return users.map((user) => ({
    id: user.id,
    user: user.username,
    role: fromDbRole(user.role),
    createdAt: user.createdAt.toISOString()
  }));
}

export async function createDatabaseAdminUser(input: { username: string; password: string; role: AdminRole }) {
  const username = normalizeAdminUsername(input.username);
  const passwordHash = hashPassword(input.password);

  const created = await prisma.adminUser.create({
    data: {
      username,
      passwordHash,
      role: toDbRole(input.role)
    }
  });

  return {
    id: created.id,
    user: created.username,
    role: fromDbRole(created.role),
    createdAt: created.createdAt.toISOString()
  } satisfies ManagedAdminUser;
}

export async function updateDatabaseAdminUserRole(userId: string, role: AdminRole) {
  const existing = await prisma.adminUser.findUnique({ where: { id: userId } });
  if (!existing || !existing.isActive) return null;

  const currentRole = fromDbRole(existing.role);
  if (currentRole === role) {
    return {
      id: existing.id,
      user: existing.username,
      role: currentRole,
      createdAt: existing.createdAt.toISOString()
    } satisfies ManagedAdminUser;
  }

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
      throw new Error("Нельзя снять роль владельца у последнего владельца");
    }
  }

  const updated = await prisma.adminUser.update({
    where: { id: userId },
    data: { role: toDbRole(role) }
  });

  return {
    id: updated.id,
    user: updated.username,
    role: fromDbRole(updated.role),
    createdAt: updated.createdAt.toISOString()
  } satisfies ManagedAdminUser;
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
