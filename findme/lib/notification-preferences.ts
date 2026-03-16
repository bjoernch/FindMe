import { prisma } from "./db";

type NotifyChannel = "push" | "email";
type NotifyType = "invitations" | "geofence" | "locationSharing";

/**
 * Check if a notification should be sent based on user preferences.
 * Returns true if no preferences are set (defaults to allowing all).
 */
export async function shouldNotify(
  userId: string,
  channel: NotifyChannel,
  type: NotifyType
): Promise<boolean> {
  const prefs = await prisma.notificationPreference.findUnique({
    where: { userId },
  });

  // No preferences set — allow all by default
  if (!prefs) return true;

  // Check the specific preference
  const fieldMap: Record<string, keyof typeof prefs> = {
    "push_invitations": "pushInvitations",
    "push_geofence": "pushGeofence",
    "push_locationSharing": "pushLocationSharing",
    "email_invitations": "emailInvitations",
    "email_geofence": "emailGeofence",
  };

  const key = `${channel}_${type}`;
  const field = fieldMap[key];
  if (field && prefs[field] === false) return false;

  // Check quiet hours for push notifications
  if (channel === "push" && prefs.quietHoursStart && prefs.quietHoursEnd) {
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    const [startH, startM] = prefs.quietHoursStart.split(":").map(Number);
    const [endH, endM] = prefs.quietHoursEnd.split(":").map(Number);
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;

    if (startMinutes <= endMinutes) {
      // Same day range (e.g., 22:00 - 23:00)
      if (currentMinutes >= startMinutes && currentMinutes < endMinutes) {
        return false;
      }
    } else {
      // Overnight range (e.g., 22:00 - 07:00)
      if (currentMinutes >= startMinutes || currentMinutes < endMinutes) {
        return false;
      }
    }
  }

  return true;
}
