import { NextRequest } from "next/server";
import { log } from "@/lib/logger";
import { prisma } from "@/lib/db";
import { apiSuccess, apiError } from "@/lib/api-response";
import { authenticateRequest } from "@/lib/auth-guard";
import { peopleRespondSchema } from "@/lib/validations";
import type { PeopleSharePublic } from "@/types/api";

export async function POST(req: NextRequest) {
  try {
    const authResult = await authenticateRequest(req);
    if (authResult instanceof Response) return authResult;

    const body = await req.json();
    const parsed = peopleRespondSchema.safeParse(body);

    if (!parsed.success) {
      return apiError(parsed.error.issues[0].message, 400);
    }

    const { shareId, action, shareBack } = parsed.data;

    const share = await prisma.peopleShare.findFirst({
      where: {
        id: shareId,
        toUserId: authResult.id,
        status: "PENDING",
      },
    });

    if (!share) {
      return apiError("Invitation not found", 404);
    }

    const updated = await prisma.peopleShare.update({
      where: { id: shareId },
      data: {
        status: action === "accept" ? "ACCEPTED" : "DECLINED",
      },
      include: { fromUser: true },
    });

    // If accepting and user wants to share back, create reverse share
    if (action === "accept" && shareBack) {
      await prisma.peopleShare.upsert({
        where: {
          fromUserId_toUserId: {
            fromUserId: authResult.id,
            toUserId: share.fromUserId,
          },
        },
        create: {
          fromUserId: authResult.id,
          toUserId: share.fromUserId,
          status: "ACCEPTED",
        },
        update: {
          status: "ACCEPTED",
        },
      });
      log.info("people.respond", `${authResult.email} accepted and shared back with ${updated.fromUser.email}`);
    }

    const result: PeopleSharePublic = {
      id: updated.id,
      fromUserId: updated.fromUserId,
      toUserId: updated.toUserId,
      status: updated.status as PeopleSharePublic["status"],
      createdAt: updated.createdAt.toISOString(),
      fromUser: {
        id: updated.fromUser.id,
        email: updated.fromUser.email,
        name: updated.fromUser.name,
        avatar: updated.fromUser.avatar,
        role: updated.fromUser.role as "ADMIN" | "MEMBER",
        createdAt: updated.fromUser.createdAt.toISOString(),
      },
    };

    return apiSuccess(result);
  } catch (error) {
    log.error("people.respond", "People respond failed", error);
    return apiError("Internal server error", 500);
  }
}
