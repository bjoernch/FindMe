/**
 * Webhook delivery for geofence events.
 * Sends POST requests with HMAC-SHA256 signed payloads to user-configured URLs.
 */

import crypto from "crypto";
import { prisma } from "./db";
import { log } from "./logger";

interface WebhookEvent {
  event: "geofence.enter" | "geofence.exit";
  geofence: {
    name: string;
    lat: number;
    lng: number;
    radiusM: number;
  };
  device: {
    name: string;
  };
  timestamp: string;
}

export async function sendWebhook(
  userId: string,
  event: WebhookEvent
): Promise<void> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { webhookUrl: true, webhookSecret: true },
    });

    if (!user?.webhookUrl) return;

    const payload = JSON.stringify(event);

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (user.webhookSecret) {
      const signature = crypto
        .createHmac("sha256", user.webhookSecret)
        .update(payload)
        .digest("hex");
      headers["X-Webhook-Signature"] = signature;
    }

    // Fire-and-forget with 5s timeout
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    fetch(user.webhookUrl, {
      method: "POST",
      headers,
      body: payload,
      signal: controller.signal,
    })
      .then((res) => {
        clearTimeout(timeout);
        if (!res.ok) {
          log.warn("webhook", `Webhook delivery failed: HTTP ${res.status}`, {
            userId,
            url: user.webhookUrl!,
          });
        }
      })
      .catch((err) => {
        clearTimeout(timeout);
        log.error("webhook", "Webhook delivery error", err, {
          userId,
          url: user.webhookUrl!,
        });
      });
  } catch (error) {
    log.error("webhook", "Failed to send webhook", error, { userId });
  }
}
