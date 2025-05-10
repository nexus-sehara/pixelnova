import { json } from "@remix-run/node";
import { checkPixelStatus, activatePixel, deactivatePixel } from "../../lib/shopify-pixel";

// GET: return { status: "activated" | "not_activated" | "error", error?: string }
export async function loader({ request }) {
  try {
    const status = await checkPixelStatus(request);
    return json({ status });
  } catch (err) {
    return json({ status: "error", error: err.message || "Unknown error" }, { status: 500 });
  }
}

// POST: body.intent = "activate" | "deactivate"
export async function action({ request }) {
  try {
    const { intent } = await request.json();
    if (intent === "activate") {
      await activatePixel(request);
    } else if (intent === "deactivate") {
      await deactivatePixel(request);
    } else {
      throw new Error("Unknown intent: " + intent);
    }
    const status = await checkPixelStatus(request);
    return json({ status });
  } catch (err) {
    return json({ status: "error", error: err.message || "Unknown error" }, { status: 500 });
  }
}
