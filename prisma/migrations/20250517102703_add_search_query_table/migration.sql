-- CreateTable
CREATE TABLE "SearchQuery" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "pixelSessionId" TEXT,
    "eventId" TEXT,
    "clientId" TEXT,
    "shopifyCustomerId" TEXT,
    "query" TEXT NOT NULL,
    "resultsCount" INTEGER,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SearchQuery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SearchQuery_shopId_idx" ON "SearchQuery"("shopId");

-- CreateIndex
CREATE INDEX "SearchQuery_pixelSessionId_idx" ON "SearchQuery"("pixelSessionId");

-- CreateIndex
CREATE INDEX "SearchQuery_query_idx" ON "SearchQuery"("query");

-- CreateIndex
CREATE INDEX "SearchQuery_clientId_idx" ON "SearchQuery"("clientId");

-- CreateIndex
CREATE INDEX "SearchQuery_shopifyCustomerId_idx" ON "SearchQuery"("shopifyCustomerId");

-- CreateIndex
CREATE INDEX "SearchQuery_eventId_idx" ON "SearchQuery"("eventId");

-- AddForeignKey
ALTER TABLE "SearchQuery" ADD CONSTRAINT "SearchQuery_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SearchQuery" ADD CONSTRAINT "SearchQuery_pixelSessionId_fkey" FOREIGN KEY ("pixelSessionId") REFERENCES "PixelSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SearchQuery" ADD CONSTRAINT "SearchQuery_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "PixelEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
