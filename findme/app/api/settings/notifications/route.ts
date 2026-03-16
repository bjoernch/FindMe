import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { apiSuccess, apiError } from "@/lib/api-response";
import { authenticateRequest } from "@/lib/auth-guard";
import { notificationPreferencesSchema } from "@/lib/validations";

const DEFAULTS = {
  emailInvitations: true,
  emailGeofence: true,
  pushInvitations: true,
  pushGeofence: true,
  pushLocationSharing: true,
  quietHoursStart: null as string | null,
  quietHoursEnd: null as string | null,
};

export async function GET(req: NextRequest) {
  try {
    const authResult = await authenticateRequest(req);
    if (authResult instanceof Response) return authResult;

    const prefs = await prisma.notificationPreference.findUnique({
      where: { userId: authResult.id },
    });

    return apiSuccess(prefs ?? { ...DEFAULTS, userId: authResult.id });
  } catch {
    return apiError("Internal server error", 500);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const authResult = await authenticateRequest(req);
    if (authResult instanceof Response) return authResult;

    const body = await req.json();
    const parsed = notificationPreferencesSchema.safeParse(body);

    if (!parsed.success) {
      return apiError(parsed.error.issues[0].message, 400);
    }

    const prefs = await prisma.notificationPreference.upsert({
      where: { userId: authResult.id },
      create: {
        userId: authResult.id,
        ...DEFAULTS,
        ...parsed.data,
      },
      update: parsed.data,
    });

    return apiSuccess(prefs);
  } catch {
    return apiError("Internal server error", 500);
  }
}
