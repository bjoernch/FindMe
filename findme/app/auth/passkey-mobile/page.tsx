"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { startAuthentication, browserSupportsWebAuthn } from "@simplewebauthn/browser";

function PasskeyMobileAuth() {
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") || "findme://auth";
  const [status, setStatus] = useState<"loading" | "authenticating" | "success" | "error">("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    handlePasskeyAuth();
  }, []);

  async function handlePasskeyAuth() {
    try {
      if (!browserSupportsWebAuthn()) {
        setError("This browser does not support passkeys");
        setStatus("error");
        return;
      }

      setStatus("authenticating");

      // Step 1: Get login options
      const optionsRes = await fetch("/api/auth/passkey/login-options", { method: "POST" });
      const optionsData = await optionsRes.json();
      if (!optionsData.success || !optionsData.data) {
        setError(optionsData.error || "Failed to get passkey options");
        setStatus("error");
        return;
      }

      const { options, sessionKey } = optionsData.data;

      // Step 2: Trigger browser's native WebAuthn prompt
      const credential = await startAuthentication({ optionsJSON: options });

      // Step 3: Verify with server
      const verifyRes = await fetch("/api/auth/passkey/login-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential, sessionKey }),
      });
      const verifyData = await verifyRes.json();

      if (!verifyData.success || !verifyData.data) {
        setError(verifyData.error || "Passkey verification failed");
        setStatus("error");
        return;
      }

      // Step 4: Exchange the short-lived passkeyLoginToken for a mobile auth token
      const exchangeRes = await fetch("/api/auth/passkey/exchange", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passkeyLoginToken: verifyData.data.passkeyLoginToken }),
      });
      const exchangeData = await exchangeRes.json();

      if (!exchangeData.success || !exchangeData.data) {
        setError(exchangeData.error || "Token exchange failed");
        setStatus("error");
        return;
      }

      setStatus("success");

      // Step 5: Redirect back to mobile app with the one-time token
      const { oneTimeToken } = exchangeData.data;
      const redirectUrl = `${redirect}?token=${oneTimeToken}`;
      window.location.href = redirectUrl;
    } catch (err: any) {
      if (err?.name === "NotAllowedError" || err?.message?.includes("cancel")) {
        setError("Authentication cancelled");
      } else {
        setError(err?.message || "Passkey authentication failed");
      }
      setStatus("error");
    }
  }

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "#030712",
      color: "#fff",
      fontFamily: "system-ui, -apple-system, sans-serif",
      padding: "24px",
    }}>
      <div style={{ textAlign: "center", maxWidth: "400px" }}>
        <h1 style={{ fontSize: "24px", fontWeight: "700", marginBottom: "16px" }}>
          FindMe
        </h1>

        {status === "loading" && (
          <p style={{ color: "#9ca3af" }}>Initializing passkey authentication...</p>
        )}

        {status === "authenticating" && (
          <div>
            <div style={{
              width: "48px", height: "48px", border: "3px solid #374151",
              borderTopColor: "#3b82f6", borderRadius: "50%",
              margin: "0 auto 16px",
              animation: "spin 1s linear infinite",
            }} />
            <p style={{ color: "#9ca3af" }}>Please authenticate with your passkey...</p>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {status === "success" && (
          <div>
            <p style={{ color: "#4ade80", fontSize: "18px", marginBottom: "8px" }}>
              ✓ Authentication successful
            </p>
            <p style={{ color: "#9ca3af", fontSize: "14px" }}>
              Redirecting back to the app...
            </p>
          </div>
        )}

        {status === "error" && (
          <div>
            <p style={{ color: "#f87171", fontSize: "16px", marginBottom: "16px" }}>
              {error}
            </p>
            <button
              onClick={() => {
                setError(null);
                setStatus("loading");
                handlePasskeyAuth();
              }}
              style={{
                backgroundColor: "#3b82f6",
                color: "#fff",
                border: "none",
                borderRadius: "8px",
                padding: "12px 24px",
                fontSize: "16px",
                fontWeight: "600",
                cursor: "pointer",
                marginRight: "8px",
              }}
            >
              Try Again
            </button>
            <button
              onClick={() => window.close()}
              style={{
                backgroundColor: "#374151",
                color: "#fff",
                border: "none",
                borderRadius: "8px",
                padding: "12px 24px",
                fontSize: "16px",
                fontWeight: "600",
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function PasskeyMobilePage() {
  return (
    <Suspense fallback={
      <div style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#030712",
        color: "#9ca3af",
      }}>
        Loading...
      </div>
    }>
      <PasskeyMobileAuth />
    </Suspense>
  );
}
