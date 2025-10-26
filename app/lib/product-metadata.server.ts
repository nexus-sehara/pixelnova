import { PrismaClient, Prisma } from '@prisma/client';
import { ShopifyApp } from '@shopify/shopify-app-remix/server'; // Assuming this is how you get Shopify context
// Or import admin from "../shopify.server"; // if you have a specific shopify.server.ts for admin context

const prisma = new PrismaClient();

/**
 * Extracts distinct Shopify Product GIDs from PixelEvent.eventData.
 * This function will need to iterate through different event types and their specific JSON structures.
 */
export async function getDistinctProductGidsFromEvents(shopId: string, since?: Date): Promise<string[]> {
  console.log(`[ProductMetadata] Fetching distinct product GIDs from PixelEvents for shopId: ${shopId}${since ? ' since ' + since.toISOString() : ''}`);
  
  const whereConditions: Prisma.PixelEventWhereInput = {
    shopId: shopId,
    // Potentially add a filter for eventType if we only care about specific ones
    // eventType: { in: ['product_viewed', 'product_added_to_cart'] } 
  };

  if (since) {
    whereConditions.timestamp = { gte: since };
  }

  const events = await prisma.pixelEvent.findMany({
    where: whereConditions,
    select: { eventData: true, eventType: true }, // Select eventType to guide parsing
  });

  const productGids = new Set<string>();

  events.forEach(event => {
    const data = event.eventData as any; // Using any for flexibility, consider defining types for eventData structures

    if (!data) return;

    let extractedGid: string | undefined | null;
    let productIdFromVariant: string | undefined | null;

    // event.eventData.data.productVariant.product.id
    if (data.data?.productVariant?.product?.id && typeof data.data.productVariant.product.id === 'string') {
      const DRAFT_ORDER_PREFIX = "gid://shopify/DraftOrder/";
      const PRODUCT_PREFIX = "gid://shopify/Product/";
      const numericProductId = data.data.productVariant.product.id.replace(PRODUCT_PREFIX, "");

      // Ensure it's a numeric ID after stripping potential GID prefix (in case it's sometimes a GID)
      if (/^\d+$/.test(numericProductId) && !data.data.productVariant.product.id.startsWith(DRAFT_ORDER_PREFIX)) {
        extractedGid = `${PRODUCT_PREFIX}${numericProductId}`;
        console.log(`[ProductMetadata] Extracted GID from product_viewed: ${extractedGid} from event:`, JSON.stringify(event, null, 2));
      } else {
        console.log(`[ProductMetadata] Skipped product_viewed GID: ${data.data.productVariant.product.id}`);
      }
    } else if (data.product?.id && typeof data.product.id === 'string' && data.product.id.startsWith('gid://shopify/Product/')) {
      
      extractedGid = data.product.id;
      console.log(`[ProductMetadata] Extracted GID from data.product.id: ${extractedGid}`);
    } else if (data.cartLine?.merchandise?.product?.id && typeof data.cartLine.merchandise.product.id === 'string' && data.cartLine.merchandise.product.id.startsWith('gid://shopify/Product/')) {
      // Common for product_added_to_cart
      extractedGid = data.cartLine.merchandise.product.id;
      console.log(`[ProductMetadata] Extracted GID from cartLine: ${extractedGid}`);
    } else if (data.checkout?.lineItems && Array.isArray(data.checkout.lineItems)) {
      // For checkout_started, checkout_completed
      const PRODUCT_PREFIX = "gid://shopify/Product/";
      const DRAFT_ORDER_PREFIX = "gid://shopify/DraftOrder/";
      data.checkout.lineItems.forEach((item: any) => {
        const productId = item.variant?.product?.id;
        if (productId && typeof productId === 'string') {
          const numericProductId = productId.replace(PRODUCT_PREFIX, "");
          if (/^\d+$/.test(numericProductId) && !productId.startsWith(DRAFT_ORDER_PREFIX)) {
            const gid = `${PRODUCT_PREFIX}${numericProductId}`;
            productGids.add(gid);
            console.log(`[ProductMetadata] Extracted GID from checkout.lineItems: ${gid} from event:`, JSON.stringify(event, null, 2));
          } else {
            console.log(`[ProductMetadata] Skipped checkout.lineItems GID: ${productId}`);
          }
        }
      });
    } else if (event.eventType === 'product_viewed' && data.id && typeof data.id === 'string' && data.id.startsWith('gid://shopify/Product/')) {
      extractedGid = data.id;
      console.log(`[ProductMetadata] Extracted GID from data.id: ${extractedGid}`);
    }
    // Potentially more complex parsing for other event types like 'collection_viewed'
    // For 'collection_viewed', data.collection.products.edges[].node.id might be the path for products within that collection context
    // or data.collection.productVariants for variants.
    
    // Example for a hypothetical collection_viewed structure if it contained product GIDs directly:
    // else if (event.eventType === 'collection_viewed' && data.collection?.products?.edges) {
    //   data.collection.products.edges.forEach((edge: any) => {
    //     if (edge.node?.id && typeof edge.node.id === 'string' && edge.node.id.startsWith('gid://shopify/Product/')) {
    //       productGids.add(edge.node.id);
    //     }
    //   });
    // }


    if (extractedGid) {
      productGids.add(extractedGid);
      console.log(`[ProductMetadata] Added GID to set: ${extractedGid}`);
    }
  });

  console.log(`[ProductMetadata] Found ${productGids.size} distinct product GIDs for shopId: ${shopId}`);
  return Array.from(productGids);
}

/**
 * Fetches product details from Shopify Admin API for a given Product GID.
 */
export async function fetchProductDetailsFromShopify(admin: any, productId: string): Promise<any | null> {
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
        variants(first: 10) {
          edges {
            node {
              id
              title
              sku
              price
              inventoryQuantity
              image { url }
            }
          }
        }
        collections(first: 10) {
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
    const response = await admin.graphql(graphqlQuery, { variables: { id: productId } });
    const contentType = response.headers.get('content-type');
    let responseBody;
    try {
      responseBody = await response.json();
    } catch (jsonErr) {
      // If JSON parsing fails, log the error and try to log the raw text
      const rawText = await response.text();
      console.error(`[ProductMetadata] Failed to parse JSON. Content-Type: ${contentType}. Raw response:`, rawText);
      return null;
    }

    if (!responseBody || !responseBody.data || !responseBody.data.product) {
      console.error(`[ProductMetadata] No product data returned for GID: ${productId}. Full response:`, JSON.stringify(responseBody, null, 2));
      return null;
    }
    return responseBody.data.product;
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

  const createData: Prisma.ProductMetadataCreateInput = {
    shopifyProductId: productGid,
    shop: { connect: { id: shopId } },
    title: shopifyProductData.title || 'N/A',
    handle: shopifyProductData.handle,
    productType: shopifyProductData.productType,
    vendor: shopifyProductData.vendor,
    tags: shopifyProductData.tags || [],
    status: shopifyProductData.status,
    minVariantPrice: shopifyProductData.priceRangeV2?.minVariantPrice?.amount
      ? parseFloat(shopifyProductData.priceRangeV2.minVariantPrice.amount)
      : undefined,
    maxVariantPrice: shopifyProductData.priceRangeV2?.maxVariantPrice?.amount
      ? parseFloat(shopifyProductData.priceRangeV2.maxVariantPrice.amount)
      : undefined,
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
  const updateData: Prisma.ProductMetadataUpdateInput = {
    title: shopifyProductData.title || 'N/A',
    handle: shopifyProductData.handle,
    productType: shopifyProductData.productType,
    vendor: shopifyProductData.vendor,
    tags: shopifyProductData.tags || [],
    status: shopifyProductData.status,
    minVariantPrice: shopifyProductData.priceRangeV2?.minVariantPrice?.amount
      ? parseFloat(shopifyProductData.priceRangeV2.minVariantPrice.amount)
      : undefined,
    maxVariantPrice: shopifyProductData.priceRangeV2?.maxVariantPrice?.amount
      ? parseFloat(shopifyProductData.priceRangeV2.maxVariantPrice.amount)
      : undefined,
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

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function fetchAllProductsFromShopify(admin: any): Promise<any[]> {
  let hasNextPage = true;
  let endCursor = null;
  const allProducts: any[] = [];
  const MAX_RETRIES = 5;

  while (hasNextPage) {
    let response: Response | undefined;
    let data: any;
    let retries = 0;
    while (true) {
      try {
        response = await admin.graphql(
          `
          query getProducts($cursor: String) {
            products(first: 100, after: $cursor) {
              edges {
                node {
                  id
                  title
                  handle
                  productType
                  vendor
                  tags
                  status
                  createdAt
                  updatedAt
                  featuredImage { url }
                  priceRangeV2 {
                    minVariantPrice { amount currencyCode }
                    maxVariantPrice { amount currencyCode }
                  }
                  variants(first: 10) {
                    edges {
                      node {
                        id
                        title
                        sku
                        price
                        inventoryQuantity
                        image { url }
                      }
                    }
                  }
                  collections(first: 10) {
                    edges {
                      node {
                        id
                        title
                        handle
                      }
                    }
                  }
                }
                cursor
              }
              pageInfo {
                hasNextPage
                endCursor
              }
            }
          }
          `,
          { variables: { cursor: endCursor } }
        );
        const statusCode = response ? response.status : undefined;
        if (statusCode === 429) {
          throw { isRateLimit: true };
        }
        data = await response.json();
        break; // Success
      } catch (err: any) {
        const statusCode = response ? response.status : undefined;
        if ((statusCode === 429) || err.isRateLimit) {
          const wait = 1000 * Math.pow(2, retries); // Exponential backoff
          console.warn(`[ProductMetadata] Rate limited by Shopify. Retrying in ${wait}ms... (attempt ${retries + 1})`);
          await sleep(wait);
          retries++;
          if (retries > MAX_RETRIES) {
            throw new Error('Exceeded max retries due to rate limiting');
          }
        } else {
          throw err;
        }
      }
    }
    const edges = data.data.products.edges;
    allProducts.push(...edges.map((edge: any) => edge.node));
    hasNextPage = data.data.products.pageInfo.hasNextPage;
    endCursor = data.data.products.pageInfo.endCursor;
    await sleep(250); // 250ms = 4 requests/sec (safe for most stores)
  }

  return allProducts;
}

// Replace syncAllProductMetadata with a full catalog sync
export async function syncAllProductMetadata(admin: any, shopId: string, shopDomain: string) {
  console.log(`[ProductMetadata] Starting FULL catalog sync for shopId: ${shopId} (${shopDomain})`);

  const allProducts = await fetchAllProductsFromShopify(admin);

  for (const product of allProducts) {
    await upsertProductMetadata(shopId, product);
  }

  console.log(`[ProductMetadata] Finished FULL catalog sync for shop: ${shopDomain}. Synced ${allProducts.length} products.`);
} 
