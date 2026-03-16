import { NextRequest } from "next/server";
import { log } from "@/lib/logger";
import { prisma } from "@/lib/db";
import { apiSuccess, apiError } from "@/lib/api-response";
import type { SharedLocationView, DeviceWithLocation } from "@/types/api";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    const share = await prisma.share.findUnique({
      where: { shareToken: token },
      include: {
        owner: {
          include: {
            devices: {
              where: { isActive: true },
              include: {
                locations: {
                  orderBy: { timestamp: "desc" },
                  take: 1,
                },
              },
            },
          },
        },
      },
    });

    if (!share) {
      return apiError("Share not found", 404);
    }

    if (!share.isActive) {
      return apiError("This share link has been revoked", 410);
    }

    if (share.expiresAt && new Date() > share.expiresAt) {
      return apiError("This share link has expired", 410);
    }

    const devices: DeviceWithLocation[] = share.owner.devices.map((d) => ({
      id: d.id,
      userId: d.userId,
      name: d.name,
      platform: d.platform as DeviceWithLocation["platform"],
      token: "", // Don't expose device tokens
      isActive: d.isActive,
      isPrimary: d.isPrimary,
      lastSeen: d.lastSeen?.toISOString() ?? null,
      createdAt: d.createdAt.toISOString(),
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

    const result: SharedLocationView = {
      ownerName: share.owner.name,
      devices,
      expiresAt: share.expiresAt?.toISOString() ?? null,
    };

    return apiSuccess(result);
  } catch (error) {
    log.error("share", "Share view failed", error);
    return apiError("Internal server error", 500);
  }
}
