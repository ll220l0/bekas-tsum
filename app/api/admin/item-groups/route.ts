import { NextResponse } from "next/server";
import { requireAdminRole } from "@/lib/adminAuth";
import { prisma } from "@/lib/prisma";
import { DeleteItemGroupSchema } from "@/lib/validators";

export async function DELETE(req: Request) {
  const auth = await requireAdminRole(["owner", "operator"]);
  if ("response" in auth) return auth.response;

  const body = await req.json().catch(() => null);
  const parsed = DeleteItemGroupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Некорректные данные запроса", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const ids = Array.from(new Set(parsed.data.ids));
  const items = await prisma.menuItem.findMany({
    where: { id: { in: ids } },
    select: { id: true },
  });
  if (items.length !== ids.length) {
    return NextResponse.json({ error: "Часть вариантов не найдена" }, { status: 404 });
  }

  const ordersCount = await prisma.orderItem.count({
    where: { menuItemId: { in: ids } },
  });
  if (ordersCount > 0) {
    return NextResponse.json(
      { error: "Нельзя удалить модель с историей заказов. Сделайте варианты недоступными." },
      { status: 409 },
    );
  }

  await prisma.menuItem.deleteMany({ where: { id: { in: ids } } });
  return NextResponse.json({ ok: true, deleted: ids.length });
}
