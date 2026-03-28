import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { toApiError } from "@/lib/apiError";
import { buildMbankPayUrl } from "@/lib/mbankLink";
import { listMenuItemsByIds } from "@/lib/menuItemCompat";
import { checkOrderCreateThrottle, expireStaleOrders } from "@/lib/orderLifecycle";
import { makePaymentCode } from "@/lib/paymentCode";
import { toDbPaymentMethod } from "@/lib/paymentMethod";
import { prisma } from "@/lib/prisma";
import { CreateOrderSchema } from "@/lib/validators";

function normalizeIdempotencyKey(value: unknown) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, 120);
}

function readDuplicateWindowSeconds() {
  const raw = Number(process.env.ORDER_DUPLICATE_WINDOW_SECONDS);
  if (!Number.isFinite(raw)) return 90;
  return Math.min(600, Math.max(15, Math.round(raw)));
}

function normalizeLocation(location: unknown) {
  if (!location || typeof location !== "object") return { market: "", line: "", container: "" };

  const candidate = location as { market?: unknown; line?: unknown; container?: unknown };
  return {
    market: typeof candidate.market === "string" ? candidate.market.trim().toLowerCase() : "",
    line: typeof candidate.line === "string" ? candidate.line.trim().toLowerCase() : "",
    container:
      typeof candidate.container === "string" ? candidate.container.trim().toLowerCase() : "",
  };
}

function makeItemsSignature(items: Array<{ menuItemId: string; qty: number }>) {
  return [...items]
    .map((item) => ({ menuItemId: item.menuItemId, qty: item.qty }))
    .sort((a, b) => a.menuItemId.localeCompare(b.menuItemId))
    .map((item) => `${item.menuItemId}:${item.qty}`)
    .join("|");
}

async function findRecentDuplicateOrder(params: {
  restaurantId: string;
  dbPaymentMethod: "qr_image" | "cash";
  customerPhone: string;
  totalKgs: number;
  location: unknown;
  items: Array<{ menuItemId: string; qty: number }>;
  comment: string;
}) {
  const from = new Date(Date.now() - readDuplicateWindowSeconds() * 1_000);
  const recentOrders = await prisma.order.findMany({
    where: {
      restaurantId: params.restaurantId,
      paymentMethod: params.dbPaymentMethod,
      customerPhone: params.customerPhone,
      createdAt: { gte: from },
      status: { in: ["created", "pending_confirmation", "confirmed", "cooking", "delivering"] },
    },
    include: {
      restaurant: true,
      items: {
        select: {
          menuItemId: true,
          qty: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 8,
  });

  const expectedItemsSignature = makeItemsSignature(params.items);
  const expectedLocation = normalizeLocation(params.location);
  const expectedComment = params.comment.trim();

  return (
    recentOrders.find((order) => {
      if (order.totalKgs !== params.totalKgs) return false;
      if ((order.comment ?? "").trim() !== expectedComment) return false;

      const orderLocation = normalizeLocation(order.location);
      if (
        orderLocation.market !== expectedLocation.market ||
        orderLocation.line !== expectedLocation.line ||
        orderLocation.container !== expectedLocation.container
      ) {
        return false;
      }

      const orderItemsSignature = makeItemsSignature(order.items);
      return orderItemsSignature === expectedItemsSignature;
    }) ?? null
  );
}

export async function POST(req: Request) {
  try {
    await expireStaleOrders();

    const body = await req.json().catch(() => null);
    const parsed = CreateOrderSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Некорректные данные запроса", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { restaurantSlug, items, location, paymentMethod, customerPhone, payerName, comment } =
      parsed.data;
    const normalizedPayerName = payerName?.trim() ?? "";
    if (paymentMethod !== "cash" && normalizedPayerName.length < 2) {
      return NextResponse.json({ error: "Укажите имя плательщика" }, { status: 400 });
    }
    const idempotencyKey = normalizeIdempotencyKey(
      parsed.data.idempotencyKey || req.headers.get("x-idempotency-key"),
    );

    if (idempotencyKey) {
      const existing = await prisma.order.findUnique({
        where: { idempotencyKey },
        include: { restaurant: true },
      });

      if (existing) {
        const bankPayUrl =
          existing.paymentMethod === "cash"
            ? null
            : buildMbankPayUrl({
                totalKgs: existing.totalKgs,
                bankPhone: existing.restaurant.mbankNumber,
              });
        return NextResponse.json({ orderId: existing.id, bankPayUrl, created: false });
      }
    }

    const restaurant = await prisma.restaurant.findUnique({ where: { slug: restaurantSlug } });
    if (!restaurant) return NextResponse.json({ error: "Ресторан не найден" }, { status: 404 });

    const throttle = await checkOrderCreateThrottle(restaurant.id);
    if (throttle.limited) {
      return NextResponse.json(
        {
          error: "Сейчас высокая нагрузка. Повторите попытку через несколько секунд.",
          retryAfterSeconds: throttle.retryAfterSeconds,
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(throttle.retryAfterSeconds),
          },
        },
      );
    }

    const menuItems = await listMenuItemsByIds(
      restaurant.id,
      items.map((item) => item.menuItemId),
    );
    const map = new Map(menuItems.map((m) => [m.id, m]));
    const orderLines: Array<{ m: (typeof menuItems)[number]; qty: number }> = [];
    for (const x of items) {
      const m = map.get(x.menuItemId);
      if (!m || !m.isAvailable) {
        return NextResponse.json({ error: "Позиция меню недоступна" }, { status: 400 });
      }
      orderLines.push({ m, qty: x.qty });
    }

    const totalKgs = orderLines.reduce((s, x) => s + x.m.priceKgs * x.qty, 0);
    const paymentCode = makePaymentCode("BX");
    const dbPaymentMethod = toDbPaymentMethod(paymentMethod);
    const normalizedComment = comment || "";

    const duplicateOrder = await findRecentDuplicateOrder({
      restaurantId: restaurant.id,
      dbPaymentMethod,
      customerPhone,
      totalKgs,
      location,
      items: items.map((item) => ({ menuItemId: item.menuItemId, qty: item.qty })),
      comment: normalizedComment,
    });

    if (duplicateOrder) {
      const bankPayUrl =
        duplicateOrder.paymentMethod === "cash"
          ? null
          : buildMbankPayUrl({
              totalKgs: duplicateOrder.totalKgs,
              bankPhone: duplicateOrder.restaurant.mbankNumber,
            });

      return NextResponse.json({
        orderId: duplicateOrder.id,
        bankPayUrl,
        created: false,
        deduplicated: true,
      });
    }

    let order;
    try {
      order = await prisma.order.create({
        data: {
          restaurantId: restaurant.id,
          status: dbPaymentMethod === "cash" ? "confirmed" : "created",
          paymentMethod: dbPaymentMethod,
          totalKgs,
          customerPhone: customerPhone || null,
          payerName: normalizedPayerName || null,
          comment: normalizedComment || null,
          idempotencyKey: idempotencyKey || null,
          paymentConfirmedAt: dbPaymentMethod === "cash" ? new Date() : null,
          paymentCode,
          location,
          items: {
            create: orderLines.map(({ m, qty }) => ({
              menuItemId: m.id,
              qty,
              priceKgs: m.priceKgs,
              titleSnap: m.title,
              photoSnap: m.photoUrl,
            })),
          },
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002" &&
        idempotencyKey
      ) {
        const existing = await prisma.order.findUnique({
          where: { idempotencyKey },
          include: { restaurant: true },
        });

        if (existing) {
          const bankPayUrl =
            existing.paymentMethod === "cash"
              ? null
              : buildMbankPayUrl({
                  totalKgs: existing.totalKgs,
                  bankPhone: existing.restaurant.mbankNumber,
                });
          return NextResponse.json({ orderId: existing.id, bankPayUrl, created: false });
        }
      }
      throw error;
    }

    const bankPayUrl =
      dbPaymentMethod === "cash"
        ? null
        : buildMbankPayUrl({ totalKgs, bankPhone: restaurant.mbankNumber });
    return NextResponse.json({ orderId: order.id, bankPayUrl, created: true });
  } catch (error: unknown) {
    const apiError = toApiError(error, "Не удалось создать заказ");
    return NextResponse.json({ error: apiError.message }, { status: apiError.status });
  }
}
