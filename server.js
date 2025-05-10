// server.js - Express server with Prisma for storing Shopify web pixel events
import express from 'express';
import { PrismaClient } from '@prisma/client';
import cors from 'cors';

const app = express();
const prisma = new PrismaClient();

// Middleware
app.use(express.json());

// Enhanced CORS configuration
const corsOptions = {
  origin: 'https://upsellpilot.myshopify.com', // Explicitly allow your Shopify store's origin
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
    const eventData = req.body;
    
    // Extract key information for session tracking
    const {
      eventName,
      uniqueToken,
      shop,
      metadata
    } = eventData;

    // Store event in database
    const storedEvent = await prisma.pixelEvent.create({
      data: {
        eventType: eventName,
        sessionToken: uniqueToken, // Shopify's session token
        shopId: shop?.id,
        shopDomain: shop?.domain,
        timestamp: new Date(),
        userAgent: metadata?.userAgent,
        // Store the complete event data as JSON
        eventData: eventData
      }
    });

    // Optional: Update session information
    await updateOrCreateSession(uniqueToken, eventData);

    res.status(200).json({ success: true, eventId: storedEvent.id });
  } catch (error) {
    console.error('Error storing pixel event:', error);
    res.status(500).json({ success: false, error: 'Failed to store event' });
  }
});

// Helper function to update or create session information
async function updateOrCreateSession(sessionToken, eventData) {
  try {
    // Check if session exists
    const existingSession = await prisma.pixelSession.findUnique({
      where: {
        sessionToken: sessionToken
      }
    });

    if (existingSession) {
      // Update existing session
      await prisma.pixelSession.update({
        where: {
          sessionToken: sessionToken
        },
        data: {
          lastActive: new Date(),
          eventCount: existingSession.eventCount + 1
        }
      });
    } else {
      // Create new session
      await prisma.pixelSession.create({
        data: {
          sessionToken: sessionToken,
          shopId: eventData.shop?.id,
          shopDomain: eventData.shop?.domain,
          userAgent: eventData.metadata?.userAgent,
          firstSeen: new Date(),
          lastActive: new Date(),
          eventCount: 1
        }
      });
    }
  } catch (error) {
    console.error('Error updating session:', error);
  }
}

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
