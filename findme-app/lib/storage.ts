import * as SecureStore from "expo-secure-store";

const KEYS = {
  accessToken: "findme_access_token",
  refreshToken: "findme_refresh_token",
  deviceToken: "findme_device_token",
  deviceId: "findme_device_id",
  serverUrl: "findme_server_url",
  userId: "findme_user_id",
  themeMode: "findme_theme_mode",
  mapTileLayer: "findme_map_tile_layer",
  batteryBannerDismissed: "findme_battery_banner_dismissed",
} as const;

type StorageKey = keyof typeof KEYS;

export async function getStoredValue(key: StorageKey): Promise<string | null> {
  return SecureStore.getItemAsync(KEYS[key]);
}

export async function setStoredValue(
  key: StorageKey,
  value: string
): Promise<void> {
  await SecureStore.setItemAsync(KEYS[key], value);
}

export async function deleteStoredValue(key: StorageKey): Promise<void> {
  await SecureStore.deleteItemAsync(KEYS[key]);
}

export async function clearAll(): Promise<void> {
  await Promise.all(
    Object.values(KEYS).map((k) => SecureStore.deleteItemAsync(k))
  );
}
