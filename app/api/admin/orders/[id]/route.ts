import { NextResponse } from "next/server";
import { toApiError } from "@/lib/apiError";
import { requireAdminRole } from "@/lib/adminAuth";
import { expireStaleOrders } from "@/lib/orderLifecycle";
import { toClientPaymentMethod } from "@/lib/paymentMethod";
import { prisma } from "@/lib/prisma";
import { getRestaurantDisplayName } from "@/lib/restaurant";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminRole(["owner", "operator", "courier"]);
  if ("response" in auth) return auth.response;

  try {
    await expireStaleOrders();

    const { id } = await params;
    const order = await prisma.order.findUnique({
      where: { id },
      include: { restaurant: true, items: true },
    });

    if (!order) {
      return NextResponse.json({ error: "Заказ не найден" }, { status: 404 });
    }

    return NextResponse.json({
      id: order.id,
      status: order.status,
      totalKgs: order.totalKgs,
      payerName: order.payerName ?? "",
      canceledReason: order.canceledReason ?? "",
      paymentCode: order.paymentCode,
      paymentMethod: toClientPaymentMethod(order.paymentMethod),
      customerPhone: order.customerPhone ?? "",
      comment: order.comment ?? "",
      location: order.location,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      paymentConfirmedAt: order.paymentConfirmedAt,
      deliveredAt: order.deliveredAt,
      canceledAt: order.canceledAt,
      role: auth.session.role,
      user: auth.session.user,
      restaurant: {
        name: getRestaurantDisplayName(order.restaurant.name),
        slug: order.restaurant.slug,
      },
      items: order.items.map((x) => ({
        id: x.id,
        title: x.titleSnap,
        qty: x.qty,
        priceKgs: x.priceKgs,
        photoUrl: x.photoSnap,
      })),
    });
  } catch (error: unknown) {
    const apiError = toApiError(error, "Не удалось загрузить заказ");
    return NextResponse.json({ error: apiError.message }, { status: apiError.status });
  }
}
