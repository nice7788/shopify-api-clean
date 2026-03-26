export async function handler(event) {
  const shop = process.env.SHOPIFY_SHOP;
  const clientId = process.env.SHOPIFY_CLIENT_ID;
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;

  const defaultSku = "DUR-FF-001";
  const targetSku =
    event?.queryStringParameters?.sku?.trim() || defaultSku;

  const LOCATION_MAP = {
    81993564354: "花蓮｜美崙起源",
    82225496258: "花蓮｜花創園區",
  };

  const LOCATION_ORDER = [
    "花蓮｜美崙起源",
    "花蓮｜花創園區",
  ];

  function jsonResponse(statusCode, data) {
    return {
      statusCode,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "public, max-age=30",
      },
      body: JSON.stringify(data, null, 2),
    };
  }

  function getStatus(stock) {
    const qty = Number(stock) || 0;

    if (qty <= 0) {
      return {
        text: "已售完",
        code: "out_of_stock",
        displayText: "已售完",
      };
    }

    if (qty <= 3) {
      return {
        text: "即將售完",
        code: "low_stock",
        displayText: `剩 ${qty} 盒`,
      };
    }

    return {
      text: "庫存充足",
      code: "in_stock",
      displayText: `剩 ${qty} 盒`,
    };
  }

  function getTotalStatus(total) {
    const qty = Number(total) || 0;

    if (qty <= 0) {
      return {
        text: "已售完",
        code: "out_of_stock",
        displayText: "全門市已售完",
      };
    }

    if (qty <= 3) {
      return {
        text: "即將售完",
        code: "low_stock",
        displayText: `全門市剩 ${qty} 盒`,
      };
    }

    return {
      text: "庫存充足",
      code: "in_stock",
      displayText: `全門市剩 ${qty} 盒`,
    };
  }

  if (!shop || !clientId || !clientSecret) {
    return jsonResponse(500, {
      error: "Missing required environment variables",
    });
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
      return jsonResponse(tokenRes.status, {
        error: "Failed to get access token",
        details: tokenData,
      });
    }

    const accessToken = tokenData.access_token;

    // 2. 抓商品資料並找出目標 SKU
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
      return jsonResponse(productsRes.status, {
        error: "Failed to fetch products",
        details: productsData,
      });
    }

    const products = productsData.products || [];

    let matchedProduct = null;
    let matchedVariant = null;

    for (const product of products) {
      const variants = product.variants || [];

      for (const variant of variants) {
        if ((variant.sku || "").trim() === targetSku) {
          matchedProduct = product;
          matchedVariant = variant;
          break;
        }
      }

      if (matchedVariant) break;
    }

    if (!matchedProduct || !matchedVariant) {
      return jsonResponse(200, {
        success: false,
        target_sku: targetSku,
        item: null,
        message: "SKU not found",
      });
    }

    const inventoryItemId = matchedVariant.inventory_item_id;

    // 3. 查該 inventory item 的各門市庫存
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
      return jsonResponse(levelsRes.status, {
        error: "Failed to fetch inventory levels",
        details: levelsData,
      });
    }

    const inventoryLevels = levelsData.inventory_levels || [];

    const locationStocks = inventoryLevels.map((level) => {
      const available = Number(level.available) || 0;
      const status = getStatus(available);

      return {
        location_id: level.location_id,
        location_name:
          LOCATION_MAP[level.location_id] ||
          `未知門市(${level.location_id})`,
        available,
        status: status.text,
        status_code: status.code,
        display_text: status.displayText,
        updated_at: level.updated_at,
      };
    });

    // 4. 門市排序
    locationStocks.sort((a, b) => {
      const indexA = LOCATION_ORDER.indexOf(a.location_name);
      const indexB = LOCATION_ORDER.indexOf(b.location_name);

      const safeA = indexA === -1 ? 999 : indexA;
      const safeB = indexB === -1 ? 999 : indexB;

      return safeA - safeB;
    });

    // 5. 總庫存與總狀態
    const totalAvailable = locationStocks.reduce(
      (sum, loc) => sum + (Number(loc.available) || 0),
      0
    );

    const totalStatus = getTotalStatus(totalAvailable);

    // 6. 警報邏輯
    const alertLocations = locationStocks.filter((loc) => loc.available <= 1);

    const alertMessage =
      alertLocations.length > 0
        ? `⚠ ${alertLocations
            .map((loc) => {
              const shortName = loc.location_name.replace("花蓮｜", "");
              return `${shortName} 剩 ${loc.available} 盒`;
            })
            .join("、")}`
        : null;

    return jsonResponse(200, {
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
        total_status: totalStatus.text,
        total_status_code: totalStatus.code,
        total_display_text: totalStatus.displayText,
        alert: alertLocations.length > 0,
        alert_message: alertMessage,
        locations: locationStocks,
        updated_at: matchedProduct.updated_at,
      },
    });
  } catch (error) {
    return jsonResponse(500, {
      error: "Unexpected server error",
      message: error.message,
    });
  }
}
