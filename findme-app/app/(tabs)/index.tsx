import { useCallback, useRef, useEffect, useState } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator,
} from "react-native";
import { WebView } from "react-native-webview";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Alert } from "react-native";
import { useAuth } from "../../lib/auth-context";
import { useTheme } from "../../lib/theme-context";
import { usePolling } from "../../lib/use-polling";
import { useSSE } from "../../lib/use-sse";
import { getStoredValue, setStoredValue } from "../../lib/storage";
import { getAvatarColor, getInitials } from "../../lib/avatar";
import { MAP_TILE_LAYERS, TILE_LAYER_IDS, TILE_BG_COLORS } from "../../lib/map-tiles";
import type { MapTileLayerId } from "../../lib/map-tiles";
import type { ThemeColors } from "../../lib/theme";
import type { DeviceWithLocation, PersonWithDevices } from "../../lib/types";

function isOnline(lastSeen: string | null): boolean {
  if (!lastSeen) return false;
  return Date.now() - new Date(lastSeen).getTime() < 5 * 60 * 1000;
}

function formatLastSeen(lastSeen: string | null): string {
  if (!lastSeen) return "Never";
  const diff = Date.now() - new Date(lastSeen).getTime();
  if (diff < 60_000) return "Just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

function buildMapHtml(
  devices: (DeviceWithLocation & { ownerName?: string | null; ownerAvatar?: string | null })[] | null,
  people: PersonWithDevices[] | null,
  tileLayerId: MapTileLayerId,
  serverUrl?: string | null
) {
  const tile = MAP_TILE_LAYERS[tileLayerId];
  const bgColor = TILE_BG_COLORS[tileLayerId];

  const markers: Array<{
    lat: number;
    lng: number;
    label: string;
    color: string;
    initials: string;
    online: boolean;
    isDevice: boolean;
    isPrimary: boolean;
    avatar?: string | null;
    battery?: number | null;
    accuracy?: number | null;
    lastSeen: string;
    deviceCount?: number;
  }> = [];

  devices?.forEach((d) => {
    if (!d.latestLocation) return;
    const online = isOnline(d.lastSeen);
    const ownerName = (d as any).ownerName || d.name;
    const ownerAvatar = (d as any).ownerAvatar || null;
    markers.push({
      lat: d.latestLocation.lat,
      lng: d.latestLocation.lng,
      label: d.isPrimary ? ownerName : d.name,
      color: d.isPrimary ? getAvatarColor(ownerName) : "#3b82f6",
      initials: d.isPrimary ? getInitials(ownerName) : (d.platform === "android" ? "A" : d.platform === "ios" ? "I" : "W"),
      online,
      isDevice: true,
      isPrimary: d.isPrimary,
      avatar: d.isPrimary ? ownerAvatar : null,
      battery: d.latestLocation.batteryLevel,
      accuracy: d.latestLocation.accuracy ?? null,
      lastSeen: online ? "Online" : formatLastSeen(d.lastSeen),
    });
  });

  people?.forEach((p) => {
    const devicesWithLoc = p.devices.filter((d) => d.latestLocation);
    if (devicesWithLoc.length === 0) return;
    const mostRecent = devicesWithLoc.reduce((a, b) => {
      const aTime = new Date(a.latestLocation!.timestamp).getTime();
      const bTime = new Date(b.latestLocation!.timestamp).getTime();
      return bTime > aTime ? b : a;
    });
    const loc = mostRecent.latestLocation!;
    const online = isOnline(mostRecent.lastSeen);
    markers.push({
      lat: loc.lat,
      lng: loc.lng,
      label: p.user.name || p.user.email,
      color: getAvatarColor(p.user.name),
      initials: getInitials(p.user.name),
      online,
      isDevice: false,
      isPrimary: false,
      avatar: p.user.avatar,
      battery: loc.batteryLevel,
      accuracy: loc.accuracy ?? null,
      lastSeen: online ? "Online" : formatLastSeen(mostRecent.lastSeen),
      deviceCount: devicesWithLoc.length,
    });
  });

  const markersJson = JSON.stringify(markers);
  const isDark = tileLayerId === "dark" || tileLayerId === "satellite";
  const popupTextColor = isDark ? "#fff" : "#111";
  const popupBgColor = isDark ? "#1f2937" : "#ffffff";
  const popupSecondary = isDark ? "#9ca3af" : "#6b7280";

  const leafletBase = serverUrl || 'https://unpkg.com/leaflet@1.9.4/dist';
  const leafletCss = serverUrl ? `${serverUrl}/leaflet/leaflet.css` : `${leafletBase}/leaflet.css`;
  const leafletJs = serverUrl ? `${serverUrl}/leaflet/leaflet.js` : `${leafletBase}/leaflet.js`;

  return `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"/>
<link rel="stylesheet" href="${leafletCss}"/>
<script src="${leafletJs}"><\/script>
<style>
  * { margin: 0; padding: 0; }
  html, body { width: 100%; height: 100%; overflow: hidden; background: ${bgColor}; }
  #map { width: 100%; height: 100%; }
  .leaflet-popup-content-wrapper { background: ${popupBgColor}; color: ${popupTextColor}; border-radius: 12px; box-shadow: 0 4px 16px rgba(0,0,0,0.3); }
  .leaflet-popup-tip { background: ${popupBgColor}; }
  .leaflet-popup-content { margin: 0 !important; }
  .popup-card { font-family: -apple-system, sans-serif; padding: 12px; min-width: 180px; }
  .popup-header { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
  .popup-avatar { width: 40px; height: 40px; border-radius: 50%; flex-shrink: 0; display: flex; align-items: center; justify-content: center; color: #fff; font-weight: 700; font-size: 15px; overflow: hidden; }
  .popup-avatar img { width: 100%; height: 100%; object-fit: cover; }
  .popup-name { font-weight: 600; font-size: 14px; }
  .popup-status { font-size: 12px; color: ${popupSecondary}; }
  .popup-details { font-size: 12px; color: ${popupSecondary}; margin-bottom: 10px; }
  .popup-nav { display: inline-flex; align-items: center; gap: 5px; background: #3b82f6; color: #fff; padding: 6px 12px; border-radius: 8px; text-decoration: none; font-size: 12px; font-weight: 600; }
  .popup-nav:hover { background: #2563eb; }
</style>
</head>
<body>
<div id="map"></div>
<div id="error" style="display:none;position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);color:#ef4444;font-family:sans-serif;font-size:14px;text-align:center;z-index:9999;background:rgba(0,0,0,0.8);padding:16px 24px;border-radius:12px;max-width:80%;"></div>
<script>
if (typeof L === 'undefined') {
  document.getElementById('error').style.display = 'block';
  document.getElementById('error').textContent = 'Map library failed to load. Check server URL in Settings.';
  throw new Error('Leaflet not loaded');
}
var map = L.map('map', { zoomControl: false }).setView([51.505, -0.09], 3);
var currentTileLayer = L.tileLayer('${tile.url}', {
  attribution: '',
  maxZoom: ${tile.maxZoom}
}).addTo(map);

window.setTileLayer = function(url, maxZoom) {
  map.removeLayer(currentTileLayer);
  currentTileLayer = L.tileLayer(url, { attribution: '', maxZoom: maxZoom }).addTo(map);
};

var markers = ${markersJson};
var bounds = [];
var markerMap = {};

markers.forEach(function(m) {
  var borderColor = m.online ? '#22c55e' : '#6b7280';
  var showAvatar = m.avatar && (m.isPrimary || !m.isDevice);
  var size = (m.isPrimary || !m.isDevice) ? 44 : 32;
  var fontSize = (m.isPrimary || !m.isDevice) ? 16 : 12;

  var innerHtml;
  if (showAvatar) {
    innerHtml = '<div style="width:'+size+'px;height:'+size+'px;border-radius:50%;border:3px solid '+borderColor+';overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.5);"><img src="'+m.avatar+'" style="width:100%;height:100%;object-fit:cover;" /></div>';
  } else {
    innerHtml = '<div style="width:'+size+'px;height:'+size+'px;border-radius:50%;background:'+m.color+';border:3px solid '+borderColor+';display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:'+fontSize+'px;font-family:sans-serif;box-shadow:0 2px 8px rgba(0,0,0,0.5);">'+m.initials+'</div>';
  }

  var icon = L.divIcon({
    className: '',
    html: innerHtml,
    iconSize: [size, size],
    iconAnchor: [size/2, size/2]
  });

  // Build popup with avatar, info, and nav link
  var avatarHtml;
  if (m.avatar && (m.isPrimary || !m.isDevice)) {
    avatarHtml = '<div class="popup-avatar"><img src="'+m.avatar+'" /></div>';
  } else {
    avatarHtml = '<div class="popup-avatar" style="background:'+m.color+';">'+m.initials+'</div>';
  }

  var detailParts = [];
  if (m.battery != null) detailParts.push('Battery: '+m.battery+'%');
  if (m.accuracy) detailParts.push('Accuracy: '+m.accuracy+'m');
  if (m.deviceCount) detailParts.push(m.deviceCount+' device'+(m.deviceCount!==1?'s':''));

  var gmapsUrl = 'https://www.google.com/maps/dir/?api=1&destination='+m.lat+','+m.lng;

  var popupHtml = '<div class="popup-card">'
    + '<div class="popup-header">'
    + avatarHtml
    + '<div><div class="popup-name">'+m.label+'</div>'
    + '<div class="popup-status">'+m.lastSeen+'</div></div>'
    + '</div>'
    + (detailParts.length ? '<div class="popup-details">'+detailParts.join(' &middot; ')+'</div>' : '')
    + '<a class="popup-nav" href="'+gmapsUrl+'" target="_blank">'
    + '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 11l19-9-9 19-2-8-8-2z"/></svg>'
    + 'Navigate'
    + '</a>'
    + '</div>';

  var markerObj = L.marker([m.lat, m.lng], { icon: icon })
    .bindPopup(popupHtml, { maxWidth: 250, closeButton: false })
    .addTo(map);
  markerMap[m.lat + ',' + m.lng] = markerObj;

  if (m.accuracy && m.accuracy > 0) {
    L.circle([m.lat, m.lng], { radius: m.accuracy, color: borderColor, weight: 1, opacity: 0.4, fillColor: borderColor, fillOpacity: 0.08, dashArray: '4,4' }).addTo(map);
  }

  bounds.push([m.lat, m.lng]);
});

if (bounds.length > 0) {
  map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
}

window.updateMarker = function(data) {
  // data: { lat, lng, deviceId, accuracy, batteryLevel, timestamp }
  // Trigger a full refresh via RN
  window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'location_update', data: data }));
};
<\/script>
</body>
</html>`;
}

export default function MapScreen() {
  const { apiClient, serverUrl, isLoading: authLoading, logout } = useAuth();
  const { colors, effectiveMode } = useTheme();
  const { focusLat, focusLng } = useLocalSearchParams<{ focusLat?: string; focusLng?: string }>();
  const insets = useSafeAreaInsets();
  const styles = createStyles(colors);
  const webViewRef = useRef<WebView>(null);
  const [tileLayerId, setTileLayerId] = useState<MapTileLayerId>(effectiveMode === "dark" ? "dark" : "light");
  const [showPicker, setShowPicker] = useState(false);
  const [userChoseTile, setUserChoseTile] = useState(false);
  const lastFocusRef = useRef<string | null>(null);

  // When navigated to with focus coordinates, pan the map
  useEffect(() => {
    if (focusLat && focusLng) {
      const key = `${focusLat},${focusLng}`;
      if (lastFocusRef.current !== key) {
        lastFocusRef.current = key;
        webViewRef.current?.injectJavaScript(
          `map.setView([${focusLat}, ${focusLng}], 16); true;`
        );
      }
    }
  }, [focusLat, focusLng]);

  // Load persisted tile layer preference
  useEffect(() => {
    getStoredValue("mapTileLayer").then((val) => {
      if (val && val in MAP_TILE_LAYERS) {
        setTileLayerId(val as MapTileLayerId);
        setUserChoseTile(true);
      }
    });
  }, []);

  // Auto-switch tile based on theme if user hasn't explicitly chosen
  useEffect(() => {
    if (!userChoseTile) {
      setTileLayerId(effectiveMode === "dark" ? "dark" : "light");
    }
  }, [effectiveMode, userChoseTile]);

  function handleTileChange(id: MapTileLayerId) {
    setTileLayerId(id);
    setUserChoseTile(true);
    setShowPicker(false);
    setStoredValue("mapTileLayer", id);
    const tile = MAP_TILE_LAYERS[id];
    webViewRef.current?.injectJavaScript(
      `window.setTileLayer('${tile.url}', ${tile.maxZoom}); true;`
    );
  }

  const fetchDevices = useCallback(
    () => apiClient.getLatestLocations().then((r) => r.data ?? []),
    [apiClient]
  );

  const fetchPeople = useCallback(
    () => apiClient.getPeople().then((r) => r.data ?? []),
    [apiClient]
  );

  const { data: devices, refetch: refetchDevices } = usePolling<DeviceWithLocation[]>(fetchDevices, 30000);
  const { data: people, refetch: refetchPeople } = usePolling<PersonWithDevices[]>(fetchPeople, 30000);

  const handleSSELocationUpdate = useCallback(() => {
    refetchDevices();
    refetchPeople();
  }, [refetchDevices, refetchPeople]);

  const handleDeviceRevoked = useCallback(async (data: { deviceId: string }) => {
    const currentDeviceId = await getStoredValue("deviceId");
    if (currentDeviceId && currentDeviceId === data.deviceId) {
      Alert.alert(
        "Device Revoked",
        "This device has been revoked by an administrator. You will be logged out.",
        [{ text: "OK", onPress: () => logout() }]
      );
    }
  }, [logout]);

  const { connected: sseConnected } = useSSE({
    url: serverUrl || "",
    token: apiClient.getAccessToken(),
    enabled: !!serverUrl && !authLoading,
    onLocationUpdate: handleSSELocationUpdate,
    onDeviceRevoked: handleDeviceRevoked,
  });

  const bgColor = TILE_BG_COLORS[tileLayerId];

  // Wait for auth to initialize so serverUrl is available
  // This fixes the race condition where WebView renders with baseUrl="" before serverUrl is loaded
  if (authLoading || !serverUrl) {
    return (
      <View style={[styles.container, styles.loadingContainer, { backgroundColor: bgColor }]}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
          {authLoading ? "Loading..." : "Set server URL in Settings"}
        </Text>
      </View>
    );
  }

  const html = buildMapHtml(devices, people, tileLayerId, serverUrl);

  return (
    <View style={[styles.container, { backgroundColor: bgColor }]}>
      <WebView
        ref={webViewRef}
        source={{ html, baseUrl: serverUrl }}
        style={[styles.map, { backgroundColor: bgColor }]}
        javaScriptEnabled
        originWhitelist={["*"]}
        mixedContentMode="always"
        allowFileAccess
        allowUniversalAccessFromFileURLs
        scrollEnabled={false}
        bounces={false}
        overScrollMode="never"
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        setBuiltInZoomControls={false}
      />

      {/* SSE Connection Indicator */}
      <View style={[styles.sseIndicator, { top: insets.top + 12 }]}>
        <View style={[styles.sseDot, { backgroundColor: sseConnected ? "#22c55e" : "#9ca3af" }]} />
        <Text style={styles.sseText}>{sseConnected ? "Live" : ""}</Text>
      </View>

      {/* Tile Layer Button */}
      <TouchableOpacity
        style={styles.layerButton}
        onPress={() => setShowPicker(!showPicker)}
        activeOpacity={0.8}
      >
        <Ionicons name="layers" size={22} color="#fff" />
      </TouchableOpacity>

      {/* Tile Layer Picker */}
      {showPicker && (
        <>
          <TouchableOpacity
            style={styles.pickerBackdrop}
            activeOpacity={1}
            onPress={() => setShowPicker(false)}
          />
          <View style={styles.picker}>
            {TILE_LAYER_IDS.map((id) => {
              const layer = MAP_TILE_LAYERS[id];
              const isActive = id === tileLayerId;
              return (
                <TouchableOpacity
                  key={id}
                  style={[styles.pickerRow, isActive && styles.pickerRowActive]}
                  onPress={() => handleTileChange(id)}
                >
                  <Text style={[styles.pickerText, isActive && styles.pickerTextActive]}>
                    {layer.label}
                  </Text>
                  {isActive && (
                    <Ionicons name="checkmark" size={18} color={colors.accent} />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </>
      )}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1 },
    loadingContainer: { alignItems: "center", justifyContent: "center" },
    loadingText: { marginTop: 12, fontSize: 14 },
    map: { flex: 1 },
    sseIndicator: {
      position: "absolute",
      right: 16,
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: "rgba(0,0,0,0.55)",
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 12,
      zIndex: 10,
    },
    sseDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    sseText: {
      color: "#fff",
      fontSize: 11,
      fontWeight: "600",
      marginLeft: 4,
    },
    layerButton: {
      position: "absolute",
      bottom: 24,
      right: 16,
      width: 46,
      height: 46,
      borderRadius: 23,
      backgroundColor: "rgba(0,0,0,0.65)",
      alignItems: "center",
      justifyContent: "center",
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.3,
      shadowRadius: 4,
      elevation: 5,
      zIndex: 10,
    },
    pickerBackdrop: {
      ...StyleSheet.absoluteFillObject,
      zIndex: 15,
    },
    picker: {
      position: "absolute",
      bottom: 80,
      right: 16,
      backgroundColor: colors.surface,
      borderRadius: 14,
      paddingVertical: 6,
      minWidth: 180,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 8,
      elevation: 10,
      zIndex: 20,
    },
    pickerRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingVertical: 12,
      paddingHorizontal: 16,
    },
    pickerRowActive: {
      backgroundColor: colors.surfaceLight,
    },
    pickerText: {
      fontSize: 15,
      color: colors.textPrimary,
      fontWeight: "500",
    },
    pickerTextActive: {
      fontWeight: "700",
      color: colors.accent,
    },
  });
}
