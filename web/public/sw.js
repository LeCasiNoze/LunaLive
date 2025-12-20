self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {}

  if (!data || data.type !== "go_live") return;

  const title = `${data.displayName} est en stream !`;
  const body = data.title ? `"${data.title}" — clique pour rejoindre` : "Clique pour rejoindre";

  const url = data.url || `/streamers/${encodeURIComponent(data.slug || "")}`;

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag: `go-live:${data.slug || ""}`,
      renotify: false,
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
