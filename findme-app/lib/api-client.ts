import { getStoredValue, setStoredValue } from "./storage";
import type {
  ApiResponse,
  AuthTokens,
  RegisterRequest,
  LoginRequest,
  DevicePublic,
  DeviceRegisterRequest,
  DeviceUpdateRequest,
  DeviceWithLocation,
  LocationData,
  LocationUpdateRequest,
  UserPublic,
  PersonWithDevices,
  PeopleSharePublic,
  ShareLink,
  ShareExpiry,
  QrAuthRequest,
  QrAuthResponse,
  NotificationPreferences,
} from "./types";

export class FindMeClient {
  private baseUrl: string;
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private deviceToken: string | null = null;
  private isRefreshing = false;

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

    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        ...options,
        headers,
      });

      // Auto-refresh on 401
      if (res.status === 401 && this.refreshToken && !this.isRefreshing) {
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

      return res.json();
    } catch (error) {
      return {
        success: false,
        data: null,
        error:
          error instanceof Error ? error.message : "Network request failed",
      };
    }
  }

  // ── Auth ────────────────────────────────────────────────────

  async register(data: RegisterRequest): Promise<ApiResponse<AuthTokens>> {
    const result = await this.request<AuthTokens>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify(data),
    });

    if (result.success && result.data) {
      this.accessToken = result.data.accessToken;
      this.refreshToken = result.data.refreshToken;
      await setStoredValue("accessToken", result.data.accessToken);
      await setStoredValue("refreshToken", result.data.refreshToken);
      await setStoredValue("userId", result.data.user.id);
    }

    return result;
  }

  async login(data: LoginRequest): Promise<ApiResponse<AuthTokens>> {
    const result = await this.request<AuthTokens>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(data),
    });

    if (result.success && result.data) {
      this.accessToken = result.data.accessToken;
      this.refreshToken = result.data.refreshToken;
      await setStoredValue("accessToken", result.data.accessToken);
      await setStoredValue("refreshToken", result.data.refreshToken);
      await setStoredValue("userId", result.data.user.id);
    }

    return result;
  }

  async refresh(): Promise<boolean> {
    if (!this.refreshToken || this.isRefreshing) return false;
    this.isRefreshing = true;

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
        await setStoredValue("accessToken", data.data.accessToken);
        await setStoredValue("refreshToken", data.data.refreshToken);
        return true;
      }
    } catch {
      // Refresh failed
    } finally {
      this.isRefreshing = false;
    }

    return false;
  }

  async getMe(): Promise<ApiResponse<UserPublic>> {
    return this.request<UserPublic>("/api/auth/me");
  }

  async qrAuth(
    serverUrl: string,
    sessionToken: string,
    deviceName: string,
    platform: "ios" | "android" | "web" = "android"
  ): Promise<ApiResponse<QrAuthResponse>> {
    this.baseUrl = serverUrl.replace(/\/$/, "");

    try {
      const res = await fetch(`${this.baseUrl}/api/auth/qr-auth`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: sessionToken,
          deviceName,
          platform,
        } as QrAuthRequest),
      });

      const result: ApiResponse<QrAuthResponse> = await res.json();

      if (result.success && result.data) {
        this.accessToken = result.data.accessToken;
        this.refreshToken = result.data.refreshToken;
        this.deviceToken = result.data.deviceToken;
        await setStoredValue("accessToken", result.data.accessToken);
        await setStoredValue("refreshToken", result.data.refreshToken);
        await setStoredValue("deviceToken", result.data.deviceToken);
        await setStoredValue("userId", result.data.user.id);
        await setStoredValue("serverUrl", this.baseUrl);
      }

      return result;
    } catch (error) {
      return {
        success: false,
        data: null,
        error: error instanceof Error ? error.message : "QR auth failed",
      };
    }
  }

  setTokens(accessToken: string, refreshToken: string): void {
    this.accessToken = accessToken;
    this.refreshToken = refreshToken;
  }

  setBaseUrl(url: string): void {
    this.baseUrl = url.replace(/\/$/, "");
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  // ── Devices ─────────────────────────────────────────────────

  async registerDevice(
    data: DeviceRegisterRequest
  ): Promise<ApiResponse<DevicePublic>> {
    const result = await this.request<DevicePublic>("/api/devices/register", {
      method: "POST",
      body: JSON.stringify(data),
    });

    if (result.success && result.data) {
      this.deviceToken = result.data.token;
      await setStoredValue("deviceToken", result.data.token);
      await setStoredValue("deviceId", result.data.id);
    }

    return result;
  }

  setDeviceToken(token: string): void {
    this.deviceToken = token;
  }

  getDeviceToken(): string | null {
    return this.deviceToken;
  }

  async listDevices(): Promise<ApiResponse<DevicePublic[]>> {
    return this.request<DevicePublic[]>("/api/devices");
  }

  async updateDevice(
    id: string,
    data: DeviceUpdateRequest
  ): Promise<ApiResponse<DevicePublic>> {
    return this.request<DevicePublic>(`/api/devices/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  async deleteDevice(id: string): Promise<ApiResponse<{ message: string }>> {
    return this.request<{ message: string }>(`/api/devices/${id}`, {
      method: "DELETE",
    });
  }

  getAccessToken(): string | null {
    return this.accessToken;
  }

  // ── Settings ──────────────────────────────────────────────────

  async updateSettings(
    data: { name?: string }
  ): Promise<ApiResponse<UserPublic>> {
    return this.request<UserPublic>("/api/settings", {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  // ── Location ────────────────────────────────────────────────

  async sendLocationUpdate(
    data: LocationUpdateRequest
  ): Promise<
    ApiResponse<{
      id: string;
      deviceId: string;
      lat: number;
      lng: number;
      timestamp: string;
    }>
  > {
    if (!this.deviceToken) {
      return { success: false, data: null, error: "Device token not set" };
    }

    try {
      const res = await fetch(`${this.baseUrl}/api/location/update`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.deviceToken}`,
        },
        body: JSON.stringify(data),
      });
      return res.json();
    } catch (error) {
      return {
        success: false,
        data: null,
        error:
          error instanceof Error ? error.message : "Location update failed",
      };
    }
  }

  async getLatestLocations(): Promise<ApiResponse<DeviceWithLocation[]>> {
    return this.request<DeviceWithLocation[]>("/api/location/latest");
  }

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

  // ── People ──────────────────────────────────────────────────

  async getPeople(): Promise<ApiResponse<PersonWithDevices[]>> {
    return this.request<PersonWithDevices[]>("/api/people");
  }

  async getPendingInvitations(): Promise<ApiResponse<PeopleSharePublic[]>> {
    return this.request<PeopleSharePublic[]>("/api/people/pending");
  }

  async getSentInvitations(): Promise<ApiResponse<PeopleSharePublic[]>> {
    return this.request<PeopleSharePublic[]>("/api/people/sent");
  }

  async invite(email: string): Promise<ApiResponse<PeopleSharePublic>> {
    return this.request<PeopleSharePublic>("/api/people/invite", {
      method: "POST",
      body: JSON.stringify({ email }),
    });
  }

  async respondToInvitation(
    shareId: string,
    action: "accept" | "decline"
  ): Promise<ApiResponse<PeopleSharePublic>> {
    return this.request<PeopleSharePublic>("/api/people/respond", {
      method: "POST",
      body: JSON.stringify({ shareId, action }),
    });
  }

  async stopSharing(
    shareId: string
  ): Promise<ApiResponse<{ message: string }>> {
    return this.request<{ message: string }>(
      `/api/people?id=${shareId}`,
      { method: "DELETE" }
    );
  }

  async getShares(): Promise<ApiResponse<PeopleSharePublic[]>> {
    return this.request<PeopleSharePublic[]>("/api/people/shares");
  }

  // ── Share Links ───────────────────────────────────────────────

  async getShareLinks(): Promise<ApiResponse<ShareLink[]>> {
    return this.request<ShareLink[]>("/api/share");
  }

  async createShareLink(expiresIn?: ShareExpiry): Promise<ApiResponse<ShareLink>> {
    return this.request<ShareLink>("/api/share", {
      method: "POST",
      body: JSON.stringify({ expiresIn: expiresIn ?? "24h" }),
    });
  }

  async revokeShareLink(id: string): Promise<ApiResponse<{ message: string }>> {
    return this.request<{ message: string }>(`/api/share?id=${id}`, {
      method: "DELETE",
    });
  }

  // ── Avatar ──────────────────────────────────────────────────

  async uploadAvatar(base64: string): Promise<ApiResponse<{ avatar: string }>> {
    return this.request<{ avatar: string }>("/api/settings/avatar", {
      method: "POST",
      body: JSON.stringify({ image: base64 }),
    });
  }

  async deleteAvatar(): Promise<ApiResponse<{ avatar: null }>> {
    return this.request<{ avatar: null }>("/api/settings/avatar", {
      method: "DELETE",
    });
  }

  // ── Notification Preferences ──────────────────────────────────

  async getNotificationPreferences(): Promise<ApiResponse<NotificationPreferences>> {
    return this.request<NotificationPreferences>("/api/settings/notifications");
  }

  async updateNotificationPreferences(
    data: Partial<NotificationPreferences>
  ): Promise<ApiResponse<NotificationPreferences>> {
    return this.request<NotificationPreferences>("/api/settings/notifications", {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  // ── Push Token ────────────────────────────────────────────────

  async registerPushToken(token: string, platform: string): Promise<ApiResponse<{ registered: boolean }>> {
    return this.request<{ registered: boolean }>("/api/push", {
      method: "POST",
      body: JSON.stringify({ token, platform }),
    });
  }

  async unregisterPushToken(token: string): Promise<ApiResponse<{ unregistered: boolean }>> {
    return this.request<{ unregistered: boolean }>("/api/push", {
      method: "DELETE",
      body: JSON.stringify({ token }),
    });
  }

  // ── Export ─────────────────────────────────────────────────────

  getExportUrl(deviceId: string, format: "gpx" | "csv", from?: string, to?: string): string {
    const params = new URLSearchParams({ format });
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    return `${this.baseUrl}/api/location/${deviceId}/export?${params.toString()}`;
  }
}
