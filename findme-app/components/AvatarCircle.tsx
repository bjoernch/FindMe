import { View, Text, Image, StyleSheet } from "react-native";
import { getInitials, getAvatarColor } from "../lib/avatar";
import { useTheme } from "../lib/theme-context";

interface AvatarCircleProps {
  name: string | null;
  avatarUrl?: string | null;
  size?: number;
  showOnline?: boolean;
  isOnline?: boolean;
}

export function AvatarCircle({
  name,
  avatarUrl,
  size = 40,
  showOnline = false,
  isOnline = false,
}: AvatarCircleProps) {
  const { colors } = useTheme();
  const initials = getInitials(name);
  const color = getAvatarColor(name);
  const fontSize = size * 0.38;

  return (
    <View style={{ position: "relative" }}>
      {avatarUrl ? (
        <Image
          source={{ uri: avatarUrl }}
          style={{ width: size, height: size, borderRadius: size / 2 }}
        />
      ) : (
        <View
          style={[
            styles.circle,
            { width: size, height: size, borderRadius: size / 2, backgroundColor: color },
          ]}
        >
          <Text style={[styles.text, { fontSize }]}>{initials}</Text>
        </View>
      )}
      {showOnline && (
        <View
          style={[
            styles.statusDot,
            {
              backgroundColor: isOnline ? colors.onlineGreen : colors.offlineGray,
              width: size * 0.3,
              height: size * 0.3,
              borderRadius: size * 0.15,
              borderWidth: size * 0.05,
              borderColor: colors.surface,
              right: -(size * 0.02),
              bottom: -(size * 0.02),
            },
          ]}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  circle: { alignItems: "center", justifyContent: "center" },
  text: { color: "#ffffff", fontWeight: "700", letterSpacing: 0.5 },
  statusDot: { position: "absolute" },
});
