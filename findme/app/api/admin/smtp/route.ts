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

export async function POST(_req: NextRequest) {
  // Test SMTP by sending an actual test email
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

    // Send an actual test email to the admin's own address
    const adminEmail = (session.user as { email?: string }).email;
    if (!adminEmail) {
      return NextResponse.json({
        success: false,
        data: null,
        error: "No email address found for your account.",
      });
    }

    await transport.sendMail({
      from: config.from,
      sender: config.user,
      envelope: {
        from: config.user,
        to: adminEmail,
      },
      to: adminEmail,
      subject: "FindMe SMTP Test",
      html: `<div style="font-family: sans-serif; max-width: 500px; margin: 0 auto;">
        <h2 style="color: #3b82f6;">SMTP Test Successful</h2>
        <p>This is a test email from your FindMe instance to verify SMTP configuration.</p>
        <p style="color: #666; font-size: 12px; margin-top: 24px;">
          Sent at ${new Date().toISOString()}
        </p>
      </div>`,
      text: `FindMe SMTP Test - This is a test email from your FindMe instance. Sent at ${new Date().toISOString()}`,
    });

    return NextResponse.json({
      success: true,
      data: { message: `Test email sent to ${adminEmail}` },
      error: null,
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      data: null,
      error: error instanceof Error ? error.message : "SMTP test failed",
    });
  }
}
