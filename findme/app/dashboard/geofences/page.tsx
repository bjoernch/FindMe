"use client";

import { useState, useEffect } from "react";
import type { ApiResponse } from "@/types/api";

interface Geofence {
  id: string;
  name: string;
  lat: number;
  lng: number;
  radiusM: number;
  isActive: boolean;
  onEnter: boolean;
  onExit: boolean;
  createdAt: string;
  events: Array<{
    id: string;
    deviceName: string;
    eventType: string;
    lat: number;
    lng: number;
    timestamp: string;
  }>;
}

export default function GeofencesPage() {
  const [geofences, setGeofences] = useState<Geofence[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [radius, setRadius] = useState("200");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadGeofences();
  }, []);

  async function loadGeofences() {
    try {
      const res = await fetch("/api/geofences");
      const data: ApiResponse<Geofence[]> = await res.json();
      if (data.success && data.data) setGeofences(data.data);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }

  async function createGeofence() {
    if (!name || !lat || !lng) {
      setError("Name, latitude, and longitude are required");
      return;
    }
    try {
      const res = await fetch("/api/geofences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          lat: parseFloat(lat),
          lng: parseFloat(lng),
          radiusM: parseFloat(radius) || 200,
        }),
      });
      const data: ApiResponse<Geofence> = await res.json();
      if (data.success) {
        setShowCreate(false);
        setName("");
        setLat("");
        setLng("");
        setRadius("200");
        setError(null);
        loadGeofences();
      } else {
        setError(data.error || "Failed to create geofence");
      }
    } catch {
      setError("Network error");
    }
  }

  async function deleteGeofence(id: string) {
    if (!confirm("Delete this geofence?")) return;
    try {
      await fetch("/api/geofences", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ geofenceId: id }),
      });
      loadGeofences();
    } catch {
      // silent
    }
  }

  async function toggleGeofence(id: string, isActive: boolean) {
    try {
      await fetch("/api/geofences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ geofenceId: id, isActive: !isActive }),
      });
      loadGeofences();
    } catch {
      // silent
    }
  }

  if (loading) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <div className="text-sub">Loading...</div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-heading">Geofences</h1>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm transition-colors"
        >
          {showCreate ? "Cancel" : "Create Geofence"}
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="bg-card border border-edge rounded-xl p-6 mb-6">
          <h3 className="text-lg font-semibold text-heading mb-4">
            New Geofence
          </h3>
          {error && (
            <div className="text-danger-fg text-sm mb-3">{error}</div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-sub mb-1">Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Home, Office"
                className="w-full bg-input border border-edge-bold rounded-lg px-4 py-2.5 text-heading focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm text-sub mb-1">
                Radius (meters)
              </label>
              <input
                type="number"
                value={radius}
                onChange={(e) => setRadius(e.target.value)}
                className="w-full bg-input border border-edge-bold rounded-lg px-4 py-2.5 text-heading focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm text-sub mb-1">Latitude</label>
              <input
                type="text"
                value={lat}
                onChange={(e) => setLat(e.target.value)}
                placeholder="e.g. 52.5200"
                className="w-full bg-input border border-edge-bold rounded-lg px-4 py-2.5 text-heading focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm text-sub mb-1">Longitude</label>
              <input
                type="text"
                value={lng}
                onChange={(e) => setLng(e.target.value)}
                placeholder="e.g. 13.4050"
                className="w-full bg-input border border-edge-bold rounded-lg px-4 py-2.5 text-heading focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>
          <button
            onClick={createGeofence}
            disabled={!name || !lat || !lng}
            className="mt-4 bg-blue-600 hover:bg-blue-700 disabled:bg-hover disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg text-sm transition-colors"
          >
            Create
          </button>
        </div>
      )}

      {/* Geofence list */}
      {geofences.length === 0 ? (
        <div className="bg-card border border-edge rounded-xl p-12 text-center">
          <p className="text-sub text-lg mb-2">No geofences created</p>
          <p className="text-hint text-sm">
            Create a geofence to get alerts when devices enter or leave an area.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {geofences.map((fence) => (
            <div
              key={fence.id}
              className="bg-card border border-edge rounded-xl p-4"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <span
                    className={`w-3 h-3 rounded-full ${
                      fence.isActive ? "bg-success-fg" : "bg-dim"
                    }`}
                  />
                  <div>
                    <h3 className="text-heading font-medium">{fence.name}</h3>
                    <p className="text-hint text-xs">
                      {fence.lat.toFixed(6)}, {fence.lng.toFixed(6)} &middot;{" "}
                      {fence.radiusM}m radius
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => toggleGeofence(fence.id, fence.isActive)}
                    className="text-xs text-link hover:text-link-hover"
                  >
                    {fence.isActive ? "Disable" : "Enable"}
                  </button>
                  <button
                    onClick={() => deleteGeofence(fence.id)}
                    className="text-xs text-danger-fg hover:opacity-80"
                  >
                    Delete
                  </button>
                </div>
              </div>

              {/* Recent events */}
              {fence.events.length > 0 && (
                <div className="mt-3 border-t border-edge pt-2">
                  <p className="text-xs text-sub mb-1 font-medium">
                    Recent Events
                  </p>
                  {fence.events.map((event) => (
                    <div
                      key={event.id}
                      className="flex items-center gap-2 text-xs text-hint py-0.5"
                    >
                      <span
                        className={
                          event.eventType === "ENTER"
                            ? "text-success-fg"
                            : "text-warn-fg"
                        }
                      >
                        {event.eventType === "ENTER" ? "Entered" : "Exited"}
                      </span>
                      <span>{event.deviceName}</span>
                      <span className="ml-auto">
                        {new Date(event.timestamp).toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
