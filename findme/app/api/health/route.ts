import { readFileSync } from "fs";
import { join } from "path";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sseManager } from "@/lib/sse-manager";

const startTime = Date.now();

let cachedVersion: string | null = null;

function getVersion(): string {
  if (!cachedVersion) {
    try {
      const pkgPath = join(process.cwd(), "package.json");
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
      cachedVersion = pkg.version;
    } catch {
      cachedVersion = "unknown";
    }
  }
  return cachedVersion!;
}

export async function GET() {
  let dbStatus = "connected";

  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    dbStatus = "disconnected";
    return NextResponse.json(
      {
        status: "error",
        uptime: Math.floor((Date.now() - startTime) / 1000),
        database: dbStatus,
        sseClients: sseManager.getClientCount(),
        version: getVersion(),
      },
      { status: 503 }
    );
  }

  return NextResponse.json({
    status: "ok",
    uptime: Math.floor((Date.now() - startTime) / 1000),
    database: dbStatus,
    sseClients: sseManager.getClientCount(),
    version: getVersion(),
  });
}
