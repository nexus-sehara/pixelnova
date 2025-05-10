 RECOMMENDATION ENGINE SPEC 


Personalized Shopify Realtime Recommendation Engine


== Background

This system is a Shopify app that collects behavioral data via Shopify Web Pixels and generates real-time personalized product recommendations. It supports both authenticated and anonymous users, and is designed to be performant, extensible, and easy for merchants to manage via an embedded admin dashboard.

== Requirements

=== Must Have

- Real-time event ingestion via Shopify Pixel
- Event and session data storage (PostgreSQL and Redis)
- Sub-second per-user product recommendations via API
- Anonymous fallback (store-wide popular products)
- Configurable merchant admin dashboard
- Basic metrics: views, click-through rate, opt-in status

=== Should Have

- A/B testing of recommendation logic
- Per-shop configuration (excluded tags, fallback rules)
- Product catalog and metadata sync
- Event deduplication for spam resilience

=== Could Have

- Order-based collaborative filtering
- ML-powered product ranking
- Checkout stage tracking

=== Will Have (for MVP)

- Deep learning models
- Real-time analytics dashboards
- Custom storefront rendering widgets

== Method

=== Folder Structure

----
my-shopify-app/
├── .env
├── package.json
├── shopify.server.js
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── lib/
│   ├── prisma.js
│   ├── redis.js
│   └── shopify.js
├── app/
│   ├── routes/
│   │   ├── auth/
│   │   │   └── index.jsx
│   │   └── dashboard.jsx
│   ├── root.jsx
│   └── entry.server.jsx
├── api/
│   ├── recommendations.js
│   └── webhook.js
├── middleware/
│   └── verifyShopify.js
├── public/
│   └── widget.js
├── scripts/
│   └── syncProducts.js
└── extensions/
    └── web-pixel/
----

=== Data Storage Design

This section describes the storage architecture for supporting personalization and analytics.

==== Redis Key Design

- `store:{shopDomain}:top_products` — ZSET of productId:score
- `store:{shopDomain}:recent_views` — List of productIds
- `store:{shopDomain}:metrics` — Aggregated store metrics
- `store:{shopDomain}:config` — Serialized JSON config (exclusions, fallback)
- `store:{shopDomain}:recent_sessions` — List of sessionIds

- `session:{sessionId}:recent_views` — List of productIds
- `session:{sessionId}:cart_items` — Hash of productId:qty
- `session:{sessionId}:device` — Device type (e.g., mobile, desktop)
- `session:{sessionId}:activity_at` — Last activity timestamp
- `session:{sessionId}:referer` — Last recorded referer
- `session:{sessionId}:user_id` — Nullable, links to Shopify user if authenticated

==== Recommendation Logic

- Rules-based scoring (tags, collections, popularity)
- Device-specific recommendations (mobile/desktop)
- Price filtering & affinity detection
- Recency bias (prioritize new/updated products)
- Discount boost (highlight discounted, relevant items)
- Falls back to popular products lacking session data

==== User Tracking

===== Logged-In Users (Privacy Compliant)

- Use customerId for persistent profiling
- Track collection affinity, price range, device usage
- Assign behavioral personas (e.g., deal-seeker, premium-buyer)
- Purchase history for long-term scoring

===== Anonymous Users (Session-based)

- Use sessionId or browserId issued by Web Pixel
- Track device type, price range, collections viewed
- Store cart and view history within session
- Expire session data after inactivity
- Infer traffic source via referer

==== Privacy Considerations

- No persistent IDs for anonymous users
- All guest data expires after inactivity
- Aggregate metrics only for long-term analytics
- Logged-in profiles are opt-in (Shopify customerId)

== Implementation
