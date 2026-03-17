import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { apiSuccess, apiError } from "@/lib/api-response";
import { authenticateDevice } from "@/lib/auth-guard";

/**
 * GET /api/notifications/poll
 * Returns undelivered notifications using device token auth.
 * Used by the background location task to check for notifications.
 */
export async function GET(req: NextRequest) {
  try {
    const deviceResult = await authenticateDevice(req);
    if (deviceResult instanceof Response) return deviceResult;

    const notifications = await prisma.notification.findMany({
      where: {
        userId: deviceResult.userId,
        delivered: false,
      },
      orderBy: { createdAt: "asc" },
      take: 50,
    });

    if (notifications.length > 0) {
      await prisma.notification.updateMany({
        where: {
          id: { in: notifications.map((n) => n.id) },
        },
        data: { delivered: true },
      });
    }

    return apiSuccess(
      notifications.map((n) => ({
        id: n.id,
        title: n.title,
        body: n.body,
        type: n.type,
        data: n.data ? JSON.parse(n.data) : null,
        createdAt: n.createdAt.toISOString(),
      }))
    );
  } catch (error) {
    return apiError("Internal server error", 500);
  }
}
