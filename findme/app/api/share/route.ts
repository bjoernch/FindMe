import { NextRequest } from "next/server";
import { log } from "@/lib/logger";
import { v4 as uuidv4 } from "uuid";
import { prisma } from "@/lib/db";
import { apiSuccess, apiError } from "@/lib/api-response";
import { authenticateRequest } from "@/lib/auth-guard";
import { shareCreateSchema } from "@/lib/validations";

function getExpiryDate(expiresIn: string | undefined): Date | null {
  if (!expiresIn || expiresIn === "never") return null;
  const now = new Date();
  switch (expiresIn) {
    case "1h":
      return new Date(now.getTime() + 60 * 60 * 1000);
    case "24h":
      return new Date(now.getTime() + 24 * 60 * 60 * 1000);
    case "7d":
      return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    default:
      return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    const authResult = await authenticateRequest(req);
    if (authResult instanceof Response) return authResult;

    const body = await req.json();
    const parsed = shareCreateSchema.safeParse(body);

    if (!parsed.success) {
      return apiError(parsed.error.issues[0].message, 400);
    }

    const { targetUserId, expiresIn } = parsed.data;
    const shareToken = uuidv4();
    const expiresAt = getExpiryDate(expiresIn);

    const share = await prisma.share.create({
      data: {
        ownerId: authResult.id,
        targetUserId: targetUserId ?? null,
        shareToken,
        expiresAt,
      },
    });

    return apiSuccess(
      {
        id: share.id,
        ownerId: share.ownerId,
        targetUserId: share.targetUserId,
        shareToken: share.shareToken,
        expiresAt: share.expiresAt?.toISOString() ?? null,
        isActive: share.isActive,
        createdAt: share.createdAt.toISOString(),
      },
      undefined,
      201
    );
  } catch (error) {
    log.error("share", "Share create failed", error);
    return apiError("Internal server error", 500);
  }
}

export async function GET(req: NextRequest) {
  try {
    const authResult = await authenticateRequest(req);
    if (authResult instanceof Response) return authResult;

    const shares = await prisma.share.findMany({
      where: { ownerId: authResult.id },
      orderBy: { createdAt: "desc" },
    });

    return apiSuccess(
      shares.map((s) => ({
        id: s.id,
        ownerId: s.ownerId,
        targetUserId: s.targetUserId,
        shareToken: s.shareToken,
        expiresAt: s.expiresAt?.toISOString() ?? null,
        isActive: s.isActive,
        createdAt: s.createdAt.toISOString(),
      }))
    );
  } catch (error) {
    log.error("share", "Share list failed", error);
    return apiError("Internal server error", 500);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const authResult = await authenticateRequest(req);
    if (authResult instanceof Response) return authResult;

    const { searchParams } = req.nextUrl;
    const id = searchParams.get("id");

    if (!id) {
      return apiError("Share ID required", 400);
    }

    const share = await prisma.share.findFirst({
      where: { id, ownerId: authResult.id },
    });

    if (!share) {
      return apiError("Share not found", 404);
    }

    await prisma.share.update({
      where: { id },
      data: { isActive: false },
    });

    return apiSuccess({ message: "Share revoked" });
  } catch (error) {
    log.error("share", "Share delete failed", error);
    return apiError("Internal server error", 500);
  }
}
