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
Verify new PixelSession records have clientId populated. (✅ Done)
Analyze event distribution by shopId and clientId to confirm improved anonymous session grouping. Check if clientId remains stable for a single user across multiple page views/events within the same browser session. (✅ Done)
Phase 2: Introduce Richer Identifiers & Basic User Journey Stitching
Objective: Enhance session/user identification by incorporating checkout_token and customerId when available. (✅ Done)
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
