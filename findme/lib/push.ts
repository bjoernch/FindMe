import { prisma } from "./db";
import { log } from "@/lib/logger";
import { shouldNotify } from "./notification-preferences";

interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: string;
}

/**
 * Store a notification in the database for polling-based delivery.
 * This ensures notifications reach clients without Firebase/FCM (e.g. F-Droid builds).
 */
async function storeNotification(
  userId: string,
  title: string,
  body: string,
  type: string,
  data?: Record<string, unknown>
) {
  try {
    await prisma.notification.create({
      data: {
        userId,
        title,
        body,
        type,
        data: data ? JSON.stringify(data) : null,
      },
    });
  } catch (error) {
    log.error("push", "Failed to store notification", error);
  }
}

/**
 * Send push notification to all registered devices of a user via Expo Push API.
 * Also stores notification in DB for polling-based clients (FOSS builds without FCM).
 */
export async function sendPushNotification(
  userId: string,
  title: string,
  body: string,
  type: string = "general",
  data?: Record<string, unknown>
) {
  // Always store for polling-based delivery
  await storeNotification(userId, title, body, type, data);

  // Try Expo Push API (works for clients with FCM, gracefully fails otherwise)
  const tokens = await prisma.pushToken.findMany({
    where: { userId },
  });

  if (tokens.length === 0) return;

  const messages: ExpoPushMessage[] = tokens.map((t) => ({
    to: t.token,
    title,
    body,
    sound: "default",
    ...(data ? { data } : {}),
  }));

  try {
    const response = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(messages),
    });

    if (!response.ok) {
      log.error("push", "Expo push API error", new Error(await response.text()));
    }
  } catch (error) {
    log.error("push", "Failed to send push notification", error);
  }
}

/**
 * Send push notification with user preference checking.
 * Respects per-user notification preferences and quiet hours.
 */
export async function sendPushWithPrefs(
  userId: string,
  title: string,
  body: string,
  type: "invitations" | "geofence" | "locationSharing",
  data?: Record<string, unknown>
) {
  const allowed = await shouldNotify(userId, "push", type);
  if (!allowed) {
    log.debug("push", `Push suppressed by user preferences: ${type}`, { userId });
    return;
  }
  return sendPushNotification(userId, title, body, type, data);
}
