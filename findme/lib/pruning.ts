/**
 * Automatic location data pruning.
 * On first import, starts a background timer that runs every 6 hours.
 * Deletes location records older than each user's configured retentionDays.
 */

import { prisma } from "./db";
import { log } from "./logger";

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

async function pruneLocationData(): Promise<void> {
  try {
    const usersWithRetention = await prisma.user.findMany({
      where: { retentionDays: { not: null } },
      select: { id: true, email: true, retentionDays: true },
    });

    if (usersWithRetention.length === 0) {
      log.debug("pruning", "No users with retention settings, skipping");
      return;
    }

    let totalPruned = 0;

    for (const user of usersWithRetention) {
      if (!user.retentionDays) continue;

      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - user.retentionDays);

      const devices = await prisma.device.findMany({
        where: { userId: user.id },
        select: { id: true },
      });

      if (devices.length === 0) continue;

      const deviceIds = devices.map((d) => d.id);

      const deleted = await prisma.location.deleteMany({
        where: {
          deviceId: { in: deviceIds },
          timestamp: { lt: cutoff },
        },
      });

      if (deleted.count > 0) {
        log.info("pruning", `Pruned ${deleted.count} locations for user ${user.email}`, {
          userId: user.id,
          retentionDays: user.retentionDays,
          count: deleted.count,
        });
        totalPruned += deleted.count;
      }
    }

    if (totalPruned > 0) {
      log.info("pruning", `Pruning complete: ${totalPruned} total records removed`);
    } else {
      log.debug("pruning", "Pruning complete: no records to remove");
    }
  } catch (error) {
    log.error("pruning", "Location data pruning failed", error);
  }
}

// Lazy-init: run on first import, then every 6 hours
let initialized = false;

function initPruning() {
  if (initialized) return;
  initialized = true;

  log.info("pruning", "Location pruning scheduler started (every 6 hours)");

  // Run immediately on startup
  pruneLocationData();

  // Then every 6 hours
  setInterval(() => {
    pruneLocationData();
  }, SIX_HOURS_MS);
}

// Auto-start on import
initPruning();

export { pruneLocationData };
