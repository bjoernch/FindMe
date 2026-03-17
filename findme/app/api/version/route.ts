import { readFileSync } from "fs";
import { join } from "path";
import { apiSuccess } from "@/lib/api-response";

let cachedVersion: string | null = null;

function getVersion(): string {
  if (!cachedVersion) {
    const pkgPath = join(process.cwd(), "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
    cachedVersion = pkg.version;
  }
  return cachedVersion!;
}

export async function GET() {
  const version = getVersion();

  return apiSuccess({
    version,
    minAppVersion: version,
  });
}
