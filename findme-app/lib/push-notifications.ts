import notifee, { AndroidImportance } from "@notifee/react-native";
import type { FindMeClient } from "./api-client";

const CHANNEL_ID = "findme-notifications";

/**
 * Ensure the notification channel exists (Android requirement).
 */
async function ensureChannel() {
  await notifee.createChannel({
    id: CHANNEL_ID,
    name: "FindMe Notifications",
    importance: AndroidImportance.HIGH,
    sound: "default",
  });
}

/**
 * Display a local notification using notifee (FOSS, no Firebase/FCM).
 */
export async function showLocalNotification(
  title: string,
  body: string,
  data?: Record<string, unknown>
) {
  try {
    await ensureChannel();
    await notifee.displayNotification({
      title,
      body,
      data: data as Record<string, string> | undefined,
      android: {
        channelId: CHANNEL_ID,
        smallIcon: "ic_notification",
        pressAction: { id: "default" },
      },
    });
  } catch (error) {
    console.warn("Failed to show local notification:", error);
  }
}

/**
 * Register for push notifications — no-op in FOSS build.
 * Notifications are delivered via polling instead of FCM push.
 */
export async function registerForPushNotifications(
  _apiClient: FindMeClient
): Promise<void> {
  // Request notification permission for local notifications
  try {
    await notifee.requestPermission();
  } catch {
    // Permission request is non-critical
  }
}

/**
 * Unregister push notifications — no-op in FOSS build.
 */
export async function unregisterPushNotifications(
  _apiClient: FindMeClient
): Promise<void> {
  // No FCM token to unregister in FOSS build
}

/**
 * Set up notification handlers for foreground display and tap actions.
 */
export function setupNotificationHandlers() {
  // Notifee handles foreground display automatically.
  // Set up event handler for notification presses.
  notifee.onForegroundEvent(({ type, detail }) => {
    // Handle notification press events if needed
  });

  notifee.onBackgroundEvent(async ({ type, detail }) => {
    // Handle background notification events if needed
  });
}
