export async function handler() {
  const shop = process.env.SHOPIFY_SHOP;
  const clientId = process.env.SHOPIFY_CLIENT_ID;
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;

  const targetSku = "DUR-FF-001";

  if (!shop || !clientId || !clientSecret) {
    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify(
        {
          error: "Missing required environment variables",
        },
        null,
        2
      ),
    };
  }

  try {
    const tokenRes = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });

    const tokenData = await tokenRes.json();

    if (!tokenRes.ok || !tokenData.access_token) {
      return {
        statusCode: tokenRes.status,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
        },
        body: JSON.stringify(
          {
            error: "Failed to get access token",
            details: tokenData,
          },
          null,
          2
        ),
      };
    }

    const productsRes = await fetch(
      `https://${shop}/admin/api/2026-01/products.json`,
      {
        method: "GET",
        headers: {
          "X-Shopify-Access-Token": tokenData.access_token,
          "Content-Type": "application/json; charset=utf-8",
        },
      }
    );

    const productsData = await productsRes.json();

    if (!productsRes.ok) {
      return {
        statusCode: productsRes.status,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
        },
        body: JSON.stringify(
          {
            error: "Failed to fetch products",
            details: productsData,
          },
          null,
          2
        ),
      };
    }

    const products = productsData.products || [];

    let matchedItem = null;

    for (const product of products) {
      const variants = product.variants || [];

      for (const variant of variants) {
        if (variant.sku === targetSku) {
          matchedItem = {
            sku: variant.sku,
            title: product.title,
            variant_title: variant.title,
            stock: variant.inventory_quantity,
            product_id: product.id,
            variant_id: variant.id,
            product_handle: product.handle,
            updated_at: product.updated_at,
          };
          break;
        }
      }

      if (matchedItem) break;
    }

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify(
        {
          success: true,
          target_sku: targetSku,
          item: matchedItem,
        },
        null,
        2
      ),
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify(
        {
          error: "Unexpected server error",
          message: error.message,
        },
        null,
        2
      ),
    };
  }
}
