import AsyncStorage from "@react-native-async-storage/async-storage";

const CACHE_KEYS = {
  latestLocations: "findme_cache_latest_locations",
  people: "findme_cache_people",
  devices: "findme_cache_devices",
} as const;

export type CacheKey = keyof typeof CACHE_KEYS;

export async function cacheData(key: CacheKey, data: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(
      CACHE_KEYS[key],
      JSON.stringify({ data, cachedAt: Date.now() })
    );
  } catch {
    // Cache write failure is non-critical
  }
}

export async function getCachedData<T>(
  key: CacheKey
): Promise<{ data: T; cachedAt: number } | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEYS[key]);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function clearCache(): Promise<void> {
  try {
    await Promise.all(
      Object.values(CACHE_KEYS).map((k) => AsyncStorage.removeItem(k))
    );
  } catch {
    // Non-critical
  }
}
