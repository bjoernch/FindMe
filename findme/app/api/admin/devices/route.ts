import { NextRequest } from "next/server";
import { log } from "@/lib/logger";
import { prisma } from "@/lib/db";
import { apiSuccess, apiError } from "@/lib/api-response";
import { authenticateRequest, requireAdmin } from "@/lib/auth-guard";
import type { AdminDeviceView } from "@/types/api";

export async function GET(req: NextRequest) {
  try {
    const authResult = await authenticateRequest(req);
    if (authResult instanceof Response) return authResult;

    const adminCheck = requireAdmin(authResult);
    if (adminCheck) return adminCheck;

    const devices = await prisma.device.findMany({
      include: {
        user: { select: { name: true, email: true } },
        _count: { select: { locations: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    const result: AdminDeviceView[] = devices.map((d) => ({
      id: d.id,
      userId: d.userId,
      name: d.name,
      platform: d.platform as AdminDeviceView["platform"],
      token: d.token,
      isActive: d.isActive,
      isPrimary: d.isPrimary,
      lastSeen: d.lastSeen?.toISOString() ?? null,
      createdAt: d.createdAt.toISOString(),
      userName: d.user.name,
      userEmail: d.user.email,
      locationCount: d._count.locations,
    }));

    return apiSuccess(result);
  } catch (error) {
    log.error("admin.devices", "Admin devices failed", error);
    return apiError("Internal server error", 500);
  }
}
