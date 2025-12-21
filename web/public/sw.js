self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let data = {};

  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {}

  const title = data.displayName
    ? `${data.displayName} est en stream !`
    : "Un streamer est en live !";

  const body = data.title
    ? `"${data.title}" — clique pour rejoindre`
    : "Clique pour rejoindre le stream";

  const url = data.url || "/";

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/pwa-192.png",
      badge: "/pwa-192.png",
      tag: `go-live:${data.slug || "unknown"}`,
      renotify: false,
      requireInteraction: false,
      data: { url },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification?.data?.url || "/";

  event.waitUntil(
    (async () => {
      const all = await clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const c of all) {
        if ("focus" in c) {
          c.focus();
          c.navigate(url);
          return;
        }
      }
      await clients.openWindow(url);
    })()
  );
});
