import { NextRequest } from "next/server";
import { log } from "@/lib/logger";
import { prisma } from "@/lib/db";
import { apiSuccess, apiError } from "@/lib/api-response";
import { authenticateRequest } from "@/lib/auth-guard";

export async function GET(req: NextRequest) {
  try {
    const authResult = await authenticateRequest(req);
    if (authResult instanceof Response) return authResult;

    const geofences = await prisma.geofence.findMany({
      where: { userId: authResult.id },
      include: {
        events: {
          orderBy: { timestamp: "desc" },
          take: 5,
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return apiSuccess(geofences);
  } catch (error) {
    log.error("geofences", "Geofences GET failed", error);
    return apiError("Internal server error", 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const authResult = await authenticateRequest(req);
    if (authResult instanceof Response) return authResult;

    const { name, lat, lng, radiusM, onEnter, onExit } = await req.json();

    if (!name || lat == null || lng == null) {
      return apiError("name, lat, and lng are required", 400);
    }

    const geofence = await prisma.geofence.create({
      data: {
        userId: authResult.id,
        name,
        lat,
        lng,
        radiusM: radiusM || 200,
        onEnter: onEnter !== false,
        onExit: onExit !== false,
      },
    });

    return apiSuccess(geofence, undefined, 201);
  } catch (error) {
    log.error("geofences", "Geofence create failed", error);
    return apiError("Internal server error", 500);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const authResult = await authenticateRequest(req);
    if (authResult instanceof Response) return authResult;

    const { geofenceId } = await req.json();
    if (!geofenceId) return apiError("geofenceId is required", 400);

    const geofence = await prisma.geofence.findFirst({
      where: { id: geofenceId, userId: authResult.id },
    });

    if (!geofence) return apiError("Geofence not found", 404);

    await prisma.geofence.delete({ where: { id: geofenceId } });

    return apiSuccess({ deleted: true });
  } catch (error) {
    log.error("geofences", "Geofence delete failed", error);
    return apiError("Internal server error", 500);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const authResult = await authenticateRequest(req);
    if (authResult instanceof Response) return authResult;

    const { geofenceId, name, radiusM, isActive, onEnter, onExit } =
      await req.json();
    if (!geofenceId) return apiError("geofenceId is required", 400);

    const geofence = await prisma.geofence.findFirst({
      where: { id: geofenceId, userId: authResult.id },
    });

    if (!geofence) return apiError("Geofence not found", 404);

    const updated = await prisma.geofence.update({
      where: { id: geofenceId },
      data: {
        ...(name !== undefined && { name }),
        ...(radiusM !== undefined && { radiusM }),
        ...(isActive !== undefined && { isActive }),
        ...(onEnter !== undefined && { onEnter }),
        ...(onExit !== undefined && { onExit }),
      },
    });

    return apiSuccess(updated);
  } catch (error) {
    log.error("geofences", "Geofence update failed", error);
    return apiError("Internal server error", 500);
  }
}
