import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import prisma from "../db.server";
import type { Prisma } from "@prisma/client"; // Import Prisma namespace for types

console.log(`[${new Date().toISOString()}] MODULE LOADED: app/routes/api.pixel-events.ts`);

// Define event names as constants for better maintainability and to avoid typos
const PixelEventNames = {
  PRODUCT_VIEWED: 'product_viewed',
  PRODUCT_ADDED_TO_CART: 'product_added_to_cart',
  PRODUCT_REMOVED_FROM_CART: 'product_removed_from_cart',
  CHECKOUT_STARTED: 'checkout_started',
  CHECKOUT_COMPLETED: 'checkout_completed',
} as const;

// Basic interface for the Shopify Customer object that might be present at the root of an event
interface ShopifyCustomer {
  id?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  // Add other relevant fields if needed, like marketingConsent, etc.
}

// Basic interface for the expected top-level structure of the pixel event payload
interface PixelEventPayload {
  metadata?: {
    eventName?: string;
    shopDomain?: string;
    uniqueToken?: string;
  };
  context?: {
    document?: {
      location?: {
        hostname?: string;
      };
    };
  };
  id: string; // Event ID
  timestamp?: string; // ISO string
  clientId?: string;
  data?: any; // Event-specific data payload
  customer?: ShopifyCustomer; // Root-level customer object from Shopify standard events
}

// Allowed origins logic
const getAllowedOrigins = () => {
  const allowed: (string | RegExp)[] = [
    /^https?:\/\/[a-zA-Z0-9-]+\.myshopify\.com$/, // Shopify store domains
    /^https?:\/\/checkout\.shopify\.com$/, // Shopify checkout domain
    /^https?:\/\/[a-zA-Z0-9-]+-pr-\d+\.onrender\.com$/, // Render preview domains
  ];
  if (process.env.SHOPIFY_APP_URL) {
    try {
      const customDomain = new URL(process.env.SHOPIFY_APP_URL).origin;
      allowed.push(customDomain);
    } catch (e) {
      console.error("Invalid SHOPIFY_APP_URL for CORS:", e);
    }
  }
  // For local development with Shopify CLI, ngrok URLs might be used
  // Shopify CLI typically sets HOST to the ngrok tunnel URL
  if (process.env.NODE_ENV === 'development' && process.env.HOST) {
    try {
        const localTunnel = new URL(process.env.HOST).origin;
        allowed.push(localTunnel);
        console.log(`[CORS] Added local development origin: ${localTunnel}`);
    } catch(e) {
        console.warn("Could not add HOST to allowed origins for local dev:", e);
    }
  }
  return allowed;
};

function setCorsHeaders(responseHeaders: Headers, requestOrigin: string | null) {
  const allowedOriginsPatterns = getAllowedOrigins();
  let originAllowed = false;
  let matchedPattern: string | RegExp | null = null;

  if (requestOrigin) {
    for (const pattern of allowedOriginsPatterns) {
      if (typeof pattern === 'string' && pattern === requestOrigin) {
        originAllowed = true;
        matchedPattern = pattern;
        break;
      }
      if (pattern instanceof RegExp && pattern.test(requestOrigin)) {
        originAllowed = true;
        matchedPattern = pattern;
        break;
      }
    }
  }

  responseHeaders.set("Vary", "Origin"); // Important for caching proxies

  if (originAllowed && requestOrigin) {
    responseHeaders.set("Access-Control-Allow-Origin", requestOrigin);
    responseHeaders.set("Access-Control-Allow-Credentials", "true");
    // console.log(`[CORS] Allowed: ${requestOrigin} (matched ${matchedPattern})`); // Kept for debugging if needed, can be noisy
  } else if (requestOrigin) {
    console.warn(`[CORS] Blocked: ${requestOrigin} (no match in [${allowedOriginsPatterns.join(', ')}])`);
  } else {
    // No origin header present, common for same-origin or server-to-server requests.
    // No ACAO header needed in this case. Some strict policies might require an origin.
  }

  responseHeaders.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  responseHeaders.set("Access-Control-Allow-Headers", "Content-Type, Authorization, Origin, Accept, X-Shopify-Hmac-Sha256");
  responseHeaders.set("Access-Control-Max-Age", "86400"); // Cache preflight response for 1 day
}

export async function loader({ request }: LoaderFunctionArgs) {
  const timestamp = new Date().toISOString();
  // console.log(`[${timestamp}] LOADER: Invoked for ${request.method} request to /api/pixel-events.`); // Can be noisy

  const requestOrigin = request.headers.get("Origin");
  // console.log(`[${timestamp}] LOADER: Detected Origin: ${requestOrigin || "undefined"}`);

  const responseHeaders = new Headers();
  setCorsHeaders(responseHeaders, requestOrigin);

  if (request.method === "OPTIONS") {
    // console.log(`[${timestamp}] LOADER (OPTIONS): Responding with status 204. ACAO: ${responseHeaders.get("Access-Control-Allow-Origin") || "Not set"}`);
    return new Response(null, { status: 204, headers: responseHeaders });
  }

  console.log(`[${timestamp}] LOADER: ${request.method} request to /api/pixel-events, not allowed by loader. Responding 405.`);
  return json({ error: "Method Not Allowed by loader" }, { status: 405, headers: responseHeaders });
}

// Helper to convert numeric product IDs to Shopify GID format if not already
function toShopifyGID(numericId: string | undefined | null): string | undefined {
  if (!numericId) return undefined;
  const idStr = String(numericId); // Ensure it's a string
  if (idStr.startsWith('gid://shopify/Product/')) return idStr;
  return `gid://shopify/Product/${idStr}`;
}

// Helper for updating ProductCooccurrence symmetrically
async function updateCooccurrence(shopId: string, productId1: string, productId2: string, timestamp: string) {
  try {
    // Product 1 -> Product 2
    await prisma.productCooccurrence.upsert({
      where: { shopId_productId_coViewedProductId: { shopId, productId: productId1, coViewedProductId: productId2 }},
      update: { score: { increment: 1 } },
      create: { shopId, productId: productId1, coViewedProductId: productId2, score: 1 }
    });
    // Product 2 -> Product 1
    await prisma.productCooccurrence.upsert({
      where: { shopId_productId_coViewedProductId: { shopId, productId: productId2, coViewedProductId: productId1 }},
      update: { score: { increment: 1 } },
      create: { shopId, productId: productId2, coViewedProductId: productId1, score: 1 }
    });
  } catch (e: any) {
    console.error(`[${timestamp}] AGG_ERROR (Cooccurrence): Failed for ${productId1} <> ${productId2}. Error: ${e.message}`);
  }
}

// Helper for updating FrequentlyBoughtTogether symmetrically
async function updateFBT(shopId: string, productId1: string, productId2: string, timestamp: string) {
  try {
    const now = new Date();
    // Product 1 -> Product 2
    await prisma.frequentlyBoughtTogether.upsert({
      where: { shopId_productId_boughtWithProductId: { shopId, productId: productId1, boughtWithProductId: productId2 }},
      update: { score: { increment: 1 }, lastUpdated: now },
      create: { shopId, productId: productId1, boughtWithProductId: productId2, score: 1, lastUpdated: now }
    });
    // Product 2 -> Product 1
    await prisma.frequentlyBoughtTogether.upsert({
      where: { shopId_productId_boughtWithProductId: { shopId, productId: productId2, boughtWithProductId: productId1 }},
      update: { score: { increment: 1 }, lastUpdated: now },
      create: { shopId, productId: productId2, boughtWithProductId: productId1, score: 1, lastUpdated: now }
    });
  } catch (e: any) {
      console.error(`[${timestamp}] AGG_ERROR (FBT): Failed for ${productId1} <> ${productId2}. Error: ${e.message}`);
  }
}


export async function action({ request }: ActionFunctionArgs) {
  const timestamp = new Date().toISOString();
  // console.log(`[${timestamp}] --- Action: Start ---`);
  // request.headers.forEach((value, key) => { // Very verbose, enable for deep debugging only
  //   console.log(`[${timestamp}] Action Header: ${key}: ${value}`);
  // });
  // console.log(`[${timestamp}] --- Action: End Headers ---`);

  const requestOrigin = request.headers.get("Origin");
  const responseHeaders = new Headers();
  setCorsHeaders(responseHeaders, requestOrigin);

  // If Origin was present but not allowed by CORS policy (ACAO header not set)
  if (requestOrigin && !responseHeaders.has("Access-Control-Allow-Origin")) {
    console.error(`[${timestamp}] ACTION CORS ERROR: Origin ${requestOrigin} was present but not allowed by CORS policy.`);
    return json({ error: "CORS error", details: `Origin ${requestOrigin} not allowed` }, { status: 403, headers: responseHeaders });
  }
  
  if (request.method === "OPTIONS") { // Should be caught by loader, but as a fallback
    console.warn(`[${timestamp}] ACTION (FALLBACK OPTIONS): Handling OPTIONS request. Origin: ${requestOrigin || "undefined"}. ACAO: ${responseHeaders.get("Access-Control-Allow-Origin") || "Not Set"}`);
    return new Response(null, { status: 204, headers: responseHeaders });
  }

  if (request.method !== "POST") {
    console.log(`[${timestamp}] ACTION: Method ${request.method} not allowed for /api/pixel-events.`);
    return json({ error: "Method Not Allowed" }, { status: 405, headers: responseHeaders });
  }

  let body: PixelEventPayload;
  try {
    body = await request.json();
  } catch (parseError: any) {
    console.error(`[${timestamp}] ACTION CRITICAL: Failed to parse JSON body:`, parseError.message);
    return json({ error: "Failed to parse JSON body", details: parseError.message }, { status: 400, headers: responseHeaders });
  }

  try {
    const { metadata, context, id: eventId, timestamp: eventTimestampStr, clientId } = body;
    const eventName = metadata?.eventName;
    const shopDomainFromReq = metadata?.shopDomain || context?.document?.location?.hostname || '';
    const uniqueToken = metadata?.uniqueToken || eventId; 
    const eventData = body.data; // This is the object that should contain checkout, cart lines, etc.

    if (!eventName) {
      console.error(`[${timestamp}] ACTION CRITICAL: eventName is missing. Body snippet:`, JSON.stringify({id: body.id, metadata: body.metadata, context: body.context}, null, 2));
      return json({ error: 'eventName is missing' }, { status: 400, headers: responseHeaders });
    }
    if (!shopDomainFromReq) {
      console.warn(`[${timestamp}] ACTION WARNING: shopDomainFromReq is missing or empty. Body snippet:`, JSON.stringify({id: body.id, metadata: body.metadata, context: body.context}, null, 2));
      return json({ error: 'shopDomainFromReq is missing' }, { status: 400, headers: responseHeaders });
    }
    // console.log(`[${timestamp}] ACTION: Processing event: ${eventName}, Shop: ${shopDomainFromReq}, EventID: ${eventId}`);

    const shop = await prisma.shop.upsert({
      where: { domain: shopDomainFromReq },
      update: {}, // No specific fields to update on existing shop, just ensure it exists
      create: { domain: shopDomainFromReq },
    });
    // console.log(`[${timestamp}] ACTION: Ensured shop exists: ${shop.domain}, ID: ${shop.id}`);

    const userAgent = request.headers.get("User-Agent");
    const sessionTokenForPixelSession = body.id; // This is the event ID, unique per event.

    // Extract common identifiers from eventData
    const checkoutToken = eventData?.checkout?.token;
    const customerEmail = eventData?.checkout?.email;
    const shopifyCustomerId = eventData?.checkout?.order?.customer?.id;
    const shopifyOrderId = eventData?.checkout?.order?.id;

    if (!sessionTokenForPixelSession) {
      console.error(`[${timestamp}] ACTION CRITICAL: body.id (used for sessionTokenForPixelSession) is missing. Body snippet:`, JSON.stringify({id: body.id, metadata: body.metadata}, null, 2));
      return json({ error: 'body.id (sessionTokenForPixelSession) is missing' }, { status: 400, headers: responseHeaders });
    }

    let pixelSession;
    if (clientId && shop.id) {
      const createData: Prisma.PixelSessionCreateInput = {
        shop: { connect: { id: shop.id } },
        sessionToken: sessionTokenForPixelSession, // ID of the event that initiated this clientId session
        clientId: clientId,
        userAgent: userAgent ?? undefined,
        requestShopDomain: shopDomainFromReq,
        checkoutToken: checkoutToken ?? undefined,
        customerEmail: customerEmail ?? undefined,
        shopifyCustomerId: shopifyCustomerId ?? undefined,
        shopifyOrderId: shopifyOrderId ?? undefined,
      };

      const updateData: Prisma.PixelSessionUpdateInput = {
        userAgent: userAgent ?? undefined,
        requestShopDomain: shopDomainFromReq,
        // lastActive is handled by @updatedAt
        ...(checkoutToken && { checkoutToken }),
        ...(customerEmail && { customerEmail }),
        ...(shopifyCustomerId && { shopifyCustomerId }),
        ...(shopifyOrderId && { shopifyOrderId }),
      };
      // Remove undefined properties from updateData to avoid Prisma errors or accidental nulling of fields
      Object.keys(updateData).forEach(key => (updateData as any)[key] === undefined && delete (updateData as any)[key]);
      
      pixelSession = await prisma.pixelSession.upsert({
        where: { shopId_clientId_unique: { shopId: shop.id, clientId: clientId } },
        create: createData,
        update: updateData,
      });
      // console.log(`[${timestamp}] ACTION: Upserted PixelSession (clientId: ${clientId}): ${pixelSession.id}. EventName: ${eventName}.`);
    } else { // Fallback: no clientId. Create a PixelSession per event if needed or handle differently.
      pixelSession = await prisma.pixelSession.create({
        data: {
          shop: { connect: { id: shop.id } },
          sessionToken: sessionTokenForPixelSession, // Event ID as the session token
          userAgent: userAgent ?? undefined,
          requestShopDomain: shopDomainFromReq,
          checkoutToken: checkoutToken ?? undefined,
          customerEmail: customerEmail ?? undefined,
          shopifyCustomerId: shopifyCustomerId ?? undefined,
          shopifyOrderId: shopifyOrderId ?? undefined,
        },
      });
      // console.log(`[${timestamp}] ACTION: Created new PixelSession (no clientId, eventId as sessionToken: ${sessionTokenForPixelSession}): ${pixelSession.id}`);
    }

    const newEventTimestamp = eventTimestampStr ? new Date(eventTimestampStr) : new Date();
    const newEvent = await prisma.pixelEvent.create({
      data: {
        eventType: eventName,
        timestamp: newEventTimestamp,
        userAgent: userAgent ?? undefined,
        eventData: body as any, // Store the full event payload (casting to any if body structure is too complex for Prisma aot)
        requestShopDomain: shopDomainFromReq,
        requestSessionToken: uniqueToken,
        shop: { connect: { id: shop.id } },
        pixelSession: { connect: { id: pixelSession.id } },
      },
    });
    // console.log(`[${timestamp}] ACTION: Pixel event stored: ${newEvent.id}, linked to PixelSession: ${pixelSession.id}`);
    
    // --- Structured Table Ingestion ---
    if (eventName === PixelEventNames.PRODUCT_VIEWED) {
      const rawProductId = eventData?.productId || eventData?.productVariant?.product?.id;
      const finalProductId = toShopifyGID(rawProductId);
      const variantIdFromEvent = eventData?.productVariant?.id; // Extract variant GID
      
      // Attempt to get customer ID from root event.customer.id or fallback to session's customerId
      const customerIdFromEvent = body.customer?.id || pixelSession.shopifyCustomerId;

      if (finalProductId) {
        const productMeta = await prisma.productMetadata.findUnique({
          where: { shopifyProductId: finalProductId },
          select: { shopifyProductId: true } 
        });

        if (!productMeta) {
          console.warn(`[${timestamp}] ProductView & Aggregates SKIPPED: ProductMetadata not found for productId: ${finalProductId}. EventID: ${eventId}`);
        } else {
          await prisma.productView.create({
            data: {
              pixelSessionId: pixelSession.id,
              shopId: shop.id,
              productId: finalProductId,
              variantId: variantIdFromEvent ?? undefined, // Add variantId
              viewedAt: newEventTimestamp, 
              clientId: clientId ?? null, 
              shopifyCustomerId: customerIdFromEvent ?? undefined, // Add shopifyCustomerId
              eventId: newEvent.id, // Add eventId
            },
          });
          // console.log(`[${timestamp}] ACTION: ProductView created for ${finalProductId}. EventID: ${eventId}`);

          // Update ProductCooccurrence
          const otherViews = await prisma.productView.findMany({
            where: { pixelSessionId: pixelSession.id, productId: { not: finalProductId } },
            select: { productId: true }
          });
          for (const other of otherViews) {
            await updateCooccurrence(shop.id, finalProductId, other.productId, timestamp);
          }

          // Update PopularProduct
          await prisma.popularProduct.upsert({
            where: { shopId_productId: { shopId: shop.id, productId: finalProductId } },
            update: { score: { increment: 1 } },
            create: { shopId: shop.id, productId: finalProductId, score: 1 }
          });
          // console.log(`[${timestamp}] ACTION: Aggregates updated for ${finalProductId}. EventID: ${eventId}`);
        }
      } else {
        console.warn(`[${timestamp}] ProductView SKIPPED: No productId found in eventData. EventID: ${eventId}`);
      }
    }

    if ((eventName === PixelEventNames.PRODUCT_ADDED_TO_CART || eventName === PixelEventNames.PRODUCT_REMOVED_FROM_CART) && eventData?.cartLine?.merchandise?.product?.id) {
      const productIdRaw = eventData.cartLine.merchandise.product.id;
      const productId = toShopifyGID(productIdRaw);
      const variantId = eventData.cartLine.merchandise.id; // This is GID for ProductVariant

      if (productId) {
          const productMeta = await prisma.productMetadata.findUnique({
            where: { shopifyProductId: productId },
            select: { shopifyProductId: true }
          });
          if (!productMeta) {
            console.warn(`[${timestamp}] CartAction SKIPPED: ProductMetadata not found for productId: ${productId}. EventID: ${newEvent.id}`);
          } else {
            await prisma.cartAction.create({
              data: {
                shopId: shop.id,
                productId,
                variantId: variantId ?? undefined,
                actionType: eventName === PixelEventNames.PRODUCT_ADDED_TO_CART ? "add" : "remove",
                quantity: eventData.cartLine.quantity ?? 1,
                timestamp: newEventTimestamp,
                pixelSessionId: pixelSession.id,
                clientId: clientId ?? undefined,
                checkoutToken: checkoutToken ?? undefined,
                shopifyCustomerId: shopifyCustomerId ?? undefined,
                eventId: newEvent.id,
              }
            });
            // console.log(`[${timestamp}] CartAction created for ${productId}. EventID: ${newEvent.id}`);
          }
      } else {
          console.warn(`[${timestamp}] CartAction SKIPPED: No product ID found in cartLine. EventID: ${newEvent.id}`);
      }
    }

    if ((eventName === PixelEventNames.CHECKOUT_STARTED || eventName === PixelEventNames.CHECKOUT_COMPLETED) && eventData?.checkout?.lineItems) {
      const currentCheckoutToken = eventData.checkout.token; // Use token from this event's data.checkout
      const orderShopifyIdFromEvent = eventData.checkout.order?.id;
      const orderShopifyCustomerIdFromEvent = eventData.checkout.order?.customer?.id;

      if (!currentCheckoutToken) {
        console.warn(`[${timestamp}] Order SKIPPED: checkoutToken is missing from event.checkout.token. EventName: ${eventName}, EventID: ${newEvent.id}`);
      } else if (!clientId) {
        console.warn(`[${timestamp}] Order SKIPPED (CKToken: ${currentCheckoutToken}): clientId is missing. EventName: ${eventName}, EventID: ${newEvent.id}`);
      } else {
        const orderItemsDataForCreate: Prisma.OrderItemUncheckedCreateWithoutOrderInput[] = [];
        for (const item of eventData.checkout.lineItems) {
          const itemProductIdRaw = item.variant?.product?.id;
          const itemProductId = toShopifyGID(itemProductIdRaw);
          const itemVariantId = item.variant?.id; // This is GID for ProductVariant

          if (!itemProductId) {
            console.warn(`[${timestamp}] OrderItem SKIPPED: ProductId missing for an item. CKToken: ${currentCheckoutToken}, EventID: ${newEvent.id}`);
            continue;
          }
          const productMeta = await prisma.productMetadata.findUnique({ where: { shopifyProductId: itemProductId }, select: { shopifyProductId: true } });
          if (!productMeta) {
            console.warn(`[${timestamp}] OrderItem SKIPPED: ProductMetadata not found for productId: ${itemProductId}. CKToken: ${currentCheckoutToken}, EventID: ${newEvent.id}`);
            continue; 
          }
          orderItemsDataForCreate.push({
            productId: itemProductId, 
            variantId: itemVariantId ?? undefined,
            quantity: item.quantity ?? 1,
            price: parseFloat(item.finalLinePrice?.amount ?? '0'), // Ensure price is a number
          });
        }

        if (orderItemsDataForCreate.length > 0) {
          const orderUpdatePayload: Prisma.OrderUpdateInput = {
            pixelSession: { connect: { id: pixelSession.id } },
            clientId: clientId,
            shopifyCustomerId: orderShopifyCustomerIdFromEvent ?? undefined,
            pixelEvent: { connect: { id: newEvent.id } },
            shopifyOrderId: orderShopifyIdFromEvent ?? undefined,
          };
          Object.keys(orderUpdatePayload).forEach(key => (orderUpdatePayload as any)[key] === undefined && delete (orderUpdatePayload as any)[key]);

          const orderCreatePayload: Prisma.OrderCreateInput = {
            checkoutToken: currentCheckoutToken,
            createdAt: newEventTimestamp,
            shop: { connect: { id: shop.id } },
            pixelSession: { connect: { id: pixelSession.id } },
            clientId: clientId,
            shopifyCustomerId: orderShopifyCustomerIdFromEvent ?? undefined,
            pixelEvent: { connect: { id: newEvent.id } },
            shopifyOrderId: orderShopifyIdFromEvent ?? undefined,
            orderItems: { create: orderItemsDataForCreate },
          };

          const upsertedOrder = await prisma.order.upsert({
            where: { checkoutToken: currentCheckoutToken }, 
            update: orderUpdatePayload, 
            create: orderCreatePayload,
          });
          // console.log(`[${timestamp}] ACTION: Order upserted (CKToken: ${currentCheckoutToken}): ${upsertedOrder.id}. Event: ${eventName}.`);

          if (eventName === PixelEventNames.CHECKOUT_COMPLETED && orderShopifyIdFromEvent && orderItemsDataForCreate.length >= 2) {
            // console.log(`[${timestamp}] FBT: Processing for Order ID ${upsertedOrder.id}, Shopify OID ${orderShopifyIdFromEvent}`);
            const productIdsInOrder = orderItemsDataForCreate.map(item => item.productId!); // productIds are GIDs
            for (let i = 0; i < productIdsInOrder.length; i++) {
              for (let j = i + 1; j < productIdsInOrder.length; j++) {
                await updateFBT(shop.id, productIdsInOrder[i], productIdsInOrder[j], timestamp);
              }
            }
            // console.log(`[${timestamp}] FBT: Updated for ${productIdsInOrder.length} items in Order ID ${upsertedOrder.id}.`);
          }
        }

        // Backfill CartActions if checkout completed and customer ID became available
        if (eventName === PixelEventNames.CHECKOUT_COMPLETED && currentCheckoutToken && orderShopifyCustomerIdFromEvent) {
          await prisma.cartAction.updateMany({
            where: {
              pixelSessionId: pixelSession.id,
              // Only update if these fields were previously null/not set
              OR: [ { checkoutToken: null }, { shopifyCustomerId: null } ] 
            },
            data: {
              checkoutToken: currentCheckoutToken, // Use current event's checkoutToken
              shopifyCustomerId: orderShopifyCustomerIdFromEvent // Use current event's customerId
            }
          });
          // console.log(`[${timestamp}] Backfilled CartActions for session ${pixelSession.id} with CKToken & ShopifyCustID.`);
        }
      }
    }
    // --- End Structured Table Ingestion ---

    return json({ message: 'Pixel event received and processed', eventId: newEvent.id, pixelSessionId: pixelSession.id }, { status: 200, headers: responseHeaders });

  } catch (error: any) {
    console.error(`[${timestamp}] ACTION CRITICAL: Error processing pixel event:`, error.message, error.stack, error);
    // It's good practice to include error.code or error.meta from Prisma if available for DB errors
    const errorDetails = { message: error.message, code: error.code, meta: error.meta };
    return json({ error: 'Failed to process pixel event', details: errorDetails }, { status: 500, headers: responseHeaders });
  }
}