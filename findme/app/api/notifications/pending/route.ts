import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { apiSuccess, apiError } from "@/lib/api-response";
import { authenticateRequest } from "@/lib/auth-guard";

/**
 * GET /api/notifications/pending
 * Returns undelivered notifications for the authenticated user and marks them as delivered.
 * Used by polling-based clients (FOSS builds without Firebase/FCM).
 */
export async function GET(req: NextRequest) {
  try {
    const authResult = await authenticateRequest(req);
    if (authResult instanceof Response) return authResult;

    const notifications = await prisma.notification.findMany({
      where: {
        userId: authResult.id,
        delivered: false,
      },
      orderBy: { createdAt: "asc" },
      take: 50,
    });

    if (notifications.length > 0) {
      // Mark as delivered
      await prisma.notification.updateMany({
        where: {
          id: { in: notifications.map((n) => n.id) },
        },
        data: { delivered: true },
      });
    }

    // Clean up old delivered notifications (older than 7 days)
    await prisma.notification.deleteMany({
      where: {
        userId: authResult.id,
        delivered: true,
        createdAt: { lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      },
    }).catch(() => {}); // Non-critical cleanup

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
