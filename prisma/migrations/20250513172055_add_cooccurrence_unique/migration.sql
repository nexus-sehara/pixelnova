/*
  Warnings:

  - A unique constraint covering the columns `[shopId,productId,coViewedProductId]` on the table `ProductCooccurrence` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "ProductCooccurrence_shopId_productId_coViewedProductId_key" ON "ProductCooccurrence"("shopId", "productId", "coViewedProductId");
