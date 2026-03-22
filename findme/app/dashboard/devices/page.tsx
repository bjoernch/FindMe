"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { TableSkeleton } from "@/components/loading-skeleton";

import type { DevicePublic, ApiResponse } from "@/types/api";

export default function DevicesPage() {

  const [devices, setDevices] = useState<DevicePublic[]>([]);
  const [loading, setLoading] = useState(true);
  const [showRegister, setShowRegister] = useState(false);
  const [newDeviceName, setNewDeviceName] = useState("");
  const [newDevicePlatform, setNewDevicePlatform] = useState<
    "ios" | "android" | "web"
  >("ios");
  const [registeredToken, setRegisteredToken] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  useEffect(() => {
    fetchDevices();
  }, []);

  async function fetchDevices() {
    try {
      const res = await fetch("/api/devices");
      const data: ApiResponse<DevicePublic[]> = await res.json();
      if (data.success && data.data) {
        setDevices(data.data);
      }
    } catch (err) {
      console.error("Failed to fetch devices:", err);
    } finally {
      setLoading(false);
    }
  }

  async function registerDevice() {
    try {
      const res = await fetch("/api/devices/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newDeviceName, platform: newDevicePlatform }),
      });
      const data: ApiResponse<DevicePublic> = await res.json();
      if (data.success && data.data) {
        setRegisteredToken(data.data.token);
        setNewDeviceName("");
        fetchDevices();
      }
    } catch (err) {
      console.error("Failed to register device:", err);
    }
  }

  async function renameDevice(id: string) {
    try {
      await fetch(`/api/devices/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName }),
      });
      setEditingId(null);
      fetchDevices();
    } catch (err) {
      console.error("Failed to rename device:", err);
    }
  }

  async function setPrimaryDevice(id: string) {
    try {
      await fetch(`/api/devices/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPrimary: true }),
      });
      fetchDevices();
    } catch (err) {
      console.error("Failed to set primary device:", err);
    }
  }

  async function deactivateDevice(id: string) {
    if (!confirm("Revoke this device? It will no longer be able to send location updates.")) {
      return;
    }
    try {
      await fetch(`/api/devices/${id}`, { method: "DELETE" });
      fetchDevices();
    } catch (err) {
      console.error("Failed to deactivate device:", err);
    }
  }

  async function removeDevice(id: string, name: string) {
    if (!confirm(`Permanently remove "${name}"? This will delete the device and all its location history. This cannot be undone.`)) {
      return;
    }
    try {
      await fetch(`/api/devices/${id}?permanent=true`, { method: "DELETE" });
      fetchDevices();
    } catch (err) {
      console.error("Failed to remove device:", err);
    }
  }

  function formatLastSeen(lastSeen: string | null): string {
    if (!lastSeen) return "Never";
    return new Date(lastSeen).toLocaleString();
  }

  function isOnline(lastSeen: string | null): boolean {
    if (!lastSeen) return false;
    return Date.now() - new Date(lastSeen).getTime() < 5 * 60 * 1000;
  }

  function platformIcon(platform: string): string {
    switch (platform) {
      case "ios":
      case "android":
        return "📱";
      case "web":
        return "💻";
      default:
        return "📍";
    }
  }

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-heading">Devices</h1>
        <button
          onClick={() => {
            setShowRegister(!showRegister);
            setRegisteredToken(null);
          }}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm transition-colors"
        >
          {showRegister ? "Cancel" : "Register Device"}
        </button>
      </div>

      {/* Register form */}
      {showRegister && (
        <div className="bg-card border border-edge rounded-xl p-6 mb-6">
          {registeredToken ? (
            <div>
              <h3 className="text-lg font-semibold text-heading mb-2">
                Device Registered!
              </h3>
              <p className="text-sub text-sm mb-4">
                Use this token to configure the mobile app. Keep it secret.
              </p>
              <div className="bg-input rounded-lg p-4 font-mono text-sm text-success-fg break-all">
                {registeredToken}
              </div>
              <p className="text-hint text-xs mt-3">
                Copy this token into your mobile app settings. It will not be shown again.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-sub mb-1">
                  Device Name
                </label>
                <input
                  type="text"
                  value={newDeviceName}
                  onChange={(e) => setNewDeviceName(e.target.value)}
                  placeholder="e.g. My iPhone"
                  className="w-full bg-input border border-edge-bold rounded-lg px-4 py-2.5 text-heading focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm text-sub mb-1">
                  Platform
                </label>
                <select
                  value={newDevicePlatform}
                  onChange={(e) =>
                    setNewDevicePlatform(
                      e.target.value as "ios" | "android" | "web"
                    )
                  }
                  className="w-full bg-input border border-edge-bold rounded-lg px-4 py-2.5 text-heading focus:outline-none focus:border-blue-500"
                >
                  <option value="ios">iOS</option>
                  <option value="android">Android</option>
                  <option value="web">Web</option>
                </select>
              </div>
              <button
                onClick={registerDevice}
                disabled={!newDeviceName}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-hover disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg text-sm transition-colors"
              >
                Register
              </button>
            </div>
          )}
        </div>
      )}

      {/* Device list */}
      {loading ? (
        <TableSkeleton />
      ) : devices.length === 0 ? (
        <div className="bg-card border border-edge rounded-xl p-12 text-center">
          <p className="text-sub text-lg mb-2">No devices registered</p>
          <p className="text-hint text-sm">
            Register a device to start tracking locations.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {devices.map((device) => {
            const online = isOnline(device.lastSeen);
            return (
              <div
                key={device.id}
                className="bg-card border border-edge rounded-xl p-4 flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`w-3 h-3 rounded-full ${
                      online ? "bg-green-400" : "bg-gray-600"
                    }`}
                  />
                  <div>
                    {editingId === device.id ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="bg-input border border-edge-bold rounded px-2 py-1 text-heading text-sm"
                          autoFocus
                        />
                        <button
                          onClick={() => renameDevice(device.id)}
                          className="text-success-fg text-sm"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="text-sub text-sm"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <p className="text-heading font-medium">
                          {platformIcon(device.platform)} {device.name}
                        </p>
                        {device.isPrimary && (
                          <span className="bg-warn-bg text-warn-fg text-xs px-2 py-0.5 rounded-full font-medium">
                            Primary
                          </span>
                        )}
                      </div>
                    )}
                    <p className="text-hint text-xs">
                      {device.platform} &middot;{" "}
                      {device.isActive ? "Active" : "Revoked"}
                      {device.appVersion ? ` · v${device.appVersion}` : ""}
                      {" "}&middot; Last seen: {formatLastSeen(device.lastSeen)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Link
                    href={`/dashboard/devices/${device.id}/history`}
                    className="text-link hover:text-link-hover text-sm"
                  >
                    History
                  </Link>
                  {device.isActive && !device.isPrimary && (
                    <button
                      onClick={() => setPrimaryDevice(device.id)}
                      className="text-warn-fg hover:text-warn-fg text-sm"
                    >
                      Set Primary
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setEditingId(device.id);
                      setEditName(device.name);
                    }}
                    className="text-sub hover:text-heading text-sm"
                  >
                    Rename
                  </button>
                  {device.isActive && (
                    <button
                      onClick={() => deactivateDevice(device.id)}
                      className="text-danger-fg hover:text-danger-fg text-sm"
                    >
                      Revoke
                    </button>
                  )}
                  <button
                    onClick={() => removeDevice(device.id, device.name)}
                    className="text-danger-fg hover:text-danger-fg text-sm font-semibold"
                  >
                    Remove
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
