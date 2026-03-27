import { NextResponse } from "next/server";
import { toApiError } from "@/lib/apiError";
import { expireStaleOrders } from "@/lib/orderLifecycle";
import { toClientPaymentMethod } from "@/lib/paymentMethod";
import { prisma } from "@/lib/prisma";
import { getRestaurantDisplayName } from "@/lib/restaurant";

export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await expireStaleOrders();

    const { id } = await params;
    const order = await prisma.order.findUnique({
      where: { id },
      include: { restaurant: true, items: true },
    });
    if (!order) return NextResponse.json({ error: "Заказ не найден" }, { status: 404 });

    return NextResponse.json({
      id: order.id,
      status: order.status,
      paymentMethod: toClientPaymentMethod(order.paymentMethod),
      totalKgs: order.totalKgs,
      payerName: order.payerName ?? "",
      canceledReason: order.canceledReason ?? "",
      paymentCode: order.paymentCode,
      location: order.location,
      comment: order.comment ?? "",
      customerPhone: order.customerPhone ?? "",
      restaurant: {
        name: getRestaurantDisplayName(order.restaurant.name),
        slug: order.restaurant.slug,
        mbankNumber: order.restaurant.mbankNumber ?? "",
        obankNumber: order.restaurant.obankNumber ?? "",
        bakaiNumber: order.restaurant.bakaiNumber ?? "",
      },
      items: order.items.map((x) => ({
        id: x.id,
        menuItemId: x.menuItemId,
        title: x.titleSnap,
        qty: x.qty,
        priceKgs: x.priceKgs,
        photoUrl: x.photoSnap,
      })),
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      paymentConfirmedAt: order.paymentConfirmedAt,
      deliveredAt: order.deliveredAt,
      canceledAt: order.canceledAt,
    });
  } catch (error: unknown) {
    const apiError = toApiError(error, "Не удалось загрузить заказ");
    return NextResponse.json({ error: apiError.message }, { status: apiError.status });
  }
}
