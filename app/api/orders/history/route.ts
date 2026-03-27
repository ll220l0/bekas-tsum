import { NextResponse } from "next/server";
import { toApiError } from "@/lib/apiError";
import { expireStaleOrders } from "@/lib/orderLifecycle";
import { toClientPaymentMethod } from "@/lib/paymentMethod";
import { prisma } from "@/lib/prisma";
import { getRestaurantDisplayName } from "@/lib/restaurant";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await expireStaleOrders();

    const url = new URL(req.url);
    const phone = url.searchParams.get("phone")?.trim() ?? "";
    const idsParam = url.searchParams.get("ids")?.trim() ?? "";
    const orderIds = idsParam
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean)
      .slice(0, 30);

    if (phone.length < 7 && orderIds.length === 0) {
      return NextResponse.json(
        { error: "Требуется телефон или список id заказов" },
        { status: 400 },
      );
    }

    const whereClauses: Array<Record<string, unknown>> = [];
    if (orderIds.length > 0) whereClauses.push({ id: { in: orderIds } });
    if (phone.length >= 7) whereClauses.push({ customerPhone: phone });
    const where = whereClauses.length === 1 ? whereClauses[0] : { OR: whereClauses };

    const orders = await prisma.order.findMany({
      where,
      include: { restaurant: true, items: true },
      orderBy: { createdAt: "desc" },
      take: 30,
    });

    return NextResponse.json({
      orders: orders.map((order) => ({
        id: order.id,
        status: order.status,
        paymentMethod: toClientPaymentMethod(order.paymentMethod),
        totalKgs: order.totalKgs,
        payerName: order.payerName ?? "",
        canceledReason: order.canceledReason ?? "",
        paymentCode: order.paymentCode,
        customerPhone: order.customerPhone ?? "",
        comment: order.comment ?? "",
        location: order.location,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
        restaurant: {
          name: getRestaurantDisplayName(order.restaurant.name),
          slug: order.restaurant.slug,
        },
        items: order.items.map((x) => ({
          id: x.id,
          menuItemId: x.menuItemId,
          title: x.titleSnap,
          qty: x.qty,
          priceKgs: x.priceKgs,
          photoUrl: x.photoSnap,
        })),
      })),
    });
  } catch (error: unknown) {
    const apiError = toApiError(error, "Не удалось загрузить историю заказов");
    return NextResponse.json({ error: apiError.message }, { status: apiError.status });
  }
}
