import { NextRequest } from "next/server";
import { log } from "@/lib/logger";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { apiSuccess, apiError } from "@/lib/api-response";
import { authenticateRequest } from "@/lib/auth-guard";
import { settingsUpdateSchema } from "@/lib/validations";
import { sendEmail } from "@/lib/email";

export async function GET(req: NextRequest) {
  try {
    const authResult = await authenticateRequest(req);
    if (authResult instanceof Response) return authResult;

    const user = await prisma.user.findUnique({
      where: { id: authResult.id },
      select: {
        id: true,
        email: true,
        name: true,
        avatar: true,
        role: true,
        retentionDays: true,
        webhookUrl: true,
        webhookSecret: true,
        createdAt: true,
      },
    });

    if (!user) return apiError("User not found", 404);

    return apiSuccess({
      id: user.id,
      email: user.email,
      name: user.name,
      avatar: user.avatar,
      role: user.role,
      retentionDays: user.retentionDays,
      webhookUrl: user.webhookUrl,
      webhookSecret: user.webhookSecret ? "***" : null,
      createdAt: user.createdAt.toISOString(),
    });
  } catch (error) {
    log.error("settings", "Settings GET failed", error);
    return apiError("Internal server error", 500);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const authResult = await authenticateRequest(req);
    if (authResult instanceof Response) return authResult;

    const body = await req.json();
    const parsed = settingsUpdateSchema.safeParse(body);

    if (!parsed.success) {
      return apiError(parsed.error.issues[0].message, 400);
    }

    const { name, currentPassword, newPassword, retentionDays, webhookUrl, webhookSecret } = parsed.data;

    const user = await prisma.user.findUnique({
      where: { id: authResult.id },
    });

    if (!user) {
      return apiError("User not found", 404);
    }

    const updateData: Record<string, unknown> = {};
    let passwordChanged = false;

    if (name) {
      updateData.name = name;
    }

    if (webhookUrl !== undefined) {
      updateData.webhookUrl = webhookUrl;
    }

    if (webhookSecret !== undefined) {
      updateData.webhookSecret = webhookSecret;
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
      updateData.passwordChangedAt = new Date();
      passwordChanged = true;
    }

    const updatedUser = await prisma.user.update({
      where: { id: authResult.id },
      data: updateData,
    });

    // Send notification email about password change
    if (passwordChanged) {
      log.info("settings", `Password changed for user ${authResult.email}`);
      sendEmail({
        to: user.email,
        subject: "FindMe: Your password was changed",
        html: `
          <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto;">
            <h2 style="color: #3b82f6;">Password Changed</h2>
            <p>Your FindMe password was changed on ${new Date().toLocaleString()}.</p>
            <p>If you did not make this change, please reset your password immediately or contact your server administrator.</p>
            <p style="color: #666; font-size: 12px; margin-top: 24px;">
              This is an automated security notification from FindMe.
            </p>
          </div>
        `,
      }).catch(() => {}); // Fire-and-forget, don't block the response
    }

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
        message: passwordChanged ? "Password changed. Please sign in again on all devices." : "Settings updated",
        passwordChanged,
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
      message: passwordChanged ? "Password changed. Please sign in again on all devices." : "Settings updated",
      passwordChanged,
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
