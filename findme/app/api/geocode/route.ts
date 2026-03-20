import { NextRequest } from "next/server";
import { apiSuccess, apiError } from "@/lib/api-response";
import { authenticateRequest } from "@/lib/auth-guard";

// In-memory LRU cache for reverse geocoding results
const cache = new Map<string, { address: string; ts: number }>();
const MAX_CACHE = 1000;
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

// Rate limit: 1 request per second to Nominatim
let lastRequest = 0;

function roundCoord(n: number): string {
  return n.toFixed(4);
}

export async function GET(req: NextRequest) {
  try {
    const authResult = await authenticateRequest(req);
    if (authResult instanceof Response) return authResult;

    const lat = req.nextUrl.searchParams.get("lat");
    const lng = req.nextUrl.searchParams.get("lng");

    if (!lat || !lng) {
      return apiError("lat and lng are required", 400);
    }

    const key = `${roundCoord(parseFloat(lat))},${roundCoord(parseFloat(lng))}`;

    // Check cache
    const cached = cache.get(key);
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      return apiSuccess({ address: cached.address });
    }

    // Rate limit
    const now = Date.now();
    const wait = Math.max(0, 1000 - (now - lastRequest));
    if (wait > 0) {
      await new Promise((r) => setTimeout(r, wait));
    }
    lastRequest = Date.now();

    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lng=${lng}&zoom=18`,
      {
        headers: { "User-Agent": "FindMe/1.0" },
      }
    );

    if (!res.ok) {
      return apiError("Geocoding failed", 502);
    }

    const data = await res.json();
    const address = data.display_name || `${lat}, ${lng}`;

    // Store in cache, evict oldest if needed
    if (cache.size >= MAX_CACHE) {
      const oldest = cache.keys().next().value;
      if (oldest) cache.delete(oldest);
    }
    cache.set(key, { address, ts: Date.now() });

    return apiSuccess({ address });
  } catch {
    return apiError("Internal server error", 500);
  }
}
