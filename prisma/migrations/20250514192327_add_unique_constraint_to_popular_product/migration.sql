/*
  Warnings:

  - A unique constraint covering the columns `[shopId,productId]` on the table `PopularProduct` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "PopularProduct_shopId_productId_idx";

-- CreateIndex
CREATE UNIQUE INDEX "PopularProduct_shopId_productId_key" ON "PopularProduct"("shopId", "productId");
