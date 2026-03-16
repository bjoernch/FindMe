"use client";

import { useState } from "react";
import { AvatarCircle } from "./avatar-circle";
import type { DeviceWithLocation, PersonWithDevices } from "@/types/api";

interface PeopleSidebarProps {
  myDevices: DeviceWithLocation[];
  people: PersonWithDevices[];
  pendingCount: number;
  selectedPersonId: string | null;
  selectedDeviceId: string | null;
  onSelectPerson: (userId: string) => void;
  onSelectDevice: (deviceId: string) => void;
  hiddenDevices: Set<string>;
  onToggleVisibility: (deviceId: string) => void;
  onOpenInvite: () => void;
  onOpenPending: () => void;
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
    case "android":
      return "📱";
    case "web":
      return "💻";
    default:
      return "📍";
  }
}

/** Get the most recent lastSeen across all of a person's devices */
function personLastSeen(devices: DeviceWithLocation[]): string | null {
  let latest: string | null = null;
  for (const d of devices) {
    if (d.latestLocation?.timestamp) {
      if (!latest || d.latestLocation.timestamp > latest) {
        latest = d.latestLocation.timestamp;
      }
    } else if (d.lastSeen) {
      if (!latest || d.lastSeen > latest) {
        latest = d.lastSeen;
      }
    }
  }
  return latest;
}

function BatteryIndicator({ level }: { level: number | null }) {
  if (level === null || level === undefined) return null;
  const color =
    level > 50
      ? "text-success-fg"
      : level > 20
        ? "text-warn-fg"
        : "text-danger-fg";
  return <span className={`text-xs ${color}`}>{Math.round(level)}%</span>;
}

export function PeopleSidebar({
  myDevices,
  people,
  pendingCount,
  selectedPersonId,
  selectedDeviceId,
  onSelectPerson,
  onSelectDevice,
  hiddenDevices,
  onToggleVisibility,
  onOpenInvite,
  onOpenPending,
  isOpen,
  onClose,
}: PeopleSidebarProps) {
  const [expandedPerson, setExpandedPerson] = useState<string | null>(null);
  const [myDevicesOpen, setMyDevicesOpen] = useState(true);

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
        className={`absolute top-0 left-0 h-full bg-card/95 backdrop-blur border-r border-edge z-40 transition-transform duration-200 w-72 flex flex-col ${
          isOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        }`}
      >
        {/* Header */}
        <div className="p-4 border-b border-edge flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-heading uppercase tracking-wide">
              People
            </h2>
            {pendingCount > 0 && (
              <button
                onClick={onOpenPending}
                className="bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center"
                title={`${pendingCount} pending invitation${pendingCount > 1 ? "s" : ""}`}
              >
                {pendingCount}
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onOpenInvite}
              className="text-link hover:text-link-hover text-xs font-medium"
            >
              + Invite
            </button>
            <button
              onClick={onClose}
              className="md:hidden text-sub hover:text-heading"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="overflow-y-auto flex-1">
          {/* People section */}
          {people.length === 0 ? (
            <div className="p-4 text-hint text-sm">
              <p>No one shared with you yet.</p>
              <p className="mt-1 text-xs text-dim">
                Invite family or friends to share locations.
              </p>
            </div>
          ) : (
            people.map((person) => {
              const online = isOnline(personLastSeen(person.devices));
              const selected = selectedPersonId === person.user.id;
              const expanded = expandedPerson === person.user.id;

              return (
                <div key={person.user.id}>
                  <div
                    className={`p-3 border-b border-edge/50 cursor-pointer transition-colors ${
                      selected
                        ? "bg-active-bg border-l-2 border-l-active-edge"
                        : "hover:bg-input/50"
                    }`}
                    onClick={() => {
                      onSelectPerson(person.user.id);
                      setExpandedPerson(
                        expanded ? null : person.user.id
                      );
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <AvatarCircle name={person.user.name} size="md" />
                        <span
                          className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-card ${
                            online ? "bg-green-400" : "bg-gray-600"
                          }`}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-heading font-medium truncate">
                          {person.user.name || person.user.email}
                        </p>
                        <p className="text-xs text-hint">
                          {formatLastSeen(personLastSeen(person.devices))}
                          {person.devices.length > 0 && (
                            <span className="ml-1">
                              · {person.devices.length} device
                              {person.devices.length > 1 ? "s" : ""}
                            </span>
                          )}
                        </p>
                      </div>
                      <svg
                        className={`w-4 h-4 text-hint transition-transform ${expanded ? "rotate-180" : ""}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 9l-7 7-7-7"
                        />
                      </svg>
                    </div>
                  </div>

                  {/* Expanded device list for this person */}
                  {expanded &&
                    person.devices.map((device) => {
                      const devOnline = isOnline(device.lastSeen);
                      return (
                        <div
                          key={device.id}
                          className={`pl-14 pr-3 py-2 border-b border-edge/30 cursor-pointer transition-colors ${
                            selectedDeviceId === device.id
                              ? "bg-active-bg"
                              : "hover:bg-input/30"
                          }`}
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectDevice(device.id);
                          }}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span
                                className={`w-1.5 h-1.5 rounded-full ${
                                  devOnline ? "bg-green-400" : "bg-gray-600"
                                }`}
                              />
                              <span className="text-xs text-heading">
                                {platformIcon(device.platform)} {device.name}
                                {device.isPrimary && (
                                  <span className="ml-1 text-warn-fg" title="Primary device">★</span>
                                )}
                              </span>
                            </div>
                            <BatteryIndicator
                              level={device.latestLocation?.batteryLevel ?? null}
                            />
                          </div>
                        </div>
                      );
                    })}
                </div>
              );
            })
          )}

          {/* My Devices section */}
          <div
            className="p-3 border-b border-edge border-t border-t-edge-bold cursor-pointer flex items-center justify-between"
            onClick={() => setMyDevicesOpen(!myDevicesOpen)}
          >
            <h3 className="text-xs font-semibold text-sub uppercase tracking-wide">
              My Devices ({myDevices.length})
            </h3>
            <svg
              className={`w-4 h-4 text-hint transition-transform ${myDevicesOpen ? "rotate-180" : ""}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </div>

          {myDevicesOpen &&
            myDevices.map((device) => {
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
            })}
        </div>
      </div>
    </>
  );
}
