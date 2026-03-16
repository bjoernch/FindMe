"use client";

import { useEffect, useState } from "react";
import type { SharePublic, ApiResponse, ShareExpiry } from "@/types/api";

export default function SharePage() {
  const [shares, setShares] = useState<SharePublic[]>([]);
  const [loading, setLoading] = useState(true);
  const [expiry, setExpiry] = useState<ShareExpiry>("24h");
  const [newShareUrl, setNewShareUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    fetchShares();
  }, []);

  async function fetchShares() {
    try {
      const res = await fetch("/api/share");
      const data: ApiResponse<SharePublic[]> = await res.json();
      if (data.success && data.data) {
        setShares(data.data);
      }
    } catch (err) {
      console.error("Failed to fetch shares:", err);
    } finally {
      setLoading(false);
    }
  }

  async function createShare() {
    try {
      const res = await fetch("/api/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expiresIn: expiry }),
      });
      const data: ApiResponse<SharePublic> = await res.json();
      if (data.success && data.data) {
        const url = `${window.location.origin}/share/${data.data.shareToken}`;
        setNewShareUrl(url);
        fetchShares();
      }
    } catch (err) {
      console.error("Failed to create share:", err);
    }
  }

  async function revokeShare(id: string) {
    try {
      await fetch(`/api/share?id=${id}`, { method: "DELETE" });
      fetchShares();
    } catch (err) {
      console.error("Failed to revoke share:", err);
    }
  }

  async function copyToClipboard(text: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Fallback for non-HTTPS contexts
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }
    setCopied(text);
    setTimeout(() => setCopied(null), 2000);
  }

  function isExpired(expiresAt: string | null): boolean {
    if (!expiresAt) return false;
    return new Date() > new Date(expiresAt);
  }

  function formatExpiry(expiresAt: string | null): string {
    if (!expiresAt) return "Never expires";
    const date = new Date(expiresAt);
    if (date < new Date()) return "Expired";
    return `Expires ${date.toLocaleString()}`;
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold text-heading mb-6">Share Location</h1>

      {/* Create share */}
      <div className="bg-card border border-edge rounded-xl p-6 mb-6">
        <h2 className="text-lg font-semibold text-heading mb-4">
          Create Share Link
        </h2>
        <p className="text-sub text-sm mb-4">
          Anyone with the link can see your devices&apos; live locations. No
          login required.
        </p>

        <div className="flex items-end gap-3">
          <div>
            <label className="block text-sm text-sub mb-1">
              Expiration
            </label>
            <select
              value={expiry}
              onChange={(e) => setExpiry(e.target.value as ShareExpiry)}
              className="bg-input border border-edge-bold rounded-lg px-4 py-2.5 text-heading focus:outline-none focus:border-blue-500"
            >
              <option value="1h">1 hour</option>
              <option value="24h">24 hours</option>
              <option value="7d">7 days</option>
              <option value="never">Never</option>
            </select>
          </div>
          <button
            onClick={createShare}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-lg text-sm transition-colors"
          >
            Create Link
          </button>
        </div>

        {newShareUrl && (
          <div className="mt-4 bg-input rounded-lg p-4">
            <p className="text-sm text-sub mb-2">Share this link:</p>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newShareUrl}
                readOnly
                className="flex-1 bg-hover border border-edge-bold rounded px-3 py-2 text-heading text-sm font-mono"
              />
              <button
                onClick={() => copyToClipboard(newShareUrl)}
                className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded text-sm min-w-[70px]"
              >
                {copied === newShareUrl ? "Copied!" : "Copy"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Active shares */}
      <div className="bg-card border border-edge rounded-xl overflow-hidden">
        <div className="p-4 border-b border-edge">
          <h2 className="text-sm font-semibold text-heading uppercase tracking-wide">
            Active Shares
          </h2>
        </div>

        {loading ? (
          <div className="p-4 text-hint">Loading...</div>
        ) : shares.length === 0 ? (
          <div className="p-8 text-center text-hint">
            No active shares
          </div>
        ) : (
          shares.map((share) => {
            const expired = isExpired(share.expiresAt);
            const shareUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/share/${share.shareToken}`;

            return (
              <div
                key={share.id}
                className="p-4 border-b border-edge/50 flex items-center justify-between"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        share.isActive && !expired
                          ? "bg-green-400"
                          : "bg-gray-600"
                      }`}
                    />
                    <span className="text-sm text-heading font-mono">
                      ...{share.shareToken.slice(-8)}
                    </span>
                  </div>
                  <p className="text-xs text-hint mt-1">
                    Created {new Date(share.createdAt).toLocaleString()}{" "}
                    &middot; {formatExpiry(share.expiresAt)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => copyToClipboard(shareUrl)}
                    className="text-link hover:text-link-hover text-sm"
                  >
                    {copied === shareUrl ? "Copied!" : "Copy"}
                  </button>
                  {share.isActive && (
                    <button
                      onClick={() => revokeShare(share.id)}
                      className="text-danger-fg hover:text-danger-fg text-sm"
                    >
                      Revoke
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
