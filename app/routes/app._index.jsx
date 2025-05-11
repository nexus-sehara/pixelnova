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
  await authenticate.admin(request);

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

  // --- Web Pixel Activation State ---
  const [pixelStatus, setPixelStatus] = useState("INACTIVE");
  const [pixelLoading, setPixelLoading] = useState(false);
  const [pixelError, setPixelError] = useState("");
  const [pixelSuccess, setPixelSuccess] = useState("");
  // --- End Web Pixel Activation State ---

  // --- Product Sync State ---
  const [syncStatusMessage, setSyncStatusMessage] = useState("");
  // --- End Product Sync State ---

  useEffect(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("pixelStatus");
      if (stored) setPixelStatus(stored);
    }
  }, []);

  useEffect(() => {
    if (productId) {
      shopify.toast.show("Product created");
    }
  }, [productId, shopify]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("pixelStatus");
      if (stored) {
        setPixelStatus(stored);
      }
      // Always check current status from API on load,
      // as localStorage might be stale or pixel deactivated elsewhere.
      checkPixelStatus();
    }
  }, []); // Empty dependency array ensures this runs once on mount

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

  const checkPixelStatus = async () => {
    try {
      const res = await fetch("/api/activate-webpixel", { 
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        credentials: "include"
      });
      
      if (res.ok) {
        const data = await res.json();
        if (data.status === "ACTIVE") {
          setPixelStatus("ACTIVE");
          if (typeof window !== "undefined") localStorage.setItem("pixelStatus", "ACTIVE");
        }
      }
    } catch (e) {
      console.error("Error checking pixel status:", e);
      // Don't show error to user on initial check
    }
  };

  const generateProduct = () => fetcher.submit({}, { method: "POST" });

  const handleSyncProducts = () => {
    setSyncStatusMessage("Initiating product sync...");
    fetcher.submit({ _action: "syncProducts" }, { method: "POST" });
  };

  // --- Web Pixel Activation Handler ---
  const activateWebPixel = async () => {
    setPixelLoading(true);
    setPixelError("");
    setPixelSuccess("");
    try {
      // Call backend API route for pixel activation with proper headers
      const res = await fetch("/api/activate-webpixel", { 
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // Include authentication headers
          "Accept": "application/json"
        },
        // Important: Include credentials to maintain the session
        credentials: "include"
      });
      const data = await res.json();
      if (data.status === "ACTIVE") {
        setPixelStatus("ACTIVE");
        if (typeof window !== "undefined") localStorage.setItem("pixelStatus", "ACTIVE");
        setPixelSuccess("Pixel activated successfully!");
      } else {
        setPixelError(data.error || "Failed to activate pixel.");
        console.error("Pixel activation error:", data);
      }
    } catch (e) {
      console.error("Pixel activation exception:", e);
      setPixelError("Unexpected error activating pixel: " + (e.message || e));
    } finally {
      setPixelLoading(false);
    }
  };
  // --- End Web Pixel Activation Handler ---

  return (
    <Page>
      <TitleBar title="Remix app template">
        <button variant="primary" onClick={generateProduct}>
          Generate a product
        </button>
      </TitleBar>
      <BlockStack gap="500">
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="500">
                <BlockStack gap="200">
                  <Text as="h2" variant="headingMd">
                    Congrats on creating a new Shopify app 🎉
                  </Text>
                  <Text variant="bodyMd" as="p">
                    This embedded app template uses{" "}
                    <Link
                      url="https://shopify.dev/docs/apps/tools/app-bridge"
                      target="_blank"
                      removeUnderline
                    >
                      App Bridge
                    </Link>{" "}
                    interface examples like an{" "}
                    <Link url="/app/additional" removeUnderline>
                      additional page in the app nav
                    </Link>
                    , as well as an{" "}
                    <Link
                      url="https://shopify.dev/docs/api/admin-graphql"
                      target="_blank"
                      removeUnderline
                    >
                      Admin GraphQL
                    </Link>{" "}
                    mutation demo, to provide a starting point for app
                    development.
                  </Text>
                </BlockStack>
                <BlockStack gap="200">
                  <Text as="h3" variant="headingMd">
                    Get started with products
                  </Text>
                  <Text as="p" variant="bodyMd">
                    Generate a product with GraphQL and get the JSON output for
                    that product. Learn more about the{" "}
                    <Link
                      url="https://shopify.dev/docs/api/admin-graphql/latest/mutations/productCreate"
                      target="_blank"
                      removeUnderline
                    >
                      productCreate
                    </Link>{" "}
                    mutation in our API references.
                  </Text>
                </BlockStack>
                <InlineStack gap="300">
                  <Button loading={isLoadingProductGeneration} onClick={generateProduct}>
                    Generate a product
                  </Button>
                  {fetcher.data?.product && (
                    <Button
                      url={`shopify:admin/products/${productId}`}
                      target="_blank"
                      variant="plain"
                    >
                      View product
                    </Button>
                  )}
                  <Button
                    variant={pixelStatus === "ACTIVE" ? "success" : "primary"}
                    onClick={activateWebPixel}
                    loading={pixelLoading}
                    disabled={pixelStatus === "ACTIVE"}
                  >
                    {pixelStatus === "ACTIVE" ? "Pixel Active" : "Activate Web Pixel"}
                  </Button>
                  <Button
                    onClick={handleSyncProducts}
                    loading={isSyncingProducts}
                    disabled={isSyncingProducts}
                  >
                    Sync Product Data
                  </Button>
                </InlineStack>
                {pixelError && (
                  <Box color="critical" padding="200">{pixelError}</Box>
                )}
                {pixelSuccess && (
                  <Box color="success" padding="200">{pixelSuccess}</Box>
                )}
                {syncStatusMessage && (
                  <Box padding="200"
                       background={fetcher.data?.syncStatus === "error" ? "bg-surface-critical" : "bg-surface-success"}
                       borderColor={fetcher.data?.syncStatus === "error" ? "border-critical" : "border-success"}
                       borderWidth="025" borderRadius="200">
                    <Text as="p" variant="bodyMd" tone={fetcher.data?.syncStatus === "error" ? "critical" : "success"}>
                      {syncStatusMessage}
                    </Text>
                  </Box>
                )}
                {fetcher.data?.product && (
                  <>
                    <Text as="h3" variant="headingMd">
                      {" "}
                      productCreate mutation
                    </Text>
                    <Box
                      padding="400"
                      background="bg-surface-active"
                      borderWidth="025"
                      borderRadius="200"
                      borderColor="border"
                      overflowX="scroll"
                    >
                      <pre style={{ margin: 0 }}>
                        <code>
                          {JSON.stringify(fetcher.data.product, null, 2)}
                        </code>
                      </pre>
                    </Box>
                    <Text as="h3" variant="headingMd">
                      {" "}
                      productVariantsBulkUpdate mutation
                    </Text>
                    <Box
                      padding="400"
                      background="bg-surface-active"
                      borderWidth="025"
                      borderRadius="200"
                      borderColor="border"
                      overflowX="scroll"
                    >
                      <pre style={{ margin: 0 }}>
                        <code>
                          {JSON.stringify(fetcher.data.variant, null, 2)}
                        </code>
                      </pre>
                    </Box>
                  </>
                )}
              </BlockStack>
            </Card>
          </Layout.Section>
          <Layout.Section variant="oneThird">
            <BlockStack gap="500">
              <Card>
                <BlockStack gap="200">
                  <Text as="h2" variant="headingMd">
                    App template specs
                  </Text>
                  <BlockStack gap="200">
                    <InlineStack align="space-between">
                      <Text as="span" variant="bodyMd">
                        Framework
                      </Text>
                      <Link
                        url="https://remix.run"
                        target="_blank"
                        removeUnderline
                      >
                        Remix
                      </Link>
                    </InlineStack>
                    <InlineStack align="space-between">
                      <Text as="span" variant="bodyMd">
                        Database
                      </Text>
                      <Link
                        url="https://www.prisma.io/"
                        target="_blank"
                        removeUnderline
                      >
                        Prisma
                      </Link>
                    </InlineStack>
                    <InlineStack align="space-between">
                      <Text as="span" variant="bodyMd">
                        Interface
                      </Text>
                      <span>
                        <Link
                          url="https://polaris.shopify.com"
                          target="_blank"
                          removeUnderline
                        >
                          Polaris
                        </Link>
                        {", "}
                        <Link
                          url="https://shopify.dev/docs/apps/tools/app-bridge"
                          target="_blank"
                          removeUnderline
                        >
                          App Bridge
                        </Link>
                      </span>
                    </InlineStack>
                    <InlineStack align="space-between">
                      <Text as="span" variant="bodyMd">
                        API
                      </Text>
                      <Link
                        url="https://shopify.dev/docs/api/admin-graphql"
                        target="_blank"
                        removeUnderline
                      >
                        GraphQL API
                      </Link>
                    </InlineStack>
                  </BlockStack>
                </BlockStack>
              </Card>
              <Card>
                <BlockStack gap="200">
                  <Text as="h2" variant="headingMd">
                    Next steps
                  </Text>
                  <List>
                    <List.Item>
                      Build an{" "}
                      <Link
                        url="https://shopify.dev/docs/apps/getting-started/build-app-example"
                        target="_blank"
                        removeUnderline
                      >
                        {" "}
                        example app
                      </Link>{" "}
                      to get started
                    </List.Item>
                    <List.Item>
                      Explore Shopify's API with{" "}
                      <Link
                        url="https://shopify.dev/docs/apps/tools/graphiql-admin-api"
                        target="_blank"
                        removeUnderline
                      >
                        GraphiQL
                      </Link>
                    </List.Item>
                  </List>
                </BlockStack>
              </Card>
            </BlockStack>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}