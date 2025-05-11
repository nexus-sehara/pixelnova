/*
  Warnings:

  - You are about to drop the column `userAgent` on the `PixelSession` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "PixelSession" DROP COLUMN "userAgent",
ADD COLUMN     "clientId" TEXT;
