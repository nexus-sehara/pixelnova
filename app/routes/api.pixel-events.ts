import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import prisma from "../db.server";
import type { Prisma } from "@prisma/client"; // Import Prisma namespace for types

console.log(`[${new Date().toISOString()}] MODULE LOADED: app/routes/api.pixel-events.ts`);

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
  } else {
    console.log(`[${new Date().toISOString()}] CORS: No Origin header present in the request. ACAO not set.`);
  }

  if (originAllowed && requestOrigin) {
    responseHeaders.set("Access-Control-Allow-Origin", requestOrigin);
    console.log(`[${new Date().toISOString()}] CORS: Origin '${requestOrigin}' IS ALLOWED (matched ${matchedPattern}). Set ACAO to: '${requestOrigin}'`);
    responseHeaders.set("Access-Control-Allow-Credentials", "true");
  } else if (requestOrigin) {
    console.warn(`[${new Date().toISOString()}] CORS: Origin '${requestOrigin}' IS NOT ALLOWED. getAllowedOrigins() list: [${allowedOriginsPatterns.join(", ")}]. ACAO was NOT set.`);
  }
  // These headers are generally set for CORS responses, even if origin is not specifically allowed (browser will then block)
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
  // Use the centralized setCorsHeaders for OPTIONS requests as well
  setCorsHeaders(responseHeaders, requestOrigin);

  if (request.method === "OPTIONS") {
    // setCorsHeaders would have already set ACAO if origin is allowed.
    // If origin was not allowed, ACAO header won't be there, which is correct.
    console.log(`[${timestamp}] LOADER (OPTIONS): Responding with status 204. ACAO set to: ${responseHeaders.get("Access-Control-Allow-Origin") || "Not set (Origin not allowed or not present)"}`);
    return new Response(null, { status: 204, headers: responseHeaders });
  }

  // Fallback for other methods like GET if not explicitly handled by this route
  console.log(`[${timestamp}] LOADER: ${request.method} request to /api/pixel-events, not allowed by loader. Responding 405.`);
  // Ensure basic CORS headers are on error responses from loader too.
  // setCorsHeaders already added general CORS headers. If origin was valid, ACAO would be there.
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
    const eventData = body.data; // This is the object that should contain checkout, cart lines, etc.
    const clientId = body.clientId; // Corrected: clientId is at the top level of the event body

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

    if (clientId && shop.id) { // Ensure clientId and shop.id are present for upsert
      const createData = {
        shopId: shop.id,
        sessionToken: sessionToken, // ID of the event that initiated this clientId session
        clientId: clientId,
        userAgent: userAgent ?? undefined,
        requestShopDomain: shopDomainFromReq,
        checkoutToken: checkoutToken ?? undefined,
        customerEmail: customerEmail ?? undefined,
        shopifyCustomerId: shopifyCustomerId ?? undefined,
        shopifyOrderId: shopifyOrderId ?? undefined,
      };

      const updateData = {
        userAgent: userAgent ?? undefined,
        requestShopDomain: shopDomainFromReq, // Potentially update if it changes
        // lastActive is handled by @updatedAt
        // Conditionally add fields to updateData only if they have new values
        // This prevents overwriting existing values with null/undefined if not present in the current event
        ...(checkoutToken && { checkoutToken }),
        ...(customerEmail && { customerEmail }),
        ...(shopifyCustomerId && { shopifyCustomerId }),
        ...(shopifyOrderId && { shopifyOrderId }),
      };
      
      // Remove undefined properties from updateData to avoid Prisma errors or accidental nulling of fields
      Object.keys(updateData).forEach(key => updateData[key as keyof typeof updateData] === undefined && delete updateData[key as keyof typeof updateData]);

      pixelSession = await prisma.pixelSession.upsert({
        where: { 
          shopId_clientId_unique: { // Use the name of the unique constraint
            shopId: shop.id,
            clientId: clientId,
          }
        },
        create: createData,
        update: updateData,
      });
      console.log(`[${timestamp}] ACTION: Upserted PixelSession (clientId: ${clientId}): ${pixelSession.id}. EventName: ${eventName}. Contained shopifyOrderId: ${shopifyOrderId || 'N/A'}, shopifyCustomerId: ${shopifyCustomerId || 'N/A'}`);
    } else if (sessionToken) { // Fallback: no clientId or shopId for upsert. Create a PixelSession per event.
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
    
    // Re-affirm ACAO header for the actual POST response
    if (requestOrigin && responseHeaders.has("Access-Control-Allow-Origin")) {
        // This check ensures we only re-affirm if it was allowed and set by setCorsHeaders initially
        // If setCorsHeaders decided not to set it (e.g. origin not allowed), we don't add it here.
        // The value should be the one set by setCorsHeaders.
        console.log(`[${timestamp}] ACTION: Re-affirming Access-Control-Allow-Origin for POST response to: ${responseHeaders.get("Access-Control-Allow-Origin")}`);
    }

    return json({ message: 'Pixel event received and stored successfully', eventId: newEvent.id, pixelSessionId: pixelSession.id }, { status: 200, headers: responseHeaders });

  } catch (error: any) {
    console.error(`[${timestamp}] ACTION: Error processing pixel event:`, error.message, error.stack);
    // Ensure CORS headers are on error responses too
    return json({ error: 'Failed to process pixel event', details: error.message }, { status: 500, headers: responseHeaders });
  }
} 