import { PrismaClient, Prisma, ProductMetadataCreateInput, ProductMetadataUpdateInput } from '@prisma/client';
import { ShopifyApp } from '@shopify/shopify-app-remix/server'; // Assuming this is how you get Shopify context
// Or import admin from "../shopify.server"; // if you have a specific shopify.server.ts for admin context

const prisma = new PrismaClient();

/**
 * Extracts distinct Shopify Product GIDs from PixelEvent.eventData.
 * This function will need to iterate through different event types and their specific JSON structures.
 */
export async function getDistinctProductGidsFromEvents(since?: Date): Promise<string[]> {
  console.log(`[ProductMetadata] Fetching distinct product GIDs from PixelEvents${since ? ' since ' + since.toISOString() : ''}`);
  // TODO: Implement logic to query PixelEvent table
  // - Filter events (e.g., product_viewed, product_added_to_cart, checkout_completed)
  // - Parse eventData JSON to extract product GIDs (e.g., data.product.id, data.cartLine.merchandise.product.id, etc.)
  // - Ensure they are valid GIDs (e.g., starts with "gid://shopify/Product/")
  // - Return a unique list of GIDs
  // Example: 
  // const events = await prisma.pixelEvent.findMany({ where: { /* conditions */ }, select: { eventData: true } });
  // const productGids = new Set<string>();
  // events.forEach(event => { /* parsing logic */ });
  // return Array.from(productGids);
  return []; // Placeholder
}

/**
 * Fetches product details from Shopify Admin API for a given Product GID.
 */
export async function fetchProductDetailsFromShopify(admin: any, productId: string): Promise<any | null> { // Replace 'any' with a proper Shopify Admin API client type
  console.log(`[ProductMetadata] Fetching details for product GID: ${productId} from Shopify`);
  const graphqlQuery = `
    query getProductDetails($id: ID!) {
      product(id: $id) {
        id
        title
        handle
        productType
        vendor
        tags
        status
        createdAt
        updatedAt
        featuredImage {
          url
        }
        priceRangeV2 {
          minVariantPrice {
            amount
            currencyCode
          }
          maxVariantPrice {
            amount
            currencyCode
          }
        }
        variants(first: 10) { # Limiting to 10 variants for now, can be configured
          edges {
            node {
              id
              title
              sku
              price
              inventoryQuantity
              # inventoryPolicy # This might require higher permissions or specific API version
              image { url }
            }
          }
        }
        collections(first: 10) { # Limiting to 10 collections
          edges {
            node {
              id
              title
              handle
            }
          }
        }
      }
    }
  `;

  try {
    // Assuming 'admin.graphql' is the method to make GraphQL calls
    // This needs to be adapted based on how you get an authenticated Shopify admin client
    const response = await admin.graphql(graphqlQuery, { variables: { id: productId } });
    
    // Basic check for response structure - needs to be robust
    if (!response || !response.product) { // Check based on actual Shopify API response structure
        console.error(`[ProductMetadata] No product data returned for GID: ${productId}`, response);
        return null;
    }
    return response.product; // Or response.data.product depending on your GraphQL client
  } catch (error) {
    console.error(`[ProductMetadata] Error fetching product ${productId} from Shopify:`, error);
    return null;
  }
}

/**
 * Transforms Shopify product data (from Admin API) into the structure needed for ProductMetadata table
 * and upserts it into the database.
 */
export async function upsertProductMetadata(
  shopId: string, 
  shopifyProductData: any // Replace 'any' with a type representing the fetched Shopify product data
): Promise<void> {
  console.log(`[ProductMetadata] Upserting metadata for product GID: ${shopifyProductData.id} for shopId: ${shopId}`);
  
  const productGid = shopifyProductData.id;
  if (!productGid || !shopId) {
    console.error('[ProductMetadata] Missing productGid or shopId for upsert.');
    return;
  }

  const createData: ProductMetadataCreateInput = {
    shopifyProductId: productGid,
    shop: { connect: { id: shopId } },
    title: shopifyProductData.title || 'N/A',
    handle: shopifyProductData.handle,
    productType: shopifyProductData.productType,
    vendor: shopifyProductData.vendor,
    tags: shopifyProductData.tags || [],
    status: shopifyProductData.status,
    minVariantPrice: shopifyProductData.priceRangeV2?.minVariantPrice?.amount,
    maxVariantPrice: shopifyProductData.priceRangeV2?.maxVariantPrice?.amount,
    currencyCode: shopifyProductData.priceRangeV2?.minVariantPrice?.currencyCode, // Assuming currency is same for min/max
    featuredImageUrl: shopifyProductData.featuredImage?.url,
    variantsData: shopifyProductData.variants?.edges.map((edge: any) => edge.node) || Prisma.JsonNull,
    collectionsData: shopifyProductData.collections?.edges.map((edge: any) => edge.node) || Prisma.JsonNull,
    shopifyCreatedAt: shopifyProductData.createdAt ? new Date(shopifyProductData.createdAt) : undefined,
    shopifyUpdatedAt: shopifyProductData.updatedAt ? new Date(shopifyProductData.updatedAt) : undefined,
    lastFetchedAt: new Date(),
  };

  // For the update, we want to update all fields if the product is re-fetched
  // Prisma's upsert needs separate create and update objects.
  // The update object should not try to update the relation or shopifyProductId if it's part of the where clause.
  const updateData: ProductMetadataUpdateInput = {
    title: shopifyProductData.title || 'N/A',
    handle: shopifyProductData.handle,
    productType: shopifyProductData.productType,
    vendor: shopifyProductData.vendor,
    tags: shopifyProductData.tags || [],
    status: shopifyProductData.status,
    minVariantPrice: shopifyProductData.priceRangeV2?.minVariantPrice?.amount,
    maxVariantPrice: shopifyProductData.priceRangeV2?.maxVariantPrice?.amount,
    currencyCode: shopifyProductData.priceRangeV2?.minVariantPrice?.currencyCode,
    featuredImageUrl: shopifyProductData.featuredImage?.url,
    variantsData: shopifyProductData.variants?.edges.map((edge: any) => edge.node) || Prisma.JsonNull,
    collectionsData: shopifyProductData.collections?.edges.map((edge: any) => edge.node) || Prisma.JsonNull,
    shopifyCreatedAt: shopifyProductData.createdAt ? new Date(shopifyProductData.createdAt) : undefined,
    shopifyUpdatedAt: shopifyProductData.updatedAt ? new Date(shopifyProductData.updatedAt) : undefined,
    lastFetchedAt: new Date(),
  };

  try {
    await prisma.productMetadata.upsert({
      where: { shopifyProductId: productGid }, // shopId is implicitly part of the data due to relation or can be added if unique constraint is (shopId, shopifyProductId)
                                              // Given shopifyProductId is @unique, it's sufficient here unless you filter by shop first for some reason.
      create: createData,
      update: updateData,
    });
    console.log(`[ProductMetadata] Successfully upserted metadata for product GID: ${productGid}`);
  } catch (error) {
    console.error(`[ProductMetadata] Error upserting metadata for product GID ${productGid}:`, error);
  }
}

/**
 * Main function to orchestrate the fetching and storing of product metadata.
 * To be called from a Remix action or a scheduled job.
 */
export async function syncAllProductMetadata(admin: any, shopId: string, shopDomain: string) { // Pass authenticated admin and shopId
  console.log(`[ProductMetadata] Starting sync for shopId: ${shopId} (${shopDomain})`);
  
  // 1. Get distinct product GIDs from PixelEvents that are not yet in ProductMetadata or haven't been fetched recently.
  // This needs more sophisticated logic: find GIDs in PixelEvents, then check against ProductMetadata.
  const productGidsToFetch = await getDistinctProductGidsFromEvents(); // Simplified for now

  const existingMetadata = await prisma.productMetadata.findMany({
    where: { shopId: shopId, shopifyProductId: { in: productGidsToFetch } },
    select: { shopifyProductId: true, lastFetchedAt: true },
  });

  // Define the type for meta based on the select clause
  type ExistingMeta = {
    shopifyProductId: string;
    lastFetchedAt: Date | null;
  };

  const gidsAlreadyFetchedRecently = new Set(
    existingMetadata
      .filter((meta: ExistingMeta) => meta.lastFetchedAt && (new Date().getTime() - meta.lastFetchedAt.getTime()) < (24 * 60 * 60 * 1000)) // e.g., skip if fetched in last 24h
      .map((meta: ExistingMeta) => meta.shopifyProductId)
  );

  const finalGidsToProcess = productGidsToFetch.filter(gid => !gidsAlreadyFetchedRecently.has(gid));
  console.log(`[ProductMetadata] Found ${productGidsToFetch.length} distinct GIDs from events. After filtering recently fetched, ${finalGidsToProcess.length} GIDs to process.`);

  for (const gid of finalGidsToProcess) {
    if (!gid.startsWith('gid://shopify/Product/')) {
        console.warn(`[ProductMetadata] Skipping invalid or non-product GID: ${gid}`);
        continue;
    }
    const productData = await fetchProductDetailsFromShopify(admin, gid);
    if (productData) {
      await upsertProductMetadata(shopId, productData);
    }
  }
  console.log(`[ProductMetadata] Finished sync for shop: ${shopDomain}`);
} 