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
        { error: "Missing required environment variables" },
        null,
        2
      ),
    };
  }

  try {
    // 1️⃣ 取得 token
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
    const accessToken = tokenData.access_token;

    // 2️⃣ 找 SKU
    const productsRes = await fetch(
      `https://${shop}/admin/api/2026-01/products.json`,
      {
        headers: {
          "X-Shopify-Access-Token": accessToken,
        },
      }
    );

    const productsData = await productsRes.json();
    const products = productsData.products || [];

    let matchedProduct = null;
    let matchedVariant = null;

    for (const product of products) {
      for (const variant of product.variants || []) {
        if (variant.sku === targetSku) {
          matchedProduct = product;
          matchedVariant = variant;
          break;
        }
      }
      if (matchedVariant) break;
    }

    if (!matchedVariant) {
      return {
        statusCode: 200,
        body: JSON.stringify({ success: false, message: "SKU not found" }),
      };
    }

    const inventoryItemId = matchedVariant.inventory_item_id;

    // 3️⃣ 查庫存
    const levelsRes = await fetch(
      `https://${shop}/admin/api/2026-01/inventory_levels.json?inventory_item_ids=${inventoryItemId}`,
      {
        headers: {
          "X-Shopify-Access-Token": accessToken,
        },
      }
    );

    const levelsData = await levelsRes.json();
    const inventoryLevels = levelsData.inventory_levels || [];

    // ⭐ 手動門市 mapping（避免權限問題）
    const LOCATION_MAP = {
      81993564354: "花蓮｜美崙起源",
      82225496258: "花蓮｜花創園區",
    };

    // ⭐ 固定排序
    const ORDER = [
      "花蓮｜美崙起源",
      "花蓮｜花創園區",
    ];

    // ⭐ 狀態判斷
    function getStatus(stock) {
      if (stock === 0) {
        return { text: "已售完", code: "out_of_stock" };
      }
      if (stock <= 3) {
        return { text: "即將售完", code: "low_stock" };
      }
      return { text: "庫存充足", code: "in_stock" };
    }

    const locationStocks = inventoryLevels.map((level) => {
      const stock = Number(level.available) || 0;
      const status = getStatus(stock);

      return {
        location_id: level.location_id,
        location_name:
          LOCATION_MAP[level.location_id] ||
          `Location ${level.location_id}`,
        available: stock,
        status: status.text,
        status_code: status.code,
        display_text:
          stock === 0 ? "已售完" : `剩 ${stock} 盒`,
        updated_at: level.updated_at,
      };
    });

    // ⭐ 排序
    locationStocks.sort(
      (a, b) =>
        ORDER.indexOf(a.location_name) -
        ORDER.indexOf(b.location_name)
    );

    // ⭐ 總庫存
    const total = locationStocks.reduce(
      (sum, loc) => sum + loc.available,
      0
    );

    const totalStatus = getStatus(total);

    // ⭐ 警報
    const alertLocations = locationStocks.filter(
      (loc) => loc.available <= 1
    );

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
            title: matchedProduct.title,
            total_available: total,
            total_status: totalStatus.text,
            total_status_code: totalStatus.code,
            total_display_text:
              total === 0
                ? "全門市已售完"
                : `全門市剩 ${total} 盒`,

            // 🔥 警報
            alert: alertLocations.length > 0,
            alert_message:
              alertLocations.length > 0
                ? `${alertLocations
                    .map((l) => l.location_name)
                    .join("、")} 即將售完`
                : null,

            locations: locationStocks,
          },
        },
        null,
        2
      ),
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: error.message,
      }),
    };
  }
}
