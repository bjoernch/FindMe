"use client";

import { useEffect, useState, useCallback, use } from "react";
import dynamic from "next/dynamic";
import { MapSkeleton } from "@/components/loading-skeleton";
import type { SharedLocationView, ApiResponse } from "@/types/api";

const LocationMap = dynamic(
  () => import("@/components/location-map").then((mod) => mod.LocationMap),
  { ssr: false, loading: () => <MapSkeleton /> }
);

export default function PublicSharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const [shareData, setShareData] = useState<SharedLocationView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchShare = useCallback(async () => {
    try {
      const res = await fetch(`/api/share/${token}`);
      const data: ApiResponse<SharedLocationView> = await res.json();
      if (data.success && data.data) {
        setShareData(data.data);
        setError(null);
      } else {
        setError(data.error || "Failed to load shared location");
      }
    } catch {
      setError("Failed to load shared location");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchShare();
    const interval = setInterval(fetchShare, 30_000);
    return () => clearInterval(interval);
  }, [fetchShare]);

  if (loading) {
    return (
      <div className="min-h-screen bg-page flex items-center justify-center">
        <div className="text-sub">Loading shared location...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-page flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-heading mb-2">FindMe</h1>
          <p className="text-danger-fg">{error}</p>
        </div>
      </div>
    );
  }

  if (!shareData) return null;

  return (
    <div className="min-h-screen bg-page flex flex-col">
      <header className="bg-card border-b border-edge px-4 py-3 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-xl font-bold text-heading">FindMe</span>
          <span className="text-sub text-sm">
            Shared by {shareData.ownerName || "Unknown"}
          </span>
        </div>
        {shareData.expiresAt && (
          <span className="text-xs text-hint">
            Expires: {new Date(shareData.expiresAt).toLocaleString()}
          </span>
        )}
      </header>
      <main className="flex-1 relative">
        <div className="h-[calc(100vh-52px)]">
          <LocationMap
            devices={shareData.devices}
            hiddenDevices={new Set()}
            selectedDeviceId={null}
          />
        </div>
      </main>
    </div>
  );
}
