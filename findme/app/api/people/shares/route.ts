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

    const shares = await prisma.peopleShare.findMany({
      where: {
        status: "ACCEPTED",
        OR: [
          { fromUserId: authResult.id },
          { toUserId: authResult.id },
        ],
      },
      orderBy: { createdAt: "desc" },
    });

    const result: PeopleSharePublic[] = shares.map((s) => ({
      id: s.id,
      fromUserId: s.fromUserId,
      toUserId: s.toUserId,
      status: s.status as PeopleSharePublic["status"],
      createdAt: s.createdAt.toISOString(),
    }));

    return apiSuccess(result);
  } catch (error) {
    log.error("people.shares", "People shares failed", error);
    return apiError("Internal server error", 500);
  }
}
