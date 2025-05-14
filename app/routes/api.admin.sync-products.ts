import { json } from "@remix-run/node";
import prisma from "../db.server";
import { syncAllProductMetadata } from "../lib/product-metadata.server";
import shopify from "../shopify.server";
import { GraphqlClient } from "@shopify/shopify-api/dist/esm/lib/clients/admin/graphql/client.mjs";

export const action = async ({ request }) => {
  if (!process.env.SYNC_SECRET) {
    throw new Error("SYNC_SECRET environment variable is not set.");
  }

  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  if (token !== process.env.SYNC_SECRET) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const shopDomain = url.searchParams.get("shop");
  const shops = shopDomain
    ? await prisma.shop.findMany({ where: { domain: shopDomain }, select: { id: true, domain: true } })
    : await prisma.shop.findMany({ select: { id: true, domain: true } });

  const results = await Promise.all(
    shops.map(async (shop) => {
      const session = await prisma.session.findFirst({
        where: { shop: shop.domain, isOnline: false },
        orderBy: { expires: "desc" },
      });
      if (!session) {
        return { shop: shop.domain, error: "No offline session" };
      }

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
        apiVersion: shopify.apiVersion || "2023-01",
      });

      try {
        await syncAllProductMetadata(admin, shop.id, shop.domain);
        return { shop: shop.domain, status: "ok" };
      } catch (err) {
        return { shop: shop.domain, error: (err as Error).message, stack: (err as Error).stack };
      }
    })
  );

  return json({ results });
};

export const loader = async () => {
  return json({ error: "POST only" }, { status: 405 });
};
