import { NextRequest } from "next/server";
import { log } from "@/lib/logger";
import { prisma } from "@/lib/db";
import { apiSuccess, apiError } from "@/lib/api-response";
import { authenticateRequest } from "@/lib/auth-guard";
import type { UserPublic } from "@/types/api";

export async function GET(req: NextRequest) {
  try {
    const authResult = await authenticateRequest(req);
    if (authResult instanceof Response) return authResult;

    const user = await prisma.user.findUnique({
      where: { id: authResult.id },
    });

    if (!user) {
      return apiError("User not found", 404);
    }

    const userPublic: UserPublic = {
      id: user.id,
      email: user.email,
      name: user.name,
      avatar: user.avatar,
      role: user.role as UserPublic["role"],
      createdAt: user.createdAt.toISOString(),
    };

    return apiSuccess(userPublic);
  } catch (error) {
    log.error("auth.me", "Me failed", error);
    return apiError("Internal server error", 500);
  }
}
