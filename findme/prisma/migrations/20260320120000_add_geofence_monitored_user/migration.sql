-- AlterTable
ALTER TABLE "Geofence" ADD COLUMN "monitoredUserId" TEXT;

-- CreateIndex
CREATE INDEX "Geofence_monitoredUserId_idx" ON "Geofence"("monitoredUserId");
