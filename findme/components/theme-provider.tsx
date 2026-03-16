"use client";

import { createContext, useContext, useEffect, useState } from "react";

type Theme = "light" | "dark" | "system";

interface ThemeContextType {
  theme: Theme;
  setTheme: (t: Theme) => void;
  isDark: boolean;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: "system",
  setTheme: () => {},
  isDark: true,
});

export function useTheme() {
  return useContext(ThemeContext);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("system");
  const [isDark, setIsDark] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem("findme-theme") as Theme | null;
    if (stored && (["light", "dark", "system"] as string[]).includes(stored)) {
      // Reading from localStorage is a sync-with-external-system pattern
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setThemeState(stored);
    }
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    function apply(t: Theme) {
      const dark =
        t === "dark" ||
        (t === "system" &&
          window.matchMedia("(prefers-color-scheme: dark)").matches);
      root.classList.toggle("dark", dark);
      setIsDark(dark);
    }
    apply(theme);
    localStorage.setItem("findme-theme", theme);

    if (theme === "system") {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      const handler = () => apply("system");
      mq.addEventListener("change", handler);
      return () => mq.removeEventListener("change", handler);
    }
  }, [theme]);

  function setTheme(t: Theme) {
    setThemeState(t);
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme, isDark }}>
      {children}
    </ThemeContext.Provider>
  );
}

/** Inline script to prevent FOUC. Insert in <head> via dangerouslySetInnerHTML. */
export const themeInitScript = `
(function(){
  var t=localStorage.getItem('findme-theme')||'system';
  var d=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme:dark)').matches);
  if(d)document.documentElement.classList.add('dark');
})()`;
