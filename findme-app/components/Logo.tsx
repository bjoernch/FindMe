import { View, Text, Image, StyleSheet } from "react-native";

interface LogoProps {
  size?: number;
  showText?: boolean;
  textColor?: string;
}

export function Logo({ size = 48, showText = true, textColor = "#ffffff" }: LogoProps) {
  return (
    <View style={styles.container}>
      <Image
        source={require("../assets/icon.png")}
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
        }}
        resizeMode="contain"
      />
      {showText && (
        <Text style={[styles.text, { color: textColor }]}>FindMe</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    gap: 12,
  },
  text: {
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
});
