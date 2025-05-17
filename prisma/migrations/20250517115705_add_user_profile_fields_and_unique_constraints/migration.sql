/*
  Warnings:

  - You are about to drop the column `lastUpdated` on the `UserProfile` table. All the data in the column will be lost.
  - You are about to drop the column `preferredBrands` on the `UserProfile` table. All the data in the column will be lost.
  - You are about to drop the column `preferredCategories` on the `UserProfile` table. All the data in the column will be lost.
  - You are about to drop the column `preferredPriceMax` on the `UserProfile` table. All the data in the column will be lost.
  - You are about to drop the column `preferredPriceMin` on the `UserProfile` table. All the data in the column will be lost.
  - You are about to drop the column `preferredTags` on the `UserProfile` table. All the data in the column will be lost.
  - You are about to drop the column `shopDomain` on the `UserProfile` table. All the data in the column will be lost.
  - You are about to drop the column `userId` on the `UserProfile` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[shopId,email]` on the table `UserProfile` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[shopId,shopifyCustomerId]` on the table `UserProfile` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `lastSeenAt` to the `UserProfile` table without a default value. This is not possible if the table is not empty.
  - Added the required column `shopId` to the `UserProfile` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "UserProfile_shopDomain_idx";

-- DropIndex
DROP INDEX "UserProfile_userId_shopDomain_key";

-- AlterTable
ALTER TABLE "PixelSession" ADD COLUMN     "userProfileId" TEXT;

-- AlterTable
ALTER TABLE "UserProfile" DROP COLUMN "lastUpdated",
DROP COLUMN "preferredBrands",
DROP COLUMN "preferredCategories",
DROP COLUMN "preferredPriceMax",
DROP COLUMN "preferredPriceMin",
DROP COLUMN "preferredTags",
DROP COLUMN "shopDomain",
DROP COLUMN "userId",
ADD COLUMN     "derivedIntentScore" INTEGER,
ADD COLUMN     "derivedPersonalityType" TEXT,
ADD COLUMN     "email" TEXT,
ADD COLUMN     "firstName" TEXT,
ADD COLUMN     "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "lastName" TEXT,
ADD COLUMN     "lastSeenAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "recentlyAddedToCartProductIds" JSONB,
ADD COLUMN     "recentlyViewedProductIds" JSONB,
ADD COLUMN     "shopId" TEXT NOT NULL,
ADD COLUMN     "shopifyAccountCreatedAt" TIMESTAMP(3),
ADD COLUMN     "shopifyCustomerId" TEXT,
ADD COLUMN     "shopifyCustomerTags" JSONB,
ADD COLUMN     "totalAppAddsToCart" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "totalAppProductViews" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "totalShopifyOrders" INTEGER,
ADD COLUMN     "totalShopifySpend" DOUBLE PRECISION;

-- CreateIndex
CREATE INDEX "UserProfile_shopId_idx" ON "UserProfile"("shopId");

-- CreateIndex
CREATE INDEX "UserProfile_email_idx" ON "UserProfile"("email");

-- CreateIndex
CREATE INDEX "UserProfile_shopifyCustomerId_idx" ON "UserProfile"("shopifyCustomerId");

-- CreateIndex
CREATE INDEX "UserProfile_lastSeenAt_idx" ON "UserProfile"("lastSeenAt");

-- CreateIndex
CREATE INDEX "UserProfile_derivedPersonalityType_idx" ON "UserProfile"("derivedPersonalityType");

-- CreateIndex
CREATE UNIQUE INDEX "UserProfile_shopId_email_key" ON "UserProfile"("shopId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "UserProfile_shopId_shopifyCustomerId_key" ON "UserProfile"("shopId", "shopifyCustomerId");

-- AddForeignKey
ALTER TABLE "PixelSession" ADD CONSTRAINT "PixelSession_userProfileId_fkey" FOREIGN KEY ("userProfileId") REFERENCES "UserProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserProfile" ADD CONSTRAINT "UserProfile_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
