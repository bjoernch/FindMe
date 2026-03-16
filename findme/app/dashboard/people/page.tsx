"use client";

import { useEffect, useState, useCallback } from "react";
import { AvatarCircle } from "@/components/avatar-circle";
import { InviteDialog } from "@/components/invite-dialog";

import type {
  PersonWithDevices,
  PeopleSharePublic,
  ApiResponse,
} from "@/types/api";

function formatLastSeen(lastSeen: string | null): string {
  if (!lastSeen) return "Never";
  const diff = Date.now() - new Date(lastSeen).getTime();
  if (diff < 60_000) return "Just now";
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`;
  return `${Math.floor(diff / 86400_000)}d ago`;
}

function personLastSeen(person: PersonWithDevices): string | null {
  let latest: string | null = null;
  for (const d of person.devices) {
    const ts = d.latestLocation?.timestamp ?? d.lastSeen;
    if (ts && (!latest || ts > latest)) latest = ts;
  }
  return latest;
}

function isOnline(lastSeen: string | null): boolean {
  if (!lastSeen) return false;
  return Date.now() - new Date(lastSeen).getTime() < 5 * 60 * 1000;
}

export default function PeoplePage() {

  const [people, setPeople] = useState<PersonWithDevices[]>([]);
  const [pendingReceived, setPendingReceived] = useState<PeopleSharePublic[]>(
    []
  );
  const [pendingSent, setPendingSent] = useState<PeopleSharePublic[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [respondingId, setRespondingId] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      const [peopleRes, pendingRes, sentRes] = await Promise.all([
        fetch("/api/people"),
        fetch("/api/people/pending"),
        fetch("/api/people/sent"),
      ]);

      const peopleData: ApiResponse<PersonWithDevices[]> =
        await peopleRes.json();
      if (peopleData.success && peopleData.data) {
        setPeople(peopleData.data);
      }

      const pendingData: ApiResponse<PeopleSharePublic[]> =
        await pendingRes.json();
      if (pendingData.success && pendingData.data) {
        setPendingReceived(pendingData.data);
      }

      // Sent endpoint might not exist yet, handle gracefully
      if (sentRes.ok) {
        const sentData: ApiResponse<PeopleSharePublic[]> =
          await sentRes.json();
        if (sentData.success && sentData.data) {
          setPendingSent(sentData.data);
        }
      }
    } catch (err) {
      console.error("Failed to fetch people:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  async function handleRespond(shareId: string, action: "accept" | "decline") {
    setRespondingId(shareId);
    try {
      await fetch("/api/people/respond", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shareId, action }),
      });
      fetchAll();
    } catch (err) {
      console.error("Failed to respond:", err);
    } finally {
      setRespondingId(null);
    }
  }

  async function handleStopSharing(shareId: string) {
    try {
      await fetch(`/api/people?id=${shareId}`, { method: "DELETE" });
      fetchAll();
    } catch (err) {
      console.error("Failed to stop sharing:", err);
    }
  }

  // We need to fetch the share IDs for the stop-sharing action.
  // For now, fetch all shares involving the user.
  const [shareMap, setShareMap] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    async function fetchShares() {
      try {
        const res = await fetch("/api/people/shares");
        if (!res.ok) return;
        const data = await res.json();
        if (data.success && data.data) {
          const map = new Map<string, string>();
          for (const s of data.data as PeopleSharePublic[]) {
            // Map other user's ID to the share ID
            map.set(s.fromUserId, s.id);
            map.set(s.toUserId, s.id);
          }
          setShareMap(map);
        }
      } catch {
        // Ignore
      }
    }
    fetchShares();
  }, [people]);

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-heading">"People"</h1>
        <button
          onClick={() => setShowInvite(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm transition-colors"
        >
          + "Invite"
        </button>
      </div>

      {/* Pending invitations received */}
      {pendingReceived.length > 0 && (
        <div className="bg-card border border-edge rounded-xl overflow-hidden mb-6">
          <div className="p-4 border-b border-edge">
            <h2 className="text-sm font-semibold text-heading uppercase tracking-wide">
              Pending Invitations ({pendingReceived.length})
            </h2>
          </div>
          {pendingReceived.map((inv) => (
            <div
              key={inv.id}
              className="p-4 border-b border-edge/50 flex items-center gap-3"
            >
              <AvatarCircle name={inv.fromUser?.name ?? null} size="md" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-heading font-medium truncate">
                  {inv.fromUser?.name || "Unknown"}
                </p>
                <p className="text-xs text-sub truncate">
                  {inv.fromUser?.email} wants to share locations with you
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={() => handleRespond(inv.id, "accept")}
                  disabled={respondingId === inv.id}
                  className="bg-green-600 hover:bg-green-700 disabled:bg-hover text-white text-sm px-3 py-1.5 rounded-lg transition-colors"
                >
                  Accept
                </button>
                <button
                  onClick={() => handleRespond(inv.id, "decline")}
                  disabled={respondingId === inv.id}
                  className="bg-hover hover:bg-hover disabled:bg-input text-heading text-sm px-3 py-1.5 rounded-lg transition-colors"
                >
                  Decline
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Active contacts */}
      <div className="bg-card border border-edge rounded-xl overflow-hidden mb-6">
        <div className="p-4 border-b border-edge">
          <h2 className="text-sm font-semibold text-heading uppercase tracking-wide">
            Sharing With ({people.length})
          </h2>
        </div>
        {loading ? (
          <div className="p-8 text-center text-hint">Loading...</div>
        ) : people.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-sub text-lg mb-2">
              No one here yet
            </p>
            <p className="text-hint text-sm">
              Invite family or friends to share locations with each other.
            </p>
          </div>
        ) : (
          people.map((person) => {
            const lastSeen = personLastSeen(person);
            const online = isOnline(lastSeen);
            const shareId = shareMap.get(person.user.id);

            return (
              <div
                key={person.user.id}
                className="p-4 border-b border-edge/50 flex items-center gap-3"
              >
                <div className="relative">
                  <AvatarCircle name={person.user.name} size="lg" />
                  <span
                    className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-card ${
                      online ? "bg-green-400" : "bg-gray-600"
                    }`}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-heading font-medium truncate">
                    {person.user.name || person.user.email}
                  </p>
                  <p className="text-xs text-sub">
                    {formatLastSeen(lastSeen)} &middot;{" "}
                    {person.devices.length} device
                    {person.devices.length !== 1 ? "s" : ""}
                  </p>
                  {person.devices.length > 0 && (
                    <div className="flex gap-2 mt-1">
                      {person.devices.map((d) => (
                        <span
                          key={d.id}
                          className="text-xs text-hint bg-input rounded px-1.5 py-0.5"
                        >
                          {d.platform === "web" ? "💻" : "📱"} {d.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                {shareId && (
                  <button
                    onClick={() => handleStopSharing(shareId)}
                    className="text-danger-fg hover:text-danger-fg text-sm shrink-0"
                  >
                    Stop Sharing
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Sent invitations that are still pending */}
      {pendingSent.length > 0 && (
        <div className="bg-card border border-edge rounded-xl overflow-hidden">
          <div className="p-4 border-b border-edge">
            <h2 className="text-sm font-semibold text-heading uppercase tracking-wide">
              Sent Invitations ({pendingSent.length})
            </h2>
          </div>
          {pendingSent.map((inv) => (
            <div
              key={inv.id}
              className="p-4 border-b border-edge/50 flex items-center gap-3"
            >
              <AvatarCircle name={inv.toUser?.name ?? null} size="sm" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-heading font-medium truncate">
                  {inv.toUser?.name || inv.toUser?.email || "Unknown"}
                </p>
                <p className="text-xs text-sub">Pending</p>
              </div>
              <span className="text-xs text-warn-fg bg-warn-bg px-2 py-0.5 rounded">
                Awaiting response
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Invite dialog */}
      {showInvite && (
        <InviteDialog
          onClose={() => setShowInvite(false)}
          onInvited={() => {
            setShowInvite(false);
            fetchAll();
          }}
        />
      )}
    </div>
  );
}
