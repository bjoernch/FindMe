"use client";

import type { DeviceWithLocation } from "@/types/api";

interface DeviceSidebarProps {
  devices: DeviceWithLocation[];
  selectedDeviceId: string | null;
  onSelectDevice: (id: string) => void;
  hiddenDevices: Set<string>;
  onToggleVisibility: (id: string) => void;
  isOpen: boolean;
  onClose: () => void;
}

function isOnline(lastSeen: string | null): boolean {
  if (!lastSeen) return false;
  return Date.now() - new Date(lastSeen).getTime() < 5 * 60 * 1000;
}

function formatLastSeen(lastSeen: string | null): string {
  if (!lastSeen) return "Never";
  const diff = Date.now() - new Date(lastSeen).getTime();
  if (diff < 60_000) return "Just now";
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`;
  return `${Math.floor(diff / 86400_000)}d ago`;
}

function platformIcon(platform: string): string {
  switch (platform) {
    case "ios":
      return "📱";
    case "android":
      return "📱";
    case "web":
      return "💻";
    default:
      return "📍";
  }
}

function BatteryIndicator({ level }: { level: number | null }) {
  if (level === null || level === undefined) return null;
  const color =
    level > 50 ? "text-success-fg" : level > 20 ? "text-warn-fg" : "text-danger-fg";
  return (
    <span className={`text-xs ${color}`}>
      {Math.round(level)}%
    </span>
  );
}

export function DeviceSidebar({
  devices,
  selectedDeviceId,
  onSelectDevice,
  hiddenDevices,
  onToggleVisibility,
  isOpen,
  onClose,
}: DeviceSidebarProps) {
  return (
    <>
      {/* Overlay on mobile */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 md:hidden"
          onClick={onClose}
        />
      )}

      <div
        className={`absolute top-0 left-0 h-full bg-card/95 backdrop-blur border-r border-edge z-40 transition-transform duration-200 w-72 ${
          isOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        }`}
      >
        <div className="p-4 border-b border-edge flex items-center justify-between">
          <h2 className="text-sm font-semibold text-heading uppercase tracking-wide">
            Devices ({devices.length})
          </h2>
          <button
            onClick={onClose}
            className="md:hidden text-sub hover:text-heading"
          >
            ✕
          </button>
        </div>

        <div className="overflow-y-auto h-[calc(100%-52px)]">
          {devices.length === 0 ? (
            <div className="p-4 text-hint text-sm">
              No devices registered yet.
            </div>
          ) : (
            devices.map((device) => {
              const online = isOnline(device.lastSeen);
              const hidden = hiddenDevices.has(device.id);
              const selected = selectedDeviceId === device.id;

              return (
                <div
                  key={device.id}
                  className={`p-3 border-b border-edge/50 cursor-pointer transition-colors ${
                    selected
                      ? "bg-active-bg border-l-2 border-l-active-edge"
                      : "hover:bg-input/50"
                  }`}
                  onClick={() => onSelectDevice(device.id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-2 h-2 rounded-full ${
                          online ? "bg-green-400" : "bg-gray-600"
                        }`}
                      />
                      <span className="text-sm text-heading font-medium">
                        {platformIcon(device.platform)} {device.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <BatteryIndicator
                        level={device.latestLocation?.batteryLevel ?? null}
                      />
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleVisibility(device.id);
                        }}
                        className={`text-xs px-1.5 py-0.5 rounded ${
                          hidden
                            ? "bg-hover text-sub"
                            : "bg-input text-heading"
                        }`}
                        title={hidden ? "Show on map" : "Hide from map"}
                      >
                        {hidden ? "Hidden" : "Visible"}
                      </button>
                    </div>
                  </div>
                  <div className="mt-1 text-xs text-hint ml-4">
                    {formatLastSeen(device.lastSeen)}
                    {device.latestLocation && (
                      <span className="ml-2">
                        {device.latestLocation.lat.toFixed(4)},{" "}
                        {device.latestLocation.lng.toFixed(4)}
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </>
  );
}
