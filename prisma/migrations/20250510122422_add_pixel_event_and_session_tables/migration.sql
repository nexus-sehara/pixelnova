-- CreateTable
CREATE TABLE "PixelEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventType" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "shopId" TEXT,
    "shopDomain" TEXT,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userAgent" TEXT,
    "eventData" JSONB NOT NULL,
    CONSTRAINT "PixelEvent_sessionToken_fkey" FOREIGN KEY ("sessionToken") REFERENCES "PixelSession" ("sessionToken") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PixelSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionToken" TEXT NOT NULL,
    "shopId" TEXT,
    "shopDomain" TEXT,
    "userAgent" TEXT,
    "firstSeen" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastActive" DATETIME NOT NULL,
    "eventCount" INTEGER NOT NULL DEFAULT 0
);

-- CreateIndex
CREATE INDEX "PixelEvent_sessionToken_idx" ON "PixelEvent"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "PixelSession_sessionToken_key" ON "PixelSession"("sessionToken");
