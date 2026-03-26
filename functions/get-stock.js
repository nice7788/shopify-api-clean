export async function handler() {
  const shop = process.env.SHOPIFY_SHOP;
  const clientId = process.env.SHOPIFY_CLIENT_ID;
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;

  const targetSku = "DUR-FF-001";

  const LOCATION_MAP = {
    81993564354: "花蓮｜美崙起源",
    82225496258: "花蓮｜花創園區",
  };

  function getStockStatus(available) {
    const qty = Number(available) || 0;

    if (qty <= 0) {
      return {
        status: "已售完",
        status_code: "sold_out",
        display_text: "已售完",
      };
    }

    if (qty <= 3) {
      return {
        status: "即將售完",
        status_code: "low_stock",
        display_text: `剩 ${qty} 盒`,
      };
    }

    return {
      status: "庫存充足",
      status_code: "in_stock",
      display_text: `剩 ${qty} 盒`,
    };
  }

  function getTotalStatus(total) {
    const qty = Number(total) || 0;

    if (qty <= 0) {
      return {
        status: "已售完",
        status_code: "sold_out",
        display_text: "全門市已售完",
      };
    }

    if (qty <= 3) {
      return {
        status: "即將售完",
        status_code: "low_stock",
        display_text: `全門市剩 ${qty} 盒`,
      };
    }

    return {
      status: "庫存充足",
      status_code: "in_stock",
      display_text: `全門市剩 ${qty} 盒`,
    };
  }

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
    // 1. 取得 access token
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

    const accessToken = tokenData.access_token;

    // 2. 抓商品資料
    const productsRes = await fetch(
      `https://${shop}/admin/api/2026-01/products.json`,
      {
        method: "GET",
        headers: {
          "X-Shopify-Access-Token": accessToken,
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

    let matchedProduct = null;
    let matchedVariant = null;

    for (const product of products) {
      const variants = product.variants || [];

      for (const variant of variants) {
        if (variant.sku === targetSku) {
          matchedProduct = product;
          matchedVariant = variant;
          break;
        }
      }

      if (matchedVariant) break;
    }

    if (!matchedProduct || !matchedVariant) {
      return {
        statusCode: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
        },
        body: JSON.stringify(
          {
            success: true,
            target_sku: targetSku,
            item: null,
            message: "SKU not found",
          },
          null,
          2
        ),
      };
    }

    const inventoryItemId = matchedVariant.inventory_item_id;

    // 3. 查庫存分布
    const levelsRes = await fetch(
      `https://${shop}/admin/api/2026-01/inventory_levels.json?inventory_item_ids=${inventoryItemId}`,
      {
        method: "GET",
        headers: {
          "X-Shopify-Access-Token": accessToken,
          "Content-Type": "application/json; charset=utf-8",
        },
      }
    );

    const levelsData = await levelsRes.json();

    if (!levelsRes.ok) {
      return {
        statusCode: levelsRes.status,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
        },
        body: JSON.stringify(
          {
            error: "Failed to fetch inventory levels",
            details: levelsData,
          },
          null,
          2
        ),
      };
    }

    const inventoryLevels = levelsData.inventory_levels || [];

    const locationStocks = inventoryLevels.map((level) => {
      const available = Number(level.available) || 0;
      const stockStatus = getStockStatus(available);

      return {
        location_id: level.location_id,
        location_name:
          LOCATION_MAP[level.location_id] || `未知門市(${level.location_id})`,
        available,
        status: stockStatus.status,
        status_code: stockStatus.status_code,
        display_text: stockStatus.display_text,
        updated_at: level.updated_at,
      };
    });

    const totalAvailable = locationStocks.reduce(
      (sum, loc) => sum + (Number(loc.available) || 0),
      0
    );

    const totalStatus = getTotalStatus(totalAvailable);

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify(
        {
          success: true,
          target_sku: targetSku,
          item: {
            sku: matchedVariant.sku,
            title: matchedProduct.title,
            variant_title: matchedVariant.title,
            product_id: matchedProduct.id,
            variant_id: matchedVariant.id,
            inventory_item_id: inventoryItemId,
            product_handle: matchedProduct.handle,
            total_available: totalAvailable,
            total_status: totalStatus.status,
            total_status_code: totalStatus.status_code,
            total_display_text: totalStatus.display_text,
            locations: locationStocks,
            updated_at: matchedProduct.updated_at,
          },
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
