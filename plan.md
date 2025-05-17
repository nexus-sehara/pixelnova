# Project Plan: Behavior-Aware Shopify App

**Project Goal:** Build a behavior-aware application for Shopify that provides targeted product recommendations and enables user segmentation for marketing, based on collected behavioral data and synced Shopify customer data.

## Phase 1: Core Data Collection & Processing (Foundation - Current Focus)

This phase is critical for ensuring data accuracy. We will revisit and solidify existing parts.

**Step 1.1: Web Pixel Event Ingestion & Basic Storage**
*   **Goal:** Reliably receive and store raw pixel events from the Shopify Web Pixel into the `PixelEvent` table. Ensure `PixelSession` is correctly created/updated.
*   **Actions:**
    *   Verify `api.pixel-events.ts` handles all key Shopify standard events (`page_viewed`, `product_viewed`, `product_added_to_cart`, `product_removed_from_cart`, `search_submitted`, `checkout_started`, `payment_info_submitted`, `checkout_completed`).
    *   Confirm robust `PixelSession` creation and updating logic based on `clientId` (and `shopId`).
    *   Ensure comprehensive logging for incoming events and their initial processing status.
*   **Testing:**
    *   On a test store, systematically trigger each standard event type.
    *   Verify each raw event is accurately stored in the `PixelEvent` table.
    *   Verify the `PixelSession` table is populated with correct `shopId`, `clientId`, `sessionToken` (event ID), and timestamps. Test across multiple sessions and with the same `clientId` returning.
    *   Meticulously review server logs for any errors during event reception or `PixelSession` handling.

**Step 1.2: Structured Data Tables Population & Integrity**
*   **Goal:** Accurately populate structured tables (`ProductView`, `CartAction`, `Order`, `OrderItem`) from `PixelEvent` data, ensuring all intended fields are captured.
*   **Actions:**
    *   Review and refine data extraction logic in `api.pixel-events.ts` for each event type.
        *   `ProductView`: Ensure `productId`, `variantId` (if available), `viewedAt`, `clientId`, `shopId`, `pixelSessionId`, `eventId`, and `shopifyCustomerId` (if available in event) are captured.
        *   `CartAction`: Ensure `productId`, `variantId`, `actionType`, `quantity`, `timestamp`, `clientId`, `shopId`, `pixelSessionId`, `eventId`, and *later update* with `checkoutToken`, `shopifyCustomerId`.
        *   `Order` & `OrderItem`: Ensure `checkoutToken`, `shopifyOrderId` (on completion), `shopifyCustomerId`, `clientId`, `shopId`, `pixelSessionId`, `eventId`, `createdAt`, `updatedAt` are captured for `Order`. For `OrderItem`, ensure `productId`, `variantId`, `quantity`, `price` are captured and correctly linked to the `Order`.
    *   Ensure Shopify GIDs are handled correctly for all relevant IDs.
    *   Verify all relationships (foreign keys) between tables are correctly established and populated.
*   **Testing:**
    *   Trigger event sequences (e.g., view product -> add to cart -> start checkout -> complete checkout).
    *   Verify data in `ProductView`, `CartAction`, `Order`, `OrderItem` is complete and accurate for each step.
    *   **Crucial Test:** Confirm `Order` and `OrderItem` tables are correctly populated upon `checkout_completed` (and `checkout_started` for initial upsert).
    *   Verify `CartAction` records are correctly backfilled with `checkoutToken` and `shopifyCustomerId` after `checkout_completed`.
    *   Test edge cases: products with/without variants, user logged in vs. anonymous during different stages.

**Step 1.3: Product Metadata Sync**
*   **Goal:** Ensure the local `ProductMetadata` table is a reliable and up-to-date reflection of the Shopify store's products.
*   **Actions:**
    *   Review the existing `syncAllProductMetadata` function and its trigger mechanism (likely an admin action).
    *   Ensure it handles pagination for stores with many products.
    *   Ensure it correctly extracts and stores all necessary fields (Shopify Product GID, title, handle, type, vendor, tags, status, variant info, image URLs, prices).
*   **Testing:**
    *   Manually trigger product sync on a test store with a diverse set of products.
    *   Verify `ProductMetadata` table is accurately populated.
    *   Test with products having multiple variants, different statuses, special characters in names, etc.
    *   Verify updates to existing products in Shopify are reflected after a re-sync.

## Phase 2: User Profile Implementation

**Step 2.1: `UserProfile` Model & `PixelSession` Linkage**
*   **Goal:** Define the `UserProfile` Prisma model and establish its relationship with `PixelSession`.
*   **Actions:**
    *   Define `UserProfile` schema in `prisma/schema.prisma` (fields for Shopify customer data, aggregated behavioral stats, affinity lists, derived traits, timestamps).
    *   Add `userProfileId` (String, nullable) and `userProfile` (relation, optional) to the `PixelSession` model.
    *   Run `npx prisma migrate dev --name add_user_profile_and_link_pixel_session`.
*   **Testing:**
    *   Verify database schema changes are applied successfully.

**Step 2.2: `UserProfile` Creation & Linking Logic**
*   **Goal:** Create/update `UserProfile` records and link them to `PixelSession` during event processing.
*   **Actions:**
    *   Modify `api.pixel-events.ts`:
        *   When a new `PixelSession` is created (first time a `clientId` is seen for a shop):
            *   Create a corresponding `UserProfile` (e.g., with `shopId`, `firstSeenAt` from the session, `lastSeenAt`).
            *   Set `PixelSession.userProfileId` to the new `UserProfile.id`.
        *   When an event provides `body.customer.id` (Shopify Customer ID) or `body.data.checkout.email`:
            *   Attempt to find an existing `UserProfile` by `shopifyCustomerId` (if available) or `email` for that shop.
            *   If found: Link current `PixelSession.userProfileId` to this `UserProfile`. Update `UserProfile.lastSeenAt`. If Shopify customer data from the event is newer/more complete than what's in the profile, update the `UserProfile`.
            *   If not found: Create a new `UserProfile`. Populate it with available Shopify customer data from the event and `shopId`. Link current `PixelSession.userProfileId`.
            *   Ensure `PixelSession.shopifyCustomerId` is also populated if the Shopify Customer ID becomes known.
*   **Testing:**
    *   Scenario 1 (Anonymous user): New `clientId` -> `PixelSession` created, new `UserProfile` created, `PixelSession.userProfileId` linked.
    *   Scenario 2 (Anonymous to Known): Anonymous user browses (creates `PixelSession` & linked `UserProfile`). Then logs in / checkouts. Event contains `customer.id`.
        *   Test: `PixelSession` gets its `shopifyCustomerId` field updated. The `UserProfile` linked to this `PixelSession` gets its `shopifyCustomerId`, `email`, etc., populated/updated. `lastSeenAt` updated.
    *   Scenario 3 (Known user returns): User previously logged in/checked out (has `UserProfile` with `shopifyCustomerId`). Starts a new session (new `PixelSession`, new `clientId`). Then logs in.
        *   Test: New `PixelSession` eventually gets linked to the *existing* `UserProfile` via `shopifyCustomerId`.
    *   Verify data flow and updates in both `PixelSession` and `UserProfile` tables.

**Step 2.3: Basic Behavioral Aggregation on `UserProfile` (Iteration 1)**
*   **Goal:** Update simple rolling aggregates on `UserProfile` directly during event processing.
*   **Actions:**
    *   In `api.pixel-events.ts`, after a `UserProfile` is identified/created for the current session:
        *   On `ProductView`: Increment `UserProfile.totalAppProductViews`. Add `productId` to `UserProfile.recentlyViewedProductIds` (e.g., as a list, perhaps capped at the last 10-20 unique IDs).
        *   On `CartAction` (add): Increment `UserProfile.totalAppAddsToCart`. Add `productId` to `UserProfile.recentlyAddedToCartProductIds`.
        *   Update `UserProfile.lastSeenAt` on every event linked to the profile.
*   **Testing:**
    *   Perform a series of views and cart adds.
    *   Check the relevant `UserProfile` record.
    *   Verify `totalAppProductViews`, `totalAppAddsToCart`, `lastSeenAt` are updated correctly.
    *   Verify `recentlyViewedProductIds` and `recentlyAddedToCartProductIds` lists are populated as expected.

## Phase 3: Historical Shopify Customer Data Sync

**Step 3.1: Admin UI & Backend for Sync Trigger**
*   **Goal:** Allow merchants to initiate a sync of their existing Shopify customer data.
*   **Actions:**
    *   Create an admin page in the Remix app (e.g., `/app/admin/data-sync`).
    *   Add a "Sync Shopify Customers" button.
    *   Create a Remix action that, on submit:
        *   Authenticates as admin.
        *   Uses `admin.graphql` to fetch customers from Shopify (potentially with date filters like "updated in last 60 days" to manage scope, or all customers). Handle pagination.
        *   For each Shopify customer, upsert a record into `UserProfile` using `shopifyCustomerId` as the key. Populate fields like `email`, `firstName`, `lastName`, `shopifyCustomerTags`, `totalShopifyOrders` (from `customer.ordersCount`), `totalShopifySpend` (from `customer.totalSpent`), `shopifyAccountCreatedAt`.
*   **Testing:**
    *   Ensure admin UI is accessible and the button works.
    *   Trigger the sync.
    *   Monitor server logs for progress and any errors (especially rate limiting).
    *   Verify `UserProfile` table:
        *   New profiles are created for Shopify customers not yet seen by the pixel.
        *   Existing profiles (matched by `shopifyCustomerId`) are updated with Shopify data.
    *   Test idempotency: running the sync multiple times should not create duplicate profiles.

## Phase 4: Recommendation Engine (Simplified Placements)

**Step 4.1: Define Recommendation Logic & API Endpoints**
*   **Goal:** Design logic for recommendations on Cart, Post-Checkout, and Exit-Intent pages, and create APIs to serve them.
*   **Actions:**
    *   **Logic Definition:**
        *   Cart Page: "Frequently bought with items in cart" (use `FrequentlyBoughtTogether` with product IDs from cart), "Products you recently viewed" (use `UserProfile.recentlyViewedProductIds`).
        *   Post-Checkout: "You might also like" (use `FrequentlyBoughtTogether` based on purchased items), "Re-order favorites" (if applicable).
        *   Exit-Intent: "Still thinking about these?" (use `UserProfile.recentlyViewedProductIds` or `recentlyAddedToCartProductIds`).
    *   **API Endpoints (Remix routes):**
        *   `GET /api/recommendations/cart?shop=...&clientId=...&cartProductIds=gid://shopify/Product/123,gid://shopify/Product/456`
        *   `GET /api/recommendations/post-checkout?shop=...&clientId=...&orderId=...` (or `&lastPurchasedProductIds=...`)
        *   `GET /api/recommendations/exit-intent?shop=...&clientId=...`
    *   These APIs will query `UserProfile`, `ProductMetadata`, `FrequentlyBoughtTogether`, `ProductCooccurrence` tables.
*   **Testing:**
    *   Manually call API endpoints with various parameters (different client IDs, product IDs).
    *   Verify the JSON response contains the expected product recommendations.
    *   Test cases where user profile has data vs. minimal data.

**Step 4.2: Frontend Display (Theme App Extension)**
*   **Goal:** Display recommendations on the storefront.
*   **Actions:**
    *   Develop a Shopify Theme App Extension.
    *   Use JavaScript within the extension to:
        *   Fetch `clientId` (from Shopify Web Pixel API if available, or generate/retrieve from cookie/localStorage).
        *   Collect necessary context (cart items, current page).
        *   Call your app's recommendation API endpoints.
        *   Render the product recommendations using Polaris components or custom HTML.
*   **Testing:**
    *   Install the theme app extension on a test store.
    *   Navigate to cart page, complete a checkout, simulate exit intent.
    *   Verify recommendations appear correctly and are relevant based on the logic.
    *   Test responsiveness and loading states.

## Phase 5: Marketing Segmentation Feature

**Step 5.1: Admin UI for Segment Builder & Export**
*   **Goal:** Allow merchants to define customer segments based on `UserProfile` data and export them.
*   **Actions:**
    *   Create an admin page (e.g., `/app/admin/segments`).
    *   Design a UI with filters for `UserProfile` fields (e.g., `topViewedCategories contains 'X'`, `totalShopifySpend > Y`, `lastSeenAt within Z days`).
    *   Display a live count of users matching the current segment criteria.
    *   Provide an "Export CSV" button.
    *   Backend Remix action to:
        *   Take segment criteria.
        *   Query the `UserProfile` table.
        *   Generate and return a CSV file (e.g., with `email`, `firstName`, `lastName`).
*   **Testing:**
    *   Create various segments using the UI. Verify counts are accurate.
    *   Export CSVs for different segments and check data integrity.
    *   Test with a large number of profiles to check query performance.

## General Considerations Throughout:

*   **Iterative Testing:** Test each sub-step thoroughly before moving on.
*   **Logging:** Implement comprehensive logging for debugging and monitoring.
*   **Error Handling:** Graceful error handling in API routes and backend processes.
*   **Security:** Sanitize inputs, protect PII, secure API endpoints.
*   **Performance:** Optimize database queries, especially for aggregations and recommendation generation. Consider indexing.
*   **Shopify API Rate Limits:** Manage API calls to Shopify to avoid being rate-limited, especially during historical syncs.
*   **Code Quality:** Follow best practices, use linting and formatting.

This plan provides a roadmap. We will adjust and refine it as we progress. 