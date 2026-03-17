// MUST be imported at the app root level for TaskManager.defineTask to work.
import * as TaskManager from "expo-task-manager";
import * as Battery from "expo-battery";
import { showLocalNotification } from "./push-notifications";
import { getStoredValue } from "./storage";
import { enqueue, dequeueAll } from "./location-queue";
import type { QueuedLocationUpdate } from "./location-queue";

export const LOCATION_TASK_NAME = "findme-background-location";

async function sendLocationPayload(
  serverUrl: string,
  deviceToken: string,
  body: Record<string, unknown>
): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(`${serverUrl}/api/location/update`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${deviceToken}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Poll for pending notifications and show them as local notifications.
 * This replaces Firebase/FCM push for FOSS builds.
 */
async function pollAndShowNotifications(
  serverUrl: string,
  deviceToken: string
) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(`${serverUrl}/api/notifications/poll`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${deviceToken}`,
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) return;

    const json = await res.json();
    const notifications = json?.data;
    if (!Array.isArray(notifications) || notifications.length === 0) return;

    for (const notif of notifications) {
      await showLocalNotification(notif.title, notif.body, notif.data || undefined);
    }
  } catch {
    // Notification polling is non-critical
  }
}

TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }) => {
  if (error) {
    console.error("[FindMe] Background location error:", error);
    return;
  }

  const { locations } = data as {
    locations: Array<{
      coords: {
        latitude: number;
        longitude: number;
        accuracy: number | null;
        altitude: number | null;
        speed: number | null;
        heading: number | null;
      };
      timestamp: number;
    }>;
  };

  if (!locations || locations.length === 0) return;

  const deviceToken = await getStoredValue("deviceToken");
  const serverUrl = await getStoredValue("serverUrl");
  if (!deviceToken || !serverUrl) return;

  // Drain retry queue first
  const queued = await dequeueAll();
  for (const entry of queued) {
    const ok = await sendLocationPayload(entry.serverUrl, entry.deviceToken, {
      lat: entry.lat,
      lng: entry.lng,
      accuracy: entry.accuracy,
      altitude: entry.altitude,
      speed: entry.speed,
      heading: entry.heading,
      batteryLevel: entry.batteryLevel,
    });
    if (!ok) {
      await enqueue(entry);
    }
  }

  // Send current location
  const loc = locations[locations.length - 1];

  let batteryLevel: number | undefined;
  try {
    const level = await Battery.getBatteryLevelAsync();
    batteryLevel = Math.round(level * 100);
  } catch {
    // Battery info unavailable
  }

  const payload = {
    lat: loc.coords.latitude,
    lng: loc.coords.longitude,
    accuracy: loc.coords.accuracy ?? undefined,
    altitude: loc.coords.altitude ?? undefined,
    speed: loc.coords.speed ?? undefined,
    heading: loc.coords.heading ?? undefined,
    batteryLevel,
  };

  const ok = await sendLocationPayload(serverUrl, deviceToken, payload);
  if (!ok) {
    await enqueue({
      ...payload,
      timestamp: Date.now(),
      deviceToken,
      serverUrl,
    } as QueuedLocationUpdate);
  }

  // Poll for notifications (replaces Firebase/FCM push)
  await pollAndShowNotifications(serverUrl, deviceToken);
});
