-- Add password change tracking for session invalidation
ALTER TABLE "User" ADD COLUMN "passwordChangedAt" DATETIME;
UPDATE "User" SET "passwordChangedAt" = CURRENT_TIMESTAMP WHERE "passwordChangedAt" IS NULL;

-- Add user-level settings for data retention and webhooks
ALTER TABLE "User" ADD COLUMN "retentionDays" INTEGER;
ALTER TABLE "User" ADD COLUMN "webhookUrl" TEXT;
ALTER TABLE "User" ADD COLUMN "webhookSecret" TEXT;

-- API key authentication
CREATE TABLE "ApiKey" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "lastUsed" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ApiKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ApiKey_keyHash_key" ON "ApiKey"("keyHash");
CREATE INDEX "ApiKey_keyHash_idx" ON "ApiKey"("keyHash");
CREATE INDEX "ApiKey_userId_idx" ON "ApiKey"("userId");
