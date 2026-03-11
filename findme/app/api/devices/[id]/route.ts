import { NextRequest } from "next/server";
import { log } from "@/lib/logger";
import { prisma } from "@/lib/db";
import { apiSuccess, apiError } from "@/lib/api-response";
import { authenticateRequest } from "@/lib/auth-guard";
import { deviceUpdateSchema } from "@/lib/validations";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await authenticateRequest(req);
    if (authResult instanceof Response) return authResult;

    const { id } = await params;
    const body = await req.json();
    const parsed = deviceUpdateSchema.safeParse(body);

    if (!parsed.success) {
      return apiError(parsed.error.issues[0].message, 400);
    }

    const device = await prisma.device.findFirst({
      where: { id, userId: authResult.id },
    });

    if (!device) {
      return apiError("Device not found", 404);
    }

    // If setting as primary, unset all other devices first
    if (parsed.data.isPrimary) {
      await prisma.$transaction([
        prisma.device.updateMany({
          where: { userId: authResult.id, isPrimary: true },
          data: { isPrimary: false },
        }),
        prisma.device.update({
          where: { id },
          data: parsed.data,
        }),
      ]);
    } else {
      await prisma.device.update({
        where: { id },
        data: parsed.data,
      });
    }

    const updated = await prisma.device.findUnique({ where: { id } });

    return apiSuccess({
      id: updated!.id,
      userId: updated!.userId,
      name: updated!.name,
      platform: updated!.platform,
      token: updated!.token,
      isActive: updated!.isActive,
      isPrimary: updated!.isPrimary,
      lastSeen: updated!.lastSeen?.toISOString() ?? null,
      createdAt: updated!.createdAt.toISOString(),
    });
  } catch (error) {
    log.error("devices", "Device update failed", error);
    return apiError("Internal server error", 500);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await authenticateRequest(req);
    if (authResult instanceof Response) return authResult;

    const { id } = await params;

    const device = await prisma.device.findFirst({
      where: { id, userId: authResult.id },
    });

    if (!device) {
      return apiError("Device not found", 404);
    }

    await prisma.device.update({
      where: { id },
      data: { isActive: false },
    });

    return apiSuccess({ message: "Device deactivated" });
  } catch (error) {
    log.error("devices", "Device delete failed", error);
    return apiError("Internal server error", 500);
  }
}
