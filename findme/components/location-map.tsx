"use client";

import { useEffect, useRef, useState } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Circle,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import { getAvatarMarkerHtml } from "@/lib/avatar";
import { useTheme } from "./theme-provider";
import type { DeviceWithLocation, PersonWithDevices } from "@/types/api";

// ── Tile Layer Config ──────────────────────────────────────
type TileLayerId = "dark" | "light" | "satellite" | "osm";

const TILE_LAYERS: Record<TileLayerId, { label: string; url: string; maxZoom: number }> = {
  dark: { label: "Dark", url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", maxZoom: 19 },
  light: { label: "Light", url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", maxZoom: 19 },
  satellite: { label: "Satellite", url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", maxZoom: 18 },
  osm: { label: "OpenStreetMap", url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png", maxZoom: 19 },
};

const TILE_IDS: TileLayerId[] = ["dark", "light", "satellite", "osm"];

function TileLayerSwitcher({ tileId }: { tileId: TileLayerId }) {
  const map = useMap();
  const layerRef = useRef<L.TileLayer | null>(null);

  useEffect(() => {
    if (layerRef.current) {
      map.removeLayer(layerRef.current);
    }
    const tile = TILE_LAYERS[tileId];
    const newLayer = L.tileLayer(tile.url, {
      maxZoom: tile.maxZoom,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>',
    }).addTo(map);
    layerRef.current = newLayer;
    return () => {
      if (layerRef.current) map.removeLayer(layerRef.current);
    };
  }, [tileId, map]);

  return null;
}

// ── Icon Factories ────────────────────────────────────────

function createDeviceIcon(platform: string, online: boolean) {
  const color = online ? "#3b82f6" : "#6b7280";
  const emoji = platform === "web" ? "💻" : "📱";

  return L.divIcon({
    className: "custom-marker",
    html: `<div style="
      background: ${color};
      width: 36px;
      height: 36px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 18px;
      border: 3px solid ${online ? "#60a5fa" : "#9ca3af"};
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    ">${emoji}</div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    popupAnchor: [0, -20],
  });
}

function createPersonIcon(name: string | null, online: boolean, avatarUrl?: string | null) {
  return L.divIcon({
    className: "custom-marker",
    html: getAvatarMarkerHtml(name, online, avatarUrl),
    iconSize: [42, 42],
    iconAnchor: [21, 21],
    popupAnchor: [0, -24],
  });
}

// ── Helpers ───────────────────────────────────────────────

function isOnline(lastSeen: string | null): boolean {
  if (!lastSeen) return false;
  return Date.now() - new Date(lastSeen).getTime() < 5 * 60 * 1000;
}

/** Get the best device for a person: prefer primary, then most recent */
function getMostRecentDevice(
  devices: DeviceWithLocation[]
): DeviceWithLocation | null {
  // Prefer primary device if it has a location
  const primary = devices.find((d) => d.isPrimary && d.latestLocation);
  if (primary) return primary;

  let best: DeviceWithLocation | null = null;
  for (const d of devices) {
    if (!d.latestLocation) continue;
    if (
      !best ||
      !best.latestLocation ||
      d.latestLocation.timestamp > best.latestLocation.timestamp
    ) {
      best = d;
    }
  }
  return best;
}

// ── Map Sub-components ────────────────────────────────────

function FitBounds({
  devices,
  people,
  hiddenDevices,
}: {
  devices: DeviceWithLocation[];
  people: PersonWithDevices[];
  hiddenDevices: Set<string>;
}) {
  const map = useMap();

  useEffect(() => {
    const points: [number, number][] = [];

    // My visible devices
    for (const d of devices) {
      if (d.latestLocation && !hiddenDevices.has(d.id)) {
        points.push([d.latestLocation.lat, d.latestLocation.lng]);
      }
    }

    // People's most recent device
    for (const p of people) {
      const best = getMostRecentDevice(p.devices);
      if (best?.latestLocation) {
        points.push([best.latestLocation.lat, best.latestLocation.lng]);
      }
    }

    if (points.length === 0) return;

    const bounds = L.latLngBounds(points);
    map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
  }, [devices, people, hiddenDevices, map]);

  return null;
}

function FlyToDevice({
  deviceId,
  devices,
  people,
}: {
  deviceId: string | null;
  devices: DeviceWithLocation[];
  people: PersonWithDevices[];
}) {
  const map = useMap();

  useEffect(() => {
    if (!deviceId) return;

    // Check my devices
    let device = devices.find((d) => d.id === deviceId);

    // Check people's devices
    if (!device) {
      for (const p of people) {
        device = p.devices.find((d) => d.id === deviceId);
        if (device) break;
      }
    }

    if (!device?.latestLocation) return;

    map.flyTo(
      [device.latestLocation.lat, device.latestLocation.lng],
      16,
      { duration: 1 }
    );
  }, [deviceId, devices, people, map]);

  return null;
}

function FlyToPerson({
  personId,
  people,
}: {
  personId: string | null;
  people: PersonWithDevices[];
}) {
  const map = useMap();

  useEffect(() => {
    if (!personId) return;
    const person = people.find((p) => p.user.id === personId);
    if (!person) return;

    const best = getMostRecentDevice(person.devices);
    if (!best?.latestLocation) return;

    map.flyTo(
      [best.latestLocation.lat, best.latestLocation.lng],
      15,
      { duration: 1 }
    );
  }, [personId, people, map]);

  return null;
}

// ── Main Component ────────────────────────────────────────

interface LocationMapProps {
  devices: DeviceWithLocation[];
  people?: PersonWithDevices[];
  hiddenDevices: Set<string>;
  selectedDeviceId: string | null;
  selectedPersonId?: string | null;
}

export function LocationMap({
  devices,
  people = [],
  hiddenDevices,
  selectedDeviceId,
  selectedPersonId = null,
}: LocationMapProps) {
  const mapRef = useRef<L.Map | null>(null);
  const { isDark } = useTheme();
  const [tileId, setTileId] = useState<TileLayerId>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("findme-map-tile");
      if (saved && saved in TILE_LAYERS) return saved as TileLayerId;
    }
    return isDark ? "dark" : "light";
  });
  const [showPicker, setShowPicker] = useState(false);
  const [userChose, setUserChose] = useState(() => {
    if (typeof window !== "undefined") return !!localStorage.getItem("findme-map-tile");
    return false;
  });

  // Auto-switch with theme if user hasn't explicitly chosen
  useEffect(() => {
    if (!userChose) setTileId(isDark ? "dark" : "light");
  }, [isDark, userChose]);

  function handleTileChange(id: TileLayerId) {
    setTileId(id);
    setUserChose(true);
    setShowPicker(false);
    localStorage.setItem("findme-map-tile", id);
  }

  return (
    <>
    <MapContainer
      center={[51.505, -0.09]}
      zoom={3}
      className="w-full h-full"
      style={{ background: "var(--map-bg)", position: "relative" }}
      ref={mapRef}
      zoomControl={false}
    >
      <TileLayerSwitcher tileId={tileId} />

      <FitBounds
        devices={devices}
        people={people}
        hiddenDevices={hiddenDevices}
      />
      <FlyToDevice
        deviceId={selectedDeviceId}
        devices={devices}
        people={people}
      />
      <FlyToPerson personId={selectedPersonId} people={people} />

      {/* My device markers */}
      {devices
        .filter((d) => d.latestLocation && !hiddenDevices.has(d.id))
        .map((device) => {
          const loc = device.latestLocation!;
          const online = isOnline(device.lastSeen);

          return (
            <Marker
              key={`dev-${device.id}`}
              position={[loc.lat, loc.lng]}
              icon={createDeviceIcon(device.platform, online)}
            >
              <Popup>
                <div className="text-sm">
                  <p className="font-bold text-base">{device.name}</p>
                  <p className="text-hint">
                    {online ? "🟢 Online" : "⚫ Offline"} &middot;{" "}
                    {device.platform}
                  </p>
                  <hr className="my-1" />
                  <p>
                    📍 {loc.lat.toFixed(6)}, {loc.lng.toFixed(6)}
                  </p>
                  {loc.accuracy && (
                    <p>🎯 Accuracy: {loc.accuracy.toFixed(0)}m</p>
                  )}
                  {loc.altitude !== null && (
                    <p>⛰ Altitude: {loc.altitude.toFixed(0)}m</p>
                  )}
                  {loc.speed !== null && (
                    <p>🏃 Speed: {(loc.speed * 3.6).toFixed(1)} km/h</p>
                  )}
                  {loc.batteryLevel !== null && (
                    <p>🔋 Battery: {Math.round(loc.batteryLevel)}%</p>
                  )}
                  <p className="text-xs text-sub mt-1">
                    Last update: {new Date(loc.timestamp).toLocaleString()}
                  </p>
                </div>
              </Popup>

              {loc.accuracy && loc.accuracy > 0 && (
                <Circle
                  center={[loc.lat, loc.lng]}
                  radius={loc.accuracy}
                  pathOptions={{
                    color: online ? "#3b82f6" : "#6b7280",
                    fillColor: online ? "#3b82f6" : "#6b7280",
                    fillOpacity: 0.1,
                    weight: 1,
                  }}
                />
              )}
            </Marker>
          );
        })}

      {/* People markers */}
      {people.map((person) => {
        const best = getMostRecentDevice(person.devices);
        if (!best?.latestLocation) return null;

        const loc = best.latestLocation;
        const online = isOnline(best.lastSeen);

        return (
          <Marker
            key={`person-${person.user.id}`}
            position={[loc.lat, loc.lng]}
            icon={createPersonIcon(person.user.name, online, person.user.avatar)}
          >
            <Popup>
              <div className="text-sm min-w-[180px]">
                <p className="font-bold text-base">
                  {person.user.name || person.user.email}
                </p>
                <p className="text-hint">
                  {online ? "🟢 Online" : "⚫ Offline"}
                </p>
                <hr className="my-1" />
                <p>
                  📍 {loc.lat.toFixed(6)}, {loc.lng.toFixed(6)}
                </p>
                {loc.batteryLevel !== null && (
                  <p>🔋 Battery: {Math.round(loc.batteryLevel)}%</p>
                )}
                <p className="text-xs text-sub mt-1">
                  Last update: {new Date(loc.timestamp).toLocaleString()}
                </p>
                {person.devices.length > 1 && (
                  <>
                    <hr className="my-1" />
                    <p className="text-xs text-hint font-medium">
                      Devices:
                    </p>
                    {person.devices.map((d) => (
                      <p key={d.id} className="text-xs text-sub">
                        {d.platform === "web" ? "💻" : "📱"} {d.name}
                        {d.latestLocation
                          ? ` · ${new Date(d.latestLocation.timestamp).toLocaleTimeString()}`
                          : " · No location"}
                      </p>
                    ))}
                  </>
                )}
              </div>
            </Popup>
          </Marker>
        );
      })}
    </MapContainer>

    {/* Tile Layer Picker */}
    <div style={{ position: "absolute", bottom: 24, right: 16, zIndex: 1000 }}>
      <button
        onClick={() => setShowPicker(!showPicker)}
        style={{
          width: 42, height: 42, borderRadius: "50%",
          background: "rgba(0,0,0,0.65)", border: "none", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "#fff", fontSize: 20, boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
        }}
        title="Change map style"
      >
        🗺
      </button>
      {showPicker && (
        <>
          <div
            onClick={() => setShowPicker(false)}
            style={{ position: "fixed", inset: 0, zIndex: 999 }}
          />
          <div
            style={{
              position: "absolute", bottom: 52, right: 0, zIndex: 1001,
              background: "var(--color-surface, #fff)", borderRadius: 12,
              padding: "6px 0", minWidth: 170,
              boxShadow: "0 4px 16px rgba(0,0,0,0.25)",
              border: "1px solid var(--color-edge, #e5e7eb)",
            }}
          >
            {TILE_IDS.map((id) => (
              <button
                key={id}
                onClick={() => handleTileChange(id)}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  width: "100%", padding: "10px 16px", border: "none",
                  background: id === tileId ? "var(--color-surface-light, #f3f4f6)" : "transparent",
                  cursor: "pointer", fontSize: 14,
                  fontWeight: id === tileId ? 700 : 500,
                  color: id === tileId ? "var(--color-accent, #3b82f6)" : "var(--color-text, #111)",
                }}
              >
                {TILE_LAYERS[id].label}
                {id === tileId && <span style={{ marginLeft: 8 }}>✓</span>}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
    </>
  );
}
