import { useState, useRef } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { router } from "expo-router";
import { useAuth } from "../../lib/auth-context";
import { useTheme } from "../../lib/theme-context";
import type { ThemeColors } from "../../lib/theme";
import { Logo } from "../../components/Logo";
import { decodeQRFromBase64 } from "../../lib/qr-decoder";

export default function ScanScreen() {
  const { qrAuth } = useAuth();
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"scan" | "manual">("scan");
  const [manualServerUrl, setManualServerUrl] = useState("");
  const [manualToken, setManualToken] = useState("");

  async function handlePair(serverUrl: string, sessionToken: string) {
    if (loading) return;
    setLoading(true); setError(null);
    const err = await qrAuth(serverUrl, sessionToken);
    if (err) { setError(err); setLoading(false); }
  }

  function processQRData(data: string) {
    try {
      const url = new URL(data);
      if (url.protocol !== "findme:") { setError("Invalid QR code. Not a FindMe pairing code."); return; }
      const serverUrl = url.searchParams.get("url");
      const session = url.searchParams.get("session");
      if (!serverUrl || !session) { setError("Invalid QR code. Missing server URL or session."); return; }
      handlePair(decodeURIComponent(serverUrl), session);
    } catch { setError("Could not parse QR code."); }
  }

  async function handleScanFromCamera() {
    try {
      setError(null);
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== "granted") {
        setError("Camera permission is required to scan QR codes.");
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        quality: 0.7,
        allowsEditing: false,
      });

      if (result.canceled || !result.assets?.[0]) return;

      setLoading(true);
      setError(null);

      // Resize for faster QR processing
      const manipulated = await ImageManipulator.manipulateAsync(
        result.assets[0].uri,
        [{ resize: { width: 800 } }],
        { base64: true, format: ImageManipulator.SaveFormat.JPEG }
      );

      if (!manipulated.base64) {
        setError("Failed to process image.");
        setLoading(false);
        return;
      }

      const qrData = decodeQRFromBase64(manipulated.base64);
      setLoading(false);

      if (qrData) {
        processQRData(qrData);
      } else {
        setError("No QR code found in the photo. Please try again.");
      }
    } catch (e: any) {
      setLoading(false);
      setError(e?.message || "Failed to scan QR code.");
    }
  }

  async function handleScanFromGallery() {
    try {
      setError(null);
      const result = await ImagePicker.launchImageLibraryAsync({
        quality: 0.7,
        allowsEditing: false,
      });

      if (result.canceled || !result.assets?.[0]) return;

      setLoading(true);
      setError(null);

      const manipulated = await ImageManipulator.manipulateAsync(
        result.assets[0].uri,
        [{ resize: { width: 800 } }],
        { base64: true, format: ImageManipulator.SaveFormat.JPEG }
      );

      if (!manipulated.base64) {
        setError("Failed to process image.");
        setLoading(false);
        return;
      }

      const qrData = decodeQRFromBase64(manipulated.base64);
      setLoading(false);

      if (qrData) {
        processQRData(qrData);
      } else {
        setError("No QR code found in the image. Please try again.");
      }
    } catch (e: any) {
      setLoading(false);
      setError(e?.message || "Failed to process image.");
    }
  }

  async function handleManualPair() {
    if (!manualServerUrl.trim()) { setError("Server URL is required"); return; }
    if (!manualToken.trim()) { setError("Pairing token is required"); return; }
    handlePair(manualServerUrl.trim(), manualToken.trim());
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
        <TouchableOpacity style={[styles.tab, mode === "scan" && styles.tabActive]} onPress={() => { setMode("scan"); setError(null); }}>
          <Text style={[styles.tabText, mode === "scan" && styles.tabTextActive]}>Scan QR</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tab, mode === "manual" && styles.tabActive]} onPress={() => { setMode("manual"); setError(null); }}>
          <Text style={[styles.tabText, mode === "manual" && styles.tabTextActive]}>Enter Token</Text>
        </TouchableOpacity>
      </View>
      {mode === "scan" ? (
        <View style={styles.scanContainer}>
          <Logo size={48} textColor={colors.textPrimary} />
          <Text style={styles.instructionText}>
            Take a photo of the QR code from your FindMe web dashboard
          </Text>
          <Text style={styles.instructionSubText}>
            Go to Settings → Pair Mobile App
          </Text>
          <View style={styles.buttonGroup}>
            <TouchableOpacity
              style={[styles.button, loading && styles.disabledButton]}
              onPress={handleScanFromCamera}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>📷  Open Camera</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.secondaryButton, loading && styles.disabledButton]}
              onPress={handleScanFromGallery}
              disabled={loading}
            >
              <Text style={styles.secondaryButtonText}>🖼  Choose from Gallery</Text>
            </TouchableOpacity>
          </View>
          {loading && (
            <Text style={styles.processingText}>Decoding QR code...</Text>
          )}
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
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingTop: 60, paddingBottom: 16 },
    backArrow: { fontSize: 24, color: colors.textPrimary, padding: 4 },
    title: { fontSize: 18, fontWeight: "700", color: colors.textPrimary },
    tabs: { flexDirection: "row", marginHorizontal: 16, marginBottom: 16, backgroundColor: colors.surface, borderRadius: 12, padding: 4 },
    tab: { flex: 1, paddingVertical: 10, alignItems: "center", borderRadius: 10 },
    tabActive: { backgroundColor: colors.accent },
    tabText: { fontSize: 15, fontWeight: "600", color: colors.textSecondary },
    tabTextActive: { color: "#fff" },
    scanContainer: { flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 32, gap: 16 },
    instructionText: { fontSize: 16, fontWeight: "600", color: colors.textPrimary, textAlign: "center", marginTop: 12 },
    instructionSubText: { fontSize: 14, color: colors.textSecondary, textAlign: "center" },
    buttonGroup: { width: "100%", gap: 12, marginTop: 16 },
    button: { backgroundColor: colors.accent, borderRadius: 12, padding: 16, alignItems: "center" },
    secondaryButton: { backgroundColor: colors.surface, borderRadius: 12, padding: 16, alignItems: "center", borderWidth: 1, borderColor: colors.border },
    disabledButton: { opacity: 0.6 },
    buttonText: { color: "#fff", fontSize: 17, fontWeight: "700" },
    secondaryButtonText: { color: colors.textPrimary, fontSize: 17, fontWeight: "600" },
    processingText: { fontSize: 14, color: colors.textSecondary, marginTop: 8 },
    manualContainer: { padding: 24, gap: 16 },
    manualInstructions: { fontSize: 14, color: colors.textSecondary, lineHeight: 20 },
    inputGroup: { gap: 6 },
    label: { fontSize: 14, fontWeight: "600", color: colors.textSecondary },
    input: { backgroundColor: colors.surface, borderRadius: 12, padding: 16, fontSize: 16, color: colors.textPrimary, borderWidth: 1, borderColor: colors.border },
    tokenInput: { minHeight: 80, textAlignVertical: "top", fontFamily: "monospace", fontSize: 14 },
    errorContainer: { position: "absolute", bottom: 20, left: 16, right: 16, backgroundColor: "rgba(220,38,38,0.9)", borderRadius: 12, padding: 16 },
    errorText: { color: "#fff", fontSize: 14, textAlign: "center" },
  });
}
