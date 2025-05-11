-- DropIndex
DROP INDEX "PixelSession_sessionToken_key";

-- AlterTable
ALTER TABLE "PixelSession" ADD COLUMN     "checkoutToken" TEXT,
ADD COLUMN     "customerEmail" TEXT,
ADD COLUMN     "shopifyCustomerId" TEXT,
ADD COLUMN     "shopifyOrderId" TEXT;

-- CreateIndex
CREATE INDEX "PixelSession_sessionToken_idx" ON "PixelSession"("sessionToken");

-- CreateIndex
CREATE INDEX "PixelSession_clientId_idx" ON "PixelSession"("clientId");

-- CreateIndex
CREATE INDEX "PixelSession_checkoutToken_idx" ON "PixelSession"("checkoutToken");

-- CreateIndex
CREATE INDEX "PixelSession_customerEmail_idx" ON "PixelSession"("customerEmail");

-- CreateIndex
CREATE INDEX "PixelSession_shopifyCustomerId_idx" ON "PixelSession"("shopifyCustomerId");

-- CreateIndex
CREATE INDEX "PixelSession_shopifyOrderId_idx" ON "PixelSession"("shopifyOrderId");
