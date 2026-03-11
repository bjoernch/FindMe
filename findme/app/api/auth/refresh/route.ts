import { NextRequest } from "next/server";
import { log } from "@/lib/logger";
import { prisma } from "@/lib/db";
import { apiSuccess, apiError } from "@/lib/api-response";
import { verifyJwt, signJwt, signRefreshToken } from "@/lib/jwt";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { refreshToken } = body;

    if (!refreshToken) {
      return apiError("Refresh token required", 400);
    }

    const payload = verifyJwt(refreshToken);
    if (!payload) {
      return apiError("Invalid or expired refresh token", 401);
    }

    // Verify user still exists and is valid
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
    });

    if (!user) {
      return apiError("User not found", 401);
    }

    const jwtPayload = { userId: user.id, email: user.email, role: user.role };

    return apiSuccess({
      accessToken: signJwt(jwtPayload),
      refreshToken: signRefreshToken(jwtPayload),
    });
  } catch (error) {
    log.error("auth.refresh", "Refresh failed", error);
    return apiError("Internal server error", 500);
  }
}
