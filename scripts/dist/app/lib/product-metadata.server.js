"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDistinctProductGidsFromEvents = getDistinctProductGidsFromEvents;
exports.fetchProductDetailsFromShopify = fetchProductDetailsFromShopify;
exports.upsertProductMetadata = upsertProductMetadata;
exports.syncAllProductMetadata = syncAllProductMetadata;
var client_1 = require("@prisma/client");
// Or import admin from "../shopify.server"; // if you have a specific shopify.server.ts for admin context
var prisma = new client_1.PrismaClient();
/**
 * Extracts distinct Shopify Product GIDs from PixelEvent.eventData.
 * This function will need to iterate through different event types and their specific JSON structures.
 */
function getDistinctProductGidsFromEvents(shopId, since) {
    return __awaiter(this, void 0, void 0, function () {
        var whereConditions, events, productGids;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    console.log("[ProductMetadata] Fetching distinct product GIDs from PixelEvents for shopId: ".concat(shopId).concat(since ? ' since ' + since.toISOString() : ''));
                    whereConditions = {
                        shopId: shopId,
                        // Potentially add a filter for eventType if we only care about specific ones
                        // eventType: { in: ['product_viewed', 'product_added_to_cart'] } 
                    };
                    if (since) {
                        whereConditions.timestamp = { gte: since };
                    }
                    return [4 /*yield*/, prisma.pixelEvent.findMany({
                            where: whereConditions,
                            select: { eventData: true, eventType: true }, // Select eventType to guide parsing
                        })];
                case 1:
                    events = _a.sent();
                    productGids = new Set();
                    events.forEach(function (event) {
                        var _a, _b, _c, _d, _e, _f, _g, _h;
                        var data = event.eventData; // Using any for flexibility, consider defining types for eventData structures
                        if (!data)
                            return;
                        var extractedGid;
                        var productIdFromVariant;
                        // Path from your example: event.eventData.data.productVariant.product.id
                        if (((_c = (_b = (_a = data.data) === null || _a === void 0 ? void 0 : _a.productVariant) === null || _b === void 0 ? void 0 : _b.product) === null || _c === void 0 ? void 0 : _c.id) && typeof data.data.productVariant.product.id === 'string') {
                            var DRAFT_ORDER_PREFIX = "gid://shopify/DraftOrder/";
                            var PRODUCT_PREFIX = "gid://shopify/Product/";
                            var numericProductId = data.data.productVariant.product.id.replace(PRODUCT_PREFIX, "");
                            // Ensure it's a numeric ID after stripping potential GID prefix (in case it's sometimes a GID)
                            if (/^\d+$/.test(numericProductId) && !data.data.productVariant.product.id.startsWith(DRAFT_ORDER_PREFIX)) {
                                extractedGid = "".concat(PRODUCT_PREFIX).concat(numericProductId);
                                console.log("[ProductMetadata] Extracted GID from product_viewed: ".concat(extractedGid, " from event:"), JSON.stringify(event, null, 2));
                            }
                            else {
                                console.log("[ProductMetadata] Skipped product_viewed GID: ".concat(data.data.productVariant.product.id));
                            }
                        }
                        else if (((_d = data.product) === null || _d === void 0 ? void 0 : _d.id) && typeof data.product.id === 'string' && data.product.id.startsWith('gid://shopify/Product/')) {
                            // Common for product_viewed, etc. directly having product.id (Original Check)
                            extractedGid = data.product.id;
                            console.log("[ProductMetadata] Extracted GID from data.product.id: ".concat(extractedGid));
                        }
                        else if (((_g = (_f = (_e = data.cartLine) === null || _e === void 0 ? void 0 : _e.merchandise) === null || _f === void 0 ? void 0 : _f.product) === null || _g === void 0 ? void 0 : _g.id) && typeof data.cartLine.merchandise.product.id === 'string' && data.cartLine.merchandise.product.id.startsWith('gid://shopify/Product/')) {
                            // Common for product_added_to_cart
                            extractedGid = data.cartLine.merchandise.product.id;
                            console.log("[ProductMetadata] Extracted GID from cartLine: ".concat(extractedGid));
                        }
                        else if (((_h = data.checkout) === null || _h === void 0 ? void 0 : _h.lineItems) && Array.isArray(data.checkout.lineItems)) {
                            // For checkout_started, checkout_completed
                            var PRODUCT_PREFIX_1 = "gid://shopify/Product/";
                            var DRAFT_ORDER_PREFIX_1 = "gid://shopify/DraftOrder/";
                            data.checkout.lineItems.forEach(function (item) {
                                var _a, _b;
                                var productId = (_b = (_a = item.variant) === null || _a === void 0 ? void 0 : _a.product) === null || _b === void 0 ? void 0 : _b.id;
                                if (productId && typeof productId === 'string') {
                                    var numericProductId = productId.replace(PRODUCT_PREFIX_1, "");
                                    if (/^\d+$/.test(numericProductId) && !productId.startsWith(DRAFT_ORDER_PREFIX_1)) {
                                        var gid = "".concat(PRODUCT_PREFIX_1).concat(numericProductId);
                                        productGids.add(gid);
                                        console.log("[ProductMetadata] Extracted GID from checkout.lineItems: ".concat(gid, " from event:"), JSON.stringify(event, null, 2));
                                    }
                                    else {
                                        console.log("[ProductMetadata] Skipped checkout.lineItems GID: ".concat(productId));
                                    }
                                }
                            });
                        }
                        else if (event.eventType === 'product_viewed' && data.id && typeof data.id === 'string' && data.id.startsWith('gid://shopify/Product/')) {
                            extractedGid = data.id;
                            console.log("[ProductMetadata] Extracted GID from data.id: ".concat(extractedGid));
                        }
                        // Potentially more complex parsing for other event types like 'collection_viewed'
                        // For 'collection_viewed', data.collection.products.edges[].node.id might be the path for products within that collection context
                        // or data.collection.productVariants for variants.
                        // Example for a hypothetical collection_viewed structure if it contained product GIDs directly:
                        // else if (event.eventType === 'collection_viewed' && data.collection?.products?.edges) {
                        //   data.collection.products.edges.forEach((edge: any) => {
                        //     if (edge.node?.id && typeof edge.node.id === 'string' && edge.node.id.startsWith('gid://shopify/Product/')) {
                        //       productGids.add(edge.node.id);
                        //     }
                        //   });
                        // }
                        if (extractedGid) {
                            productGids.add(extractedGid);
                            console.log("[ProductMetadata] Added GID to set: ".concat(extractedGid));
                        }
                    });
                    console.log("[ProductMetadata] Found ".concat(productGids.size, " distinct product GIDs for shopId: ").concat(shopId));
                    return [2 /*return*/, Array.from(productGids)];
            }
        });
    });
}
/**
 * Fetches product details from Shopify Admin API for a given Product GID.
 */
function fetchProductDetailsFromShopify(admin, productId) {
    return __awaiter(this, void 0, void 0, function () {
        var graphqlQuery, response, contentType, responseBody, jsonErr_1, rawText, error_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    console.log("[ProductMetadata] Fetching details for product GID: ".concat(productId, " from Shopify"));
                    graphqlQuery = "\n    query getProductDetails($id: ID!) {\n      product(id: $id) {\n        id\n        title\n        handle\n        productType\n        vendor\n        tags\n        status\n        createdAt\n        updatedAt\n        featuredImage {\n          url\n        }\n        priceRangeV2 {\n          minVariantPrice {\n            amount\n            currencyCode\n          }\n          maxVariantPrice {\n            amount\n            currencyCode\n          }\n        }\n        variants(first: 10) {\n          edges {\n            node {\n              id\n              title\n              sku\n              price\n              inventoryQuantity\n              image { url }\n            }\n          }\n        }\n        collections(first: 10) {\n          edges {\n            node {\n              id\n              title\n              handle\n            }\n          }\n        }\n      }\n    }\n  ";
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 8, , 9]);
                    return [4 /*yield*/, admin.graphql(graphqlQuery, { variables: { id: productId } })];
                case 2:
                    response = _a.sent();
                    contentType = response.headers.get('content-type');
                    responseBody = void 0;
                    _a.label = 3;
                case 3:
                    _a.trys.push([3, 5, , 7]);
                    return [4 /*yield*/, response.json()];
                case 4:
                    responseBody = _a.sent();
                    return [3 /*break*/, 7];
                case 5:
                    jsonErr_1 = _a.sent();
                    return [4 /*yield*/, response.text()];
                case 6:
                    rawText = _a.sent();
                    console.error("[ProductMetadata] Failed to parse JSON. Content-Type: ".concat(contentType, ". Raw response:"), rawText);
                    return [2 /*return*/, null];
                case 7:
                    if (!responseBody || !responseBody.data || !responseBody.data.product) {
                        console.error("[ProductMetadata] No product data returned for GID: ".concat(productId, ". Full response:"), JSON.stringify(responseBody, null, 2));
                        return [2 /*return*/, null];
                    }
                    return [2 /*return*/, responseBody.data.product];
                case 8:
                    error_1 = _a.sent();
                    console.error("[ProductMetadata] Error fetching product ".concat(productId, " from Shopify:"), error_1);
                    return [2 /*return*/, null];
                case 9: return [2 /*return*/];
            }
        });
    });
}
/**
 * Transforms Shopify product data (from Admin API) into the structure needed for ProductMetadata table
 * and upserts it into the database.
 */
function upsertProductMetadata(shopId, shopifyProductData // Replace 'any' with a type representing the fetched Shopify product data
) {
    return __awaiter(this, void 0, void 0, function () {
        var productGid, createData, updateData, error_2;
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t;
        return __generator(this, function (_u) {
            switch (_u.label) {
                case 0:
                    console.log("[ProductMetadata] Upserting metadata for product GID: ".concat(shopifyProductData.id, " for shopId: ").concat(shopId));
                    productGid = shopifyProductData.id;
                    if (!productGid || !shopId) {
                        console.error('[ProductMetadata] Missing productGid or shopId for upsert.');
                        return [2 /*return*/];
                    }
                    createData = {
                        shopifyProductId: productGid,
                        shop: { connect: { id: shopId } },
                        title: shopifyProductData.title || 'N/A',
                        handle: shopifyProductData.handle,
                        productType: shopifyProductData.productType,
                        vendor: shopifyProductData.vendor,
                        tags: shopifyProductData.tags || [],
                        status: shopifyProductData.status,
                        minVariantPrice: ((_b = (_a = shopifyProductData.priceRangeV2) === null || _a === void 0 ? void 0 : _a.minVariantPrice) === null || _b === void 0 ? void 0 : _b.amount)
                            ? parseFloat(shopifyProductData.priceRangeV2.minVariantPrice.amount)
                            : undefined,
                        maxVariantPrice: ((_d = (_c = shopifyProductData.priceRangeV2) === null || _c === void 0 ? void 0 : _c.maxVariantPrice) === null || _d === void 0 ? void 0 : _d.amount)
                            ? parseFloat(shopifyProductData.priceRangeV2.maxVariantPrice.amount)
                            : undefined,
                        currencyCode: (_f = (_e = shopifyProductData.priceRangeV2) === null || _e === void 0 ? void 0 : _e.minVariantPrice) === null || _f === void 0 ? void 0 : _f.currencyCode, // Assuming currency is same for min/max
                        featuredImageUrl: (_g = shopifyProductData.featuredImage) === null || _g === void 0 ? void 0 : _g.url,
                        variantsData: ((_h = shopifyProductData.variants) === null || _h === void 0 ? void 0 : _h.edges.map(function (edge) { return edge.node; })) || client_1.Prisma.JsonNull,
                        collectionsData: ((_j = shopifyProductData.collections) === null || _j === void 0 ? void 0 : _j.edges.map(function (edge) { return edge.node; })) || client_1.Prisma.JsonNull,
                        shopifyCreatedAt: shopifyProductData.createdAt ? new Date(shopifyProductData.createdAt) : undefined,
                        shopifyUpdatedAt: shopifyProductData.updatedAt ? new Date(shopifyProductData.updatedAt) : undefined,
                        lastFetchedAt: new Date(),
                    };
                    updateData = {
                        title: shopifyProductData.title || 'N/A',
                        handle: shopifyProductData.handle,
                        productType: shopifyProductData.productType,
                        vendor: shopifyProductData.vendor,
                        tags: shopifyProductData.tags || [],
                        status: shopifyProductData.status,
                        minVariantPrice: ((_l = (_k = shopifyProductData.priceRangeV2) === null || _k === void 0 ? void 0 : _k.minVariantPrice) === null || _l === void 0 ? void 0 : _l.amount)
                            ? parseFloat(shopifyProductData.priceRangeV2.minVariantPrice.amount)
                            : undefined,
                        maxVariantPrice: ((_o = (_m = shopifyProductData.priceRangeV2) === null || _m === void 0 ? void 0 : _m.maxVariantPrice) === null || _o === void 0 ? void 0 : _o.amount)
                            ? parseFloat(shopifyProductData.priceRangeV2.maxVariantPrice.amount)
                            : undefined,
                        currencyCode: (_q = (_p = shopifyProductData.priceRangeV2) === null || _p === void 0 ? void 0 : _p.minVariantPrice) === null || _q === void 0 ? void 0 : _q.currencyCode,
                        featuredImageUrl: (_r = shopifyProductData.featuredImage) === null || _r === void 0 ? void 0 : _r.url,
                        variantsData: ((_s = shopifyProductData.variants) === null || _s === void 0 ? void 0 : _s.edges.map(function (edge) { return edge.node; })) || client_1.Prisma.JsonNull,
                        collectionsData: ((_t = shopifyProductData.collections) === null || _t === void 0 ? void 0 : _t.edges.map(function (edge) { return edge.node; })) || client_1.Prisma.JsonNull,
                        shopifyCreatedAt: shopifyProductData.createdAt ? new Date(shopifyProductData.createdAt) : undefined,
                        shopifyUpdatedAt: shopifyProductData.updatedAt ? new Date(shopifyProductData.updatedAt) : undefined,
                        lastFetchedAt: new Date(),
                    };
                    _u.label = 1;
                case 1:
                    _u.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, prisma.productMetadata.upsert({
                            where: { shopifyProductId: productGid }, // shopId is implicitly part of the data due to relation or can be added if unique constraint is (shopId, shopifyProductId)
                            // Given shopifyProductId is @unique, it's sufficient here unless you filter by shop first for some reason.
                            create: createData,
                            update: updateData,
                        })];
                case 2:
                    _u.sent();
                    console.log("[ProductMetadata] Successfully upserted metadata for product GID: ".concat(productGid));
                    return [3 /*break*/, 4];
                case 3:
                    error_2 = _u.sent();
                    console.error("[ProductMetadata] Error upserting metadata for product GID ".concat(productGid, ":"), error_2);
                    return [3 /*break*/, 4];
                case 4: return [2 /*return*/];
            }
        });
    });
}
/**
 * Main function to orchestrate the fetching and storing of product metadata.
 * To be called from a Remix action or a scheduled job.
 */
function syncAllProductMetadata(admin, shopId, shopDomain) {
    return __awaiter(this, void 0, void 0, function () {
        var productGidsToFetch, existingMetadata, gidsAlreadyFetchedRecently, finalGidsToProcess, _i, finalGidsToProcess_1, gid, productData;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    console.log("[ProductMetadata] Starting sync for shopId: ".concat(shopId, " (").concat(shopDomain, ")"));
                    return [4 /*yield*/, getDistinctProductGidsFromEvents(shopId)];
                case 1:
                    productGidsToFetch = _a.sent();
                    return [4 /*yield*/, prisma.productMetadata.findMany({
                            where: { shopId: shopId, shopifyProductId: { in: productGidsToFetch } },
                            select: { shopifyProductId: true, lastFetchedAt: true },
                        })];
                case 2:
                    existingMetadata = _a.sent();
                    gidsAlreadyFetchedRecently = new Set(existingMetadata
                        .filter(function (meta) { return meta.lastFetchedAt && (new Date().getTime() - meta.lastFetchedAt.getTime()) < (24 * 60 * 60 * 1000); }) // e.g., skip if fetched in last 24h
                        .map(function (meta) { return meta.shopifyProductId; }));
                    finalGidsToProcess = productGidsToFetch.filter(function (gid) { return !gidsAlreadyFetchedRecently.has(gid); });
                    console.log("[ProductMetadata] Found ".concat(productGidsToFetch.length, " distinct GIDs from events. After filtering recently fetched, ").concat(finalGidsToProcess.length, " GIDs to process."));
                    _i = 0, finalGidsToProcess_1 = finalGidsToProcess;
                    _a.label = 3;
                case 3:
                    if (!(_i < finalGidsToProcess_1.length)) return [3 /*break*/, 8];
                    gid = finalGidsToProcess_1[_i];
                    if (!gid.startsWith('gid://shopify/Product/')) {
                        console.warn("[ProductMetadata] Skipping invalid or non-product GID: ".concat(gid));
                        return [3 /*break*/, 7];
                    }
                    console.log("[ProductMetadata] Attempting to fetch product details for GID: ".concat(gid));
                    return [4 /*yield*/, fetchProductDetailsFromShopify(admin, gid)];
                case 4:
                    productData = _a.sent();
                    if (!productData) return [3 /*break*/, 6];
                    return [4 /*yield*/, upsertProductMetadata(shopId, productData)];
                case 5:
                    _a.sent();
                    return [3 /*break*/, 7];
                case 6:
                    console.warn("[ProductMetadata] No product data returned from Shopify for GID: ".concat(gid));
                    _a.label = 7;
                case 7:
                    _i++;
                    return [3 /*break*/, 3];
                case 8:
                    console.log("[ProductMetadata] Finished sync for shop: ".concat(shopDomain));
                    return [2 /*return*/];
            }
        });
    });
}
