export async function handler() {
  const shop = process.env.SHOPIFY_SHOP;
  const clientId = process.env.SHOPIFY_CLIENT_ID;
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;

  if (!shop || !clientId || !clientSecret) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "Missing required environment variables",
      }),
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
        body: JSON.stringify({
          error: "Failed to get access token",
          details: tokenData,
        }),
      };
    }

    const productsRes = await fetch(
      `https://${shop}/admin/api/2026-01/products.json`,
      {
        method: "GET",
        headers: {
          "X-Shopify-Access-Token": tokenData.access_token,
          "Content-Type": "application/json",
        },
      }
    );

    const productsData = await productsRes.json();

    if (!productsRes.ok) {
      return {
        statusCode: productsRes.status,
        body: JSON.stringify({
          error: "Failed to fetch products",
          details: productsData,
        }),
      };
    }

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(productsData),
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "Unexpected server error",
        message: error.message,
      }),
    };
  }
}
