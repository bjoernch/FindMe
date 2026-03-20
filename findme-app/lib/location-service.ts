import * as Location from "expo-location";
import * as Battery from "expo-battery";
import * as IntentLauncher from "expo-intent-launcher";
import notifee from "@notifee/react-native";
import { Alert, Linking, Platform } from "react-native";
import Constants from "expo-constants";
import { LOCATION_TASK_NAME } from "./location-task";
import { getStoredValue, setStoredValue } from "./storage";
import { enqueue } from "./location-queue";
import type { FindMeClient } from "./api-client";

/**
 * Request all permissions needed for full location tracking:
 * 1. Notification permission (Android 13+, needed for foreground service)
 * 2. Foreground location
 * 3. Background location ("Allow all the time")
 * 4. Battery optimization exemption
 *
 * Shows warnings if any permission is denied.
 */
export async function requestAllPermissions(): Promise<{
  notifications: boolean;
  foregroundLocation: boolean;
  backgroundLocation: boolean;
}> {
  const result = {
    notifications: false,
    foregroundLocation: false,
    backgroundLocation: false,
  };

  // Step 1: Notification permission (Android 13+ requires explicit grant)
  if (Platform.OS === "android") {
    try {
      const settings = await notifee.requestPermission();
      // authorizationStatus 1 = AUTHORIZED
      result.notifications = settings.authorizationStatus === 1;
    } catch {
      result.notifications = false;
    }

    if (!result.notifications) {
      const openSettings = await new Promise<boolean>((resolve) => {
        Alert.alert(
          "Notifications Disabled",
          "FindMe needs notification permission to show the location tracking indicator and geofence alerts.\n\nWould you like to enable notifications in Settings?",
          [
            { text: "Skip", style: "cancel", onPress: () => resolve(false) },
            { text: "Open Settings", onPress: () => resolve(true) },
          ]
        );
      });
      if (openSettings) {
        await Linking.openSettings();
        // Re-check after user returns from settings
        try {
          const recheck = await notifee.getNotificationSettings();
          result.notifications = recheck.authorizationStatus === 1;
        } catch {}
      }
    }
  } else {
    // iOS handles notification differently
    try {
      const settings = await notifee.requestPermission();
      result.notifications = settings.authorizationStatus === 1;
    } catch {}
  }

  // Step 2: Foreground location permission
  const { status: fg } = await Location.requestForegroundPermissionsAsync();
  result.foregroundLocation = fg === "granted";

  if (!result.foregroundLocation) {
    Alert.alert(
      "Location Permission Required",
      "FindMe needs location access to share your position with family and friends. Please grant location permission in Settings.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Open Settings", onPress: () => Linking.openSettings() },
      ]
    );
    return result;
  }

  // Step 3: Background location permission ("Allow all the time")
  const { status: bgCheck } = await Location.getBackgroundPermissionsAsync();
  if (bgCheck === "granted") {
    result.backgroundLocation = true;
  } else if (Platform.OS === "android") {
    // On Android 11+, explain why we need "Allow all the time"
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

    if (userWants) {
      const { status: bg } = await Location.requestBackgroundPermissionsAsync();
      if (bg === "granted") {
        result.backgroundLocation = true;
      } else {
        // System dialog didn't work — send user directly to app location settings
        const openSettings = await new Promise<boolean>((resolve) => {
          Alert.alert(
            "Background Location Not Granted",
            'Please select "Allow all the time" in the location settings for FindMe.',
            [
              { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
              { text: "Open Settings", onPress: () => resolve(true) },
            ]
          );
        });
        if (openSettings) {
          await Linking.openSettings();
          // Re-check after user returns
          const { status: recheck } = await Location.getBackgroundPermissionsAsync();
          result.backgroundLocation = recheck === "granted";
        }
      }
    }
  } else {
    // iOS
    const { status: bg } = await Location.requestBackgroundPermissionsAsync();
    result.backgroundLocation = bg === "granted";
  }

  if (!result.backgroundLocation) {
    Alert.alert(
      "Limited Location Sharing",
      "Without background location access, FindMe can only update your location while the app is open. Your contacts may see stale positions.\n\nYou can change this in Settings > Apps > FindMe > Permissions > Location.",
    );
  }

  // Step 4: Battery optimization (Android only, after location is granted)
  if (Platform.OS === "android" && result.backgroundLocation) {
    await requestBatteryOptimization();
  }

  return result;
}

/**
 * Request battery optimization exemption. Only shows once.
 */
async function requestBatteryOptimization(): Promise<void> {
  const dismissed = await getStoredValue("batteryBannerDismissed");
  if (dismissed === "true") return;

  // Small delay so the UI settles after permission dialogs
  await new Promise((r) => setTimeout(r, 1000));

  const userWants = await new Promise<boolean>((resolve) => {
    Alert.alert(
      "Improve Background Location",
      "For reliable location sharing, disable battery optimization for FindMe. This prevents Android from killing the app in the background.\n\nWould you like to open battery settings?",
      [
        { text: "Skip", style: "cancel", onPress: () => resolve(false) },
        { text: "Open Settings", onPress: () => resolve(true) },
      ]
    );
  });

  await setStoredValue("batteryBannerDismissed", "true");

  if (userWants) {
    try {
      await IntentLauncher.startActivityAsync(
        IntentLauncher.ActivityAction.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
        {
          data: `package:${Constants.expoConfig?.android?.package || "com.findme.app"}`,
        }
      );
    } catch {
      try {
        await IntentLauncher.startActivityAsync(
          IntentLauncher.ActivityAction.IGNORE_BATTERY_OPTIMIZATION_SETTINGS
        );
      } catch {
        await Linking.openSettings();
      }
    }
  }
}

export async function startBackgroundTracking(): Promise<boolean> {
  const isTracking = await Location.hasStartedLocationUpdatesAsync(
    LOCATION_TASK_NAME
  ).catch(() => false);

  if (isTracking) return true;

  // Check we have background permission before starting
  const { status: bg } = await Location.getBackgroundPermissionsAsync();
  if (bg !== "granted") return false;

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

// Keep legacy export for compatibility
export const showBatteryOptimizationBanner = requestBatteryOptimization;

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
