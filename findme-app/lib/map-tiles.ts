export type MapTileLayerId = "dark" | "light" | "satellite" | "osm";

export interface MapTileLayer {
  id: MapTileLayerId;
  label: string;
  url: string;
  maxZoom: number;
}

export const MAP_TILE_LAYERS: Record<MapTileLayerId, MapTileLayer> = {
  dark: {
    id: "dark",
    label: "Dark Streets",
    url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    maxZoom: 19,
  },
  light: {
    id: "light",
    label: "Light Streets",
    url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    maxZoom: 19,
  },
  satellite: {
    id: "satellite",
    label: "Satellite",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    maxZoom: 18,
  },
  osm: {
    id: "osm",
    label: "OpenStreetMap",
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    maxZoom: 19,
  },
};

export const TILE_LAYER_IDS: MapTileLayerId[] = ["dark", "light", "satellite", "osm"];

export const TILE_BG_COLORS: Record<MapTileLayerId, string> = {
  dark: "#0e1626",
  light: "#e5e7eb",
  satellite: "#1a1a2e",
  osm: "#e8e0d8",
};
