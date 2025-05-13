-- CreateTable
CREATE TABLE "UserProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "shopDomain" TEXT NOT NULL,
    "preferredCategories" TEXT[],
    "preferredTags" TEXT[],
    "preferredBrands" TEXT[],
    "preferredPriceMin" DOUBLE PRECISION,
    "preferredPriceMax" DOUBLE PRECISION,
    "lastUpdated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductCooccurrence" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "coViewedProductId" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "lastUpdated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductCooccurrence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FrequentlyBoughtTogether" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "boughtWithProductId" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "lastUpdated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FrequentlyBoughtTogether_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PopularProduct" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "lastUpdated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PopularProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductRecommendation" (
    "id" TEXT NOT NULL,
    "shopDomain" TEXT NOT NULL,
    "sourceProductId" TEXT NOT NULL,
    "recommendedProductId" TEXT NOT NULL,
    "recommendationType" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "lastCalculated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductRecommendation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserProfile_shopDomain_idx" ON "UserProfile"("shopDomain");

-- CreateIndex
CREATE UNIQUE INDEX "UserProfile_userId_shopDomain_key" ON "UserProfile"("userId", "shopDomain");

-- CreateIndex
CREATE INDEX "ProductCooccurrence_shopId_productId_idx" ON "ProductCooccurrence"("shopId", "productId");

-- CreateIndex
CREATE INDEX "ProductCooccurrence_shopId_coViewedProductId_idx" ON "ProductCooccurrence"("shopId", "coViewedProductId");

-- CreateIndex
CREATE INDEX "FrequentlyBoughtTogether_shopId_productId_idx" ON "FrequentlyBoughtTogether"("shopId", "productId");

-- CreateIndex
CREATE INDEX "FrequentlyBoughtTogether_shopId_boughtWithProductId_idx" ON "FrequentlyBoughtTogether"("shopId", "boughtWithProductId");

-- CreateIndex
CREATE INDEX "PopularProduct_shopId_idx" ON "PopularProduct"("shopId");

-- CreateIndex
CREATE INDEX "PopularProduct_shopId_productId_idx" ON "PopularProduct"("shopId", "productId");

-- CreateIndex
CREATE INDEX "ProductRecommendation_shopDomain_idx" ON "ProductRecommendation"("shopDomain");

-- CreateIndex
CREATE UNIQUE INDEX "ProductRecommendation_sourceProductId_recommendedProductId__key" ON "ProductRecommendation"("sourceProductId", "recommendedProductId", "recommendationType");
