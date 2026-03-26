export async function handler() {
  const shop = process.env.SHOPIFY_SHOP;
  const clientId = process.env.SHOPIFY_CLIENT_ID;
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;

  const targetSku = "DUR-FF-001";

  const LOCATION_MAP = {
    81993564354: "花蓮｜美崙起源",
    82225496258: "花蓮｜花創園區",
  };

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
         
