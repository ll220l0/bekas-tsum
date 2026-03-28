import { NextResponse } from "next/server";
import { toApiError } from "@/lib/apiError";
import { expireStaleOrders } from "@/lib/orderLifecycle";
import { prisma } from "@/lib/prisma";

type MarkPaidBody = {
  payerName?: string;
};

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await expireStaleOrders();

    const { id } = await params;
    const body = (await req.json().catch(() => null)) as MarkPaidBody | null;
    const payerName = body?.payerName?.trim() ?? "";

    const order = await prisma.order.findUnique({ where: { id } });
    if (!order) return NextResponse.json({ error: "Заказ не найден" }, { status: 404 });
    if (order.paymentMethod === "cash") {
      return NextResponse.json({ error: "Это не банковский заказ" }, { status: 400 });
    }
    if (order.status === "canceled" || order.status === "delivered") {
      return NextResponse.json({ error: "Нельзя изменить статус этого заказа" }, { status: 400 });
    }
    if (payerName && payerName.length < 2) {
      return NextResponse.json({ error: "Укажите имя плательщика" }, { status: 400 });
    }

    const resolvedPayerName = payerName || order.payerName?.trim() || "";
    if (resolvedPayerName.length < 2) {
      return NextResponse.json({ error: "Укажите имя плательщика" }, { status: 400 });
    }

    const nextStatus = order.status === "created" ? "pending_confirmation" : order.status;

    const updated = await prisma.order.update({
      where: { id },
      data: {
        status: nextStatus,
        payerName: resolvedPayerName.slice(0, 60),
      },
    });
    return NextResponse.json({ ok: true, status: updated.status });
  } catch (error: unknown) {
    const apiError = toApiError(error, "Не удалось обновить статус оплаты");
    return NextResponse.json({ error: apiError.message }, { status: apiError.status });
  }
}
