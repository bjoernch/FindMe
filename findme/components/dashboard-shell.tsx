"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { signOut } from "next-auth/react";
import { useTheme } from "./theme-provider";
import { useI18n } from "@/lib/i18n/context";

interface DashboardShellProps {
  user: { name: string; email: string; role: string; avatar?: string | null };
  children: React.ReactNode;
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function getAvatarColor(name: string): string {
  const colors = [
    "#3b82f6", "#8b5cf6", "#ec4899", "#f97316",
    "#14b8a6", "#06b6d4", "#6366f1", "#ef4444",
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

const navItemDefs = [
  { href: "/dashboard", i18nKey: "nav.map", icon: "🗺" },
  { href: "/dashboard/people", i18nKey: "nav.people", icon: "👥" },
  { href: "/dashboard/devices", i18nKey: "nav.devices", icon: "📱" },
  { href: "/dashboard/geofences", i18nKey: "nav.geofences", icon: "📍" },
  { href: "/dashboard/share", i18nKey: "nav.share", icon: "🔗" },
  { href: "/dashboard/settings", i18nKey: "nav.settings", icon: "⚙" },
];

export function DashboardShell({ user, children }: DashboardShellProps) {
  const pathname = usePathname();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const { theme, setTheme, isDark } = useTheme();
  const { t } = useI18n();

  const navItems = navItemDefs.map((item) => ({
    ...item,
    label: t(item.i18nKey),
  }));

  function cycleTheme() {
    const next = theme === "system" ? "light" : theme === "light" ? "dark" : "system";
    setTheme(next);
  }

  const themeIcon = theme === "system" ? "◐" : theme === "dark" ? "🌙" : "☀️";
  const themeLabel = theme === "system" ? "Auto" : theme === "dark" ? "Dark" : "Light";

  return (
    <div className="min-h-screen bg-page flex flex-col">
      {/* Top bar */}
      <header className="bg-card border-b border-edge px-4 py-3 flex items-center justify-between flex-shrink-0 z-50">
        <div className="flex items-center gap-4">
          <button
            onClick={() => setMobileNavOpen(!mobileNavOpen)}
            className="md:hidden text-sub hover:text-heading"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <Link href="/dashboard" className="flex items-center gap-2 text-xl font-bold text-heading">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.svg" alt="" className="w-7 h-7" />
            FindMe
          </Link>
          <nav className="hidden md:flex items-center gap-1">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                  pathname === item.href
                    ? "bg-blue-600 text-white"
                    : "text-sub hover:text-heading hover:bg-input"
                }`}
              >
                {item.label}
              </Link>
            ))}
            {user.role === "ADMIN" && (
              <Link
                href="/dashboard/admin"
                className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                  pathname.startsWith("/dashboard/admin")
                    ? "bg-blue-600 text-white"
                    : "text-sub hover:text-heading hover:bg-input"
                }`}
              >
                {t("nav.admin")}
              </Link>
            )}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={cycleTheme}
            className="text-sm text-sub hover:text-heading bg-input px-2.5 py-1.5 rounded-lg transition-colors"
            title={`Theme: ${themeLabel}`}
          >
            {themeIcon}
          </button>
          <div className="flex items-center gap-2">
            {user.avatar ? (
              <img
                src={user.avatar}
                alt={user.name}
                className="w-7 h-7 rounded-full object-cover"
              />
            ) : (
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold"
                style={{ backgroundColor: getAvatarColor(user.name || user.email) }}
              >
                {getInitials(user.name || user.email)}
              </div>
            )}
            <span className="text-sm text-sub hidden sm:block">
              {user.name}
            </span>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: "/auth" })}
            className="text-sm text-sub hover:text-heading bg-input px-3 py-1.5 rounded-lg transition-colors"
          >
            {t("nav.signOut")}
          </button>
        </div>
      </header>

      {/* Mobile nav */}
      {mobileNavOpen && (
        <div className="md:hidden bg-card border-b border-edge px-4 py-2 z-40">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileNavOpen(false)}
              className={`block px-3 py-2 rounded-lg text-sm transition-colors ${
                pathname === item.href
                  ? "bg-blue-600 text-white"
                  : "text-sub hover:text-heading"
              }`}
            >
              {item.icon} {item.label}
            </Link>
          ))}
        </div>
      )}

      {/* Content */}
      <main className="flex-1 relative">{children}</main>
    </div>
  );
}
