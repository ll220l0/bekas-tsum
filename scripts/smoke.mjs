#!/usr/bin/env node

const baseUrl = process.env.SMOKE_BASE_URL || "http://localhost:3000";
const adminUser = process.env.ADMIN_USER || "";
const adminPass = process.env.ADMIN_PASS || "";
const defaultRestaurantSlug =
  process.env.NEXT_PUBLIC_DEFAULT_RESTAURANT_SLUG?.trim() || "dordoi-food";

async function assertOk(name, res) {
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${name} failed: ${res.status} ${res.statusText} :: ${body.slice(0, 300)}`);
  }
}

async function run() {
  console.log(`[smoke] baseUrl=${baseUrl}`);

  const health = await fetch(`${baseUrl}/api/health`, { cache: "no-store" });
  await assertOk("health", health);
  const healthJson = await health.json();
  if (!healthJson?.ok) throw new Error("health response missing ok=true");
  console.log("[smoke] health ok");

  const menu = await fetch(`${baseUrl}/api/restaurants/${defaultRestaurantSlug}/menu`, {
    cache: "no-store",
  });
  await assertOk("menu", menu);
  const menuJson = await menu.json();
  if (!menuJson?.restaurant?.slug) throw new Error("menu response missing restaurant slug");
  console.log("[smoke] menu ok");

  if (adminUser && adminPass) {
    const login = await fetch(`${baseUrl}/api/admin/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: adminUser, password: adminPass })
    });
    await assertOk("admin login", login);

    const setCookie = login.headers.get("set-cookie") || "";
    const sessionCookie = setCookie.split(";")[0] || "";
    if (!sessionCookie) throw new Error("admin login did not return session cookie");

    const orders = await fetch(`${baseUrl}/api/admin/orders`, {
      headers: { cookie: sessionCookie }
    });
    await assertOk("admin orders", orders);
    console.log("[smoke] admin ok");
  } else {
    console.log("[smoke] skip admin checks (ADMIN_USER/ADMIN_PASS not provided)");
  }

  console.log("[smoke] done");
}

run().catch((error) => {
  console.error("[smoke] failed", error);
  process.exit(1);
});
