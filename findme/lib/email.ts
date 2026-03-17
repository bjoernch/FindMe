/**
 * Optional email notification system using SMTP.
 * Configuration priority: Database AppSettings > Environment variables.
 * If not configured, email functions silently no-op.
 */
import { log } from "@/lib/logger";
import { prisma } from "@/lib/db";

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
  secure: boolean;
}

export async function getSmtpConfig(): Promise<SmtpConfig | null> {
  // Try database settings first
  try {
    const settings = await prisma.appSetting.findMany({
      where: { key: { in: ["smtp_host", "smtp_port", "smtp_user", "smtp_pass", "smtp_from", "smtp_secure"] } },
    });

    const dbConfig: Record<string, string> = {};
    for (const s of settings) {
      dbConfig[s.key] = s.value;
    }

    if (dbConfig.smtp_host && dbConfig.smtp_user && dbConfig.smtp_pass) {
      return {
        host: dbConfig.smtp_host,
        port: parseInt(dbConfig.smtp_port || "587"),
        user: dbConfig.smtp_user,
        pass: dbConfig.smtp_pass,
        from: dbConfig.smtp_from || `FindMe <${dbConfig.smtp_user}>`,
        secure: dbConfig.smtp_secure === "true",
      };
    }
  } catch {
    // DB not available, fall through to env vars
  }

  // Fall back to environment variables
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    return {
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || "587"),
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
      from: process.env.SMTP_FROM || `FindMe <${process.env.SMTP_USER}>`,
      secure: process.env.SMTP_SECURE === "true",
    };
  }

  return null;
}

export async function sendEmail(options: EmailOptions): Promise<boolean> {
  const config = await getSmtpConfig();
  if (!config) {
    log.debug("email", "SMTP not configured, skipping", { to: options.to });
    return false;
  }

  try {
    const nodemailer = await import("nodemailer");

    const transport = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: {
        user: config.user,
        pass: config.pass,
      },
    });

    await transport.sendMail({
      from: config.from,
      sender: config.user,
      envelope: {
        from: config.user,
        to: options.to,
      },
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text || options.html.replace(/<[^>]*>/g, ""),
    });

    return true;
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    const errStack = error instanceof Error ? error.stack : undefined;
    log.error("email", `Failed to send email to ${options.to}: ${errMsg}`, { stack: errStack });
    return false;
  }
}

export async function sendInvitationEmail(
  toEmail: string,
  fromName: string,
  instanceUrl: string
) {
  return sendEmail({
    to: toEmail,
    subject: `${fromName} invited you to share locations on FindMe`,
    html: `
      <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto;">
        <h2 style="color: #3b82f6;">FindMe - Location Sharing Invitation</h2>
        <p><strong>${fromName}</strong> has invited you to share locations.</p>
        <p>Log in to your FindMe account to accept the invitation:</p>
        <a href="${instanceUrl}/dashboard/people"
          style="display: inline-block; background: #3b82f6; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; margin-top: 12px;">
          View Invitation
        </a>
        <p style="color: #666; font-size: 12px; margin-top: 24px;">
          If you don't have an account, register at <a href="${instanceUrl}">${instanceUrl}</a>
        </p>
      </div>
    `,
  });
}

export async function sendGeofenceAlertEmail(
  toEmail: string,
  deviceName: string,
  geofenceName: string,
  eventType: "ENTER" | "EXIT"
) {
  const action = eventType === "ENTER" ? "entered" : "left";
  return sendEmail({
    to: toEmail,
    subject: `FindMe: ${deviceName} ${action} "${geofenceName}"`,
    html: `
      <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto;">
        <h2 style="color: #3b82f6;">Geofence Alert</h2>
        <p><strong>${deviceName}</strong> has ${action} the geofence <strong>"${geofenceName}"</strong>.</p>
        <p style="color: #666; font-size: 12px; margin-top: 24px;">
          This is an automated notification from FindMe.
        </p>
      </div>
    `,
  });
}
