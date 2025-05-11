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
    // This case should ideally not happen for web pixel requests from a browser
    console.log("CORS: No Origin header present in the request. ACAO not set.");
  }

  if (originAllowed && requestOrigin) {
    responseHeaders.set("Access-Control-Allow-Origin", requestOrigin);
    // Explicitly log that the ACAO header is being set
    console.log(`CORS: Origin ${requestOrigin} is allowed. Set Access-Control-Allow-Origin to: ${requestOrigin}`);
    responseHeaders.set("Access-Control-Allow-Credentials", "true");
  } else if (requestOrigin) {
    // Origin was present but not in the allow list
    console.warn(`CORS: Origin ${requestOrigin} is NOT allowed. Access-Control-Allow-Origin was NOT set.`);
  }
  // These headers are generally set for CORS responses
  responseHeaders.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  responseHeaders.set("Access-Control-Allow-Headers", "Content-Type, Authorization, Origin, Accept, X-Shopify-Hmac-Sha256");
  responseHeaders.set("Access-Control-Max-Age", "86400"); // 24 hours
}

export async function loader({ request }: LoaderFunctionArgs) {
  console.log("--- Loader: All Request Headers ---");
  request.headers.forEach((value, key) => {
    console.log(`Loader Header: ${key}: ${value}`);
  });
  console.log("-----------------------------------");

  const requestOrigin = request.headers.get("Origin");
  const responseHeaders = new Headers();
  setCorsHeaders(responseHeaders, requestOrigin); //This will set ACAO if origin is valid

  if (request.method === "OPTIONS") {
    const originForLog = requestOrigin || "undefined";
    const acaoValue = responseHeaders.get("Access-Control-Allow-Origin") || "Not Set";
    console.log(`Remix API route: Handling OPTIONS request. Detected Origin: ${originForLog}. Responding with ACAO: ${acaoValue}`);
    return new Response(null, { status: 204, headers: responseHeaders });
  }

  // Fallback for other methods like GET if not explicitly handled
  console.log(`Remix API route: ${request.method} request to /api/pixel-events, not allowed by loader.`);
  return json({ error: "Method Not Allowed by loader" }, { status: 405, headers: responseHeaders });
}

export async function action({ request }: ActionFunctionArgs) {
  console.log("--- Action: All Request Headers ---");
  request.headers.forEach((value, key) => {
    console.log(`Action Header: ${key}: ${value}`);
  });
  console.log("-----------------------------------");

  const requestOrigin = request.headers.get("Origin");
  const responseHeaders = new Headers();
  setCorsHeaders(responseHeaders, requestOrigin); //This will set ACAO if origin is valid

  // Early exit if CORS pre-check failed (e.g. origin was present but not allowed)
  // This relies on setCorsHeaders NOT setting ACAO if origin is disallowed.
  if (requestOrigin && !responseHeaders.has("Access-Control-Allow-Origin")) {
    console.error(`CORS error in action: Origin ${requestOrigin} was present but not allowed by CORS policy.`);
    return json({ error: "CORS error", details: `Origin ${requestOrigin} not allowed` }, { status: 403, headers: responseHeaders });
  }
  
  // Though OPTIONS should be handled by loader, catch it here defensively.
  if (request.method === "OPTIONS") {
    const originForLog = requestOrigin || "undefined";
    const acaoValue = responseHeaders.get("Access-Control-Allow-Origin") || "Not Set";
    console.log(`Remix API route: Handling OPTIONS in action (fallback). Detected Origin: ${originForLog}. Responding with ACAO: ${acaoValue}`);
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