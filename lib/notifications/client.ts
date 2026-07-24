export type PushCapability = {
  supported: boolean;
  standalone: boolean;
  permission: NotificationPermission | "unsupported";
};

declare global {
  interface Navigator {
    standalone?: boolean;
  }
}

export function urlBase64ToUint8Array(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map((character) => character.charCodeAt(0)));
}

export function getPushCapability(): PushCapability {
  const supported =
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window;
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    navigator.standalone === true;

  return {
    supported,
    standalone,
    permission: supported ? Notification.permission : "unsupported",
  };
}

export async function getCurrentPushSubscription() {
  if (!getPushCapability().supported) return null;
  const registration = await navigator.serviceWorker.ready;
  return registration.pushManager.getSubscription();
}

export async function subscribeToPush(publicKey: string) {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("NOTIFICATION_PERMISSION_DENIED");
  }

  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  const subscription =
    existing ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    }));

  const response = await fetch("/api/notifications/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(subscription.toJSON()),
  });
  if (!response.ok) {
    throw new Error("SUBSCRIPTION_SAVE_FAILED");
  }
  return subscription;
}

export async function unsubscribeFromPush() {
  const subscription = await getCurrentPushSubscription();
  if (!subscription) return;

  const response = await fetch("/api/notifications/subscribe", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint: subscription.endpoint }),
  });
  if (!response.ok) throw new Error("UNSUBSCRIBE_FAILED");
  await subscription.unsubscribe();
}
