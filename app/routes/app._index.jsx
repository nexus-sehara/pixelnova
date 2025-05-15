import { useEffect, useState } from "react";
import { useFetcher } from "@remix-run/react";
import {
  Page,
  Layout,
  Text,
  Card,
  Button,
  BlockStack,
  Box,
  List,
  Link,
  InlineStack,
} from "@shopify/polaris";
import { TitleBar, useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { json } from "@remix-run/node";
import prisma from "../db.server";
import { syncAllProductMetadata } from "../lib/product-metadata.server.ts";

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);

  try {
    const webPixelSettings = {
      settings: {
        accountID: "PIXELNOVA_APP_ACCOUNT_V1",
      },
    };

    console.log(`[Loader] Attempting to create web pixel for shop: ${session.shop} with settings:`, webPixelSettings);

    const mutationResponse = await admin.graphql(
      `#graphql
        mutation webPixelCreate($webPixel: WebPixelInput!) {
          webPixelCreate(webPixel: $webPixel) {
            userErrors {
              field
              message
            }
            webPixel {
              settings
              id
            }
          }
        }
      `,
      {
        variables: {
          webPixel: webPixelSettings,
        },
      }
    );

    if (!mutationResponse.ok) {
      const errorBody = await mutationResponse.text();
      console.error(`[Loader] Web Pixel Create Mutation - Request failed. Status: ${mutationResponse.status}, Body: ${errorBody}`);
    } else {
      const responseJson = await mutationResponse.json();
      if (responseJson.data?.webPixelCreate?.webPixel?.id) {
        console.log(`[Loader] Web Pixel created/ensured successfully for shop ${session.shop}: ID ${responseJson.data.webPixelCreate.webPixel.id}`);
      } else if (responseJson.data?.webPixelCreate?.userErrors?.length > 0) {
        console.warn(`[Loader] Web Pixel creation for shop ${session.shop} had user errors:`, responseJson.data.webPixelCreate.userErrors);
        const alreadyExistsError = responseJson.data.webPixelCreate.userErrors.find(
          (err) => err.message.toLowerCase().includes("already has a web pixel") || err.message.toLowerCase().includes("has already been taken")
        );
        if (alreadyExistsError) {
          console.log(`[Loader] Web pixel already exists for shop ${session.shop}. No action needed.`);
        } else {
          console.error(`[Loader] Web Pixel creation failed with user errors for shop ${session.shop}:`, responseJson.data.webPixelCreate.userErrors);
        }
      } else {
        console.warn(`[Loader] Web Pixel creation response for shop ${session.shop} was OK, but no pixel ID or specific user errors returned:`, responseJson);
      }
    }
  } catch (error) {
    console.error(`[Loader] Error during web pixel creation attempt for shop ${session.shop}:`, error);
  }

  return null;
};

export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const actionType = formData.get("_action");

  if (actionType === "syncProducts") {
    try {
      const shop = await prisma.shop.findUnique({
        where: { domain: session.shop },
        select: { id: true }
      });

      if (!shop) {
        console.error(`[Sync Action] Shop not found in DB: ${session.shop}`);
        return json({ syncStatus: "error", message: "Shop not found in database." }, { status: 404 });
      }

      console.log(`[Sync Action] Starting product metadata sync for shop: ${session.shop} (ID: ${shop.id})`);
      await syncAllProductMetadata(admin, shop.id, session.shop);
      console.log(`[Sync Action] Completed product metadata sync for shop: ${session.shop}`);
      return json({ syncStatus: "completed", shop: session.shop });
    } catch (error) {
      console.error(`[Sync Action] Error during product metadata sync for shop ${session.shop}:`, error);
      return json({ syncStatus: "error", message: error.message || "Unknown error during sync." }, { status: 500 });
    }
  } else {
    const color = ["Red", "Orange", "Yellow", "Green"][
      Math.floor(Math.random() * 4)
    ];
    const response = await admin.graphql(
      `#graphql
        mutation populateProduct($product: ProductCreateInput!) {
          productCreate(product: $product) {
            product {
              id
              title
              handle
              status
              variants(first: 10) {
                edges {
                  node {
                    id
                    price
                    barcode
                    createdAt
                  }
                }
              }
            }
          }
        }`,
      {
        variables: {
          product: {
            title: `${color} Snowboard`,
          },
        },
      },
    );
    const responseJson = await response.json();
    const product = responseJson.data.productCreate.product;
    const variantId = product.variants.edges[0].node.id;
    const variantResponse = await admin.graphql(
      `#graphql
      mutation shopifyRemixTemplateUpdateVariant($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
        productVariantsBulkUpdate(productId: $productId, variants: $variants) {
          productVariants {
            id
            price
            barcode
            createdAt
          }
        }
      }`,
      {
        variables: {
          productId: product.id,
          variants: [{ id: variantId, price: "100.00" }],
        },
      },
    );
    const variantResponseJson = await variantResponse.json();

    return {
      product: responseJson.data.productCreate.product,
      variant: variantResponseJson.data.productVariantsBulkUpdate.productVariants,
    };
  }
};

export default function Index() {
  const fetcher = useFetcher();
  const shopify = useAppBridge();
  const isLoadingProductGeneration =
    fetcher.state === "submitting" &&
    fetcher.submission?.formData.get("_action") !== "syncProducts";
  
  const isSyncingProducts =
    fetcher.state === "submitting" &&
    fetcher.submission?.formData.get("_action") === "syncProducts";

  const productId = fetcher.data?.product?.id.replace(
    "gid://shopify/Product/",
    "",
  );

  // --- Product Sync State ---
  const [syncStatusMessage, setSyncStatusMessage] = useState("");
  // --- End Product Sync State ---

  useEffect(() => {
    if (productId) {
      shopify.toast.show("Product created");
    }
  }, [productId, shopify]);

  useEffect(() => {
    if (fetcher.data?.syncStatus) {
      if (fetcher.data.syncStatus === "completed") {
        shopify.toast.show(`Product metadata sync completed for ${fetcher.data.shop}.`);
        setSyncStatusMessage("Sync completed successfully.");
      } else if (fetcher.data.syncStatus === "error") {
        shopify.toast.show(`Product metadata sync failed: ${fetcher.data.message}`, { isError: true });
        setSyncStatusMessage(`Sync failed: ${fetcher.data.message}`);
      }
    }
  }, [fetcher.data, shopify]);

  const generateProduct = () => fetcher.submit({}, { method: "POST" });

  const handleSyncProducts = () => {
    setSyncStatusMessage("Initiating product sync...");
    fetcher.submit({ _action: "syncProducts" }, { method: "POST" });
  };

  return (
    <Page>
      <TitleBar title="PixelNova Dashboard">
      </TitleBar>
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="500">
              <BlockStack gap="200">
                <Text as="h2" variant="headingMd">
                  Welcome to PixelNova!
                </Text>
                <Text variant="bodyMd" as="p">
                  This is your dashboard for managing behavior-aware product recommendations.
                  The Web Pixel required for tracking user behavior should be automatically activated.
                </Text>
              </BlockStack>
              <InlineStack gap="300">
                <Button
                  variant="primary"
                  onClick={handleSyncProducts}
                  loading={isSyncingProducts}
                  disabled={isSyncingProducts || isLoadingProductGeneration}
                >
                  Sync Product Catalog
                </Button>
              </InlineStack>
              {syncStatusMessage && (
                <Text variant="bodyMd" as="p">{syncStatusMessage}</Text>
              )}
              {fetcher.data?.product && (
                <Box paddingBlockStart="200">
                  <Text as="h3" variant="headingSm">Generated Product:</Text>
                  <List>
                    <List.Item>ID: {productId}</List.Item>
                    <List.Item>Title: {fetcher.data.product.title}</List.Item>
                  </List>
                </Box>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>
        <Layout.Section variant="oneThird">
          <BlockStack gap="500">
            <Card>
              <BlockStack gap="200">
                <Text as="h2" variant="headingMd">
                  App Status
                </Text>
                <List>
                  <List.Item>Web Pixel: Auto-managed</List.Item>
                </List>
              </BlockStack>
            </Card>
            <Card>
              <BlockStack gap="200">
                <Text as="h2" variant="headingMd">
                  Next Steps & Information
                </Text>
                <List spacing="loose">
                  <List.Item>
                    Ensure your product catalog is synced using the button above.
                  </List.Item>
                  <List.Item>
                    User behavior on your storefront will now be tracked by the Web Pixel.
                  </List.Item>
                  <List.Item>
                    View insights and recommendations once enough data is collected.
                  </List.Item>
                  <List.Item>
                    For more details, visit our{" "}
                    <Link url="https://example.com/help" target="_blank" removeUnderline>
                      help documentation
                    </Link>
                    .
                  </List.Item>
                </List>
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}