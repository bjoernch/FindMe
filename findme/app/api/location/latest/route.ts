import { NextRequest } from "next/server";
import { log } from "@/lib/logger";
import { prisma } from "@/lib/db";
import { apiSuccess, apiError } from "@/lib/api-response";
import { authenticateRequest } from "@/lib/auth-guard";
import type { DeviceWithLocation } from "@/types/api";

export async function GET(req: NextRequest) {
  try {
    const authResult = await authenticateRequest(req);
    if (authResult instanceof Response) return authResult;

    const user = await prisma.user.findUnique({
      where: { id: authResult.id },
      select: { name: true, avatar: true },
    });

    const devices = await prisma.device.findMany({
      where: { userId: authResult.id, isActive: true },
      include: {
        locations: {
          orderBy: { timestamp: "desc" },
          take: 1,
        },
      },
    });

    const result = devices.map((d) => ({
      id: d.id,
      userId: d.userId,
      name: d.name,
      platform: d.platform as DeviceWithLocation["platform"],
      token: d.token,
      isActive: d.isActive,
      isPrimary: d.isPrimary,
      lastSeen: d.lastSeen?.toISOString() ?? null,
      createdAt: d.createdAt.toISOString(),
      ownerName: user?.name ?? null,
      ownerAvatar: user?.avatar ?? null,
      latestLocation: d.locations[0]
        ? {
            id: d.locations[0].id,
            deviceId: d.locations[0].deviceId,
            lat: d.locations[0].lat,
            lng: d.locations[0].lng,
            accuracy: d.locations[0].accuracy,
            altitude: d.locations[0].altitude,
            speed: d.locations[0].speed,
            heading: d.locations[0].heading,
            batteryLevel: d.locations[0].batteryLevel,
            timestamp: d.locations[0].timestamp.toISOString(),
          }
        : null,
    }));

    return apiSuccess(result);
  } catch (error) {
    log.error("location.latest", "Latest location failed", error);
    return apiError("Internal server error", 500);
  }
}
