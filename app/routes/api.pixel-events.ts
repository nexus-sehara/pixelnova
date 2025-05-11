import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import prisma from "../db.server"; // Corrected path to Prisma client

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
    // If no origin header is present, we might allow (e.g. for server-to-server or if not strictly required)
    // However, for web pixel (browser context) an Origin header is expected.
    // For now, let's be strict: if origin is expected for CORS, it must be present and match.
    // If you want to allow requests with no origin, this logic would need adjustment.
    console.log("CORS: No Origin header present in the request.");
    // originAllowed = true; // Example: uncomment to allow requests with no Origin header
  }

  if (originAllowed && requestOrigin) {
    responseHeaders.set("Access-Control-Allow-Origin", requestOrigin);
    responseHeaders.set("Access-Control-Allow-Credentials", "true");
  } else if (requestOrigin) {
    // If origin was present but not allowed, don't set Allow-Origin
    // The browser will block it, which is the correct behavior.
    console.warn(`CORS: Origin ${requestOrigin} is not allowed.`);
  }
  // These headers are often set even if origin isn't matched, or for preflight.
  responseHeaders.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  responseHeaders.set("Access-Control-Allow-Headers", "Content-Type, Authorization, Origin, Accept, X-Shopify-Hmac-Sha256");
  responseHeaders.set("Access-Control-Max-Age", "86400"); // 24 hours
}

export async function loader({ request }: LoaderFunctionArgs) {
  console.log("--- Loader: All Request Headers ---");
  request.headers.forEach((value, key) => {
    console.log(`Header: ${key}: ${value}`);
  });
  console.log("-----------------------------------");

  const requestOrigin = request.headers.get("Origin");
  const responseHeaders = new Headers();
  setCorsHeaders(responseHeaders, requestOrigin);

  if (request.method === "OPTIONS") {
    console.log("Remix API route: Handling OPTIONS request in loader for /api/pixel-events. Origin:", requestOrigin);
    // Check if origin was allowed by setCorsHeaders implicitly
    // If Access-Control-Allow-Origin is set, it means origin was matched and allowed
    if (requestOrigin && responseHeaders.has("Access-Control-Allow-Origin")) {
      return new Response(null, { status: 204, headers: responseHeaders });
    } else if (!requestOrigin) {
        // Allow OPTIONS if no origin for cases like simple health checks or if policy is relaxed
        // However, for a browser's preflight, origin should be present.
        // This case might need review based on actual scenarios.
        console.log("Remix API route: OPTIONS request with no Origin header. Responding 204.");
        return new Response(null, { status: 204, headers: responseHeaders }); // Still send general CORS headers
    } else {
      console.warn(`Remix API route: OPTIONS request from disallowed origin ${requestOrigin}. Responding 403.`);
      // It's better to return 204 for OPTIONS even if origin is denied, as per some interpretations.
      // The actual POST will be blocked. Or return 403. For now, let's send 204.
      return new Response(null, { status: 204, headers: responseHeaders });
      // Alternative for strict denial:
      // return new Response("CORS: Origin not allowed for OPTIONS", { status: 403, headers: responseHeaders });
    }
  }

  console.log(`Remix API route: ${request.method} request to /api/pixel-events, method not allowed by loader.`);
  return json({ error: "Method Not Allowed by loader" }, { status: 405, headers: responseHeaders });
}

export async function action({ request }: ActionFunctionArgs) {
  console.log("--- Action: All Request Headers ---");
  request.headers.forEach((value, key) => {
    console.log(`Header: ${key}: ${value}`);
  });
  console.log("-----------------------------------");

  const requestOrigin = request.headers.get("Origin");
  const responseHeaders = new Headers();
  setCorsHeaders(responseHeaders, requestOrigin);

  // If origin was required, present, but not allowed, Access-Control-Allow-Origin won't be set.
  // The browser will block this client-side. For server-side, we can reject early.
  if (requestOrigin && !responseHeaders.has("Access-Control-Allow-Origin")) {
    console.error(`CORS error in action: Origin ${requestOrigin} not allowed.`);
    return json({ error: "CORS error", details: `Origin ${requestOrigin} not allowed` }, { status: 403, headers: responseHeaders });
  }
  
  if (request.method === "OPTIONS") {
    console.log("Remix API route: Handling OPTIONS request in action (should have been caught by loader). Origin:", requestOrigin);
    // This should ideally be handled by the loader.
    return new Response(null, { status: 204, headers: responseHeaders });
  }

  if (request.method !== "POST") {
    console.log(`Remix API route: Method ${request.method} not allowed for /api/pixel-events.`);
    return json({ error: "Method Not Allowed" }, { status: 405, headers: responseHeaders });
  }

  try {
    const body = await request.json();
    const { metadata, context, id: eventId, timestamp: eventTimestamp } = body;
    const eventName = metadata?.eventName;

    const shopDomainFromReq = metadata?.shopDomain || context?.document?.location?.hostname || '';
    const uniqueToken = metadata?.uniqueToken || eventId;

    if (!eventName) {
      console.error('Remix API route CRITICAL: eventName is missing. Body:', JSON.stringify(body, null, 2));
      return json({ error: 'eventName is missing' }, { status: 400, headers: responseHeaders });
    }
    console.log(`Remix API route Processing event: ${eventName}, Shop: ${shopDomainFromReq}, Session: ${uniqueToken}`);

    let shop = null;
    if (shopDomainFromReq) {
      try {
        shop = await prisma.shop.findUnique({ where: { domain: shopDomainFromReq } });
        if (!shop) {
          shop = await prisma.shop.create({ data: { domain: shopDomainFromReq } });
          console.log(`Remix API route Created new shop: ${shop.domain}`);
        }
      } catch (e) {
        console.error(`Remix API route Error finding/creating shop ${shopDomainFromReq}:`, e);
      }
    } else {
      console.warn('Remix API route: shopDomainFromReq is missing.');
    }

    let createdOrFoundPixelSession = null;
    if (uniqueToken) {
      try {
        const userAgent = context?.navigator?.userAgent || '';
        const sessionData = {
          lastActive: new Date(),
          userAgent: userAgent,
          requestShopDomain: shopDomainFromReq,
          shopId: shop?.id,
        };
        createdOrFoundPixelSession = await prisma.pixelSession.upsert({
          where: { sessionToken: uniqueToken },
          update: sessionData,
          create: {
            sessionToken: uniqueToken,
            userAgent: userAgent,
            requestShopDomain: shopDomainFromReq,
            shopId: shop?.id,
            firstSeen: eventTimestamp ? new Date(eventTimestamp) : new Date(),
          },
        });
        console.log(`Remix API route Upserted PixelSession: ${createdOrFoundPixelSession.id}`);
      } catch (e) {
        console.error(`Remix API route Error upserting PixelSession ${uniqueToken}:`, e);
      }
    } else {
      console.warn('Remix API route: uniqueToken is missing for PixelSession.');
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
    console.log('Remix API route Pixel event stored:', storedEvent.id);
    return json({ message: 'Pixel event received and stored successfully', eventId: storedEvent.id }, { status: 200, headers: responseHeaders });

  } catch (error: any) {
    console.error('Remix API route Error processing pixel event:', error);
    if (error.message.includes("JSON Parse error")) {
         return json({ error: 'Failed to parse JSON body' }, { status: 400, headers: responseHeaders });
    }
    return json({ error: 'Failed to process event', details: error.message }, { status: 500, headers: responseHeaders });
  }
} 