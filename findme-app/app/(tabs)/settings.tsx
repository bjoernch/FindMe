import { useState, useEffect, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Switch, Alert, ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import Constants from "expo-constants";
import * as ImagePicker from "expo-image-picker";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { useAuth } from "../../lib/auth-context";
import { useTheme } from "../../lib/theme-context";
import { getStoredValue } from "../../lib/storage";
import { startBackgroundTracking, stopBackgroundTracking, isTrackingActive, showBatteryOptimizationBanner } from "../../lib/location-service";
import { AvatarCircle } from "../../components/AvatarCircle";
import { AvatarCropModal } from "../../components/AvatarCropModal";
import type { ThemeColors } from "../../lib/theme";
import type { DevicePublic, NotificationPreferences } from "../../lib/types";

function formatLastSeen(lastSeen: string | null): string {
  if (!lastSeen) return "Never";
  const diff = Date.now() - new Date(lastSeen).getTime();
  if (diff < 60_000) return "Just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

function platformIcon(platform: string): "phone-portrait" | "phone-landscape-outline" | "desktop-outline" {
  if (platform === "ios") return "phone-portrait";
  if (platform === "android") return "phone-landscape-outline";
  return "desktop-outline";
}

export default function SettingsScreen() {
  const { user, logout, serverUrl, setServerUrl, apiClient, updateUser, serverVersion, versionStatus } = useAuth();
  const appVersion = Constants.expoConfig?.version || "unknown";
  const { colors, mode, setTheme } = useTheme();
  const styles = createStyles(colors);
  const [trackingEnabled, setTrackingEnabled] = useState(false);
  const [editingServer, setEditingServer] = useState(false);
  const [serverInput, setServerInput] = useState(serverUrl || "");
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [cropImage, setCropImage] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);

  // Profile name editing
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(user?.name || "");

  // Device management
  const [devices, setDevices] = useState<DevicePublic[]>([]);
  const [devicesLoading, setDevicesLoading] = useState(false);
  const [editingDeviceId, setEditingDeviceId] = useState<string | null>(null);
  const [deviceNameInput, setDeviceNameInput] = useState("");

  // Notification preferences
  const [notifPrefs, setNotifPrefs] = useState<NotificationPreferences>({
    emailInvitations: true, emailGeofence: true,
    pushInvitations: true, pushGeofence: true, pushLocationSharing: true,
    quietHoursStart: null, quietHoursEnd: null,
  });
  const [notifLoading, setNotifLoading] = useState(false);

  // Export
  const [exporting, setExporting] = useState<string | null>(null);

  const loadDevices = useCallback(async () => {
    setDevicesLoading(true);
    try {
      const res = await apiClient.listDevices();
      if (res.success && res.data) {
        setDevices(res.data);
      }
    } catch {
      // silent
    } finally {
      setDevicesLoading(false);
    }
  }, [apiClient]);

  const loadNotifPrefs = useCallback(async () => {
    setNotifLoading(true);
    try {
      const res = await apiClient.getNotificationPreferences();
      if (res.success && res.data) setNotifPrefs(res.data);
    } catch { /* silent */ } finally { setNotifLoading(false); }
  }, [apiClient]);

  async function updateNotifPref(key: keyof NotificationPreferences, value: boolean | string | null) {
    const prev = { ...notifPrefs };
    setNotifPrefs((p) => ({ ...p, [key]: value }));
    try {
      const res = await apiClient.updateNotificationPreferences({ [key]: value });
      if (!res.success) { setNotifPrefs(prev); Alert.alert("Error", res.error || "Could not update preference"); }
    } catch { setNotifPrefs(prev); Alert.alert("Error", "Failed to update preference"); }
  }

  async function handleExport(device: DevicePublic, format: "gpx" | "csv") {
    setExporting(device.id);
    try {
      const url = apiClient.getExportUrl(device.id, format);
      const fileName = `${device.name.replace(/[^a-zA-Z0-9]/g, "_")}_export.${format}`;
      const token = apiClient.getAccessToken();
      const destFile = new File(Paths.cache, fileName);
      const downloaded = await File.downloadFileAsync(url, destFile, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(downloaded.uri, {
          mimeType: format === "gpx" ? "application/gpx+xml" : "text/csv",
          dialogTitle: `Share ${format.toUpperCase()} Export`,
        });
      } else {
        Alert.alert("Exported", `File saved to ${downloaded.uri}`);
      }
    } catch (err) {
      Alert.alert("Error", "Export failed");
    } finally {
      setExporting(null);
    }
  }

  useEffect(() => {
    isTrackingActive().then(setTrackingEnabled);
    getStoredValue("deviceId").then(setDeviceId);
    loadDevices();
    loadNotifPrefs();
  }, [loadDevices, loadNotifPrefs]);

  // Sync nameInput when user changes
  useEffect(() => {
    if (!editingName) {
      setNameInput(user?.name || "");
    }
  }, [user?.name, editingName]);

  async function pickAvatar() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 1,
    });
    if (!result.canceled && result.assets[0]) {
      setCropImage(result.assets[0].uri);
    }
  }

  async function handleAvatarCropped(base64: string) {
    setCropImage(null);
    setAvatarUploading(true);
    try {
      const res = await apiClient.uploadAvatar(base64);
      if (res.success && res.data) {
        updateUser({ avatar: res.data.avatar });
      } else {
        Alert.alert("Upload Failed", res.error || "Could not upload avatar");
      }
    } catch {
      Alert.alert("Error", "Failed to upload avatar");
    } finally {
      setAvatarUploading(false);
    }
  }

  async function handleRemoveAvatar() {
    Alert.alert("Remove Photo", "Remove your profile photo?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          setAvatarUploading(true);
          try {
            const res = await apiClient.deleteAvatar();
            if (res.success) updateUser({ avatar: null });
          } catch {
            // silent
          } finally {
            setAvatarUploading(false);
          }
        },
      },
    ]);
  }

  async function handleSaveName() {
    const trimmed = nameInput.trim();
    if (!trimmed) return;
    try {
      const res = await apiClient.updateSettings({ name: trimmed });
      if (res.success) {
        updateUser({ name: trimmed });
        setEditingName(false);
      } else {
        Alert.alert("Error", res.error || "Could not update name");
      }
    } catch {
      Alert.alert("Error", "Failed to update name");
    }
  }

  async function handleTrackingToggle(value: boolean) {
    setTrackingEnabled(value);
    if (value) {
      const started = await startBackgroundTracking();
      if (!started) {
        setTrackingEnabled(false);
        Alert.alert("Permission Required", "FindMe needs background location permission to share your location. Please enable it in Settings.");
      } else {
        showBatteryOptimizationBanner();
      }
    } else { await stopBackgroundTracking(); }
  }

  async function handleSaveServer() {
    if (serverInput.trim()) { await setServerUrl(serverInput.trim()); setEditingServer(false); }
  }

  // Device actions
  async function handleRenameDevice(id: string) {
    const trimmed = deviceNameInput.trim();
    if (!trimmed) return;
    try {
      const res = await apiClient.updateDevice(id, { name: trimmed });
      if (res.success) {
        setEditingDeviceId(null);
        setDeviceNameInput("");
        await loadDevices();
      } else {
        Alert.alert("Error", res.error || "Could not rename device");
      }
    } catch {
      Alert.alert("Error", "Failed to rename device");
    }
  }

  async function handleSetPrimary(id: string) {
    try {
      const res = await apiClient.updateDevice(id, { isPrimary: true });
      if (res.success) {
        await loadDevices();
      } else {
        Alert.alert("Error", res.error || "Could not set primary device");
      }
    } catch {
      Alert.alert("Error", "Failed to set primary device");
    }
  }

  function handleDeleteDevice(device: DevicePublic) {
    if (device.id === deviceId) {
      Alert.alert("Cannot Delete", "You cannot delete the device you are currently using.");
      return;
    }
    Alert.alert(
      "Delete Device",
      `Remove "${device.name}" from your account? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              const res = await apiClient.deleteDevice(device.id);
              if (res.success) {
                await loadDevices();
              } else {
                Alert.alert("Error", res.error || "Could not delete device");
              }
            } catch {
              Alert.alert("Error", "Failed to delete device");
            }
          },
        },
      ]
    );
  }

  function handleLogout() {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign Out", style: "destructive", onPress: logout },
    ]);
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>Settings</Text>
      </View>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {/* Account */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>ACCOUNT</Text>
          <View style={styles.card}>
            <View style={styles.accountRow}>
              <TouchableOpacity onPress={pickAvatar} style={styles.avatarWrap} disabled={avatarUploading}>
                {avatarUploading ? (
                  <View style={[styles.avatarPlaceholder, { backgroundColor: colors.surfaceLight }]}>
                    <ActivityIndicator size="small" color={colors.accent} />
                  </View>
                ) : (
                  <AvatarCircle name={user?.name ?? null} avatarUrl={user?.avatar} size={60} />
                )}
                <View style={styles.avatarBadge}>
                  <Ionicons name="camera" size={12} color="#fff" />
                </View>
              </TouchableOpacity>
              <View style={styles.accountInfo}>
                {editingName ? (
                  <View style={styles.nameEditRow}>
                    <TextInput
                      style={styles.nameInput}
                      value={nameInput}
                      onChangeText={setNameInput}
                      autoFocus
                      autoCapitalize="words"
                      autoCorrect={false}
                      placeholder="Your name"
                      placeholderTextColor={colors.textMuted}
                    />
                    <View style={styles.nameButtons}>
                      <TouchableOpacity onPress={() => { setEditingName(false); setNameInput(user?.name || ""); }} style={styles.nameCancelBtn}>
                        <Text style={styles.nameCancelText}>Cancel</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={handleSaveName} style={styles.nameSaveBtn}>
                        <Text style={styles.nameSaveText}>Save</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <TouchableOpacity onPress={() => setEditingName(true)} style={styles.nameRow}>
                    <Text style={styles.accountName}>{user?.name || "User"}</Text>
                    <Ionicons name="pencil" size={14} color={colors.textMuted} style={{ marginLeft: 6 }} />
                  </TouchableOpacity>
                )}
                <Text style={styles.accountEmail}>{user?.email || ""}</Text>
                <Text style={styles.accountRole}>{user?.role === "ADMIN" ? "Administrator" : "Member"}</Text>
                {user?.avatar && (
                  <TouchableOpacity onPress={handleRemoveAvatar}>
                    <Text style={styles.removeAvatar}>Remove photo</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </View>
        </View>

        {/* Devices */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>DEVICES</Text>
          {devicesLoading && devices.length === 0 ? (
            <View style={styles.card}>
              <ActivityIndicator size="small" color={colors.accent} />
            </View>
          ) : devices.length === 0 ? (
            <View style={styles.card}>
              <Text style={styles.settingHint}>No devices registered</Text>
            </View>
          ) : (
            devices.map((device) => {
              const isCurrentDevice = device.id === deviceId;
              const isEditingThis = editingDeviceId === device.id;
              return (
                <View key={device.id} style={[styles.deviceCard, isCurrentDevice && styles.deviceCardCurrent]}>
                  <View style={styles.deviceHeader}>
                    <Ionicons name={platformIcon(device.platform)} size={20} color={colors.textSecondary} />
                    <View style={styles.deviceInfo}>
                      {isEditingThis ? (
                        <View style={styles.deviceNameEditRow}>
                          <TextInput
                            style={styles.deviceNameInput}
                            value={deviceNameInput}
                            onChangeText={setDeviceNameInput}
                            autoFocus
                            autoCapitalize="words"
                            autoCorrect={false}
                            placeholder="Device name"
                            placeholderTextColor={colors.textMuted}
                          />
                          <View style={styles.nameButtons}>
                            <TouchableOpacity onPress={() => { setEditingDeviceId(null); setDeviceNameInput(""); }} style={styles.nameCancelBtn}>
                              <Text style={styles.nameCancelText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => handleRenameDevice(device.id)} style={styles.nameSaveBtn}>
                              <Text style={styles.nameSaveText}>Save</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      ) : (
                        <TouchableOpacity
                          onPress={() => { setEditingDeviceId(device.id); setDeviceNameInput(device.name); }}
                          style={styles.deviceNameRow}
                        >
                          <Text style={styles.deviceName}>{device.name}</Text>
                          <Ionicons name="pencil" size={12} color={colors.textMuted} style={{ marginLeft: 4 }} />
                        </TouchableOpacity>
                      )}
                      <View style={styles.deviceBadges}>
                        {isCurrentDevice && (
                          <View style={[styles.badge, { backgroundColor: colors.accent }]}>
                            <Text style={styles.badgeText}>This device</Text>
                          </View>
                        )}
                        {device.isPrimary && (
                          <View style={[styles.badge, { backgroundColor: colors.success }]}>
                            <Text style={styles.badgeText}>Primary</Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.deviceMeta}>Last seen: {formatLastSeen(device.lastSeen)}{device.appVersion ? ` · v${device.appVersion}` : ""}</Text>
                    </View>
                  </View>
                  {!isEditingThis && (
                    <View style={styles.deviceActions}>
                      {!device.isPrimary && (
                        <TouchableOpacity onPress={() => handleSetPrimary(device.id)} style={styles.deviceActionBtn}>
                          <Ionicons name="star-outline" size={16} color={colors.accent} />
                          <Text style={[styles.deviceActionText, { color: colors.accent }]}>Set primary</Text>
                        </TouchableOpacity>
                      )}
                      {!isCurrentDevice && (
                        <TouchableOpacity onPress={() => handleDeleteDevice(device)} style={styles.deviceActionBtn}>
                          <Ionicons name="trash-outline" size={16} color={colors.error} />
                          <Text style={[styles.deviceActionText, { color: colors.error }]}>Remove</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  )}
                </View>
              );
            })
          )}
        </View>

        {/* Appearance */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>APPEARANCE</Text>
          <View style={styles.card}>
            <Text style={[styles.settingLabel, { marginBottom: 12 }]}>Theme</Text>
            <View style={styles.themeOptions}>
              {([
                { key: "system" as const, label: "Auto", icon: "contrast" as const },
                { key: "light" as const, label: "Light", icon: "sunny" as const },
                { key: "dark" as const, label: "Dark", icon: "moon" as const },
              ]).map((opt) => (
                <TouchableOpacity
                  key={opt.key}
                  style={[styles.themeOption, mode === opt.key && styles.themeOptionActive]}
                  onPress={() => setTheme(opt.key)}
                >
                  <Ionicons name={opt.icon} size={18} color={mode === opt.key ? "#fff" : colors.textSecondary} />
                  <Text style={[styles.themeOptionText, mode === opt.key && styles.themeOptionTextActive]}>{opt.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>

        {/* Location */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>LOCATION</Text>
          <View style={styles.card}>
            <View style={styles.settingRow}>
              <View style={styles.settingLeft}>
                <Ionicons name="location" size={20} color={trackingEnabled ? colors.success : colors.textMuted} />
                <Text style={styles.settingLabel}>Background Tracking</Text>
              </View>
              <Switch value={trackingEnabled} onValueChange={handleTrackingToggle} trackColor={{ false: colors.surfaceLight, true: colors.accent }} thumbColor="#fff" />
            </View>
            <Text style={styles.settingHint}>{trackingEnabled ? "Your location is being shared" : "Location sharing is paused"}</Text>
          </View>
        </View>

        {/* Notifications */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>NOTIFICATIONS</Text>
          <View style={styles.card}>
            {notifLoading ? (
              <ActivityIndicator size="small" color={colors.accent} />
            ) : (
              <>
                <Text style={[styles.settingLabel, { marginBottom: 8, fontWeight: "700" }]}>Email</Text>
                <View style={styles.settingRow}>
                  <Text style={styles.settingLabel}>Invitations</Text>
                  <Switch value={notifPrefs.emailInvitations} onValueChange={(v) => updateNotifPref("emailInvitations", v)} trackColor={{ false: colors.surfaceLight, true: colors.accent }} thumbColor="#fff" />
                </View>
                <View style={[styles.settingRow, { marginTop: 8 }]}>
                  <Text style={styles.settingLabel}>Geofence Alerts</Text>
                  <Switch value={notifPrefs.emailGeofence} onValueChange={(v) => updateNotifPref("emailGeofence", v)} trackColor={{ false: colors.surfaceLight, true: colors.accent }} thumbColor="#fff" />
                </View>

                <View style={{ height: 1, backgroundColor: colors.surfaceLight, marginVertical: 14 }} />

                <Text style={[styles.settingLabel, { marginBottom: 8, fontWeight: "700" }]}>Push</Text>
                <View style={styles.settingRow}>
                  <Text style={styles.settingLabel}>Invitations</Text>
                  <Switch value={notifPrefs.pushInvitations} onValueChange={(v) => updateNotifPref("pushInvitations", v)} trackColor={{ false: colors.surfaceLight, true: colors.accent }} thumbColor="#fff" />
                </View>
                <View style={[styles.settingRow, { marginTop: 8 }]}>
                  <Text style={styles.settingLabel}>Geofence Alerts</Text>
                  <Switch value={notifPrefs.pushGeofence} onValueChange={(v) => updateNotifPref("pushGeofence", v)} trackColor={{ false: colors.surfaceLight, true: colors.accent }} thumbColor="#fff" />
                </View>
                <View style={[styles.settingRow, { marginTop: 8 }]}>
                  <Text style={styles.settingLabel}>Location Sharing</Text>
                  <Switch value={notifPrefs.pushLocationSharing} onValueChange={(v) => updateNotifPref("pushLocationSharing", v)} trackColor={{ false: colors.surfaceLight, true: colors.accent }} thumbColor="#fff" />
                </View>

                <View style={{ height: 1, backgroundColor: colors.surfaceLight, marginVertical: 14 }} />

                <Text style={[styles.settingLabel, { marginBottom: 8, fontWeight: "700" }]}>Quiet Hours</Text>
                <Text style={styles.settingHint}>No push notifications during these hours</Text>
                <View style={[styles.settingRow, { marginTop: 8 }]}>
                  <TextInput
                    style={[styles.serverInput, { flex: 1, textAlign: "center" }]}
                    value={notifPrefs.quietHoursStart || ""}
                    onChangeText={(v) => setNotifPrefs((p) => ({ ...p, quietHoursStart: v || null }))}
                    onEndEditing={() => {
                      if (notifPrefs.quietHoursStart && /^\d{2}:\d{2}$/.test(notifPrefs.quietHoursStart)) {
                        updateNotifPref("quietHoursStart", notifPrefs.quietHoursStart);
                      }
                    }}
                    placeholder="22:00"
                    placeholderTextColor={colors.textMuted}
                    keyboardType="numbers-and-punctuation"
                    maxLength={5}
                  />
                  <Text style={[styles.settingLabel, { marginHorizontal: 8 }]}>to</Text>
                  <TextInput
                    style={[styles.serverInput, { flex: 1, textAlign: "center" }]}
                    value={notifPrefs.quietHoursEnd || ""}
                    onChangeText={(v) => setNotifPrefs((p) => ({ ...p, quietHoursEnd: v || null }))}
                    onEndEditing={() => {
                      if (notifPrefs.quietHoursEnd && /^\d{2}:\d{2}$/.test(notifPrefs.quietHoursEnd)) {
                        updateNotifPref("quietHoursEnd", notifPrefs.quietHoursEnd);
                      }
                    }}
                    placeholder="07:00"
                    placeholderTextColor={colors.textMuted}
                    keyboardType="numbers-and-punctuation"
                    maxLength={5}
                  />
                </View>
                {(notifPrefs.quietHoursStart || notifPrefs.quietHoursEnd) && (
                  <TouchableOpacity
                    style={{ marginTop: 8 }}
                    onPress={() => {
                      setNotifPrefs((p) => ({ ...p, quietHoursStart: null, quietHoursEnd: null }));
                      apiClient.updateNotificationPreferences({ quietHoursStart: null, quietHoursEnd: null });
                    }}
                  >
                    <Text style={{ color: colors.error, fontSize: 13, fontWeight: "600" }}>Clear quiet hours</Text>
                  </TouchableOpacity>
                )}
              </>
            )}
          </View>
        </View>

        {/* Export Data */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>EXPORT DATA</Text>
          {devices.length === 0 ? (
            <View style={styles.card}>
              <Text style={styles.settingHint}>No devices to export from</Text>
            </View>
          ) : (
            devices.map((device) => (
              <View key={device.id} style={[styles.card, { marginBottom: 8 }]}>
                <Text style={[styles.settingLabel, { fontWeight: "600", marginBottom: 8 }]}>{device.name}</Text>
                <View style={{ flexDirection: "row", gap: 10 }}>
                  <TouchableOpacity
                    style={[styles.nameSaveBtn, { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10 }]}
                    onPress={() => handleExport(device, "gpx")}
                    disabled={exporting === device.id}
                  >
                    {exporting === device.id ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <>
                        <Ionicons name="download-outline" size={16} color="#fff" />
                        <Text style={styles.nameSaveText}>GPX</Text>
                      </>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.nameSaveBtn, { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10 }]}
                    onPress={() => handleExport(device, "csv")}
                    disabled={exporting === device.id}
                  >
                    {exporting === device.id ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <>
                        <Ionicons name="download-outline" size={16} color="#fff" />
                        <Text style={styles.nameSaveText}>CSV</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
                <Text style={styles.settingHint}>Export all location history</Text>
              </View>
            ))
          )}
        </View>

        {/* Server */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>SERVER</Text>
          <View style={styles.card}>
            {editingServer ? (
              <View style={styles.serverEdit}>
                <TextInput style={styles.serverInput} value={serverInput} onChangeText={setServerInput} autoCapitalize="none" autoCorrect={false} keyboardType="url" placeholder="http://..." placeholderTextColor={colors.textMuted} />
                <View style={styles.serverButtons}>
                  <TouchableOpacity onPress={() => { setEditingServer(false); setServerInput(serverUrl || ""); }} style={styles.serverCancelBtn}>
                    <Text style={styles.serverCancelText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={handleSaveServer} style={styles.serverSaveBtn}>
                    <Text style={styles.serverSaveText}>Save</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <TouchableOpacity style={styles.settingRow} onPress={() => setEditingServer(true)}>
                <Text style={styles.settingLabel}>Server URL</Text>
                <View style={styles.settingRight}>
                  <Text style={styles.settingValue} numberOfLines={1}>{serverUrl || "Not set"}</Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                </View>
              </TouchableOpacity>
            )}
          </View>
          <View style={[styles.card, { marginTop: 8 }]}>
            <View style={styles.settingRow}>
              <Text style={styles.settingLabel}>App Version</Text>
              <Text style={styles.settingValue}>{appVersion}</Text>
            </View>
            <View style={[styles.settingRow, { marginTop: 10 }]}>
              <Text style={styles.settingLabel}>Server Version</Text>
              <View style={styles.settingRight}>
                <Text style={styles.settingValue}>{serverVersion || "—"}</Text>
                {versionStatus !== "match" && (
                  <Ionicons name="warning" size={16} color="#f59e0b" />
                )}
              </View>
            </View>
            {versionStatus === "app-outdated" && (
              <Text style={[styles.settingHint, { color: "#f59e0b" }]}>
                App is outdated — please update to match the server
              </Text>
            )}
            {versionStatus === "server-outdated" && (
              <Text style={[styles.settingHint, { color: "#f59e0b" }]}>
                Server is running an older version than this app
              </Text>
            )}
          </View>
        </View>

        {/* Sign out — pushed to bottom */}
        <View style={styles.logoutSection}>
          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
            <Ionicons name="log-out-outline" size={20} color={colors.error} />
            <Text style={styles.logoutText}>Sign Out</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {cropImage && (
        <AvatarCropModal
          imageUri={cropImage}
          visible={!!cropImage}
          onConfirm={(base64) => handleAvatarCropped(`data:image/jpeg;base64,${base64}`)}
          onCancel={() => setCropImage(null)}
        />
      )}
    </SafeAreaView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: { paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: colors.surfaceLight },
    title: { fontSize: 28, fontWeight: "800", color: colors.textPrimary },
    scroll: { flex: 1 },
    scrollContent: { flexGrow: 1, paddingBottom: 16 },
    section: { paddingHorizontal: 20, paddingTop: 24 },
    sectionTitle: { fontSize: 13, fontWeight: "700", color: colors.textMuted, letterSpacing: 0.5, marginBottom: 8 },
    card: { backgroundColor: colors.surface, borderRadius: 14, padding: 16 },
    accountRow: { flexDirection: "row", alignItems: "center" },
    avatarWrap: { position: "relative" },
    avatarPlaceholder: { width: 60, height: 60, borderRadius: 30, alignItems: "center", justifyContent: "center" },
    avatarBadge: { position: "absolute", bottom: 0, right: -2, width: 22, height: 22, borderRadius: 11, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: colors.surface },
    removeAvatar: { fontSize: 12, color: colors.error, marginTop: 4 },
    accountInfo: { marginLeft: 14, flex: 1 },
    nameRow: { flexDirection: "row", alignItems: "center" },
    accountName: { fontSize: 18, fontWeight: "700", color: colors.textPrimary },
    accountEmail: { fontSize: 14, color: colors.textSecondary, marginTop: 2 },
    accountRole: { fontSize: 12, color: colors.accent, fontWeight: "600", marginTop: 4 },
    nameEditRow: { gap: 8 },
    nameInput: { backgroundColor: colors.surfaceLight, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 16, color: colors.textPrimary, borderWidth: 1, borderColor: colors.border },
    nameButtons: { flexDirection: "row", gap: 8, justifyContent: "flex-end" },
    nameCancelBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 },
    nameCancelText: { color: colors.textSecondary, fontWeight: "600", fontSize: 13 },
    nameSaveBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, backgroundColor: colors.accent },
    nameSaveText: { color: "#fff", fontWeight: "600", fontSize: 13 },
    // Device styles
    deviceCard: { backgroundColor: colors.surface, borderRadius: 14, padding: 16, marginBottom: 8 },
    deviceCardCurrent: { borderWidth: 1, borderColor: colors.accent + "40" },
    deviceHeader: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
    deviceInfo: { flex: 1 },
    deviceNameRow: { flexDirection: "row", alignItems: "center" },
    deviceName: { fontSize: 16, fontWeight: "600", color: colors.textPrimary },
    deviceNameEditRow: { gap: 8 },
    deviceNameInput: { backgroundColor: colors.surfaceLight, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 15, color: colors.textPrimary, borderWidth: 1, borderColor: colors.border },
    deviceBadges: { flexDirection: "row", gap: 6, marginTop: 4 },
    badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
    badgeText: { fontSize: 11, fontWeight: "700", color: "#fff" },
    deviceMeta: { fontSize: 13, color: colors.textMuted, marginTop: 4 },
    deviceActions: { flexDirection: "row", gap: 16, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.surfaceLight },
    deviceActionBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
    deviceActionText: { fontSize: 13, fontWeight: "600" },
    // Existing styles
    settingRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    settingLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
    settingLabel: { fontSize: 16, color: colors.textPrimary },
    settingRight: { flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 1 },
    settingValue: { fontSize: 14, color: colors.textSecondary, maxWidth: 200 },
    settingHint: { fontSize: 13, color: colors.textMuted, marginTop: 10 },
    serverEdit: { gap: 12 },
    serverInput: { backgroundColor: colors.surfaceLight, borderRadius: 10, padding: 14, fontSize: 15, color: colors.textPrimary, borderWidth: 1, borderColor: colors.border },
    serverButtons: { flexDirection: "row", gap: 10, justifyContent: "flex-end" },
    serverCancelBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 },
    serverCancelText: { color: colors.textSecondary, fontWeight: "600" },
    serverSaveBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, backgroundColor: colors.accent },
    serverSaveText: { color: "#fff", fontWeight: "600" },
    themeOptions: { flexDirection: "row", gap: 8 },
    themeOption: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: 10, backgroundColor: colors.surfaceLight },
    themeOptionActive: { backgroundColor: colors.accent },
    themeOptionText: { fontSize: 14, fontWeight: "600", color: colors.textSecondary },
    themeOptionTextActive: { color: "#fff" },
    logoutSection: { paddingHorizontal: 20, paddingTop: 24, marginTop: "auto" },
    logoutButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: colors.surface, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: "rgba(239, 68, 68, 0.3)" },
    logoutText: { color: colors.error, fontSize: 16, fontWeight: "600" },
  });
}
