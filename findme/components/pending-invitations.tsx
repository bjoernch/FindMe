"use client";

import { useState } from "react";
import { AvatarCircle } from "./avatar-circle";
import type { PeopleSharePublic } from "@/types/api";

interface PendingInvitationsProps {
  invitations: PeopleSharePublic[];
  onClose: () => void;
  onResponded: () => void;
}

export function PendingInvitations({
  invitations,
  onClose,
  onResponded,
}: PendingInvitationsProps) {
  const [responding, setResponding] = useState<string | null>(null);

  async function handleRespond(shareId: string, action: "accept" | "decline") {
    setResponding(shareId);
    try {
      const res = await fetch("/api/people/respond", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shareId, action }),
      });
      const data = await res.json();
      if (data.success) {
        onResponded();
      }
    } catch (err) {
      console.error("Failed to respond:", err);
    } finally {
      setResponding(null);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-[9999] flex items-center justify-center p-4">
      <div className="bg-card border border-edge rounded-xl w-full max-w-md">
        <div className="p-4 border-b border-edge flex items-center justify-between">
          <h2 className="text-lg font-semibold text-heading">
            Pending Invitations
          </h2>
          <button
            onClick={onClose}
            className="text-sub hover:text-heading text-xl"
          >
            ✕
          </button>
        </div>

        <div className="max-h-[400px] overflow-y-auto">
          {invitations.length === 0 ? (
            <div className="p-8 text-center text-hint">
              No pending invitations
            </div>
          ) : (
            invitations.map((inv) => (
              <div
                key={inv.id}
                className="p-4 border-b border-edge/50 flex items-center gap-3"
              >
                <AvatarCircle
                  name={inv.fromUser?.name ?? null}
                  size="md"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-heading font-medium truncate">
                    {inv.fromUser?.name || "Unknown"}
                  </p>
                  <p className="text-xs text-sub truncate">
                    {inv.fromUser?.email} wants to share locations
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() => handleRespond(inv.id, "accept")}
                    disabled={responding === inv.id}
                    className="bg-green-600 hover:bg-green-700 disabled:bg-hover text-white text-xs px-3 py-1.5 rounded-lg transition-colors"
                  >
                    Accept
                  </button>
                  <button
                    onClick={() => handleRespond(inv.id, "decline")}
                    disabled={responding === inv.id}
                    className="bg-hover hover:bg-hover disabled:bg-input text-heading text-xs px-3 py-1.5 rounded-lg transition-colors"
                  >
                    Decline
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
