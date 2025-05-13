import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import prisma from "../db.server";

// --- Types ---
export interface RecommendationRequest {
  context: {
    sessionId?: string;
    customerId?: string;
    productId?: string;
  };
  type?: "session" | "aggregate" | "hybrid" | "others-also-viewed";
  limit?: number;
}

export interface Recommendation {
  productId: string;
  title: string;
  image: string;
  url: string;
  score?: number;
  reason?: string;
}

export interface RecommendationResponse {
  recommendations: Recommendation[];
}

// --- Handler ---
export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return json({ error: "Method Not Allowed" }, { status: 405 });
  }

  let body: RecommendationRequest;
  try {
    body = await request.json();
  } catch (e) {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { context, type = "hybrid", limit = 8 } = body;
  if (!context || (!context.sessionId && !context.customerId && !context.productId)) {
    return json({ error: "At least one of sessionId, customerId, or productId must be provided in context." }, { status: 400 });
  }

  // --- Real Recommendation Logic: Recently Viewed in Session ---
  if (type === "session" && context.sessionId) {
    // Configurable weights and decay
    const VIEW_WEIGHT = 1;
    const ADD_TO_CART_WEIGHT = 5;
    const DECAY_LAMBDA = 0.001;
    const TIME_WINDOW_SECONDS = 3600; // 1 hour
    const now = Date.now();
    const timeCutoff = new Date(now - TIME_WINDOW_SECONDS * 1000);

    // Fetch product views and add-to-cart actions for this session within the time window
    const views = await prisma.productView.findMany({
      where: {
        pixelSessionId: context.sessionId,
        viewedAt: { gte: timeCutoff },
      },
      select: { productId: true, viewedAt: true },
    });
    const cartActions = await prisma.cartAction.findMany({
      where: {
        pixelSessionId: context.sessionId,
        timestamp: { gte: timeCutoff },
        actionType: "add",
      },
      select: { productId: true, timestamp: true },
    });
    // Optionally, get all products in the cart for exclusion
    const cartProductIds = new Set(cartActions.map((a: { productId: string }) => a.productId));

    // Score products
    const productScores: Record<string, number> = {};
    // Score views
    for (const v of views) {
      const timeDiff = (now - new Date(v.viewedAt).getTime()) / 1000;
      const decay = Math.exp(-DECAY_LAMBDA * timeDiff);
      productScores[v.productId] = (productScores[v.productId] || 0) + VIEW_WEIGHT * decay;
    }
    // Score add-to-cart (higher weight)
    for (const a of cartActions) {
      const timeDiff = (now - new Date(a.timestamp).getTime()) / 1000;
      const decay = Math.exp(-DECAY_LAMBDA * timeDiff);
      productScores[a.productId] = (productScores[a.productId] || 0) + ADD_TO_CART_WEIGHT * decay;
    }
    // Remove products already in the cart from recommendations
    const scoredProducts = Object.entries(productScores)
      .filter(([productId]) => !cartProductIds.has(productId))
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit);
    const productIds = scoredProducts.map(([productId]) => productId);
    const metas = await prisma.productMetadata.findMany({
      where: { shopifyProductId: { in: productIds } },
      select: { shopifyProductId: true, title: true, image: true, url: true },
    });
    const metaMap = new Map<string, { shopifyProductId: string; title?: string; image?: string; url?: string }>(
      metas.map((m: { shopifyProductId: string; title?: string; image?: string; url?: string }) => [m.shopifyProductId, m])
    );
    const recommendations: Recommendation[] = scoredProducts.map(([productId, score], idx) => {
      const meta = metaMap.get(productId) as { shopifyProductId: string; title?: string; image?: string; url?: string } | undefined;
      return {
        productId,
        title: meta?.title || "Product",
        image: meta?.image || "",
        url: meta?.url || "",
        score: Number(score),
        reason: "Session-based behavior score"
      };
    });
    return json({ recommendations });
  }

  // --- Others Also Viewed Recommendation ---
  if (type === "others-also-viewed" && context.productId) {
    // Find the shopId for this product
    const productMeta = await prisma.productMetadata.findUnique({
      where: { shopifyProductId: context.productId },
      select: { shopId: true },
    });
    if (!productMeta) {
      return json({ recommendations: [] });
    }
    // Get top co-viewed products for this product in this shop
    const coViewed = await prisma.productCooccurrence.findMany({
      where: {
        shopId: productMeta.shopId,
        productId: context.productId,
        coViewedProductId: { not: context.productId }, // Exclude self
      },
      orderBy: { score: "desc" },
      take: limit,
    });
    const coViewedIds = coViewed.map(c => c.coViewedProductId);
    const metas = await prisma.productMetadata.findMany({
      where: { shopifyProductId: { in: coViewedIds } },
      select: { shopifyProductId: true, title: true, featuredImageUrl: true, handle: true },
    });
    const metaMap = new Map(metas.map((m: { shopifyProductId: string; title?: string; featuredImageUrl?: string; handle?: string }) => [m.shopifyProductId, m]));
    const recommendations: Recommendation[] = coViewed.map((c: { coViewedProductId: string; score: number }, idx: number) => {
      const meta = metaMap.get(c.coViewedProductId) as { shopifyProductId: string; title?: string; featuredImageUrl?: string; handle?: string } | undefined;
      return {
        productId: c.coViewedProductId,
        title: meta?.title || "Product",
        image: meta?.featuredImageUrl || "",
        url: meta?.handle ? `/products/${meta.handle}` : "",
        score: c.score,
        reason: "Others also viewed this product"
      };
    });
    return json({ recommendations });
  }

  // TODO: Add aggregate/hybrid logic here

  // Fallback: return mock data
  const recommendations: Recommendation[] = [
    {
      productId: "gid://shopify/Product/9913126912288",
      title: "DR MARTENS | 1460Z DMC 8-EYE BOOT | CHERRY SMOOTH",
      image: "https://cdn.shopify.com/s/files/1/0944/0326/4800/files/product_19_image1.jpg",
      url: "/products/dr-martens-1460z-dmc-8-eye-boot-cherry-smooth",
      score: 0.92,
      reason: "Frequently bought together"
    }
    // ...more mock products
  ].slice(0, limit);

  const response: RecommendationResponse = { recommendations };
  return json(response);
} 