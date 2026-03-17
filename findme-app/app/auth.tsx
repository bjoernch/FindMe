import { useEffect } from "react";
import { View, ActivityIndicator, Text, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "../lib/auth-context";

/**
 * Catch-all route for findme://auth?token=... deep links.
 * On some Android devices, WebBrowser.openAuthSessionAsync doesn't intercept
 * the redirect and Expo Router navigates here instead.
 * The actual token exchange is handled by the URL listener in auth-context.
 * This route just shows a loading indicator and redirects once auth completes.
 */
export default function AuthCallback() {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;

    // Once auth state settles, navigate to the right place
    const timer = setTimeout(() => {
      if (isAuthenticated) {
        router.replace("/(tabs)");
      } else {
        router.replace("/(auth)/login");
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [isAuthenticated, isLoading]);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#3b82f6" />
      <Text style={styles.text}>Completing authentication...</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#030712",
  },
  text: {
    color: "#9ca3af",
    marginTop: 16,
    fontSize: 14,
  },
});
