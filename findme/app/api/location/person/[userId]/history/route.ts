import { NextRequest } from "next/server";
import { log } from "@/lib/logger";
import { prisma } from "@/lib/db";
import { apiSuccess, apiError } from "@/lib/api-response";
import { authenticateRequest } from "@/lib/auth-guard";
import { historyQuerySchema } from "@/lib/validations";
import type { LocationData } from "@/types/api";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const authResult = await authenticateRequest(req);
    if (authResult instanceof Response) return authResult;

    const { userId: targetUserId } = await params;

    // Verify accepted PeopleShare exists with this user
    const share = await prisma.peopleShare.findFirst({
      where: {
        status: "ACCEPTED",
        OR: [
          { fromUserId: authResult.id, toUserId: targetUserId },
          { fromUserId: targetUserId, toUserId: authResult.id },
        ],
      },
    });

    if (!share) {
      return apiError("No accepted share with this person", 403);
    }

    // Get all active devices for the target user
    const devices = await prisma.device.findMany({
      where: { userId: targetUserId, isActive: true },
      select: { id: true },
    });

    if (devices.length === 0) {
      return apiSuccess([], { count: 0, userId: targetUserId });
    }

    const searchParams = Object.fromEntries(req.nextUrl.searchParams);
    const parsed = historyQuerySchema.safeParse(searchParams);

    if (!parsed.success) {
      return apiError(parsed.error.issues[0].message, 400);
    }

    const { from, to, limit } = parsed.data;

    const where: Record<string, unknown> = {
      deviceId: { in: devices.map((d) => d.id) },
    };
    if (from || to) {
      const timestamp: Record<string, Date> = {};
      if (from) timestamp.gte = new Date(from);
      if (to) timestamp.lte = new Date(to);
      where.timestamp = timestamp;
    }

    const locations = await prisma.location.findMany({
      where,
      orderBy: { timestamp: "desc" },
      take: limit,
      include: { device: { select: { name: true } } },
    });

    const result: (LocationData & { deviceName?: string })[] = locations.map((l) => ({
      id: l.id,
      deviceId: l.deviceId,
      deviceName: l.device.name,
      lat: l.lat,
      lng: l.lng,
      accuracy: l.accuracy,
      altitude: l.altitude,
      speed: l.speed,
      heading: l.heading,
      batteryLevel: l.batteryLevel,
      timestamp: l.timestamp.toISOString(),
    }));

    return apiSuccess(result, { count: result.length, userId: targetUserId });
  } catch (error) {
    log.error("location.personHistory", "Person history failed", error);
    return apiError("Internal server error", 500);
  }
}
