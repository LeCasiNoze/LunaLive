// web/src/sw.js
import { precacheAndRoute, cleanupOutdatedCaches } from "workbox-precaching";

// ✅ garde l'injection (Workbox va remplacer self.__WB_MANIFEST)
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

// (optionnel, juste pour que vite-plugin-pwa puisse injecter la precache list)
self.__WB_MANIFEST;

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  event.waitUntil(
    (async () => {
      let data = {};
      try {
        data = event.data ? event.data.json() : {};
      } catch {
        try {
          const t = event.data ? await event.data.text() : "";
          data = t ? { title: t } : {};
        } catch {}
      }

      const type = data.type || "unknown";
      const url = data.url || "/";

      let title = "LunaLive";
      let body = "Une notification est arrivée. Ouvre LunaLive.";

      if (type === "go_live") {
        title = data.displayName ? `${data.displayName} est en stream !` : "Un streamer est en live !";
        body = data.title ? `“${data.title}” — clique pour rejoindre` : "Clique pour rejoindre le stream";
      } else if (type === "agenda") {
        const who = data.displayName ? `${data.displayName}` : "Un streamer";
        const what = data.agendaTitle ? `“${data.agendaTitle}”` : "Un événement";
        title = `${what} dans 10 minutes`;
        body = `${who} — clique pour ouvrir la chaîne`;
      } else {
        // fallback (payload inconnu)
        if (data.title) {
          title = String(data.title);
          body = String(data.body || body);
        }
      }

      const tag =
        type === "agenda"
          ? `agenda:${data.slug || "unknown"}:${data.occStart || ""}`
          : `go-live:${data.slug || "unknown"}`;

      try {
        await self.registration.showNotification(title, {
          body,
          icon: "/pwa-192.png",
          badge: "/pwa-192.png",
          tag,
          renotify: false,
          requireInteraction: false,
          data: { url },
        });
      } catch (_e) {
        // Filet de sécurité anti notif générique
        await self.registration.showNotification("LunaLive", {
          body: "Une notification est arrivée. Ouvre LunaLive.",
          data: { url: "/" },
        });
      }
    })()
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
          await c.focus();
          try {
            await c.navigate(url);
          } catch {}
          return;
        }
      }
      await clients.openWindow(url);
    })()
  );
});
