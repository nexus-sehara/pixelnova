import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";

// --- Types ---
export interface RecommendationRequest {
  context: {
    sessionId?: string;
    customerId?: string;
    productId?: string;
  };
  type?: "session" | "aggregate" | "hybrid";
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

  // TODO: Implement real recommendation logic here
  // For now, return mock data
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