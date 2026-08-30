/* DilMart Store — Merchant Web Push Service Worker
 * Intentionally does NOT cache /api/* or authenticated order/auth responses.
 */

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let data = {
    type: "merchant_new_order",
    title: "طلب جديد",
    body: "وصل طلب جديد إلى متجرك",
    url: "/merchant/orders",
    order_id: null,
  };

  try {
    if (event.data) {
      data = { ...data, ...event.data.json() };
    }
  } catch (_err) {
    try {
      const text = event.data ? event.data.text() : "";
      if (text) data.body = text;
    } catch (__err) {
      // keep defaults
    }
  }

  const title = data.title || "طلب جديد";
  const body = data.body || "وصل طلب جديد إلى متجرك";
  const url = data.url || (data.order_id ? `/merchant/orders/${data.order_id}` : "/merchant/orders");
  const tag = data.order_id ? `merchant-order-${data.order_id}` : `merchant-push-${Date.now()}`;

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/DilMart-store-icon-only.png",
      badge: "/DilMart-store-icon-only.png",
      tag,
      renotify: true,
      data: {
        url,
        order_id: data.order_id || null,
        notification_id: data.notification_id || null,
        type: data.type || "merchant_new_order",
      },
      actions: [{ action: "open_order", title: "فتح الطلب" }],
      dir: "rtl",
      lang: "ar",
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const data = event.notification.data || {};
  let targetUrl = data.url || "/merchant/orders";
  if (data.order_id && data.notification_id && !String(targetUrl).includes("notification=")) {
    const base = `/merchant/orders/${data.order_id}`;
    targetUrl = `${base}?notification=${encodeURIComponent(data.notification_id)}`;
  }

  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      for (const client of allClients) {
        const clientUrl = new URL(client.url);
        if (clientUrl.pathname.startsWith("/merchant") && "focus" in client) {
          await client.focus();
          if ("navigate" in client) {
            try {
              await client.navigate(targetUrl);
            } catch (_e) {
              // ignore navigate failures
            }
          }
          client.postMessage({
            type: "merchant-notification-click",
            url: targetUrl,
            order_id: data.order_id || null,
            notification_id: data.notification_id || null,
          });
          return;
        }
      }

      await self.clients.openWindow(targetUrl);
    })(),
  );
});

// No fetch handler on purpose — never cache protected API responses.
