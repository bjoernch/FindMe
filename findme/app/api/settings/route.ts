import { NextRequest } from "next/server";
import { log } from "@/lib/logger";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { apiSuccess, apiError } from "@/lib/api-response";
import { authenticateRequest } from "@/lib/auth-guard";
import { settingsUpdateSchema } from "@/lib/validations";

export async function PATCH(req: NextRequest) {
  try {
    const authResult = await authenticateRequest(req);
    if (authResult instanceof Response) return authResult;

    const body = await req.json();
    const parsed = settingsUpdateSchema.safeParse(body);

    if (!parsed.success) {
      return apiError(parsed.error.issues[0].message, 400);
    }

    const { name, currentPassword, newPassword, retentionDays } = parsed.data;

    const user = await prisma.user.findUnique({
      where: { id: authResult.id },
    });

    if (!user) {
      return apiError("User not found", 404);
    }

    const updateData: Record<string, unknown> = {};

    if (name) {
      updateData.name = name;
    }

    if (newPassword) {
      if (!currentPassword) {
        return apiError("Current password required to change password", 400);
      }

      const isValid = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!isValid) {
        return apiError("Current password is incorrect", 400);
      }

      updateData.passwordHash = await bcrypt.hash(newPassword, 12);
    }

    const updatedUser = await prisma.user.update({
      where: { id: authResult.id },
      data: updateData,
    });

    // Handle data retention
    if (retentionDays) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - retentionDays);

      const devices = await prisma.device.findMany({
        where: { userId: authResult.id },
        select: { id: true },
      });

      const deviceIds = devices.map((d) => d.id);

      const deleted = await prisma.location.deleteMany({
        where: {
          deviceId: { in: deviceIds },
          timestamp: { lt: cutoff },
        },
      });

      return apiSuccess({
        message: "Settings updated",
        locationsDeleted: deleted.count,
        user: {
          id: updatedUser.id,
          email: updatedUser.email,
          name: updatedUser.name,
          avatar: updatedUser.avatar,
          role: updatedUser.role,
          createdAt: updatedUser.createdAt.toISOString(),
        },
      });
    }

    return apiSuccess({
      message: "Settings updated",
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        name: updatedUser.name,
        avatar: updatedUser.avatar,
        role: updatedUser.role,
        createdAt: updatedUser.createdAt.toISOString(),
      },
    });
  } catch (error) {
    log.error("settings", "Settings failed", error);
    return apiError("Internal server error", 500);
  }
}
