const challenges = new Map<string, { challenge: string; expires: number }>();

export function storeChallenge(key: string, challenge: string) {
  // Clean expired entries
  const now = Date.now();
  for (const [k, v] of challenges) {
    if (v.expires < now) challenges.delete(k);
  }
  challenges.set(key, { challenge, expires: now + 5 * 60 * 1000 }); // 5 minutes
}

export function getChallenge(key: string): string | null {
  const entry = challenges.get(key);
  if (!entry || entry.expires < Date.now()) {
    challenges.delete(key);
    return null;
  }
  challenges.delete(key); // One-time use
  return entry.challenge;
}
