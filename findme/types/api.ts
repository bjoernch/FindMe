// Shared TypeScript types for FindMe API
// This file is designed to be importable by both the Next.js web app
// and a future React Native mobile app.

// ── Enums & Constants ──────────────────────────────────────────────

export type UserRole = "ADMIN" | "MEMBER";
export type DevicePlatform = "ios" | "android" | "web";
export type ShareExpiry = "1h" | "24h" | "7d" | "never";

// ── API Envelope ───────────────────────────────────────────────────

export interface ApiResponse<T> {
  success: boolean;
  data: T | null;
  error: string | null;
  meta?: Record<string, unknown>;
}

// ── User ───────────────────────────────────────────────────────────

export interface UserPublic {
  id: string;
  email: string;
  name: string | null;
  avatar?: string | null;
  role: UserRole;
  createdAt: string;
}

// ── Auth ───────────────────────────────────────────────────────────

export interface RegisterRequest {
  email: string;
  password: string;
  name: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  user: UserPublic;
}

export interface RefreshRequest {
  refreshToken: string;
}

// ── Device ─────────────────────────────────────────────────────────

export interface DevicePublic {
  id: string;
  userId: string;
  name: string;
  platform: DevicePlatform;
  token: string;
  isActive: boolean;
  isPrimary: boolean;
  lastSeen: string | null;
  createdAt: string;
}

export interface DeviceRegisterRequest {
  name: string;
  platform: DevicePlatform;
}

export interface DeviceUpdateRequest {
  name?: string;
  isActive?: boolean;
  isPrimary?: boolean;
}

// ── Location ───────────────────────────────────────────────────────

export interface LocationData {
  id: string;
  deviceId: string;
  lat: number;
  lng: number;
  accuracy: number | null;
  altitude: number | null;
  speed: number | null;
  heading: number | null;
  batteryLevel: number | null;
  timestamp: string;
}

export interface LocationUpdateRequest {
  lat: number;
  lng: number;
  accuracy?: number;
  altitude?: number;
  speed?: number;
  heading?: number;
  batteryLevel?: number;
}

export interface DeviceWithLocation extends DevicePublic {
  latestLocation: LocationData | null;
}

// ── Share ──────────────────────────────────────────────────────────

export interface SharePublic {
  id: string;
  ownerId: string;
  targetUserId: string | null;
  shareToken: string;
  expiresAt: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface ShareCreateRequest {
  targetUserId?: string;
  expiresIn?: ShareExpiry;
  deviceId?: string;
}

export interface SharedLocationView {
  ownerName: string | null;
  devices: DeviceWithLocation[];
  expiresAt: string | null;
}

// ── People Sharing ────────────────────────────────────────────────

export type PeopleShareStatus = "PENDING" | "ACCEPTED" | "DECLINED";

export interface PeopleSharePublic {
  id: string;
  fromUserId: string;
  toUserId: string;
  status: PeopleShareStatus;
  createdAt: string;
  fromUser?: UserPublic;
  toUser?: UserPublic;
}

export interface PeopleInviteRequest {
  email: string;
}

export interface PeopleRespondRequest {
  shareId: string;
  action: "accept" | "decline";
}

export interface PersonWithDevices {
  user: UserPublic;
  devices: DeviceWithLocation[];
}

// ── QR Pairing ────────────────────────────────────────────────────

export interface QrSessionPublic {
  id: string;
  token: string;
  expiresAt: string;
  used: boolean;
  qrData: string;
}

export interface QrAuthRequest {
  sessionId: string;
  deviceName: string;
  platform: DevicePlatform;
}

export interface QrAuthResponse {
  accessToken: string;
  refreshToken: string;
  deviceToken: string;
  user: UserPublic;
}

// ── Passkeys ──────────────────────────────────────────────────────

export interface PasskeyPublic {
  id: string;
  name: string;
  deviceType: string;
  backedUp: boolean;
  createdAt: string;
}

// ── Settings ───────────────────────────────────────────────────────

export interface SettingsUpdateRequest {
  name?: string;
  currentPassword?: string;
  newPassword?: string;
  retentionDays?: number;
}

// ── Admin ──────────────────────────────────────────────────────────

export interface AdminUserView extends UserPublic {
  deviceCount: number;
  locationCount: number;
}

export interface AdminDeviceView extends DevicePublic {
  userName: string | null;
  userEmail: string;
  locationCount: number;
}
