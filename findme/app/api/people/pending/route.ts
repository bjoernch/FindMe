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

    const pending = await prisma.peopleShare.findMany({
      where: {
        toUserId: authResult.id,
        status: "PENDING",
      },
      include: { fromUser: true },
      orderBy: { createdAt: "desc" },
    });

    const result: PeopleSharePublic[] = pending.map((s) => ({
      id: s.id,
      fromUserId: s.fromUserId,
      toUserId: s.toUserId,
      status: s.status as PeopleSharePublic["status"],
      createdAt: s.createdAt.toISOString(),
      fromUser: {
        id: s.fromUser.id,
        email: s.fromUser.email,
        name: s.fromUser.name,
        avatar: s.fromUser.avatar,
        role: s.fromUser.role as "ADMIN" | "MEMBER",
        createdAt: s.fromUser.createdAt.toISOString(),
      },
    }));

    return apiSuccess(result);
  } catch (error) {
    log.error("people.pending", "People pending failed", error);
    return apiError("Internal server error", 500);
  }
}
