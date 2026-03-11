export type ThemeMode = "dark" | "light" | "system";

export type ThemeColors = {
  background: string;
  surface: string;
  surfaceLight: string;
  border: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  accent: string;
  accentLight: string;
  success: string;
  error: string;
  warning: string;
  onlineGreen: string;
  offlineGray: string;
};

export const darkColors: ThemeColors = {
  background: "#030712",
  surface: "#111827",
  surfaceLight: "#1f2937",
  border: "#374151",
  textPrimary: "#ffffff",
  textSecondary: "#9ca3af",
  textMuted: "#6b7280",
  accent: "#3b82f6",
  accentLight: "#60a5fa",
  success: "#22c55e",
  error: "#ef4444",
  warning: "#eab308",
  onlineGreen: "#4ade80",
  offlineGray: "#6b7280",
};

export const lightColors: ThemeColors = {
  background: "#f9fafb",
  surface: "#ffffff",
  surfaceLight: "#f3f4f6",
  border: "#d1d5db",
  textPrimary: "#111827",
  textSecondary: "#4b5563",
  textMuted: "#9ca3af",
  accent: "#3b82f6",
  accentLight: "#2563eb",
  success: "#16a34a",
  error: "#dc2626",
  warning: "#ca8a04",
  onlineGreen: "#22c55e",
  offlineGray: "#9ca3af",
};

/** @deprecated Use useTheme() hook instead */
export const colors = darkColors;
