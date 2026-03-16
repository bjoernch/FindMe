import { useEffect, useRef, useCallback, useState } from "react";
import { AppState } from "react-native";
import { cacheData, getCachedData, type CacheKey } from "./offline-cache";

interface PollingOptions {
  cacheKey?: CacheKey;
  isConnected?: boolean;
}

export function usePolling<T>(
  fetchFn: () => Promise<T>,
  intervalMs: number = 30000,
  options?: PollingOptions
) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isOffline, setIsOffline] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fetchFnRef = useRef(fetchFn);
  const optionsRef = useRef(options);
  fetchFnRef.current = fetchFn;
  optionsRef.current = options;
  const cacheLoadedRef = useRef(false);

  // Load cached data on mount
  useEffect(() => {
    if (options?.cacheKey && !cacheLoadedRef.current) {
      cacheLoadedRef.current = true;
      getCachedData<T>(options.cacheKey).then((cached) => {
        if (cached) {
          setData((prev) => prev ?? cached.data);
          setLoading(false);
        }
      });
    }
  }, [options?.cacheKey]);

  const doFetch = useCallback(async () => {
    const opts = optionsRef.current;

    // Skip fetch when offline
    if (opts?.isConnected === false) {
      setIsOffline(true);
      setLoading(false);
      return;
    }

    setIsOffline(false);

    try {
      const result = await fetchFnRef.current();
      setData(result);
      setError(null);

      // Update cache on success
      if (opts?.cacheKey) {
        cacheData(opts.cacheKey, result).catch(() => {});
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      // On network error, try cached data
      if (opts?.cacheKey) {
        const cached = await getCachedData<T>(opts.cacheKey);
        if (cached) {
          setData(cached.data);
          setIsOffline(true);
        }
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const startPolling = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(doFetch, intervalMs);
  }, [doFetch, intervalMs]);

  useEffect(() => {
    doFetch();
    startPolling();

    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        doFetch();
        startPolling();
      } else {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      }
    });

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      subscription.remove();
    };
  }, [doFetch, startPolling]);

  return { data, error, loading, refetch: doFetch, isOffline };
}
