import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Неизвестная ошибка";
}

export async function GET() {
  const requiredEnv = ["DATABASE_URL"] as const;
  const env = Object.fromEntries(
    requiredEnv.map((key) => [key, Boolean(process.env[key])]),
  ) as Record<string, boolean>;
  const missingEnv = requiredEnv.filter((key) => !process.env[key]);

  let dbOk = false;
  let dbError: string | null = null;

  if (process.env.DATABASE_URL) {
    try {
      await prisma.$queryRaw`SELECT 1`;
      dbOk = true;
    } catch (error: unknown) {
      dbError = toErrorMessage(error);
    }
  } else {
    dbError = "Отсутствует переменная DATABASE_URL";
  }

  const ok = missingEnv.length === 0 && dbOk;
  const status = ok ? 200 : 503;

  return NextResponse.json(
    {
      ok,
      env,
      missingEnv,
      db: { ok: dbOk, error: dbError },
      timestamp: new Date().toISOString()
    },
    { status }
  );
}
