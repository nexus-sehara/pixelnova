import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import prisma from "../db.server"; // Corrected path to Prisma client
import cors from "cors";

const corsMiddleware = cors({
  origin: function (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) {
    console.log('CORS check (Remix API route): Request Origin:', origin);
    if (!origin) {
      console.log('CORS check (Remix API route): No origin present, allowing.');
      return callback(null, true);
    }
    // Corrected regex patterns
    const shopifyDomainPattern = /^https?:\/\/[a-zA-Z0-9-]+\.myshopify\.com$/;
    const renderPreviewPattern = /^https?:\/\/[a-zA-Z0-9-]+-pr-\d+\.onrender\.com$/;
    const customDomain = process.env.SHOPIFY_APP_URL ? new URL(process.env.SHOPIFY_APP_URL).origin : null;

    if (shopifyDomainPattern.test(origin) || renderPreviewPattern.test(origin) || (customDomain && origin === customDomain)) {
      console.log(`CORS check (Remix API route): Origin ${origin} allowed.`);
      callback(null, true);
    } else {
      console.error(`CORS check (Remix API route): Origin ${origin} NOT allowed.`);
      callback(new Error(`Origin ${origin} not allowed by CORS`));
    }
  },
  methods: ['POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Origin', 'Accept'],
  credentials: true,
  maxAge: 86400, // 24 hours
  optionsSuccessStatus: 200
});

function runCorsMiddleware(req: Request, resHeaders: Headers) {
  return new Promise<Headers>((resolve, reject) => {
    const mockRes = {
      setHeader: (name: string, value: string) => resHeaders.set(name, value),
      getHeader: (name: string) => resHeaders.get(name),
      end: () => resolve(resHeaders),
    };
    (corsMiddleware as any)(req, mockRes, (err: any) => {
      if (err) {
        console.error("Error in CORS middleware:", err);
        reject(err);
      } else {
        resolve(resHeaders);
      }
    });
  });
}

export async function loader({ request }: LoaderFunctionArgs) {
  const responseHeaders = new Headers();
  // For OPTIONS requests, it's common to handle them early and return.
  // The action function will also run CORS, but for OPTIONS, loader is often sufficient.
  if (request.method === "OPTIONS") {
    console.log("Remix API route: Handling OPTIONS request in loader for /api/pixel-events");
    try {
      await runCorsMiddleware(request, responseHeaders);
      return new Response(null, { status: 204, headers: responseHeaders });
    } catch (corsError) {
      console.error("CORS error in loader OPTIONS:", corsError);
      return json({ error: "CORS error", details: (corsError as Error).message }, { status: 403 }); // No need to pass responseHeaders here, it's a fresh json response
    }
  }

  // For other methods like GET, if not allowed:
  await runCorsMiddleware(request, responseHeaders); // Still run for other methods to set headers if needed by client for error display
  console.log("Remix API route: GET request to /api/pixel-events, method not allowed.");
  return json({ error: "Method Not Allowed" }, { status: 405, headers: responseHeaders });
}

export async function action({ request }: ActionFunctionArgs) {
  const responseHeaders = new Headers();

  try {
    await runCorsMiddleware(request, responseHeaders);
  } catch (corsError) {
    console.error("CORS error in action:", corsError);
    return json({ error: "CORS error", details: (corsError as Error).message }, { status: 403, headers: responseHeaders });
  }
  
  // OPTIONS requests should ideally be fully handled by the loader or an earlier middleware.
  // If an OPTIONS request somehow reaches here, respond appropriately.
  if (request.method === "OPTIONS") {
    console.log("Remix API route: Handling OPTIONS request in action for /api/pixel-events (should have been caught by loader ideally)");
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