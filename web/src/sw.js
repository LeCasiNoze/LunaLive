/* web/src/sw.js */

// (optionnel, juste pour que vite-plugin-pwa puisse injecter la precache list)
self.__WB_MANIFEST;

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  event.waitUntil((async () => {
    let data = {};
    try {
      data = event.data ? event.data.json() : {};
    } catch {
      try {
        const t = event.data ? await event.data.text() : "";
        data = t ? { title: t } : {};
      } catch {}
    }

    const title = data.displayName
      ? `${data.displayName} est en stream !`
      : "Un streamer est en live !";

    const body = data.title
      ? `“${data.title}” — clique pour rejoindre`
      : "Clique pour rejoindre le stream";

    const url = data.url || "/";

    try {
      await self.registration.showNotification(title, {
        body,
        icon: "/pwa-192.png",
        badge: "/pwa-192.png",
        tag: `go-live:${data.slug || "unknown"}`,
        renotify: false,
        requireInteraction: false,
        data: { url },
      });
    } catch (e) {
      // Filet de sécurité anti notif générique
      await self.registration.showNotification("LunaLive", {
        body: "Une notification est arrivée. Ouvre LunaLive.",
        data: { url: "/" },
      });
    }
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification?.data?.url || "/";

  event.waitUntil((async () => {
    const all = await clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of all) {
      if ("focus" in c) {
        await c.focus();
        try { await c.navigate(url); } catch {}
        return;
      }
    }
    await clients.openWindow(url);
  })());
});
