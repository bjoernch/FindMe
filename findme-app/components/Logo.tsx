import { View, Text, StyleSheet } from "react-native";

interface LogoProps {
  size?: number;
  showText?: boolean;
  textColor?: string;
}

export function Logo({ size = 48, showText = true, textColor = "#ffffff" }: LogoProps) {
  const pinSize = size * 0.6;
  const dotSize = size * 0.18;

  return (
    <View style={styles.container}>
      <View
        style={[
          styles.circle,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
          },
        ]}
      >
        {/* Pin shape approximated with circles */}
        <View
          style={[
            styles.pin,
            {
              width: pinSize,
              height: pinSize,
              borderRadius: pinSize / 2,
              borderWidth: 2,
              borderColor: "rgba(255,255,255,0.8)",
            },
          ]}
        >
          <View
            style={[
              styles.dot,
              {
                width: dotSize,
                height: dotSize,
                borderRadius: dotSize / 2,
              },
            ]}
          />
        </View>
      </View>
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
  circle: {
    backgroundColor: "#3b82f6",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#3b82f6",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  pin: {
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  dot: {
    backgroundColor: "#ffffff",
  },
  text: {
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
});
