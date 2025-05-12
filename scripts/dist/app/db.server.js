"use strict";
var _a, _b;
Object.defineProperty(exports, "__esModule", { value: true });
var client_1 = require("@prisma/client");
var extension_accelerate_1 = require("@prisma/extension-accelerate");
// Explicitly type prisma. For a client extended with Accelerate,
// the exact type can be more complex, but PrismaClient is a good base.
var prisma; // Using any to bypass complex extended type issues for now
// Check if the DATABASE_URL indicates an Accelerate connection.
// Accelerate URLs typically start with 'prisma://' or 'prisma+postgres://'
var isAccelerateUrl = (_a = process.env.DATABASE_URL) === null || _a === void 0 ? void 0 : _a.startsWith('prisma');
// Also check if a specific Accelerate API key env var is set, as an alternative indicator
var hasAccelerateApiKeyEnv = !!process.env.PRISMA_ACCELERATE_API_KEY;
if (isAccelerateUrl || hasAccelerateApiKeyEnv) {
    console.log("Initializing Prisma Client with Accelerate.");
    if (!((_b = process.env.DATABASE_URL) === null || _b === void 0 ? void 0 : _b.includes('api_key='))) {
        console.warn("DATABASE_URL looks like Accelerate but might be missing an API key. Ensure PRISMA_ACCELERATE_API_KEY is set if so.");
    }
    // TypeScript will infer the more specific extended type here
    prisma = new client_1.PrismaClient().$extends((0, extension_accelerate_1.withAccelerate)());
}
else {
    console.log("Initializing Prisma Client for direct database connection (no Accelerate detected).");
    prisma = new client_1.PrismaClient();
}
exports.default = prisma;
