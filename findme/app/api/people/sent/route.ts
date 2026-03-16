import { NextRequest } from "next/server";
import { log } from "@/lib/logger";
import { prisma } from "@/lib/db";
import { apiSuccess, apiError } from "@/lib/api-response";
import { authenticateRequest } from "@/lib/auth-guard";
import type { PeopleSharePublic } from "@/types/api";

export async function GET(req: NextRequest) {
  try {
    const authResult = await authenticateRequest(req);
    if (authResult instanceof Response) return authResult;

    const sent = await prisma.peopleShare.findMany({
      where: {
        fromUserId: authResult.id,
        status: "PENDING",
      },
      include: { toUser: true },
      orderBy: { createdAt: "desc" },
    });

    const result: PeopleSharePublic[] = sent.map((s) => ({
      id: s.id,
      fromUserId: s.fromUserId,
      toUserId: s.toUserId,
      status: s.status as PeopleSharePublic["status"],
      createdAt: s.createdAt.toISOString(),
      toUser: {
        id: s.toUser.id,
        email: s.toUser.email,
        name: s.toUser.name,
        avatar: s.toUser.avatar,
        role: s.toUser.role as "ADMIN" | "MEMBER",
        createdAt: s.toUser.createdAt.toISOString(),
      },
    }));

    return apiSuccess(result);
  } catch (error) {
    log.error("people.sent", "People sent failed", error);
    return apiError("Internal server error", 500);
  }
}
