import { existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import Database from "better-sqlite3";
import { log } from "./logger";

/**
 * SQLite-backed rate limiter. Survives server restarts and works in clustered deployments.
 * Falls back to in-memory if SQLite init fails.
 */

let db: Database.Database | null = null;
let useFallback = false;

// In-memory fallback
const memoryMap = new Map<string, { count: number; resetTime: number }>();

function getDb(): Database.Database | null {
  if (db) return db;
  if (useFallback) return null;

  try {
    const dbPath = process.env.RATE_LIMIT_DB || join(process.cwd(), "data", "rate-limit.db");
    const dir = dirname(dbPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    db = new Database(dbPath);
    db.pragma("journal_mode = WAL");
    db.pragma("busy_timeout = 3000");

    db.exec(`
      CREATE TABLE IF NOT EXISTS rate_limits (
        key TEXT PRIMARY KEY,
        count INTEGER NOT NULL DEFAULT 1,
        reset_time INTEGER NOT NULL
      )
    `);

    // Prepared statements for performance
    log.info("rate-limit", "SQLite rate limiter initialized");
    return db;
  } catch (err) {
    log.warn("rate-limit", "Failed to init SQLite rate limiter, using in-memory fallback", err as Record<string, unknown>);
    useFallback = true;
    return null;
  }
}

function rateLimitSqlite(
  database: Database.Database,
  key: string,
  limit: number,
  windowMs: number
): { allowed: boolean; remaining: number } {
  const now = Date.now();

  // Clean expired + upsert in one transaction
  const result = database.transaction(() => {
    // Delete expired entry for this key
    database.prepare("DELETE FROM rate_limits WHERE key = ? AND reset_time <= ?").run(key, now);

    const row = database.prepare("SELECT count, reset_time FROM rate_limits WHERE key = ?").get(key) as
      | { count: number; reset_time: number }
      | undefined;

    if (!row) {
      database.prepare("INSERT INTO rate_limits (key, count, reset_time) VALUES (?, 1, ?)").run(key, now + windowMs);
      return { allowed: true, remaining: limit - 1 };
    }

    if (row.count >= limit) {
      return { allowed: false, remaining: 0 };
    }

    database.prepare("UPDATE rate_limits SET count = count + 1 WHERE key = ?").run(key);
    return { allowed: true, remaining: limit - (row.count + 1) };
  })();

  return result;
}

function rateLimitMemory(
  key: string,
  limit: number,
  windowMs: number
): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const entry = memoryMap.get(key);

  if (!entry || now > entry.resetTime) {
    memoryMap.set(key, { count: 1, resetTime: now + windowMs });
    return { allowed: true, remaining: limit - 1 };
  }

  if (entry.count >= limit) {
    return { allowed: false, remaining: 0 };
  }

  entry.count++;
  return { allowed: true, remaining: limit - entry.count };
}

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): { allowed: boolean; remaining: number } {
  const database = getDb();
  if (database) {
    try {
      return rateLimitSqlite(database, key, limit, windowMs);
    } catch {
      // Fall through to memory on any SQLite error
    }
  }
  return rateLimitMemory(key, limit, windowMs);
}

// Periodic cleanup of expired entries
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    // SQLite cleanup
    const database = getDb();
    if (database) {
      try {
        database.prepare("DELETE FROM rate_limits WHERE reset_time <= ?").run(Date.now());
      } catch { /* ignore */ }
    }

    // Memory fallback cleanup
    const now = Date.now();
    for (const [key, entry] of memoryMap.entries()) {
      if (now > entry.resetTime) {
        memoryMap.delete(key);
      }
    }
  }, 60_000);
}
