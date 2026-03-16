/**
 * Runtime-configurable server settings.
 * Configuration priority: Database AppSettings > Environment variables.
 */
import { prisma } from "@/lib/db";

export async function getPublicUrl(): Promise<string> {
  try {
    const setting = await prisma.appSetting.findUnique({
      where: { key: "public_url" },
    });
    if (setting?.value) return setting.value;
  } catch {
    // DB not available, fall through to env vars
  }

  return process.env.FINDME_PUBLIC_URL || process.env.NEXTAUTH_URL || "";
}

export async function getAppName(): Promise<string> {
  try {
    const setting = await prisma.appSetting.findUnique({
      where: { key: "app_name" },
    });
    if (setting?.value) return setting.value;
  } catch {
    // DB not available, fall through
  }

  return "FindMe";
}
