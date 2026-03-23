import { z } from "zod";

export const registerSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().min(1, "Name is required").max(100),
});

export const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

export const deviceRegisterSchema = z.object({
  name: z.string().min(1, "Device name is required").max(100),
  platform: z.enum(["ios", "android", "web"]),
});

export const deviceUpdateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  isActive: z.boolean().optional(),
  isPrimary: z.boolean().optional(),
});

export const locationUpdateSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracy: z.number().min(0).optional(),
  altitude: z.number().optional(),
  speed: z.number().min(0).optional(),
  heading: z.number().min(0).max(360).optional(),
  batteryLevel: z.number().min(0).max(100).optional(),
});

export const shareCreateSchema = z.object({
  targetUserId: z.string().optional(),
  expiresIn: z.enum(["1h", "24h", "7d", "never"]).optional(),
  deviceId: z.string().optional(),
});

export const historyQuerySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(10000).default(1000),
});

export const peopleInviteSchema = z.object({
  email: z.string().email("Invalid email address"),
});

export const peopleRespondSchema = z.object({
  shareId: z.string().min(1, "Share ID is required"),
  action: z.enum(["accept", "decline"]),
  shareBack: z.boolean().optional(),
});

export const peopleSearchSchema = z.object({
  q: z.string().min(1, "Search query required").max(100),
});

export const qrAuthSchema = z.object({
  sessionId: z.string().min(1, "Session ID is required"),
  deviceName: z.string().min(1, "Device name is required").max(100),
  platform: z.enum(["ios", "android", "web"]),
});

export const notificationPreferencesSchema = z.object({
  emailInvitations: z.boolean().optional(),
  emailGeofence: z.boolean().optional(),
  pushInvitations: z.boolean().optional(),
  pushGeofence: z.boolean().optional(),
  pushLocationSharing: z.boolean().optional(),
  quietHoursStart: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  quietHoursEnd: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
});

export const settingsUpdateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  currentPassword: z.string().optional(),
  newPassword: z.string().min(8).optional(),
  retentionDays: z.number().int().min(1).max(365).optional(),
  webhookUrl: z.string().url().nullable().optional(),
  webhookSecret: z.string().max(256).nullable().optional(),
});
