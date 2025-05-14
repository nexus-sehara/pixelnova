/*
  Warnings:

  - A unique constraint covering the columns `[shopId,productId,boughtWithProductId]` on the table `FrequentlyBoughtTogether` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "FrequentlyBoughtTogether_shopId_boughtWithProductId_idx";

-- DropIndex
DROP INDEX "FrequentlyBoughtTogether_shopId_productId_idx";

-- CreateIndex
CREATE UNIQUE INDEX "FrequentlyBoughtTogether_shopId_productId_boughtWithProduct_key" ON "FrequentlyBoughtTogether"("shopId", "productId", "boughtWithProductId");
