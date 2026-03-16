import { NextRequest } from "next/server";
import { log } from "@/lib/logger";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/db";
import { apiSuccess, apiError } from "@/lib/api-response";
import { authenticateRequest } from "@/lib/auth-guard";
import { getPublicUrl } from "@/lib/settings";
import type { QrSessionPublic } from "@/types/api";

const QR_SESSION_TTL_MS = 5 * 60 * 1000; // 5 minutes

export async function POST(req: NextRequest) {
  try {
    const authResult = await authenticateRequest(req);
    if (authResult instanceof Response) return authResult;

    // Invalidate any existing unused sessions for this user
    await prisma.qrSession.updateMany({
      where: { userId: authResult.id, used: false },
      data: { used: true },
    });

    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + QR_SESSION_TTL_MS);

    const session = await prisma.qrSession.create({
      data: {
        userId: authResult.id,
        token,
        expiresAt,
      },
    });

    const serverUrl = await getPublicUrl() || req.nextUrl.origin;
    const qrData = `findme://pair?url=${encodeURIComponent(serverUrl)}&session=${session.token}`;

    const result: QrSessionPublic = {
      id: session.id,
      token: session.token,
      expiresAt: session.expiresAt.toISOString(),
      used: session.used,
      qrData,
    };

    return apiSuccess(result, undefined, 201);
  } catch (error) {
    log.error("auth.qr-session", "QR session create failed", error);
    return apiError("Internal server error", 500);
  }
}

export async function GET(req: NextRequest) {
  try {
    const authResult = await authenticateRequest(req);
    if (authResult instanceof Response) return authResult;

    const sessionId = req.nextUrl.searchParams.get("id");
    if (!sessionId) {
      return apiError("Session ID required", 400);
    }

    const session = await prisma.qrSession.findFirst({
      where: { id: sessionId, userId: authResult.id },
    });

    if (!session) {
      return apiError("Session not found", 404);
    }

    const expired = session.expiresAt < new Date();

    return apiSuccess({
      id: session.id,
      used: session.used,
      expired,
    });
  } catch (error) {
    log.error("auth.qr-session", "QR session poll failed", error);
    return apiError("Internal server error", 500);
  }
}
