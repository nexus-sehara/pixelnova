import { PrismaClient } from '@prisma/client';
import { withAccelerate } from '@prisma/extension-accelerate';

let prisma;

// Check if the DATABASE_URL is an Accelerate URL or if an Accelerate API key is present
// This helps ensure Accelerate is used when configured, especially in production.
const isAccelerateEnvironment = process.env.DATABASE_URL?.startsWith('prisma://') || process.env.PRISMA_ACCELERATE_API_KEY;

if (isAccelerateEnvironment) {
  console.log("Initializing Prisma Client with Accelerate.");
  prisma = new PrismaClient().$extends(withAccelerate());
} else {
  console.log("Initializing Prisma Client for direct database connection (no Accelerate detected).");
  prisma = new PrismaClient();
}

export default prisma;
