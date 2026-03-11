import { NextRequest } from "next/server";
import { log } from "@/lib/logger";
import { prisma } from "@/lib/db";
import { apiSuccess, apiError } from "@/lib/api-response";
import { authenticateRequest } from "@/lib/auth-guard";

// Register a push notification token
export async function POST(req: NextRequest) {
  try {
    const authResult = await authenticateRequest(req);
    if (authResult instanceof Response) return authResult;

    const { token, platform } = await req.json();

    if (!token) {
      return apiError("Push token is required", 400);
    }

    // Upsert: if token exists, update userId; otherwise create
    await prisma.pushToken.upsert({
      where: { token },
      update: { userId: authResult.id, platform: platform || "expo" },
      create: {
        userId: authResult.id,
        token,
        platform: platform || "expo",
      },
    });

    return apiSuccess({ registered: true });
  } catch (error) {
    log.error("push", "Push register failed", error);
    return apiError("Internal server error", 500);
  }
}

// Unregister a push token
export async function DELETE(req: NextRequest) {
  try {
    const authResult = await authenticateRequest(req);
    if (authResult instanceof Response) return authResult;

    const { token } = await req.json();
    if (!token) return apiError("Push token is required", 400);

    await prisma.pushToken.deleteMany({
      where: { token, userId: authResult.id },
    });

    return apiSuccess({ unregistered: true });
  } catch (error) {
    log.error("push", "Push unregister failed", error);
    return apiError("Internal server error", 500);
  }
}
