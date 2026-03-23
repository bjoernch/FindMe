"use client";

import { useEffect, useRef, useState } from "react";
import {
  MapContainer,
  Circle,
  Tooltip,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import { useTheme } from "./theme-provider";

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
    if (layerRef.current) map.removeLayer(layerRef.current);
    const tile = TILE_LAYERS[tileId];
    const newLayer = L.tileLayer(tile.url, {
      maxZoom: tile.maxZoom,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>',
    }).addTo(map);
    layerRef.current = newLayer;
    return () => { if (layerRef.current) map.removeLayer(layerRef.current); };
  }, [tileId, map]);

  return null;
}

// ── Click Handler ──────────────────────────────────────
function ClickHandler({ onClick }: { onClick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

// ── Fit Bounds ──────────────────────────────────────
function FitToFences({ geofences }: { geofences: Array<{ lat: number; lng: number }> }) {
  const map = useMap();
  const hasSetBounds = useRef(false);

  useEffect(() => {
    if (hasSetBounds.current || geofences.length === 0) return;
    const bounds = L.latLngBounds(geofences.map((f) => [f.lat, f.lng]));
    map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 });
    hasSetBounds.current = true;
  }, [geofences, map]);

  return null;
}

// ── Focus on Selected ──────────────────────────────────────
function FocusOnSelected({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo([lat, lng], 15, { duration: 0.5 });
  }, [lat, lng, map]);
  return null;
}

// ── Props ──────────────────────────────────────
interface GeofenceData {
  id: string;
  name: string;
  lat: number;
  lng: number;
  radiusM: number;
  isActive: boolean;
}

interface GeofenceMapProps {
  geofences: GeofenceData[];
  selectedId: string | null;
  onSelectFence: (id: string | null) => void;
  newFence: { lat: number; lng: number; radiusM: number } | null;
  onMapClick: (lat: number, lng: number) => void;
  onNewFenceRadiusChange: (radius: number) => void;
}

export default function GeofenceMap({
  geofences,
  selectedId,
  onSelectFence,
  newFence,
  onMapClick,
}: GeofenceMapProps) {
  const { isDark } = useTheme();
  const [tileId, setTileId] = useState<TileLayerId>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("findme-geofence-tile");
      if (saved && saved in TILE_LAYERS) return saved as TileLayerId;
    }
    return isDark ? "dark" : "light";
  });
  const [userChose, setUserChose] = useState(() => {
    if (typeof window !== "undefined") return !!localStorage.getItem("findme-geofence-tile");
    return false;
  });
  const selected = geofences.find((f) => f.id === selectedId);

  useEffect(() => {
    if (!userChose) setTileId(isDark ? "dark" : "light");
  }, [isDark, userChose]);

  // Default center: first geofence or world center
  const center: [number, number] = geofences.length > 0
    ? [geofences[0].lat, geofences[0].lng]
    : [47.37, 8.54]; // Zurich default

  return (
    <MapContainer
      center={center}
      zoom={geofences.length > 0 ? 13 : 4}
      style={{ height: "100%", width: "100%" }}
      zoomControl={true}
    >
      <TileLayerSwitcher tileId={tileId} />
      <ClickHandler onClick={onMapClick} />
      <FitToFences geofences={geofences} />
      {selected && <FocusOnSelected lat={selected.lat} lng={selected.lng} />}

      {/* Existing geofences */}
      {geofences.map((fence) => (
        <Circle
          key={fence.id}
          center={[fence.lat, fence.lng]}
          radius={fence.radiusM}
          pathOptions={{
            color: selectedId === fence.id ? "#3b82f6" : fence.isActive ? "#22c55e" : "#6b7280",
            fillColor: selectedId === fence.id ? "#3b82f6" : fence.isActive ? "#22c55e" : "#6b7280",
            fillOpacity: selectedId === fence.id ? 0.25 : 0.15,
            weight: selectedId === fence.id ? 3 : 2,
          }}
          eventHandlers={{
            click: (e) => {
              L.DomEvent.stopPropagation(e);
              onSelectFence(fence.id);
            },
          }}
        >
          <Tooltip permanent direction="center" className="geofence-label">
            {fence.name}
          </Tooltip>
        </Circle>
      ))}

      {/* New geofence being placed */}
      {newFence && (
        <Circle
          center={[newFence.lat, newFence.lng]}
          radius={newFence.radiusM}
          pathOptions={{
            color: "#f59e0b",
            fillColor: "#f59e0b",
            fillOpacity: 0.25,
            weight: 3,
            dashArray: "8 4",
          }}
        >
          <Tooltip permanent direction="center" className="geofence-label">
            New Geofence
          </Tooltip>
        </Circle>
      )}

      {/* Tile switcher control */}
      <div className="leaflet-bottom leaflet-left" style={{ pointerEvents: "auto" }}>
        <div
          style={{
            background: "rgba(0,0,0,0.7)",
            borderRadius: 8,
            padding: "4px",
            margin: 10,
            display: "flex",
            gap: 2,
          }}
        >
          {TILE_IDS.map((id) => (
            <button
              key={id}
              onClick={(e) => { e.stopPropagation(); setTileId(id); setUserChose(true); localStorage.setItem("findme-geofence-tile", id); }}
              style={{
                padding: "4px 8px",
                fontSize: 11,
                borderRadius: 6,
                border: "none",
                cursor: "pointer",
                background: tileId === id ? "#3b82f6" : "transparent",
                color: tileId === id ? "#fff" : "#9ca3af",
                fontWeight: tileId === id ? 600 : 400,
              }}
            >
              {TILE_LAYERS[id].label}
            </button>
          ))}
        </div>
      </div>
    </MapContainer>
  );
}
