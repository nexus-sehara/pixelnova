import { authenticate } from "../shopify.server";

export const action = async ({ request }) => {
  try {
    const { admin, session } = await authenticate.admin(request);
    
    // Ensure we have a valid session and admin API client
    if (!session?.shop) {
      console.error('Authentication failed: No shop in session');
      return new Response(
        JSON.stringify({ 
          status: "INACTIVE", 
          error: "Authentication failed: No shop in session. Please refresh the page and try again." 
        }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    console.log(`Processing web pixel request for shop: ${session.shop}`);

    try {
      // Skip checking for existing pixels and just try to create one directly
      const accountID = process.env.SHOPIFY_PIXEL_ACCOUNT_ID || "demo-account";
      
      // According to Shopify API, WebPixelInput doesn't accept "name" field
      const createMutation = `#graphql
        mutation webPixelCreate($input: WebPixelInput!) {
          webPixelCreate(webPixel: $input) {
            userErrors { field message }
            webPixel { id settings }
          }
        }
      `;
      
      // Correct structure for WebPixelInput - it only accepts "settings" field
      const variables = {
        input: {
          settings: { accountID: accountID }
        }
      };
      
      console.log(`Creating pixel for shop ${session.shop} with settings:`, variables);
      const createRes = await admin.graphql(createMutation, { variables });
      const createJson = await createRes.json();
      
      console.log("Shopify webPixelCreate response:", JSON.stringify(createJson, null, 2));
      
      // Check for successful creation
      if (createJson.data?.webPixelCreate?.webPixel?.id) {
        return new Response(
          JSON.stringify({ 
            status: "ACTIVE", 
            id: createJson.data.webPixelCreate.webPixel.id,
            message: "Web pixel created successfully!"
          }),
          { headers: { "Content-Type": "application/json" } }
        );
      }
      
      // Check for user errors
      if (createJson.data?.webPixelCreate?.userErrors?.length > 0) {
        const errorMessage = createJson.data.webPixelCreate.userErrors.map(e => e.message).join("; ");
        
        // If the error indicates the pixel already exists, consider it active
        if (errorMessage.includes("already exists")) {
          return new Response(
            JSON.stringify({
              status: "ACTIVE",
              message: "Web pixel is already active"
            }),
            { headers: { "Content-Type": "application/json" } }
          );
        }
        
        return new Response(
          JSON.stringify({
            status: "INACTIVE",
            error: `Activation failed: ${errorMessage}`,
            details: createJson.data.webPixelCreate.userErrors
          }),
          { headers: { "Content-Type": "application/json" } }
        );
      }
      
      // Handle unexpected response structure
      return new Response(
        JSON.stringify({
          status: "INACTIVE",
          error: "Unexpected API response structure. Please try again.",
          raw: createJson
        }),
        { headers: { "Content-Type": "application/json" } }
      );
    } catch (graphqlError) {
      console.error("GraphQL error:", graphqlError);
      
      // Check for specific error messages
      const errorMessage = graphqlError.message || "";
      
      if (errorMessage.includes("No web pixel was found for this app")) {
        // This is a Shopify platform limitation - the app needs a web pixel extension
        return new Response(
          JSON.stringify({ 
            status: "INACTIVE", 
            error: "Your app requires a web pixel extension. Please check your app configuration.",
            details: "This error occurs when Shopify doesn't recognize your app as having a web pixel extension."
          }),
          { headers: { "Content-Type": "application/json" } }
        );
      }
      
      // For other GraphQL errors
      return new Response(
        JSON.stringify({ 
          status: "INACTIVE", 
          error: `GraphQL error: ${errorMessage}`,
          stack: graphqlError.stack
        }),
        { headers: { "Content-Type": "application/json" } }
      );
    }
  } catch (err) {
    console.error("General error in web pixel activation:", err);
    return new Response(
      JSON.stringify({ 
        status: "INACTIVE", 
        error: `Error: ${err.message}. Please ensure you're logged in and try again.` 
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  }
};

export const loader = async () => {
  return new Response("Not allowed", { status: 405 });
};