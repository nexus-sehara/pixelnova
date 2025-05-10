import { register } from "@shopify/web-pixels-extension";

// Define the type for the event context for better type safety
interface EventContext {
  analytics: {
    subscribe: (eventName: string, callback: (event: any) => void) => void;
  };
  browser: any; // Add more specific types if known
  init: any;    // Add more specific types if known
  settings: any; // Add more specific types if known
}

// Define the type for the event data, can be more specific based on Shopify's event structure
interface ShopifyEvent {
  shop?: {
    domain?: string;
  };
  uniqueToken?: string;
  // Add other common event properties
  [key: string]: any; // Allow other properties
}

const NovaPixel = {
  init(context: EventContext) {
    // Subscribe to all major Shopify events
    
    // Page events
    context.analytics.subscribe('page_viewed', (event: ShopifyEvent) => {
      sendEventToBackend('page_viewed', event, context);
    });

    // Product events
    context.analytics.subscribe('product_viewed', (event: ShopifyEvent) => {
      sendEventToBackend('product_viewed', event, context);
    });
    
    context.analytics.subscribe('collection_viewed', (event: ShopifyEvent) => {
      sendEventToBackend('collection_viewed', event, context);
    });

    context.analytics.subscribe('search_submitted', (event: ShopifyEvent) => {
      sendEventToBackend('search_submitted', event, context);
    });

    context.analytics.subscribe('product_added_to_cart', (event: ShopifyEvent) => {
      sendEventToBackend('product_added_to_cart', event, context);
    });

    context.analytics.subscribe('product_removed_from_cart', (event: ShopifyEvent) => {
      sendEventToBackend('product_removed_from_cart', event, context);
    });

    // Cart events
    context.analytics.subscribe('cart_viewed', (event: ShopifyEvent) => {
      sendEventToBackend('cart_viewed', event, context);
    });

    // Checkout events
    context.analytics.subscribe('checkout_started', (event: ShopifyEvent) => {
      sendEventToBackend('checkout_started', event, context);
    });

    context.analytics.subscribe('checkout_contact_info_submitted', (event: ShopifyEvent) => {
      sendEventToBackend('checkout_contact_info_submitted', event, context);
    });

    context.analytics.subscribe('checkout_shipping_info_submitted', (event: ShopifyEvent) => {
      sendEventToBackend('checkout_shipping_info_submitted', event, context);
    });

    context.analytics.subscribe('checkout_payment_info_submitted', (event: ShopifyEvent) => {
      sendEventToBackend('checkout_payment_info_submitted', event, context);
    });

    context.analytics.subscribe('payment_info_submitted', (event: ShopifyEvent) => {
      sendEventToBackend('payment_info_submitted', event, context);
    });

    // Order events
    context.analytics.subscribe('checkout_completed', (event: ShopifyEvent) => {
      sendEventToBackend('checkout_completed', event, context);
    });

    // Customer account events
    context.analytics.subscribe('customer_account_created', (event: ShopifyEvent) => {
      sendEventToBackend('customer_account_created', event, context);
    });

    context.analytics.subscribe('customer_logged_in', (event: ShopifyEvent) => {
      sendEventToBackend('customer_logged_in', event, context);
    });
    
    context.analytics.subscribe('customer_logged_out', (event: ShopifyEvent) => {
      sendEventToBackend('customer_logged_out', event, context);
    });

    // Collection events
    context.analytics.subscribe('collection_filtered', (event: ShopifyEvent) => {
      sendEventToBackend('collection_filtered', event, context);
    });

    // Consent events (for GDPR compliance)
    context.analytics.subscribe('consent_updated', (event: ShopifyEvent) => {
      sendEventToBackend('consent_updated', event, context);
    });

    console.log('Nova Web Pixel initialized and subscribed to all major events.');
  }
};

register(NovaPixel.init);

/**
 * Send event data to your backend
 * @param {string} eventName - The name of the event
 * @param {ShopifyEvent} eventData - The event data from Shopify
 * @param {EventContext} context - The Shopify context object
 */
function sendEventToBackend(eventName: string, eventData: ShopifyEvent, context: EventContext) {
  // Add metadata to help with session tracking
  const enhancedEventData = {
    ...eventData,
    metadata: {
      timestamp: new Date().toISOString(),
      eventName: eventName,
      userAgent: navigator.userAgent,
      shopDomain: eventData.shop?.domain || '',
      uniqueToken: eventData.uniqueToken || '', // Ensure this aligns with Shopify's actual event structure for uniqueToken
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
    mode: 'cors', // Explicitly set CORS mode
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
