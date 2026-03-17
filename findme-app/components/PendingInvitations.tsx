import { useState } from "react";
import {
  View, Text, TouchableOpacity, Modal, StyleSheet, ScrollView, ActivityIndicator, Pressable,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../lib/theme-context";
import { useAuth } from "../lib/auth-context";
import { AvatarCircle } from "./AvatarCircle";
import type { PeopleSharePublic } from "../lib/types";
import type { ThemeColors } from "../lib/theme";

interface PendingInvitationsProps {
  visible: boolean;
  onClose: () => void;
  invitations: PeopleSharePublic[];
  onResponded: () => void;
}

export function PendingInvitations({ visible, onClose, invitations, onResponded }: PendingInvitationsProps) {
  const { apiClient } = useAuth();
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const [respondingId, setRespondingId] = useState<string | null>(null);

  async function handleRespond(shareId: string, action: "accept" | "decline", shareBack?: boolean) {
    setRespondingId(shareId);
    await apiClient.respondToInvitation(shareId, action, shareBack);
    setRespondingId(null);
    onResponded();
  }

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.overlay} pointerEvents="box-none">
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.title}>Pending Invitations</Text>
            <TouchableOpacity onPress={onClose}><Text style={styles.closeText}>Done</Text></TouchableOpacity>
          </View>
          <ScrollView style={styles.list}>
            {invitations.length === 0 ? (
              <Text style={styles.emptyText}>No pending invitations</Text>
            ) : (
              invitations.map((inv) => (
                <View key={inv.id} style={styles.card}>
                  <View style={styles.cardHeader}>
                    <AvatarCircle name={inv.fromUser?.name ?? null} size={44} />
                    <View style={styles.info}>
                      <Text style={styles.name}>{inv.fromUser?.name || "Unknown"}</Text>
                      <Text style={styles.email}>{inv.fromUser?.email || ""}</Text>
                    </View>
                  </View>
                  <Text style={styles.description}>
                    wants to share their location with you
                  </Text>
                  {respondingId === inv.id ? (
                    <ActivityIndicator size="small" color={colors.accent} style={{ paddingVertical: 12 }} />
                  ) : (
                    <View style={styles.actions}>
                      <TouchableOpacity
                        style={styles.acceptShareButton}
                        onPress={() => handleRespond(inv.id, "accept", true)}
                      >
                        <Ionicons name="swap-horizontal" size={16} color="#fff" />
                        <Text style={styles.acceptShareText}>Accept & Share Back</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.acceptOnlyButton}
                        onPress={() => handleRespond(inv.id, "accept", false)}
                      >
                        <Ionicons name="eye-outline" size={16} color={colors.accent} />
                        <Text style={styles.acceptOnlyText}>View Only</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.declineButton}
                        onPress={() => handleRespond(inv.id, "decline")}
                      >
                        <Text style={styles.declineText}>Decline</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              ))
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.6)" },
    overlay: { flex: 1, justifyContent: "flex-end" },
    container: { backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40, maxHeight: "70%" },
    header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
    title: { fontSize: 20, fontWeight: "700", color: colors.textPrimary },
    closeText: { fontSize: 16, color: colors.accent, fontWeight: "600" },
    list: { flexGrow: 0 },
    emptyText: { color: colors.textMuted, fontSize: 15, textAlign: "center", paddingVertical: 24 },
    card: { backgroundColor: colors.surfaceLight, borderRadius: 14, padding: 16, marginBottom: 12 },
    cardHeader: { flexDirection: "row", alignItems: "center" },
    info: { flex: 1, marginLeft: 12 },
    name: { fontSize: 16, fontWeight: "600", color: colors.textPrimary },
    email: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
    description: { fontSize: 14, color: colors.textSecondary, marginTop: 10, marginBottom: 14 },
    actions: { gap: 8 },
    acceptShareButton: {
      flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
      backgroundColor: colors.accent, paddingVertical: 12, borderRadius: 10,
    },
    acceptShareText: { color: "#fff", fontSize: 15, fontWeight: "700" },
    acceptOnlyButton: {
      flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
      borderWidth: 1, borderColor: colors.accent, paddingVertical: 12, borderRadius: 10,
    },
    acceptOnlyText: { color: colors.accent, fontSize: 15, fontWeight: "600" },
    declineButton: { alignItems: "center", paddingVertical: 10 },
    declineText: { color: colors.textMuted, fontSize: 14, fontWeight: "600" },
  });
}
