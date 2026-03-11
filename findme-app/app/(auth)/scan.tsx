import { useState, useRef } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { router } from "expo-router";
import { useAuth } from "../../lib/auth-context";
import { useTheme } from "../../lib/theme-context";
import type { ThemeColors } from "../../lib/theme";

export default function ScanScreen() {
  const { qrAuth } = useAuth();
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const [permission, requestPermission] = useCameraPermissions();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"scan" | "manual">("scan");
  const [manualServerUrl, setManualServerUrl] = useState("");
  const [manualToken, setManualToken] = useState("");
  const scannedRef = useRef(false);

  async function handlePair(serverUrl: string, sessionToken: string) {
    if (loading) return;
    setLoading(true); setError(null);
    const err = await qrAuth(serverUrl, sessionToken);
    if (err) { setError(err); setLoading(false); scannedRef.current = false; }
  }

  function handleBarcodeScan(result: { data: string }) {
    if (scannedRef.current || loading) return;
    scannedRef.current = true;
    try {
      const url = new URL(result.data);
      if (url.protocol !== "findme:") { setError("Invalid QR code. Not a FindMe pairing code."); scannedRef.current = false; return; }
      const serverUrl = url.searchParams.get("url");
      const session = url.searchParams.get("session");
      if (!serverUrl || !session) { setError("Invalid QR code. Missing server URL or session."); scannedRef.current = false; return; }
      handlePair(decodeURIComponent(serverUrl), session);
    } catch { setError("Could not parse QR code."); scannedRef.current = false; }
  }

  async function handleManualPair() {
    if (!manualServerUrl.trim()) { setError("Server URL is required"); return; }
    if (!manualToken.trim()) { setError("Pairing token is required"); return; }
    handlePair(manualServerUrl.trim(), manualToken.trim());
  }

  if (mode === "scan" && !permission?.granted) {
    return (
      <View style={styles.container}>
        <View style={styles.centerContent}>
          <Text style={styles.logo}>FindMe</Text>
          <Text style={styles.subtitle}>Camera access needed to scan QR codes</Text>
          {permission?.canAskAgain ? (
            <TouchableOpacity style={styles.button} onPress={requestPermission}>
              <Text style={styles.buttonText}>Allow Camera</Text>
            </TouchableOpacity>
          ) : (
            <Text style={styles.errorText}>Camera permission denied. Please enable it in Settings.</Text>
          )}
          <TouchableOpacity onPress={() => setMode("manual")} style={styles.switchModeButton}>
            <Text style={styles.switchModeText}>Enter token manually</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Text style={styles.backText}>Back to Login</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Pair Device</Text>
        <View style={{ width: 30 }} />
      </View>
      <View style={styles.tabs}>
        <TouchableOpacity style={[styles.tab, mode === "scan" && styles.tabActive]} onPress={() => { setMode("scan"); setError(null); scannedRef.current = false; }}>
          <Text style={[styles.tabText, mode === "scan" && styles.tabTextActive]}>Scan QR</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tab, mode === "manual" && styles.tabActive]} onPress={() => { setMode("manual"); setError(null); }}>
          <Text style={[styles.tabText, mode === "manual" && styles.tabTextActive]}>Enter Token</Text>
        </TouchableOpacity>
      </View>
      {mode === "scan" ? (
        <View style={styles.scanContainer}>
          <CameraView style={styles.camera} barcodeScannerSettings={{ barcodeTypes: ["qr"] }} onBarcodeScanned={handleBarcodeScan} />
          <View style={styles.scanOverlay}><View style={styles.scanFrame} /></View>
          <View style={styles.scanInstructions}>
            <Text style={styles.instructionText}>Scan the QR code from your FindMe web dashboard</Text>
            <Text style={styles.instructionSubText}>Go to Settings → Pair Mobile App</Text>
          </View>
        </View>
      ) : (
        <View style={styles.manualContainer}>
          <Text style={styles.manualInstructions}>Enter the server URL and pairing token from your FindMe web dashboard.</Text>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Server URL</Text>
            <TextInput style={styles.input} placeholder="http://192.168.1.100:3001" placeholderTextColor={colors.textMuted} value={manualServerUrl} onChangeText={setManualServerUrl} autoCapitalize="none" autoCorrect={false} keyboardType="url" />
          </View>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Pairing Token</Text>
            <TextInput style={[styles.input, styles.tokenInput]} placeholder="Paste your pairing token here" placeholderTextColor={colors.textMuted} value={manualToken} onChangeText={setManualToken} autoCapitalize="none" autoCorrect={false} multiline />
          </View>
          <TouchableOpacity style={[styles.button, loading && styles.disabledButton]} onPress={handleManualPair} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Pair Device</Text>}
          </TouchableOpacity>
        </View>
      )}
      {error && <View style={styles.errorContainer}><Text style={styles.errorText}>{error}</Text></View>}
      {loading && mode === "scan" && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.loadingText}>Pairing...</Text>
        </View>
      )}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    centerContent: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24, gap: 16 },
    logo: { fontSize: 36, fontWeight: "800", color: colors.textPrimary, marginBottom: 8 },
    subtitle: { fontSize: 16, color: colors.textSecondary, textAlign: "center" },
    header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingTop: 60, paddingBottom: 16 },
    backArrow: { fontSize: 24, color: colors.textPrimary, padding: 4 },
    title: { fontSize: 18, fontWeight: "700", color: colors.textPrimary },
    tabs: { flexDirection: "row", marginHorizontal: 16, marginBottom: 16, backgroundColor: colors.surface, borderRadius: 12, padding: 4 },
    tab: { flex: 1, paddingVertical: 10, alignItems: "center", borderRadius: 10 },
    tabActive: { backgroundColor: colors.accent },
    tabText: { fontSize: 15, fontWeight: "600", color: colors.textSecondary },
    tabTextActive: { color: "#fff" },
    scanContainer: { flex: 1, position: "relative" },
    camera: { flex: 1 },
    scanOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: "center", alignItems: "center" },
    scanFrame: { width: 250, height: 250, borderWidth: 2, borderColor: colors.accent, borderRadius: 20 },
    scanInstructions: { position: "absolute", bottom: 60, left: 0, right: 0, alignItems: "center", paddingHorizontal: 24 },
    instructionText: { fontSize: 16, fontWeight: "600", color: "#fff", textAlign: "center", textShadowColor: "rgba(0,0,0,0.7)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 },
    instructionSubText: { fontSize: 14, color: "rgba(255,255,255,0.8)", textAlign: "center", marginTop: 4, textShadowColor: "rgba(0,0,0,0.7)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 },
    manualContainer: { padding: 24, gap: 16 },
    manualInstructions: { fontSize: 14, color: colors.textSecondary, lineHeight: 20 },
    inputGroup: { gap: 6 },
    label: { fontSize: 14, fontWeight: "600", color: colors.textSecondary },
    input: { backgroundColor: colors.surface, borderRadius: 12, padding: 16, fontSize: 16, color: colors.textPrimary, borderWidth: 1, borderColor: colors.border },
    tokenInput: { minHeight: 80, textAlignVertical: "top", fontFamily: "monospace", fontSize: 14 },
    button: { backgroundColor: colors.accent, borderRadius: 12, padding: 16, alignItems: "center", marginTop: 8 },
    disabledButton: { opacity: 0.6 },
    buttonText: { color: "#fff", fontSize: 17, fontWeight: "700" },
    switchModeButton: { paddingVertical: 12 },
    switchModeText: { color: colors.accent, fontSize: 15, fontWeight: "600" },
    backButton: { paddingVertical: 8 },
    backText: { color: colors.textSecondary, fontSize: 15 },
    errorContainer: { position: "absolute", bottom: 20, left: 16, right: 16, backgroundColor: "rgba(220,38,38,0.9)", borderRadius: 12, padding: 16 },
    errorText: { color: "#fff", fontSize: 14, textAlign: "center" },
    loadingOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "center", alignItems: "center", gap: 12 },
    loadingText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  });
}
