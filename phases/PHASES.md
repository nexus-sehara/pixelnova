# Pixelnova Project Phased Plan & Status

## Guiding Principles
- **Iterative development:** Build in small, validated steps.
- **Data integrity:** Ensure correctness at every phase.
- **Data-driven decisions:** Use real data to inform schema and logic enhancements.

## Ultimate Goal
> Develop a fully functional, well-structured Shopify app capable of collecting customer behavior data and leveraging it for effective product recommendations and actionable analytics.

---

## Phased Plan Overview

### Phase 1: Raw Event Ingestion & Anonymous Session Tracking (Current)
- **Goal:** Reliably capture all web pixel events and implement robust anonymous session tracking.
- **Status:**
  - Event endpoint, CORS, event storage, shop model, PixelEvent model: **✅ Done**
  - PixelSession model: **✅ Done** (now includes `clientId`)
  - **Next:** Deploy, verify `clientId` population, analyze session grouping.
- **Note:**
  - The `Session` table in Prisma is for Shopify OAuth (app installation, access tokens, etc.) and is not used for customer behavior tracking.
  - The `PixelSession` model is your own, used to group pixel events by anonymous browser session (clientId). ClientId is stable until the user clears browser storage.

### Phase 2: Richer Identifiers & User Journey Stitching
- **Goal:** Enhance session/user identification with `checkoutToken` and `customerId`.
- **Tasks:**
  - Analyze eventData for key events (checkout, login).
  - Decide between extending PixelSession or introducing a UserJourney model.
  - Update event processing to use the richest available identifier.
  - **Next:** Schema changes, migration, deploy, simulate user flows, validate data stitching.

### Phase 3: Structured Product & Behavior Data
- **Goal:** Transform raw event data into structured tables for products and user behaviors.
- **Tasks:**
  - Design and populate `ProductMetadata` table.
  - Extract product/variant IDs from events, fetch details from Shopify API, upsert into DB.
  - Create structured tables: `ProductView`, `CartAction`, `Order`, `OrderItem`.
  - (Optional) Backfill data from existing events.
  - **Next:** Test queries for recommendation scenarios.
- **Statistics & Analytics:**
  - With structured tables, you can now generate actionable analytics for merchants, such as:
    - Product view counts, add-to-cart rates, and purchase rates.
    - Funnel analysis: view → cart → checkout → purchase.
    - Unique visitors (by clientId, checkoutToken, or customerId).
    - Repeat vs. new visitors.
    - Top viewed, top converting, and most abandoned products.
    - Cohort analysis (e.g., by acquisition channel, device, etc. if available).
  - These stats will power dashboards, reports, and recommendation logic.

### Phase 4: Recommendation Algorithm Development & User Profile Building
- **Goal:** Implement initial recommendation algorithms and build user profiles.
- **Tasks:**
  - Start with simple algorithms: "Frequently Viewed Together", "Frequently Bought Together", "Popular Products".
  - Build a basic `UserProfile` table.
  - Store pre-calculated recommendations.
  - Expose recommendations via API.
  - **Next:** Validate outputs, test API, measure basic metrics.
- **Statistics & Analytics:**
  - Enable product-level and user-level analytics:
    - Which products are most often viewed or bought together?
    - What are the most common user journeys?
    - How effective are recommendations (click-through, conversion)?

### Phase 5: Advanced Recommendations, Personalization & A/B Testing
- **Goal:** Improve recommendation quality and personalization, introduce A/B testing.
- **Tasks:**
  - Explore advanced algorithms (collaborative filtering, etc.).
  - Refine user profiles.
  - Implement A/B testing for strategies.
  - Optimize for performance and scale.
- **Statistics & Analytics:**
  - Advanced analytics for personalization and experimentation:
    - A/B test results for different recommendation strategies.
    - Personalized product stats (per user segment).
    - Long-term retention and engagement metrics.

---

## Cross-Cutting Concerns (All Phases)
- **Data privacy & compliance:** Shopify policies, GDPR, CCPA, etc.
- **Error handling & monitoring:** Robust logging and error management.
- **Scalability:** Efficient queries and processing.
- **Code quality & testing:** Maintain high standards.
- **Documentation:** Keep schema, data flows, and APIs well documented.

---

## What's Done vs. What's Next

**Done:**
- Core event ingestion, CORS, shop and event models, session tracking with `clientId`.

**In Progress:**
- Deploy and validate improved session tracking.

**Next:**
- Richer identifiers and journey stitching.
- Structured product/behavior tables.
- Recommendation logic and user profiles.
- Advanced personalization and A/B testing.
- **Build analytics/statistics dashboards and API endpoints.**

---

## Potential Issues & Risks
- **ESM/CJS/TypeScript compatibility:** Avoid direct script execution; use API endpoints for background jobs.
- **Data privacy:** Ensure compliance with Shopify, GDPR, CCPA.
- **Session stitching:** Complexity increases as you add more identifiers (clientId, checkoutToken, customerId).
- **Backfilling data:** Can be resource-intensive; plan for batch processing.
- **API endpoint security:** SYNC_SECRET is good, but consider IP whitelisting or OAuth for even stronger protection.
- **Schema evolution:** As you add more structured tables, keep migrations and data backfills well-documented and tested.

---

## Improvements & Suggestions
- **Formalize the roadmap:** Keep this file up to date for team visibility.
- **Automated tests:** Add unit/integration tests for event processing and sync logic.
- **Monitoring/logging:** Add logging for API endpoints and background jobs.
- **Admin UI:** Expand to show sync status, logs, product metadata, and analytics/statistics.
- **Documentation:** Keep schema and data flow docs up to date as you iterate.
- **Scheduling:** Set up Render Scheduler or GitHub Actions to hit your sync endpoint regularly.
- **Data validation:** Add checks to ensure event data is well-formed before processing.
- **Analytics:** Design and implement queries and dashboards for merchants to see actionable insights.

---

## Next Steps
1. **Finish and validate Phase 1:** Deploy, check `clientId` in sessions, analyze grouping.
2. **Move to Phase 2:** Add richer identifiers, update event processing, test with real flows.
3. **Document everything:** Keep the roadmap and schema docs current.
4. **Plan for structured tables and recommendations:** Design schemas, plan migrations, and backfill strategies.
5. **Start designing analytics/statistics dashboards and queries.** 