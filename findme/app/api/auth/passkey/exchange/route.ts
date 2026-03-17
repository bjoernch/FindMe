import { NextRequest } from "next/server";
import { log } from "@/lib/logger";
import { prisma } from "@/lib/db";
import { apiSuccess, apiError } from "@/lib/api-response";
import { verifyJwt, signJwt, signRefreshToken } from "@/lib/jwt";
import { v4 as uuidv4 } from "uuid";
import type { UserPublic } from "@/types/api";

// In-memory store for one-time tokens (TTL 60s)
const oneTimeTokens = new Map<string, { userId: string; expiresAt: number }>();

// Cleanup expired tokens periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of oneTimeTokens) {
    if (val.expiresAt < now) oneTimeTokens.delete(key);
  }
}, 30_000);

/**
 * POST /api/auth/passkey/exchange
 *
 * Two modes:
 * 1. { passkeyLoginToken } → Generates a one-time token (called from browser page)
 * 2. { oneTimeToken } → Exchanges for full auth tokens (called from mobile app)
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Mode 1: Browser → generate one-time token from passkeyLoginToken
    if (body.passkeyLoginToken) {
      const payload = verifyJwt(body.passkeyLoginToken);
      if (!payload) {
        return apiError("Invalid or expired passkey login token", 401);
      }

      const token = uuidv4();
      oneTimeTokens.set(token, {
        userId: payload.userId,
        expiresAt: Date.now() + 60_000, // 60 second TTL
      });

      log.info("auth.passkey.exchange", `One-time token created for ${payload.email}`);
      return apiSuccess({ oneTimeToken: token });
    }

    // Mode 2: Mobile app → exchange one-time token for auth tokens
    if (body.oneTimeToken) {
      const stored = oneTimeTokens.get(body.oneTimeToken);
      if (!stored || stored.expiresAt < Date.now()) {
        oneTimeTokens.delete(body.oneTimeToken);
        return apiError("Invalid or expired token", 401);
      }

      // Consume the token (one-time use)
      oneTimeTokens.delete(body.oneTimeToken);

      const user = await prisma.user.findUnique({
        where: { id: stored.userId },
      });

      if (!user) {
        return apiError("User not found", 404);
      }

      const jwtPayload = { userId: user.id, email: user.email, role: user.role };
      const accessToken = signJwt(jwtPayload);
      const refreshToken = signRefreshToken(jwtPayload);

      const userPublic: UserPublic = {
        id: user.id,
        email: user.email,
        name: user.name,
        avatar: user.avatar,
        role: user.role as UserPublic["role"],
        createdAt: user.createdAt.toISOString(),
      };

      log.info("auth.passkey.exchange", `Mobile passkey login: ${user.email}`);

      return apiSuccess({
        accessToken,
        refreshToken,
        user: userPublic,
      });
    }

    return apiError("Missing passkeyLoginToken or oneTimeToken", 400);
  } catch (error) {
    log.error("auth.passkey.exchange", "Token exchange failed", error);
    return apiError("Internal server error", 500);
  }
}
