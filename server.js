// server.js - Express server with Prisma for storing Shopify web pixel events
import express from 'express';
import { PrismaClient } from '@prisma/client';
import cors from 'cors';

const app = express();
const prisma = new PrismaClient();

// Middleware
app.use(express.json());

// Enhanced CORS configuration
const allowedOrigins = [
  // Add any other specific origins if needed, e.g., for local development
];

const corsOptions = {
  origin: function (origin, callback) {
    console.log('CORS check: Request Origin:', origin); // Log the origin

    if (!origin) {
      // Allow requests with no origin (like mobile apps or curl requests if you want to support them)
      // For web pixels, an origin is usually present.
      // If you want to strictly enforce origin for browser-based pixels, you might disallow this.
      console.log('CORS check: No origin present, allowing for now (consider if this is safe for your app).');
      return callback(null, true);
    }

    // Regex to match any *.myshopify.com domain
    const shopifyDomainPattern = /^https?:\/\/[a-zA-Z0-9-]+\.myshopify\.com$/;

    if (shopifyDomainPattern.test(origin) || allowedOrigins.includes(origin)) {
      console.log(`CORS check: Origin ${origin} allowed.`);
      callback(null, true);
    } else {
      console.error(`CORS check: Origin ${origin} NOT allowed.`);
      callback(new Error(`Origin ${origin} not allowed by CORS`)); // Provide a more specific error
    }
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Origin', 'Accept'],
  credentials: true,
  maxAge: 86400, // 24 hours
  optionsSuccessStatus: 200 // For legacy browser compatibility
};

app.use(cors(corsOptions));

// Handle preflight OPTIONS requests specifically for the pixel events endpoint
app.options('/api/pixel-events', cors(corsOptions));

// Endpoint to receive web pixel events
// The global cors middleware should cover this, but being explicit here doesn't hurt.
app.post('/api/pixel-events', cors(corsOptions), async (req, res) => {
  try {
    // Correctly extract eventName from metadata as per logs
    const { data: eventDataRaw, metadata, type, context, id: eventId, timestamp: eventTimestamp } = req.body;
    const eventName = metadata?.eventName; // <<<< CORRECTED SOURCE

    const shopDomainFromReq = metadata?.shopDomain || context?.document?.location?.hostname || '';
    const uniqueToken = metadata?.uniqueToken || eventId;

    if (!eventName) {
      // If eventName is still missing, log the whole body for deeper inspection
      console.error('CRITICAL: eventName is missing from req.body.metadata.eventName. Request body:', JSON.stringify(req.body, null, 2));
    }
    console.log(`Processing event: ${eventName || 'Unknown Event Name'}, Shop Domain from Req: ${shopDomainFromReq}, Token: ${uniqueToken}`);

    let shop = null;
    if (shopDomainFromReq) {
      shop = await prisma.shop.findUnique({
        where: { domain: shopDomainFromReq },
      });

      if (!shop) {
        try {
          shop = await prisma.shop.create({
            data: { domain: shopDomainFromReq }, 
          });
          console.log(`Created new shop: ${shop.domain} with id: ${shop.id}`);
        } catch (e) {
          console.error(`Error creating shop with domain ${shopDomainFromReq}:`, e);
          // If shop creation fails and shop is essential, consider returning an error
        }
      }
    } else {
      console.warn('shopDomainFromReq is empty or missing. Cannot find or create shop.');
      // shop remains null. This might be an issue if your PixelEvent requires a shop relation.
    }

    const pixelEventData = {
      // --- Direct scalar fields for PixelEvent, as per schema.prisma ---
      eventType: eventName || 'unknown_event_type', 
      sessionToken: uniqueToken, // This is required by PixelEvent schema
      
      shopId: shop ? shop.id : null, // Direct field on PixelEvent
      shopDomain: shop ? shop.domain : null, // Direct field on PixelEvent

      timestamp: new Date(eventTimestamp),
      userAgent: context?.navigator?.userAgent || '',
      eventData: req.body, 

      // --- Relational connect/create for PixelSession ---
      // PixelEvent.sessionToken (scalar) is the foreign key for this relation.
      session: uniqueToken ? { 
        connectOrCreate: {
          where: { sessionToken: uniqueToken }, // PixelSession.sessionToken is @unique
          create: { 
            sessionToken: uniqueToken, 
            shopId: shop ? shop.id : null, // For PixelSession record
            shopDomain: shop ? shop.domain : null, // For PixelSession record
            userAgent: context?.navigator?.userAgent || '',
            // eventCount defaults to 0 in schema
          },
        },
      } : undefined,
    };

    console.log('Data for Prisma PixelEvent create:', JSON.stringify(pixelEventData, null, 2));

    try {
      const storedEvent = await prisma.pixelEvent.create({ data: pixelEventData });
      console.log('Pixel event stored:', storedEvent.id);
      res.status(200).json({ message: 'Pixel event received and stored successfully', eventId: storedEvent.id });
    } catch (error) {
      console.error('Error storing pixel event with Prisma:', error);
      console.error('Failed Prisma data for pixelEventData:', JSON.stringify(pixelEventData, null, 2));
      res.status(500).json({ error: 'Failed to store pixel event', details: error.message });
    }
  } catch (error) {
    console.error('Outer error handling pixel event:', error);
    res.status(500).json({ success: false, error: 'Failed to process event' });
  }
});

// Analytics endpoint - get aggregated data
app.get('/api/analytics/sessions', async (req, res) => {
  try {
    const sessions = await prisma.pixelSession.findMany({
      include: {
        _count: {
          select: { events: true }
        }
      }
    });
    
    res.json(sessions);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch session data' });
  }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
