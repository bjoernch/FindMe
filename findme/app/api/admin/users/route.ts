import { NextRequest } from "next/server";
import { log } from "@/lib/logger";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { prisma } from "@/lib/db";
import { apiSuccess, apiError } from "@/lib/api-response";
import { authenticateRequest, requireAdmin } from "@/lib/auth-guard";
import { sendEmail } from "@/lib/email";
import { rateLimit } from "@/lib/rate-limit";
import type { AdminUserView } from "@/types/api";

export async function GET(req: NextRequest) {
  try {
    const authResult = await authenticateRequest(req);
    if (authResult instanceof Response) return authResult;

    const adminCheck = requireAdmin(authResult);
    if (adminCheck) return adminCheck;

    const users = await prisma.user.findMany({
      include: {
        _count: {
          select: {
            devices: true,
          },
        },
        devices: {
          include: {
            _count: {
              select: { locations: true },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const result: AdminUserView[] = users.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      avatar: u.avatar,
      role: u.role as AdminUserView["role"],
      createdAt: u.createdAt.toISOString(),
      deviceCount: u._count.devices,
      locationCount: u.devices.reduce(
        (sum, d) => sum + d._count.locations,
        0
      ),
    }));

    return apiSuccess(result);
  } catch (error) {
    log.error("admin.users", "Admin users failed", error);
    return apiError("Internal server error", 500);
  }
}

// Admin creates a user (for invite-only / registration-disabled mode)
export async function POST(req: NextRequest) {
  try {
    const authResult = await authenticateRequest(req);
    if (authResult instanceof Response) return authResult;

    const adminCheck = requireAdmin(authResult);
    if (adminCheck) return adminCheck;

    const { allowed } = rateLimit(`admin-create-user:${authResult.id}`, 10, 60_000);
    if (!allowed) return apiError("Too many requests", 429);

    const { email, name, password, role } = await req.json();
    if (!email || !password) return apiError("Email and password are required", 400);

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return apiError("Email already registered", 409);

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: {
        email,
        name: name || email.split("@")[0],
        passwordHash,
        role: role === "ADMIN" ? "ADMIN" : "MEMBER",
      },
    });

    log.info("admin.users", `Admin ${authResult.email} created user ${email}`);

    // Send credentials via email if SMTP is configured
    const instanceUrl = process.env.FINDME_PUBLIC_URL || process.env.NEXTAUTH_URL || "";
    const emailSent = await sendEmail({
      to: email,
      subject: "Your FindMe account has been created",
      html: `
        <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto;">
          <h2 style="color: #3b82f6;">Welcome to FindMe</h2>
          <p>An account has been created for you. Here are your login credentials:</p>
          <div style="background: #f3f4f6; padding: 16px; border-radius: 8px; margin: 16px 0;">
            <p style="margin: 4px 0;"><strong>Email:</strong> ${email}</p>
            <p style="margin: 4px 0;"><strong>Temporary Password:</strong> ${password}</p>
          </div>
          <p><strong>Please change your password after your first login.</strong></p>
          ${instanceUrl ? `<a href="${instanceUrl}/auth" style="display: inline-block; background: #3b82f6; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; margin-top: 12px;">Sign In</a>` : ""}
          <p style="color: #666; font-size: 12px; margin-top: 24px;">
            This is an automated message from FindMe.
          </p>
        </div>
      `,
    });

    return apiSuccess({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      createdAt: user.createdAt.toISOString(),
      credentialsSentViaEmail: emailSent,
    }, undefined, 201);
  } catch (error) {
    log.error("admin.users", "Admin create user failed", error);
    return apiError("Internal server error", 500);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const authResult = await authenticateRequest(req);
    if (authResult instanceof Response) return authResult;

    const adminCheck = requireAdmin(authResult);
    if (adminCheck) return adminCheck;

    const { userId } = await req.json();
    if (!userId) return apiError("userId is required", 400);

    // Prevent self-deletion
    if (userId === authResult.id) {
      return apiError("Cannot delete your own account", 400);
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return apiError("User not found", 404);

    // Cascade delete handles all related records
    await prisma.user.delete({ where: { id: userId } });

    return apiSuccess({ deleted: true, userId });
  } catch (error) {
    log.error("admin.users", "Admin delete user failed", error);
    return apiError("Internal server error", 500);
  }
}

// Admin actions: password reset, role toggle
export async function PATCH(req: NextRequest) {
  try {
    const authResult = await authenticateRequest(req);
    if (authResult instanceof Response) return authResult;

    const adminCheck = requireAdmin(authResult);
    if (adminCheck) return adminCheck;

    const { userId, action } = await req.json();
    if (!userId) return apiError("userId is required", 400);

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return apiError("User not found", 404);

    if (action === "resetPassword") {
      const tempPassword = crypto.randomBytes(16).toString("base64url");
      const passwordHash = await bcrypt.hash(tempPassword, 12);

      await prisma.user.update({
        where: { id: userId },
        data: { passwordHash, passwordChangedAt: new Date() },
      });

      // Send new password via email
      const instanceUrl = process.env.FINDME_PUBLIC_URL || process.env.NEXTAUTH_URL || "";
      const emailSent = await sendEmail({
        to: user.email,
        subject: "FindMe: Your password has been reset",
        html: `
          <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto;">
            <h2 style="color: #3b82f6;">Password Reset</h2>
            <p>Your password has been reset by an administrator.</p>
            <div style="background: #f3f4f6; padding: 16px; border-radius: 8px; margin: 16px 0;">
              <p style="margin: 4px 0;"><strong>New Password:</strong> ${tempPassword}</p>
            </div>
            <p><strong>Please change your password after signing in.</strong></p>
            ${instanceUrl ? `<a href="${instanceUrl}/auth" style="display: inline-block; background: #3b82f6; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; margin-top: 12px;">Sign In</a>` : ""}
          </div>
        `,
      });

      log.info("admin.users", `Admin ${authResult.email} reset password for ${user.email}`);

      return apiSuccess({ passwordReset: true, credentialsSentViaEmail: emailSent });
    }

    if (action === "toggleRole") {
      if (userId === authResult.id) {
        return apiError("Cannot change your own role", 400);
      }
      const newRole = user.role === "ADMIN" ? "MEMBER" : "ADMIN";
      await prisma.user.update({
        where: { id: userId },
        data: { role: newRole },
      });
      return apiSuccess({ userId, newRole });
    }

    return apiError("Invalid action", 400);
  } catch (error) {
    log.error("admin.users", "Admin user action failed", error);
    return apiError("Internal server error", 500);
  }
}
