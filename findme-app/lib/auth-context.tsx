import React, { createContext, useContext, useState, useEffect } from "react";
import { Platform } from "react-native";
import * as Device from "expo-device";
import { FindMeClient } from "./api-client";
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
import { Passkey } from "react-native-passkey";
import type { UserPublic } from "./types";

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

  // Initialize: check stored tokens on app launch
  useEffect(() => {
    initialize();
  }, []);

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
          // Re-register push token (handles token refresh)
          registerForPushNotifications(apiClient).catch(() => {});
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

  async function autoRegisterDevice() {
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
  }

  async function login(
    email: string,
    password: string
  ): Promise<string | null> {
    const result = await apiClient.login({ email, password });

    if (result.success && result.data) {
      setUser(result.data.user);
      await autoRegisterDevice();

      // Send initial location and start background tracking
      try {
        await sendForegroundUpdate(apiClient);
      } catch {
        // Location might not be available yet
      }
      startBackgroundTracking().then((started) => {
        if (started) showBatteryOptimizationBanner();
      }).catch(console.error);

      registerForPushNotifications(apiClient).catch(() => {});

      return null; // No error
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

      try {
        await sendForegroundUpdate(apiClient);
      } catch {
        // Location might not be available yet
      }
      startBackgroundTracking().then((started) => {
        if (started) showBatteryOptimizationBanner();
      }).catch(console.error);

      registerForPushNotifications(apiClient).catch(() => {});

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

      try {
        await sendForegroundUpdate(apiClient);
      } catch {
        // Location might not be available yet
      }
      startBackgroundTracking().then((started) => {
        if (started) showBatteryOptimizationBanner();
      }).catch(console.error);

      registerForPushNotifications(apiClient).catch(() => {});

      return null;
    }

    return result.error || "QR authentication failed";
  }

  async function passkeyLogin(): Promise<string | null> {
    try {
      // Step 1: Get login options from server
      const optionsResult = await apiClient.getPasskeyLoginOptions();
      if (!optionsResult.success || !optionsResult.data) {
        return optionsResult.error || "Failed to get passkey options";
      }

      const { options, sessionKey } = optionsResult.data;

      // Step 2: Trigger native passkey dialog
      const credential = await Passkey.get({
        challenge: options.challenge,
        rpId: options.rpId,
        timeout: options.timeout,
        allowCredentials: options.allowCredentials,
        userVerification: options.userVerification,
      });

      // Step 3: Verify with server and get tokens
      const verifyResult = await apiClient.verifyPasskeyLoginMobile(
        credential,
        sessionKey
      );

      if (verifyResult.success && verifyResult.data) {
        setUser(verifyResult.data.user);
        await autoRegisterDevice();

        try {
          await sendForegroundUpdate(apiClient);
        } catch {
          // Location might not be available yet
        }
        startBackgroundTracking().then((started) => {
          if (started) showBatteryOptimizationBanner();
        }).catch(console.error);

        registerForPushNotifications(apiClient).catch(() => {});

        return null; // Success
      }

      return verifyResult.error || "Passkey authentication failed";
    } catch (error: any) {
      // Handle user cancellation gracefully
      if (error?.error === "UserCancelled" || error?.message?.includes("cancel")) {
        return "Passkey authentication cancelled";
      }
      if (error?.error === "NotSupported") {
        return "Passkeys are not supported on this device";
      }
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
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
