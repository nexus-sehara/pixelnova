/*
  Warnings:

  - A unique constraint covering the columns `[shopId,clientId]` on the table `PixelSession` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "PixelSession_shopId_clientId_key" ON "PixelSession"("shopId", "clientId");
