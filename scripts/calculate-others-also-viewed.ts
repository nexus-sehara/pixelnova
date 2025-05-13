import prisma from '../app/db.server';

const DAYS = 15;
const TOP_N = 10; // Number of co-occurring products to store per product

async function main() {
  const since = new Date(Date.now() - DAYS * 24 * 60 * 60 * 1000);
  console.log(`[OAV] Calculating for last ${DAYS} days since ${since.toISOString()}`);

  const shops = await prisma.shop.findMany({ select: { id: true, domain: true } });
  for (const shop of shops) {
    console.log(`[OAV] Processing shop: ${shop.domain}`);
    // Get all sessions with product views in the window
    const sessions = await prisma.pixelSession.findMany({
      where: { shopId: shop.id },
      select: { id: true },
    });
    const sessionIds = sessions.map((s: { id: string }) => s.id);
    if (sessionIds.length === 0) continue;

    // Get all product views in the window for these sessions
    const views = await prisma.productView.findMany({
      where: {
        pixelSessionId: { in: sessionIds },
        viewedAt: { gte: since },
      },
      select: { pixelSessionId: true, productId: true },
    });
    // Group views by session
    const sessionToProducts: Record<string, Set<string>> = {};
    for (const v of views) {
      if (!sessionToProducts[v.pixelSessionId]) sessionToProducts[v.pixelSessionId] = new Set();
      sessionToProducts[v.pixelSessionId].add(v.productId);
    }
    // Count co-occurrences
    const cooccurrence: Record<string, Record<string, number>> = {};
    for (const products of Object.values(sessionToProducts)) {
      const arr = Array.from(products);
      for (let i = 0; i < arr.length; i++) {
        for (let j = 0; j < arr.length; j++) {
          if (i === j) continue;
          const a = arr[i], b = arr[j];
          if (!cooccurrence[a]) cooccurrence[a] = {};
          cooccurrence[a][b] = (cooccurrence[a][b] || 0) + 1;
        }
      }
    }
    // Upsert top co-viewed products for each product
    for (const [productId, coMap] of Object.entries(cooccurrence)) {
      const sorted = Object.entries(coMap).sort((a, b) => b[1] - a[1]).slice(0, TOP_N);
      for (const [coViewedProductId, score] of sorted) {
        await prisma.productCooccurrence.upsert({
          where: {
            shopId_productId_coViewedProductId: {
              shopId: shop.id,
              productId,
              coViewedProductId,
            },
          },
          update: {
            score,
            lastUpdated: new Date(),
          },
          create: {
            shopId: shop.id,
            productId,
            coViewedProductId,
            score,
            lastUpdated: new Date(),
          },
        });
      }
    }
    console.log(`[OAV] Finished shop: ${shop.domain}`);
  }
  console.log('[OAV] Done!');
}

main().catch(e => {
  console.error(e);
  process.exit(1);
}); 