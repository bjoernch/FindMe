const AVATAR_COLORS = [
  "#EF4444", // red
  "#F97316", // orange
  "#EAB308", // yellow
  "#22C55E", // green
  "#06B6D4", // cyan
  "#3B82F6", // blue
  "#8B5CF6", // violet
  "#EC4899", // pink
  "#14B8A6", // teal
  "#F43F5E", // rose
];

/**
 * Extract up to 2 initials from a name.
 * "John Doe" → "JD", "Alice" → "A", null → "?"
 */
export function getInitials(name: string | null): string {
  if (!name || name.trim().length === 0) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Get a deterministic color for a name string.
 * Same name always returns the same color.
 */
export function getAvatarColor(name: string | null): string {
  if (!name) return AVATAR_COLORS[0];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

/**
 * Generate an inline HTML string for a Leaflet divIcon marker.
 * Used in location-map.tsx for person markers on the map.
 */
export function getAvatarMarkerHtml(
  name: string | null,
  online: boolean,
  avatarUrl?: string | null
): string {
  const borderColor = online ? "#60a5fa" : "#6b7280";

  if (avatarUrl) {
    return `<div style="
      width: 42px;
      height: 42px;
      border-radius: 50%;
      border: 3px solid ${borderColor};
      overflow: hidden;
      box-shadow: 0 2px 8px rgba(0,0,0,0.4);
    "><img src="${avatarUrl}" style="width:100%;height:100%;object-fit:cover;" /></div>`;
  }

  const initials = getInitials(name);
  const color = getAvatarColor(name);

  return `<div style="
    background: ${color};
    width: 42px;
    height: 42px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 16px;
    font-weight: 700;
    color: white;
    border: 3px solid ${borderColor};
    box-shadow: 0 2px 8px rgba(0,0,0,0.4);
    letter-spacing: 0.5px;
  ">${initials}</div>`;
}
