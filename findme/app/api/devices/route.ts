import { NextRequest } from "next/server";
import { log } from "@/lib/logger";
import { prisma } from "@/lib/db";
import { apiSuccess, apiError } from "@/lib/api-response";
import { authenticateRequest } from "@/lib/auth-guard";

export async function GET(req: NextRequest) {
  try {
    const authResult = await authenticateRequest(req);
    if (authResult instanceof Response) return authResult;

    const devices = await prisma.device.findMany({
      where: { userId: authResult.id },
      orderBy: { createdAt: "desc" },
    });

    return apiSuccess(
      devices.map((d) => ({
        id: d.id,
        userId: d.userId,
        name: d.name,
        platform: d.platform,
        token: d.token,
        isActive: d.isActive,
        isPrimary: d.isPrimary,
        lastSeen: d.lastSeen?.toISOString() ?? null,
        createdAt: d.createdAt.toISOString(),
      }))
    );
  } catch (error) {
    log.error("devices", "Devices list failed", error);
    return apiError("Internal server error", 500);
  }
}
