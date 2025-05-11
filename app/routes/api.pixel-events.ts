import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import prisma from "../db.server";
import type { Prisma } from "@prisma/client"; // Import Prisma namespace for types

console.log(`[${new Date().toISOString()}] MODULE LOADED: app/routes/api.pixel-events.ts`);

// Allowed origins logic
const getAllowedOrigins = () => {
  const allowed: (string | RegExp)[] = [
    /^https?:\/\/[a-zA-Z0-9-]+\.myshopify\.com$/, // Shopify store domains
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
  if (process.env.NODE_ENV === 'development' && process.env.HOST) {
    try {
        const localTunnel = new URL(process.env.HOST).origin;
        allowed.push(localTunnel);
    } catch(e) {
        console.warn("Could not add HOST to allowed origins for local dev:", e);
    }
  }
  return allowed;
};

function setCorsHeaders(responseHeaders: Headers, requestOrigin: string | null) {
  const allowedOriginsPatterns = getAllowedOrigins();
  let originAllowed = false;

  if (requestOrigin) {
    for (const pattern of allowedOriginsPatterns) {
      if (typeof pattern === 'string' && pattern === requestOrigin) {
        originAllowed = true;
        break;
      }
      if (pattern instanceof RegExp && pattern.test(requestOrigin)) {
        originAllowed = true;
        break;
      }
    }
  } else {
    // This case should ideally not happen for web pixel requests from a browser
    console.log("CORS: No Origin header present in the request. ACAO not set.");
  }

  if (originAllowed && requestOrigin) {
    responseHeaders.set("Access-Control-Allow-Origin", requestOrigin);
    // Explicitly log that the ACAO header is being set
    console.log(`ACTION CORS: Origin ${requestOrigin} is allowed. Set Access-Control-Allow-Origin to: ${requestOrigin}`);
    responseHeaders.set("Access-Control-Allow-Credentials", "true");
  } else if (requestOrigin) {
    // Origin was present but not in the allow list
    console.warn(`ACTION CORS: Origin ${requestOrigin} is NOT allowed. Access-Control-Allow-Origin was NOT set.`);
  }
  // These headers are generally set for CORS responses
  responseHeaders.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  responseHeaders.set("Access-Control-Allow-Headers", "Content-Type, Authorization, Origin, Accept, X-Shopify-Hmac-Sha256");
  responseHeaders.set("Access-Control-Max-Age", "86400"); // 24 hours
}

export async function loader({ request }: LoaderFunctionArgs) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] LOADER: Invoked for ${request.method} request to /api/pixel-events.`);

  const requestOrigin = request.headers.get("Origin");
  console.log(`[${timestamp}] LOADER: Detected Origin: ${requestOrigin || "undefined"}`);

  const responseHeaders = new Headers();

  if (request.method === "OPTIONS") {
    // Directly handle CORS headers for OPTIONS preflight
    if (requestOrigin) {
      // Basic check: For now, let's assume if Origin is present, allow it for OPTIONS
      // More robust validation (like checking against getAllowedOrigins) can be added if this works
      responseHeaders.set("Access-Control-Allow-Origin", requestOrigin);
      console.log(`[${timestamp}] LOADER (OPTIONS): Set Access-Control-Allow-Origin to: ${requestOrigin}`);
    } else {
      console.log(`[${timestamp}] LOADER (OPTIONS): No Origin header detected. Access-Control-Allow-Origin NOT set.`);
    }
    responseHeaders.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    responseHeaders.set("Access-Control-Allow-Headers", "Content-Type, Authorization, Origin, Accept, X-Shopify-Hmac-Sha256");
    responseHeaders.set("Access-Control-Max-Age", "86400"); // 24 hours
    
    console.log(`[${timestamp}] LOADER (OPTIONS): Responding with status 204.`);
    return new Response(null, { status: 204, headers: responseHeaders });
  }

  // Fallback for other methods like GET if not explicitly handled by this route
  console.log(`[${timestamp}] LOADER: ${request.method} request to /api/pixel-events, not allowed by loader. Responding 405.`);
  // Set basic CORS headers even for errors, as the browser might still need them
  if (requestOrigin) {
    responseHeaders.set("Access-Control-Allow-Origin", requestOrigin); // Reflect origin if present
  }
  responseHeaders.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  responseHeaders.set("Access-Control-Allow-Headers", "Content-Type, Authorization, Origin, Accept, X-Shopify-Hmac-Sha256");
  return json({ error: "Method Not Allowed by loader" }, { status: 405, headers: responseHeaders });
}

export async function action({ request }: ActionFunctionArgs) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] --- Action: Start ---`);
  request.headers.forEach((value, key) => {
    console.log(`[${timestamp}] Action Header: ${key}: ${value}`);
  });
  console.log(`[${timestamp}] --- Action: End Headers ---`);

  const requestOrigin = request.headers.get("Origin");
  const responseHeaders = new Headers();
  setCorsHeaders(responseHeaders, requestOrigin);

  if (requestOrigin && !responseHeaders.has("Access-Control-Allow-Origin")) {
    console.error(`[${timestamp}] ACTION CORS ERROR: Origin ${requestOrigin} was present but not allowed by CORS policy.`);
    return json({ error: "CORS error", details: `Origin ${requestOrigin} not allowed` }, { status: 403, headers: responseHeaders });
  }
  
  if (request.method === "OPTIONS") {
    console.warn(`[${timestamp}] ACTION (FALLBACK OPTIONS): Handling OPTIONS request. Origin: ${requestOrigin || "undefined"}. ACAO: ${responseHeaders.get("Access-Control-Allow-Origin") || "Not Set"}`);
    return new Response(null, { status: 204, headers: responseHeaders });
  }

  if (request.method !== "POST") {
    console.log(`[${timestamp}] ACTION: Method ${request.method} not allowed for /api/pixel-events.`);
    return json({ error: "Method Not Allowed" }, { status: 405, headers: responseHeaders });
  }

  let body;
  try {
    body = await request.json();
  } catch (parseError: any) {
    console.error(`[${timestamp}] ACTION CRITICAL: Failed to parse JSON body:`, parseError.message);
    // Ensure CORS headers are on parse error responses too
    return json({ error: "Failed to parse JSON body", details: parseError.message }, { status: 400, headers: responseHeaders });
  }

  try {
    const { metadata, context, id: eventId, timestamp: eventTimestamp } = body;
    const eventName = metadata?.eventName;
    // Use shopDomainFromReq consistently, derived from the event body itself.
    const shopDomainFromReq = metadata?.shopDomain || context?.document?.location?.hostname || '';

    // This uniqueToken is from the original event structure, might be useful for raw event logging.
    const uniqueToken = metadata?.uniqueToken || eventId; 

    if (!eventName) {
      console.error(`[${timestamp}] ACTION CRITICAL: eventName is missing. Body:`, JSON.stringify(body, null, 2));
      return json({ error: 'eventName is missing' }, { status: 400, headers: responseHeaders });
    }
     if (!shopDomainFromReq) {
      console.warn(`[${timestamp}] ACTION WARNING: shopDomainFromReq is missing or empty. Body:`, JSON.stringify(body, null, 2));
      // Depending on requirements, you might return an error or try to proceed without shop association
      return json({ error: 'shopDomainFromReq is missing' }, { status: 400, headers: responseHeaders });
    }
    console.log(`[${timestamp}] ACTION: Processing event: ${eventName}, Shop: ${shopDomainFromReq}, EventID: ${eventId}`);

    // Upsert Shop
    const shop = await prisma.shop.upsert({
      where: { domain: shopDomainFromReq },
      update: {},
      create: { domain: shopDomainFromReq },
    });
    console.log(`[${timestamp}] ACTION: Ensured shop exists: ${shop.domain}, ID: ${shop.id}`);

    const userAgent = request.headers.get("User-Agent"); // Get User-Agent from request headers
    const sessionToken = body.id; // This is the event ID, unique per event. Used for PixelSession.sessionToken
    const eventData = body.data;
    const clientId = eventData?.clientId; // Stable anonymous ID from the event data

    // Extract new identifiers from eventData
    const checkoutToken = eventData?.checkout?.token;
    const customerEmail = eventData?.checkout?.email;
    const shopifyCustomerId = eventData?.checkout?.order?.customer?.id;
    const shopifyOrderId = eventData?.checkout?.order?.id;

    if (!sessionToken) { // sessionToken is body.id (eventId)
      console.error(`[${timestamp}] ACTION CRITICAL: body.id (sessionToken/eventId) is missing. Body:`, JSON.stringify(body, null, 2));
      return json({ error: 'body.id (eventId) is missing' }, { status: 400, headers: responseHeaders });
    }

    let pixelSession;

    if (clientId) { // Primary path: session identified by clientId
      pixelSession = await prisma.pixelSession.findFirst({
        where: {
          shopId: shop.id,
          clientId: clientId,
        },
      });

      if (pixelSession) {
        // Update existing session
        const updateData: Prisma.PixelSessionUpdateInput = {};
        if (userAgent && pixelSession.userAgent !== userAgent) {
          updateData.userAgent = userAgent;
        }
        if (checkoutToken && pixelSession.checkoutToken !== checkoutToken) {
          updateData.checkoutToken = checkoutToken;
        }
        if (customerEmail && pixelSession.customerEmail !== customerEmail) {
          updateData.customerEmail = customerEmail;
        }
        if (shopifyCustomerId && pixelSession.shopifyCustomerId !== shopifyCustomerId) {
          updateData.shopifyCustomerId = shopifyCustomerId;
        }
        if (shopifyOrderId && pixelSession.shopifyOrderId !== shopifyOrderId) {
          updateData.shopifyOrderId = shopifyOrderId;
        }
        // The sessionToken field in PixelSession stores the ID of the first event that created this clientId-based session.
        // It's not updated here to preserve that original event ID. lastActive is handled by @updatedAt.

        if (Object.keys(updateData).length > 0) {
          pixelSession = await prisma.pixelSession.update({
            where: { id: pixelSession.id },
            data: updateData,
          });
          console.log(`[${timestamp}] ACTION: Updated PixelSession (clientId: ${clientId}): ${pixelSession.id} with data:`, JSON.stringify(updateData));
        } else {
          console.log(`[${timestamp}] ACTION: PixelSession (clientId: ${clientId}): ${pixelSession.id} found, no new data to update.`);
        }
      } else {
        // Create new session with clientId
        pixelSession = await prisma.pixelSession.create({
          data: {
            shopId: shop.id,
            sessionToken: sessionToken, // ID of the event that initiated this clientId session
            clientId: clientId,
            userAgent: userAgent ?? undefined,
            requestShopDomain: shopDomainFromReq,
            ...(checkoutToken && { checkoutToken }),
            ...(customerEmail && { customerEmail }),
            ...(shopifyCustomerId && { shopifyCustomerId }),
            ...(shopifyOrderId && { shopifyOrderId }),
          },
        });
        console.log(`[${timestamp}] ACTION: Created new PixelSession (clientId: ${clientId}): ${pixelSession.id}`);
      }
    } else {
      // Fallback: no clientId. Create a PixelSession per event, using eventId as sessionToken.
      // These sessions are isolated.
      pixelSession = await prisma.pixelSession.create({
        data: {
          shopId: shop.id,
          sessionToken: sessionToken, // Event ID as the session token
          userAgent: userAgent ?? undefined,
          requestShopDomain: shopDomainFromReq,
          ...(checkoutToken && { checkoutToken }), // Still capture if available
          ...(customerEmail && { customerEmail }),
          ...(shopifyCustomerId && { shopifyCustomerId }),
          ...(shopifyOrderId && { shopifyOrderId }),
        },
      });
      console.log(`[${timestamp}] ACTION: Created new PixelSession (no clientId, eventId: ${sessionToken}): ${pixelSession.id}`);
    }

    // Create the PixelEvent
    const newEvent = await prisma.pixelEvent.create({
      data: {
        eventType: eventName,
        timestamp: eventTimestamp ? new Date(eventTimestamp) : new Date(),
        userAgent: userAgent ?? undefined, // Use userAgent from request headers
        eventData: body, // Store the full event payload
        requestShopDomain: shopDomainFromReq, // Denormalized from event
        requestSessionToken: uniqueToken, // Denormalized uniqueToken from event (metadata.uniqueToken or eventId)
        shopId: shop.id,
        pixelSessionId: pixelSession.id, // Link to the created/found PixelSession
      },
    });
    console.log(`[${timestamp}] ACTION: Pixel event stored: ${newEvent.id}, linked to PixelSession: ${pixelSession.id}`);
    return json({ message: 'Pixel event received and stored successfully', eventId: newEvent.id, pixelSessionId: pixelSession.id }, { status: 200, headers: responseHeaders });

  } catch (error: any) {
    console.error(`[${timestamp}] ACTION: Error processing pixel event:`, error.message, error.stack);
    // Ensure CORS headers are on error responses too
    return json({ error: 'Failed to process pixel event', details: error.message }, { status: 500, headers: responseHeaders });
  }
} 