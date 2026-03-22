"use client";

import { useState, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import type { ApiResponse } from "@/types/api";

// Lazy-load the map component (Leaflet needs window)
const GeofenceMap = dynamic(() => import("@/components/geofence-map"), {
  ssr: false,
  loading: () => (
    <div className="h-[500px] bg-card border border-edge rounded-xl animate-pulse flex items-center justify-center">
      <span className="text-sub">Loading map...</span>
    </div>
  ),
});

interface MonitoredUser {
  id: string;
  name: string | null;
  email: string;
}

interface Geofence {
  id: string;
  name: string;
  lat: number;
  lng: number;
  radiusM: number;
  isActive: boolean;
  onEnter: boolean;
  onExit: boolean;
  monitoredUserId: string | null;
  monitoredUser: MonitoredUser | null;
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

interface SharedPerson {
  user: { id: string; name: string | null; email: string };
}

export default function GeofencesPage() {
  const [geofences, setGeofences] = useState<Geofence[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newFence, setNewFence] = useState<{
    lat: number;
    lng: number;
    radiusM: number;
    name: string;
    onEnter: boolean;
    onExit: boolean;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [sharedPeople, setSharedPeople] = useState<SharedPerson[]>([]);
  const [editing, setEditing] = useState(false);
  const [editValues, setEditValues] = useState<{
    name: string;
    radiusM: number;
    onEnter: boolean;
    onExit: boolean;
  } | null>(null);

  useEffect(() => {
    loadGeofences();
    loadSharedPeople();
  }, []);

  async function loadSharedPeople() {
    try {
      const res = await fetch("/api/people");
      const data = await res.json();
      if (data.success && data.data) setSharedPeople(data.data);
    } catch {
      // silent
    }
  }

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

  const [monitorTarget, setMonitorTarget] = useState<string>("");

  function handleMapClick(lat: number, lng: number) {
    if (!creating) return;
    setNewFence({
      lat,
      lng,
      radiusM: 200,
      name: "",
      onEnter: true,
      onExit: true,
    });
    setSelectedId(null);
  }

  async function saveNewFence() {
    if (!newFence || !newFence.name.trim()) {
      setError("Name is required");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/geofences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newFence.name,
          lat: newFence.lat,
          lng: newFence.lng,
          radiusM: newFence.radiusM,
          onEnter: newFence.onEnter,
          onExit: newFence.onExit,
          monitoredUserId: monitorTarget || undefined,
        }),
      });
      const data: ApiResponse<Geofence> = await res.json();
      if (data.success) {
        setNewFence(null);
        setCreating(false);
        setMonitorTarget("");
        loadGeofences();
      } else {
        setError(data.error || "Failed to create geofence");
      }
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  }

  async function updateFence(id: string, updates: Partial<Geofence>) {
    try {
      await fetch("/api/geofences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ geofenceId: id, ...updates }),
      });
      loadGeofences();
    } catch {
      // silent
    }
  }

  async function deleteFence(id: string) {
    if (!confirm("Delete this geofence?")) return;
    try {
      await fetch("/api/geofences", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ geofenceId: id }),
      });
      if (selectedId === id) setSelectedId(null);
      loadGeofences();
    } catch {
      // silent
    }
  }

  const selected = geofences.find((f) => f.id === selectedId);

  if (loading) {
    return (
      <div className="p-4 sm:p-6 max-w-6xl mx-auto">
        <div className="text-sub">Loading...</div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-heading">Geofences</h1>
        <button
          onClick={() => {
            setCreating(!creating);
            setNewFence(null);
            setSelectedId(null);
            setError(null);
          }}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            creating
              ? "bg-gray-600 hover:bg-gray-700 text-white"
              : "bg-blue-600 hover:bg-blue-700 text-white"
          }`}
        >
          {creating ? "Cancel" : "Create Geofence"}
        </button>
      </div>

      {creating && !newFence && (
        <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-3 mb-4 text-blue-400 text-sm">
          Click anywhere on the map to place a geofence
        </div>
      )}

      {/* Map */}
      <div className="h-[500px] rounded-xl overflow-hidden border border-edge mb-4">
        <GeofenceMap
          geofences={geofences}
          selectedId={selectedId}
          onSelectFence={setSelectedId}
          newFence={newFence}
          onMapClick={handleMapClick}
          onNewFenceRadiusChange={(r) => newFence && setNewFence({ ...newFence, radiusM: r })}
        />
      </div>

      {/* New geofence panel */}
      {newFence && (
        <div className="bg-card border border-edge rounded-xl p-5 mb-4">
          <h3 className="text-lg font-semibold text-heading mb-4">New Geofence</h3>
          {error && <div className="text-danger-fg text-sm mb-3">{error}</div>}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm text-sub mb-1">Name</label>
              <input
                type="text"
                value={newFence.name}
                onChange={(e) => setNewFence({ ...newFence, name: e.target.value })}
                placeholder="e.g. Home, Office, School"
                className="w-full bg-input border border-edge-bold rounded-lg px-4 py-2.5 text-heading focus:outline-none focus:border-blue-500"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-sm text-sub mb-1">
                Radius: {newFence.radiusM}m
              </label>
              <input
                type="range"
                min={50}
                max={5000}
                step={50}
                value={newFence.radiusM}
                onChange={(e) =>
                  setNewFence({ ...newFence, radiusM: parseInt(e.target.value) })
                }
                className="w-full accent-blue-500"
              />
              <div className="flex justify-between text-xs text-hint mt-1">
                <span>50m</span>
                <span>5km</span>
              </div>
            </div>
          </div>
          {sharedPeople.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm text-sub mb-1">Monitor</label>
                <select
                  value={monitorTarget}
                  onChange={(e) => setMonitorTarget(e.target.value)}
                  className="w-full bg-input border border-edge-bold rounded-lg px-4 py-2.5 text-heading focus:outline-none focus:border-blue-500"
                >
                  <option value="">My Devices</option>
                  {sharedPeople.map((p) => (
                    <option key={p.user.id} value={p.user.id}>
                      {p.user.name || p.user.email}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
          <div className="flex items-center gap-6 mb-4">
            <label className="flex items-center gap-2 text-sm text-heading cursor-pointer">
              <input
                type="checkbox"
                checked={newFence.onEnter}
                onChange={(e) =>
                  setNewFence({ ...newFence, onEnter: e.target.checked })
                }
                className="accent-blue-500"
              />
              Notify on enter
            </label>
            <label className="flex items-center gap-2 text-sm text-heading cursor-pointer">
              <input
                type="checkbox"
                checked={newFence.onExit}
                onChange={(e) =>
                  setNewFence({ ...newFence, onExit: e.target.checked })
                }
                className="accent-blue-500"
              />
              Notify on exit
            </label>
          </div>
          <div className="flex gap-3">
            <button
              onClick={saveNewFence}
              disabled={saving || !newFence.name.trim()}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              {saving ? "Saving..." : "Save Geofence"}
            </button>
            <button
              onClick={() => {
                setNewFence(null);
                setCreating(false);
              }}
              className="bg-input hover:bg-hover text-heading px-4 py-2 rounded-lg text-sm font-medium transition-colors border border-edge"
            >
              Cancel
            </button>
          </div>
          <p className="text-xs text-hint mt-3">
            📍 {newFence.lat.toFixed(6)}, {newFence.lng.toFixed(6)}
          </p>
        </div>
      )}

      {/* Selected geofence detail */}
      {selected && !newFence && (
        <div className="bg-card border border-edge rounded-xl p-5 mb-4">
          <div className="flex items-center justify-between mb-3">
            {editing && editValues ? (
              <input
                type="text"
                value={editValues.name}
                onChange={(e) => setEditValues({ ...editValues, name: e.target.value })}
                className="text-lg font-semibold text-heading bg-input border border-edge-bold rounded-lg px-3 py-1 focus:outline-none focus:border-blue-500"
              />
            ) : (
              <h3 className="text-lg font-semibold text-heading">{selected.name}</h3>
            )}
            <div className="flex items-center gap-3">
              {editing ? (
                <>
                  <button
                    onClick={async () => {
                      if (editValues) {
                        await updateFence(selected.id, editValues);
                        setEditing(false);
                        setEditValues(null);
                      }
                    }}
                    className="text-xs text-success-fg hover:opacity-80 font-medium"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => { setEditing(false); setEditValues(null); }}
                    className="text-xs text-sub hover:text-heading"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => {
                      setEditing(true);
                      setEditValues({
                        name: selected.name,
                        radiusM: selected.radiusM,
                        onEnter: selected.onEnter,
                        onExit: selected.onExit,
                      });
                    }}
                    className="text-xs text-link hover:text-link-hover"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => updateFence(selected.id, { isActive: !selected.isActive })}
                    className="text-xs text-link hover:text-link-hover"
                  >
                    {selected.isActive ? "Disable" : "Enable"}
                  </button>
                  <button
                    onClick={() => deleteFence(selected.id)}
                    className="text-xs text-danger-fg hover:opacity-80"
                  >
                    Delete
                  </button>
                </>
              )}
            </div>
          </div>
          {editing && editValues ? (
            <>
              <div className="mb-3">
                <label className="block text-sm text-sub mb-1">
                  Radius: {editValues.radiusM}m
                </label>
                <input
                  type="range"
                  min={50}
                  max={5000}
                  step={50}
                  value={editValues.radiusM}
                  onChange={(e) => setEditValues({ ...editValues, radiusM: parseInt(e.target.value) })}
                  className="w-full accent-blue-500"
                />
                <div className="flex justify-between text-xs text-hint mt-1">
                  <span>50m</span>
                  <span>5km</span>
                </div>
              </div>
              <div className="flex items-center gap-6 mb-3">
                <label className="flex items-center gap-2 text-sm text-heading cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editValues.onEnter}
                    onChange={(e) => setEditValues({ ...editValues, onEnter: e.target.checked })}
                    className="accent-blue-500"
                  />
                  Notify on enter
                </label>
                <label className="flex items-center gap-2 text-sm text-heading cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editValues.onExit}
                    onChange={(e) => setEditValues({ ...editValues, onExit: e.target.checked })}
                    className="accent-blue-500"
                  />
                  Notify on exit
                </label>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-hint mb-3">
                📍 {selected.lat.toFixed(6)}, {selected.lng.toFixed(6)} · {selected.radiusM}m radius ·{" "}
                <span className={selected.isActive ? "text-success-fg" : "text-dim"}>
                  {selected.isActive ? "Active" : "Disabled"}
                </span>
                {selected.monitoredUser && (
                  <span className="ml-2">
                    · Monitoring: <span className="text-heading font-medium">{selected.monitoredUser.name || selected.monitoredUser.email}</span>
                  </span>
                )}
              </p>
              <div className="flex items-center gap-4 mb-3 text-sm text-sub">
                <span>{selected.onEnter ? "✓ Enter alerts" : "✗ Enter alerts"}</span>
                <span>{selected.onExit ? "✓ Exit alerts" : "✗ Exit alerts"}</span>
              </div>
            </>
          )}
          {selected.events.length > 0 && (
            <div className="border-t border-edge pt-3 mt-3">
              <p className="text-xs text-sub font-medium mb-2">Recent Events</p>
              {selected.events.map((event) => (
                <div key={event.id} className="flex items-center gap-2 text-xs text-hint py-0.5">
                  <span className={event.eventType === "ENTER" ? "text-success-fg" : "text-warn-fg"}>
                    {event.eventType === "ENTER" ? "Entered" : "Exited"}
                  </span>
                  <span>{event.deviceName}</span>
                  <span className="ml-auto">{new Date(event.timestamp).toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Geofence list */}
      {geofences.length > 0 && !newFence && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-sub uppercase tracking-wide mb-2">
            All Geofences ({geofences.length})
          </h2>
          {geofences.map((fence) => (
            <div
              key={fence.id}
              onClick={() => setSelectedId(fence.id)}
              className={`bg-card border rounded-xl p-3 cursor-pointer transition-colors ${
                selectedId === fence.id
                  ? "border-blue-500 bg-active-bg"
                  : "border-edge hover:bg-input/50"
              }`}
            >
              <div className="flex items-center gap-3">
                <span
                  className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                    fence.isActive ? "bg-success-fg" : "bg-dim"
                  }`}
                />
                <div className="flex-1 min-w-0">
                  <span className="text-heading font-medium text-sm">{fence.name}</span>
                  <span className="text-hint text-xs ml-2">{fence.radiusM}m</span>
                  {fence.monitoredUser && (
                    <span className="text-hint text-xs ml-2">
                      · {fence.monitoredUser.name || fence.monitoredUser.email}
                    </span>
                  )}
                </div>
                {fence.events.length > 0 && (
                  <span className="text-xs text-hint">
                    Last: {new Date(fence.events[0].timestamp).toLocaleDateString()}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {geofences.length === 0 && !creating && (
        <div className="bg-card border border-edge rounded-xl p-12 text-center">
          <p className="text-sub text-lg mb-2">No geofences created</p>
          <p className="text-hint text-sm">
            Create a geofence to get alerts when devices enter or leave an area.
          </p>
        </div>
      )}
    </div>
  );
}
