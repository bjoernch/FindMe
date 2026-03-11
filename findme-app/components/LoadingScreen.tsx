import { View, ActivityIndicator, Text, StyleSheet } from "react-native";
import { darkColors } from "../lib/theme";

export function LoadingScreen() {
  // Uses dark colors always since ThemeProvider may not be ready yet
  return (
    <View style={styles.container}>
      <Text style={styles.logo}>FindMe</Text>
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
  logo: {
    fontSize: 32,
    fontWeight: "700",
    color: darkColors.textPrimary,
  },
});
