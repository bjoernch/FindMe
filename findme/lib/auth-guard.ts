import { NextRequest } from "next/server";
import crypto from "crypto";
import { auth } from "./auth";
import { verifyJwt } from "./jwt";
import { prisma } from "./db";
import { apiError } from "./api-response";

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: string;
}

/**
 * Authenticate a request using either NextAuth session or JWT Bearer token.
 * Returns the authenticated user or a NextResponse error.
 *
 * For JWT tokens (mobile), checks that the token was issued after the user's
 * last password change — tokens issued before a password change are rejected.
 */
export async function authenticateRequest(
  req: NextRequest
): Promise<AuthenticatedUser | Response> {
  // Try JWT Bearer token first (mobile clients)
  const authHeader = req.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const payload = verifyJwt(token);

    if (payload) {
      // Check if token was issued before password change (session invalidation)
      if (payload.iat) {
        try {
          const user = await prisma.user.findUnique({
            where: { id: payload.userId },
            select: { passwordChangedAt: true },
          });
          if (user?.passwordChangedAt) {
            const changedAtSec = Math.floor(user.passwordChangedAt.getTime() / 1000);
            if (payload.iat < changedAtSec) {
              return apiError("Token invalidated by password change. Please sign in again.", 401);
            }
          }
        } catch {
          // If DB check fails, allow the token (don't break auth on transient DB errors)
        }
      }

      return { id: payload.userId, email: payload.email, role: payload.role };
    }

    // JWT failed - try API key authentication
    try {
      const keyHash = crypto.createHash("sha256").update(token).digest("hex");
      const apiKey = await prisma.apiKey.findUnique({
        where: { keyHash },
        include: { user: true },
      });

      if (apiKey) {
        // Update lastUsed timestamp (fire-and-forget)
        prisma.apiKey.update({
          where: { id: apiKey.id },
          data: { lastUsed: new Date() },
        }).catch(() => {});

        return { id: apiKey.user.id, email: apiKey.user.email, role: apiKey.user.role };
      }
    } catch {
      // If API key lookup fails, fall through to error
    }

    return apiError("Invalid or expired token", 401);
  }

  // Try NextAuth session (web dashboard)
  const session = await auth();
  if (session?.user?.id) {
    return {
      id: session.user.id,
      email: session.user.email || "",
      role: (session.user as { role?: string }).role || "MEMBER",
    };
  }

  return apiError("Authentication required", 401);
}

/**
 * Authenticate a request using a device token.
 * Used for location update endpoints.
 */
export async function authenticateDevice(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return apiError("Device token required", 401);
  }

  const token = authHeader.slice(7);
  const device = await prisma.device.findUnique({
    where: { token, isActive: true },
    include: { user: true },
  });

  if (!device) {
    return apiError("Invalid or inactive device token", 401);
  }

  return device;
}

/**
 * Check if the authenticated user has ADMIN role.
 */
export function requireAdmin(user: AuthenticatedUser): Response | null {
  if (user.role !== "ADMIN") {
    return apiError("Admin access required", 403) as unknown as Response;
  }
  return null;
}
