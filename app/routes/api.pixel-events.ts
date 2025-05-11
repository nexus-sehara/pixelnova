import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import prisma from "../db.server"; // Corrected path to Prisma client

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
  // Action will continue to use setCorsHeaders which has more robust origin checking
  setCorsHeaders(responseHeaders, requestOrigin);

  if (requestOrigin && !responseHeaders.has("Access-Control-Allow-Origin")) {
    console.error(`[${timestamp}] ACTION CORS ERROR: Origin ${requestOrigin} was present but not allowed by CORS policy.`);
    return json({ error: "CORS error", details: `Origin ${requestOrigin} not allowed` }, { status: 403, headers: responseHeaders });
  }
  
  if (request.method === "OPTIONS") {
    // This should ideally be fully handled by the loader.
    // If it reaches here, it's a fallback.
    console.warn(`[${timestamp}] ACTION (FALLBACK OPTIONS): Handling OPTIONS request. Origin: ${requestOrigin || "undefined"}. ACAO: ${responseHeaders.get("Access-Control-Allow-Origin") || "Not Set"}`);
    return new Response(null, { status: 204, headers: responseHeaders });
  }

  if (request.method !== "POST") {
    console.log(`[${timestamp}] ACTION: Method ${request.method} not allowed for /api/pixel-events.`);
    return json({ error: "Method Not Allowed" }, { status: 405, headers: responseHeaders });
  }

  try {
    const body = await request.json();
    const { metadata, context, id: eventId, timestamp: eventTimestamp } = body;
    const eventName = metadata?.eventName;

    const shopDomainFromReq = metadata?.shopDomain || context?.document?.location?.hostname || '';
    const uniqueToken = metadata?.uniqueToken || eventId;

    if (!eventName) {
      console.error(`[${timestamp}] ACTION CRITICAL: eventName is missing. Body:`, JSON.stringify(body, null, 2));
      return json({ error: 'eventName is missing' }, { status: 400, headers: responseHeaders });
    }
    console.log(`[${timestamp}] ACTION: Processing event: ${eventName}, Shop: ${shopDomainFromReq}, Session: ${uniqueToken}`);

    let shop = null;
    if (shopDomainFromReq) {
      try {
        shop = await prisma.shop.findUnique({ where: { domain: shopDomainFromReq } });
        if (!shop) {
          shop = await prisma.shop.create({ data: { domain: shopDomainFromReq } });
          console.log(`[${timestamp}] ACTION: Created new shop: ${shop.domain}`);
        }
      } catch (e) {
        console.error(`[${timestamp}] ACTION: Error finding/creating shop ${shopDomainFromReq}:`, e);
      }
    } else {
      console.warn(`[${timestamp}] ACTION: shopDomainFromReq is missing.`);
    }

    let createdOrFoundPixelSession = null;
    if (uniqueToken) {
      try {
        const userAgent = context?.navigator?.userAgent || '';
        const eventClientId = body.clientId; // Extract clientId from the event body

        const sessionData = {
          lastActive: new Date(),
          userAgent: userAgent,
          requestShopDomain: shopDomainFromReq,
          shopId: shop?.id,
          clientId: eventClientId, // Include clientId in the data for upsert
        };
        createdOrFoundPixelSession = await prisma.pixelSession.upsert({
          where: { sessionToken: uniqueToken },
          update: sessionData,
          create: {
            sessionToken: uniqueToken,
            userAgent: userAgent,
            requestShopDomain: shopDomainFromReq,
            shopId: shop?.id,
            clientId: eventClientId, // Include clientId when creating a new session
            firstSeen: eventTimestamp ? new Date(eventTimestamp) : new Date(),
          },
        });
        console.log(`[${timestamp}] ACTION: Upserted PixelSession: ${createdOrFoundPixelSession.id}`);
      } catch (e) {
        console.error(`[${timestamp}] ACTION: Error upserting PixelSession ${uniqueToken}:`, e);
      }
    } else {
      console.warn(`[${timestamp}] ACTION: uniqueToken is missing for PixelSession.`);
    }

    const pixelEventToCreate = {
      eventType: eventName,
      timestamp: eventTimestamp ? new Date(eventTimestamp) : new Date(),
      userAgent: context?.navigator?.userAgent || '',
      eventData: body,
      requestShopDomain: shopDomainFromReq,
      requestSessionToken: uniqueToken,
      shopId: shop?.id,
      pixelSessionId: createdOrFoundPixelSession?.id,
    };

    const storedEvent = await prisma.pixelEvent.create({ data: pixelEventToCreate });
    console.log(`[${timestamp}] ACTION: Pixel event stored: ${storedEvent.id}`);
    return json({ message: 'Pixel event received and stored successfully', eventId: storedEvent.id }, { status: 200, headers: responseHeaders });

  } catch (error: any) {
    console.error(`[${timestamp}] ACTION: Error processing pixel event:`, error);
    if (error.message.includes("JSON Parse error")) {
         return json({ error: 'Failed to parse JSON body' }, { status: 400, headers: responseHeaders });
    }
    return json({ error: 'Failed to process event', details: error.message }, { status: 500, headers: responseHeaders });
  }
} 