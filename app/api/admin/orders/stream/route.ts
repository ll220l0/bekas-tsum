import { requireAdminRole } from "@/lib/adminAuth";
import { expireStaleOrders } from "@/lib/orderLifecycle";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const STREAM_POLL_INTERVAL_MS = 15_000;

function toEvent(event: string, payload: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
}

export async function GET() {
  const auth = await requireAdminRole(["owner", "operator", "courier"]);
  if ("response" in auth) return auth.response;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      let closed = false;
      let lastSignature = "";

      const pushMeta = async () => {
        const latest = await prisma.order.findFirst({
          orderBy: { updatedAt: "desc" },
          select: { updatedAt: true },
        });

        const signature = latest?.updatedAt?.toISOString() ?? "none";
        if (signature === lastSignature) return;
        lastSignature = signature;
        controller.enqueue(
          encoder.encode(
            toEvent("orders_meta", {
              updatedAt: latest?.updatedAt ?? null,
            }),
          )
        );
      };

      try {
        await expireStaleOrders();
        await pushMeta();
      } catch {
        controller.enqueue(encoder.encode(toEvent("error", { message: "stream_init_failed" })));
      }

      const timer = setInterval(async () => {
        if (closed) return;
        try {
          await pushMeta();
          controller.enqueue(encoder.encode(toEvent("ping", { t: Date.now() })));
        } catch {
          controller.enqueue(encoder.encode(toEvent("error", { message: "stream_tick_failed" })));
        }
      }, STREAM_POLL_INTERVAL_MS);

      const close = () => {
        if (closed) return;
        closed = true;
        clearInterval(timer);
        controller.close();
      };

      setTimeout(close, 1000 * 60 * 10);
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive"
    }
  });
}
