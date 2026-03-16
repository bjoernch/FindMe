import { useState } from "react";
import {
  View, Text, TouchableOpacity, Modal, StyleSheet, ScrollView, ActivityIndicator, Pressable,
} from "react-native";
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

  async function handleRespond(shareId: string, action: "accept" | "decline") {
    setRespondingId(shareId);
    await apiClient.respondToInvitation(shareId, action);
    setRespondingId(null);
    onResponded();
  }

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
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
                <View key={inv.id} style={styles.row}>
                  <AvatarCircle name={inv.fromUser?.name ?? null} size={44} />
                  <View style={styles.info}>
                    <Text style={styles.name}>{inv.fromUser?.name || "Unknown"}</Text>
                    <Text style={styles.email}>{inv.fromUser?.email || ""}</Text>
                  </View>
                  <View style={styles.actions}>
                    {respondingId === inv.id ? (
                      <ActivityIndicator size="small" color={colors.accent} />
                    ) : (
                      <>
                        <TouchableOpacity style={styles.declineButton} onPress={() => handleRespond(inv.id, "decline")}>
                          <Text style={styles.declineText}>Decline</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.acceptButton} onPress={() => handleRespond(inv.id, "accept")}>
                          <Text style={styles.acceptText}>Accept</Text>
                        </TouchableOpacity>
                      </>
                    )}
                  </View>
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
    row: { flexDirection: "row", alignItems: "center", paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.surfaceLight },
    info: { flex: 1, marginLeft: 12 },
    name: { fontSize: 16, fontWeight: "600", color: colors.textPrimary },
    email: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
    actions: { flexDirection: "row", gap: 8 },
    declineButton: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, backgroundColor: colors.surfaceLight },
    declineText: { color: colors.textSecondary, fontSize: 13, fontWeight: "600" },
    acceptButton: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, backgroundColor: colors.accent },
    acceptText: { color: "#fff", fontSize: 13, fontWeight: "600" },
  });
}
