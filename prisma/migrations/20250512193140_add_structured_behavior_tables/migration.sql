-- CreateTable
CREATE TABLE "ProductView" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "variantId" TEXT,
    "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pixelSessionId" TEXT,
    "clientId" TEXT NOT NULL,
    "checkoutToken" TEXT,
    "shopifyCustomerId" TEXT,
    "eventId" TEXT,

    CONSTRAINT "ProductView_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CartAction" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "variantId" TEXT,
    "actionType" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pixelSessionId" TEXT,
    "clientId" TEXT NOT NULL,
    "checkoutToken" TEXT,
    "shopifyCustomerId" TEXT,
    "eventId" TEXT,

    CONSTRAINT "CartAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "shopifyOrderId" TEXT NOT NULL,
    "pixelSessionId" TEXT,
    "clientId" TEXT NOT NULL,
    "checkoutToken" TEXT,
    "shopifyCustomerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eventId" TEXT,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "variantId" TEXT,
    "quantity" INTEGER NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductView_shopId_idx" ON "ProductView"("shopId");

-- CreateIndex
CREATE INDEX "ProductView_productId_idx" ON "ProductView"("productId");

-- CreateIndex
CREATE INDEX "ProductView_clientId_idx" ON "ProductView"("clientId");

-- CreateIndex
CREATE INDEX "ProductView_checkoutToken_idx" ON "ProductView"("checkoutToken");

-- CreateIndex
CREATE INDEX "ProductView_shopifyCustomerId_idx" ON "ProductView"("shopifyCustomerId");

-- CreateIndex
CREATE INDEX "CartAction_shopId_idx" ON "CartAction"("shopId");

-- CreateIndex
CREATE INDEX "CartAction_productId_idx" ON "CartAction"("productId");

-- CreateIndex
CREATE INDEX "CartAction_clientId_idx" ON "CartAction"("clientId");

-- CreateIndex
CREATE INDEX "CartAction_checkoutToken_idx" ON "CartAction"("checkoutToken");

-- CreateIndex
CREATE INDEX "CartAction_shopifyCustomerId_idx" ON "CartAction"("shopifyCustomerId");

-- CreateIndex
CREATE INDEX "Order_shopId_idx" ON "Order"("shopId");

-- CreateIndex
CREATE INDEX "Order_shopifyOrderId_idx" ON "Order"("shopifyOrderId");

-- CreateIndex
CREATE INDEX "Order_clientId_idx" ON "Order"("clientId");

-- CreateIndex
CREATE INDEX "Order_checkoutToken_idx" ON "Order"("checkoutToken");

-- CreateIndex
CREATE INDEX "Order_shopifyCustomerId_idx" ON "Order"("shopifyCustomerId");

-- CreateIndex
CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");

-- CreateIndex
CREATE INDEX "OrderItem_productId_idx" ON "OrderItem"("productId");

-- AddForeignKey
ALTER TABLE "ProductView" ADD CONSTRAINT "ProductView_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductView" ADD CONSTRAINT "ProductView_productId_fkey" FOREIGN KEY ("productId") REFERENCES "ProductMetadata"("shopifyProductId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductView" ADD CONSTRAINT "ProductView_pixelSessionId_fkey" FOREIGN KEY ("pixelSessionId") REFERENCES "PixelSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductView" ADD CONSTRAINT "ProductView_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "PixelEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CartAction" ADD CONSTRAINT "CartAction_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CartAction" ADD CONSTRAINT "CartAction_productId_fkey" FOREIGN KEY ("productId") REFERENCES "ProductMetadata"("shopifyProductId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CartAction" ADD CONSTRAINT "CartAction_pixelSessionId_fkey" FOREIGN KEY ("pixelSessionId") REFERENCES "PixelSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CartAction" ADD CONSTRAINT "CartAction_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "PixelEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_pixelSessionId_fkey" FOREIGN KEY ("pixelSessionId") REFERENCES "PixelSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "PixelEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "ProductMetadata"("shopifyProductId") ON DELETE RESTRICT ON UPDATE CASCADE;
