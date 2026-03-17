import { NextRequest } from "next/server";
import { log } from "@/lib/logger";
import { prisma } from "@/lib/db";
import { apiSuccess, apiError } from "@/lib/api-response";
import { authenticateRequest } from "@/lib/auth-guard";
import type { PersonWithDevices, DeviceWithLocation } from "@/types/api";

export async function GET(req: NextRequest) {
  try {
    const authResult = await authenticateRequest(req);
    if (authResult instanceof Response) return authResult;

    // Find all accepted shares involving this user
    const shares = await prisma.peopleShare.findMany({
      where: {
        status: "ACCEPTED",
        OR: [
          { fromUserId: authResult.id },
          { toUserId: authResult.id },
        ],
      },
      include: {
        fromUser: true,
        toUser: true,
      },
    });

    // Collect the "other" user IDs
    const otherUserIds = shares.map((s) =>
      s.fromUserId === authResult.id ? s.toUserId : s.fromUserId
    );

    if (otherUserIds.length === 0) {
      return apiSuccess([]);
    }

    // Fetch all devices for all contacts in one query
    const devices = await prisma.device.findMany({
      where: {
        userId: { in: otherUserIds },
        isActive: true,
      },
      include: {
        locations: {
          orderBy: { timestamp: "desc" },
          take: 1,
        },
        user: true,
      },
    });

    // Group devices by user
    const devicesByUser = new Map<string, typeof devices>();
    for (const device of devices) {
      const list = devicesByUser.get(device.userId) || [];
      list.push(device);
      devicesByUser.set(device.userId, list);
    }

    // Build the result — one entry per person
    const otherUsers = shares.map((s) =>
      s.fromUserId === authResult.id ? s.toUser : s.fromUser
    );

    // Determine sharing direction per user
    // "mutual" = both directions accepted, "sharing" = I share with them, "receiving" = they share with me
    const sharingDirections = new Map<string, "mutual" | "sharing" | "receiving">();
    for (const s of shares) {
      const otherId = s.fromUserId === authResult.id ? s.toUserId : s.fromUserId;
      const direction = s.fromUserId === authResult.id ? "sharing" : "receiving";
      const existing = sharingDirections.get(otherId);
      if (existing && existing !== direction) {
        sharingDirections.set(otherId, "mutual");
      } else if (!existing) {
        sharingDirections.set(otherId, direction);
      }
    }

    // Dedupe users (in case of multiple share records)
    const seenIds = new Set<string>();
    const result: PersonWithDevices[] = [];

    for (const user of otherUsers) {
      if (seenIds.has(user.id)) continue;
      seenIds.add(user.id);

      const userDevices = devicesByUser.get(user.id) || [];

      const devicesWithLocation: DeviceWithLocation[] = userDevices.map((d) => ({
        id: d.id,
        userId: d.userId,
        name: d.name,
        platform: d.platform as DeviceWithLocation["platform"],
        token: "", // Don't expose other users' device tokens
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

      result.push({
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          avatar: user.avatar,
          role: user.role as "ADMIN" | "MEMBER",
          createdAt: user.createdAt.toISOString(),
        },
        devices: devicesWithLocation,
        sharingDirection: sharingDirections.get(user.id) || "mutual",
      });
    }

    return apiSuccess(result);
  } catch (error) {
    log.error("people", "People list failed", error);
    return apiError("Internal server error", 500);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const authResult = await authenticateRequest(req);
    if (authResult instanceof Response) return authResult;

    const id = req.nextUrl.searchParams.get("id");
    if (!id) {
      return apiError("Share ID required", 400);
    }

    const share = await prisma.peopleShare.findFirst({
      where: {
        id,
        OR: [
          { fromUserId: authResult.id },
          { toUserId: authResult.id },
        ],
      },
    });

    if (!share) {
      return apiError("Share not found", 404);
    }

    await prisma.peopleShare.delete({ where: { id } });

    return apiSuccess({ message: "Sharing stopped" });
  } catch (error) {
    log.error("people", "People delete failed", error);
    return apiError("Internal server error", 500);
  }
}
