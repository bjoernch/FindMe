import { NextRequest } from "next/server";
import { log } from "@/lib/logger";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { apiSuccess, apiError } from "@/lib/api-response";
import { authenticateRequest, requireAdmin } from "@/lib/auth-guard";
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

    return apiSuccess({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      createdAt: user.createdAt.toISOString(),
      temporaryPassword: password,
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
      const tempPassword =
        Math.random().toString(36).slice(2) +
        Math.random().toString(36).slice(2).toUpperCase();
      const passwordHash = await bcrypt.hash(tempPassword, 12);

      await prisma.user.update({
        where: { id: userId },
        data: { passwordHash },
      });

      return apiSuccess({ temporaryPassword: tempPassword });
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
