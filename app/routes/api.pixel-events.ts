import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import prisma from "../db.server";
import { Prisma } from "@prisma/client"; // Corrected import for runtime values like Prisma.JsonNull

console.log(`[${new Date().toISOString()}] MODULE LOADED: app/routes/api.pixel-events.ts`);

// Define event names as constants for better maintainability and to avoid typos
const PixelEventNames = {
  PRODUCT_VIEWED: 'product_viewed',
  PRODUCT_ADDED_TO_CART: 'product_added_to_cart',
  PRODUCT_REMOVED_FROM_CART: 'product_removed_from_cart',
  CHECKOUT_STARTED: 'checkout_started',
  CHECKOUT_COMPLETED: 'checkout_completed',
  SEARCH_SUBMITTED: 'search_submitted',
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
    navigator?: {
      userAgent?: string;
    };
    window?: {
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

    // Ensure shop is valid and available
    if (!shop) {
      console.error(`[${timestamp}] ACTION CRITICAL: Shop not found or created for domain: ${shopDomainFromReq}. Cannot process event.`);
      return json({ error: "Shop not found or created" }, { status: 400, headers: responseHeaders });
    }

    // --- START Enhanced PixelSession Handling ---
    const checkoutToken = body.data?.checkout?.token;
    const shopifyCustomerId = body.data?.checkout?.order?.customer?.id || body.customer?.id;
    const customerEmail = body.data?.checkout?.email || body.customer?.email;
    const shopifyOrderId = body.data?.checkout?.order?.id;
    const userAgent = body.context?.navigator?.userAgent;

    let pixelSession: Prisma.PixelSessionGetPayload<{ include: { events: false } }> | null = null; // No need to include events here initially

    if (clientId) { // We primarily use clientId for session consolidation
      pixelSession = await prisma.pixelSession.findUnique({
        where: {
          shopId_clientId_unique: {
            shopId: shop.id,
            clientId: clientId,
          },
        },
      });

      if (pixelSession) {
        // Session exists, update it
        const updateData: Prisma.PixelSessionUpdateInput = {
          lastActive: new Date(eventTimestampStr || Date.now()),
          requestShopDomain: shopDomainFromReq, // Update if it changes
          userAgent: userAgent || pixelSession.userAgent, // Update if new event has it, otherwise keep existing
        };
        // Only update if the new value is present and the existing one is not (or if we decide to overwrite)
        if (checkoutToken && !pixelSession.checkoutToken) updateData.checkoutToken = checkoutToken;
        if (shopifyCustomerId && !pixelSession.shopifyCustomerId) updateData.shopifyCustomerId = shopifyCustomerId;
        if (customerEmail && !pixelSession.customerEmail) updateData.customerEmail = customerEmail;
        if (shopifyOrderId && !pixelSession.shopifyOrderId) updateData.shopifyOrderId = shopifyOrderId;
        
        // If userProfileId becomes available later (e.g. customer logs in), update it here too.
        // For now, assuming userProfileId is set if shopifyCustomerId is known and a profile exists.
        if (shopifyCustomerId) {
            const userProfile = await prisma.userProfile.findUnique({
                where: { shopId_shopifyCustomerId: { shopId: shop.id, shopifyCustomerId: shopifyCustomerId }}
            });
            if (userProfile) {
                updateData.userProfile = { connect: { id: userProfile.id } };
            }
        }


        pixelSession = await prisma.pixelSession.update({
          where: { id: pixelSession.id },
          data: updateData,
        });
        // console.log(`[${timestamp}] ACTION: Updated PixelSession: ${pixelSession.id} for clientId: ${clientId}`);
      } else {
        // No session found for this shopId/clientId, create a new one
        let userProfileIdToLink: string | undefined = undefined;
        if (shopifyCustomerId) {
            // Attempt to find or create UserProfile if shopifyCustomerId is present
            // This is a simplified upsert; adjust if UserProfile needs more creation data
            const userProfile = await prisma.userProfile.upsert({
                where: { shopId_shopifyCustomerId: { shopId: shop.id, shopifyCustomerId: shopifyCustomerId }},
                update: { lastSeen: new Date(eventTimestampStr || Date.now()), email: customerEmail || undefined },
                create: {
                    shopId: shop.id,
                    shopifyCustomerId: shopifyCustomerId,
                    email: customerEmail,
                    firstSeen: new Date(eventTimestampStr || Date.now()),
                    lastSeen: new Date(eventTimestampStr || Date.now()),
                }
            });
            userProfileIdToLink = userProfile.id;
        }

        pixelSession = await prisma.pixelSession.create({
          data: {
            shop: { connect: { id: shop.id } },
            sessionToken: uniqueToken, // Initial token, primary key remains 'id'
            clientId: clientId,
            userAgent: userAgent,
            requestShopDomain: shopDomainFromReq,
            firstSeen: new Date(eventTimestampStr || Date.now()),
            lastActive: new Date(eventTimestampStr || Date.now()),
            checkoutToken: checkoutToken,
            shopifyCustomerId: shopifyCustomerId,
            customerEmail: customerEmail,
            shopifyOrderId: shopifyOrderId,
            userProfile: userProfileIdToLink ? { connect: { id: userProfileIdToLink } } : undefined,
          },
        });
        // console.log(`[${timestamp}] ACTION: Created new PixelSession: ${pixelSession.id} for clientId: ${clientId}`);
      }
    } else {
      // Fallback for events without clientId: Create a session based on sessionToken (eventId)
      // This session will not be easily consolidated with clientId-based sessions.
      // This indicates a potential issue with pixel setup or event type if clientId is expected.
      console.warn(`[${timestamp}] ACTION WARNING: clientId is missing. Creating a PixelSession based on eventId (sessionToken): ${uniqueToken}. This session may not be consolidated effectively.`);
      pixelSession = await prisma.pixelSession.create({
        data: {
          shop: { connect: { id: shop.id } },
          sessionToken: uniqueToken, // eventId acts as the session token here
          userAgent: userAgent,
          requestShopDomain: shopDomainFromReq,
          firstSeen: new Date(eventTimestampStr || Date.now()),
          lastActive: new Date(eventTimestampStr || Date.now()),
          checkoutToken: checkoutToken,
          shopifyCustomerId: shopifyCustomerId,
          customerEmail: customerEmail,
          shopifyOrderId: shopifyOrderId,
          // Cannot link to UserProfile reliably without clientId or confirmed shopifyCustomerId
        },
      });
      // console.log(`[${timestamp}] ACTION: Created fallback PixelSession (no clientId): ${pixelSession.id}`);
    }

    if (!pixelSession) {
      console.error(`[${timestamp}] ACTION CRITICAL: PixelSession could not be established for eventId: ${eventId}.`);
      return json({ error: "Failed to establish a session for the event." }, { status: 500, headers: responseHeaders });
    }
    // --- END Enhanced PixelSession Handling ---


    // Create the PixelEvent and link it to the pixelSession
    const createdEventData: Prisma.PixelEventCreateInput = {
      shop: { connect: { id: shop.id } },
      pixelSession: { connect: { id: pixelSession!.id } },
      eventType: eventName,
      eventData: eventData ? eventData : Prisma.JsonNull,
      timestamp: eventTimestampStr ? new Date(eventTimestampStr) : new Date(),
      requestSessionToken: eventId,
      requestShopDomain: shopDomainFromReq,
    };

    // Add customerId and email from root customer object if available and not already from checkout data
    // This handles standard events like page_viewed that might carry customer info if logged in
    if (body.customer?.email && !((pixelSession.customerEmail || customerEmail))) { // Check against session and current event's checkout email
       // Logic to update pixelSession.customerEmail if body.customer.email is new might be needed here or during session update
    }


    const createdEvent = await prisma.pixelEvent.create({data: createdEventData});
    // console.log(`[${timestamp}] ACTION: Created PixelEvent: ${createdEvent.id} (eventName: ${eventName}) for session ${pixelSession.id}`);

    // If customer information became available via body.customer, and session doesn't have it, update session
    if (body.customer?.id && (!pixelSession.shopifyCustomerId || (body.customer.email && !pixelSession.customerEmail))) {
        const sessionUpdateForCustomer: Prisma.PixelSessionUpdateInput = {};
        if (body.customer.id && !pixelSession.shopifyCustomerId) {
            sessionUpdateForCustomer.shopifyCustomerId = body.customer.id;
            
            // Link/Create UserProfile if we just got a Shopify Customer ID
            const userProfile = await prisma.userProfile.upsert({
                where: { shopId_shopifyCustomerId: { shopId: shop.id, shopifyCustomerId: body.customer.id }},
                update: { 
                    lastSeen: new Date(eventTimestampStr || Date.now()),
                    email: body.customer.email || undefined 
                },
                create: {
                    shopId: shop.id,
                    shopifyCustomerId: body.customer.id,
                    email: body.customer.email,
                    firstName: body.customer.firstName,
                    lastName: body.customer.lastName,
                    firstSeen: new Date(eventTimestampStr || Date.now()),
                    lastSeen: new Date(eventTimestampStr || Date.now()),
                }
            });
            sessionUpdateForCustomer.userProfile = { connect: { id: userProfile.id } };
        }
        if (body.customer.email && !pixelSession.customerEmail) {
            sessionUpdateForCustomer.customerEmail = body.customer.email;
            // If userProfile was linked/created above, its email might have been set.
            // If not, and we only have email, we might want to update UserProfile email if it exists.
            if (sessionUpdateForCustomer.userProfile) {
                const profileToUpdateId = (sessionUpdateForCustomer.userProfile as { connect?: { id?: string } })?.connect?.id;
                if (profileToUpdateId) {
                    await prisma.userProfile.update({
                        where: { id: profileToUpdateId }, 
                        data: { email: body.customer.email }
                    });
                } else if (pixelSession!.userProfileId) { // Fallback to existing linked profile ID on session
                     await prisma.userProfile.update({
                        where: { id: pixelSession!.userProfileId }, // Added non-null assertion
                        data: { email: body.customer.email } // Update existing profile's email if new
                    });
                }
            }
        }

        if (Object.keys(sessionUpdateForCustomer).length > 0) {
            pixelSession = await prisma.pixelSession.update({
                where: { id: pixelSession.id },
                data: sessionUpdateForCustomer,
            });
            // console.log(`[${timestamp}] ACTION: Post-event update to PixelSession ${pixelSession.id} with customer data from event root.`);
        }
    }


    // Standard Event Processing (ProductView, CartAction, Order, SearchQuery)
    if (eventName === PixelEventNames.PRODUCT_VIEWED) {
      const rawProductId = eventData?.productId || eventData?.productVariant?.product?.id;
      const customerIdFromEvent = body.customer?.id || eventData?.checkout?.order?.customer?.id || pixelSession!.shopifyCustomerId;
      const variantIdFromEvent = eventData?.productVariantId || eventData?.productVariant?.id;
      
      if (rawProductId) {
        const finalProductId = toShopifyGID(rawProductId);

        if (!finalProductId) {
          console.warn(`[${timestamp}] ProductView & Aggregates SKIPPED: Invalid productId format for productId: ${rawProductId}. EventID: ${eventId}`);
        } else {
          const productMeta = await prisma.productMetadata.findUnique({
            where: { shopifyProductId: finalProductId },
            select: { shopifyProductId: true } 
          });

          if (!productMeta) {
            console.warn(`[${timestamp}] ProductView & Aggregates SKIPPED: ProductMetadata not found for productId: ${finalProductId}. EventID: ${eventId}`);
          } else {
            await prisma.productView.create({
              data: {
                pixelSessionId: pixelSession!.id,
                shopId: shop.id,
                productId: finalProductId,
                variantId: variantIdFromEvent ?? undefined, // Add variantId
                viewedAt: new Date(eventTimestampStr || Date.now()), 
                clientId: clientId ?? null, 
                shopifyCustomerId: customerIdFromEvent ?? undefined, // Add shopifyCustomerId
                eventId: createdEvent.id, // Add eventId
              },
            });
            // console.log(`[${timestamp}] ACTION: ProductView created for ${finalProductId}. EventID: ${eventId}`);

            // Update ProductCooccurrence
            const otherViews = await prisma.productView.findMany({
              where: { pixelSessionId: pixelSession!.id, productId: { not: finalProductId } },
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
        }
      } else {
        console.warn(`[${timestamp}] ProductView SKIPPED: No productId found in eventData. EventID: ${eventId}`);
      }
    }

    if ((eventName === PixelEventNames.PRODUCT_ADDED_TO_CART || eventName === PixelEventNames.PRODUCT_REMOVED_FROM_CART)) {
      const cartLine = eventData?.cartLine;
      const rawProductIdFromCart = cartLine?.merchandise?.product?.id || cartLine?.product?.id;
      const shopifyGIDProductId = toShopifyGID(rawProductIdFromCart);
      const shopifyCustomerIdFromCart = body.customer?.id || eventData?.checkout?.order?.customer?.id || pixelSession!.shopifyCustomerId;
      const variantId = cartLine?.merchandise?.id || cartLine?.id;

      console.log(`[${timestamp}] CartAction: Attempting for rawPID: ${rawProductIdFromCart}, GID: ${shopifyGIDProductId}, EventID: ${createdEvent.id}`); // Added log

      if (shopifyGIDProductId) {
          console.log(`[${timestamp}] CartAction: GID ${shopifyGIDProductId} is valid. Looking for ProductMetadata.`); // Added log
          const productMeta = await prisma.productMetadata.findUnique({
            where: { shopifyProductId: shopifyGIDProductId },
            select: { shopifyProductId: true }
          });

          console.log(`[${timestamp}] CartAction: ProductMetadata search result for GID ${shopifyGIDProductId}:`, productMeta); // Added log

          if (!productMeta) {
            console.warn(`[${timestamp}] CartAction SKIPPED: ProductMetadata not found for productId GID: ${shopifyGIDProductId}. EventID: ${createdEvent.id}`);
          } else {
            console.log(`[${timestamp}] CartAction: ProductMetadata FOUND for GID ${shopifyGIDProductId}. Proceeding to create CartAction.`); // Added log
            try {
              await prisma.cartAction.create({
                data: {
                  shopId: shop.id,
                  productId: shopifyGIDProductId, // Ensure this is the GID version
                  variantId: variantId ?? undefined,
                  actionType: eventName === PixelEventNames.PRODUCT_ADDED_TO_CART ? "add" : "remove",
                  quantity: cartLine.quantity ?? 1, // Assuming cartLine is non-null if shopifyGIDProductId was derived
                  timestamp: new Date(eventTimestampStr || Date.now()),
                  pixelSessionId: pixelSession!.id,
                  clientId: clientId ?? undefined,
                  checkoutToken: eventData.checkout?.token ?? undefined, // This might be from a different event, ensure context is right
                  shopifyCustomerId: shopifyCustomerIdFromCart ?? undefined,
                  eventId: createdEvent.id,
                }
              });
              console.log(`[${timestamp}] CartAction: Successfully created for GID ${shopifyGIDProductId}. EventID: ${createdEvent.id}`); // Added log
            } catch (cartCreateError: any) {
              console.error(`[${timestamp}] CartAction: CRITICAL - Failed to create CartAction for GID ${shopifyGIDProductId}. EventID: ${createdEvent.id}. Error:`, cartCreateError.message, cartCreateError.code, cartCreateError.meta);
              // Potentially re-throw or handle as a more significant error if skipping isn't desired
            }
          }
      } else {
          console.warn(`[${timestamp}] CartAction SKIPPED: shopifyGIDProductId is null/undefined. RawPID: ${rawProductIdFromCart}. EventID: ${createdEvent.id}`);
      }
    }

    if ((eventName === PixelEventNames.CHECKOUT_STARTED || eventName === PixelEventNames.CHECKOUT_COMPLETED) && eventData?.checkout?.lineItems) {
      const currentCheckoutToken = eventData.checkout.token;
      const orderShopifyIdFromEvent = eventData.checkout.order?.id;
      const orderShopifyCustomerIdFromEvent = eventData?.checkout?.order?.customer?.id || body.customer?.id || pixelSession!.shopifyCustomerId;
      const orderEmailFromEvent = eventData.checkout.email || body.customer?.email;

      if (!currentCheckoutToken) {
        console.warn(`[${timestamp}] Order SKIPPED: checkoutToken is missing from event.checkout.token. EventName: ${eventName}, EventID: ${createdEvent.id}`);
      } else if (!clientId) {
        console.warn(`[${timestamp}] Order SKIPPED (CKToken: ${currentCheckoutToken}): clientId is missing. EventName: ${eventName}, EventID: ${createdEvent.id}`);
      } else {
        const orderItemsDataForCreate: Prisma.OrderItemUncheckedCreateWithoutOrderInput[] = [];
        for (const item of eventData.checkout.lineItems) {
          const itemProductIdRaw = item.variant?.product?.id;
          const itemProductId = toShopifyGID(itemProductIdRaw);
          const itemVariantId = item.variant?.id; // This is GID for ProductVariant

          if (!itemProductId) {
            console.warn(`[${timestamp}] OrderItem SKIPPED: ProductId missing for an item. CKToken: ${currentCheckoutToken}, EventID: ${createdEvent.id}`);
            continue;
          }
          const productMeta = await prisma.productMetadata.findUnique({ where: { shopifyProductId: itemProductId }, select: { shopifyProductId: true } });
          if (!productMeta) {
            console.warn(`[${timestamp}] OrderItem SKIPPED: ProductMetadata not found for productId: ${itemProductId}. CKToken: ${currentCheckoutToken}, EventID: ${createdEvent.id}`);
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
            pixelSession: { connect: { id: pixelSession!.id } },
            clientId: clientId,
            shopifyCustomerId: orderShopifyCustomerIdFromEvent ?? undefined,
            pixelEvent: { connect: { id: createdEvent.id } },
            shopifyOrderId: orderShopifyIdFromEvent ?? undefined,
          };
          Object.keys(orderUpdatePayload).forEach(key => (orderUpdatePayload as any)[key] === undefined && delete (orderUpdatePayload as any)[key]);

          const orderCreatePayload: Prisma.OrderCreateInput = {
            checkoutToken: currentCheckoutToken,
            createdAt: new Date(eventTimestampStr || Date.now()),
            shop: { connect: { id: shop.id } },
            pixelSession: { connect: { id: pixelSession!.id } },
            clientId: clientId,
            shopifyCustomerId: orderShopifyCustomerIdFromEvent ?? undefined,
            pixelEvent: { connect: { id: createdEvent.id } },
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
              pixelSessionId: pixelSession!.id,
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

    // --- Search Query Ingestion ---
    if (eventName === PixelEventNames.SEARCH_SUBMITTED) {
      const searchQuery = eventData?.searchResult?.query;
      // Correctly derive resultsCount from the length of the productVariants array
      const productVariantsArray = eventData?.searchResult?.productVariants;
      let resultsCount: number | undefined = undefined;
      if (Array.isArray(productVariantsArray)) {
        resultsCount = productVariantsArray.length;
      }

      const customerIdFromEvent = body.customer?.id || pixelSession!.shopifyCustomerId; // Consistent customer ID fetching

      if (searchQuery) {
        await prisma.searchQuery.create({
          data: {
            shopId: shop.id,
            pixelSessionId: pixelSession!.id,
            eventId: createdEvent.id,
            clientId: clientId ?? undefined,
            shopifyCustomerId: customerIdFromEvent ?? undefined,
            query: searchQuery,
            resultsCount: resultsCount, // Use the derived resultsCount
            timestamp: new Date(eventTimestampStr || Date.now()),
          },
        });
        // console.log(`[${timestamp}] ACTION: SearchQuery created for query "${searchQuery}", Results: ${resultsCount}. EventID: ${createdEvent.id}`);
      } else {
        console.warn(`[${timestamp}] SearchQuery SKIPPED: Query string missing in eventData. EventID: ${createdEvent.id}`);
      }
    }
    // --- End Search Query Ingestion ---

    return json({ message: 'Pixel event received and processed', eventId: createdEvent.id, pixelSessionId: pixelSession!.id }, { status: 200, headers: responseHeaders });

  } catch (error: any) {
    console.error(`[${timestamp}] ACTION CRITICAL: Error processing pixel event:`, error.message, error.stack, error);
    // It's good practice to include error.code or error.meta from Prisma if available for DB errors
    const errorDetails = { message: error.message, code: error.code, meta: error.meta };
    return json({ error: 'Failed to process pixel event', details: errorDetails }, { status: 500, headers: responseHeaders });
  }
}