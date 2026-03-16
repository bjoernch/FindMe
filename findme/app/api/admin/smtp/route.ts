import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

const SMTP_KEYS = ["smtp_host", "smtp_port", "smtp_user", "smtp_pass", "smtp_from", "smtp_secure"] as const;

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
      where: { key: { in: [...SMTP_KEYS] } },
    });

    const result: Record<string, string> = {};
    for (const s of settings) {
      // Mask the password
      if (s.key === "smtp_pass") {
        result[s.key] = s.value ? "••••••••" : "";
      } else {
        result[s.key] = s.value;
      }
    }

    // Also show if env vars are set (as fallback info)
    const envConfigured = !!(process.env.SMTP_HOST && process.env.SMTP_USER);

    return NextResponse.json({
      success: true,
      data: { settings: result, envConfigured },
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

    for (const key of SMTP_KEYS) {
      const value = body[key];
      if (value !== undefined) {
        // Don't update password if it's the masked placeholder
        if (key === "smtp_pass" && value === "••••••••") continue;

        await prisma.appSetting.upsert({
          where: { key },
          update: { value: String(value) },
          create: { key, value: String(value) },
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

export async function POST(req: NextRequest) {
  // Test SMTP connection
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ success: false, data: null, error: "Unauthorized" }, { status: 401 });
  }
  const role = (session.user as { role?: string }).role;
  if (role !== "ADMIN") {
    return NextResponse.json({ success: false, data: null, error: "Forbidden" }, { status: 403 });
  }

  try {
    const { getSmtpConfig } = await import("@/lib/email");
    const config = await getSmtpConfig();

    if (!config) {
      return NextResponse.json({
        success: false,
        data: null,
        error: "SMTP not configured. Save settings first.",
      });
    }

    const nodemailer = await import("nodemailer");
    const transport = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: { user: config.user, pass: config.pass },
    });

    await transport.verify();

    return NextResponse.json({
      success: true,
      data: { message: "SMTP connection successful" },
      error: null,
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      data: null,
      error: error instanceof Error ? error.message : "SMTP connection failed",
    });
  }
}
