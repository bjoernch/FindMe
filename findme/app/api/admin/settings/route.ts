import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

const SETTING_KEYS = ["public_url", "app_name"] as const;

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ success: false, data: null, error: "Unauthorized" }, { status: 401 });
  }
  const role = (session.user as { role?: string }).role;
  if (role !== "ADMIN") {
    return NextResponse.json({ success: false, data: null, error: "Forbidden" }, { status: 403 });
  }

  try {
    const settings = await prisma.appSetting.findMany({
      where: { key: { in: [...SETTING_KEYS] } },
    });

    const result: Record<string, string> = {};
    for (const s of settings) {
      result[s.key] = s.value;
    }

    // Show env var fallback values so admin knows what's currently active
    const envDefaults = {
      public_url: process.env.FINDME_PUBLIC_URL || process.env.NEXTAUTH_URL || "",
      app_name: "FindMe",
    };

    return NextResponse.json({
      success: true,
      data: { settings: result, envDefaults },
      error: null,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, data: null, error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ success: false, data: null, error: "Unauthorized" }, { status: 401 });
  }
  const role = (session.user as { role?: string }).role;
  if (role !== "ADMIN") {
    return NextResponse.json({ success: false, data: null, error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await req.json();

    for (const key of SETTING_KEYS) {
      const value = body[key];
      if (value !== undefined) {
        // Strip trailing slash from URLs
        const cleanValue = key === "public_url" ? String(value).replace(/\/+$/, "") : String(value);

        await prisma.appSetting.upsert({
          where: { key },
          update: { value: cleanValue },
          create: { key, value: cleanValue },
        });
      }
    }

    return NextResponse.json({ success: true, data: { saved: true }, error: null });
  } catch (error) {
    return NextResponse.json(
      { success: false, data: null, error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}
