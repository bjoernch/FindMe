import { useEffect, useRef, useState, useCallback } from "react";
import { AppState, AppStateStatus } from "react-native";
import EventSource from "react-native-sse";

interface SSEOptions {
  url: string;
  token: string | null;
  enabled: boolean;
  onLocationUpdate?: (data: any) => void;
  onDeviceRevoked?: (data: { deviceId: string }) => void;
}

export function useSSE({ url, token, enabled, onLocationUpdate, onDeviceRevoked }: SSEOptions) {
  const [connected, setConnected] = useState(false);
  const esRef = useRef<EventSource | null>(null);
  const retriesRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const connect = useCallback(() => {
    if (!url || !token || !enabled) return;

    // Clean up existing
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }

    const es = new EventSource<"location_update" | "device_revoked">(`${url}/api/sse`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    es.addEventListener("open", () => {
      setConnected(true);
      retriesRef.current = 0;
    });

    es.addEventListener("location_update", (event: any) => {
      try {
        const data = JSON.parse(event.data);
        onLocationUpdate?.(data);
      } catch {}
    });

    es.addEventListener("device_revoked", (event: any) => {
      try {
        const data = JSON.parse(event.data);
        onDeviceRevoked?.(data);
      } catch {}
    });

    es.addEventListener("error", () => {
      setConnected(false);
      es.close();
      esRef.current = null;

      // Exponential backoff reconnect
      const delay = Math.min(1000 * Math.pow(2, retriesRef.current), 30000);
      retriesRef.current++;
      timerRef.current = setTimeout(connect, delay);
    });

    esRef.current = es;
  }, [url, token, enabled, onLocationUpdate, onDeviceRevoked]);

  // Connect/disconnect based on app state
  useEffect(() => {
    if (!enabled) return;

    connect();

    const sub = AppState.addEventListener("change", (state: AppStateStatus) => {
      if (state === "active") {
        if (!esRef.current) connect();
      } else {
        if (esRef.current) {
          esRef.current.close();
          esRef.current = null;
          setConnected(false);
        }
        if (timerRef.current) {
          clearTimeout(timerRef.current);
          timerRef.current = null;
        }
      }
    });

    return () => {
      sub.remove();
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      setConnected(false);
    };
  }, [connect, enabled]);

  return { connected };
}
