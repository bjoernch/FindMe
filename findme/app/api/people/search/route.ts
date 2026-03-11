import { NextRequest } from "next/server";
import { log } from "@/lib/logger";
import { prisma } from "@/lib/db";
import { apiSuccess, apiError } from "@/lib/api-response";
import { authenticateRequest } from "@/lib/auth-guard";

export async function GET(req: NextRequest) {
  try {
    const authResult = await authenticateRequest(req);
    if (authResult instanceof Response) return authResult;

    const q = req.nextUrl.searchParams.get("q");
    if (!q || q.length < 1) {
      return apiError("Search query required", 400);
    }

    const users = await prisma.user.findMany({
      where: {
        email: { contains: q },
        id: { not: authResult.id },
      },
      select: {
        id: true,
        email: true,
        name: true,
        avatar: true,
        role: true,
        createdAt: true,
      },
      take: 10,
    });

    return apiSuccess(
      users.map((u) => ({
        id: u.id,
        email: u.email,
        name: u.name,
        avatar: u.avatar,
        role: u.role as "ADMIN" | "MEMBER",
        createdAt: u.createdAt.toISOString(),
      }))
    );
  } catch (error) {
    log.error("people.search", "People search failed", error);
    return apiError("Internal server error", 500);
  }
}
