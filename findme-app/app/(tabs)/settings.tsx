import { useState, useEffect } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Switch, Alert, ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { useAuth } from "../../lib/auth-context";
import { useTheme } from "../../lib/theme-context";
import { getStoredValue } from "../../lib/storage";
import { startBackgroundTracking, stopBackgroundTracking, isTrackingActive, showBatteryOptimizationBanner } from "../../lib/location-service";
import { AvatarCircle } from "../../components/AvatarCircle";
import { AvatarCropModal } from "../../components/AvatarCropModal";
import type { ThemeColors } from "../../lib/theme";

export default function SettingsScreen() {
  const { user, logout, serverUrl, setServerUrl, apiClient, updateUser } = useAuth();
  const { colors, mode, setTheme } = useTheme();
  const styles = createStyles(colors);
  const [trackingEnabled, setTrackingEnabled] = useState(false);
  const [editingServer, setEditingServer] = useState(false);
  const [serverInput, setServerInput] = useState(serverUrl || "");
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [cropImage, setCropImage] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);

  useEffect(() => {
    isTrackingActive().then(setTrackingEnabled);
    getStoredValue("deviceId").then(setDeviceId);
  }, []);

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
                <Text style={styles.accountName}>{user?.name || "User"}</Text>
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

        {/* Device */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>THIS DEVICE</Text>
          <View style={styles.card}>
            <View style={styles.settingRow}>
              <Text style={styles.settingLabel}>Device ID</Text>
              <Text style={styles.settingValue}>{deviceId ? `${deviceId.substring(0, 8)}...` : "Not registered"}</Text>
            </View>
          </View>
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
    accountName: { fontSize: 18, fontWeight: "700", color: colors.textPrimary },
    accountEmail: { fontSize: 14, color: colors.textSecondary, marginTop: 2 },
    accountRole: { fontSize: 12, color: colors.accent, fontWeight: "600", marginTop: 4 },
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
