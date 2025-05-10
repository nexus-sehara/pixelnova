import { register } from "@shopify/web-pixels-extension";

// Define the type for the event data, can be more specific based on Shopify's event structure
interface ShopifyEvent {
  // Add other common event properties
  [key: string]: any; // Allow other properties
}

const NovaPixel = {
  init(api: any) { 
    // Subscribe to all major Shopify events
    
    // Page events
    api.analytics.subscribe('page_viewed', (event: ShopifyEvent) => {
      sendEventToBackend('page_viewed', event, api); 
    });

    // Product events
    api.analytics.subscribe('product_viewed', (event: ShopifyEvent) => {
      sendEventToBackend('product_viewed', event, api);
    });
    
    api.analytics.subscribe('collection_viewed', (event: ShopifyEvent) => {
      sendEventToBackend('collection_viewed', event, api);
    });

    api.analytics.subscribe('search_submitted', (event: ShopifyEvent) => {
      sendEventToBackend('search_submitted', event, api);
    });

    api.analytics.subscribe('product_added_to_cart', (event: ShopifyEvent) => {
      sendEventToBackend('product_added_to_cart', event, api);
    });

    api.analytics.subscribe('product_removed_from_cart', (event: ShopifyEvent) => {
      sendEventToBackend('product_removed_from_cart', event, api);
    });

    // Cart events
    api.analytics.subscribe('cart_viewed', (event: ShopifyEvent) => {
      sendEventToBackend('cart_viewed', event, api);
    });

    // Checkout events
    api.analytics.subscribe('checkout_started', (event: ShopifyEvent) => {
      sendEventToBackend('checkout_started', event, api);
    });

    api.analytics.subscribe('checkout_contact_info_submitted', (event: ShopifyEvent) => {
      sendEventToBackend('checkout_contact_info_submitted', event, api);
    });

    api.analytics.subscribe('checkout_shipping_info_submitted', (event: ShopifyEvent) => {
      sendEventToBackend('checkout_shipping_info_submitted', event, api);
    });

    api.analytics.subscribe('checkout_payment_info_submitted', (event: ShopifyEvent) => {
      sendEventToBackend('checkout_payment_info_submitted', event, api);
    });

    api.analytics.subscribe('payment_info_submitted', (event: ShopifyEvent) => {
      sendEventToBackend('payment_info_submitted', event, api);
    });

    // Order events
    api.analytics.subscribe('checkout_completed', (event: ShopifyEvent) => {
      sendEventToBackend('checkout_completed', event, api);
    });

    // Customer account events
    api.analytics.subscribe('customer_account_created', (event: ShopifyEvent) => {
      sendEventToBackend('customer_account_created', event, api);
    });

    api.analytics.subscribe('customer_logged_in', (event: ShopifyEvent) => {
      sendEventToBackend('customer_logged_in', event, api);
    });
    
    api.analytics.subscribe('customer_logged_out', (event: ShopifyEvent) => {
      sendEventToBackend('customer_logged_out', event, api);
    });

    // Collection events
    api.analytics.subscribe('collection_filtered', (event: ShopifyEvent) => {
      sendEventToBackend('collection_filtered', event, api);
    });

    // Consent events (for GDPR compliance)
    api.analytics.subscribe('consent_updated', (event: ShopifyEvent) => {
      sendEventToBackend('consent_updated', event, api);
    });

    console.log('Nova Web Pixel initialized and subscribed to all major events.');
  }
};

register(NovaPixel.init);

/**
 * Send event data to your backend
 * @param {string} eventName - The name of the event
 * @param {ShopifyEvent} eventData - The event data from Shopify
 * @param {any} api - The Shopify API object (typed as 'any' for debugging)
 */
function sendEventToBackend(eventName: string, eventData: ShopifyEvent, api: any) { 
  // Add metadata to help with session tracking
  const enhancedEventData = {
    ...eventData,
    metadata: {
      timestamp: new Date().toISOString(),
      eventName: eventName,
      userAgent: api.browser?.userAgent?.() || globalThis.navigator?.userAgent || '', 
      shopDomain: api.shop?.domain || api.shop?.myshopifyDomain || '', 
      uniqueToken: api.session?.id || '',                                  
      // Add any other context data that might help with session identification
    }
  };

  // Send to your backend endpoint
  fetch('https://pixelnova.onrender.com/api/pixel-events', { 
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // You can add an API key for additional security if your backend expects it
      // 'X-API-Key': 'your-api-key-here',
    },
    body: JSON.stringify(enhancedEventData),
    mode: 'cors', 
    // Note: Keeping this simple, but in production consider handling
    // retry logic and connection issues more robustly
  })
  .then(response => {
    if (!response.ok) {
      console.error(`Failed to send event '${eventName}' to backend: ${response.status} ${response.statusText}`);
    } else {
      console.log(`Event '${eventName}' sent to backend successfully.`);
    }
  })
  .catch(error => {
    console.error(`Error sending event '${eventName}' to backend:`, error);
  });
}
