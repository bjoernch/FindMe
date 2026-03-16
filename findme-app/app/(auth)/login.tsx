import { useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator,
} from "react-native";
import { router } from "expo-router";
import { useAuth } from "../../lib/auth-context";
import { useTheme } from "../../lib/theme-context";
import { Logo } from "../../components/Logo";
import type { ThemeColors } from "../../lib/theme";

export default function LoginScreen() {
  const { login, serverUrl, setServerUrl } = useAuth();
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [server, setServer] = useState(serverUrl || "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showServer, setShowServer] = useState(!serverUrl);

  async function handleLogin() {
    if (!server.trim()) { setError("Server URL is required"); setShowServer(true); return; }
    if (!email.trim() || !password.trim()) { setError("Email and password are required"); return; }
    setLoading(true); setError(null);
    await setServerUrl(server.trim());
    const err = await login(email.trim(), password.trim());
    if (err) { setError(err); setLoading(false); }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Logo size={64} textColor={colors.textPrimary} />
          <Text style={styles.subtitle}>Sign in to your account</Text>
        </View>
        <View style={styles.form}>
          {showServer ? (
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Server URL</Text>
              <TextInput style={styles.input} placeholder="http://192.168.1.100:3001" placeholderTextColor={colors.textMuted} value={server} onChangeText={setServer} autoCapitalize="none" autoCorrect={false} keyboardType="url" />
            </View>
          ) : (
            <TouchableOpacity onPress={() => setShowServer(true)} style={styles.serverBadge}>
              <Text style={styles.serverBadgeText}>Server: {serverUrl}</Text>
              <Text style={styles.serverChangeText}>Change</Text>
            </TouchableOpacity>
          )}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Email</Text>
            <TextInput style={styles.input} placeholder="you@example.com" placeholderTextColor={colors.textMuted} value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" />
          </View>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Password</Text>
            <TextInput style={styles.input} placeholder="Your password" placeholderTextColor={colors.textMuted} value={password} onChangeText={setPassword} secureTextEntry />
          </View>
          {error && <Text style={styles.error}>{error}</Text>}
          <TouchableOpacity style={[styles.button, loading && styles.disabledButton]} onPress={handleLogin} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Sign In</Text>}
          </TouchableOpacity>
          <TouchableOpacity style={styles.qrButton} onPress={() => router.push("/(auth)/scan")}>
            <Text style={styles.qrButtonText}>Scan QR Code to Pair</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.replace("/(auth)/register")} style={styles.switchButton}>
            <Text style={styles.switchText}>Need an account? <Text style={styles.switchLink}>Register</Text></Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    scroll: { flexGrow: 1, justifyContent: "center", padding: 24 },
    header: { alignItems: "center", marginBottom: 40 },
    logo: { fontSize: 36, fontWeight: "800", color: colors.textPrimary, marginBottom: 8 },
    subtitle: { fontSize: 16, color: colors.textSecondary },
    form: { gap: 16 },
    inputGroup: { gap: 6 },
    label: { fontSize: 14, fontWeight: "600", color: colors.textSecondary },
    input: { backgroundColor: colors.surface, borderRadius: 12, padding: 16, fontSize: 16, color: colors.textPrimary, borderWidth: 1, borderColor: colors.border },
    serverBadge: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: colors.surface, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: colors.border },
    serverBadgeText: { fontSize: 14, color: colors.textSecondary },
    serverChangeText: { fontSize: 14, color: colors.accent, fontWeight: "600" },
    error: { color: colors.error, fontSize: 14, textAlign: "center" },
    button: { backgroundColor: colors.accent, borderRadius: 12, padding: 16, alignItems: "center", marginTop: 8 },
    disabledButton: { opacity: 0.6 },
    buttonText: { color: "#fff", fontSize: 17, fontWeight: "700" },
    qrButton: { borderWidth: 1, borderColor: colors.accent, borderRadius: 12, padding: 16, alignItems: "center" },
    qrButtonText: { color: colors.accent, fontSize: 17, fontWeight: "700" },
    switchButton: { alignItems: "center", paddingVertical: 12 },
    switchText: { color: colors.textSecondary, fontSize: 15 },
    switchLink: { color: colors.accent, fontWeight: "600" },
  });
}
