import { NextRequest } from "next/server";
import { log } from "@/lib/logger";
import { prisma } from "@/lib/db";
import { apiSuccess, apiError } from "@/lib/api-response";
import { authenticateRequest } from "@/lib/auth-guard";

export async function GET(req: NextRequest) {
  try {
    const authResult = await authenticateRequest(req);
    if (authResult instanceof Response) return authResult;
    const user = authResult;

    const passkeys = await prisma.passkey.findMany({
      where: { userId: user.id },
      select: {
        id: true,
        name: true,
        deviceType: true,
        backedUp: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return apiSuccess(
      passkeys.map((pk) => ({
        ...pk,
        createdAt: pk.createdAt.toISOString(),
      }))
    );
  } catch (error) {
    log.error("settings.passkeys", "List passkeys failed", error);
    return apiError("Internal server error", 500);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const authResult = await authenticateRequest(req);
    if (authResult instanceof Response) return authResult;
    const user = authResult;

    const { searchParams } = new URL(req.url);
    const passkeyId = searchParams.get("id");

    if (!passkeyId) {
      return apiError("Missing passkey id", 400);
    }

    // Ensure the passkey belongs to the user
    const passkey = await prisma.passkey.findFirst({
      where: { id: passkeyId, userId: user.id },
    });

    if (!passkey) {
      return apiError("Passkey not found", 404);
    }

    await prisma.passkey.delete({ where: { id: passkeyId } });

    return apiSuccess({ deleted: true });
  } catch (error) {
    log.error("settings.passkeys", "Delete passkey failed", error);
    return apiError("Internal server error", 500);
  }
}
