/**
 * FindMe Mobile API Client
 *
 * Minimal fetch wrapper showing how a React Native app should
 * call each FindMe API endpoint. Import this file or use it
 * as a reference for your mobile implementation.
 *
 * Install: npm install @types/node (types only, fetch is global in RN)
 */

import type {
  ApiResponse,
  AuthTokens,
  RegisterRequest,
  LoginRequest,
  DevicePublic,
  DeviceRegisterRequest,
  LocationUpdateRequest,
  DeviceWithLocation,
  LocationData,
} from "@/types/api";

export class FindMeClient {
  private baseUrl: string;
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private deviceToken: string | null = null;

  /**
   * @param baseUrl - The base URL of your FindMe server (e.g. "https://findme.example.com")
   */
  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  // ── Internal helpers ────────────────────────────────────────

  private async request<T>(
    path: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(options.headers as Record<string, string>),
    };

    if (this.accessToken) {
      headers["Authorization"] = `Bearer ${this.accessToken}`;
    }

    const res = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers,
    });

    const data: ApiResponse<T> = await res.json();

    // Auto-refresh on 401
    if (res.status === 401 && this.refreshToken) {
      const refreshed = await this.refresh();
      if (refreshed) {
        headers["Authorization"] = `Bearer ${this.accessToken}`;
        const retryRes = await fetch(`${this.baseUrl}${path}`, {
          ...options,
          headers,
        });
        return retryRes.json();
      }
    }

    return data;
  }

  // ── Auth ────────────────────────────────────────────────────

  /**
   * Register a new user account.
   * The first registered user automatically becomes ADMIN.
   */
  async register(data: RegisterRequest): Promise<ApiResponse<AuthTokens>> {
    const result = await this.request<AuthTokens>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify(data),
    });

    if (result.success && result.data) {
      this.accessToken = result.data.accessToken;
      this.refreshToken = result.data.refreshToken;
    }

    return result;
  }

  /**
   * Login with email and password. Returns JWT tokens.
   */
  async login(data: LoginRequest): Promise<ApiResponse<AuthTokens>> {
    const result = await this.request<AuthTokens>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(data),
    });

    if (result.success && result.data) {
      this.accessToken = result.data.accessToken;
      this.refreshToken = result.data.refreshToken;
    }

    return result;
  }

  /**
   * Refresh the access token using the refresh token.
   */
  async refresh(): Promise<boolean> {
    if (!this.refreshToken) return false;

    try {
      const res = await fetch(`${this.baseUrl}/api/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: this.refreshToken }),
      });

      const data = await res.json();
      if (data.success && data.data) {
        this.accessToken = data.data.accessToken;
        this.refreshToken = data.data.refreshToken;
        return true;
      }
    } catch {
      // Refresh failed
    }

    return false;
  }

  /**
   * Set tokens from storage (e.g. AsyncStorage on app launch).
   */
  setTokens(accessToken: string, refreshToken: string): void {
    this.accessToken = accessToken;
    this.refreshToken = refreshToken;
  }

  // ── Devices ─────────────────────────────────────────────────

  /**
   * Register this device with the server.
   * Save the returned device token for location updates.
   */
  async registerDevice(
    data: DeviceRegisterRequest
  ): Promise<ApiResponse<DevicePublic>> {
    const result = await this.request<DevicePublic>("/api/devices/register", {
      method: "POST",
      body: JSON.stringify(data),
    });

    if (result.success && result.data) {
      this.deviceToken = result.data.token;
    }

    return result;
  }

  /**
   * Set the device token from storage.
   */
  setDeviceToken(token: string): void {
    this.deviceToken = token;
  }

  /**
   * List all devices for the current user.
   */
  async listDevices(): Promise<ApiResponse<DevicePublic[]>> {
    return this.request<DevicePublic[]>("/api/devices");
  }

  // ── Location ────────────────────────────────────────────────

  /**
   * Send a location update from this device.
   * Uses the device token (not the user JWT) for auth.
   *
   * Recommended usage in React Native:
   * - Use expo-location for location tracking
   * - Use expo-task-manager for background tasks
   * - Send updates every 5 minutes, or on significant location change
   */
  async sendLocationUpdate(
    data: LocationUpdateRequest
  ): Promise<ApiResponse<{ id: string; deviceId: string; lat: number; lng: number; timestamp: string }>> {
    if (!this.deviceToken) {
      return { success: false, data: null, error: "Device token not set" };
    }

    const res = await fetch(`${this.baseUrl}/api/location/update`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.deviceToken}`,
      },
      body: JSON.stringify(data),
    });

    return res.json();
  }

  /**
   * Get latest location for all user devices.
   */
  async getLatestLocations(): Promise<ApiResponse<DeviceWithLocation[]>> {
    return this.request<DeviceWithLocation[]>("/api/location/latest");
  }

  /**
   * Get location history for a specific device.
   */
  async getLocationHistory(
    deviceId: string,
    options?: { from?: string; to?: string; limit?: number }
  ): Promise<ApiResponse<LocationData[]>> {
    const params = new URLSearchParams();
    if (options?.from) params.set("from", options.from);
    if (options?.to) params.set("to", options.to);
    if (options?.limit) params.set("limit", String(options.limit));

    return this.request<LocationData[]>(
      `/api/location/${deviceId}/history?${params.toString()}`
    );
  }
}
