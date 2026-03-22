"use client";

import { useEffect, useState } from "react";
import {
  MapContainer,
  TileLayer,
  Polyline,
  CircleMarker,
  Popup,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import { useTheme } from "./theme-provider";
import type { LocationData } from "@/types/api";

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
  useEffect(() => {
    const layer = TILE_LAYERS[tileId];
    map.eachLayer((l) => { if (l instanceof L.TileLayer) map.removeLayer(l); });
    L.tileLayer(layer.url, { maxZoom: layer.maxZoom }).addTo(map);
  }, [tileId, map]);
  return null;
}

function FitPolyline({ locations }: { locations: LocationData[] }) {
  const map = useMap();

  useEffect(() => {
    if (locations.length === 0) return;

    const bounds = L.latLngBounds(
      locations.map((l) => [l.lat, l.lng])
    );
    map.fitBounds(bounds, { padding: [30, 30] });
  }, [locations, map]);

  return null;
}

function FlyToPoint({ point }: { point: LocationData | null }) {
  const map = useMap();

  useEffect(() => {
    if (!point) return;
    map.flyTo([point.lat, point.lng], 16, { duration: 0.5 });
  }, [point, map]);

  return null;
}

function PanToPlayback({ point }: { point: LocationData | null }) {
  const map = useMap();

  useEffect(() => {
    if (!point) return;
    map.panTo([point.lat, point.lng], { animate: true, duration: 0.3 });
  }, [point, map]);

  return null;
}

interface HistoryMapProps {
  locations: LocationData[];
  selectedPoint: LocationData | null;
  onSelectPoint: (point: LocationData) => void;
  playbackPoint?: LocationData | null;
}

export function HistoryMap({
  locations,
  selectedPoint,
  onSelectPoint: _onSelectPoint,
  playbackPoint,
}: HistoryMapProps) {
  const { isDark } = useTheme();

  const [tileId, setTileId] = useState<TileLayerId>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("findme-history-tile");
      if (saved && saved in TILE_LAYERS) return saved as TileLayerId;
    }
    return isDark ? "dark" : "light";
  });
  const [showPicker, setShowPicker] = useState(false);
  const [userChose, setUserChose] = useState(() => {
    if (typeof window !== "undefined") return !!localStorage.getItem("findme-history-tile");
    return false;
  });

  useEffect(() => {
    if (!userChose) setTileId(isDark ? "dark" : "light");
  }, [isDark, userChose]);

  function handleTileChange(id: TileLayerId) {
    setTileId(id);
    setUserChose(true);
    setShowPicker(false);
    localStorage.setItem("findme-history-tile", id);
  }

  // Reverse so oldest is first (polyline order)
  const sorted = [...locations].reverse();
  const positions: [number, number][] = sorted.map((l) => [l.lat, l.lng]);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
    <MapContainer
      center={[51.505, -0.09]}
      zoom={3}
      className="w-full h-full"
      style={{ background: "var(--map-bg)" }}
      zoomControl={false}
    >
      <TileLayerSwitcher tileId={tileId} />
      <FitPolyline locations={locations} />
      {!playbackPoint && <FlyToPoint point={selectedPoint} />}
      {playbackPoint && <PanToPlayback point={playbackPoint} />}

      {positions.length > 1 && (
        <Polyline
          positions={positions}
          pathOptions={{
            color: "#3b82f6",
            weight: 3,
            opacity: 0.7,
          }}
        />
      )}

      {/* Start marker */}
      {sorted.length > 0 && (
        <CircleMarker
          center={[sorted[0].lat, sorted[0].lng]}
          radius={8}
          pathOptions={{ color: "#22c55e", fillColor: "#22c55e", fillOpacity: 1 }}
        >
          <Popup>
            <div className="text-sm">
              <p className="font-bold">Start</p>
              <p>{new Date(sorted[0].timestamp).toLocaleString()}</p>
            </div>
          </Popup>
        </CircleMarker>
      )}

      {/* End marker */}
      {sorted.length > 1 && (
        <CircleMarker
          center={[sorted[sorted.length - 1].lat, sorted[sorted.length - 1].lng]}
          radius={8}
          pathOptions={{ color: "#ef4444", fillColor: "#ef4444", fillOpacity: 1 }}
        >
          <Popup>
            <div className="text-sm">
              <p className="font-bold">End</p>
              <p>
                {new Date(sorted[sorted.length - 1].timestamp).toLocaleString()}
              </p>
            </div>
          </Popup>
        </CircleMarker>
      )}

      {/* Playback marker (pulsing) */}
      {playbackPoint && (
        <CircleMarker
          center={[playbackPoint.lat, playbackPoint.lng]}
          radius={10}
          pathOptions={{
            color: "#f59e0b",
            fillColor: "#f59e0b",
            fillOpacity: 0.9,
            weight: 3,
          }}
        >
          <Popup>
            <div className="text-sm">
              <p className="font-bold">Playback</p>
              <p>{playbackPoint.lat.toFixed(6)}, {playbackPoint.lng.toFixed(6)}</p>
              <p>{new Date(playbackPoint.timestamp).toLocaleString()}</p>
              {playbackPoint.speed != null && <p>{(playbackPoint.speed * 3.6).toFixed(1)} km/h</p>}
            </div>
          </Popup>
        </CircleMarker>
      )}

      {/* Selected point (only when not in playback) */}
      {selectedPoint && !playbackPoint && (
        <CircleMarker
          center={[selectedPoint.lat, selectedPoint.lng]}
          radius={6}
          pathOptions={{
            color: "#f59e0b",
            fillColor: "#f59e0b",
            fillOpacity: 1,
          }}
        >
          <Popup>
            <div className="text-sm">
              <p className="font-bold">Selected Point</p>
              <p>
                {selectedPoint.lat.toFixed(6)}, {selectedPoint.lng.toFixed(6)}
              </p>
              <p>{new Date(selectedPoint.timestamp).toLocaleString()}</p>
            </div>
          </Popup>
        </CircleMarker>
      )}
    </MapContainer>
    {/* Tile picker */}
    <div style={{ position: "absolute", bottom: 12, right: 12, zIndex: 1000 }}>
      <button
        onClick={() => setShowPicker(!showPicker)}
        style={{
          width: 48, height: 48, borderRadius: "50%",
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
          <div onClick={() => setShowPicker(false)} style={{ position: "fixed", inset: 0, zIndex: 999 }} />
          <div style={{
            position: "absolute", bottom: 52, right: 0, zIndex: 1001,
            background: "var(--color-surface, #fff)", borderRadius: 12,
            padding: "6px 0", minWidth: 170,
            boxShadow: "0 4px 16px rgba(0,0,0,0.25)",
            border: "1px solid var(--color-edge, #e5e7eb)",
          }}>
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
    </div>
  );
}
