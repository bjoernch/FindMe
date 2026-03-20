// Import background location task at root level (required by expo-task-manager)
import "../lib/location-task";

import { Stack, useSegments, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import { ThemeProvider, useTheme } from "../lib/theme-context";
import { AuthProvider, useAuth } from "../lib/auth-context";
import { setupNotificationHandlers } from "../lib/push-notifications";
import { useNotificationPoller } from "../lib/notification-poller";
import { ensureTrackingActive } from "../lib/location-service";
import { LoadingScreen } from "../components/LoadingScreen";

function RootNav() {
  const { isAuthenticated, isLoading, apiClient } = useAuth();
  const { colors, effectiveMode } = useTheme();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    setupNotificationHandlers();
  }, []);

  // Re-ensure background tracking whenever app comes to foreground
  // Recovers from notification being swiped or service being killed by Android
  const appState = useRef(AppState.currentState);
  useEffect(() => {
    if (!isAuthenticated) return;

    const sub = AppState.addEventListener("change", (nextState) => {
      if (appState.current.match(/inactive|background/) && nextState === "active") {
        ensureTrackingActive();
      }
      appState.current = nextState;
    });

    return () => sub.remove();
  }, [isAuthenticated]);

  // Poll for notifications (replaces Firebase/FCM push for FOSS builds)
  useNotificationPoller(apiClient, isAuthenticated);

  useEffect(() => {
    if (isLoading) return;
    const inAuthGroup = segments[0] === "(auth)";
    const inAuthCallback = segments[0] === "auth"; // passkey deep link route
    // Don't redirect while on the auth callback page - it handles its own navigation
    if (inAuthCallback) return;
    if (!isAuthenticated && !inAuthGroup) {
      router.replace("/(auth)/login");
    } else if (isAuthenticated && inAuthGroup) {
      router.replace("/(tabs)");
    }
  }, [isAuthenticated, isLoading, segments]);

  if (isLoading) return <LoadingScreen />;

  return (
    <>
      <StatusBar style={effectiveMode === "dark" ? "light" : "dark"} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
          animation: "fade",
        }}
      >
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="auth" />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <RootNav />
      </AuthProvider>
    </ThemeProvider>
  );
}
