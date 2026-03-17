import { useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, Modal, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform, Pressable,
} from "react-native";
import { useTheme } from "../lib/theme-context";
import { useAuth } from "../lib/auth-context";
import type { ThemeColors } from "../lib/theme";

interface InviteModalProps {
  visible: boolean;
  onClose: () => void;
  onInvited: () => void;
}

export function InviteModal({ visible, onClose, onInvited }: InviteModalProps) {
  const { apiClient } = useAuth();
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleInvite() {
    if (!email.trim() || loading) return;
    setLoading(true); setError(null);
    try {
      const result = await apiClient.invite(email.trim());
      if (result.success) {
        setSuccess(true); setEmail("");
        setTimeout(() => {
          setSuccess(false);
          onClose();
          // Delay refetch until after modal fully closes to prevent flickering
          setTimeout(() => onInvited(), 300);
        }, 1200);
      } else { setError(result.error || "Failed to send invitation"); }
    } catch {
      setError("Failed to send invitation");
    }
    setLoading(false);
  }

  function handleClose() { setEmail(""); setError(null); setSuccess(false); onClose(); }

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={handleClose}>
      <Pressable style={styles.backdrop} onPress={handleClose} />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.overlay} pointerEvents="box-none">
        <View style={styles.container}>
          <View style={styles.handle} />
          <Text style={styles.title}>Invite Someone</Text>
          <Text style={styles.subtitle}>Enter their email to share locations with each other</Text>
          <TextInput style={styles.input} placeholder="Email address" placeholderTextColor={colors.textMuted} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} editable={!loading && !success} />
          {error && <Text style={styles.error}>{error}</Text>}
          {success && <Text style={styles.success}>Invitation sent!</Text>}
          <View style={styles.buttons}>
            <TouchableOpacity style={styles.cancelButton} onPress={handleClose} disabled={loading}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.inviteButton, (!email.trim() || loading || success) && styles.disabledButton]} onPress={handleInvite} disabled={!email.trim() || loading || success}>
              {loading ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.inviteText}>Send Invite</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.6)" },
    overlay: { flex: 1, justifyContent: "flex-end" },
    handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.textMuted, alignSelf: "center", marginBottom: 16, opacity: 0.4 },
    container: { backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40 },
    title: { fontSize: 20, fontWeight: "700", color: colors.textPrimary, marginBottom: 4 },
    subtitle: { fontSize: 14, color: colors.textSecondary, marginBottom: 20 },
    input: { backgroundColor: colors.surfaceLight, borderRadius: 12, padding: 16, fontSize: 16, color: colors.textPrimary, borderWidth: 1, borderColor: colors.border, marginBottom: 12 },
    error: { color: colors.error, fontSize: 14, marginBottom: 12 },
    success: { color: colors.success, fontSize: 14, marginBottom: 12, fontWeight: "600" },
    buttons: { flexDirection: "row", gap: 12, marginTop: 8 },
    cancelButton: { flex: 1, padding: 16, borderRadius: 12, backgroundColor: colors.surfaceLight, alignItems: "center" },
    cancelText: { color: colors.textSecondary, fontSize: 16, fontWeight: "600" },
    inviteButton: { flex: 1, padding: 16, borderRadius: 12, backgroundColor: colors.accent, alignItems: "center" },
    inviteText: { color: "#fff", fontSize: 16, fontWeight: "600" },
    disabledButton: { opacity: 0.5 },
  });
}
