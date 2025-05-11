-- CreateTable
CREATE TABLE "ProductMetadata" (
    "id" TEXT NOT NULL,
    "shopifyProductId" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "handle" TEXT,
    "productType" TEXT,
    "vendor" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" TEXT,
    "minVariantPrice" DOUBLE PRECISION,
    "maxVariantPrice" DOUBLE PRECISION,
    "currencyCode" TEXT,
    "featuredImageUrl" TEXT,
    "variantsData" JSONB,
    "collectionsData" JSONB,
    "shopifyCreatedAt" TIMESTAMP(3),
    "shopifyUpdatedAt" TIMESTAMP(3),
    "lastFetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pixelNovaUpdatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductMetadata_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProductMetadata_shopifyProductId_key" ON "ProductMetadata"("shopifyProductId");

-- CreateIndex
CREATE INDEX "ProductMetadata_shopId_idx" ON "ProductMetadata"("shopId");

-- CreateIndex
CREATE INDEX "ProductMetadata_shopId_productType_idx" ON "ProductMetadata"("shopId", "productType");

-- CreateIndex
CREATE INDEX "ProductMetadata_shopId_vendor_idx" ON "ProductMetadata"("shopId", "vendor");

-- CreateIndex
CREATE INDEX "ProductMetadata_shopId_status_idx" ON "ProductMetadata"("shopId", "status");

-- AddForeignKey
ALTER TABLE "ProductMetadata" ADD CONSTRAINT "ProductMetadata_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
