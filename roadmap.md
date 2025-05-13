# Pixelnova/IntelliSuggest Combined Roadmap

## Vision
Build a Shopify app that delivers highly relevant, personalized product recommendations using real-time and historical user behavior, with a focus on merchant value, speed, and ease of integration.

---

## Phases

### Phase 1: Foundation & MVP
- **Event Ingestion:**
  - Set up Shopify Web Pixel Extension to capture key events (`product_viewed`, `product_added_to_cart`, `checkout_completed`, etc.).
  - Implement robust CORS and event endpoint.
  - Store raw events in the database.
- **Session Tracking:**
  - Track anonymous sessions via `clientId`.
  - Upsert shops and sessions.
- **Product Sync:**
  - Sync all products from Shopify using paginated GraphQL queries.
  - Store product metadata in a structured table.
- **Admin UI & Onboarding:**
  - Guide merchants to sync products on first install.
  - Show sync progress and status.

### Phase 2: Structured Data & User Journey
- **Structured Tables:**
  - Create tables for `ProductView`, `CartAction`, `Order`, and `OrderItem`.
  - Parse events to populate these tables, always using GID format for product IDs.
- **User Journey Stitching:**
  - Enhance session tracking with `checkoutToken` and `shopifyCustomerId`.
  - Link events to the richest available identifier.
- **Validation:**
  - Test with real events and ensure all tables are populated.
  - Backfill from raw events if needed.

### Phase 3: Hybrid Recommendation Engine
- **Real-Time Recommendations:**
  - Use Redis to cache recent session events for instant, path-based recommendations.
  - Score products by recency and event type (view, add to cart, etc.).
- **Aggregate Recommendations:**
  - Compute "Others Also Viewed", "Frequently Bought Together", and "Popular Products" from historical data.
  - Store aggregates in dedicated tables for fast lookup.
- **API & Theme App Extension:**
  - Expose recommendations via API.
  - Build a Theme App Extension for drag-and-drop placement in the Shopify theme editor.

### Phase 4: Merchant Experience & Analytics
- **Admin Dashboard:**
  - Show event counts, recommendations served, clicks, and attributed conversions.
  - Let merchants configure which recommendation types to show and where.
- **Analytics Tracking:**
  - Track impressions and clicks on recommendations.
  - Attribute sales uplift to recommendations.
- **Onboarding & Documentation:**
  - Provide clear guides and in-app onboarding.

### Phase 5: Advanced Features & Scaling
- **A/B Testing:**
  - Allow merchants to test different recommendation strategies.
- **Personalization:**
  - Build richer user profiles (preferences, history).
  - Explore collaborative/content-based filtering.
- **Performance & Scale:**
  - Use background jobs, queues, and delta sync for large stores.
  - Optimize for high event volume and many merchants.
- **Continuous Improvement:**
  - Refine algorithms based on analytics and merchant feedback.

---

## Cross-Cutting Concerns
- **Data Privacy & Compliance:** Always respect Shopify and legal privacy requirements.
- **Error Handling & Monitoring:** Robust logging and error tracking at every step.
- **Testing & Documentation:** Validate each phase and document data flows, schema, and APIs.

---

## What Makes This App Stand Out

- **True Real-Time Personalization:** Combines instant, session-based recommendations (via Redis) with aggregate, historical insights for maximum relevance—most apps do only one or the other.
- **Merchant-Centric Integration:** Drag-and-drop Theme App Extension and clear onboarding make it easy for merchants to get value fast, with no code changes required.
- **Hybrid Engine:** Seamlessly blends real-time and aggregate data for recommendations that adapt to both new and returning users.
- **Transparent Value:** Built-in analytics dashboard shows merchants exactly how recommendations impact sales, clicks, and engagement.
- **Scalable & Robust:** Designed for high event volume, large catalogs, and many stores, using background jobs, queues, and efficient data models.
- **Privacy-First:** Built on Shopify's Web Pixel and consent framework, ensuring compliance and customer trust.
- **Continuous Learning:** A/B testing and analytics-driven refinement ensure the app gets smarter and more effective over time.

By combining technical excellence, merchant usability, and a focus on measurable results, this app aims to be the most effective and merchant-friendly recommendation solution in the Shopify ecosystem.
