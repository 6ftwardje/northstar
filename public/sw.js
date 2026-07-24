self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }

  event.waitUntil(
    self.registration.showNotification(data.title || "Northstar", {
      body: data.body || "Er staat iets voor je klaar.",
      icon: "/apple-icon.png",
      badge: "/apple-icon.png",
      tag: data.tag || "northstar",
      data: {
        url: data.url || "/",
        actionId: data.actionId || null,
      },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/", self.location.origin);

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then(async (windowClients) => {
        const existing = windowClients.find(
          (client) => new URL(client.url).origin === target.origin,
        );
        if (existing) {
          if ("navigate" in existing) await existing.navigate(target.href);
          return existing.focus();
        }
        return self.clients.openWindow(target.href);
      }),
  );
});
