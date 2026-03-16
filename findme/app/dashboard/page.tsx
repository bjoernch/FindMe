"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import dynamic from "next/dynamic";
import { PeopleSidebar } from "@/components/people-sidebar";
import { InviteDialog } from "@/components/invite-dialog";
import { PendingInvitations } from "@/components/pending-invitations";
import { MapSkeleton, DeviceListSkeleton } from "@/components/loading-skeleton";
import type {
  DeviceWithLocation,
  PersonWithDevices,
  PeopleSharePublic,
  ApiResponse,
} from "@/types/api";

const LocationMap = dynamic(
  () => import("@/components/location-map").then((mod) => mod.LocationMap),
  { ssr: false, loading: () => <MapSkeleton /> }
);

export default function DashboardPage() {
  const [devices, setDevices] = useState<DeviceWithLocation[]>([]);
  const [people, setPeople] = useState<PersonWithDevices[]>([]);
  const [pendingInvitations, setPendingInvitations] = useState<
    PeopleSharePublic[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const [hiddenDevices, setHiddenDevices] = useState<Set<string>>(new Set());
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [showInvite, setShowInvite] = useState(false);
  const [showPending, setShowPending] = useState(false);

  const fetchDevices = useCallback(async () => {
    try {
      const res = await fetch("/api/location/latest");
      const data: ApiResponse<DeviceWithLocation[]> = await res.json();
      if (data.success && data.data) {
        setDevices(data.data);
      }
    } catch (err) {
      console.error("Failed to fetch devices:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchPeople = useCallback(async () => {
    try {
      const [peopleRes, pendingRes] = await Promise.all([
        fetch("/api/people"),
        fetch("/api/people/pending"),
      ]);

      const peopleData: ApiResponse<PersonWithDevices[]> =
        await peopleRes.json();
      if (peopleData.success && peopleData.data) {
        setPeople(peopleData.data);
      }

      const pendingData: ApiResponse<PeopleSharePublic[]> =
        await pendingRes.json();
      if (pendingData.success && pendingData.data) {
        setPendingInvitations(pendingData.data);
      }
    } catch (err) {
      console.error("Failed to fetch people:", err);
    }
  }, []);

  useEffect(() => {
    fetchDevices();
    fetchPeople();
    const interval = setInterval(() => {
      fetchDevices();
      fetchPeople();
      setLastRefresh(new Date());
    }, 30_000);
    return () => clearInterval(interval);
  }, [fetchDevices, fetchPeople]);

  const handleRefresh = () => {
    setLoading(true);
    fetchDevices();
    fetchPeople();
    setLastRefresh(new Date());
  };

  const toggleVisibility = (id: string) => {
    setHiddenDevices((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  return (
    <div className="h-[calc(100vh-52px)] relative">
      {/* Top-right controls */}
      <div className="absolute top-3 right-3 z-50 flex gap-2">
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="md:hidden bg-card/90 backdrop-blur text-heading px-3 py-2 rounded-lg border border-edge-bold text-sm"
        >
          People
        </button>
        <button
          onClick={handleRefresh}
          className="bg-card/90 backdrop-blur text-heading px-3 py-2 rounded-lg border border-edge-bold text-sm flex items-center gap-1"
        >
          <svg
            className={`w-4 h-4 ${loading ? "animate-spin" : ""}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
          <span className="hidden sm:inline text-xs text-sub">
            {lastRefresh.toLocaleTimeString()}
          </span>
        </button>
      </div>

      {/* People + Devices Sidebar */}
      <Suspense fallback={<DeviceListSkeleton />}>
        <PeopleSidebar
          myDevices={devices}
          people={people}
          pendingCount={pendingInvitations.length}
          selectedPersonId={selectedPersonId}
          selectedDeviceId={selectedDeviceId}
          onSelectPerson={(id) => {
            setSelectedPersonId(id);
            setSelectedDeviceId(null);
            setSidebarOpen(false);
          }}
          onSelectDevice={(id) => {
            setSelectedDeviceId(id);
            setSelectedPersonId(null);
            setSidebarOpen(false);
          }}
          hiddenDevices={hiddenDevices}
          onToggleVisibility={toggleVisibility}
          onOpenInvite={() => setShowInvite(true)}
          onOpenPending={() => setShowPending(true)}
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />
      </Suspense>

      {/* Map */}
      <div className="h-full md:ml-72">
        <LocationMap
          devices={devices}
          people={people}
          hiddenDevices={hiddenDevices}
          selectedDeviceId={selectedDeviceId}
          selectedPersonId={selectedPersonId}
        />
      </div>

      {/* Invite dialog */}
      {showInvite && (
        <InviteDialog
          onClose={() => setShowInvite(false)}
          onInvited={() => {
            setShowInvite(false);
            fetchPeople();
          }}
        />
      )}

      {/* Pending invitations */}
      {showPending && (
        <PendingInvitations
          invitations={pendingInvitations}
          onClose={() => setShowPending(false)}
          onResponded={() => {
            setShowPending(false);
            fetchPeople();
          }}
        />
      )}
    </div>
  );
}
