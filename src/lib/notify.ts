/** System notification via the service worker when possible, else the Notification API. */
export async function notify(title: string, body: string) {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return false;
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg)
      await reg.showNotification(title, {
        body,
        icon: "/icon-512.png",
        badge: "/icon-512.png",
        tag: "pulse-nag",
      });
    else new Notification(title, { body, icon: "/icon-512.png" });
    return true;
  } catch {
    return false;
  }
}
