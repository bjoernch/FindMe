import React, { createContext, useContext, useState, useEffect } from "react";
import { useColorScheme } from "react-native";
import { getStoredValue, setStoredValue } from "./storage";
import { darkColors, lightColors } from "./theme";
import type { ThemeMode, ThemeColors } from "./theme";

interface ThemeContextType {
  mode: ThemeMode;
  effectiveMode: "dark" | "light";
  colors: ThemeColors;
  toggleTheme: () => void;
  setTheme: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextType | null>(null);

export function useTheme(): ThemeContextType {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [mode, setMode] = useState<ThemeMode>("system");

  useEffect(() => {
    getStoredValue("themeMode").then((val) => {
      if (val === "light" || val === "dark" || val === "system") setMode(val);
    });
  }, []);

  const effectiveMode: "dark" | "light" =
    mode === "system"
      ? (systemScheme === "light" ? "light" : "dark")
      : mode;

  const colors = effectiveMode === "dark" ? darkColors : lightColors;

  function toggleTheme() {
    const next: ThemeMode =
      mode === "system" ? "light" : mode === "light" ? "dark" : "system";
    setMode(next);
    setStoredValue("themeMode", next);
  }

  function setTheme(m: ThemeMode) {
    setMode(m);
    setStoredValue("themeMode", m);
  }

  return (
    <ThemeContext.Provider value={{ mode, effectiveMode, colors, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
