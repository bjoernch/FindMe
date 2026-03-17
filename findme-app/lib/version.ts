/**
 * Parse a semver string "major.minor.patch" into a tuple.
 * Returns [0, 0, 0] for invalid input.
 */
export function parseSemver(version: string): [number, number, number] {
  const parts = version.split(".").map(Number);
  if (parts.length < 3 || parts.some(isNaN)) return [0, 0, 0];
  return [parts[0], parts[1], parts[2]];
}

/**
 * Compare app and server versions. Only major + minor differences
 * trigger a mismatch — patch differences are considered compatible.
 */
export function compareVersions(
  appVersion: string,
  serverVersion: string
): "match" | "app-outdated" | "server-outdated" {
  const [appMajor, appMinor] = parseSemver(appVersion);
  const [srvMajor, srvMinor] = parseSemver(serverVersion);

  if (appMajor === srvMajor && appMinor === srvMinor) return "match";

  // Compare as a single number: major * 1000 + minor
  const appNum = appMajor * 1000 + appMinor;
  const srvNum = srvMajor * 1000 + srvMinor;

  return appNum < srvNum ? "app-outdated" : "server-outdated";
}
