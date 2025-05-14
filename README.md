What’s implemented so far (by code and by plan)
What’s left to do (by phase and by code)
Potential issues or risks
Suggestions for improvements and next steps
1. Project Structure Overview
Top-level (pixelnova/)
README.md, roadmap.md, roadmap-proposal*.md: Documentation and planning.
app/: Main Remix app code (routes, lib, db, components).
prisma/: Database schema and migrations.
phases/: (Likely) phase-specific documentation or plans.
scripts/: Utility scripts (currently empty after cleanup).
lib/, extensions/, public/, etc.: Standard for Shopify/Remix apps.
app/ Directory
routes/: All Remix routes (API endpoints, admin UI, etc.).
lib/: Server-side logic (product metadata, event processing, etc.).
db.server.ts: Prisma client and DB connection.
shopify.server.js: Shopify app config and helpers.
components/: React components for UI.
2. What’s Implemented (Code & Plan)
Event Ingestion & Session Tracking
app/routes/api.pixel-events.ts: Receives and stores pixel events from Shopify.
Handles CORS, stores raw event data, associates with shop and session.
PixelSession model: Now includes clientId (for anonymous session tracking).
Shop & Event Models
Shop model: Stores shop domain, associates with events/sessions.
PixelEvent model: Stores raw event data, event type, timestamp, shopId, etc.
PixelSession model: Tracks sessionToken, clientId, and (in progress) richer identifiers.
Product Metadata Sync
app/lib/product-metadata.server.ts: Logic for extracting product GIDs, fetching product details from Shopify, and upserting into ProductMetadata.
Manual sync: Admin UI button triggers sync for a shop.
API sync: Secure endpoint (api.admin.sync-products.ts) for scheduled/manual sync.
Admin UI
UI for triggering product metadata sync.
(Planned) UI for viewing product metadata, event logs, and sync status.
Security
CORS restrictions for event ingestion.
API sync endpoint protected by SYNC_SECRET.
Per-shop data isolation.
Documentation
Roadmap and phase files exist.
README includes setup, sync instructions, and security notes.
3. What’s Left To Do (By Phase & Code)
Phase 1: Finalize Session Tracking
Deploy and validate: Ensure clientId is correctly populated in PixelSession.
Analyze: Check if session grouping is improved.
Phase 2: Richer Identifiers & User Journey
Enhance session/user identification: Add checkoutToken, shopifyCustomerId to PixelSession or introduce UserJourney model.
Update event processing: Extract and use the richest identifier.
Schema changes: Update prisma/schema.prisma, run migrations.
Test: Simulate user flows, validate data stitching.
Phase 3: Structured Product & Behavior Data
Implement structured tables: ProductView, CartAction, Order, OrderItem.
Backfill data: Optionally process existing events to populate new tables.
Test queries: For recommendation scenarios.
Phase 4: Recommendations & User Profiles
Implement algorithms: Start with simple co-occurrence and popularity-based recommendations.
Build user profiles: Aggregate product views and purchases.
Expose recommendations via API.
Phase 5: Advanced Features
Personalization, A/B testing, advanced algorithms.
Performance optimization, scaling, monitoring.
4. Potential Issues & Risks
ESM/CJS/TypeScript compatibility: Avoid direct script execution; use API endpoints for background jobs.
Data privacy: Ensure compliance with Shopify, GDPR, CCPA.
Session stitching: Complexity increases as you add more identifiers (clientId, checkoutToken, customerId).
Backfilling data: Can be resource-intensive; plan for batch processing.
API endpoint security: SYNC_SECRET is good, but consider IP whitelisting or OAuth for even stronger protection.
Schema evolution: As you add more structured tables, keep migrations and data backfills well-documented and tested.
5. Improvements & Suggestions
Formalize the roadmap: Move the phased plan into roadmap.md or a new phases/ markdown file for team visibility.
Automated tests: Add unit/integration tests for event processing and sync logic.
Monitoring/logging: Add logging for API endpoints and background jobs.
Admin UI: Expand to show sync status, logs, and product metadata.
Documentation: Keep schema and data flow docs up to date as you iterate.
Scheduling: Set up Render Scheduler or GitHub Actions to hit your sync endpoint regularly.
Data validation: Add checks to ensure event data is well-formed before processing.


# Shopify App Template - Remix


## Product Metadata Sync Script

This project includes a script to safely sync product metadata for all (or specific) shops, with rate limit protection and flexible configuration.

### 1. Example `.env` Settings

Add these lines to your `.env` file in the project root (create the file if it doesn't exist):

```env
# Delay (in ms) between each product fetch for a shop (rate limit safety)
SYNC_PRODUCT_DELAY_MS=200

# Delay (in ms) between processing each shop
SYNC_SHOP_DELAY_MS=1000

# Max number of products to sync per shop (for safety, not enforced in current script but ready for future use)
SYNC_MAX_PRODUCTS_PER_SHOP=1000
```

You can adjust these values as needed for your environment and rate limit comfort.

---

### 2. How to Run the Script

From your project root, run:

- **Dry run (default, no DB writes):**
  ```bash
  npx ts-node scripts/sync-products.ts
  ```

- **Actually upsert product metadata (be careful!):**
  ```bash
  npx ts-node scripts/sync-products.ts --run
  ```

- **Sync a specific shop only:**
  ```bash
  npx ts-node scripts/sync-products.ts --shop=yourshop.myshopify.com --run
  ```

- **Override delays on the command line:**
  ```bash
  npx ts-node scripts/sync-products.ts --run --delay=300 --shop-delay=2000
  ```

---

### 3. What to Expect

- The script will log the settings it's using.
- It will process each shop (or just the one you specify), waiting between shops.
- For each product, it will wait the configured delay.
- In dry run mode, it will only log what it would do.
- In `--run` mode, it will actually upsert product metadata.

---

## Product Metadata Sync API Endpoint

This app provides a secure API endpoint to trigger product metadata sync for all (or specific) shops.

### 1. Set up your secret

Add this to your `.env` file (in the project root):

```
SYNC_SECRET=your-very-strong-secret
```

- **What is SYNC_SECRET?**
  - It is a long, random string used to protect your sync endpoint from unauthorized access.
  - Generate one with a password manager or with:
    ```bash
    openssl rand -hex 32
    ```
  - Example: `SYNC_SECRET=2f8b1c4e5d6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c`

### 2. How to trigger the sync

- **Locally (if running on port 3000):**
  ```bash
  curl -X POST "http://localhost:3000/api/admin/sync-products?token=your-very-strong-secret"
  ```
- **On production:**
  ```bash
  curl -X POST "https://your-app-url/api/admin/sync-products?token=your-very-strong-secret"
  ```
- **Sync a specific shop:**
  ```bash
  curl -X POST "http://localhost:3000/api/admin/sync-products?token=your-very-strong-secret&shop=yourshop.myshopify.com"
  ```

### 3. Security notes
- **Keep your SYNC_SECRET safe and never share it publicly.**
- Always use HTTPS in production.
- For extra security, restrict access by IP (e.g., only allow your scheduler or CI/CD IPs).
- Rotate your secret periodically.

### 4. Scheduling the sync
- Use a service like Render Scheduler, GitHub Actions, or a cron job to hit the endpoint on a schedule.
- Example GitHub Actions step:
  ```yaml
  - name: Trigger product sync
    run: |
      curl -X POST "https://your-app-url/api/admin/sync-products?token=${{ secrets.SYNC_SECRET }}"
  ```

---

curl -X POST "http://localhost:3000/api/admin/sync-products?token=2f8b1c4e5d6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c"




Our guiding principles will be iterative development, ensuring data integrity at each step, and making data-driven decisions for schema and logic enhancements.
Goal: Develop a fully functional, well-structured Shopify app capable of collecting customer behavior data and leveraging it for effective product recommendations.
Phase 1: Solidify Raw Event Ingestion & Anonymous Session Tracking (Current - Near Completion)
Objective: Reliably capture all raw web pixel events and implement the best possible anonymous session tracking with currently available data.
Tasks & Current Status:
Web Pixel Event Endpoint (app/routes/api.pixel-events.ts):
Receives events from Shopify's web pixel. (✅ Done)
Handles CORS correctly for OPTIONS and POST. (✅ Done, browser console quirk noted but core functionality working)
Stores raw event payload (eventData) in PixelEvent table. (✅ Done)
Basic Shop Model:
Stores shop domain and associates with events/sessions. (✅ Done)
PixelEvent Model:
Stores raw eventData, eventType, timestamp, shopId, etc. (✅ Done)
PixelSession Model:
Currently uses sessionToken (derived from body.id) which creates many distinct sessions.
Action Item (In Progress): Enhance PixelSession to store clientId from the event body.
Schema updated. (✅ Done)
Migration created (add_clientid_to_pixelsession). (✅ Done)
Application code in api.pixel-events.ts updated to populate PixelSession.clientId. (✅ Done)
Testing & Validation (Next Step after deployment):
Deploy the latest changes (including PixelSession.clientId population).
Verify new PixelSession records have clientId populated.
Analyze event distribution by shopId and clientId to confirm improved anonymous session grouping. Check if clientId remains stable for a single user across multiple page views/events within the same browser session.
Phase 2: Introduce Richer Identifiers & Basic User Journey Stitching
Objective: Enhance session/user identification by incorporating checkout_token and customerId when available.
Rationale: clientId is good for anonymous browsing, but checkout_token links a whole purchase funnel, and customerId links events to a known user account.
Tasks:
Analyze eventData for Key Events:
Collect and analyze eventData samples for checkout_started, checkout_completed, and any events fired when a user is logged in (e.g., page_viewed by a logged-in user).
Identify where checkout_token (or similar like cart_token) and customer.id are located within the JSON structure of these events.
Enhance PixelSession (or introduce UserJourney):
Option A (Simpler): Add optional checkoutToken (String) and shopifyCustomerId (String) fields to the PixelSession model.
Option B (More Robust): Introduce a new UserJourney model that can be linked to PixelSession records. This UserJourney would store clientId, checkoutToken, shopifyCustomerId, shopId, firstSeen, lastActive.
Decision Point: We'll decide between Option A or B based on the complexity and the need for a separate journey abstraction. Initially, Option A might be sufficient.
Update Event Processing Logic (api.pixel-events.ts):
Extract checkout_token and customer.id from eventData if present.
When creating/upserting PixelSession (or UserJourney):
If customer.id is present, use that as the primary key for linking activity.
Else if checkout_token is present, use that.
Else, fall back to clientId.
Update existing PixelSession/UserJourney records if a less specific identifier (like clientId) can now be enriched with a checkout_token or customerId.
Schema Changes & Migrations:
Update schema.prisma based on the chosen option.
Run npx prisma migrate dev.
Testing & Validation:
Deploy changes.
Simulate user flows: anonymous browsing, adding to cart, starting checkout (as guest), logging in, completing checkout.
Verify that PixelSession (or UserJourney) records are correctly populated and linked using the richest available identifier.
Analyze data to see how many previously separate clientId sessions can now be stitched into single checkoutToken or shopifyCustomerId journeys.
Phase 3: Structured Product & Behavior Data
Objective: Transform raw event data into structured tables for products and key user behaviors, facilitating easier and more performant querying for recommendations.
Rationale: Querying JSON blobs is inefficient for complex aggregations. Structured tables are better for most recommendation algorithms.
Tasks:
ProductMetadata Table:
Design and implement a ProductMetadata table (similar to your initial plan: productId, shopDomain, title, tags, type, vendor, collections, price).
Population Strategy:
Write a script/background job that:
Extracts distinct product.id and variant.id values from product_viewed, collection_viewed, product_added_to_cart, checkout_completed events in PixelEvent.eventData.
Uses the Shopify Admin API (via shopify.server.js) to fetch detailed product information for these IDs. This ensures data accuracy and completeness.
Upserts this information into ProductMetadata.
Structured Behavior Tables (Iterative Implementation):
ProductView Table:
Fields: productId, variantId, viewedAt, shopId, link to PixelSession.id (or UserJourney.id), potentially referringProduct/Collection if easily derivable.
Populate from product_viewed events in PixelEvent.eventData.
CartAction Table:
Fields: productId, variantId, quantity, actionType (added, removed, updated), timestamp, shopId, link to session/journey.
Populate from product_added_to_cart, product_removed_from_cart events.
Order & OrderItem Tables:
Populate from checkout_completed events.
Schema Changes & Migrations.
Data Backfill (Optional but Recommended):
Consider writing a one-time script to process existing PixelEvent data to populate these new structured tables.
Testing & Validation:
Verify data is correctly transformed and loaded into the new tables.
Test queries against these tables for common recommendation scenarios (e.g., "products viewed by users who viewed product X").
Phase 4: Recommendation Algorithm Development & User Profile Building
Objective: Implement initial recommendation algorithms and start building user profiles.
Tasks:
Algorithm Selection & Implementation (Start Simple):
"Frequently Viewed Together": Based on co-occurrence of products in ProductView records sharing the same session/journey ID.
"Frequently Bought Together": Based on co-occurrence of products in OrderItem records.
"Popular Products": Based on view counts (ProductView) or purchase counts (OrderItem).
UserProfile Table (Simplified Initial Version):
Fields: userId (could be shopifyCustomerId or a generated ID linked to clientId/checkoutToken), shopId, viewedProductIds (array), purchasedProductIds (array), lastActive.
Populate by aggregating data from ProductView and Order tables.
ProductRecommendation Table:
Store pre-calculated recommendations (source product, recommended product, score, type).
Develop jobs to calculate and update these recommendations periodically.
API Endpoint for Recommendations:
Create a Remix action/loader to serve recommendations based on a given product or user.
Testing & Validation:
Verify recommendation outputs make sense.
Test API endpoint.
Start measuring basic metrics (e.g., click-through rate if recommendations are displayed).
Phase 5: Advanced Recommendations, Personalization & A/B Testing
Objective: Enhance recommendation quality with more advanced algorithms, deeper personalization, and an A/B testing framework.
Tasks:
Explore collaborative filtering, content-based filtering, or hybrid models.
Refine UserProfile with more features (preferred categories, brands, price sensitivity).
Implement A/B testing for different recommendation strategies.
Performance optimization and scaling.
Cross-Cutting Concerns (Throughout All Phases):
Data Privacy & Compliance: Ensure all data handling adheres to Shopify policies and relevant privacy regulations (GDPR, CCPA, etc.). Anonymize/pseudonymize data where appropriate.
Error Handling & Monitoring: Implement robust error handling and logging for event ingestion and all data processing jobs.
Scalability: Design database queries and data processing with scalability in mind.
Code Quality & Testing: Maintain high code quality with appropriate unit and integration tests.
Documentation: Document schema decisions, data flows, and API endpoints.