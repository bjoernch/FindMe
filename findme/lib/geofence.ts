import { prisma } from "./db";
import { sseManager } from "./sse-manager";
import { sendPushNotification } from "./push";
import { log } from "@/lib/logger";

// In-memory cache: userId -> { geofenceId -> isInside }
const geofenceState = new Map<string, Map<string, boolean>>();

function haversineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371000; // Earth radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export async function checkGeofences(
  userId: string,
  lat: number,
  lng: number,
  deviceName: string
) {
  const geofences = await prisma.geofence.findMany({
    where: { userId, isActive: true },
  });

  if (geofences.length === 0) return;

  // Get or create state map for this user
  if (!geofenceState.has(userId)) {
    geofenceState.set(userId, new Map());
  }
  const userState = geofenceState.get(userId)!;

  for (const fence of geofences) {
    const distance = haversineDistance(lat, lng, fence.lat, fence.lng);
    const isInside = distance <= fence.radiusM;
    const wasInside = userState.get(fence.id);

    // First check for this geofence - just set state
    if (wasInside === undefined) {
      userState.set(fence.id, isInside);
      continue;
    }

    // Detect enter/exit transitions
    if (isInside && !wasInside && fence.onEnter) {
      // Entered geofence
      userState.set(fence.id, true);

      await prisma.geofenceEvent.create({
        data: {
          geofenceId: fence.id,
          deviceName,
          eventType: "ENTER",
          lat,
          lng,
        },
      });

      const message = `${deviceName} entered "${fence.name}"`;
      sseManager.broadcastToUser(userId, "geofence", {
        type: "ENTER",
        geofenceName: fence.name,
        deviceName,
        lat,
        lng,
        timestamp: new Date().toISOString(),
      });

      // Send push notification
      sendPushNotification(userId, "Geofence Alert", message).catch(
        (e) => log.error("geofence", "Push notification failed", e)
      );
    } else if (!isInside && wasInside && fence.onExit) {
      // Exited geofence
      userState.set(fence.id, false);

      await prisma.geofenceEvent.create({
        data: {
          geofenceId: fence.id,
          deviceName,
          eventType: "EXIT",
          lat,
          lng,
        },
      });

      const message = `${deviceName} left "${fence.name}"`;
      sseManager.broadcastToUser(userId, "geofence", {
        type: "EXIT",
        geofenceName: fence.name,
        deviceName,
        lat,
        lng,
        timestamp: new Date().toISOString(),
      });

      sendPushNotification(userId, "Geofence Alert", message).catch(
        (e) => log.error("geofence", "Push notification failed", e)
      );
    } else {
      userState.set(fence.id, isInside);
    }
  }
}
