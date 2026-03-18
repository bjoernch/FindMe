import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { Alert, Platform } from "react-native";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Linking from "expo-linking";
import { FindMeClient } from "./api-client";
import { compareVersions } from "./version";
import {
  getStoredValue,
  setStoredValue,
  clearAll,
} from "./storage";
import {
  startBackgroundTracking,
  stopBackgroundTracking,
  sendForegroundUpdate,
  showBatteryOptimizationBanner,
} from "./location-service";
import { registerForPushNotifications, unregisterPushNotifications } from "./push-notifications";
import { clearCache } from "./offline-cache";
import * as WebBrowser from "expo-web-browser";
import type { UserPublic } from "./types";

export type VersionStatus = "match" | "app-outdated" | "server-outdated";

interface AuthContextType {
  user: UserPublic | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  apiClient: FindMeClient;
  login: (email: string, password: string) => Promise<string | null>;
  register: (
    email: string,
    password: string,
    name: string
  ) => Promise<string | null>;
  qrAuth: (serverUrl: string, sessionToken: string) => Promise<string | null>;
  passkeyLogin: () => Promise<string | null>;
  logout: () => Promise<void>;
  updateUser: (partial: Partial<UserPublic>) => void;
  serverUrl: string | null;
  setServerUrl: (url: string) => Promise<void>;
  serverVersion: string | null;
  versionStatus: VersionStatus;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserPublic | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [serverUrl, setServerUrlState] = useState<string | null>(null);
  const [apiClient] = useState(() => new FindMeClient(""));
  const [serverVersion, setServerVersion] = useState<string | null>(null);
  const [versionStatus, setVersionStatus] = useState<VersionStatus>("match");

  // Initialize: check stored tokens on app launch
  useEffect(() => {
    initialize();
  }, []);

  async function checkVersionCompat() {
    try {
      const result = await apiClient.getServerVersion();
      if (result.success && result.data) {
        const srvVer = result.data.version;
        setServerVersion(srvVer);
        const appVer = Constants.expoConfig?.version || "0.0.0";
        const status = compareVersions(appVer, srvVer);
        setVersionStatus(status);

        if (status === "app-outdated") {
          Alert.alert(
            "Update Available",
            `Your app (v${appVer}) is older than the server (v${srvVer}). Please update the app for full compatibility.`
          );
        } else if (status === "server-outdated") {
          Alert.alert(
            "Server Update Needed",
            `Your app (v${appVer}) is newer than the server (v${srvVer}). Please update the FindMe server.`
          );
        }
      }
    } catch {
      // Version check is non-critical
    }
  }

  async function initialize() {
    try {
      const storedUrl = await getStoredValue("serverUrl");
      const storedAccess = await getStoredValue("accessToken");
      const storedRefresh = await getStoredValue("refreshToken");
      const storedDevice = await getStoredValue("deviceToken");

      if (storedUrl) {
        setServerUrlState(storedUrl);
        apiClient.setBaseUrl(storedUrl);
      }

      if (storedAccess && storedRefresh && storedUrl) {
        apiClient.setTokens(storedAccess, storedRefresh);

        if (storedDevice) {
          apiClient.setDeviceToken(storedDevice);
        }

        // Validate tokens
        const meResult = await apiClient.getMe();
        if (meResult.success && meResult.data) {
          setUser(meResult.data);
          // Restart location tracking and notifications on app reopen
          setupLocationAndNotifications();
        } else {
          // Tokens invalid, clear everything
          await clearAll();
        }
      }
    } catch {
      await clearAll();
    } finally {
      setIsLoading(false);
    }
  }

  // Shared function to exchange a one-time passkey token for full auth
  const pendingTokenRef = useRef(false);
  const handlePasskeyToken = useCallback(async (oneTimeToken: string) => {
    // Prevent double-processing
    if (pendingTokenRef.current) return;
    pendingTokenRef.current = true;
    try {
      const exchangeResult = await apiClient.exchangePasskeyToken(oneTimeToken);
      if (exchangeResult.success && exchangeResult.data) {
        setUser(exchangeResult.data.user);
        await autoRegisterDevice();
        setupLocationAndNotifications();
      }
    } catch (e) {
      console.error("Passkey token exchange failed:", e);
    } finally {
      pendingTokenRef.current = false;
    }
  }, [apiClient]);

  // Listen for deep link redirects (catches findme://auth?token=... on Android)
  useEffect(() => {
    const handleUrl = (event: { url: string }) => {
      if (event.url.startsWith("findme://auth")) {
        try {
          const url = new URL(event.url);
          const token = url.searchParams.get("token");
          if (token) {
            handlePasskeyToken(token);
          }
        } catch {}
      }
    };

    const sub = Linking.addEventListener("url", handleUrl);

    // Check if app was opened via deep link
    Linking.getInitialURL().then((url) => {
      if (url?.startsWith("findme://auth")) {
        handleUrl({ url });
      }
    });

    return () => sub.remove();
  }, [handlePasskeyToken]);

  async function autoRegisterDevice() {
    try {
      const existingToken = await getStoredValue("deviceToken");
      if (existingToken) {
        apiClient.setDeviceToken(existingToken);
        return;
      }

      const deviceName =
        Device.deviceName || Device.modelName || "Unknown Device";
      const platform = Platform.OS === "ios" ? "ios" : "android";
      const result = await apiClient.registerDevice({
        name: deviceName,
        platform,
      });

      if (result.success && result.data) {
        // Token is stored by the client automatically
      }
    } catch (e) {
      console.warn("autoRegisterDevice failed:", e);
    }
  }

  /**
   * Start location tracking + notifications. Called after every successful auth
   * AND on app restart when session is restored.
   */
  async function setupLocationAndNotifications() {
    try {
      // Request notification permission first (needed on Android 13+ for foreground service)
      await registerForPushNotifications(apiClient);
    } catch {}

    // Start background tracking (requests location permissions, shows foreground notification)
    startBackgroundTracking()
      .then((started) => {
        if (started) showBatteryOptimizationBanner();
      })
      .catch((e) => console.warn("startBackgroundTracking failed:", e));

    // Send an initial location update (fire and forget, don't block)
    sendForegroundUpdate(apiClient).catch(() => {});

    // Check version compatibility
    checkVersionCompat();
  }

  async function login(
    email: string,
    password: string
  ): Promise<string | null> {
    const result = await apiClient.login({ email, password });

    if (result.success && result.data) {
      setUser(result.data.user);
      await autoRegisterDevice();
      setupLocationAndNotifications();
      return null;
    }

    return result.error || "Login failed";
  }

  async function register(
    email: string,
    password: string,
    name: string
  ): Promise<string | null> {
    const result = await apiClient.register({ email, password, name });

    if (result.success && result.data) {
      setUser(result.data.user);
      await autoRegisterDevice();
      setupLocationAndNotifications();
      return null;
    }

    return result.error || "Registration failed";
  }

  async function qrAuth(
    qrServerUrl: string,
    sessionToken: string
  ): Promise<string | null> {
    const deviceName =
      Device.deviceName || Device.modelName || "Unknown Device";
    const platform = Platform.OS === "ios" ? "ios" : "android";
    const result = await apiClient.qrAuth(
      qrServerUrl,
      sessionToken,
      deviceName,
      platform
    );

    if (result.success && result.data) {
      setUser(result.data.user);
      setServerUrlState(qrServerUrl.replace(/\/$/, ""));
      setupLocationAndNotifications();
      return null;
    }

    return result.error || "QR authentication failed";
  }

  async function passkeyLogin(): Promise<string | null> {
    try {
      const baseUrl = apiClient.getBaseUrl();
      if (!baseUrl) return "Server URL not configured";

      // Open browser-based passkey authentication
      const authUrl = `${baseUrl}/auth/passkey-mobile?redirect=findme://auth`;
      const result = await WebBrowser.openAuthSessionAsync(authUrl, "findme://auth");

      if (result.type === "cancel" || result.type === "dismiss") {
        return "Passkey authentication cancelled";
      }

      // If openAuthSessionAsync caught the redirect, handle it directly
      if (result.type === "success" && result.url) {
        const url = new URL(result.url);
        const oneTimeToken = url.searchParams.get("token");
        if (oneTimeToken) {
          await handlePasskeyToken(oneTimeToken);
          return null;
        }
      }

      // On some Android devices, the redirect is handled by the deep link listener
      // instead of openAuthSessionAsync. Wait briefly for the URL listener to process it.
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // If the URL listener already authenticated us, we're done
      if (user) return null;

      return "Passkey authentication failed";
    } catch (error: any) {
      return error?.message || "Passkey authentication failed";
    }
  }

  async function logout() {
    await stopBackgroundTracking();
    unregisterPushNotifications(apiClient).catch(() => {});
    await clearCache();
    await clearAll();
    setUser(null);
    apiClient.setTokens("", "");
  }

  function updateUser(partial: Partial<UserPublic>) {
    setUser((prev) => (prev ? { ...prev, ...partial } : prev));
  }

  async function handleSetServerUrl(url: string) {
    const cleanUrl = url.replace(/\/$/, "");
    await setStoredValue("serverUrl", cleanUrl);
    setServerUrlState(cleanUrl);
    apiClient.setBaseUrl(cleanUrl);
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        apiClient,
        login,
        register,
        qrAuth,
        passkeyLogin,
        logout,
        updateUser,
        serverUrl,
        setServerUrl: handleSetServerUrl,
        serverVersion,
        versionStatus,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
