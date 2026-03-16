"use client";

import { useEffect, useState, use } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { MapSkeleton } from "@/components/loading-skeleton";
import type { LocationData, ApiResponse } from "@/types/api";

const HistoryMap = dynamic(
  () => import("@/components/history-map").then((mod) => mod.HistoryMap),
  { ssr: false, loading: () => <MapSkeleton /> }
);

function haversineDistance(
  lat1: number, lng1: number, lat2: number, lng2: number
): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function computeTripStats(locations: LocationData[]) {
  if (locations.length < 2) {
    return { totalDistance: 0, duration: 0, avgSpeed: 0, maxSpeed: 0, maxAltitude: null as number | null, minAltitude: null as number | null, elevationGain: 0 };
  }
  const sorted = [...locations].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  let totalDistance = 0, maxSpeed = 0, maxAltitude: number | null = null, minAltitude: number | null = null, elevationGain = 0;

  for (let i = 1; i < sorted.length; i++) {
    totalDistance += haversineDistance(sorted[i - 1].lat, sorted[i - 1].lng, sorted[i].lat, sorted[i].lng);
    if (sorted[i].speed != null && sorted[i].speed! > maxSpeed) maxSpeed = sorted[i].speed!;
    if (sorted[i].altitude != null) {
      if (maxAltitude === null || sorted[i].altitude! > maxAltitude) maxAltitude = sorted[i].altitude!;
      if (minAltitude === null || sorted[i].altitude! < minAltitude) minAltitude = sorted[i].altitude!;
      if (sorted[i - 1].altitude != null && sorted[i].altitude! > sorted[i - 1].altitude!) {
        elevationGain += sorted[i].altitude! - sorted[i - 1].altitude!;
      }
    }
  }
  const duration = new Date(sorted[sorted.length - 1].timestamp).getTime() - new Date(sorted[0].timestamp).getTime();
  const avgSpeed = duration > 0 ? totalDistance / (duration / 1000) : 0;
  return { totalDistance, duration, avgSpeed, maxSpeed, maxAltitude, minAltitude, elevationGain };
}

function formatDuration(ms: number): string {
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function formatDistance(meters: number): string {
  if (meters >= 1000) return `${(meters / 1000).toFixed(2)} km`;
  return `${meters.toFixed(0)} m`;
}

export default function HistoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: deviceId } = use(params);
  const [locations, setLocations] = useState<LocationData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 16);
  });
  const [toDate, setToDate] = useState(() => new Date().toISOString().slice(0, 16));
  const [selectedPoint, setSelectedPoint] = useState<LocationData | null>(null);

  async function fetchHistory(useDateRange = true) {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: "5000" });
      if (useDateRange && fromDate) params.set("from", new Date(fromDate).toISOString());
      if (useDateRange && toDate) params.set("to", new Date(toDate).toISOString());
      const res = await fetch(`/api/location/${deviceId}/history?${params.toString()}`);
      const data: ApiResponse<LocationData[]> = await res.json();
      if (data.success && data.data) {
        setLocations(data.data);
      } else {
        setError(data.error || "Failed to load history");
      }
    } catch (err) {
      console.error("Failed to fetch history:", err);
      setError("Network error loading history");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchHistory(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceId]);

  function exportHistory(format: "gpx" | "csv") {
    const params = new URLSearchParams({ format });
    if (fromDate) params.set("from", new Date(fromDate).toISOString());
    if (toDate) params.set("to", new Date(toDate).toISOString());
    window.open(`/api/location/${deviceId}/export?${params.toString()}`, "_blank");
  }

  const stats = computeTripStats(locations);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/dashboard/devices" className="text-sub hover:text-heading">&larr; Devices</Link>
        <h1 className="text-2xl font-bold text-heading">Location History</h1>
      </div>

      {/* Date range picker */}
      <div className="bg-card border border-edge rounded-xl p-4 mb-6 flex flex-wrap items-end gap-4">
        <div>
          <label className="block text-sm text-sub mb-1">From</label>
          <input type="datetime-local" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="bg-input border border-edge-bold rounded-lg px-3 py-2 text-heading text-sm focus:outline-none focus:border-blue-500" />
        </div>
        <div>
          <label className="block text-sm text-sub mb-1">To</label>
          <input type="datetime-local" value={toDate} onChange={(e) => setToDate(e.target.value)} className="bg-input border border-edge-bold rounded-lg px-3 py-2 text-heading text-sm focus:outline-none focus:border-blue-500" />
        </div>
        <button onClick={() => fetchHistory(true)} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm transition-colors">Load</button>
        <button onClick={() => fetchHistory(false)} className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg text-sm transition-colors">All Time</button>
        <div className="flex gap-2 ml-auto">
          <button onClick={() => exportHistory("gpx")} className="bg-input hover:bg-hover text-heading px-3 py-2 rounded-lg text-sm transition-colors border border-edge" title="Export as GPX">Export GPX</button>
          <button onClick={() => exportHistory("csv")} className="bg-input hover:bg-hover text-heading px-3 py-2 rounded-lg text-sm transition-colors border border-edge" title="Export as CSV">Export CSV</button>
        </div>
      </div>

      {/* Trip Summary Stats */}
      {locations.length > 1 && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 mb-6">
          <div className="bg-card border border-edge rounded-xl p-3 text-center">
            <div className="text-xs text-sub mb-1">Points</div>
            <div className="text-lg font-bold text-heading">{locations.length}</div>
          </div>
          <div className="bg-card border border-edge rounded-xl p-3 text-center">
            <div className="text-xs text-sub mb-1">Distance</div>
            <div className="text-lg font-bold text-heading">{formatDistance(stats.totalDistance)}</div>
          </div>
          <div className="bg-card border border-edge rounded-xl p-3 text-center">
            <div className="text-xs text-sub mb-1">Duration</div>
            <div className="text-lg font-bold text-heading">{formatDuration(stats.duration)}</div>
          </div>
          <div className="bg-card border border-edge rounded-xl p-3 text-center">
            <div className="text-xs text-sub mb-1">Avg Speed</div>
            <div className="text-lg font-bold text-heading">{(stats.avgSpeed * 3.6).toFixed(1)} km/h</div>
          </div>
          <div className="bg-card border border-edge rounded-xl p-3 text-center">
            <div className="text-xs text-sub mb-1">Max Speed</div>
            <div className="text-lg font-bold text-heading">{(stats.maxSpeed * 3.6).toFixed(1)} km/h</div>
          </div>
          {stats.maxAltitude !== null && (
            <div className="bg-card border border-edge rounded-xl p-3 text-center">
              <div className="text-xs text-sub mb-1">Elevation</div>
              <div className="text-lg font-bold text-heading">{stats.minAltitude?.toFixed(0)}&ndash;{stats.maxAltitude.toFixed(0)}m</div>
            </div>
          )}
          {stats.elevationGain > 0 && (
            <div className="bg-card border border-edge rounded-xl p-3 text-center">
              <div className="text-xs text-sub mb-1">Elev. Gain</div>
              <div className="text-lg font-bold text-heading">+{stats.elevationGain.toFixed(0)}m</div>
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 mb-6 text-red-400 text-sm">{error}</div>
      )}

      {/* Map */}
      <div className="h-[400px] rounded-xl overflow-hidden border border-edge mb-6">
        {loading ? <MapSkeleton /> : <HistoryMap locations={locations} selectedPoint={selectedPoint} onSelectPoint={setSelectedPoint} />}
      </div>

      {/* Timeline */}
      <div className="bg-card border border-edge rounded-xl overflow-hidden">
        <div className="p-4 border-b border-edge">
          <h2 className="text-sm font-semibold text-heading uppercase tracking-wide">Timeline ({locations.length} points)</h2>
        </div>
        <div className="max-h-[400px] overflow-y-auto">
          {locations.length === 0 ? (
            <p className="p-4 text-hint text-sm">No location data for this period.</p>
          ) : (
            locations.map((loc) => (
              <div key={loc.id} onClick={() => setSelectedPoint(loc)} className={`px-4 py-2 border-b border-edge/50 cursor-pointer transition-colors ${selectedPoint?.id === loc.id ? "bg-active-bg" : "hover:bg-input/50"}`}>
                <div className="flex items-center justify-between">
                  <div className="text-sm text-heading">{loc.lat.toFixed(6)}, {loc.lng.toFixed(6)}</div>
                  <div className="text-xs text-hint">{new Date(loc.timestamp).toLocaleString()}</div>
                </div>
                <div className="flex gap-3 text-xs text-hint mt-0.5">
                  {loc.speed !== null && <span>{(loc.speed * 3.6).toFixed(1)} km/h</span>}
                  {loc.accuracy !== null && <span>&plusmn;{loc.accuracy}m</span>}
                  {loc.altitude !== null && <span>{loc.altitude.toFixed(0)}m alt</span>}
                  {loc.batteryLevel !== null && <span>{Math.round(loc.batteryLevel)}% bat</span>}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
