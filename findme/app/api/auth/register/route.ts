import { NextRequest } from "next/server";
import { log } from "@/lib/logger";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { apiSuccess, apiError } from "@/lib/api-response";
import { registerSchema } from "@/lib/validations";
import { signJwt, signRefreshToken } from "@/lib/jwt";
import { rateLimit } from "@/lib/rate-limit";
import type { AuthTokens, UserPublic } from "@/types/api";

export async function POST(req: NextRequest) {
  try {
    // Rate limit: 5 registrations per hour per IP
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const { allowed } = rateLimit(`register:${ip}`, 5, 60 * 60 * 1000);
    if (!allowed) {
      return apiError(
        "Too many registration attempts. Please try again later.",
        429
      );
    }

    const body = await req.json();
    const parsed = registerSchema.safeParse(body);

    if (!parsed.success) {
      return apiError(parsed.error.issues[0].message, 400);
    }

    const { email, password, name } = parsed.data;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return apiError("Email already registered", 409);
    }

    // First user becomes ADMIN
    const userCount = await prisma.user.count();
    const role = userCount === 0 ? "ADMIN" : "MEMBER";

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: { email, name, passwordHash, role },
    });

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

    return apiSuccess(tokens, undefined, 201);
  } catch (error) {
    log.error("auth.register", "Register failed", error);
    return apiError("Internal server error", 500);
  }
}
