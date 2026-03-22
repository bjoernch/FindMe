"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import dynamic from "next/dynamic";
import { MapSkeleton } from "@/components/loading-skeleton";
import type { LocationData, DevicePublic, ApiResponse } from "@/types/api";

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
    return { totalDistance: 0, duration: 0, avgSpeed: 0, maxSpeed: 0 };
  }
  const sorted = [...locations].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  let totalDistance = 0, maxSpeed = 0;
  for (let i = 1; i < sorted.length; i++) {
    totalDistance += haversineDistance(sorted[i - 1].lat, sorted[i - 1].lng, sorted[i].lat, sorted[i].lng);
    if (sorted[i].speed != null && sorted[i].speed! > maxSpeed) maxSpeed = sorted[i].speed!;
  }
  const duration = new Date(sorted[sorted.length - 1].timestamp).getTime() - new Date(sorted[0].timestamp).getTime();
  const avgSpeed = duration > 0 ? totalDistance / (duration / 1000) : 0;
  return { totalDistance, duration, avgSpeed, maxSpeed };
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

type DatePreset = "today" | "yesterday" | "7days" | "custom";
const SPEED_OPTIONS = [1, 2, 5, 10];

function getPresetDates(preset: DatePreset): { from: string; to: string } {
  const now = new Date();
  const to = now.toISOString().slice(0, 16);

  switch (preset) {
    case "today": {
      const start = new Date(now);
      start.setHours(0, 0, 0, 0);
      return { from: start.toISOString().slice(0, 16), to };
    }
    case "yesterday": {
      const yStart = new Date(now);
      yStart.setDate(yStart.getDate() - 1);
      yStart.setHours(0, 0, 0, 0);
      const yEnd = new Date(now);
      yEnd.setDate(yEnd.getDate() - 1);
      yEnd.setHours(23, 59, 59, 999);
      return { from: yStart.toISOString().slice(0, 16), to: yEnd.toISOString().slice(0, 16) };
    }
    case "7days": {
      const start = new Date(now);
      start.setDate(start.getDate() - 7);
      return { from: start.toISOString().slice(0, 16), to };
    }
    default:
      return { from: "", to };
  }
}

type HistoryMode = "device" | "person";

interface SharedPerson {
  user: { id: string; name: string | null; email: string };
}

export default function HistoryDashboardPage() {
  const [devices, setDevices] = useState<DevicePublic[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("");
  const [locations, setLocations] = useState<LocationData[]>([]);
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [datePreset, setDatePreset] = useState<DatePreset>("7days");
  const [fromDate, setFromDate] = useState(() => getPresetDates("7days").from);
  const [toDate, setToDate] = useState(() => getPresetDates("7days").to);
  const [selectedPoint, setSelectedPoint] = useState<LocationData | null>(null);
  const [historyMode, setHistoryMode] = useState<HistoryMode>("device");
  const [people, setPeople] = useState<SharedPerson[]>([]);
  const [selectedPersonId, setSelectedPersonId] = useState<string>("");

  // Playback
  const [playing, setPlaying] = useState(false);
  const [playbackIndex, setPlaybackIndex] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const playIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timelineRef = useRef<HTMLDivElement>(null);

  const sortedForPlayback = [...locations].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
  const playbackPoint = playing || playbackIndex > 0 ? sortedForPlayback[playbackIndex] || null : null;

  const stopPlayback = useCallback(() => {
    setPlaying(false);
    if (playIntervalRef.current) {
      clearInterval(playIntervalRef.current);
      playIntervalRef.current = null;
    }
  }, []);

  const startPlayback = useCallback(() => {
    if (sortedForPlayback.length < 2) return;
    setPlaying(true);
    setPlaybackIndex((prev) => (prev >= sortedForPlayback.length - 1 ? 0 : prev));
  }, [sortedForPlayback.length]);

  useEffect(() => {
    if (!playing) return;
    playIntervalRef.current = setInterval(() => {
      setPlaybackIndex((prev) => {
        if (prev >= sortedForPlayback.length - 1) { stopPlayback(); return prev; }
        return prev + 1;
      });
    }, 500 / playbackSpeed);
    return () => { if (playIntervalRef.current) clearInterval(playIntervalRef.current); };
  }, [playing, playbackSpeed, sortedForPlayback.length, stopPlayback]);

  useEffect(() => {
    if (!playbackPoint || !timelineRef.current) return;
    const items = timelineRef.current.children;
    if (items[playbackIndex]) {
      items[playbackIndex].scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [playbackIndex, playbackPoint]);

  // Load devices and people
  useEffect(() => {
    async function load() {
      try {
        const [devRes, pplRes] = await Promise.all([
          fetch("/api/devices"),
          fetch("/api/people"),
        ]);
        const devData: ApiResponse<DevicePublic[]> = await devRes.json();
        if (devData.success && devData.data) {
          setDevices(devData.data);
          if (devData.data.length > 0) setSelectedDeviceId(devData.data[0].id);
        }
        const pplData = await pplRes.json();
        if (pplData.success && pplData.data) {
          setPeople(pplData.data);
        }
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // Load history when device/person or dates change
  useEffect(() => {
    if (historyMode === "device" && !selectedDeviceId) return;
    if (historyMode === "person" && !selectedPersonId) return;
    fetchHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDeviceId, selectedPersonId, historyMode]);

  async function fetchHistory() {
    setHistoryLoading(true);
    setError(null);
    stopPlayback();
    setPlaybackIndex(0);
    try {
      const params = new URLSearchParams({ limit: "5000" });
      if (fromDate) params.set("from", new Date(fromDate).toISOString());
      if (toDate) params.set("to", new Date(toDate).toISOString());

      const url = historyMode === "person"
        ? `/api/location/person/${selectedPersonId}/history?${params.toString()}`
        : `/api/location/${selectedDeviceId}/history?${params.toString()}`;

      const res = await fetch(url);
      const data: ApiResponse<LocationData[]> = await res.json();
      if (data.success && data.data) {
        setLocations(data.data);
      } else {
        setError(data.error || "Failed to load history");
      }
    } catch {
      setError("Network error");
    } finally {
      setHistoryLoading(false);
    }
  }

  function handlePreset(preset: DatePreset) {
    setDatePreset(preset);
    if (preset !== "custom") {
      const { from, to } = getPresetDates(preset);
      setFromDate(from);
      setToDate(to);
    }
  }

  function exportHistory(format: "gpx" | "csv") {
    if (historyMode === "device" && !selectedDeviceId) return;
    if (historyMode === "person") return; // Export not supported for person mode yet
    const params = new URLSearchParams({ format });
    if (fromDate) params.set("from", new Date(fromDate).toISOString());
    if (toDate) params.set("to", new Date(toDate).toISOString());
    window.open(`/api/location/${selectedDeviceId}/export?${params.toString()}`, "_blank");
  }

  const stats = computeTripStats(locations);

  if (loading) {
    return <div className="p-4 sm:p-6 max-w-6xl mx-auto"><div className="text-sub">Loading...</div></div>;
  }

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold text-heading mb-6">Location History</h1>

      {/* Controls */}
      <div className="bg-card border border-edge rounded-xl p-4 mb-6">
        {/* Mode tabs */}
        {people.length > 0 && (
          <div className="flex gap-1 mb-4">
            <button
              onClick={() => setHistoryMode("device")}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                historyMode === "device" ? "bg-blue-600 text-white" : "bg-input text-sub hover:bg-hover border border-edge"
              }`}
            >
              By Device
            </button>
            <button
              onClick={() => setHistoryMode("person")}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                historyMode === "person" ? "bg-blue-600 text-white" : "bg-input text-sub hover:bg-hover border border-edge"
              }`}
            >
              By Person
            </button>
          </div>
        )}
        <div className="flex flex-wrap items-end gap-4">
          {/* Device or Person selector */}
          {historyMode === "device" ? (
            <div>
              <label className="block text-sm text-sub mb-1">Device</label>
              <select
                value={selectedDeviceId}
                onChange={(e) => setSelectedDeviceId(e.target.value)}
                className="bg-input border border-edge-bold rounded-lg px-3 py-2 text-heading text-sm focus:outline-none focus:border-blue-500"
              >
                {devices.map((d) => (
                  <option key={d.id} value={d.id}>{d.name} ({d.platform})</option>
                ))}
              </select>
            </div>
          ) : (
            <div>
              <label className="block text-sm text-sub mb-1">Person</label>
              <select
                value={selectedPersonId}
                onChange={(e) => setSelectedPersonId(e.target.value)}
                className="bg-input border border-edge-bold rounded-lg px-3 py-2 text-heading text-sm focus:outline-none focus:border-blue-500"
              >
                <option value="">Select a person</option>
                {people.map((p) => (
                  <option key={p.user.id} value={p.user.id}>
                    {p.user.name || p.user.email}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Date presets */}
          <div className="flex gap-1">
            {(["today", "yesterday", "7days", "custom"] as DatePreset[]).map((p) => (
              <button
                key={p}
                onClick={() => handlePreset(p)}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  datePreset === p ? "bg-blue-600 text-white" : "bg-input text-sub hover:bg-hover border border-edge"
                }`}
              >
                {p === "7days" ? "7 Days" : p.charAt(0).toUpperCase() + p.slice(1)}
              </button>
            ))}
          </div>

          {/* Custom date range */}
          {datePreset === "custom" && (
            <>
              <div>
                <label className="block text-sm text-sub mb-1">From</label>
                <input type="datetime-local" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="bg-input border border-edge-bold rounded-lg px-3 py-2 text-heading text-sm focus:outline-none focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-sm text-sub mb-1">To</label>
                <input type="datetime-local" value={toDate} onChange={(e) => setToDate(e.target.value)} className="bg-input border border-edge-bold rounded-lg px-3 py-2 text-heading text-sm focus:outline-none focus:border-blue-500" />
              </div>
            </>
          )}

          <button onClick={fetchHistory} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm transition-colors">
            Load
          </button>

          <div className="flex gap-2 ml-auto">
            <button onClick={() => exportHistory("gpx")} className="bg-input hover:bg-hover text-heading px-3 py-2 rounded-lg text-sm transition-colors border border-edge">GPX</button>
            <button onClick={() => exportHistory("csv")} className="bg-input hover:bg-hover text-heading px-3 py-2 rounded-lg text-sm transition-colors border border-edge">CSV</button>
          </div>
        </div>
      </div>

      {/* Stats */}
      {locations.length > 1 && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
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
        </div>
      )}

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 mb-6 text-red-400 text-sm">{error}</div>
      )}

      {/* Map */}
      <div className="h-[450px] rounded-xl overflow-hidden border border-edge mb-4">
        {historyLoading ? <MapSkeleton /> : (
          <HistoryMap
            locations={locations}
            selectedPoint={selectedPoint}
            onSelectPoint={setSelectedPoint}
            playbackPoint={playbackPoint}
          />
        )}
      </div>

      {/* Playback */}
      {sortedForPlayback.length > 1 && (
        <div className="bg-card border border-edge rounded-xl p-4 mb-6">
          <div className="flex items-center gap-4">
            <button
              onClick={playing ? stopPlayback : startPlayback}
              className="bg-blue-600 hover:bg-blue-700 text-white w-10 h-10 rounded-full flex items-center justify-center text-lg transition-colors"
            >
              {playing ? "⏸" : "▶"}
            </button>
            <div className="flex-1">
              <input
                type="range"
                min={0}
                max={sortedForPlayback.length - 1}
                value={playbackIndex}
                onChange={(e) => {
                  const idx = parseInt(e.target.value);
                  setPlaybackIndex(idx);
                  if (!playing) setSelectedPoint(sortedForPlayback[idx]);
                }}
                className="w-full accent-blue-500"
              />
              <div className="flex justify-between text-xs text-hint mt-1">
                <span>{sortedForPlayback.length > 0 ? new Date(sortedForPlayback[0].timestamp).toLocaleTimeString() : ""}</span>
                <span>{playbackPoint ? new Date(playbackPoint.timestamp).toLocaleTimeString() : ""}</span>
                <span>{sortedForPlayback.length > 0 ? new Date(sortedForPlayback[sortedForPlayback.length - 1].timestamp).toLocaleTimeString() : ""}</span>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {SPEED_OPTIONS.map((speed) => (
                <button
                  key={speed}
                  onClick={() => setPlaybackSpeed(speed)}
                  className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                    playbackSpeed === speed ? "bg-blue-600 text-white" : "bg-input text-sub hover:bg-hover"
                  }`}
                >
                  {speed}x
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Timeline */}
      <div className="bg-card border border-edge rounded-xl overflow-hidden">
        <div className="p-4 border-b border-edge">
          <h2 className="text-sm font-semibold text-heading uppercase tracking-wide">Timeline ({locations.length} points)</h2>
        </div>
        <div className="max-h-[400px] overflow-y-auto" ref={timelineRef}>
          {locations.length === 0 ? (
            <p className="p-4 text-hint text-sm">No location data for this period.</p>
          ) : (
            sortedForPlayback.map((loc, idx) => (
              <div
                key={loc.id}
                onClick={() => { setSelectedPoint(loc); setPlaybackIndex(idx); }}
                className={`px-4 py-2 border-b border-edge/50 cursor-pointer transition-colors ${
                  playbackPoint?.id === loc.id
                    ? "bg-blue-500/20 border-l-2 border-l-blue-500"
                    : selectedPoint?.id === loc.id
                    ? "bg-active-bg"
                    : "hover:bg-input/50"
                }`}
              >
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
