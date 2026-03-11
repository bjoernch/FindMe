import { NextRequest } from "next/server";
import { log } from "@/lib/logger";
import { prisma } from "@/lib/db";
import { apiSuccess, apiError } from "@/lib/api-response";
import { authenticateRequest } from "@/lib/auth-guard";
import { historyQuerySchema } from "@/lib/validations";
import type { LocationData } from "@/types/api";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ deviceId: string }> }
) {
  try {
    const authResult = await authenticateRequest(req);
    if (authResult instanceof Response) return authResult;

    const { deviceId } = await params;

    // Verify device belongs to user
    const device = await prisma.device.findFirst({
      where: { id: deviceId, userId: authResult.id },
    });

    if (!device) {
      return apiError("Device not found", 404);
    }

    const searchParams = Object.fromEntries(req.nextUrl.searchParams);
    const parsed = historyQuerySchema.safeParse(searchParams);

    if (!parsed.success) {
      return apiError(parsed.error.issues[0].message, 400);
    }

    const { from, to, limit } = parsed.data;

    const where: Record<string, unknown> = { deviceId };
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
    });

    const result: LocationData[] = locations.map((l) => ({
      id: l.id,
      deviceId: l.deviceId,
      lat: l.lat,
      lng: l.lng,
      accuracy: l.accuracy,
      altitude: l.altitude,
      speed: l.speed,
      heading: l.heading,
      batteryLevel: l.batteryLevel,
      timestamp: l.timestamp.toISOString(),
    }));

    return apiSuccess(result, { count: result.length, deviceId });
  } catch (error) {
    log.error("location.history", "History failed", error);
    return apiError("Internal server error", 500);
  }
}
