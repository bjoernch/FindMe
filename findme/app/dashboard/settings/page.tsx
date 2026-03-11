"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import type { QrSessionPublic, ApiResponse, PasskeyPublic } from "@/types/api";
import {
  startRegistration,
  browserSupportsWebAuthn,
} from "@simplewebauthn/browser";
import { useI18n } from "@/lib/i18n/context";
import type { Locale } from "@/lib/i18n/translations";

function LanguageSelector() {
  const { locale, setLocale, locales } = useI18n();

  return (
    <div className="bg-card border border-edge rounded-xl p-6 mb-6">
      <h2 className="text-lg font-semibold text-heading mb-2">Language</h2>
      <p className="text-sub text-sm mb-4">
        Choose your preferred language for the dashboard.
      </p>
      <div className="flex flex-wrap gap-2">
        {(Object.entries(locales) as [Locale, string][]).map(([code, name]) => (
          <button
            key={code}
            onClick={() => setLocale(code)}
            className={`px-4 py-2 rounded-lg text-sm transition-colors ${
              locale === code
                ? "bg-blue-600 text-white"
                : "bg-input text-sub hover:text-heading hover:bg-hover"
            }`}
          >
            {name}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const { t } = useI18n();
  const { data: session } = useSession();
  const [name, setName] = useState(session?.user?.name || "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [retentionDays, setRetentionDays] = useState(90);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);

  // QR pairing state
  const [qrSession, setQrSession] = useState<QrSessionPublic | null>(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [qrImageUrl, setQrImageUrl] = useState<string | null>(null);
  const [qrTimeLeft, setQrTimeLeft] = useState(0);
  const [copied, setCopied] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Passkey state
  const [passkeys, setPasskeys] = useState<PasskeyPublic[]>([]);
  const [passkeysLoading, setPasskeysLoading] = useState(false);
  const [passkeyRegistering, setPasskeyRegistering] = useState(false);
  const [passkeyName, setPasskeyName] = useState("");
  const [showPasskeyNameInput, setShowPasskeyNameInput] = useState(false);
  const [supportsPasskey, setSupportsPasskey] = useState(false);

  const clearTimers = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
    pollRef.current = null;
    timerRef.current = null;
  }, []);

  useEffect(() => {
    return () => clearTimers();
  }, [clearTimers]);

  // Load passkeys and check support on mount
  useEffect(() => {
    setSupportsPasskey(browserSupportsWebAuthn());
    loadPasskeys();
  }, []);

  async function loadPasskeys() {
    setPasskeysLoading(true);
    try {
      const res = await fetch("/api/settings/passkeys");
      const data: ApiResponse<PasskeyPublic[]> = await res.json();
      if (data.success && data.data) {
        setPasskeys(data.data);
      }
    } catch {
      // ignore load errors
    } finally {
      setPasskeysLoading(false);
    }
  }

  async function handleRegisterPasskey() {
    setPasskeyRegistering(true);
    setMessage(null);

    try {
      // Step 1: Get registration options
      const optionsRes = await fetch("/api/auth/passkey/register-options", {
        method: "POST",
      });
      const optionsData = await optionsRes.json();

      if (!optionsData.success || !optionsData.data) {
        setMessage({
          type: "error",
          text: optionsData.error || "Failed to start passkey registration",
        });
        setPasskeyRegistering(false);
        return;
      }

      // Step 2: Prompt user to create passkey
      const credential = await startRegistration({
        optionsJSON: optionsData.data,
      });

      // Step 3: Verify with server
      const verifyRes = await fetch("/api/auth/passkey/register-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          credential,
          name: passkeyName || "Passkey",
        }),
      });
      const verifyData = await verifyRes.json();

      if (!verifyData.success) {
        setMessage({
          type: "error",
          text: verifyData.error || "Passkey registration failed",
        });
        setPasskeyRegistering(false);
        return;
      }

      setMessage({ type: "success", text: "Passkey registered successfully!" });
      setPasskeyName("");
      setShowPasskeyNameInput(false);
      loadPasskeys();
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Passkey registration failed";
      if (
        !errorMessage.includes("cancelled") &&
        !errorMessage.includes("abort")
      ) {
        setMessage({ type: "error", text: errorMessage });
      }
    } finally {
      setPasskeyRegistering(false);
    }
  }

  async function handleDeletePasskey(id: string, pkName: string) {
    if (!confirm(`Remove passkey "${pkName}"?`)) return;

    try {
      const res = await fetch(`/api/settings/passkeys?id=${id}`, {
        method: "DELETE",
      });
      const data = await res.json();

      if (data.success) {
        setMessage({ type: "success", text: "Passkey removed" });
        loadPasskeys();
      } else {
        setMessage({
          type: "error",
          text: data.error || "Failed to remove passkey",
        });
      }
    } catch {
      setMessage({ type: "error", text: "Failed to remove passkey" });
    }
  }

  async function generateQrSession() {
    setQrLoading(true);
    setQrSession(null);
    setQrImageUrl(null);
    clearTimers();

    try {
      const res = await fetch("/api/auth/qr-session", { method: "POST" });
      const data: ApiResponse<QrSessionPublic> = await res.json();

      if (data.success && data.data) {
        const sess = data.data;
        setQrSession(sess);

        // Generate QR code image using the qrcode library via a dynamic import
        const QRCode = (await import("qrcode")).default;
        const url = await QRCode.toDataURL(sess.qrData, {
          width: 256,
          margin: 2,
          color: { dark: "#ffffff", light: "#00000000" },
        });
        setQrImageUrl(url);

        // Start countdown
        const expiresAt = new Date(sess.expiresAt).getTime();
        setQrTimeLeft(Math.max(0, Math.floor((expiresAt - Date.now()) / 1000)));

        timerRef.current = setInterval(() => {
          const left = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
          setQrTimeLeft(left);
          if (left <= 0) {
            clearTimers();
            setQrSession(null);
            setQrImageUrl(null);
          }
        }, 1000);

        // Poll for session used
        pollRef.current = setInterval(async () => {
          try {
            const pollRes = await fetch(
              `/api/auth/qr-session?id=${sess.id}`
            );
            const pollData = await pollRes.json();
            if (pollData.success && pollData.data) {
              if (pollData.data.used) {
                clearTimers();
                setQrSession(null);
                setQrImageUrl(null);
                setMessage({
                  type: "success",
                  text: "Device paired successfully!",
                });
              } else if (pollData.data.expired) {
                clearTimers();
                setQrSession(null);
                setQrImageUrl(null);
              }
            }
          } catch {
            // ignore poll errors
          }
        }, 3000);
      }
    } catch {
      setMessage({ type: "error", text: "Failed to generate pairing code" });
    } finally {
      setQrLoading(false);
    }
  }

  async function copyToken() {
    if (!qrSession) return;
    await navigator.clipboard.writeText(qrSession.token);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    try {
      const body: Record<string, unknown> = {};
      if (name && name !== session?.user?.name) body.name = name;
      if (newPassword) {
        body.currentPassword = currentPassword;
        body.newPassword = newPassword;
      }

      if (Object.keys(body).length === 0) {
        setMessage({ type: "error", text: "No changes to save" });
        setSaving(false);
        return;
      }

      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (data.success) {
        setMessage({ type: "success", text: "Settings updated successfully" });
        setCurrentPassword("");
        setNewPassword("");
      } else {
        setMessage({ type: "error", text: data.error || "Failed to update" });
      }
    } catch {
      setMessage({ type: "error", text: "Failed to update settings" });
    } finally {
      setSaving(false);
    }
  }

  async function handleCleanup() {
    if (!confirm(`Delete all location data older than ${retentionDays} days?`)) {
      return;
    }

    setSaving(true);
    setMessage(null);

    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ retentionDays }),
      });
      const data = await res.json();

      if (data.success) {
        const deleted = data.data?.locationsDeleted ?? 0;
        setMessage({
          type: "success",
          text: `Deleted ${deleted} old location records`,
        });
      } else {
        setMessage({ type: "error", text: data.error || "Failed to cleanup" });
      }
    } catch {
      setMessage({ type: "error", text: "Failed to cleanup data" });
    } finally {
      setSaving(false);
    }
  }

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-heading mb-6">{t("settings.title")}</h1>

      {message && (
        <div
          className={`mb-6 p-4 rounded-lg border ${
            message.type === "success"
              ? "bg-success-bg border-success-edge text-success-fg"
              : "bg-danger-bg border-danger-edge text-danger-fg"
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Language Selection */}
      <LanguageSelector />

      {/* Mobile App Pairing */}
      <div className="bg-card border border-edge rounded-xl p-6 mb-6">
        <h2 className="text-lg font-semibold text-heading mb-2">
          Pair Mobile App
        </h2>
        <p className="text-sub text-sm mb-4">
          Scan the QR code with the FindMe mobile app or enter the pairing token
          manually.
        </p>

        {qrSession && qrImageUrl ? (
          <div className="space-y-4">
            <div className="flex flex-col items-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={qrImageUrl}
                alt="Pairing QR Code"
                className="w-64 h-64 bg-input rounded-xl p-2"
              />
              <p className="text-sub text-sm mt-2">
                Expires in{" "}
                <span className="text-heading font-mono">
                  {formatTime(qrTimeLeft)}
                </span>
              </p>
            </div>

            <div>
              <label className="block text-sm text-sub mb-1">
                Pairing Token (manual entry)
              </label>
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-input border border-edge-bold rounded-lg px-4 py-2.5 text-success-fg text-sm font-mono break-all select-all">
                  {qrSession.token}
                </code>
                <button
                  onClick={copyToken}
                  className="shrink-0 bg-hover hover:bg-hover text-heading px-3 py-2.5 rounded-lg text-sm transition-colors"
                >
                  {copied ? "Copied!" : "Copy"}
                </button>
              </div>
            </div>

            <button
              onClick={generateQrSession}
              className="text-sm text-sub hover:text-heading transition-colors"
            >
              Generate new code
            </button>
          </div>
        ) : (
          <button
            onClick={generateQrSession}
            disabled={qrLoading}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-hover text-white px-4 py-2.5 rounded-lg text-sm transition-colors"
          >
            {qrLoading ? "Generating..." : "Generate Pairing Code"}
          </button>
        )}
      </div>

      {/* Passkeys */}
      {supportsPasskey && (
        <div className="bg-card border border-edge rounded-xl p-6 mb-6">
          <h2 className="text-lg font-semibold text-heading mb-2">Passkeys</h2>
          <p className="text-sub text-sm mb-4">
            Use a passkey for faster, passwordless sign-in on the web. Passkeys
            are stored securely on your device.
          </p>

          {/* Existing passkeys list */}
          {passkeysLoading ? (
            <p className="text-sub text-sm">Loading passkeys...</p>
          ) : passkeys.length > 0 ? (
            <div className="space-y-2 mb-4">
              {passkeys.map((pk) => (
                <div
                  key={pk.id}
                  className="flex items-center justify-between bg-input border border-edge-bold rounded-lg px-4 py-3"
                >
                  <div>
                    <p className="text-heading text-sm font-medium">
                      {pk.name}
                    </p>
                    <p className="text-hint text-xs">
                      {pk.deviceType === "multiDevice"
                        ? "Synced passkey"
                        : "Device-bound passkey"}
                      {pk.backedUp ? " (backed up)" : ""} &middot; Added{" "}
                      {new Date(pk.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <button
                    onClick={() => handleDeletePasskey(pk.id, pk.name)}
                    className="text-danger-fg hover:text-red-400 text-sm transition-colors"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sub text-sm mb-4">
              No passkeys registered yet.
            </p>
          )}

          {/* Add passkey */}
          {showPasskeyNameInput ? (
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <label className="block text-sm text-sub mb-1">
                  Passkey name (optional)
                </label>
                <input
                  type="text"
                  value={passkeyName}
                  onChange={(e) => setPasskeyName(e.target.value)}
                  placeholder='e.g. "MacBook Pro"'
                  className="w-full bg-input border border-edge-bold rounded-lg px-4 py-2.5 text-heading focus:outline-none focus:border-blue-500 text-sm"
                />
              </div>
              <button
                onClick={handleRegisterPasskey}
                disabled={passkeyRegistering}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-hover text-white px-4 py-2.5 rounded-lg text-sm transition-colors whitespace-nowrap"
              >
                {passkeyRegistering ? "Registering..." : "Register"}
              </button>
              <button
                onClick={() => {
                  setShowPasskeyNameInput(false);
                  setPasskeyName("");
                }}
                className="text-sub hover:text-heading px-3 py-2.5 rounded-lg text-sm transition-colors"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowPasskeyNameInput(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-lg text-sm transition-colors"
            >
              Add Passkey
            </button>
          )}
        </div>
      )}

      {/* Profile */}
      <form
        onSubmit={handleSaveProfile}
        className="bg-card border border-edge rounded-xl p-6 mb-6"
      >
        <h2 className="text-lg font-semibold text-heading mb-4">Profile</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-sub mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-input border border-edge-bold rounded-lg px-4 py-2.5 text-heading focus:outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm text-sub mb-1">Email</label>
            <input
              type="email"
              value={session?.user?.email || ""}
              disabled
              className="w-full bg-input border border-edge-bold rounded-lg px-4 py-2.5 text-hint cursor-not-allowed"
            />
          </div>
        </div>

        <h3 className="text-md font-semibold text-heading mt-6 mb-4">
          Change Password
        </h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-sub mb-1">
              Current Password
            </label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full bg-input border border-edge-bold rounded-lg px-4 py-2.5 text-heading focus:outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm text-sub mb-1">
              New Password
            </label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              minLength={8}
              className="w-full bg-input border border-edge-bold rounded-lg px-4 py-2.5 text-heading focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="mt-4 bg-blue-600 hover:bg-blue-700 disabled:bg-hover text-white px-4 py-2 rounded-lg text-sm transition-colors"
        >
          {saving ? "Saving..." : "Save Changes"}
        </button>
      </form>

      {/* Data Retention */}
      <div className="bg-card border border-edge rounded-xl p-6">
        <h2 className="text-lg font-semibold text-heading mb-4">
          Data Retention
        </h2>
        <p className="text-sub text-sm mb-4">
          Delete location history older than a specified number of days.
        </p>
        <div className="flex items-end gap-3">
          <div>
            <label className="block text-sm text-sub mb-1">
              Days to keep
            </label>
            <input
              type="number"
              value={retentionDays}
              onChange={(e) => setRetentionDays(Number(e.target.value))}
              min={1}
              max={365}
              className="w-32 bg-input border border-edge-bold rounded-lg px-4 py-2.5 text-heading focus:outline-none focus:border-blue-500"
            />
          </div>
          <button
            onClick={handleCleanup}
            disabled={saving}
            className="bg-red-600 hover:bg-red-700 disabled:bg-hover text-white px-4 py-2.5 rounded-lg text-sm transition-colors"
          >
            Clean Up Old Data
          </button>
        </div>
      </div>
    </div>
  );
}
