import { NextResponse } from "next/server";
import { toApiError } from "@/lib/apiError";
import { requireAdminRole } from "@/lib/adminAuth";
import { expireStaleOrders } from "@/lib/orderLifecycle";
import { toClientPaymentMethod } from "@/lib/paymentMethod";
import { prisma } from "@/lib/prisma";
import { getRestaurantDisplayName } from "@/lib/restaurant";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdminRole(["owner", "operator", "courier"]);
  if ("response" in auth) return auth.response;

  try {
    await expireStaleOrders();

    const orders = await prisma.order.findMany({
      select: {
        id: true,
        status: true,
        totalKgs: true,
        paymentMethod: true,
        payerName: true,
        canceledReason: true,
        paymentCode: true,
        customerPhone: true,
        comment: true,
        location: true,
        createdAt: true,
        updatedAt: true,
        paymentConfirmedAt: true,
        deliveredAt: true,
        canceledAt: true,
        restaurant: {
          select: {
            name: true,
            slug: true,
          },
        },
        items: {
          select: {
            id: true,
            titleSnap: true,
            qty: true,
            priceKgs: true,
            photoSnap: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    return NextResponse.json({
      orders: orders.map((o) => ({
        id: o.id,
        status: o.status,
        totalKgs: o.totalKgs,
        paymentMethod: toClientPaymentMethod(o.paymentMethod),
        payerName: o.payerName ?? "",
        canceledReason: o.canceledReason ?? "",
        paymentCode: o.paymentCode,
        customerPhone: o.customerPhone ?? "",
        comment: o.comment ?? "",
        restaurant: { name: getRestaurantDisplayName(o.restaurant.name), slug: o.restaurant.slug },
        location: o.location,
        createdAt: o.createdAt,
        updatedAt: o.updatedAt,
        paymentConfirmedAt: o.paymentConfirmedAt,
        deliveredAt: o.deliveredAt,
        canceledAt: o.canceledAt,
        items: o.items.map((x) => ({
          id: x.id,
          title: x.titleSnap,
          qty: x.qty,
          priceKgs: x.priceKgs,
          photoUrl: x.photoSnap,
        })),
        itemCount: o.items.reduce((s, x) => s + x.qty, 0),
      })),
      role: auth.session.role,
      user: auth.session.user,
    });
  } catch (error: unknown) {
    const apiError = toApiError(error, "Не удалось загрузить заказы");
    return NextResponse.json({ error: apiError.message }, { status: apiError.status });
  }
}
