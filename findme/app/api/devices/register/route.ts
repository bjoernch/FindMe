import { NextRequest } from "next/server";
import { log } from "@/lib/logger";
import { v4 as uuidv4 } from "uuid";
import { prisma } from "@/lib/db";
import { apiSuccess, apiError } from "@/lib/api-response";
import { authenticateRequest } from "@/lib/auth-guard";
import { deviceRegisterSchema } from "@/lib/validations";

export async function POST(req: NextRequest) {
  try {
    const authResult = await authenticateRequest(req);
    if (authResult instanceof Response) return authResult;

    const body = await req.json();
    const parsed = deviceRegisterSchema.safeParse(body);

    if (!parsed.success) {
      return apiError(parsed.error.issues[0].message, 400);
    }

    const { name, platform } = parsed.data;
    const token = `fmd_${uuidv4().replace(/-/g, "")}`;

    // Auto-set first device as primary
    const existingCount = await prisma.device.count({
      where: { userId: authResult.id },
    });
    const isPrimary = existingCount === 0;

    const device = await prisma.device.create({
      data: {
        userId: authResult.id,
        name,
        platform,
        token,
        isPrimary,
      },
    });

    return apiSuccess(
      {
        id: device.id,
        userId: device.userId,
        name: device.name,
        platform: device.platform,
        token: device.token,
        isActive: device.isActive,
        isPrimary: device.isPrimary,
        lastSeen: device.lastSeen?.toISOString() ?? null,
        createdAt: device.createdAt.toISOString(),
      },
      undefined,
      201
    );
  } catch (error) {
    log.error("devices.register", "Device register failed", error);
    return apiError("Internal server error", 500);
  }
}
