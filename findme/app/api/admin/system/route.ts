import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

interface DependencyInfo {
  name: string;
  currentVersion: string;
  description?: string;
}

interface SystemInfo {
  app: {
    version: string;
    buildDate: string | null;
    nodeVersion: string;
    nextVersion: string;
    environment: string;
  };
  database: {
    provider: string;
    locationCount: number;
    userCount: number;
    deviceCount: number;
  };
  dependencies: DependencyInfo[];
  devDependencies: DependencyInfo[];
}

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { success: false, data: null, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const role = (session.user as { role?: string }).role;
  if (role !== "ADMIN") {
    return NextResponse.json(
      { success: false, data: null, error: "Forbidden" },
      { status: 403 }
    );
  }

  try {
    // Read package.json for version and dependencies
    let packageJson: Record<string, unknown> = {};
    const pkgPath = join(process.cwd(), "package.json");
    if (existsSync(pkgPath)) {
      packageJson = JSON.parse(readFileSync(pkgPath, "utf-8"));
    }

    // Read build info if available (set during Docker build)
    let buildDate: string | null = null;
    const buildInfoPath = join(process.cwd(), ".build-info.json");
    if (existsSync(buildInfoPath)) {
      try {
        const buildInfo = JSON.parse(readFileSync(buildInfoPath, "utf-8"));
        buildDate = buildInfo.buildDate || null;
      } catch {
        // ignore
      }
    }

    // Get database stats
    const [userCount, deviceCount, locationCount] = await Promise.all([
      prisma.user.count(),
      prisma.device.count(),
      prisma.location.count(),
    ]);

    // Parse dependencies
    const deps = packageJson.dependencies as Record<string, string> | undefined;
    const devDeps = packageJson.devDependencies as Record<string, string> | undefined;

    function getInstalledVersion(name: string, fallback: string): string {
      try {
        const modPkgPath = join(process.cwd(), "node_modules", name, "package.json");
        if (existsSync(modPkgPath)) {
          const modPkg = JSON.parse(readFileSync(modPkgPath, "utf-8"));
          return modPkg.version;
        }
      } catch { /* fallback */ }
      return fallback.replace(/^\^|~/, "");
    }

    const dependencies: DependencyInfo[] = Object.entries(deps || {}).map(
      ([name, version]) => ({
        name,
        currentVersion: getInstalledVersion(name, version),
      })
    );

    const devDependencies: DependencyInfo[] = Object.entries(devDeps || {}).map(
      ([name, version]) => ({
        name,
        currentVersion: getInstalledVersion(name, version),
      })
    );

    // Get Next.js version from installed package
    let nextVersion = "unknown";
    try {
      const nextPkg = join(process.cwd(), "node_modules/next/package.json");
      if (existsSync(nextPkg)) {
        const nextPkgJson = JSON.parse(readFileSync(nextPkg, "utf-8"));
        nextVersion = nextPkgJson.version;
      }
    } catch {
      // fallback to package.json version
      nextVersion = (deps?.next || "unknown").replace(/^\^|~/, "");
    }

    const systemInfo: SystemInfo = {
      app: {
        version: (packageJson.version as string) || "0.0.0",
        buildDate,
        nodeVersion: process.version,
        nextVersion,
        environment: process.env.NODE_ENV || "development",
      },
      database: {
        provider: "SQLite",
        locationCount,
        userCount,
        deviceCount,
      },
      dependencies,
      devDependencies,
    };

    return NextResponse.json({ success: true, data: systemInfo, error: null });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        data: null,
        error: error instanceof Error ? error.message : "Failed to get system info",
      },
      { status: 500 }
    );
  }
}
