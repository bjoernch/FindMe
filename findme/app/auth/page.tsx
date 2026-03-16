"use client";

import { Suspense, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  startAuthentication,
  browserSupportsWebAuthn,
} from "@simplewebauthn/browser";

function AuthForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/dashboard";

  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [passkeyLoading, setPasskeyLoading] = useState(false);
  const [supportsPasskey] = useState(() =>
    typeof window !== "undefined" ? browserSupportsWebAuthn() : false
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (isRegister) {
        const res = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password, name }),
        });
        const data = await res.json();
        if (!data.success) {
          setError(data.error || "Registration failed");
          setLoading(false);
          return;
        }
      }

      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        setError("Invalid email or password");
        setLoading(false);
        return;
      }

      router.push(callbackUrl);
    } catch {
      setError("Something went wrong");
      setLoading(false);
    }
  }

  async function handlePasskeyLogin() {
    setError("");
    setPasskeyLoading(true);

    try {
      // Step 1: Get authentication options from server
      const optionsRes = await fetch("/api/auth/passkey/login-options", {
        method: "POST",
      });
      const optionsData = await optionsRes.json();

      if (!optionsData.success || !optionsData.data) {
        setError(optionsData.error || "Failed to start passkey login");
        setPasskeyLoading(false);
        return;
      }

      const { options, sessionKey } = optionsData.data;

      // Step 2: Prompt user to authenticate with their passkey
      const credential = await startAuthentication({ optionsJSON: options });

      // Step 3: Verify the credential with the server
      const verifyRes = await fetch("/api/auth/passkey/login-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential, sessionKey }),
      });
      const verifyData = await verifyRes.json();

      if (!verifyData.success || !verifyData.data) {
        setError(verifyData.error || "Passkey verification failed");
        setPasskeyLoading(false);
        return;
      }

      const { passkeyLoginToken } = verifyData.data;

      // Step 4: Sign in to NextAuth session using the passkey token
      const result = await signIn("credentials", {
        passkeyToken: passkeyLoginToken,
        redirect: false,
      });

      if (result?.error) {
        setError("Failed to establish session");
        setPasskeyLoading(false);
        return;
      }

      router.push(callbackUrl);
    } catch (err) {
      // User cancelled or WebAuthn error
      const message =
        err instanceof Error ? err.message : "Passkey login failed";
      if (!message.includes("cancelled") && !message.includes("abort")) {
        setError(message);
      }
      setPasskeyLoading(false);
    }
  }

  return (
    <div className="bg-card rounded-xl p-6 border border-edge">
      <h2 className="text-xl font-semibold text-heading mb-6">
        {isRegister ? "Create Account" : "Sign In"}
      </h2>

      {!isRegister && supportsPasskey && (
        <>
          <button
            onClick={handlePasskeyLogin}
            disabled={passkeyLoading || loading}
            className="w-full bg-card hover:bg-hover border border-edge-bold disabled:cursor-not-allowed text-heading font-medium py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M2 18v3c0 .6.4 1 1 1h4v-3h3v-3h2l1.4-1.4a6.5 6.5 0 1 0-4-4Z" />
              <circle cx="16.5" cy="7.5" r=".5" fill="currentColor" />
            </svg>
            {passkeyLoading ? "Authenticating..." : "Sign in with Passkey"}
          </button>

          <div className="flex items-center gap-3 my-4">
            <div className="flex-1 h-px bg-edge" />
            <span className="text-sm text-hint">or</span>
            <div className="flex-1 h-px bg-edge" />
          </div>
        </>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {isRegister && (
          <div>
            <label className="block text-sm text-sub mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-input border border-edge-bold rounded-lg px-4 py-2.5 text-heading focus:outline-none focus:border-blue-500"
              required
            />
          </div>
        )}
        <div>
          <label className="block text-sm text-sub mb-1">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full bg-input border border-edge-bold rounded-lg px-4 py-2.5 text-heading focus:outline-none focus:border-blue-500"
            required
          />
        </div>
        <div>
          <label className="block text-sm text-sub mb-1">Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full bg-input border border-edge-bold rounded-lg px-4 py-2.5 text-heading focus:outline-none focus:border-blue-500"
            required
            minLength={8}
          />
        </div>

        {error && <p className="text-danger-fg text-sm">{error}</p>}

        <button
          type="submit"
          disabled={loading || passkeyLoading}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed text-white font-medium py-2.5 rounded-lg transition-colors"
        >
          {loading
            ? "Please wait..."
            : isRegister
              ? "Create Account"
              : "Sign In"}
        </button>
      </form>

      <div className="mt-4 text-center">
        <button
          onClick={() => {
            setIsRegister(!isRegister);
            setError("");
          }}
          className="text-sm text-link hover:text-link-hover"
        >
          {isRegister
            ? "Already have an account? Sign in"
            : "Need an account? Register"}
        </button>
      </div>
    </div>
  );
}

export default function AuthPage() {
  return (
    <div className="min-h-screen bg-page flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="FindMe" className="w-20 h-20 mx-auto mb-4" />
          <h1 className="text-4xl font-bold text-heading mb-2">FindMe</h1>
          <p className="text-sub">Self-hosted location sharing</p>
        </div>
        <Suspense
          fallback={
            <div className="bg-card rounded-xl p-6 border border-edge text-center text-sub">
              Loading...
            </div>
          }
        >
          <AuthForm />
        </Suspense>
      </div>
    </div>
  );
}
