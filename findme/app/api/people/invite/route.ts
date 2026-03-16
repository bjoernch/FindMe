import { NextRequest } from "next/server";
import { log } from "@/lib/logger";
import { prisma } from "@/lib/db";
import { apiSuccess, apiError } from "@/lib/api-response";
import { authenticateRequest } from "@/lib/auth-guard";
import { peopleInviteSchema } from "@/lib/validations";
import { sendInvitationEmail } from "@/lib/email";
import { sendPushWithPrefs } from "@/lib/push";
import { shouldNotify } from "@/lib/notification-preferences";
import type { PeopleSharePublic } from "@/types/api";

export async function POST(req: NextRequest) {
  try {
    const authResult = await authenticateRequest(req);
    if (authResult instanceof Response) return authResult;

    const body = await req.json();
    const parsed = peopleInviteSchema.safeParse(body);

    if (!parsed.success) {
      return apiError(parsed.error.issues[0].message, 400);
    }

    const { email } = parsed.data;

    const targetUser = await prisma.user.findUnique({
      where: { email },
    });

    if (!targetUser) {
      return apiError("No user found with that email", 404);
    }

    if (targetUser.id === authResult.id) {
      return apiError("You cannot invite yourself", 400);
    }

    // Check for existing share in either direction
    const existing = await prisma.peopleShare.findFirst({
      where: {
        OR: [
          { fromUserId: authResult.id, toUserId: targetUser.id },
          { fromUserId: targetUser.id, toUserId: authResult.id },
        ],
      },
    });

    if (existing) {
      if (existing.status === "ACCEPTED") {
        return apiError("You are already sharing with this person", 409);
      }
      if (existing.status === "PENDING") {
        return apiError("An invitation is already pending", 409);
      }
      if (existing.status === "DECLINED") {
        // Allow re-inviting by updating the declined share
        const updated = await prisma.peopleShare.update({
          where: { id: existing.id },
          data: {
            fromUserId: authResult.id,
            toUserId: targetUser.id,
            status: "PENDING",
          },
          include: { toUser: true },
        });

        const result: PeopleSharePublic = {
          id: updated.id,
          fromUserId: updated.fromUserId,
          toUserId: updated.toUserId,
          status: updated.status as PeopleSharePublic["status"],
          createdAt: updated.createdAt.toISOString(),
          toUser: {
            id: updated.toUser.id,
            email: updated.toUser.email,
            name: updated.toUser.name,
            avatar: updated.toUser.avatar,
            role: updated.toUser.role as "ADMIN" | "MEMBER",
            createdAt: updated.toUser.createdAt.toISOString(),
          },
        };

        // Send notifications for re-invite (respecting preferences)
        const fromUser = await prisma.user.findUnique({ where: { id: authResult.id } });
        const fromName = fromUser?.name || fromUser?.email || "Someone";
        const instanceUrl = process.env.FINDME_PUBLIC_URL || process.env.NEXTAUTH_URL || "";

        shouldNotify(targetUser.id, "email", "invitations").then((allowed) => {
          if (allowed) {
            sendInvitationEmail(targetUser.email, fromName, instanceUrl)
              .catch((e) => log.error("people.invite", "Re-invite email failed", e));
          }
        });

        sendPushWithPrefs(
          targetUser.id, "New Invitation",
          `${fromName} wants to share locations with you`,
          "invitations", { type: "invitation", shareId: updated.id }
        ).catch((e) => log.error("people.invite", "Re-invite push failed", e));

        return apiSuccess(result, undefined, 201);
      }
    }

    const share = await prisma.peopleShare.create({
      data: {
        fromUserId: authResult.id,
        toUserId: targetUser.id,
      },
      include: { toUser: true },
    });

    const result: PeopleSharePublic = {
      id: share.id,
      fromUserId: share.fromUserId,
      toUserId: share.toUserId,
      status: share.status as PeopleSharePublic["status"],
      createdAt: share.createdAt.toISOString(),
      toUser: {
        id: share.toUser.id,
        email: share.toUser.email,
        name: share.toUser.name,
        avatar: share.toUser.avatar,
        role: share.toUser.role as "ADMIN" | "MEMBER",
        createdAt: share.toUser.createdAt.toISOString(),
      },
    };

    // Send notifications (async, don't block response, respect preferences)
    const fromUser = await prisma.user.findUnique({ where: { id: authResult.id } });
    const fromName = fromUser?.name || fromUser?.email || "Someone";
    const instanceUrl = process.env.FINDME_PUBLIC_URL || process.env.NEXTAUTH_URL || "";

    shouldNotify(targetUser.id, "email", "invitations").then((allowed) => {
      if (allowed) {
        sendInvitationEmail(targetUser.email, fromName, instanceUrl)
          .catch((e) => log.error("people.invite", "Invite email failed", e));
      }
    });

    sendPushWithPrefs(
      targetUser.id, "New Invitation",
      `${fromName} wants to share locations with you`,
      "invitations", { type: "invitation", shareId: share.id }
    ).catch((e) => log.error("people.invite", "Invite push failed", e));

    return apiSuccess(result, undefined, 201);
  } catch (error) {
    log.error("people.invite", "People invite failed", error);
    return apiError("Internal server error", 500);
  }
}
