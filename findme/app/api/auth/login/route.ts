import { NextRequest } from "next/server";
import { log } from "@/lib/logger";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { apiSuccess, apiError } from "@/lib/api-response";
import { loginSchema } from "@/lib/validations";
import { signJwt, signRefreshToken } from "@/lib/jwt";
import { rateLimit } from "@/lib/rate-limit";
import type { AuthTokens, UserPublic } from "@/types/api";

export async function POST(req: NextRequest) {
  try {
    // Brute force protection: 10 attempts per 15 minutes per IP
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const { allowed } = rateLimit(`login:${ip}`, 10, 15 * 60 * 1000);
    if (!allowed) {
      return apiError(
        "Too many login attempts. Please try again later.",
        429
      );
    }

    const body = await req.json();
    const parsed = loginSchema.safeParse(body);

    if (!parsed.success) {
      return apiError(parsed.error.issues[0].message, 400);
    }

    const { email, password } = parsed.data;

    // Per-email rate limit: 5 attempts per 15 minutes
    const { allowed: emailAllowed } = rateLimit(
      `login:email:${email}`,
      5,
      15 * 60 * 1000
    );
    if (!emailAllowed) {
      return apiError(
        "Too many login attempts for this account. Please try again later.",
        429
      );
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return apiError("Invalid email or password", 401);
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      return apiError("Invalid email or password", 401);
    }

    const userPublic: UserPublic = {
      id: user.id,
      email: user.email,
      name: user.name,
      avatar: user.avatar,
      role: user.role as UserPublic["role"],
      createdAt: user.createdAt.toISOString(),
    };

    const jwtPayload = { userId: user.id, email: user.email, role: user.role };
    const tokens: AuthTokens = {
      accessToken: signJwt(jwtPayload),
      refreshToken: signRefreshToken(jwtPayload),
      user: userPublic,
    };

    return apiSuccess(tokens);
  } catch (error) {
    log.error("auth.login", "Login failed", error);
    return apiError("Internal server error", 500);
  }
}
