import { NextResponse } from "next/server";
import {
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_TTL_SECONDS,
  createAdminSessionToken,
  hasAdminCredentials,
  validateAdminPassword
} from "@/lib/adminSession";
import { authenticateDatabaseAdminUser, hasDatabaseAdminUsers } from "@/lib/adminUsers";

type LoginBody = {
  username?: string;
  password?: string;
};

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as LoginBody | null;
  const username = body?.username?.trim() ?? "";
  const password = body?.password ?? "";

  if (!username || !password) {
    return NextResponse.json({ error: "Введите логин и пароль" }, { status: 400 });
  }

  const dbIdentity = await authenticateDatabaseAdminUser(username, password);
  const envIdentity = dbIdentity ? null : validateAdminPassword(username, password);
  const identity = dbIdentity ?? envIdentity;

  if (!identity) {
    if (!hasAdminCredentials() && !(await hasDatabaseAdminUsers())) {
      return NextResponse.json({ error: "Учетные данные администратора не настроены" }, { status: 500 });
    }
    return NextResponse.json({ error: "Неверный логин или пароль" }, { status: 401 });
  }

  const token = await createAdminSessionToken(identity);
  if (!token) {
    return NextResponse.json({ error: "Не удалось создать сессию администратора" }, { status: 500 });
  }

  const res = NextResponse.json({ ok: true, role: identity.role, user: identity.user });
  res.cookies.set({
    name: ADMIN_SESSION_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ADMIN_SESSION_TTL_SECONDS
  });
  return res;
}
