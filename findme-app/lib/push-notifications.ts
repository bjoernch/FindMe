import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { Platform } from "react-native";
import type { FindMeClient } from "./api-client";

/**
 * Register for push notifications and send the token to the server.
 */
export async function registerForPushNotifications(
  apiClient: FindMeClient
): Promise<void> {
  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== "granted") {
      return; // User declined, don't push further
    }

    // Get the Expo push token
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: projectId || undefined,
    });

    const pushToken = tokenData.data;
    if (!pushToken) return;

    // Register with server
    await apiClient.registerPushToken(pushToken, Platform.OS);
  } catch (error) {
    // Push token registration is non-critical, don't crash the app
    console.warn("Push notification registration failed:", error);
  }
}

/**
 * Unregister push token from server on logout.
 */
export async function unregisterPushNotifications(
  apiClient: FindMeClient
): Promise<void> {
  try {
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: projectId || undefined,
    });
    if (tokenData.data) {
      await apiClient.unregisterPushToken(tokenData.data);
    }
  } catch {
    // Non-critical
  }
}

/**
 * Set up notification handlers for foreground display and tap actions.
 */
export function setupNotificationHandlers() {
  // Show notifications when app is in foreground
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}
