-- CreateTable
CREATE TABLE "PeopleShare" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fromUserId" TEXT NOT NULL,
    "toUserId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PeopleShare_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PeopleShare_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "PeopleShare_fromUserId_idx" ON "PeopleShare"("fromUserId");

-- CreateIndex
CREATE INDEX "PeopleShare_toUserId_idx" ON "PeopleShare"("toUserId");

-- CreateIndex
CREATE INDEX "PeopleShare_toUserId_status_idx" ON "PeopleShare"("toUserId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PeopleShare_fromUserId_toUserId_key" ON "PeopleShare"("fromUserId", "toUserId");
