"use client";

import { useState, useEffect, useRef } from "react";
import { AvatarCircle } from "./avatar-circle";
import type { UserPublic, ApiResponse } from "@/types/api";

interface InviteDialogProps {
  onClose: () => void;
  onInvited: () => void;
}

export function InviteDialog({ onClose, onInvited }: InviteDialogProps) {
  const [email, setEmail] = useState("");
  const [suggestions, setSuggestions] = useState<UserPublic[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (email.length < 2) {
      setSuggestions([]);
      return;
    }

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/people/search?q=${encodeURIComponent(email)}`
        );
        const data: ApiResponse<UserPublic[]> = await res.json();
        if (data.success && data.data) {
          setSuggestions(data.data);
        }
      } catch {
        // Ignore search errors
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [email]);

  async function handleInvite(targetEmail: string) {
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch("/api/people/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: targetEmail }),
      });
      const data = await res.json();

      if (data.success) {
        setSuccess(`Invitation sent to ${targetEmail}`);
        setEmail("");
        setSuggestions([]);
        setTimeout(() => onInvited(), 1500);
      } else {
        setError(data.error || "Failed to send invitation");
      }
    } catch {
      setError("Failed to send invitation");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-[9999] flex items-center justify-center p-4">
      <div className="bg-card border border-edge rounded-xl w-full max-w-md">
        <div className="p-4 border-b border-edge flex items-center justify-between">
          <h2 className="text-lg font-semibold text-heading">
            Invite Someone
          </h2>
          <button
            onClick={onClose}
            className="text-sub hover:text-heading text-xl"
          >
            ✕
          </button>
        </div>

        <div className="p-4 space-y-4">
          <p className="text-sm text-sub">
            Share your location with another user on this server. They&apos;ll
            receive an invitation to accept.
          </p>

          <div>
            <label className="block text-sm text-sub mb-1">
              Email address
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              className="w-full bg-input border border-edge-bold rounded-lg px-4 py-2.5 text-heading focus:outline-none focus:border-blue-500"
              autoFocus
            />
          </div>

          {/* Suggestions */}
          {suggestions.length > 0 && (
            <div className="bg-input rounded-lg overflow-hidden">
              {suggestions.map((user) => (
                <button
                  key={user.id}
                  onClick={() => handleInvite(user.email)}
                  disabled={loading}
                  className="w-full px-4 py-3 flex items-center gap-3 hover:bg-hover transition-colors text-left"
                >
                  <AvatarCircle name={user.name} size="sm" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-heading font-medium truncate">
                      {user.name || "No name"}
                    </p>
                    <p className="text-xs text-sub truncate">
                      {user.email}
                    </p>
                  </div>
                  <span className="text-xs text-link shrink-0">
                    Invite
                  </span>
                </button>
              ))}
            </div>
          )}

          {error && (
            <p className="text-danger-fg text-sm">{error}</p>
          )}
          {success && (
            <p className="text-success-fg text-sm">{success}</p>
          )}

          <button
            onClick={() => handleInvite(email)}
            disabled={loading || !email.includes("@")}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-hover disabled:cursor-not-allowed text-white font-medium py-2.5 rounded-lg transition-colors"
          >
            {loading ? "Sending..." : "Send Invitation"}
          </button>
        </div>
      </div>
    </div>
  );
}
