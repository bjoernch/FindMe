import { NextRequest } from "next/server";
import crypto from "crypto";
import { log } from "@/lib/logger";
import { prisma } from "@/lib/db";
import { apiSuccess, apiError } from "@/lib/api-response";
import { authenticateRequest } from "@/lib/auth-guard";

export async function GET(req: NextRequest) {
  try {
    const authResult = await authenticateRequest(req);
    if (authResult instanceof Response) return authResult;

    const keys = await prisma.apiKey.findMany({
      where: { userId: authResult.id },
      select: {
        id: true,
        name: true,
        prefix: true,
        lastUsed: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return apiSuccess(keys);
  } catch (error) {
    log.error("api-keys", "API keys GET failed", error);
    return apiError("Internal server error", 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const authResult = await authenticateRequest(req);
    if (authResult instanceof Response) return authResult;

    const body = await req.json();
    const { name } = body;

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return apiError("Name is required", 400);
    }

    // Generate a random API key
    const rawKey = crypto.randomBytes(32).toString("base64url");
    const prefix = rawKey.substring(0, 8);
    const keyHash = crypto.createHash("sha256").update(rawKey).digest("hex");

    const apiKey = await prisma.apiKey.create({
      data: {
        userId: authResult.id,
        name: name.trim(),
        keyHash,
        prefix,
      },
    });

    log.info("api-keys", `API key created: ${prefix}... for user ${authResult.email}`);

    return apiSuccess(
      {
        id: apiKey.id,
        name: apiKey.name,
        prefix: apiKey.prefix,
        key: rawKey,
        createdAt: apiKey.createdAt.toISOString(),
      },
      undefined,
      201
    );
  } catch (error) {
    log.error("api-keys", "API key create failed", error);
    return apiError("Internal server error", 500);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const authResult = await authenticateRequest(req);
    if (authResult instanceof Response) return authResult;

    const body = await req.json();
    const { keyId } = body;

    if (!keyId) {
      return apiError("keyId is required", 400);
    }

    const existing = await prisma.apiKey.findFirst({
      where: { id: keyId, userId: authResult.id },
    });

    if (!existing) {
      return apiError("API key not found", 404);
    }

    await prisma.apiKey.delete({ where: { id: keyId } });

    log.info("api-keys", `API key deleted: ${existing.prefix}... for user ${authResult.email}`);

    return apiSuccess({ deleted: true });
  } catch (error) {
    log.error("api-keys", "API key delete failed", error);
    return apiError("Internal server error", 500);
  }
}
