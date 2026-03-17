import { View, ActivityIndicator, StyleSheet } from "react-native";
import { darkColors } from "../lib/theme";
import { Logo } from "./Logo";

export function LoadingScreen() {
  // Uses dark colors always since ThemeProvider may not be ready yet
  return (
    <View style={styles.container}>
      <Logo size={80} textColor={darkColors.textPrimary} />
      <ActivityIndicator size="large" color={darkColors.accent} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: darkColors.background,
    alignItems: "center",
    justifyContent: "center",
    gap: 24,
  },
});
