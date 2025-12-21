import { getVapidPublicKey, pushSubscribe } from "./api";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) out[i] = raw.charCodeAt(i);
  return out;
}

export async function enablePushNotifications(token: string) {
  if (!("Notification" in window)) throw new Error("notifications_not_supported");
  if (!("serviceWorker" in navigator)) throw new Error("sw_not_supported");

  const perm = await Notification.requestPermission();
  if (perm !== "granted") throw new Error("permission_denied");

  // Si déjà enregistré, on réutilise la registration
  let reg = await navigator.serviceWorker.getRegistration("/");
  if (!reg) {
    reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  }

  const { publicKey } = await getVapidPublicKey();
  if (!publicKey) throw new Error("vapid_public_key_missing");

  const appServerKey = urlBase64ToUint8Array(publicKey);

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: appServerKey,
    });
  }

  await pushSubscribe(token, sub.toJSON());
  return { ok: true };
}
