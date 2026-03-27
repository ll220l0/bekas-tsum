self.addEventListener("push", (event) => {
  let payload = {
    title: "Beka's Burger",
    body: "Order status updated.",
    url: "/order",
  };

  if (event.data) {
    try {
      const parsed = event.data.json();
      payload = {
        title: typeof parsed?.title === "string" && parsed.title ? parsed.title : payload.title,
        body: typeof parsed?.body === "string" && parsed.body ? parsed.body : payload.body,
        url: typeof parsed?.url === "string" && parsed.url ? parsed.url : payload.url,
      };
    } catch {
      const text = event.data.text();
      if (text) payload.body = text;
    }
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/icons/icon-192.png",
      badge: "/icons/favicon-64.png",
      data: { url: payload.url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification?.data?.url || "/order";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      return self.clients.openWindow(targetUrl);
    }),
  );
});
