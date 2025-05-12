#!/usr/bin/env ts-node
"use strict";
// scripts/sync-products.ts
// Usage: npx ts-node scripts/sync-products.ts [--shop=domain] [--delay=ms] [--shop-delay=ms] [--max-products=n] [--run]
// Reads settings from .env: SYNC_PRODUCT_DELAY_MS, SYNC_SHOP_DELAY_MS, SYNC_MAX_PRODUCTS_PER_SHOP
// Defaults: 200ms product delay, 1000ms shop delay, 1000 max products per shop
// By default, dry run (no DB writes). Use --run to actually upsert.
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
require("dotenv/config");
var db_server_js_1 = require("../app/db.server.js");
var product_metadata_server_js_1 = require("../app/lib/product-metadata.server.js");
var shopify_server_js_1 = require("../app/shopify.server.js");
// --- Helper: sleep ---
function sleep(ms) {
    return new Promise(function (resolve) { return setTimeout(resolve, ms); });
}
// --- Helper: parse CLI args ---
function parseArgs() {
    var args = process.argv.slice(2);
    var out = {};
    for (var _i = 0, args_1 = args; _i < args_1.length; _i++) {
        var arg = args_1[_i];
        if (arg.startsWith('--')) {
            var _a = arg.replace(/^--/, '').split('='), k = _a[0], v = _a[1];
            out[k] = v === undefined ? true : v;
        }
    }
    return out;
}
var args = parseArgs();
var TARGET_SHOP = typeof args.shop === 'string' ? args.shop : undefined;
var PRODUCT_DELAY = Number(args.delay) || Number(process.env.SYNC_PRODUCT_DELAY_MS) || 200;
var SHOP_DELAY = Number(args['shop-delay']) || Number(process.env.SYNC_SHOP_DELAY_MS) || 1000;
var MAX_PRODUCTS = Number(args['max-products']) || Number(process.env.SYNC_MAX_PRODUCTS_PER_SHOP) || 1000;
var DRY_RUN = !args.run;
console.log('[Sync Script] Settings:', { PRODUCT_DELAY: PRODUCT_DELAY, SHOP_DELAY: SHOP_DELAY, MAX_PRODUCTS: MAX_PRODUCTS, DRY_RUN: DRY_RUN, TARGET_SHOP: TARGET_SHOP });
// --- Patch fetchProductDetailsFromShopify to add delay ---
var origFetchProductDetails = product_metadata_server_js_1.fetchProductDetailsFromShopify;
function fetchProductDetailsWithDelay(admin, productId) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, sleep(PRODUCT_DELAY)];
                case 1:
                    _a.sent();
                    return [2 /*return*/, origFetchProductDetails(admin, productId)];
            }
        });
    });
}
// Patch syncAllProductMetadata to use our delayed fetch
function patchSyncAllProductMetadata() {
    // Monkey-patch fetchProductDetailsFromShopify in the module
    require('../app/lib/product-metadata.server').fetchProductDetailsFromShopify = fetchProductDetailsWithDelay;
}
patchSyncAllProductMetadata();
function getAdminClientForShop(shopDomain) {
    return __awaiter(this, void 0, void 0, function () {
        var session, GraphqlClient;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, db_server_js_1.default.session.findFirst({
                        where: { shop: shopDomain, isOnline: false },
                        orderBy: { expires: 'desc' },
                    })];
                case 1:
                    session = _a.sent();
                    if (!session) {
                        console.error("[Sync Script] No offline session found for shop: ".concat(shopDomain));
                        return [2 /*return*/, null];
                    }
                    GraphqlClient = require('@shopify/shopify-api/dist/esm/lib/clients/admin/graphql/client.mjs').GraphqlClient;
                    return [2 /*return*/, new GraphqlClient({
                            session: {
                                id: 'offline_' + shopDomain,
                                shop: shopDomain,
                                state: '',
                                isOnline: false,
                                accessToken: session.accessToken,
                                scope: session.scope,
                                expires: session.expires,
                            },
                            apiVersion: shopify_server_js_1.apiVersion,
                        })];
            }
        });
    });
}
function main() {
    return __awaiter(this, void 0, void 0, function () {
        var shops, _i, shops_1, shop, admin, err_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (!TARGET_SHOP) return [3 /*break*/, 2];
                    return [4 /*yield*/, db_server_js_1.default.shop.findMany({ where: { domain: TARGET_SHOP }, select: { id: true, domain: true } })];
                case 1:
                    shops = _a.sent();
                    if (shops.length === 0) {
                        console.error("[Sync Script] No shop found with domain: ".concat(TARGET_SHOP));
                        process.exit(1);
                    }
                    return [3 /*break*/, 4];
                case 2: return [4 /*yield*/, db_server_js_1.default.shop.findMany({ select: { id: true, domain: true } })];
                case 3:
                    shops = _a.sent();
                    _a.label = 4;
                case 4:
                    _i = 0, shops_1 = shops;
                    _a.label = 5;
                case 5:
                    if (!(_i < shops_1.length)) return [3 /*break*/, 13];
                    shop = shops_1[_i];
                    console.log("\n[Sync Script] Processing shop: ".concat(shop.domain, " (ID: ").concat(shop.id, ")"));
                    return [4 /*yield*/, getAdminClientForShop(shop.domain)];
                case 6:
                    admin = _a.sent();
                    if (!admin) {
                        console.warn("[Sync Script] Skipping shop ".concat(shop.domain, " (no admin client)"));
                        return [3 /*break*/, 12];
                    }
                    _a.label = 7;
                case 7:
                    _a.trys.push([7, 9, , 10]);
                    if (DRY_RUN) {
                        console.log("[Sync Script] DRY RUN: Would sync product metadata for shop: ".concat(shop.domain));
                    }
                    else {
                        console.log("[Sync Script] Syncing product metadata for shop: ".concat(shop.domain));
                    }
                    return [4 /*yield*/, (0, product_metadata_server_js_1.syncAllProductMetadata)(admin, shop.id, shop.domain)];
                case 8:
                    _a.sent();
                    return [3 /*break*/, 10];
                case 9:
                    err_1 = _a.sent();
                    console.error("[Sync Script] Error syncing shop ".concat(shop.domain, ":"), err_1);
                    return [3 /*break*/, 10];
                case 10:
                    console.log("[Sync Script] Waiting ".concat(SHOP_DELAY, "ms before next shop..."));
                    return [4 /*yield*/, sleep(SHOP_DELAY)];
                case 11:
                    _a.sent();
                    _a.label = 12;
                case 12:
                    _i++;
                    return [3 /*break*/, 5];
                case 13:
                    console.log('[Sync Script] All done!');
                    return [2 /*return*/];
            }
        });
    });
}
main().catch(function (err) {
    console.error('[Sync Script] Fatal error:', err);
    process.exit(1);
});
