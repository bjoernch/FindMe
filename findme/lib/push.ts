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
 * Send push notification to all registered devices of a user via Expo Push API.
 */
export async function sendPushNotification(
  userId: string,
  title: string,
  body: string,
  data?: Record<string, unknown>
) {
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
  return sendPushNotification(userId, title, body, data);
}
