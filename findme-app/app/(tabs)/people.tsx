import { useState, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useAuth } from "../../lib/auth-context";
import { useTheme } from "../../lib/theme-context";
import { usePolling } from "../../lib/use-polling";
import { AvatarCircle } from "../../components/AvatarCircle";
import { InviteModal } from "../../components/InviteModal";
import { PendingInvitations } from "../../components/PendingInvitations";
import type { ThemeColors } from "../../lib/theme";
import type { PersonWithDevices, PeopleSharePublic } from "../../lib/types";

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

function getPersonLastSeen(person: PersonWithDevices): string | null {
  let latest: string | null = null;
  for (const d of person.devices) {
    if (d.lastSeen && (!latest || d.lastSeen > latest)) latest = d.lastSeen;
  }
  return latest;
}

export default function PeopleScreen() {
  const { apiClient } = useAuth();
  const { colors } = useTheme();
  const router = useRouter();
  const styles = createStyles(colors);
  const [showInvite, setShowInvite] = useState(false);
  const [showPending, setShowPending] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const fetchPeople = useCallback(() => apiClient.getPeople().then((r) => r.data ?? []), [apiClient]);
  const fetchPending = useCallback(() => apiClient.getPendingInvitations().then((r) => r.data ?? []), [apiClient]);

  const { data: people, refetch: refetchPeople } = usePolling<PersonWithDevices[]>(fetchPeople, 30000);
  const { data: pending, refetch: refetchPending } = usePolling<PeopleSharePublic[]>(fetchPending, 30000);

  async function handleRefresh() {
    setRefreshing(true);
    await Promise.all([refetchPeople(), refetchPending()]);
    setRefreshing(false);
  }

  function handleResponded() { refetchPeople(); refetchPending(); }

  const pendingCount = pending?.length ?? 0;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>People</Text>
        <TouchableOpacity style={styles.inviteButton} onPress={() => setShowInvite(true)}>
          <Ionicons name="person-add" size={20} color="#fff" />
          <Text style={styles.inviteButtonText}>Invite</Text>
        </TouchableOpacity>
      </View>
      <ScrollView style={styles.scroll} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.accent} />}>
        {pendingCount > 0 && (
          <TouchableOpacity style={styles.pendingBanner} onPress={() => setShowPending(true)}>
            <View style={styles.pendingLeft}>
              <Ionicons name="mail-unread" size={20} color={colors.warning} />
              <Text style={styles.pendingText}>{pendingCount} pending invitation{pendingCount !== 1 ? "s" : ""}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
        )}
        {!people || people.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="people-outline" size={64} color={colors.textMuted} />
            <Text style={styles.emptyTitle}>No contacts yet</Text>
            <Text style={styles.emptyText}>Invite family and friends to share locations with each other</Text>
          </View>
        ) : (
          <View style={styles.contactList}>
            {people.map((person) => {
              const lastSeen = getPersonLastSeen(person);
              const online = isOnline(lastSeen);
              const devicesWithLoc = person.devices.filter((d) => d.latestLocation);
              const deviceCount = devicesWithLoc.length;
              const hasLocation = deviceCount > 0;

              function handlePress() {
                if (!hasLocation) return;
                // Find the most recent device location
                const mostRecent = devicesWithLoc.reduce((a, b) => {
                  const aTime = new Date(a.latestLocation!.timestamp).getTime();
                  const bTime = new Date(b.latestLocation!.timestamp).getTime();
                  return bTime > aTime ? b : a;
                });
                const loc = mostRecent.latestLocation!;
                router.push({ pathname: "/", params: { focusLat: String(loc.lat), focusLng: String(loc.lng) } });
              }

              return (
                <TouchableOpacity
                  key={person.user.id}
                  style={styles.contactCard}
                  onPress={handlePress}
                  activeOpacity={hasLocation ? 0.6 : 1}
                >
                  <AvatarCircle name={person.user.name} size={48} showOnline isOnline={online} />
                  <View style={styles.contactInfo}>
                    <Text style={styles.contactName}>{person.user.name || person.user.email}</Text>
                    <Text style={styles.contactMeta}>{online ? "Online" : formatLastSeen(lastSeen)}{deviceCount > 0 && ` · ${deviceCount} device${deviceCount !== 1 ? "s" : ""}`}</Text>
                  </View>
                  {hasLocation ? (
                    <Ionicons name="navigate" size={18} color={colors.accent} />
                  ) : (
                    <View style={[styles.statusDot, { backgroundColor: online ? colors.onlineGreen : colors.offlineGray }]} />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </ScrollView>
      <InviteModal visible={showInvite} onClose={() => setShowInvite(false)} onInvited={() => { refetchPeople(); refetchPending(); }} />
      <PendingInvitations visible={showPending} onClose={() => setShowPending(false)} invitations={pending ?? []} onResponded={handleResponded} />
    </SafeAreaView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: colors.surfaceLight },
    title: { fontSize: 28, fontWeight: "800", color: colors.textPrimary },
    inviteButton: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.accent, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10 },
    inviteButtonText: { color: "#fff", fontWeight: "700", fontSize: 15 },
    scroll: { flex: 1 },
    pendingBanner: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: "rgba(234, 179, 8, 0.1)", borderWidth: 1, borderColor: "rgba(234, 179, 8, 0.3)", marginHorizontal: 20, marginTop: 16, padding: 14, borderRadius: 12 },
    pendingLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
    pendingText: { color: colors.warning, fontWeight: "600", fontSize: 15 },
    empty: { alignItems: "center", justifyContent: "center", paddingTop: 80, paddingHorizontal: 40, gap: 12 },
    emptyTitle: { fontSize: 20, fontWeight: "700", color: colors.textPrimary },
    emptyText: { fontSize: 15, color: colors.textSecondary, textAlign: "center", lineHeight: 22 },
    contactList: { paddingHorizontal: 20, paddingTop: 16, gap: 4 },
    contactCard: { flexDirection: "row", alignItems: "center", backgroundColor: colors.surface, borderRadius: 14, padding: 14, marginBottom: 8 },
    contactInfo: { flex: 1, marginLeft: 14 },
    contactName: { fontSize: 16, fontWeight: "600", color: colors.textPrimary },
    contactMeta: { fontSize: 13, color: colors.textSecondary, marginTop: 3 },
    statusDot: { width: 10, height: 10, borderRadius: 5 },
  });
}
