"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { translations, t as translate, LOCALE_NAMES } from "./translations";
import type { Locale } from "./translations";

interface I18nContextType {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string) => string;
  locales: typeof LOCALE_NAMES;
}

const I18nContext = createContext<I18nContextType | null>(null);

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("en");

  useEffect(() => {
    // Load persisted locale
    const stored = localStorage.getItem("findme-locale") as Locale | null;
    if (stored && stored in translations) {
      setLocaleState(stored);
    } else {
      // Detect browser locale
      const browserLang = navigator.language.split("-")[0] as Locale;
      if (browserLang in translations) {
        setLocaleState(browserLang);
      }
    }
  }, []);

  function setLocale(newLocale: Locale) {
    setLocaleState(newLocale);
    localStorage.setItem("findme-locale", newLocale);
  }

  function t(key: string): string {
    return translate(key, locale);
  }

  return (
    <I18nContext.Provider value={{ locale, setLocale, t, locales: LOCALE_NAMES }}>
      {children}
    </I18nContext.Provider>
  );
}
