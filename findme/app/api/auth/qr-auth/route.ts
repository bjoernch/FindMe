import { NextRequest } from "next/server";
import { log } from "@/lib/logger";
import { v4 as uuidv4 } from "uuid";
import { prisma } from "@/lib/db";
import { apiSuccess, apiError } from "@/lib/api-response";
import { signJwt, signRefreshToken } from "@/lib/jwt";
import { qrAuthSchema } from "@/lib/validations";
import type { QrAuthResponse } from "@/types/api";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = qrAuthSchema.safeParse(body);

    if (!parsed.success) {
      return apiError(parsed.error.issues[0].message, 400);
    }

    const { sessionId, deviceName, platform } = parsed.data;

    // Find the QR session by token
    const session = await prisma.qrSession.findUnique({
      where: { token: sessionId },
      include: { user: true },
    });

    if (!session) {
      return apiError("Invalid pairing token", 401);
    }

    if (session.used) {
      return apiError("Pairing token already used", 401);
    }

    if (session.expiresAt < new Date()) {
      return apiError("Pairing token expired", 401);
    }

    // Mark session as used and create device in a transaction
    const deviceToken = `fmd_${uuidv4().replace(/-/g, "")}`;

    const [, device] = await prisma.$transaction([
      prisma.qrSession.update({
        where: { id: session.id },
        data: { used: true },
      }),
      prisma.device.create({
        data: {
          userId: session.userId,
          name: deviceName,
          platform,
          token: deviceToken,
        },
      }),
    ]);

    const user = session.user;
    const accessToken = signJwt({
      userId: user.id,
      email: user.email,
      role: user.role,
    });
    const refreshToken = signRefreshToken({
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    const result: QrAuthResponse = {
      accessToken,
      refreshToken,
      deviceToken: device.token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatar: user.avatar,
        role: user.role as "ADMIN" | "MEMBER",
        createdAt: user.createdAt.toISOString(),
      },
    };

    return apiSuccess(result, undefined, 201);
  } catch (error) {
    log.error("auth.qr-auth", "QR auth failed", error);
    return apiError("Internal server error", 500);
  }
}
