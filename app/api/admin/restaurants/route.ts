import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { requireAdminRole } from "@/lib/adminAuth";
import { authenticateDatabaseAdminUser } from "@/lib/adminUsers";
import { prisma } from "@/lib/prisma";
import { ensureActiveRestaurant, getRestaurantDisplayName } from "@/lib/restaurant";

const BANK_NUMBER_RE = /^996\d{9}$/;

function toDigits(value: string | null | undefined) {
  return (value ?? "").replace(/[^\d]/g, "");
}

function validateBankNumber(value: string | null | undefined) {
  const digits = toDigits(value);
  if (!digits) return null;
  if (!BANK_NUMBER_RE.test(digits)) return null;
  return digits;
}

export async function GET() {
  const auth = await requireAdminRole(["owner", "operator", "courier"]);
  if ("response" in auth) return auth.response;

  await ensureActiveRestaurant();
  const restaurants = await prisma.restaurant.findMany({
    where: { isActive: true },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({
    restaurants: restaurants.map((r) => ({
      id: r.id,
      name: getRestaurantDisplayName(r.name),
      slug: r.slug,
      mbankNumber: r.mbankNumber ?? "",
      obankNumber: r.obankNumber ?? "",
      bakaiNumber: r.bakaiNumber ?? "",
    })),
  });
}

export async function PATCH(req: Request) {
  const auth = await requireAdminRole(["owner"]);
  if ("response" in auth) return auth.response;

  const body = (await req.json().catch(() => null)) as {
    slug?: string;
    mbankNumber?: string | null;
    obankNumber?: string | null;
    bakaiNumber?: string | null;
    bankPassword?: string;
  } | null;

  const slug = body?.slug?.trim();
  const bankPassword = body?.bankPassword?.trim() ?? "";

  const hasMbankUpdate = Object.prototype.hasOwnProperty.call(body ?? {}, "mbankNumber");
  const hasObankUpdate = Object.prototype.hasOwnProperty.call(body ?? {}, "obankNumber");
  const hasBakaiUpdate = Object.prototype.hasOwnProperty.call(body ?? {}, "bakaiNumber");
  const hasBankNumbersUpdate = hasMbankUpdate || hasObankUpdate || hasBakaiUpdate;

  if (!slug) {
    return NextResponse.json({ error: "Требуется slug ресторана" }, { status: 400 });
  }

  if (!hasBankNumbersUpdate) {
    return NextResponse.json({ error: "Нет данных для обновления" }, { status: 400 });
  }

  if (!bankPassword) {
    return NextResponse.json({ error: "Введите текущий пароль владельца" }, { status: 400 });
  }

  const identity = await authenticateDatabaseAdminUser(auth.session.user, bankPassword);
  if (!identity || identity.role !== "owner") {
    return NextResponse.json(
      { error: "Неверный текущий пароль владельца" },
      { status: 403 },
    );
  }

  const data: Prisma.RestaurantUpdateInput = {};

  if (hasMbankUpdate) {
    const parsed = validateBankNumber(body?.mbankNumber);
    if (body?.mbankNumber && !parsed) {
      return NextResponse.json(
        { error: "Некорректный номер Mbank. Используйте формат 996XXXXXXXXX" },
        { status: 400 },
      );
    }
    data.mbankNumber = parsed;
  }
  if (hasObankUpdate) {
    const parsed = validateBankNumber(body?.obankNumber);
    if (body?.obankNumber && !parsed) {
      return NextResponse.json(
        { error: "Некорректный номер O bank. Используйте формат 996XXXXXXXXX" },
        { status: 400 },
      );
    }
    data.obankNumber = parsed;
  }
  if (hasBakaiUpdate) {
    const parsed = validateBankNumber(body?.bakaiNumber);
    if (body?.bakaiNumber && !parsed) {
      return NextResponse.json(
        { error: "Некорректный номер Bakai. Используйте формат 996XXXXXXXXX" },
        { status: 400 },
      );
    }
    data.bakaiNumber = parsed;
  }

  const updated = await prisma.restaurant.update({
    where: { slug },
    data,
  });

  return NextResponse.json({
    ok: true,
    restaurant: {
      id: updated.id,
      slug: updated.slug,
      mbankNumber: updated.mbankNumber ?? "",
      obankNumber: updated.obankNumber ?? "",
      bakaiNumber: updated.bakaiNumber ?? "",
    },
  });
}
