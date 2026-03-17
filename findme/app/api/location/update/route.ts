import { NextRequest } from "next/server";
import { log } from "@/lib/logger";
import { prisma } from "@/lib/db";
import { apiSuccess, apiError } from "@/lib/api-response";
import { authenticateDevice } from "@/lib/auth-guard";
import { locationUpdateSchema } from "@/lib/validations";
import { rateLimit } from "@/lib/rate-limit";
import { sseManager } from "@/lib/sse-manager";
import { checkGeofences } from "@/lib/geofence";

export async function POST(req: NextRequest) {
  try {
    const deviceResult = await authenticateDevice(req);
    if (deviceResult instanceof Response) return deviceResult;

    // Rate limit: 60 updates per minute per device
    const { allowed } = rateLimit(`loc:${deviceResult.id}`, 60, 60_000);
    if (!allowed) {
      return apiError("Rate limit exceeded. Max 60 updates per minute.", 429);
    }

    const body = await req.json();
    const parsed = locationUpdateSchema.safeParse(body);

    if (!parsed.success) {
      return apiError(parsed.error.issues[0].message, 400);
    }

    const { lat, lng, accuracy, altitude, speed, heading, batteryLevel } =
      parsed.data;

    // Store app version from header (fire-and-forget)
    const appVersion = req.headers.get("x-app-version");
    if (appVersion && appVersion !== "unknown" && appVersion !== deviceResult.appVersion) {
      prisma.device.update({
        where: { id: deviceResult.id },
        data: { appVersion },
      }).catch(() => {});
    }

    const [location] = await Promise.all([
      prisma.location.create({
        data: {
          deviceId: deviceResult.id,
          lat,
          lng,
          accuracy: accuracy ?? null,
          altitude: altitude ?? null,
          speed: speed ?? null,
          heading: heading ?? null,
          batteryLevel: batteryLevel ?? null,
        },
      }),
      prisma.device.update({
        where: { id: deviceResult.id },
        data: { lastSeen: new Date() },
      }),
    ]);

    // Broadcast real-time update via SSE
    const userId = deviceResult.userId;
    const peopleShares = await prisma.peopleShare.findMany({
      where: {
        status: "ACCEPTED",
        OR: [{ fromUserId: userId }, { toUserId: userId }],
      },
    });

    const connectedUserIds = new Set([userId]);
    for (const share of peopleShares) {
      connectedUserIds.add(share.fromUserId);
      connectedUserIds.add(share.toUserId);
    }

    sseManager.broadcastToUsers(
      Array.from(connectedUserIds),
      "location_update",
      {
        deviceId: location.deviceId,
        lat: location.lat,
        lng: location.lng,
        accuracy: location.accuracy,
        altitude: location.altitude,
        speed: location.speed,
        heading: location.heading,
        batteryLevel: location.batteryLevel,
        timestamp: location.timestamp.toISOString(),
        deviceName: deviceResult.name,
        userId,
      }
    );

    // Check geofences asynchronously
    checkGeofences(userId, lat, lng, deviceResult.name).catch((e) => log.error("location.update", "Background task failed", e));

    return apiSuccess({
      id: location.id,
      deviceId: location.deviceId,
      lat: location.lat,
      lng: location.lng,
      timestamp: location.timestamp.toISOString(),
    });
  } catch (error) {
    log.error("location.update", "Location update failed", error);
    return apiError("Internal server error", 500);
  }
}
