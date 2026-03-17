import * as Location from "expo-location";
import * as Battery from "expo-battery";
import * as IntentLauncher from "expo-intent-launcher";
import { Alert, Linking, Platform } from "react-native";
import Constants from "expo-constants";
import { LOCATION_TASK_NAME } from "./location-task";
import { getStoredValue, setStoredValue } from "./storage";
import { enqueue } from "./location-queue";
import type { FindMeClient } from "./api-client";

export async function requestLocationPermissions(): Promise<boolean> {
  // Step 1: Request foreground permission
  const { status: fg } = await Location.requestForegroundPermissionsAsync();
  if (fg !== "granted") return false;

  // Step 2: Check if background permission is already granted
  const { status: bgCheck } = await Location.getBackgroundPermissionsAsync();
  if (bgCheck === "granted") return true;

  // Step 3: On Android 11+, requestBackgroundPermissionsAsync may not show a
  // dialog — it often just returns "denied". We show an alert first, then try
  // the system dialog, and if still denied we send the user to Settings.
  if (Platform.OS === "android") {
    const userWants = await new Promise<boolean>((resolve) => {
      Alert.alert(
        "Background Location Required",
        'FindMe needs "Allow all the time" location access to share your location when the app is in the background.\n\nOn the next screen, tap "Allow all the time".',
        [
          { text: "Not Now", style: "cancel", onPress: () => resolve(false) },
          { text: "Continue", onPress: () => resolve(true) },
        ]
      );
    });
    if (!userWants) return false;
  }

  // Try the system dialog
  const { status: bg } = await Location.requestBackgroundPermissionsAsync();
  if (bg === "granted") return true;

  // If still not granted on Android, offer to open Settings
  if (Platform.OS === "android") {
    const openSettings = await new Promise<boolean>((resolve) => {
      Alert.alert(
        "Permission Not Granted",
        'Background location was not granted. To enable it, go to Settings > Permissions > Location and select "Allow all the time".',
        [
          { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
          { text: "Open Settings", onPress: () => resolve(true) },
        ]
      );
    });
    if (openSettings) {
      await Linking.openSettings();
    }
    return false;
  }

  return false;
}

export async function startBackgroundTracking(): Promise<boolean> {
  const hasPermission = await requestLocationPermissions();
  if (!hasPermission) return false;

  const isTracking = await Location.hasStartedLocationUpdatesAsync(
    LOCATION_TASK_NAME
  ).catch(() => false);

  if (isTracking) return true;

  await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
    accuracy: Location.Accuracy.Balanced,
    timeInterval: 5 * 60 * 1000, // 5 minutes
    distanceInterval: 100, // 100 meters
    deferredUpdatesInterval: 5 * 60 * 1000,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: "FindMe",
      notificationBody: "Sharing your location",
      notificationColor: "#3b82f6",
      killServiceOnDestroy: false,
    },
  });

  return true;
}

export async function stopBackgroundTracking(): Promise<void> {
  const isTracking = await Location.hasStartedLocationUpdatesAsync(
    LOCATION_TASK_NAME
  ).catch(() => false);

  if (isTracking) {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
  }
}

export async function isTrackingActive(): Promise<boolean> {
  return Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME).catch(
    () => false
  );
}

/**
 * Show a one-time banner explaining battery optimization and offering to open settings.
 * Only shows on Android and only once (persisted via storage).
 */
export async function showBatteryOptimizationBanner(): Promise<void> {
  if (Platform.OS !== "android") return;

  // Only show once
  const dismissed = await getStoredValue("batteryBannerDismissed");
  if (dismissed === "true") return;

  // Small delay so the UI settles after permission dialogs
  await new Promise((r) => setTimeout(r, 1500));

  const userWants = await new Promise<boolean>((resolve) => {
    Alert.alert(
      "Improve Background Location",
      "For reliable location sharing, disable battery optimization for FindMe. This prevents Android from killing the app in the background.\n\nWould you like to open battery settings?",
      [
        {
          text: "Skip",
          style: "cancel",
          onPress: () => resolve(false),
        },
        {
          text: "Open Settings",
          onPress: () => resolve(true),
        },
      ]
    );
  });

  // Mark as dismissed regardless of choice
  await setStoredValue("batteryBannerDismissed", "true");

  if (userWants) {
    try {
      // Try to open battery optimization settings for this specific app
      await IntentLauncher.startActivityAsync(
        IntentLauncher.ActivityAction.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
        {
          data: `package:${Constants.expoConfig?.android?.package || "com.findme.app"}`,
        }
      );
    } catch {
      try {
        // Fallback: open general battery optimization settings
        await IntentLauncher.startActivityAsync(
          IntentLauncher.ActivityAction.IGNORE_BATTERY_OPTIMIZATION_SETTINGS
        );
      } catch {
        // Last resort: open general app settings
        await Linking.openSettings();
      }
    }
  }
}

export async function sendForegroundUpdate(
  apiClient: FindMeClient
): Promise<void> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== "granted") return;

  const location = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.High,
  });

  let batteryLevel: number | undefined;
  try {
    const level = await Battery.getBatteryLevelAsync();
    batteryLevel = Math.round(level * 100);
  } catch {
    // Battery info unavailable
  }

  try {
    await apiClient.sendLocationUpdate({
      lat: location.coords.latitude,
      lng: location.coords.longitude,
      accuracy: location.coords.accuracy ?? undefined,
      altitude: location.coords.altitude ?? undefined,
      speed: location.coords.speed ?? undefined,
      heading: location.coords.heading ?? undefined,
      batteryLevel,
    });
  } catch {
    // Queue for later when back online
    const serverUrl = apiClient.getBaseUrl();
    const deviceToken = apiClient.getDeviceToken();
    if (serverUrl && deviceToken) {
      await enqueue({
        lat: location.coords.latitude,
        lng: location.coords.longitude,
        accuracy: location.coords.accuracy ?? undefined,
        altitude: location.coords.altitude ?? undefined,
        speed: location.coords.speed ?? undefined,
        heading: location.coords.heading ?? undefined,
        batteryLevel,
        timestamp: Date.now(),
        deviceToken,
        serverUrl,
      });
    }
  }
}
