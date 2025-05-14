import { json } from "@remix-run/node";
import prisma from "../db.server";
import { syncAllProductMetadata } from "../lib/product-metadata.server";
import shopify from "../shopify.server";

export const action = async ({ request }) => {
  // Simple token check (add to your .env: SYNC_SECRET=your-secret)
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  if (token !== process.env.SYNC_SECRET) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  // Optionally, allow ?shop=domain to sync a single shop
  const shopDomain = url.searchParams.get("shop");
  let shops;
  if (shopDomain) {
    shops = await prisma.shop.findMany({ where: { domain: shopDomain }, select: { id: true, domain: true } });
  } else {
    shops = await prisma.shop.findMany({ select: { id: true, domain: true } });
  }

  let results = [];
  for (const shop of shops) {
    // Get admin client for shop (reuse your logic)
    const session = await prisma.session.findFirst({
      where: { shop: shop.domain, isOnline: false },
      orderBy: { expires: "desc" },
    });
    if (!session) {
      results.push({ shop: shop.domain, error: "No offline session" });
      continue;
    }
    // Dynamically require GraphqlClient as before
    // @ts-ignore
    const { GraphqlClient } = require("@shopify/shopify-api/dist/esm/lib/clients/admin/graphql/client.mjs");
    const admin = new GraphqlClient({
      session: {
        id: "offline_" + shop.domain,
        shop: shop.domain,
        state: "",
        isOnline: false,
        accessToken: session.accessToken,
        scope: session.scope,
        expires: session.expires,
      },
      apiVersion: (shopify as any).apiVersion,
    });

    try {
      await syncAllProductMetadata(admin, shop.id, shop.domain);
      results.push({ shop: shop.domain, status: "ok" });
    } catch (err) {
      results.push({ shop: shop.domain, error: (err as Error).message });
    }
  }

  return json({ results });
};

export const loader = async (_args: { request: Request }) => {
  return json({ error: "POST only" }, { status: 405 });
}; 
