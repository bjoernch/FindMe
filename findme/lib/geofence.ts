import { prisma } from "./db";
import { sseManager } from "./sse-manager";
import { sendPushWithPrefs } from "./push";
import { sendGeofenceAlertEmail } from "./email";
import { shouldNotify } from "./notification-preferences";
import { log } from "@/lib/logger";

// In-memory cache: "ownerId:geofenceId" -> isInside (keyed by owner to support cross-user geofences)
const geofenceState = new Map<string, boolean>();

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

async function sendGeofenceNotifications(
  fence: { id: string; userId: string; name: string },
  deviceName: string,
  eventType: "ENTER" | "EXIT",
  lat: number,
  lng: number
) {
  const action = eventType === "ENTER" ? "entered" : "left";
  const message = `${deviceName} ${action} "${fence.name}"`;

  // SSE to geofence owner
  sseManager.broadcastToUser(fence.userId, "geofence", {
    type: eventType,
    geofenceName: fence.name,
    deviceName,
    lat,
    lng,
    timestamp: new Date().toISOString(),
  });

  // Push notification
  sendPushWithPrefs(fence.userId, "Geofence Alert", message, "geofence").catch(
    (e) => log.error("geofence", "Push notification failed", e)
  );

  // Email notification
  shouldNotify(fence.userId, "email", "geofence")
    .then(async (allowed) => {
      if (!allowed) return;
      const owner = await prisma.user.findUnique({
        where: { id: fence.userId },
        select: { email: true },
      });
      if (owner?.email) {
        await sendGeofenceAlertEmail(owner.email, deviceName, fence.name, eventType);
      }
    })
    .catch((e) => log.error("geofence", "Email notification failed", e));
}

export async function checkGeofences(
  userId: string,
  lat: number,
  lng: number,
  deviceName: string
) {
  // Own geofences (monitors own devices)
  const ownGeofences = await prisma.geofence.findMany({
    where: { userId, monitoredUserId: null, isActive: true },
  });

  // Geofences other users created to monitor THIS user
  const monitoredGeofences = await prisma.geofence.findMany({
    where: { monitoredUserId: userId, isActive: true },
  });

  const allGeofences = [...ownGeofences, ...monitoredGeofences];
  if (allGeofences.length === 0) return;

  for (const fence of allGeofences) {
    const stateKey = `${fence.userId}:${fence.id}`;
    const distance = haversineDistance(lat, lng, fence.lat, fence.lng);
    const isInside = distance <= fence.radiusM;
    const wasInside = geofenceState.get(stateKey);

    // First check for this geofence - just set state
    if (wasInside === undefined) {
      geofenceState.set(stateKey, isInside);
      continue;
    }

    // Detect enter/exit transitions
    if (isInside && !wasInside && fence.onEnter) {
      geofenceState.set(stateKey, true);

      await prisma.geofenceEvent.create({
        data: {
          geofenceId: fence.id,
          deviceName,
          eventType: "ENTER",
          lat,
          lng,
        },
      });

      await sendGeofenceNotifications(fence, deviceName, "ENTER", lat, lng);
    } else if (!isInside && wasInside && fence.onExit) {
      geofenceState.set(stateKey, false);

      await prisma.geofenceEvent.create({
        data: {
          geofenceId: fence.id,
          deviceName,
          eventType: "EXIT",
          lat,
          lng,
        },
      });

      await sendGeofenceNotifications(fence, deviceName, "EXIT", lat, lng);
    } else {
      geofenceState.set(stateKey, isInside);
    }
  }
}
