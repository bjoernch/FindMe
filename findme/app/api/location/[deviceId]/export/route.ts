import { NextRequest, NextResponse } from "next/server";
import { log } from "@/lib/logger";
import { prisma } from "@/lib/db";
import { apiError } from "@/lib/api-response";
import { authenticateRequest } from "@/lib/auth-guard";

function toGPX(locations: Array<{ lat: number; lng: number; altitude: number | null; timestamp: Date; speed: number | null; heading: number | null }>, deviceName: string): string {
  const points = locations
    .map((l) => {
      const ele = l.altitude != null ? `      <ele>${l.altitude}</ele>\n` : "";
      const speed = l.speed != null ? `      <speed>${l.speed}</speed>\n` : "";
      const course = l.heading != null ? `      <course>${l.heading}</course>\n` : "";
      return `    <trkpt lat="${l.lat}" lon="${l.lng}">\n${ele}      <time>${l.timestamp.toISOString()}</time>\n${speed}${course}    </trkpt>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="FindMe"
  xmlns="http://www.topografix.com/GPX/1/1"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">
  <metadata>
    <name>${deviceName} - Location History</name>
    <time>${new Date().toISOString()}</time>
  </metadata>
  <trk>
    <name>${deviceName}</name>
    <trkseg>
${points}
    </trkseg>
  </trk>
</gpx>`;
}

function toCSV(locations: Array<{ lat: number; lng: number; accuracy: number | null; altitude: number | null; speed: number | null; heading: number | null; batteryLevel: number | null; timestamp: Date }>): string {
  const header = "timestamp,latitude,longitude,accuracy_m,altitude_m,speed_ms,heading_deg,battery_pct";
  const rows = locations
    .map(
      (l) =>
        `${l.timestamp.toISOString()},${l.lat},${l.lng},${l.accuracy ?? ""},${l.altitude ?? ""},${l.speed ?? ""},${l.heading ?? ""},${l.batteryLevel ?? ""}`
    )
    .join("\n");
  return `${header}\n${rows}`;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ deviceId: string }> }
) {
  try {
    const authResult = await authenticateRequest(req);
    if (authResult instanceof Response) return authResult;

    const { deviceId } = await params;
    const format = req.nextUrl.searchParams.get("format") || "gpx";
    const from = req.nextUrl.searchParams.get("from");
    const to = req.nextUrl.searchParams.get("to");

    const device = await prisma.device.findFirst({
      where: { id: deviceId, userId: authResult.id },
    });

    if (!device) {
      return apiError("Device not found", 404);
    }

    const where: Record<string, unknown> = { deviceId };
    if (from || to) {
      const timestamp: Record<string, Date> = {};
      if (from) timestamp.gte = new Date(from);
      if (to) timestamp.lte = new Date(to);
      where.timestamp = timestamp;
    }

    const locations = await prisma.location.findMany({
      where,
      orderBy: { timestamp: "asc" },
      take: 50000,
    });

    if (format === "csv") {
      const csv = toCSV(locations);
      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": `attachment; filename="findme-${device.name}-history.csv"`,
        },
      });
    }

    // Default: GPX
    const gpx = toGPX(locations, device.name);
    return new NextResponse(gpx, {
      headers: {
        "Content-Type": "application/gpx+xml",
        "Content-Disposition": `attachment; filename="findme-${device.name}-history.gpx"`,
      },
    });
  } catch (error) {
    log.error("location.export", "Export failed", error);
    return apiError("Internal server error", 500);
  }
}
