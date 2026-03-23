import { NextRequest } from "next/server";
import { log } from "@/lib/logger";
import { prisma } from "@/lib/db";
import { apiSuccess, apiError } from "@/lib/api-response";
import { authenticateRequest } from "@/lib/auth-guard";
import { sendEmail } from "@/lib/email";
import { rateLimit } from "@/lib/rate-limit";

export async function GET(req: NextRequest) {
  try {
    const authResult = await authenticateRequest(req);
    if (authResult instanceof Response) return authResult;

    const geofences = await prisma.geofence.findMany({
      where: { userId: authResult.id },
      include: {
        monitoredUser: { select: { id: true, name: true, email: true } },
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

    const { allowed } = rateLimit(`geofence-create:${authResult.id}`, 20, 60_000);
    if (!allowed) return apiError("Too many requests", 429);

    const { name, lat, lng, radiusM, onEnter, onExit, monitoredUserId } = await req.json();

    if (!name || lat == null || lng == null) {
      return apiError("name, lat, and lng are required", 400);
    }

    // If monitoring another user, validate an accepted PeopleShare exists
    if (monitoredUserId) {
      const share = await prisma.peopleShare.findFirst({
        where: {
          status: "ACCEPTED",
          OR: [
            { fromUserId: authResult.id, toUserId: monitoredUserId },
            { fromUserId: monitoredUserId, toUserId: authResult.id },
          ],
        },
      });
      if (!share) {
        return apiError("You can only create geofences for people who share with you", 403);
      }
    }

    const geofence = await prisma.geofence.create({
      data: {
        userId: authResult.id,
        monitoredUserId: monitoredUserId || null,
        name,
        lat,
        lng,
        radiusM: radiusM || 200,
        onEnter: onEnter !== false,
        onExit: onExit !== false,
      },
    });

    // Notify monitored user by email
    if (monitoredUserId) {
      const [owner, monitored] = await Promise.all([
        prisma.user.findUnique({ where: { id: authResult.id }, select: { name: true, email: true } }),
        prisma.user.findUnique({ where: { id: monitoredUserId }, select: { email: true } }),
      ]);
      if (monitored?.email && owner) {
        const ownerName = owner.name || owner.email;
        sendEmail({
          to: monitored.email,
          subject: `${ownerName} created a geofence for you on FindMe`,
          html: `
            <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto;">
              <h2 style="color: #3b82f6;">FindMe - Geofence Created</h2>
              <p><strong>${ownerName}</strong> has created a geofence named <strong>"${name}"</strong> to monitor your location.</p>
              <p>You will be tracked for enter/exit events at this location.</p>
              <p style="color: #666; font-size: 12px; margin-top: 24px;">
                This is an automated notification from FindMe.
              </p>
            </div>
          `,
        }).catch((e) => log.error("geofences", "Failed to notify monitored user", e));
      }
    }

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
