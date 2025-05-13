# App Name:Changes from novapixel in to IntelliSuggest (or similar) - Personalized Product Recommendations

## Vision

To provide Shopify merchants with an effective, easy-to-use app that leverages real-time user behavior captured via Web Pixels to deliver highly relevant, personalized product recommendations, ultimately increasing conversion rates and average order value.

## Core Principles

*   **Data-Driven:** Recommendations are based on actual user interactions.
*   **Speed:** Near-instant recommendations based on the user's current session path.
*   **Hybrid Approach:** Combine real-time session data with aggregate historical data.
*   **Effectiveness:** Utilize intelligent scoring and algorithms to maximize relevance.
*   **Ease of Use:** Simple installation, intuitive admin UI, flexible storefront integration via Theme Editor.
*   **Transparency & Control:** Merchants understand how recommendations work and can customize placements and strategies.
*   **Privacy Respecting:** Built on Shopify's Web Pixel and consent framework.

## Roadmap Phases

### Phase 0: Foundation & MVP (Weeks 1-3)

*   **Goal:** Establish the basic app structure, receive initial data, and display a simple recommendation block.
*   **Tasks:**
    *   Set up Shopify Partner account and create new app (Node.js/Ruby/Python backend).
    *   Implement Shopify OAuth flow.
    *   Create and deploy basic Web Pixel Extension (`shopify app generate extension --type web_pixel_extension`).
    *   Modify Web Pixel Extension to subscribe to `product_viewed` event and send data (including `clientId`, `timestamp`, `data.productVariant.product.id`, `context.document.location.hostname`) to a new backend endpoint.
    *   Set up a simple backend endpoint (`/api/web-pixel-ingest`) to receive `product_viewed` events.
    *   Basic data storage (e.g., a simple table `raw_events` in PostgreSQL/MongoDB) for initial ingestion.
    *   Create and deploy a basic Theme App Extension (`shopify app generate extension --type theme_app_extension`) with a simple App Embed Block schema.
    *   Add placeholder logic in the Theme App Extension block to call a *dummy* recommendation endpoint (`/api/recommendations/dummy`) from the storefront JavaScript and log results.
    *   Basic Admin UI page showing app status.

### Phase 1: Core Session-Based Recommendations (Weeks 4-8)

*   **Goal:** Implement fast, path-based recommendations using a session cache.
*   **Tasks:**
    *   Refine event ingestion: Implement message queue (e.g., Redis Queue, BullMQ) to process events asynchronously.
    *   Set up Redis instance for session caching.
    *   Implement worker process(es) to:
        *   Consume events from the queue.
        *   Store raw `product_viewed` events in the main database (`events` table as per previous example).
        *   Update Redis Sorted Set (`session:<client_id>:views`) with recent product views (productId, timestamp). Implement pruning (ZREMRANGEBYRANK) to keep the set size manageable.
    *   Build the `/api/recommendations` endpoint:
        *   Receive `clientId` and optional `currentProductId` from the storefront widget.
        *   Query Redis (`ZREVRANGEBYSCORE`) for recent views within the session time window.
        *   Implement the scoring algorithm based on recency (`product_viewed` weight + decay).
        *   Filter out the `currentProductId`.
        *   Sort by score and return top N product IDs.
    *   Enhance Theme App Extension block:
        *   Pass correct `clientId` and `currentProductId` to `/api/recommendations`.
        *   Use Shopify Storefront API to fetch product details (title, image, price, URL) for the received product IDs.
        *   Render a simple product list/grid.
    *   Add Admin UI settings for enabling/disabling the "Recently Viewed (Session)" recommendation type and setting max recommendations.

### Phase 2: Expanding Data & Aggregate Recommendations (Weeks 9-14)

*   **Goal:** Incorporate more data sources and introduce aggregate, store-wide recommendation types.
*   **Tasks:**
    *   Modify Web Pixel Extension to track:
        *   `product_added_to_cart` (send productId, variantId, cartToken).
        *   `checkout_completed` (send product/variant IDs, quantities, order ID).
        *   `search_submitted` (send search query).
    *   Update ingestion endpoint and worker to process new event types:
        *   Store in the main database (`events` table).
        *   Update Redis Set (`session:<client_id>:cart`) for items currently in the cart.
        *   (Optional for now) Add `product_added_to_cart` to session scoring (with higher weight).
    *   Develop offline worker processes (running periodically, e.g., nightly or hourly) to analyze the historical `events` data in the main database:
        *   Calculate "Others Also Viewed" aggregates (product co-occurrence in sessions). Store results in a dedicated table (`product_cooccurrences`).
        *   Calculate "Frequently Bought Together" aggregates (product co-occurrence in purchases). Store results (`frequently_bought_together`).
        *   Calculate Store-wide Bestsellers/Popular Products. Cache in Redis or dedicated table.
    *   Enhance `/api/recommendations` endpoint:
        *   Accept parameters specifying the *type* of recommendation requested (e.g., 'session-views', 'others-also-viewed', 'frequently-bought-together', 'popular').
        *   Implement logic to fetch recommendations based on the requested type, querying the appropriate data source (Redis session cache or pre-computed aggregate data).
        *   Filter out items already in the cart when appropriate (e.g., FBT, Popular).
    *   Enhance Theme App Extension block schema:
        *   Allow merchants to select *which* recommendation type to show for specific placements (e.g., "On Product Pages, show 'Others Also Viewed'", "On Cart Page, show 'Frequently Bought Together'").
        *   Add basic visual customization options (title text, number of columns - potentially via CSS).
    *   Update Admin UI:
        *   Manage available recommendation types and their settings.
        *   Basic visualization of event ingestion counts.

### Phase 3: Refinement, Analytics & Merchant Value (Weeks 15-20)

*   **Goal:** Improve algorithm effectiveness, provide performance insights to merchants, and enhance usability.
*   **Tasks:**
    *   Refine session-based scoring: Experiment with different weights and decay rates. Potentially incorporate `add_to_cart` into session scoring.
    *   Implement a hybrid recommendation strategy in the `/api/recommendations` endpoint: For a given placement (e.g., product page), combine results from session data and aggregate data based on pre-configured rules or a learned model.
    *   Implement analytics tracking in the Theme App Extension:
        *   Send "recommendation displayed" (impression) events back to the backend.
        *   Send "recommendation clicked" events (with product ID, position) back.
    *   Build backend logic to process analytics events.
    *   Develop Admin Dashboard:
        *   Show key metrics: Total events tracked, total recommendations served, total clicks on recommendations, click-through rate (CTR).
        *   *Crucially:* Develop attribution logic to estimate sales uplift from recommendations (e.g., "purchase within X minutes/clicks after clicking a recommended product"). Display attributed revenue/orders.
    *   Improve Theme App Extension rendering: More flexible layout options, better handling of product data loading states.
    *   Add comprehensive onboarding guide and app documentation.

### Phase 4: Growth & Advanced Features (Ongoing)

*   **Goal:** Introduce more sophisticated features, expand placements, and explore advanced techniques.
*   **Tasks:**
    *   Implement A/B testing framework to compare different algorithms or settings.
    *   Explore content-based filtering (using product descriptions, tags, categories).
    *   Develop user-based collaborative filtering (requires more robust user identification, potentially matching `clientId` with logged-in `customerId` over time).
    *   Add recommendations on other pages: Search results page, homepage sections, order status page.
    *   Allow more granular customization of recommendation blocks (e.g., filtering by collection, tag exclusions).
    *   Explore using Shopify Functions for real-time logic (future consideration as the ecosystem evolves).
    *   Machine learning models for ranking and prediction.
    *   Integrate with other popular Shopify apps (reviews, loyalty programs).


Logic Behind IntelliSuggest (Or Your App Name)The core logic of this app is built on the principle that understanding user behavior, both immediate and historical, is the most effective way to predict future interest. We leverage Shopify's modern data-capture tool, the Web Pixel Extension, to gather this crucial information.Here's the breakdown of the logic and how it aims for effectiveness and ease of use:1. Effective Data Collection (Web Pixel Extension):Why Web Pixel? It's Shopify's recommended, future-proof way to track events. Critically, it runs in a sandboxed environment that respects customer privacy consent settings automatically. This means merchants don't have to worry as much about complex cookie banners for basic analytics, although full compliance still requires proper site-wide consent management.What Data? We start with core signals like product_viewed, product_added_to_cart, checkout_completed, and search_submitted. These directly indicate user interest and intent. We capture identifiers like clientId (session), customerId (logged-in user), productId, variantId, cartToken, and timestamp.How it's Used:clientId: The primary key for tracking anonymous sessions. Essential for path-based recommendations.customerId: Allows linking behavior across devices/sessions for logged-in users over time (a Phase 4 feature).product/variant IDs: The items the user is showing interest in.timestamp: Crucial for understanding the sequence of actions and applying recency weighting.2. Efficient & Scalable Data Handling:Challenge: Web Pixel events can be high volume, especially for busy stores. Processing them synchronously on the main request thread would be a bottleneck.Solution: Asynchronous Processing (Message Queue + Workers): The ingestion endpoint acts as a simple, fast receiver that immediately pushes the event payload onto a message queue. Separate worker processes pick up events from the queue at their own pace. This decouples ingestion from processing, ensuring the app can handle bursts of traffic without dropping events.Data Storage Strategy:Redis Session Cache: This is key for speed. We store active session data (like the product_viewed sorted set) in Redis. Retrieving the last 10-20 viewed products for a clientId from Redis is near-instantaneous, allowing for rapid path-based recommendations. Cart contents are also stored here for quick access and filtering.Main Database (PostgreSQL/MongoDB): This is for persistence and aggregate analysis. All raw events are stored here long-term. This comprehensive historical data is then used by offline worker processes to compute complex models like "Others Also Viewed" or "Frequently Bought Together".3. Intelligent Recommendation Algorithms (Effectiveness):Session-Based (Phase 1):Logic: Focuses on the user's immediate path within the current session.How it works: We retrieve recent product_viewed events from the Redis cache for the user's clientId. Each view contributes to a product's score.Key Factor: Recency Weighting: Events that happened moments ago are stronger indicators of current interest than events from 30 minutes ago. An exponential decay function (e^(-λ * time_difference)) is applied to the base score of each interaction. This mathematically ensures that more recent actions have a higher impact.Why it's effective: Captures immediate intent ("I'm browsing shoes right now"). Great for new users or users browsing specific categories.Aggregate-Based (Phase 2):Logic: Leverages the collective behavior of all users historically."Others Also Viewed": Analyzes historical sessions to find products frequently viewed together. When a user is on Product A, we recommend products B, C, D that other users often viewed in the same session as A."Frequently Bought Together": Analyzes historical purchase data to find products often purchased in the same order. Ideal for upsells/cross-sells on product or cart pages.Why it's effective: Taps into the "wisdom of the crowds." Provides relevant suggestions even if the current user has limited session history. These are computed offline because analyzing the entire historical dataset is computationally intensive and doesn't need to be real-time.Hybrid Approach (Phase 3):Logic: Combine session-specific insights with broader aggregate trends.How it works: For a given recommendation placement (e.g., Product Page), the app can fetch recommendations from both the session-based algorithm and an aggregate algorithm ("Others Also Viewed"). The final list can be a merge, prioritizing one type, or re-ranked based on criteria (e.g., show recently viewed items first, then related items).Why it's effective: Provides a more robust and relevant recommendation set by considering both immediate context and popular associations.Ongoing Optimization (Phase 3+): Continuous refinement using analytics data (clicks, conversions) to tweak weights, decay rates, and algorithm combinations. Implementing A/B testing allows for data-driven decisions on what works best.4. Seamless Merchant Integration (Ease of Use):Web Pixel Extension: Installation is simple – it's just adding an extension via the Shopify Admin. No theme code modifications required just for data collection.Theme App Extension (App Embed Block): This is critical for ease of use. Merchants don't need to be developers to add recommendations to their theme. They simply use the Theme Editor:Find the "IntelliSuggest Recommendations" block.Drag and drop it into desired locations (product page, cart page, etc.).Use the block's settings panel (defined in the schema) to customize (e.g., title, number of products, which type of recommendation algorithm to use for this specific block).Intuitive Admin UI: The app's admin panel provides clear settings for enabling/disabling recommendation types globally and customizing parameters.Visible Impact: The dashboard shows merchants tangible results (events tracked, recommendations displayed, clicks, and attributed conversions). This proves the app's value and makes it easy for them to justify the cost.Standing Out:IntelliSuggest aims to stand out by combining the following:True Session-Based Speed: Leveraging Web Pixel's real-time events and a Redis cache for near-instant, path-aware recommendations, going beyond just pre-calculated popular lists or static "related products".Intelligent Hybrid Logic: Seamlessly blending immediate user intent (session path) with powerful aggregate insights ("Others Also Viewed", "FBT") for maximum relevance.Robust Data Handling: A scalable architecture using queues and appropriate data stores (Redis + DB) to handle high-volume event streams reliably.Effortless Integration: Utilizing Theme App Extensions for drag-and-drop placement in the theme editor, eliminating complex code edits for merchants.Clear Value Demonstration: Providing a dashboard with attributed conversion data to show merchants the direct impact on their sales.By focusing on these technical strengths and merchant-centric features, IntelliSuggest offers a powerful yet easy-to-manage solution for boosting sales through personalized recommendations.


 scoring user behavior specifically focused on their current session path to provide near-instant recommendations. This approach prioritizes recent user interactions within the current visit.We'll use weights for different interaction types and apply a time-based decay to prioritize recent actions.Algorithm Strategy: Session-Based Interaction ScoringFor a given user (client_id) in their current session, calculate a score for each product they've interacted with recently. The recommendations will be the products with the highest scores, excluding the product they are currently viewing (if on a product page) and items already in their cart.Scoring Factors:Interaction Type: Assign a base score to different events:product_viewed: Low score (common action, low intent)product_added_to_cart: Medium-High score (stronger intent)search_submitted (if relevant to products found): Could potentially boost products appearing high in results for that query. (Let's keep this simple for now and focus on product-specific events).checkout_completed (for purchased items in the session): Very High score (strongest signal).Recency: Events that happened more recently contribute more to the score. We can use an exponential decay function.Data Structure for Scoring (Conceptual/In-Memory):During the calculation, we'll use a simple map (or dictionary) to hold the running score for each product ID within the current session:{ "product_id_1": score_1, "product_id_2": score_2, // ...}content_copydownloadUse code with caution.Example Weights and Parameters:VIEW_WEIGHT = 1ADD_TO_CART_WEIGHT = 5 (5x stronger than a view)DECAY_LAMBDA = 0.001 (This controls the decay rate. A higher number means faster decay. This value means an event 1000 seconds (~16.7 mins) ago would have its weight multiplied by e^(-1) ≈ 0.368. An event ~700s ago gets score * 0.5. Adjust this based on how quickly you want intent to fade).TIME_WINDOW_SECONDS = 3600 (Look back 1 hour of activity in the current session, identified by client_id).MAX_RECOMMENDATIONS = 8Implementation Sketch (Node.js Backend Logic):This logic would run on your backend within the /api/recommendations endpoint when a storefront widget requests recommendations for a user. It primarily queries your Redis session cache (as discussed in the previous answer) for recent events, as querying the main database for every recommendation request would be too slow.

// Assume you have a Redis client connection pool initialized
// and functions to get data from the Redis cache structured as:
// session:<client_id>:views (Sorted Set: { product_id: timestamp })
// session:<client_id>:cart (Set: { product_id })

const redisClient = require('./redisClient'); // Your Redis client setup
const config = { // Your configuration for weights and parameters
    VIEW_WEIGHT: 1,
    ADD_TO_CART_WEIGHT: 5,
    DECAY_LAMBDA: 0.001, // Decay rate (adjust me!)
    TIME_WINDOW_SECONDS: 3600, // 1 hour
    MAX_RECOMMENDATIONS: 8,
};

/**
 * Calculates product recommendations based on recent user behavior in the session.
 * Reads from Redis session cache for speed.
 *
 * @param {string} shopDomain - The shop's domain.
 * @param {string} clientId - The Shopify client ID for the user's session.
 * @param {number} [currentProductId=null] - Optional: The ID of the product currently being viewed (to exclude).
 * @param {Array<number>} [excludeProductIds=[]] - Optional: Additional product IDs to exclude (e.g., already shown recs).
 * @returns {Promise<Array<number>>} - A promise resolving to an array of recommended product IDs.
 */
async function getRecommendationsForUserPath(
    shopDomain,
    clientId,
    currentProductId = null,
    excludeProductIds = []
) {
    const nowInSeconds = Math.floor(Date.now() / 1000);
    const timeCutoff = nowInSeconds - config.TIME_WINDOW_SECONDS;

    // --- 1. Fetch Recent Session Data from Redis ---
    // Get recent product views from the sorted set
    // ZRANGEBYSCORE key min max WITHSCORES
    const viewEvents = await redisClient.zRangeByScore(
        `session:${clientId}:views`,
        timeCutoff, // min score (timestamp)
        '+inf',     // max score (timestamp)
        'WITHSCORES'
    ); // Returns array like [product_id_1, timestamp_1, product_id_2, timestamp_2, ...]

    // Get items currently in the cart from the set
    const cartItems = await redisClient.sMembers(`session:${clientId}:cart`); // Returns array of product_ids (strings)

    // Convert cart item IDs to numbers for consistent comparison
    const cartProductIds = cartItems.map(id => parseInt(id, 10));

    // Combine explicit exclusions with current product and cart items
    const allExclusions = new Set([
        ...excludeProductIds,
        ...(currentProductId ? [currentProductId] : []),
        ...cartProductIds
    ].filter(id => id != null)); // Filter out null/undefined

    // --- 2. Calculate Scores Based on Events and Recency ---
    const productScores = {}; // Map to store { productId: totalScore }

    // Process View Events (from Sorted Set result structure)
    for (let i = 0; i < viewEvents.length; i += 2) {
        const productIdStr = viewEvents[i];
        const timestampStr = viewEvents[i + 1];

        const productId = parseInt(productIdStr, 10);
        const timestamp = parseInt(timestampStr, 10); // Event timestamp in seconds

        if (isNaN(productId) || isNaN(timestamp)) {
             console.warn(`Skipping invalid view event data for client ${clientId}:`, viewEvents[i], viewEvents[i+1]);
             continue;
        }

        const timeDiffSeconds = nowInSeconds - timestamp;
        if (timeDiffSeconds < 0) timeDiffSeconds = 0; // Handle clock skew if any

        const decayFactor = Math.exp(-config.DECAY_LAMBDA * timeDiffSeconds);
        const scoreContribution = config.VIEW_WEIGHT * decayFactor;

        productScores[productId] = (productScores[productId] || 0) + scoreContribution;
    }

    // NOTE: If you were tracking ADD_TO_CART or other events in Redis too (e.g., separate sorted sets or a list of all events), you'd process them here similarly, applying their different base weights. For this example, we are only scoring based on views from the Redis cache for simplicity and speed. A more robust system might store a history of *all* event types in Redis or use the main DB for non-time-critical scoring factors.

    // --- 3. Filter, Sort, and Select Recommendations ---

    const scoredProducts = Object.entries(productScores)
        .map(([productIdStr, score]) => ({
            productId: parseInt(productIdStr, 10),
            score: score,
        }))
        .filter(item => item.score > 0) // Only include products with positive scores
        .filter(item => !allExclusions.has(item.productId)); // Exclude current, cart, and explicit exclusions

    // Sort by score descending
    scoredProducts.sort((a, b) => b.score - a.score);

    // Extract top N product IDs
    const recommendedProductIds = scoredProducts
        .slice(0, config.MAX_RECOMMENDATIONS)
        .map(item => item.productId);

    // --- 4. Fallback (Optional but Recommended) ---
    // If not enough recommendations were found (e.g., new user, no recent activity)
    if (recommendedProductIds.length < config.MAX_RECOMMENDATIONS / 2) { // Example threshold
       // You would fetch fallback recommendations here:
       // - Store-wide popular products (pre-calculated)
       // - Products from the same collection as the current product
       // - General best sellers
       // - Add these to recommendedProductIds, ensuring no duplicates and respecting MAX_RECOMMENDATIONS
        console.log(`Not enough path-based recs for ${clientId}. Implementing fallback needed here.`);
        // Example Fallback (replace with actual logic)
        // const fallbackIds = await getFallbackRecommendations(shopDomain, currentProductId);
        // fallbackIds.forEach(id => {
        //     if (!recommendedProductIds.includes(id) && recommendedProductIds.length < config.MAX_RECOMMENDATIONS) {
        //         recommendedProductIds.push(id);
        //     }
        // });
    }


    console.log(`Recommendations for ${clientId} based on path:`, recommendedProductIds);
    return recommendedProductIds;
}

// --- How the Redis Cache gets populated (Conceptual - this runs in your worker) ---
/*
async function processWebPixelEvent(eventPayload) {
    // ... validation and extraction ...
    const { shopDomain, clientId, eventName, timestamp, productId, cartToken, ...otherData } = eventPayload;
    const timestampInSeconds = Math.floor(new Date(timestamp).getTime() / 1000);

    if (eventName === 'product_viewed' && productId) {
        // Add to sorted set: productId as member, timestamp as score
        await redisClient.zAdd(`session:${clientId}:views`, { score: timestampInSeconds, member: productId.toString() });
        // Optional: Trim the set to a max size if needed
        // await redisClient.zRemRangeByRank(`session:${clientId}:views`, 0, -config.MAX_SESSION_VIEWS - 1);

    } else if (eventName === 'product_added_to_cart' && productId) {
        // Add to cart set
         await redisClient.sAdd(`session:${clientId}:cart`, productId.toString());
        // Note: Handling item removal from cart requires more complex tracking or relying on full cart updates

    }
    // Add logic for other event types if they influence the *real-time path* score
    // (e.g., product_removed_from_cart, potentially checkout_completed if within the *very* recent window)

    // You might also update aggregate data structures here for offline processing/other recommendation types
}
*/

// --- Example Usage (within your /api/recommendations endpoint handler) ---
/*
app.post('/api/recommendations', async (req, res) => {
    try {
        const { clientId, shopDomain, pageContext } = req.body; // Data sent from Theme App Extension

        if (!clientId || !shopDomain || !pageContext) {
            return res.status(400).json({ error: 'Missing required parameters' });
        }

        let currentProductId = null;
        if (pageContext.type === 'product' && pageContext.productId) {
            currentProductId = parseInt(pageContext.productId, 10);
        }
        // You might get cart items from the page context or fetch them directly from Redis here if needed

        const recommendedIds = await getRecommendationsForUserPath(
            shopDomain,
            clientId,
            currentProductId
            // Potentially pass cart item IDs if pageContext includes them
        );

        // In a real app, you'd then fetch product details for these IDs using Shopify Storefront API
        // For this example, we'll just return the IDs
        res.json({ recommendedProductIds: recommendedIds });

    } catch (error) {
        console.error('Error fetching recommendations:', error);
        res.status(500).json({ error: 'Failed to fetch recommendations' });
    }
});
*/

**Explanation:**

1.  **Redis as the Hot Cache:** We rely on Redis to store the *most recent* session events (`product_viewed`) because Redis is incredibly fast for read operations. This avoids querying the main, potentially large, database in the request path.
2.  **Time Window:** We only consider events within a defined time window (`TIME_WINDOW_SECONDS`). This keeps the calculation relevant to the user's current activity path.
3.  **Decay Function:** `Math.exp(-DECAY_LAMBDA * timeDiffSeconds)` calculates a multiplier between 0 (for very old events) and 1 (for events right now). This multiplier is applied to the base weight of the interaction type.
4.  **Scoring Aggregation:** We iterate through the recent events fetched from Redis and accumulate the decayed score for each unique product ID in the `productScores` map. If a user views a product multiple times, each view within the window adds to its score, but later views add more because their decay factor is higher.
5.  **Exclusions:** Products the user is currently viewing or has in their cart are filtered out, as recommending these is usually redundant.
6.  **Sorting and Selection:** The products are sorted by their total calculated score, and the top N are selected.
7.  **Fallback:** It's crucial to have a fallback mechanism if the user has no recent activity. This is where pre-calculated popular products, bestsellers, or category-based recommendations come in.

**Why this is "Near Instant":**

*   The core logic only involves reading a small, actively updated data set from a very fast in-memory store (Redis).
*   The scoring calculation is a simple loop and arithmetic operations.
*   No complex database joins or heavy computations are done within the recommendation request path.

**Next Steps & Improvements:**

*   **Implement `ADD_TO_CART` (and potentially `checkout_completed`) scoring:** Add logic to store these events in Redis (perhaps separate sorted sets or a more complex Redis structure per session) and incorporate their higher weights into the scoring loop.
*   **Handling different event types in Redis:** You might need separate Redis keys or a different structure if you want to quickly retrieve different event types for scoring (e.g., `session:<client_id>:addtocarts`, `session:<client_id>:purchases`).
*   **Persistence:** The *worker* process should still write *all* events to your main database (`events` table) for long-term storage, historical analysis, and building more complex, store-wide recommendation models ("Others Also Viewed", etc.).
*   **Cold Start:** Implement and integrate the fallback recommendation logic.
*   **Hybrid Approaches:** Combine this session-based scoring with pre-calculated aggregate recommendations (like "Others Also Viewed") by fetching results from both sources and merging/re-ranking them.
*   **A/B Testing:** Experiment with different weights (`VIEW_WEIGHT`, `ADD_TO_CART_WEIGHT`), decay parameters (`DECAY_LAMBDA`), and time windows (`TIME_WINDOW_SECONDS`) to see what performs best for conversion rates.
*   **More Sophisticated Decay:** Consider non-exponential decay or decay based on time *between* events rather than time from "now".
*   **Handling Variants:** If recommendations should be variant-specific, store and score variant IDs instead of product IDs, and update the caching structure accordingly.

Assumed Setup:Node.js backend using Express.PostgreSQL for the main database.Redis for the session cache and message queue.Shopify CLI for extensions (web-pixel-extension, theme-app-extension).Phase 0: Foundation & MVPGoal: Receive product_viewed events, store them simply, and have a dummy recommendation endpoint.1. Web Pixel Extension (extensions/web-pixel-extension/src/index.js)import { analytics } from '@shopify/web-pixels-extension';// Subscribe to product view eventsanalytics.subscribe('product_viewed', async (event) => { console.log('Product Viewed Pixel Fired:', event); const payload = { eventName: 'product_viewed', timestamp: event.timestamp, clientId: event.clientId, // Get the Shopify browser ID customerId: event.data?.customer?.id, // Get logged-in customer ID if available shopDomain: event.context.document.location.hostname, // Get the store domain productId: event.data?.productVariant?.product?.id, // Get the product ID variantId: event.data?.productVariant?.id, // Get the variant ID // Add other relevant data if needed }; try { // Send the event data to your backend ingestion endpoint // Use `keepalive: true` to increase chances of sending during page navigation await fetch('YOUR_APP_BACKEND_URL/api/web-pixel-ingest', { method: 'POST', headers: { 'Content-Type': 'application/json', }, body: JSON.stringify(payload), keepalive: true, }); console.log('Product viewed event sent to backend'); } catch (error) { console.error('Error sending product viewed event:', error); }});// You might subscribe to other events here later (Phase 2)// analytics.subscribe('product_added_to_cart', (event) => { ... });// analytics.subscribe('checkout_completed', (event) => { ... });// analytics.subscribe('search_submitted', (event) => { ... });content_copydownloadUse code with caution.JavaScript2. Backend: Simple Ingestion Endpoint (backend/src/routes/events.js)const express = require('express');const router = express.Router();const db = require('../db'); // Assume you have a db connection setup// Simple endpoint to receive web pixel eventsrouter.post('/web-pixel-ingest', async (req, res) => { const event = req.body; console.log('Received web pixel event:', event.eventName, event.clientId); // Basic validation (add more robust validation later) if (!event.clientId || !event.shopDomain || !event.eventName) { return res.status(400).json({ error: 'Missing required event data' }); } try { // --- Phase 0: Simple direct database insert --- // In Phase 1, this will push to a queue instead. await db.query( `INSERT INTO raw_events ( shop_domain, client_id, customer_id, event_name, timestamp, product_id, variant_id, cart_token, search_query, page_url, raw_payload ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`, [ event.shopDomain, event.clientId, event.customerId, event.eventName, new Date(event.timestamp), // Convert pixel timestamp string to Date event.productId, event.variantId, event.cartToken, event.searchQuery, event.pageUrl, // Assuming you add pageUrl to the pixel payload JSON.stringify(event) // Store raw payload for debugging/completeness ] ); console.log('Event saved to DB'); res.status(200).json({ success: true }); } catch (error) { console.error('Error saving event to DB:', error); // Respond quickly even on error to not block the pixel res.status(500).json({ error: 'Failed to process event' }); }});// Dummy recommendation endpoint (Phase 0)router.post('/recommendations', (req, res) => { console.log('Dummy recommendations requested for:', req.body); // Return some fake product IDs for testing the frontend block res.json({ recommendedProductIds: [12345, 67890, 11223] }); // Replace with actual test IDs from your dev store});module.exports = router;content_copydownloadUse code with caution.JavaScript(Note: The raw_events table structure should match the fields being inserted.)3. Storefront Widget (Theme App Extension) (extensions/theme-app-extension/blocks/recommendations-block.liquid){% comment %} Schema defines the block's settings in the Theme Editor{% endcomment %}{% schema %}{ "name": "IntelliSuggest Recommendations", "target": "section", // Or "product", "cart" depending on where it's typically placed "settings": [ { "type": "text", "id": "title", "label": "Heading", "default": "Recommended for you" }, { "type": "range", "id": "limit", "min": 1, "max": 12, "step": 1, "label": "Number of products to show", "default": 4 } // More settings will be added later (Phase 1, 2) ], "presets": [ { "name": "IntelliSuggest Recommendations" } ]}{% endschema %}<div class="intellisuggest-recommendations-block"> <h2 class="intellisuggest-title">{{ block.settings.title }}</h2> <div class="intellisuggest-products-grid"> <!-- Products will be rendered here by JavaScript --> Loading recommendations... </div></div><script> // Get the client ID - Shopify sets a cookie like _shopify_y or _shopify_sa_p // This is a simplified way; a robust way would check multiple cookies or // potentially get it from Shopify Liquid context if available and consistent. // For Web Pixel, we primarily rely on the ID the pixel gives us server-side, // but the storefront needs a way to get it or receive it from the backend call. // Let's assume the backend `/api/recommendations` endpoint *needs* it passed from here. // A simple (but potentially less reliable) way is reading cookies: function getShopifyClientId() { const cookies = document.cookie.split(';'); for (let i = 0; i < cookies.length; i++) { let cookie = cookies[i].trim(); // Look for Shopify's analytics cookies (may vary) if (cookie.startsWith('_shopify_y=') || cookie.startsWith('_shopify_sa_p=')) { const value = cookie.split('=')[1]; // Extract the part before the last '__' if present (structure can vary) return value.split('__')[0]; } // Fallback or other potential IDs? Consider browser Local Storage or generating one // if no Shopify ID is found and consent allows. Requires careful privacy review. } // If no clear Shopify ID found, maybe return a generated one or null // Returning null/undefined means the backend won't have a session ID console.warn("Shopify client ID cookie not found. Recommendations may not be personalized."); // As a fallback, maybe check localStorage if you implemented your own fallback ID there // return localStorage.getItem('my_app_fallback_client_id') || null; return null; // For now, return null if not found } const clientId = getShopifyClientId(); const shopDomain = window.location.hostname; // Get context based on the current page (simplified) const pageContext = { type: window.location.pathname.includes('/products/') ? 'product' : window.location.pathname.includes('/cart') ? 'cart' : 'homepage', // Basic page type detection productId: window.location.pathname.includes('/products/') ? window.ShopifyAnalytics?.meta?.product?.id : null // Requires Shopify's standard analytics meta // Add cart context, search context etc. later }; // Function to fetch recommendations (Phase 0: Dummy call) async function fetchRecommendations(clientId, shopDomain, pageContext) { try { const response = await fetch('YOUR_APP_BACKEND_URL/api/recommendations', { method: 'POST', headers: { 'Content-Type': 'application/json', }, body: JSON.stringify({ clientId: clientId, shopDomain: shopDomain, pageContext: pageContext, limit: {{ block.settings.limit }} // Pass block settings }), }); if (!response.ok) { throw new Error(`HTTP error! status: ${response.status}`); } const data = await response.json(); console.log('Dummy Recommendations Received:', data); // --- Phase 0: Simple display --- const container = document.querySelector('.intellisuggest-products-grid'); if (container) { if (data.recommendedProductIds && data.recommendedProductIds.length > 0) { container.innerHTML = `Recommended Product IDs: ${data.recommendedProductIds.join(', ')}`; } else { container.innerHTML = 'No dummy recommendations found.'; } } // Phase 1: Implement fetching actual product details and rendering cards here } catch (error) { console.error('Error fetching recommendations:', error); const container = document.querySelector('.intellisuggest-products-grid'); if (container) { container.innerHTML = 'Failed to load recommendations.'; } } } // Fetch recommendations when the block loads // Check if clientId is available before fetching if it's essential for your dummy endpoint if (clientId) { // For Phase 1+, clientId is essential fetchRecommendations(clientId, shopDomain, pageContext); } else { console.warn("Client ID not available. Skipping recommendation fetch."); const container = document.querySelector('.intellisuggest-products-grid'); if (container) { container.innerHTML = 'Cannot load personalized recommendations (client ID not found).'; } }</script>content_copydownloadUse code with caution.LiquidPhase 1: Core Session-Based RecommendationsGoal: Implement fast, path-based recommendations using Redis session cache and simple scoring. Display actual products.1. Backend: Enhance Ingestion (Add Queue)// backend/src/routes/events.js (Modification)const express = require('express');const router = express.Router();const Queue = require('bull'); // Using BullMQ (requires Redis)const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';// Create a BullMQ queue instanceconst eventQueue = new Queue('web-pixel-events', REDIS_URL);router.post('/web-pixel-ingest', async (req, res) => { const event = req.body; console.log('Received web pixel event for queue:', event.eventName, event.clientId); if (!event.clientId || !event.shopDomain || !event.eventName) { return res.status(400).json({ error: 'Missing required event data' }); } try { // --- Phase 1: Push to a message queue --- await eventQueue.add('processEvent', event, { removeOnComplete: true, // Clean up finished jobs removeOnFail: true // Clean up failed jobs }); console.log(`Event ${event.eventName} added to queue`); res.status(200).json({ success: true, message: 'Event queued' }); } catch (error) { console.error('Error adding event to queue:', error); res.status(500).json({ error: 'Failed to queue event' }); }});// ... (Keep the dummy /recommendations route for now or replace it below)content_copydownloadUse code with caution.JavaScript2. Backend: Implement Queue Worker (backend/src/worker.js)// backend/src/worker.jsconst Queue = require('bull');const db = require('./db'); // Your DB connectionconst redisClient = require('./redisClient'); // Your Redis connectionconst REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';const eventQueue = new Queue('web-pixel-events', REDIS_URL);const config = { MAX_SESSION_VIEWS: 50 // Keep last 50 viewed products in Redis per session // Add other worker-specific configs here}// Process jobs from the queueeventQueue.process('processEvent', async (job) => { const event = job.data; console.log(`Processing event from queue: ${event.eventName} for ${event.clientId}`); // --- Save to Main Database (for historical analysis) --- try { await db.query( `INSERT INTO events ( shop_domain, client_id, customer_id, event_name, timestamp, product_id, variant_id, cart_token, search_query, page_url, raw_payload ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`, [ event.shopDomain, event.clientId, event.customerId, event.eventName, new Date(event.timestamp), event.productId, event.variantId, event.cartToken, event.searchQuery, event.pageUrl, JSON.stringify(event) ] ); console.log('Event saved to DB by worker'); } catch (error) { console.error('Worker Error saving event to DB:', error); // Depending on criticality, you might throw to retry the job // throw error; } // --- Update Redis Session Cache (for fast access) --- try { const timestampInSeconds = Math.floor(new Date(event.timestamp).getTime() / 1000); if (event.eventName === 'product_viewed' && event.productId) { // Add to the sorted set tracking recent views for this client await redisClient.zAdd(`session:${event.clientId}:views`, { score: timestampInSeconds, // Score is timestamp member: event.productId.toString() // Member is product ID }); // Trim the set to keep only the most recent views await redisClient.zRemRangeByRank(`session:${event.clientId}:views`, 0, -config.MAX_SESSION_VIEWS - 1); console.log(`Redis: Added product ${event.productId} to views for ${event.clientId}`); } else if (event.eventName === 'product_added_to_cart' && event.productId) { // Add product to the cart set for this client await redisClient.sAdd(`session:${event.clientId}:cart`, event.productId.toString()); console.log(`Redis: Added product ${event.productId} to cart for ${event.clientId}`); } // Add logic for other events here in Phase 2 // e.g., product_removed_from_cart, checkout_completed etc. } catch (error) { console.error('Worker Error updating Redis:', error); // Decide if this error should fail the job and potentially retry // throw error; } // In Phase 2, this worker might also trigger updates to aggregate data models});// Start the worker by calling eventQueue.process somewhere in your app initialization// or run this file as a separate process.// require('./worker'); // Call this in your main app filecontent_copydownloadUse code with caution.JavaScript3. Backend: Implement Recommendation Logic (backend/src/routes/recommendations.js)// backend/src/routes/recommendations.jsconst express = require('express');const router = express.Router();const redisClient = require('../redisClient'); // Your Redis connection// Assume you have functions to fetch product details from Shopify Admin/Storefront API if neededconst config = { VIEW_WEIGHT: 1, ADD_TO_CART_WEIGHT: 5, // Added weight for ATC DECAY_LAMBDA: 0.001, // Decay rate (adjust me!) TIME_WINDOW_SECONDS: 3600, // 1 hour lookback for session data MAX_RECOMMENDATIONS: 8, // Add other config like fallback thresholds etc.};/** * Calculates score based on timestamp and decay function. */function getDecayedScore(timestampSeconds, baseWeight, nowSeconds) { const timeDiffSeconds = nowSeconds - timestampSeconds; if (timeDiffSeconds < 0) return 0; // Should not happen with proper timestamps const decayFactor = Math.exp(-config.DECAY_LAMBDA * timeDiffSeconds); return baseWeight * decayFactor;}// Recommendation endpoint (Phase 1+)router.post('/recommendations', async (req, res) => { const { clientId, shopDomain, pageContext, limit } = req.body; const maxRecs = limit || config.MAX_RECOMMENDATIONS; if (!clientId || !shopDomain || !pageContext) { return res.status(400).json({ error: 'Missing required parameters' }); } const nowInSeconds = Math.floor(Date.now() / 1000); const timeCutoff = nowInSeconds - config.TIME_WINDOW_SECONDS; // Only consider events in the last X seconds let currentProductId = null; if (pageContext.type === 'product' && pageContext.productId) { currentProductId = parseInt(pageContext.productId, 10); } try { // --- 1. Fetch Recent Session Data from Redis --- // Get recent product views (member: productId, score: timestamp) const viewEvents = await redisClient.zRangeByScore( `session:${clientId}:views`, timeCutoff, '+inf', 'WITHSCORES' ); // [productId1, ts1, productId2, ts2, ...] // Get items currently in the cart (Set of productIds) const cartItems = await redisClient.sMembers(`session:${clientId}:cart`); const cartProductIds = new Set(cartItems.map(id => parseInt(id, 10))); // --- 2. Calculate Scores Based on Events and Recency --- const productScores = {}; // Map { productId: totalScore } // Process View Events for (let i = 0; i < viewEvents.length; i += 2) { const productId = parseInt(viewEvents[i], 10); const timestamp = parseInt(viewEvents[i + 1], 10); if (!isNaN(productId) && !isNaN(timestamp)) { const score = getDecayedScore(timestamp, config.VIEW_WEIGHT, nowInSeconds); productScores[productId] = (productScores[productId] || 0) + score; } } // NOTE: If you tracked ADD_TO_CART in Redis (e.g., another Sorted Set `session:<client_id>:addtocarts`), // you would fetch and process those events here, applying config.ADD_TO_CART_WEIGHT. // For simplicity, this snippet only scores views from Redis. // A full implementation would likely iterate through a single list/sorted set // of *all* recent session events in Redis and apply weights based on event type. // --- 3. Filter, Sort, and Select Recommendations --- const scoredProducts = Object.entries(productScores) .map(([productIdStr, score]) => ({ productId: parseInt(productIdStr, 10), score: score })) .filter(item => item.score > 0); // Only positive scores // Apply exclusions: current product, cart items const excludedProductIds = new Set([ ...(currentProductId ? [currentProductId] : []), ...Array.from(cartProductIds) // Convert Set to Array for spread ].filter(id => id != null)); // Filter out null/undefined const recommendedProductIds = scoredProducts .filter(item => !excludedProductIds.has(item.productId)) .sort((a, b) => b.score - a.score) // Sort by score descending .slice(0, maxRecs) // Take top N .map(item => item.productId); // Get just the IDs // --- 4. Fallback (Phase 3 or earlier: Basic Fallback) --- // If not enough recs, get store-wide popular products (need pre-calculated data) if (recommendedProductIds.length < Math.min(maxRecs / 2, 2) ) { // Example threshold console.log(`Not enough path-based recs (${recommendedProductIds.length}/${maxRecs}) for ${clientId}. Fetching fallback.`); // Example: Fetching popular product IDs (requires pre-calculated data) // This data would NOT be calculated here, but loaded from DB or Redis cache. // const popularIds = await getPopularProductIds(shopDomain, maxRecs - recommendedProductIds.length); // popularIds.forEach(id => { // if (!recommendedProductIds.includes(id) && !excludedProductIds.has(id) && recommendedProductIds.length < maxRecs) { // recommendedProductIds.push(id); // } // }); } // --- 5. Fetch Product Details (New in Phase 1 for storefront) --- // Now that we have IDs, fetch details using Shopify Storefront API. // This part is complex and would involve making authenticated GraphQL calls // to Shopify's Storefront API. You need API credentials set up. // For this snippet, let's assume a function `fetchProductDetailsFromShopify` exists. // const productsWithDetails = await fetchProductDetailsFromShopify(recommendedProductIds); // Return product details if fetching worked, or just IDs if not // For simplicity in this snippet, just return IDs res.json({ recommendedProductIds: recommendedProductIds }); // Or: res.json({ recommendedProducts: productsWithDetails }); } catch (error) { console.error('Error fetching recommendations:', error); res.status(500).json({ error: 'Failed to fetch recommendations' }); }});module.exports = router;content_copydownloadUse code with caution.JavaScript4. Storefront Widget (Theme App Extension) (extensions/theme-app-extension/blocks/recommendations-block.liquid){% comment %} Schema as before, potentially adding a 'recommendation_type' setting in Phase 2 {% endcomment %}{% schema %} ... {% endschema %}<div class="intellisuggest-recommendations-block" data-client-id="{{ client_id }}"> <h2 class="intellisuggest-title">{{ block.settings.title }}</h2> <div class="intellisuggest-products-grid"> <!-- Products will be rendered here by JavaScript --> Loading recommendations... </div></div><script> // Use Liquid to get client ID (more reliable than cookie reading if available) // {{ client_id }} populates this if your Liquid context provides it (e.g. Dawn theme) // If not available, you might still need cookie reading or a fallback. // Let's assume {{ client_id }} works for demonstration. const clientId = "{{ client_id }}"; // Get client ID from Liquid context const shopDomain = window.location.hostname; // Get context based on the current page (simplified) const pageContext = { type: window.location.pathname.includes('/products/') ? 'product' : window.location.pathname.includes('/cart') ? 'cart' : 'homepage', productId: window.location.pathname.includes('/products/') ? window.ShopifyAnalytics?.meta?.product?.id : null }; // Function to fetch recommendations async function fetchAndRenderRecommendations(clientId, shopDomain, pageContext, limit) { const container = document.querySelector('.intellisuggest-products-grid'); if (!container) return; container.innerHTML = 'Loading recommendations...'; // Loading state try { const response = await fetch('YOUR_APP_BACKEND_URL/api/recommendations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId: clientId, shopDomain: shopDomain, pageContext: pageContext, limit: limit, // Add recommendation_type here in Phase 2 }), }); if (!response.ok) { throw new Error(`HTTP error! status: ${response.status}`); } const data = await response.json(); const recommendedProductIds = data.recommendedProductIds; // Expecting list of IDs from Phase 1 backend if (!recommendedProductIds || recommendedProductIds.length === 0) { container.innerHTML = 'No recommendations found.'; return; } // --- Phase 1: Fetch Product Details using Storefront API --- // Requires setting up Storefront API access for your app & theme // Example using a hypothetical fetch function: // const productDetails = await fetchProductDetailsFromShopifyStorefront(recommendedProductIds); // Simplified: Just display the IDs for now, or hardcode some representation // In a real app, this would be a loop creating HTML for each product card container.innerHTML = ''; // Clear loading state recommendedProductIds.forEach(productId => { const productCardHtml = ` <div class="intellisuggest-product-card"> <!-- In a real app, display product image, title, price, link --> <p>Product ID: ${productId}</p> <a href="/products/${productId}">View Product</a> </div> `; // Replace with actual product rendering logic using fetched details container.innerHTML += productCardHtml; // Append card HTML }); } catch (error) { console.error('Error fetching and rendering recommendations:', error); container.innerHTML = 'Failed to load recommendations.'; } } // Check if clientId is available and trigger fetch if (clientId && clientId !== "") { // Check against Liquid's empty string output fetchAndRenderRecommendations( clientId, shopDomain, pageContext, {{ block.settings.limit }} // Get limit from Liquid block settings ); } else { console.warn("Client ID not available from Liquid context. Cannot load personalized recommendations."); const container = document.querySelector('.intellisuggest-products-grid'); if (container) { container.innerHTML = 'Cannot load personalized recommendations.'; } }</script>content_copydownloadUse code with caution.Liquid(Note: Getting client_id reliably in the storefront JS is sometimes tricky. Relying on Liquid variable injection {{ client_id }} is best if your theme/Shopify context supports it. Otherwise, you might need to read cookies, but be careful about privacy implications and consent.)Phase 2: Expanding Data & Aggregate RecommendationsGoal: Track more events. Store cart state in Redis. Introduce offline processing concept and multiple recommendation types.1. Web Pixel Extension (extensions/web-pixel-extension/src/index.js)import { analytics } from '@shopify/web-pixels-extension';// Keep previous subscriptions// ... analytics.subscribe('product_viewed', ...)// Add new subscriptionsanalytics.subscribe('product_added_to_cart', async (event) => { console.log('Product Added to Cart Pixel Fired:', event); const payload = { eventName: 'product_added_to_cart', timestamp: event.timestamp, clientId: event.clientId, customerId: event.data?.customer?.id, shopDomain: event.context.document.location.hostname, productId: event.data?.productVariant?.product?.id, variantId: event.data?.productVariant?.id, cartToken: event.data?.cart?.id, // Capture cart token // Add quantity, price etc. from event.data if needed }; await sendEventToBe_AppBackend(payload); // Assuming this async function sends to ingestion endpoint});// Add more subscriptions as neededanalytics.subscribe('checkout_completed', async (event) => { console.log('Checkout Completed Pixel Fired:', event); const payload = { eventName: 'checkout_completed', timestamp: event.timestamp, clientId: event.clientId, customerId: event.data?.customer?.id, shopDomain: event.context.document.location.hostname, cartToken: event.data?.cart?.id, // Capture cart token // Capture order data, line items (products/variants, quantities, prices) // This data structure can be complex depending on the event payload details checkout: event.data?.checkout, order: event.data?.order // Often available after checkout }; await sendEventToBe_AppBackend(payload);});analytics.subscribe('search_submitted', async (event) => { console.log('Search Submitted Pixel Fired:', event); const payload = { eventName: 'search_submitted', timestamp: event.timestamp, clientId: event.clientId, customerId: event.data?.customer?.id, shopDomain: event.context.document.location.hostname, searchQuery: event.data?.searchResult?.query, // Capture search query }; await sendEventToBe_AppBackend(payload);});// Re-use the send function from Phase 0async function sendEventToBe_AppBackend(payload) { try { await fetch('YOUR_APP_BACKEND_URL/api/web-pixel-ingest', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), keepalive: true, }); console.log(`Event ${payload.eventName} sent to backend`); } catch (error) { console.error(`Error sending ${payload.eventName} event:`, error); }}content_copydownloadUse code with caution.JavaScript2. Backend: Worker Enhancements (backend/src/worker.js)// backend/src/worker.js (Modifications)// ... (previous imports and queue setup)// Process jobs from the queueeventQueue.process('processEvent', async (job) => { const event = job.data; console.log(`Processing event from queue: ${event.eventName} for ${event.clientId}`); // --- Save to Main Database (includes new fields) --- try { await db.query( `INSERT INTO events ( shop_domain, client_id, customer_id, event_name, timestamp, product_id, variant_id, cart_token, search_query, page_url, raw_payload ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`, [ event.shopDomain, event.clientId, event.customerId, event.eventName, new Date(event.timestamp), event.productId, // May be null for non-product events event.variantId, // May be null event.cartToken, // May be null event.searchQuery, // May be null event.pageUrl, JSON.stringify(event) ] ); console.log('Event saved to DB by worker'); } catch (error) { console.error('Worker Error saving event to DB:', error); // throw error; } // --- Update Redis Session Cache --- try { const timestampInSeconds = Math.floor(new Date(event.timestamp).getTime() / 1000); if (event.eventName === 'product_viewed' && event.productId) { await redisClient.zAdd(`session:${event.clientId}:views`, { score: timestampInSeconds, member: event.productId.toString() }); await redisClient.zRemRangeByRank(`session:${event.clientId}:views`, 0, -config.MAX_SESSION_VIEWS - 1); console.log(`Redis: Added product ${event.productId} to views for ${event.clientId}`); } else if (event.eventName === 'product_added_to_cart' && event.productId) { // Add product to the cart set await redisClient.sAdd(`session:${event.clientId}:cart`, event.productId.toString()); console.log(`Redis: Added product ${event.productId} to cart for ${event.clientId}`); } // TODO: Handle product_removed_from_cart if pixel provides it, or infer from cart updates // await redisClient.sRem(`session:${event.clientId}:cart`, event.productId.toString()); // TODO: Handle checkout_completed if needed for very recent purchase signals in Redis // Note: checkout_completed often marks end of session intent, might not be used for *session* recs // but is vital for FBT analysis (Phase 2 offline) } catch (error) { console.error('Worker Error updating Redis:', error); // throw error; } // --- Trigger Offline Aggregate Processing (Conceptual) --- // After saving events, you might periodically trigger jobs // to update aggregate data structures. // This isn't done *per event*, but on a schedule or based on batches. // E.g., // if (eventName === 'checkout_completed') { // // Schedule a job to recalculate FBT if enough new orders accumulated // await aggregateQueue.add('calculateFBT', { shopDomain: event.shopDomain }); // } // Similarly for 'product_viewed' batches to update 'Others Also Viewed'.});// ... (rest of the worker setup)content_copydownloadUse code with caution.JavaScript3. Backend: Aggregate Data Storage (Conceptual DB Tables)-- Example table for "Others Also Viewed" data (computed offline)CREATE TABLE product_cooccurrences ( shop_domain VARCHAR(255) NOT NULL, product_id_a BIGINT NOT NULL, product_id_b BIGINT NOT NULL, cooccurrence_count INT DEFAULT 0, -- How many sessions viewed A then B (or A and B) last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(), PRIMARY KEY (shop_domain, product_id_a, product_id_b));CREATE INDEX idx_cooccurrences_a_count ON product_cooccurrences (product_id_a, cooccurrence_count DESC);-- Example table for "Frequently Bought Together" data (computed offline)CREATE TABLE frequently_bought_together ( shop_domain VARCHAR(255) NOT NULL, product_id_a BIGINT NOT NULL, product_id_b BIGINT NOT NULL, purchase_count INT DEFAULT 0, -- How many orders included both A and B last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(), PRIMARY KEY (shop_domain, product_id_a, product_id_b));CREATE INDEX idx_fbt_a_count ON frequently_bought_together (product_id_a, purchase_count DESC);-- Example table/cache for "Popular Products" (computed offline)-- Could be in DB or cached directly in RedisCREATE TABLE popular_products ( shop_domain VARCHAR(255) NOT NULL, product_id BIGINT NOT NULL, score INT DEFAULT 0, -- Based on total views, sales, etc. last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(), PRIMARY KEY (shop_domain, product_id));CREATE INDEX idx_popular_domain_score ON popular_products (shop_domain, score DESC);content_copydownloadUse code with caution.SQL4. Backend: Recommendation Logic Enhancements (backend/src/routes/recommendations.js)// backend/src/routes/recommendations.js (Modifications)// ... (previous imports and config)// Assume functions exist to fetch from aggregate data stores:// const { getOthersAlsoViewed, getFrequentlyBoughtTogether, getPopularProductIds } = require('../aggregateDataService');router.post('/recommendations', async (req, res) => { const { clientId, shopDomain, pageContext, limit, recommendationType } = req.body; // Added recommendationType const maxRecs = limit || config.MAX_RECOMMENDATIONS; if (!clientId || !shopDomain || !pageContext || !recommendationType) { return res.status(400).json({ error: 'Missing required parameters' }); } let recommendedProductIds = []; const excludedProductIds = new Set(); // Build exclusion set dynamically // Get current product and cart items for exclusions (used by multiple types) let currentProductId = null; if (pageContext.type === 'product' && pageContext.productId) { currentProductId = parseInt(pageContext.productId, 10); excludedProductIds.add(currentProductId); } // Fetch cart items from Redis for exclusion const cartItems = await redisClient.sMembers(`session:${clientId}:cart`); cartItems.map(id => parseInt(id, 10)).forEach(id => excludedProductIds.add(id)); try { // --- Choose Recommendation Logic Based on Type --- switch (recommendationType) { case 'session-views': recommendedProductIds = await getSessionBasedRecommendations(clientId, excludedProductIds, maxRecs); break; case 'others-also-viewed': if (pageContext.type === 'product' && currentProductId) { // Fetch from pre-computed aggregate data // Logic in getOthersAlsoViewed would query product_cooccurrences table const related = await getOthersAlsoViewed(shopDomain, currentProductId, maxRecs + excludedProductIds.size); // Filter out exclusions *after* fetching a few extra recommendedProductIds = related.filter(id => !excludedProductIds.has(id)).slice(0, maxRecs); } else { // Fallback for pages without a specific product context console.warn(`'others-also-viewed' requested without product context for ${clientId}. Falling back.`); // Fallback logic (e.g., popular) recommendedProductIds = await getPopularProductIds(shopDomain, maxRecs + excludedProductIds.size); recommendedProductIds = recommendedProductIds.filter(id => !excludedProductIds.has(id)).slice(0, maxRecs); } break; case 'frequently-bought-together': // This typically works best on Cart or Product pages if (cartProductIds.size > 0) { // Use items in the cart // Fetch from pre-computed aggregate data // Logic in getFrequentlyBoughtTogether would query frequently_bought_together table const fbt = await getFrequentlyBoughtTogether(shopDomain, Array.from(cartProductIds), maxRecs + excludedProductIds.size); recommendedProductIds = fbt.filter(id => !excludedProductIds.has(id)).slice(0, maxRecs); } else if (pageContext.type === 'product' && currentProductId) { // Or items related to current product const fbt = await getFrequentlyBoughtTogether(shopDomain, [currentProductId], maxRecs + excludedProductIds.size); recommendedProductIds = fbt.filter(id => !excludedProductIds.has(id)).slice(0, maxRecs); } else { console.warn(`'frequently-bought-together' requested without cart or product context for ${clientId}. Falling back.`); // Fallback logic (e.g., popular or general FBT) recommendedProductIds = await getPopularProductIds(shopDomain, maxRecs + excludedProductIds.size); // Or get general FBT recommendedProductIds = recommendedProductIds.filter(id => !excludedProductIds.has(id)).slice(0, maxRecs); } break; case 'popular': // Fetch from pre-computed popular data const popular = await getPopularProductIds(shopDomain, maxRecs + excludedProductIds.size); recommendedProductIds = popular.filter(id => !excludedProductIds.has(id)).slice(0, maxRecs); break; // Add cases for other types like 'search-based', 'hybrid', etc. later default: console.warn(`Unknown recommendation type: ${recommendationType} for ${clientId}. Falling back.`); const defaultRecs = await getPopularProductIds(shopDomain, maxRecs + excludedProductIds.size); recommendedProductIds = defaultRecs.filter(id => !excludedProductIds.has(id)).slice(0, maxRecs); break; } // --- Ensure we return up to maxRecs (even if fallback didn't fill) --- if (recommendedProductIds.length > maxRecs) { recommendedProductIds = recommendedProductIds.slice(0, maxRecs); } // --- Fetch Product Details using Storefront API (as in Phase 1) --- // const productsWithDetails = await fetchProductDetailsFromShopifyStorefront(recommendedProductIds); res.json({ recommendedProductIds: recommendedProductIds, // recommendedProducts: productsWithDetails // Return details if fetched }); } catch (error) { console.error('Error fetching recommendations:', error); res.status(500).json({ error: 'Failed to fetch recommendations' }); }});// --- Helper function for Session-Based Recommendations (Moved from main handler) ---async function getSessionBasedRecommendations(clientId, excludedProductIds, maxRecs) { const nowInSeconds = Math.floor(Date.now() / 1000); const timeCutoff = nowInSeconds - config.TIME_WINDOW_SECONDS; const viewEvents = await redisClient.zRangeByScore( `session:${clientId}:views`, timeCutoff, '+inf', 'WITHSCORES' ); const productScores = {}; for (let i = 0; i < viewEvents.length; i += 2) { const productId = parseInt(viewEvents[i], 10); const timestamp = parseInt(viewEvents[i + 1], 10); if (!isNaN(productId) && !isNaN(timestamp)) { const score = getDecayedScore(timestamp, config.VIEW_WEIGHT, nowInSeconds); productScores[productId] = (productScores[productId] || 0) + score; } } // Add scoring for ATC from Redis if you implemented storing it separately // const atcEvents = await redisClient.zRangeByScore(...); // for(...) { ... apply config.ADD_TO_CART_WEIGHT ... } const scoredProducts = Object.entries(productScores) .map(([productIdStr, score]) => ({ productId: parseInt(productIdStr, 10), score: score })) .filter(item => item.score > 0) .filter(item => !excludedProductIds.has(item.productId)); scoredProducts.sort((a, b) => b.score - a.score); return scoredProducts.slice(0, maxRecs).map(item => item.productId);}// --- Placeholder/Example functions for Aggregate Data (These would query your DB tables or Redis caches) ---async function getOthersAlsoViewed(shopDomain, baseProductId, limit) { console.log(`Fetching 'Others Also Viewed' for ${baseProductId}`); // Example: Query DB, ordered by cooccurrence_count DESC // SELECT product_id_b FROM product_cooccurrences WHERE shop_domain = $1 AND product_id_a = $2 ORDER BY cooccurrence_count DESC LIMIT $3 // return db.query(...).then(res => res.rows.map(row => row.product_id_b)); return []; // Placeholder}async function getFrequentlyBoughtTogether(shopDomain, baseProductIds, limit) { console.log(`Fetching 'Frequently Bought Together' for products: ${baseProductIds.join(',')}`); // Example: Query DB, aggregate results for multiple base products, order by score // SELECT product_id_b, SUM(purchase_count) as total_score FROM frequently_bought_together WHERE shop_domain = $1 AND product_id_a = ANY($2::BIGINT[]) GROUP BY product_id_b ORDER BY total_score DESC LIMIT $3 // return db.query(...).then(res => res.rows.map(row => row.product_id_b)); return []; // Placeholder}async function getPopularProductIds(shopDomain, limit) { console.log(`Fetching 'Popular Products'`); // Example: Query DB or Redis cache of popular products // SELECT product_id FROM popular_products WHERE shop_domain = $1 ORDER BY score DESC LIMIT $2 // return db.query(...).then(res => res.rows.map(row => row.product_id)); // Fallback popular IDs - Replace with real data source! return [98765, 45678, 23456, 78901]; // Dummy popular IDs}// ... (rest of the recommendations route file)content_copydownloadUse code with caution.JavaScript5. Storefront Widget (Theme App Extension) (extensions/theme-app-extension/blocks/recommendations-block.liquid){% comment %} Schema now allows selecting recommendation type {% endcomment %}{% schema %}{ "name": "IntelliSuggest Recommendations", "target": "section", "settings": [ { "type": "text", "id": "title", "label": "Heading", "default": "Recommended for you" }, { "type": "range", "id": "limit", "min": 1, "max": 12, "step": 1, "label": "Number of products to show", "default": 4 }, { "type": "select", "id": "recommendation_type", "label": "Recommendation Type", "options": [ { "value": "session-views", "label": "Based on Recent Activity (Session)" }, { "value": "others-also-viewed", "label": "Customers who viewed this also viewed" }, { "value": "frequently-bought-together", "label": "Frequently Bought Together" }, { "value": "popular", "label": "Popular Products" } ], "default": "session-views", "info": "Choose the algorithm for this block. Availability depends on page context." } // Add more visual customization settings etc. ], "presets": [ { "name": "IntelliSuggest Recommendations" } ]}{% endschema %}<div class="intellisuggest-recommendations-block" data-client-id="{{ client_id }}"> <h2 class="intellisuggest-title">{{ block.settings.title }}</h2> <div class="intellisuggest-products-grid loading"> <!-- Products will be rendered here by JavaScript --> Loading recommendations... </div></div><script> // ... (get clientId, shopDomain, pageContext as before) ... // Function to fetch and render recommendations (Updated) async function fetchAndRenderRecommendations(clientId, shopDomain, pageContext, limit, recommendationType) { const container = document.querySelector('.intellisuggest-products-grid'); if (!container) return; container.innerHTML = 'Loading recommendations...'; container.classList.add('loading'); try { const response = await fetch('YOUR_APP_BACKEND_URL/api/recommendations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId: clientId, shopDomain: shopDomain, pageContext: pageContext, limit: limit, recommendationType: recommendationType // Pass the selected type }), }); if (!response.ok) { throw new Error(`HTTP error! status: ${response.status}`); } const data = await response.json(); const recommendedProductIds = data.recommendedProductIds; // Still expecting IDs container.classList.remove('loading'); if (!recommendedProductIds || recommendedProductIds.length === 0) { container.innerHTML = 'No recommendations found.'; return; } // --- Fetch Product Details using Storefront API --- // Implement this robustly to fetch title, image, price, handle etc. // Example placeholder using dummy data or assuming fetched details are returned: // const productDetails = data.recommendedProducts || await fetchProductDetailsFromShopifyStorefront(recommendedProductIds); // Example Rendering loop (replace with your actual rendering logic) container.innerHTML = ''; // Loop through productDetails or recommendedProductIds recommendedProductIds.forEach(productId => { // Using just IDs for simplicity const productCardHtml = ` <div class="intellisuggest-product-card"> <!-- Replace with actual product data --> <p>Product ID: ${productId}</p> <a href="/products/${productId}">View Product ${productId}</a> </div> `; container.innerHTML += productCardHtml; }); // --- Analytics Tracking (Phase 3) --- // Track impression when products are successfully rendered // trackRecommendationImpression(clientId, shopDomain, pageContext, recommendedProductIds); } catch (error) { console.error('Error fetching and rendering recommendations:', error); container.classList.remove('loading'); container.innerHTML = 'Failed to load recommendations.'; } } // Add event listeners for tracking clicks (Phase 3) document.querySelector('.intellisuggest-products-grid').addEventListener('click', function(event) { const link = event.target.closest('a'); if (link && link.href.includes('/products/')) { const card = link.closest('.intellisuggest-product-card'); const productIdMatch = card.innerHTML.match(/Product ID: (\d+)/); // Extract ID from dummy HTML const clickedProductId = productIdMatch ? parseInt(productIdMatch[1], 10) : null; if (clickedProductId) { console.log('Recommendation clicked:', clickedProductId); // trackRecommendationClick(clientId, shopDomain, pageContext, clickedProductId, event.target); // Phase 3 analytics } } }); // Trigger fetch when the block loads if (clientId && clientId !== "") { fetchAndRenderRecommendations( clientId, shopDomain, pageContext, {{ block.settings.limit }}, "{{ block.settings.recommendation_type }}" // Pass the selected type from settings ); } else { console.warn("Client ID not available. Cannot load personalized recommendations."); const container = document.querySelector('.intellisuggest-products-grid'); if (container) { container.innerHTML = 'Cannot load personalized recommendations.'; } }</script><style>/* Basic styling for the block */.intellisuggest-recommendations-block { margin: 20px 0; padding: 15px; border: 1px solid #eee;}.intellisuggest-title { margin-top: 0;}.intellisuggest-products-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); /* Responsive grid */ gap: 15px;}.intellisuggest-product-card { border: 1px solid #ddd; padding: 10px; text-align: center;}.intellisuggest-products-grid.loading { text-align: center; font-style: italic; color: #888;}</style>content_copydownloadUse code with caution.LiquidPhase 3: Refinement, Analytics & Merchant ValueGoal: Refine session scoring (add ATC). Implement hybrid recs (conceptual). Add analytics tracking.1. Backend: Worker (Scoring refinement)// backend/src/worker.js (Modification - Scoring in Worker is just for Redis cache structure)// ... (previous code) ... // --- Update Redis Session Cache --- try { const timestampInSeconds = Math.floor(new Date(event.timestamp).getTime() / 1000); if (event.eventName === 'product_viewed' && event.productId) { await redisClient.zAdd(`session:${event.clientId}:views`, { score: timestampInSeconds, member: event.productId.toString() }); await redisClient.zRemRangeByRank(`session:${event.clientId}:views`, 0, -config.MAX_SESSION_VIEWS - 1); console.log(`Redis: Added product ${event.productId} to views for ${event.clientId}`); } else if (event.eventName === 'product_added_to_cart' && event.productId) { // Store ATC events in a separate sorted set or list in Redis for scoring access await redisClient.zAdd(`session:${event.clientId}:atc`, { score: timestampInSeconds, member: event.productId.toString() }); // Optional: Trim ATC set // await redisClient.zRemRangeByRank(`session:${event.clientId}:atc`, 0, -config.MAX_SESSION_ATC - 1); console.log(`Redis: Added product ${event.productId} to ATC for ${event.clientId}`); // Also update the simple cart items set for quick exclusion checks await redisClient.sAdd(`session:${event.clientId}:cart`, event.productId.toString()); } // ... handle other events ... } catch (error) { console.error('Worker Error updating Redis:', error); // throw error; }// ... (rest of the worker setup)content_copydownloadUse code with caution.JavaScript2. Backend: Recommendation Logic Enhancements (backend/src/routes/recommendations.js)// backend/src/routes/recommendations.js (Modifications)// ... (previous imports and config)// --- Helper function for Session-Based Recommendations (Updated to include ATC) ---async function getSessionBasedRecommendations(clientId, excludedProductIds, maxRecs) { const nowInSeconds = Math.floor(Date.now() / 1000); const timeCutoff = nowInSeconds - config.TIME_WINDOW_SECONDS; const productScores = {}; // Map { productId: totalScore } // Fetch & Score View Events const viewEvents = await redisClient.zRangeByScore( `session:${clientId}:views`, timeCutoff, '+inf', 'WITHSCORES' ); for (let i = 0; i < viewEvents.length; i += 2) { const productId = parseInt(viewEvents[i], 10); const timestamp = parseInt(viewEvents[i + 1], 10); if (!isNaN(productId) && !isNaN(timestamp)) { const score = getDecayedScore(timestamp, config.VIEW_WEIGHT, nowInSeconds); productScores[productId] = (productScores[productId] || 0) + score; } } // Fetch & Score Add-to-Cart Events // Assumes ATC events are stored in Redis `session:<client_id>:atc` sorted set const atcEvents = await redisClient.zRangeByScore( `session:${clientId}:atc`, timeCutoff, '+inf', 'WITHSCORES' ); for (let i = 0; i < atcEvents.length; i += 2) { const productId = parseInt(atcEvents[i], 10); const timestamp = parseInt(atcEvents[i + 1], 10); if (!isNaN(productId) && !isNaN(timestamp)) { // ATC gets a higher weight const score = getDecayedScore(timestamp, config.ADD_TO_CART_WEIGHT, nowInSeconds); productScores[productId] = (productScores[productId] || 0) + score; } } const scoredProducts = Object.entries(productScores) .map(([productIdStr, score]) => ({ productId: parseInt(productIdStr, 10), score: score })) .filter(item => item.score > 0) .filter(item => !excludedProductIds.has(item.productId)); scoredProducts.sort((a, b) => b.score - a.score); return scoredProducts.slice(0, maxRecs).map(item => item.productId);}// --- Hybrid Recommendation Logic (Conceptual) ---async function getHybridRecommendations(shopDomain, clientId, pageContext, excludedProductIds, maxRecs) { console.log(`Fetching Hybrid Recommendations for ${clientId}`); const sessionRecs = await getSessionBasedRecommendations(clientId, excludedProductIds, maxRecs); // Get some session recs let aggregateRecs = []; // Choose which aggregate strategy to mix based on page context if (pageContext.type === 'product' && pageContext.productId) { aggregateRecs = await getOthersAlsoViewed(shopDomain, pageContext.productId, maxRecs + excludedProductIds.size); } else { aggregateRecs = await getPopularProductIds(shopDomain, maxRecs + excludedProductIds.size); } // Simple Hybrid Strategy: Combine and de-duplicate, prioritizing session recs const finalRecs = [...sessionRecs]; const finalRecsSet = new Set(sessionRecs); for (const aggRecId of aggregateRecs) { if (!finalRecsSet.has(aggRecId) && !excludedProductIds.has(aggRecId)) { finalRecs.push(aggRecId); finalRecsSet.add(aggRecId); // Add to set as well for O(1) lookup if (finalRecs.length >= maxRecs) break; // Stop if we hit limit } } return finalRecs.slice(0, maxRecs);}// --- Update the main /api/recommendations route to use hybrid type ---router.post('/recommendations', async (req, res) => { const { clientId, shopDomain, pageContext, limit, recommendationType } = req.body; const maxRecs = limit || config.MAX_RECOMMENDATIONS; // ... (parameter validation and exclusion logic as before) ... let recommendedProductIds = []; const excludedProductIds = new Set(); // Build exclusion set dynamically // ... (populate excludedProductIds with current product, cart items) ... try { switch (recommendationType) { case 'session-views': // Still support the basic type recommendedProductIds = await getSessionBasedRecommendations(clientId, excludedProductIds, maxRecs); break; case 'hybrid-product': // New Hybrid Type for product pages if (pageContext.type === 'product' && pageContext.productId) { recommendedProductIds = await getHybridRecommendations(shopDomain, clientId, pageContext, excludedProductIds, maxRecs); } else { console.warn(`Hybrid-product requested without product context for ${clientId}. Falling back.`); recommendedProductIds = await getPopularProductIds(shopDomain, maxRecs + excludedProductIds.size); recommendedProductIds = recommendedProductIds.filter(id => !excludedProductIds.has(id)).slice(0, maxRecs); } break; // Add cases for other hybrid types (e.g., hybrid-cart, hybrid-homepage) or keep other basic types case 'popular': const popular = await getPopularProductIds(shopDomain, maxRecs + excludedProductIds.size); recommendedProductIds = popular.filter(id => !excludedProductIds.has(id)).slice(0, maxRecs); break; default: console.warn(`Unknown/unsupported recommendation type: ${recommendationType} for ${clientId}. Falling back to hybrid.`); recommendedProductIds = await getHybridRecommendations(shopDomain, clientId, pageContext, excludedProductIds, maxRecs); if (recommendedProductIds.length === 0) { // If hybrid gives nothing, try popular console.warn("Hybrid fallback empty. Trying Popular."); const popular = await getPopularProductIds(shopDomain, maxRecs + excludedProductIds.size); recommendedProductIds = popular.filter(id => !excludedProductIds.has(id)).slice(0, maxRecs); } break; } // ... (Ensure maxRecs limit) ... // ... (Fetch product details) ... res.json({ recommendedProductIds: recommendedProductIds }); } catch (error) { console.error('Error fetching recommendations:', error); res.status(500).json({ error: 'Failed to fetch recommendations' }); }});// ... (Keep helper functions like getDecayedScore, getOthersAlsoViewed, getFrequentlyBoughtTogether, getPopularProductIds)content_copydownloadUse code with caution.JavaScript3. Backend: Analytics Endpoints (backend/src/routes/analytics.js)// backend/src/routes/analytics.jsconst express = require('express');const router = express.Router();const db = require('../db'); // Your DB connection// Table to store recommendation impressions and clicks/*CREATE TABLE recommendation_interactions ( id SERIAL PRIMARY KEY, shop_domain VARCHAR(255) NOT NULL, client_id VARCHAR(255) NOT NULL, timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(), event_type VARCHAR(50) NOT NULL, -- 'impression' or 'click' page_context JSONB, -- Context where recs were shown/clicked recommended_product_ids JSONB, -- Array of IDs shown (for impression) or clicked (single ID for click) source_recommendation_type VARCHAR(50), -- e.g., 'session-views', 'hybrid' clicked_product_id BIGINT, -- Specific product ID clicked (for click event) click_position INT -- Position in the list (for click event) -- Add other context like cart contents at time of interaction);CREATE INDEX idx_rec_interactions_client_timestamp ON recommendation_interactions (client_id, timestamp DESC);CREATE INDEX idx_rec_interactions_shop_type_timestamp ON recommendation_interactions (shop_domain, event_type, timestamp DESC);*/// Endpoint to receive analytics eventsrouter.post('/recommendation-analytics', async (req, res) => { const event = req.body; // Expecting { clientId, shopDomain, eventType, pageContext, ... } console.log(`Received analytics event: ${event.eventType} for ${event.clientId}`); if (!event.clientId || !event.shopDomain || !event.eventType) { // Use 200 OK even for malformed data if it's from `sendBeacon` // `sendBeacon` doesn't handle responses, fire-and-forget console.warn('Received incomplete analytics event data'); return res.status(200).json({ success: false, error: 'Incomplete data' }); } try { await db.query( `INSERT INTO recommendation_interactions ( shop_domain, client_id, timestamp, event_type, page_context, recommended_product_ids, source_recommendation_type, clicked_product_id, click_position ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`, [ event.shopDomain, event.clientId, new Date(), // Use backend timestamp event.eventType, event.pageContext ? JSON.stringify(event.pageContext) : null, event.recommendedProductIds ? JSON.stringify(event.recommendedProductIds) : null, // Array for impression, single ID for click event.sourceRecommendationType, event.clickedProductId, // For click event.clickPosition // For click ] ); console.log(`Analytics event ${event.eventType} saved.`); res.status(200).json({ success: true }); // Always respond 200 for sendBeacon compatibility } catch (error) { console.error('Error saving analytics event:', error); res.status(200).json({ success: false, error: 'Failed to save event' }); // Indicate failure but still 200 }});module.exports = router;content_copydownloadUse code with caution.JavaScript4. Storefront Widget (Theme App Extension) (extensions/theme-app-extension/blocks/recommendations-block.liquid){% comment %} Schema as before {% endcomment %}{% schema %} ... {% endschema %}<div class="intellisuggest-recommendations-block" data-client-id="{{ client_id }}" data-recommendation-type="{{ block.settings.recommendation_type }}"> <h2 class="intellisuggest-title">{{ block.settings.title }}</h2> <div class="intellisuggest-products-grid loading" data-block-id="{{ block.id }}"> <!-- Products will be rendered here by JavaScript --> Loading recommendations... </div></div><script> // ... (get clientId, shopDomain, pageContext as before) ... const recommendationsContainer = document.querySelector(`.intellisuggest-products-grid[data-block-id="{{ block.id }}"]`); const recommendationType = recommendationsContainer.dataset.recommendationType; // --- Analytics Tracking Functions (New) --- // Function to send analytics events using sendBeacon (preferred for page unload) function sendAnalyticsEvent(payload) { const url = 'YOUR_APP_BACKEND_URL/api/recommendation-analytics'; const blob = new Blob([JSON.stringify(payload)], {type : 'application/json'}); if (navigator.sendBeacon) { // sendBeacon returns true if the browser successfully queued the data const success = navigator.sendBeacon(url, blob); console.log(`Analytics sendBeacon status: ${success ? 'Queued' : 'Failed'} for ${payload.eventType}`); } else { // Fallback to fetch (less reliable on page unload) console.warn('sendBeacon not supported. Using fetch for analytics.'); fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), keepalive: true // Use keepalive with fetch if possible }).then(response => { console.log(`Analytics fetch status: ${response.ok ? 'OK' : response.status} for ${payload.eventType}`); }).catch(error => { console.error(`Analytics fetch failed for ${payload.eventType}:`, error); }); } } // Track when recommendations are displayed function trackRecommendationImpression(clientId, shopDomain, pageContext, recommendedProductIds, sourceRecommendationType) { const payload = { clientId: clientId, shopDomain: shopDomain, eventType: 'impression', pageContext: pageContext, recommendedProductIds: recommendedProductIds, // Array of IDs shown sourceRecommendationType: sourceRecommendationType }; sendAnalyticsEvent(payload); } // Track when a recommendation is clicked function trackRecommendationClick(clientId, shopDomain, pageContext, clickedProductId, clickedPosition, sourceRecommendationType) { const payload = { clientId: clientId, shopDomain: shopDomain, eventType: 'click', pageContext: pageContext, clickedProductId: clickedProductId, // Single clicked ID clickPosition: clickedPosition, // Position in the list (0-indexed) sourceRecommendationType: sourceRecommendationType, // You might also include the *entire list* of recommendedProductIds that were shown at the time // for more sophisticated analysis, but keep payload size in mind. }; sendAnalyticsEvent(payload); } // Function to fetch and render recommendations (Updated to call tracking) async function fetchAndRenderRecommendations(clientId, shopDomain, pageContext, limit, recommendationType) { const container = recommendationsContainer; // Use the element found by block ID if (!container) return; container.innerHTML = 'Loading recommendations...'; container.classList.add('loading'); try { const response = await fetch('YOUR_APP_BACKEND_URL/api/recommendations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId: clientId, shopDomain: shopDomain, pageContext: pageContext, limit: limit, recommendationType: recommendationType }), }); if (!response.ok) { throw new Error(`HTTP error! status: ${response.status}`); } const data = await response.json(); const recommendedProductIds = data.recommendedProductIds; container.classList.remove('loading'); if (!recommendedProductIds || recommendedProductIds.length === 0) { container.innerHTML = 'No recommendations found.'; return; } // --- Render Products (using fetched details) --- container.innerHTML = ''; // Clear loading state // Assume you have product details and render loop here... recommendedProductIds.forEach((productId, index) => { // Add index for position const productCardHtml = ` <div class="intellisuggest-product-card" data-product-id="${productId}" data-position="${index}"> <!-- Replace with actual product data --> <p>Product ID: ${productId}</p> <a href="/products/${productId}">View Product ${productId}</a> </div> `; container.innerHTML += productCardHtml; }); // --- Track Impression (New) --- trackRecommendationImpression(clientId, shopDomain, pageContext, recommendedProductIds, recommendationType); } catch (error) { console.error('Error fetching and rendering recommendations:', error); container.classList.remove('loading'); container.innerHTML = 'Failed to load recommendations.'; } } // Add event listeners for tracking clicks // Use event delegation on the container recommendationsContainer.addEventListener('click', function(event) { const link = event.target.closest('a'); const card = event.target.closest('.intellisuggest-product-card'); if (link && card && link.href.includes('/products/')) { const clickedProductId = parseInt(card.dataset.productId, 10); const clickedPosition = parseInt(card.dataset.position, 10); const sourceRecommendationType = recommendationsContainer.dataset.recommendationType; if (!isNaN(clickedProductId) && !isNaN(clickedPosition)) { console.log(`Recommendation clicked: ${clickedProductId} at position ${clickedPosition}`); trackRecommendationClick(clientId, shopDomain, pageContext, clickedProductId, clickedPosition, sourceRecommendationType); } } }); // Trigger fetch when the block loads if (clientId && clientId !== "") { fetchAndRenderRecommendations( clientId, shopDomain, pageContext, {{ block.settings.limit }}, "{{ block.settings.recommendation_type }}" ); } else { console.warn("Client ID not available. Cannot load personalized recommendations."); const container = recommendationsContainer; if (container) { container.innerHTML = 'Cannot load personalized recommendations.'; container.classList.remove('loading'); } }</script><style> /* Basic styling as before */ ... </style>content_copydownloadUse code with caution.LiquidThese snippets demonstrate the core logic and data flow through the phases. Remember that building a production app requires much more: robust error handling, input validation, authentication/authorization, logging, configuration management, background job monitoring, and a user-friendly Admin UI. But this structure provides a solid foundation for building your personalized recommendation app.




/ Second part of prospoal
# App Name: IntelliSuggest - Personalized Product Recommendations

## Vision

To empower Shopify merchants with a powerful yet simple-to-use application that harnesses real-time user behavior via Web Pixels and robust data processing to deliver highly relevant, personalized product recommendations, significantly boosting conversion rates and average order value.

## Core Principles

*   **User-Centric Personalization:** Recommendations are deeply tailored to individual user behavior and session context.
*   **Performance & Speed:** Recommendations are delivered near-instantly by leveraging fast data stores and efficient algorithms.
*   **Intelligent Hybrid Approach:** Combine immediate session intent with powerful historical insights for optimal relevance.
*   **Effectiveness & Measurability:** Focus on algorithms that drive sales and provide clear analytics to demonstrate impact.
*   **Effortless Merchant Experience:** Simple installation, intuitive configuration via Theme Editor, and a clear Admin Dashboard.
*   **Privacy by Design:** Fully utilizes Shopify's Web Pixel privacy framework and built with data minimization in mind.
*   **Scalability:** Designed to handle high volumes of real-time events from growing stores.

## Underlying Logic & Architecture

IntelliSuggest employs a hybrid architecture:

1.  **Real-time Event Capture:** Shopify's Web Pixel Extension efficiently collects user interaction data (`product_viewed`, `add_to_cart`, `checkout_completed`, etc.) directly from the browser, respecting customer consent.
2.  **Asynchronous Ingestion:** Events are sent to a fast, non-blocking backend endpoint which immediately queues them for processing. This prevents data loss under heavy traffic.
3.  **Fast Session Cache (Redis):** A dedicated in-memory store holds recent session activity (`client_id`'s last N views, cart contents). This enables near-instant retrieval of data needed for path-based recommendations.
4.  **Persistent Data Store (Database):** All raw events are stored long-term for historical analysis and building robust aggregate models.
5.  **Offline Aggregate Processing:** Background workers periodically analyze the historical data to compute store-wide trends ("Others Also Viewed," "Frequently Bought Together," "Popular"). These results are cached for fast lookup.
6.  **Recommendation Engine:** The core logic combines real-time session data (queried from Redis) with pre-computed aggregate data (queried from cache/DB) based on configurable strategies.
7.  **Storefront Widget:** A Theme App Extension (App Embed Block) provides a seamless way for merchants to add recommendation sections via the Theme Editor. JavaScript within the block calls the backend recommendation endpoint and renders the results using the Shopify Storefront API.
8.  **Analytics & Attribution:** Tracking impressions and clicks on recommendations, coupled with backend analysis, provides merchants with clear insights into the app's performance and sales uplift.

## Roadmap Phases

### Phase 0: Foundation & MVP (Weeks 1-3)

*   **Goal:** Establish core app infrastructure, receive initial data, and display a basic, non-personalized placeholder.
*   **Key Features/Logic:**
    *   Shopify App Authentication (OAuth).
    *   Web Pixel Extension deployment.
    *   Basic event ingestion endpoint.
    *   Initial data storage.
    *   Theme App Extension (App Embed Block) for storefront placement.
*   **Tasks:**
    *   Create app and configure OAuth.
    *   Generate and deploy Web Pixel Extension.
    *   Implement Web Pixel code to subscribe to `product_viewed` and send `clientId`, `shopDomain`, `timestamp`, `productId` to backend via `fetch` with `keepalive`.
    *   Create backend `/api/web-pixel-ingest` endpoint (Node.js/Express).
    *   Setup primary database (PostgreSQL/MongoDB).
    *   Implement initial event saving to a `raw_events` table.
    *   Generate and deploy Theme App Extension (`theme-app-extension`).
    *   Define App Embed Block schema with basic settings (title, limit).
    *   Implement storefront JS in the block to get basic context (`clientId`, `pageType`, `productId`) and call a *dummy* `/api/recommendations` endpoint.
    *   Implement a dummy `/api/recommendations` endpoint that returns fixed/test product IDs.
    *   Implement basic rendering of dummy product IDs in the storefront block.
    *   Build basic Admin UI status page.

*   **Code Snippet Example (Web Pixel `product_viewed`):**
    ```javascript
    // extensions/web-pixel-extension/src/index.js
    import { analytics } from '@shopify/web-pixels-extension';

    analytics.subscribe('product_viewed', async (event) => {
      const payload = { /* ... extract basic data ... */ };
      try {
        // YOUR_APP_BACKEND_URL/api/web-pixel-ingest
        await fetch('...', { method: 'POST', body: JSON.stringify(payload), keepalive: true });
      } catch (error) { console.error('...', error); }
    });
    ```

### Phase 1: Core Session-Based Recommendations (Weeks 4-8)

*   **Goal:** Implement fast, personalized recommendations based on the user's current session path. Display actual product details.
*   **Key Features/Logic:**
    *   Asynchronous event processing via a Message Queue.
    *   Redis session cache (`session:<client_id>:views`).
    *   Session-based scoring algorithm (recency-weighted `product_viewed`).
    *   Shopify Storefront API integration to fetch product details.
*   **Tasks:**
    *   Integrate a Message Queue (e.g., BullMQ) with Redis.
    *   Modify `/api/web-pixel-ingest` to push events to the queue.
    *   Implement worker process(es) to:
        *   Consume events from the queue.
        *   Save events to the main `events` table (more structured than `raw_events`).
        *   Update Redis Sorted Set (`session:<client_id>:views`) with `product_id` (member) and `timestamp` (score). Implement pruning (ZREMRANGEBYRANK) to limit set size.
    *   Build the *real* `/api/recommendations` endpoint:
        *   Receive `clientId`, `shopDomain`, `pageContext` (including `currentProductId`), `limit`.
        *   Query Redis (`ZREVRANGEBYSCORE`) for `session:<client_id>:views` within a time window (e.g., 1 hour).
        *   Calculate product scores based on `product_viewed` events and **exponential recency decay** (`score = weight * e^(-λ * time_difference)`).
        *   Filter out the `currentProductId` and items from the Redis cart cache (`session:<client_id>:cart` - added in Phase 2).
        *   Sort products by score and select top N IDs.
    *   Enhance Theme App Extension block JS:
        *   Pass correct context to `/api/recommendations`.
        *   Fetch product details using the Shopify Storefront API based on received IDs.
        *   Render product cards (image, title, price, link) using fetched data.
    *   Add Admin UI settings for session recommendation parameters (time window, max recs).

*   **Code Snippet Example (Worker updating Redis Session Views):**
    ```javascript
    // backend/src/worker.js (snippet)
    eventQueue.process('processEvent', async (job) => {
      const event = job.data;
      const timestampInSeconds = Math.floor(new Date(event.timestamp).getTime() / 1000);

      if (event.eventName === 'product_viewed' && event.productId) {
        // Add to the sorted set: productId as member, timestamp as score
        await redisClient.zAdd(`session:${event.clientId}:views`, { score: timestampInSeconds, member: event.productId.toString() });
        // Trim the set to keep only the most recent N views
        await redisClient.zRemRangeByRank(`session:${event.clientId}:views`, 0, -config.MAX_SESSION_VIEWS - 1);
      }
      // ... handle other events (Phase 2) ...
    });
    ```
*   **Code Snippet Example (Recency Scoring Logic - simplified):**
     ```javascript
     // backend/src/routes/recommendations.js (snippet)
     function getDecayedScore(timestampSeconds, baseWeight, nowSeconds) {
         const timeDiffSeconds = nowSeconds - timestampSeconds;
         if (timeDiffSeconds < 0) return 0;
         const decayFactor = Math.exp(-config.DECAY_LAMBDA * timeDiffSeconds);
         return baseWeight * decayFactor;
     }

     async function getSessionBasedRecommendations(...) {
         // ... fetch viewEvents from Redis ZRANGEBYSCORE ...
         const productScores = {};
         for (let i = 0; i < viewEvents.length; i += 2) {
             const productId = parseInt(viewEvents[i], 10);
             const timestamp = parseInt(viewEvents[i + 1], 10);
             const score = getDecayedScore(timestamp, config.VIEW_WEIGHT, nowInSeconds);
             productScores[productId] = (productScores[productId] || 0) + score;
         }
         // ... (process other events like ATC - Phase 3) ...
         // ... filter, sort, return top IDs ...
     }
     ```

### Phase 2: Expanding Data & Aggregate Recommendations (Weeks 9-14)

*   **Goal:** Track more user actions and introduce recommendations based on store-wide historical data. Allow merchants to choose recommendation types via the Theme Editor.
*   **Key Features/Logic:**
    *   Tracking `add_to_cart`, `checkout_completed`, `search_submitted` via Web Pixel.
    *   Redis Cart Cache (`session:<client_id>:cart`).
    *   Offline workers for calculating aggregate models ("Others Also Viewed," "Frequently Bought Together," "Popular Products").
    *   Database tables/Redis caches for aggregate data.
    *   Recommendation endpoint handles multiple algorithm types.
    *   Theme App Extension block settings for selecting algorithm type.
*   **Tasks:**
    *   Modify Web Pixel to subscribe to and send `add_to_cart`, `checkout_completed`, `search_submitted` events with relevant data.
    *   Update ingestion endpoint and worker to handle new event types.
    *   Worker updates Redis Set (`session:<client_id>:cart`) for items added/removed from cart.
    *   Implement offline batch worker(s) to process historical DB data:
        *   Analyze sessions to build "Others Also Viewed" co-occurrence data (`product_cooccurrences` table/cache).
        *   Analyze orders (`checkout_completed` events) to build "Frequently Bought Together" data (`frequently_bought_together` table/cache).
        *   Calculate store-wide "Popular Products" (based on views, sales, etc.) and cache (`popular_products` table/cache).
    *   Enhance `/api/recommendations` endpoint:
        *   Accept a `recommendationType` parameter from the storefront.
        *   Implement logic to query the appropriate data source based on `recommendationType` and `pageContext`:
            *   `session-views`: Query Redis (as in Phase 1).
            *   `others-also-viewed`: Query aggregate cache/DB (needs `currentProductId`).
            *   `frequently-bought-together`: Query aggregate cache/DB (needs cart items or `currentProductId`).
            *   `popular`: Query aggregate cache/DB.
        *   Ensure exclusions (current product, cart items) are applied correctly for all types.
    *   Enhance Theme App Extension block schema to add a `select` setting for `recommendation_type`.
    *   Update storefront JS to pass the selected `recommendation_type` to the backend request.
    *   Begin designing Admin UI pages for settings and data overview.

*   **Code Snippet Example (Recommendation Endpoint Type Switching):**
    ```javascript
    // backend/src/routes/recommendations.js (snippet)
    router.post('/recommendations', async (req, res) => {
        const { clientId, shopDomain, pageContext, limit, recommendationType } = req.body;
        // ... (get exclusions) ...

        let recommendedProductIds = [];
        switch (recommendationType) {
            case 'session-views':
                recommendedProductIds = await getSessionBasedRecommendations(clientId, excludedProductIds, maxRecs);
                break;
            case 'others-also-viewed':
                 if (pageContext.type === 'product' && currentProductId) {
                    recommendedProductIds = await getOthersAlsoViewed(shopDomain, currentProductId, maxRecs + excludedProductIds.size);
                    recommendedProductIds = recommendedProductIds.filter(...).slice(...);
                 } else { /* fallback */ }
                break;
            case 'frequently-bought-together':
                 if (cartProductIds.size > 0 || (pageContext.type === 'product' && currentProductId)) {
                     // ... query aggregate data based on cart or product ...
                 } else { /* fallback */ }
                 break;
            case 'popular':
                 recommendedProductIds = await getPopularProductIds(shopDomain, maxRecs + excludedProductIds.size);
                 recommendedProductIds = recommendedProductIds.filter(...).slice(...);
                 break;
            default: /* fallback */ break;
        }
        // ... (fetch details, return) ...
    });
    ```
*   **Code Snippet Example (Theme Block Schema Select):**
    ```liquid
    {% schema %}
    {
      // ... other settings ...
      "settings": [
        // ... title, limit ...
        {
          "type": "select",
          "id": "recommendation_type",
          "label": "Recommendation Type",
          "options": [
            { "value": "session-views", "label": "Based on Recent Activity (Session)" },
            { "value": "others-also-viewed", "label": "Customers who viewed this also viewed" },
            // ... other options ...
          ],
          "default": "session-views"
        }
      ]
      // ... presets ...
    }
    {% endschema %}
    ```

### Phase 3: Refinement, Analytics & Merchant Value (Weeks 15-20)

*   **Goal:** Improve algorithm effectiveness with hybrid approaches, provide actionable analytics to merchants, and solidify ease of use.
*   **Key Features/Logic:**
    *   Refined session scoring (incorporate `add_to_cart` weight).
    *   Hybrid recommendation strategies (combining session and aggregate results).
    *   Frontend tracking of recommendation impressions and clicks using `sendBeacon`.
    *   Backend storage of analytics data (`recommendation_interactions` table).
    *   Admin Dashboard displaying key metrics (CTR, attributed sales uplift).
*   **Tasks:**
    *   Update session scoring logic in `/api/recommendations` to include a higher weight for `product_added_to_cart` events from Redis cache.
    *   Implement a **Hybrid Recommendation** function that combines results from `getSessionBasedRecommendations` and relevant aggregate lookups (e.g., `getOthersAlsoViewed` on product page, `getPopularProductIds` elsewhere). Define rules for merging/re-ranking.
    *   Add a `hybrid` option to the Theme App Extension block `recommendation_type` setting.
    *   Implement frontend JS in the block to use `navigator.sendBeacon` (with fetch fallback) to send:
        *   `impression` events when recommendations are displayed (list of IDs, type, context).
        *   `click` events when a recommended product link is clicked (clicked ID, position, type, context).
    *   Create a backend endpoint (`/api/recommendation-analytics`) to receive and save these analytics events to the `recommendation_interactions` table.
    *   Develop the Admin Dashboard UI using Polaris:
        *   Display charts/stats for total events, recs shown, clicks, CTR per recommendation type and placement.
        *   Implement backend logic to analyze `recommendation_interactions` and `events` data to **attribute conversions** (e.g., order placed within X minutes/steps after clicking a recommendation). Display attributed revenue/orders.
    *   Refine Theme App Extension styling and layout flexibility.
    *   Write comprehensive app documentation and onboarding guide.

*   **Code Snippet Example (Tracking Impression via `sendBeacon`):**
     ```javascript
     // extensions/theme-app-extension/blocks/recommendations-block.liquid (snippet)
     function sendAnalyticsEvent(payload) {
         const url = 'YOUR_APP_BACKEND_URL/api/recommendation-analytics';
         const blob = new Blob([JSON.stringify(payload)], {type : 'application/json'});
         if (navigator.sendBeacon) {
             navigator.sendBeacon(url, blob);
         } else {
             fetch(url, { method: 'POST', body: JSON.stringify(payload), keepalive: true });
         }
     }

     function trackRecommendationImpression(clientId, shopDomain, pageContext, recommendedProductIds, sourceRecommendationType) {
         const payload = { clientId, shopDomain, eventType: 'impression', pageContext, recommendedProductIds, sourceRecommendationType };
         sendAnalyticsEvent(payload);
     }
     // ... (call trackRecommendationImpression after successful render) ...
     ```
*   **Code Snippet Example (Tracking Click with Delegation):**
     ```javascript
     // extensions/theme-app-extension/blocks/recommendations-block.liquid (snippet)
     recommendationsContainer.addEventListener('click', function(event) {
        const link = event.target.closest('a');
        const card = event.target.closest('.intellisuggest-product-card'); // Assuming cards have this class

        if (link && card && link.href.includes('/products/')) {
            const clickedProductId = parseInt(card.dataset.productId, 10); // Get ID from data attribute
            const clickedPosition = parseInt(card.dataset.position, 10); // Get position from data attribute
            const sourceRecommendationType = recommendationsContainer.dataset.recommendationType;

            if (!isNaN(clickedProductId) && !isNaN(clickedPosition)) {
                trackRecommendationClick(clientId, shopDomain, pageContext, clickedProductId, clickedPosition, sourceRecommendationType);
            }
        }
     });

     function trackRecommendationClick(clientId, shopDomain, pageContext, clickedProductId, clickedPosition, sourceRecommendationType) {
          const payload = { clientId, shopDomain, eventType: 'click', pageContext, clickedProductId, clickPosition, sourceRecommendationType };
          sendAnalyticsEvent(payload);
     }
     ```

### Phase 4: Growth & Advanced Features (Ongoing)

*   **Goal:** Continuously improve algorithms, expand features, and enhance merchant control and insights.
*   **Key Features/Logic:**
    *   User-based collaborative filtering (linking `clientId` and `customerId`).
    *   Content-based filtering (using product attributes like tags, type, description).
    *   Advanced hybrid models (potentially using machine learning).
    *   Expanded placement options (homepage sections, search results, etc.).
    *   More granular controls and filtering for merchants.
    *   A/B Testing framework.
*   **Tasks:**
    *   Develop logic to link anonymous `clientId` history with `customerId` history when users log in, building richer long-term user profiles.
    *   Implement content-based similarity calculations (offline).
    *   Develop user-based collaborative filtering algorithms (offline processing).
    *   Explore machine learning techniques for predicting click-through or conversion probability.
    *   Create new Theme App Extension blocks or update existing ones for different placements (e.g., a block specifically for the cart page that defaults to FBT, a block for search results).
    *   Add advanced filtering options in block settings (e.g., exclude products with specific tags, limit recommendations to a certain collection).
    *   Build an in-app A/B testing capability to allow merchants to compare different recommendation types or settings.
    *   Continuously monitor performance metrics and iterate on algorithms.
    *   Explore integrating with other Shopify features or popular apps.

This detailed roadmap, incorporating the logic and code snippets, provides a clear path for building a powerful and user-friendly personalized recommendation app for Shopify. Remember to implement robust error handling, logging, and security measures throughout development.