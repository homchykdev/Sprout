import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { logWarn } from "./logger";

/** System notification via the service worker when possible, else the Notification API. */
export async function notify(title: string, body: string) {
  if (Capacitor.isNativePlatform()) {
    const permission = await LocalNotifications.checkPermissions();
    if (permission.display !== "granted") return false;
    await LocalNotifications.createChannel({
      id: "reminders",
      name: "Напоминания",
      importance: 4,
    });
    await LocalNotifications.schedule({
      notifications: [
        {
          id: (Date.now() % 999_999) + 1,
          title,
          body,
          channelId: "reminders",
        },
      ],
    });
    return true;
  }

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
  } catch (e) {
    logWarn("notify", "Уведомление не отправлено", e);
    return false;
  }
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (Capacitor.isNativePlatform()) {
    const permission = await LocalNotifications.requestPermissions();
    return permission.display === "granted";
  }
  if (typeof Notification === "undefined") return false;
  return (await Notification.requestPermission()) === "granted";
}
