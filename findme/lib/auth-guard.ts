import { NextRequest } from "next/server";
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
      return { id: payload.userId, email: payload.email, role: payload.role };
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
