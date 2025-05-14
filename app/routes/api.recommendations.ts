import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
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

// --- Helper functions ---
async function getPersonalityType(context: any): Promise<string | undefined> {
  if (context.sessionId) {
    const session = await prisma.pixelSession.findUnique({
      where: { id: context.sessionId },
      select: { personalityType: true }
    });
    return session?.personalityType;
  } else if (context.customerId) {
    const profile = await prisma.userProfile.findUnique({
      where: { userId: context.customerId },
      select: { personalityType: true }
    });
    return profile?.personalityType;
  }
  return undefined;
}

async function getSessionRecommendations(context: any, limit: number): Promise<Recommendation[]> {
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
  const cartProductIds = new Set(cartActions.map((a: { productId: string }) => a.productId));
  const productScores: Record<string, number> = {};
  for (const v of views) {
    const timeDiff = (now - new Date(v.viewedAt).getTime()) / 1000;
    const decay = Math.exp(-DECAY_LAMBDA * timeDiff);
    productScores[v.productId] = (productScores[v.productId] || 0) + VIEW_WEIGHT * decay;
  }
  for (const a of cartActions) {
    const timeDiff = (now - new Date(a.timestamp).getTime()) / 1000;
    const decay = Math.exp(-DECAY_LAMBDA * timeDiff);
    productScores[a.productId] = (productScores[a.productId] || 0) + ADD_TO_CART_WEIGHT * decay;
  }
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
  return scoredProducts.map(([productId, score]) => {
    const meta = metaMap.get(productId);
    return {
      productId,
      title: meta?.title || "Product",
      image: meta?.image || "",
      url: meta?.url || "",
      score: Number(score),
      reason: "Session-based behavior score"
    };
  });
}

async function getOthersAlsoViewedRecommendations(context: any, limit: number): Promise<Recommendation[]> {
  const productMeta = await prisma.productMetadata.findUnique({
    where: { shopifyProductId: context.productId },
    select: { shopId: true },
  });
  if (!productMeta) return [];
  const coViewed = await prisma.productCooccurrence.findMany({
    where: {
      shopId: productMeta.shopId,
      productId: context.productId,
      coViewedProductId: { not: context.productId },
    },
    orderBy: { score: "desc" },
    take: limit,
  });
  const coViewedIds = coViewed.map((c: { coViewedProductId: string }) => c.coViewedProductId);
  const metas = await prisma.productMetadata.findMany({
    where: { shopifyProductId: { in: coViewedIds } },
    select: { shopifyProductId: true, title: true, featuredImageUrl: true, handle: true },
  });
  type Meta = { shopifyProductId: string; title?: string; featuredImageUrl?: string; handle?: string };
  const metaMap = new Map<string, Meta>(metas.map((m: Meta) => [m.shopifyProductId, m]));
  return coViewed.map((c: { coViewedProductId: string; score: number }): Recommendation => {
    const meta = metaMap.get(c.coViewedProductId) || { title: '', featuredImageUrl: '', handle: '', shopifyProductId: '' };
    return {
      productId: c.coViewedProductId,
      title: meta.title || "Product",
      image: meta.featuredImageUrl || "",
      url: meta.handle ? `/products/${meta.handle}` : "",
      score: c.score,
      reason: "Others also viewed this product"
    };
  });
}

async function getFrequentlyBoughtTogetherRecommendations(context: any, limit: number): Promise<Recommendation[]> {
  const productMeta = await prisma.productMetadata.findUnique({
    where: { shopifyProductId: context.productId },
    select: { shopId: true },
  });
  if (!productMeta) return [];
  const fbt = await prisma.frequentlyBoughtTogether.findMany({
    where: {
      shopId: productMeta.shopId,
      productId: context.productId,
      boughtWithProductId: { not: context.productId },
    },
    orderBy: { score: "desc" },
    take: limit,
  });
  const fbtIds = fbt.map((f: { boughtWithProductId: string }) => f.boughtWithProductId);
  const metas = await prisma.productMetadata.findMany({
    where: { shopifyProductId: { in: fbtIds } },
    select: { shopifyProductId: true, title: true, featuredImageUrl: true, handle: true },
  });
  type Meta = { shopifyProductId: string; title?: string; featuredImageUrl?: string; handle?: string };
  const metaMap = new Map<string, Meta>(metas.map((m: Meta) => [m.shopifyProductId, m]));
  return fbt.map((f: { boughtWithProductId: string; score: number }): Recommendation => {
    const meta = metaMap.get(f.boughtWithProductId) || { title: '', featuredImageUrl: '', handle: '', shopifyProductId: '' };
    return {
      productId: f.boughtWithProductId,
      title: meta.title || "Product",
      image: meta.featuredImageUrl || "",
      url: meta.handle ? `/products/${meta.handle}` : "",
      score: f.score,
      reason: "Frequently bought together"
    };
  });
}

async function getPopularProductRecommendations(limit: number): Promise<Recommendation[]> {
  const popular = await prisma.popularProduct.findMany({
    orderBy: { score: "desc" },
    take: limit,
  });
  const popIds = popular.map((p: { productId: string }) => p.productId);
  const metas = await prisma.productMetadata.findMany({
    where: { shopifyProductId: { in: popIds } },
    select: { shopifyProductId: true, title: true, featuredImageUrl: true, handle: true },
  });
  type Meta = { shopifyProductId: string; title?: string; featuredImageUrl?: string; handle?: string };
  const metaMap = new Map<string, Meta>(metas.map((m: Meta) => [m.shopifyProductId, m]));
  return popular.map((p: { productId: string; score: number }): Recommendation => {
    const meta = metaMap.get(p.productId) || { title: '', featuredImageUrl: '', handle: '', shopifyProductId: '' };
    return {
      productId: p.productId,
      title: meta.title || "Product",
      image: meta.featuredImageUrl || "",
      url: meta.handle ? `/products/${meta.handle}` : "",
      score: p.score,
      reason: "Popular product"
    };
  });
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

  // --- Fetch personalityType for hybrid/aggregate strategies ---
  const personalityType = await getPersonalityType(context);

  // --- Session-based Recommendations ---
  if (type === "session" && context.sessionId) {
    const recommendations = await getSessionRecommendations(context, limit);
    return json({ recommendations });
  }

  // --- Others Also Viewed ---
  if (type === "others-also-viewed" && context.productId) {
    const recommendations = await getOthersAlsoViewedRecommendations(context, limit);
    return json({ recommendations });
  }

  // --- Aggregate Recommendations ---
  if (type === "aggregate" && context.productId) {
    // Try FBT first, fallback to popular
    let recommendations = await getFrequentlyBoughtTogetherRecommendations(context, limit);
    if (recommendations.length === 0) {
      recommendations = await getPopularProductRecommendations(limit);
    }
    return json({ recommendations });
  }
  if (type === "aggregate" && context.customerId) {
    // Popular products for the shop
    const recommendations = await getPopularProductRecommendations(limit);
    return json({ recommendations });
  }

  // --- Hybrid/Personality-based Recommendations ---
  if (type === "hybrid" && personalityType) {
    let recommendations: Recommendation[] = [];
    switch (personalityType) {
      case "Explorer":
        if (context.productId) {
          recommendations = await getOthersAlsoViewedRecommendations(context, limit);
        } else {
          recommendations = await getPopularProductRecommendations(limit);
        }
        break;
      case "FocusedBuyer":
        if (context.productId) {
          recommendations = await getFrequentlyBoughtTogetherRecommendations(context, limit);
        } else {
          recommendations = await getPopularProductRecommendations(limit);
        }
        break;
      case "BargainHunter":
        // For now, use popular products (replace with discounted logic when available)
        recommendations = await getPopularProductRecommendations(limit);
        break;
      case "TrendSeeker":
        recommendations = await getPopularProductRecommendations(limit);
        break;
      case "LoyalReturner":
        // Use FBT or popular
        if (context.productId) {
          recommendations = await getFrequentlyBoughtTogetherRecommendations(context, limit);
        } else {
          recommendations = await getPopularProductRecommendations(limit);
        }
        break;
      case "GeneralShopper":
      default:
        recommendations = await getPopularProductRecommendations(limit);
        break;
    }
    return json({ recommendations });
  }

  // --- Fallback: return mock data ---
  const recommendations: Recommendation[] = [
    {
      productId: "gid://shopify/Product/9913126912288",
      title: "DR MARTENS | 1460Z DMC 8-EYE BOOT | CHERRY SMOOTH",
      image: "https://cdn.shopify.com/s/files/1/0944/0326/4800/files/product_19_image1.jpg",
      url: "/products/dr-martens-1460z-dmc-8-eye-boot-cherry-smooth",
      score: 0.92,
      reason: "Frequently bought together"
    }
  ].slice(0, limit);
  const response: RecommendationResponse = { recommendations };
  return json(response);
}

// --- Test GET endpoint for debugging ---
export async function loader({ request }: LoaderFunctionArgs) {
  return json({
    message: "Recommendation API is working!",
    exampleRequest: {
      context: { sessionId: "...", productId: "..." },
      type: "hybrid",
      limit: 8
    }
  });
} 