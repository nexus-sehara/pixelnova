import { PrismaClient } from '@prisma/client';
import { withAccelerate } from '@prisma/extension-accelerate';

// Explicitly type prisma. For a client extended with Accelerate,
// the exact type can be more complex, but PrismaClient is a good base.
let prisma: any; // Using any to bypass complex extended type issues for now

// Check if the DATABASE_URL indicates an Accelerate connection.
// Accelerate URLs typically start with 'prisma://' or 'prisma+postgres://'
const isAccelerateUrl = process.env.DATABASE_URL?.startsWith('prisma');

// Also check if a specific Accelerate API key env var is set, as an alternative indicator
const hasAccelerateApiKeyEnv = !!process.env.PRISMA_ACCELERATE_API_KEY;

if (isAccelerateUrl || hasAccelerateApiKeyEnv) {
  console.log("Initializing Prisma Client with Accelerate.");
  if (!process.env.DATABASE_URL?.includes('api_key=')) {
    console.warn("DATABASE_URL looks like Accelerate but might be missing an API key. Ensure PRISMA_ACCELERATE_API_KEY is set if so.");
  }
  // TypeScript will infer the more specific extended type here
  prisma = new PrismaClient().$extends(withAccelerate());
} else {
  console.log("Initializing Prisma Client for direct database connection (no Accelerate detected).");
  prisma = new PrismaClient();
}

export default prisma; 