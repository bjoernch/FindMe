import { useState, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl,
  Alert, Share,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../../lib/auth-context";
import { useTheme } from "../../lib/theme-context";
import { usePolling } from "../../lib/use-polling";
import type { ThemeColors } from "../../lib/theme";
import type { ShareLink, ShareExpiry } from "../../lib/types";

const EXPIRY_OPTIONS: { label: string; value: ShareExpiry }[] = [
  { label: "1 hour", value: "1h" },
  { label: "24 hours", value: "24h" },
  { label: "7 days", value: "7d" },
  { label: "Never", value: "never" },
];

function formatExpiry(expiresAt: string | null): string {
  if (!expiresAt) return "Never expires";
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) return "Expired";
  if (diff < 3_600_000) return `${Math.ceil(diff / 60_000)}m left`;
  if (diff < 86_400_000) return `${Math.ceil(diff / 3_600_000)}h left`;
  return `${Math.ceil(diff / 86_400_000)}d left`;
}

function isExpired(link: ShareLink): boolean {
  if (!link.expiresAt) return false;
  return new Date(link.expiresAt).getTime() <= Date.now();
}

export default function SharingScreen() {
  const { apiClient, serverUrl } = useAuth();
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const [refreshing, setRefreshing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [selectedExpiry, setSelectedExpiry] = useState<ShareExpiry>("24h");
  const [showExpiryPicker, setShowExpiryPicker] = useState(false);

  const fetchLinks = useCallback(
    () => apiClient.getShareLinks().then((r) => r.data ?? []),
    [apiClient]
  );
  const { data: links, refetch } = usePolling<ShareLink[]>(fetchLinks, 30000);

  async function handleRefresh() {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }

  async function handleCreate() {
    setCreating(true);
    try {
      const result = await apiClient.createShareLink(selectedExpiry);
      if (result.success && result.data) {
        await refetch();
        const url = `${serverUrl}/share/${result.data.shareToken}`;
        await Share.share({ message: url });
      } else {
        Alert.alert("Error", result.error || "Failed to create share link");
      }
    } catch {
      Alert.alert("Error", "Failed to create share link");
    } finally {
      setCreating(false);
    }
  }

  async function handleShare(link: ShareLink) {
    const url = `${serverUrl}/share/${link.shareToken}`;
    await Share.share({ message: url });
  }

  async function handleRevoke(link: ShareLink) {
    Alert.alert("Revoke Link", "This will permanently disable this share link.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Revoke",
        style: "destructive",
        onPress: async () => {
          await apiClient.revokeShareLink(link.id);
          await refetch();
        },
      },
    ]);
  }

  const activeLinks = (links ?? []).filter((l) => l.isActive && !isExpired(l));
  const inactiveLinks = (links ?? []).filter((l) => !l.isActive || isExpired(l));

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>Share Links</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.accent} />}
      >
        {/* Create section */}
        <View style={styles.createSection}>
          <Text style={styles.sectionLabel}>Create a temporary link to share your location</Text>
          <View style={styles.createRow}>
            <TouchableOpacity
              style={styles.expiryButton}
              onPress={() => setShowExpiryPicker(!showExpiryPicker)}
            >
              <Ionicons name="time-outline" size={18} color={colors.textSecondary} />
              <Text style={styles.expiryText}>
                {EXPIRY_OPTIONS.find((o) => o.value === selectedExpiry)?.label}
              </Text>
              <Ionicons name="chevron-down" size={16} color={colors.textSecondary} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.createButton, creating && styles.createButtonDisabled]}
              onPress={handleCreate}
              disabled={creating}
            >
              <Ionicons name="add" size={20} color="#fff" />
              <Text style={styles.createButtonText}>{creating ? "Creating..." : "Create"}</Text>
            </TouchableOpacity>
          </View>
          {showExpiryPicker && (
            <View style={styles.expiryPicker}>
              {EXPIRY_OPTIONS.map((opt) => (
                <TouchableOpacity
                  key={opt.value}
                  style={[styles.expiryOption, selectedExpiry === opt.value && styles.expiryOptionActive]}
                  onPress={() => { setSelectedExpiry(opt.value); setShowExpiryPicker(false); }}
                >
                  <Text style={[styles.expiryOptionText, selectedExpiry === opt.value && styles.expiryOptionTextActive]}>
                    {opt.label}
                  </Text>
                  {selectedExpiry === opt.value && <Ionicons name="checkmark" size={18} color={colors.accent} />}
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {/* Active links */}
        {activeLinks.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Active Links</Text>
            {activeLinks.map((link) => (
              <View key={link.id} style={styles.linkCard}>
                <View style={styles.linkInfo}>
                  <View style={styles.linkHeader}>
                    <View style={[styles.statusBadge, styles.statusActive]}>
                      <Text style={styles.statusBadgeText}>Active</Text>
                    </View>
                    <Text style={styles.linkExpiry}>{formatExpiry(link.expiresAt)}</Text>
                  </View>
                  <Text style={styles.linkToken} numberOfLines={1}>
                    {serverUrl}/share/{link.shareToken.slice(0, 8)}...
                  </Text>
                  <Text style={styles.linkDate}>
                    Created {new Date(link.createdAt).toLocaleDateString()}
                  </Text>
                </View>
                <View style={styles.linkActions}>
                  <TouchableOpacity style={styles.actionButton} onPress={() => handleShare(link)}>
                    <Ionicons name="share-outline" size={20} color={colors.accent} />
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.actionButton} onPress={() => handleRevoke(link)}>
                    <Ionicons name="trash-outline" size={20} color={colors.error} />
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Inactive / expired */}
        {inactiveLinks.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Expired / Revoked</Text>
            {inactiveLinks.map((link) => (
              <View key={link.id} style={[styles.linkCard, styles.linkCardInactive]}>
                <View style={styles.linkInfo}>
                  <View style={styles.linkHeader}>
                    <View style={[styles.statusBadge, styles.statusInactive]}>
                      <Text style={styles.statusBadgeText}>{isExpired(link) ? "Expired" : "Revoked"}</Text>
                    </View>
                  </View>
                  <Text style={[styles.linkToken, styles.linkTokenInactive]} numberOfLines={1}>
                    {serverUrl}/share/{link.shareToken.slice(0, 8)}...
                  </Text>
                  <Text style={styles.linkDate}>
                    Created {new Date(link.createdAt).toLocaleDateString()}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {(!links || links.length === 0) && (
          <View style={styles.empty}>
            <Ionicons name="link-outline" size={64} color={colors.textMuted} />
            <Text style={styles.emptyTitle}>No share links yet</Text>
            <Text style={styles.emptyText}>
              Create a temporary link to let anyone see your location without an account
            </Text>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      flexDirection: "row", justifyContent: "space-between", alignItems: "center",
      paddingHorizontal: 20, paddingVertical: 16,
      borderBottomWidth: 1, borderBottomColor: colors.surfaceLight,
    },
    title: { fontSize: 28, fontWeight: "800", color: colors.textPrimary },
    scroll: { flex: 1 },
    createSection: { paddingHorizontal: 20, paddingTop: 20 },
    sectionLabel: { fontSize: 14, color: colors.textSecondary, marginBottom: 12 },
    createRow: { flexDirection: "row", gap: 10 },
    expiryButton: {
      flex: 1, flexDirection: "row", alignItems: "center", gap: 6,
      backgroundColor: colors.surface, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
    },
    expiryText: { flex: 1, fontSize: 15, color: colors.textPrimary, fontWeight: "500" },
    createButton: {
      flexDirection: "row", alignItems: "center", gap: 6,
      backgroundColor: colors.accent, borderRadius: 10, paddingHorizontal: 18, paddingVertical: 12,
    },
    createButtonDisabled: { opacity: 0.6 },
    createButtonText: { color: "#fff", fontWeight: "700", fontSize: 15 },
    expiryPicker: {
      backgroundColor: colors.surface, borderRadius: 12, marginTop: 8, overflow: "hidden",
    },
    expiryOption: {
      flexDirection: "row", justifyContent: "space-between", alignItems: "center",
      paddingVertical: 12, paddingHorizontal: 16,
    },
    expiryOptionActive: { backgroundColor: colors.surfaceLight },
    expiryOptionText: { fontSize: 15, color: colors.textPrimary },
    expiryOptionTextActive: { fontWeight: "700", color: colors.accent },
    section: { paddingHorizontal: 20, paddingTop: 24 },
    sectionTitle: { fontSize: 16, fontWeight: "700", color: colors.textPrimary, marginBottom: 12 },
    linkCard: {
      flexDirection: "row", alignItems: "center",
      backgroundColor: colors.surface, borderRadius: 14, padding: 14, marginBottom: 8,
    },
    linkCardInactive: { opacity: 0.5 },
    linkInfo: { flex: 1 },
    linkHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
    statusBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
    statusActive: { backgroundColor: "rgba(34, 197, 94, 0.15)" },
    statusInactive: { backgroundColor: "rgba(107, 114, 128, 0.15)" },
    statusBadgeText: { fontSize: 11, fontWeight: "700", color: colors.textSecondary },
    linkExpiry: { fontSize: 12, color: colors.textSecondary },
    linkToken: { fontSize: 13, color: colors.textSecondary, marginBottom: 2 },
    linkTokenInactive: { color: colors.textMuted },
    linkDate: { fontSize: 12, color: colors.textMuted },
    linkActions: { flexDirection: "row", gap: 8 },
    actionButton: { padding: 8 },
    empty: { alignItems: "center", paddingTop: 80, paddingHorizontal: 40, gap: 12 },
    emptyTitle: { fontSize: 20, fontWeight: "700", color: colors.textPrimary },
    emptyText: { fontSize: 15, color: colors.textSecondary, textAlign: "center", lineHeight: 22 },
  });
}
