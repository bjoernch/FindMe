"use client";

import { useEffect } from "react";
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

  const tileUrl =
    process.env.NEXT_PUBLIC_MAP_TILE_URL ||
    (isDark
      ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
      : "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png");
  const attribution =
    process.env.NEXT_PUBLIC_MAP_ATTRIBUTION || "";

  // Reverse so oldest is first (polyline order)
  const sorted = [...locations].reverse();
  const positions: [number, number][] = sorted.map((l) => [l.lat, l.lng]);

  return (
    <MapContainer
      center={[51.505, -0.09]}
      zoom={3}
      className="w-full h-full"
      style={{ background: "var(--map-bg)" }}
      zoomControl={false}
    >
      <TileLayer url={tileUrl} attribution={attribution} />
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
  );
}
