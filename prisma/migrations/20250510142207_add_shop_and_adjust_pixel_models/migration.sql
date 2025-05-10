/*
  Warnings:

  - You are about to drop the column `sessionToken` on the `PixelEvent` table. All the data in the column will be lost.
  - You are about to drop the column `shopDomain` on the `PixelEvent` table. All the data in the column will be lost.
  - You are about to drop the column `eventCount` on the `PixelSession` table. All the data in the column will be lost.
  - You are about to drop the column `shopDomain` on the `PixelSession` table. All the data in the column will be lost.

*/
-- CreateTable
CREATE TABLE "Shop" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "domain" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_PixelEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventType" TEXT NOT NULL,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userAgent" TEXT,
    "eventData" JSONB NOT NULL,
    "requestShopDomain" TEXT,
    "requestSessionToken" TEXT,
    "shopId" TEXT,
    "pixelSessionId" TEXT,
    CONSTRAINT "PixelEvent_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "PixelEvent_pixelSessionId_fkey" FOREIGN KEY ("pixelSessionId") REFERENCES "PixelSession" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_PixelEvent" ("eventData", "eventType", "id", "shopId", "timestamp", "userAgent") SELECT "eventData", "eventType", "id", "shopId", "timestamp", "userAgent" FROM "PixelEvent";
DROP TABLE "PixelEvent";
ALTER TABLE "new_PixelEvent" RENAME TO "PixelEvent";
CREATE INDEX "PixelEvent_shopId_idx" ON "PixelEvent"("shopId");
CREATE INDEX "PixelEvent_pixelSessionId_idx" ON "PixelEvent"("pixelSessionId");
CREATE INDEX "PixelEvent_requestSessionToken_idx" ON "PixelEvent"("requestSessionToken");
CREATE TABLE "new_PixelSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionToken" TEXT NOT NULL,
    "userAgent" TEXT,
    "firstSeen" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastActive" DATETIME NOT NULL,
    "requestShopDomain" TEXT,
    "shopId" TEXT,
    CONSTRAINT "PixelSession_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_PixelSession" ("firstSeen", "id", "lastActive", "sessionToken", "shopId", "userAgent") SELECT "firstSeen", "id", "lastActive", "sessionToken", "shopId", "userAgent" FROM "PixelSession";
DROP TABLE "PixelSession";
ALTER TABLE "new_PixelSession" RENAME TO "PixelSession";
CREATE UNIQUE INDEX "PixelSession_sessionToken_key" ON "PixelSession"("sessionToken");
CREATE INDEX "PixelSession_shopId_idx" ON "PixelSession"("shopId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Shop_domain_key" ON "Shop"("domain");
