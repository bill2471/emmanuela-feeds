/**
 * Local Inventory Feed Generator v1.0 for EMMANUELA
 * 
 * Generates a Local Inventory Feed for Google Merchant Center
 * This feed provides store-specific inventory data for Local Inventory Ads
 * 
 * Store: EMMANUELA handcrafted for you®
 * Address: Gymnaisiou 15, 57007 Nea Chalkidona, Thessaloniki, Greece
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

// ============================================
// CONFIGURATION
// ============================================

const SHOPIFY_STORE = 'emmanuela-gr.myshopify.com';
const API_VERSION = '2024-01';

// Store Configuration
const STORE_CODE = 'EMMANUELA_HQ';  // Google Business Profile store code

// Get API token from environment
const SHOPIFY_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

if (!SHOPIFY_TOKEN) {
  console.error('❌ SHOPIFY_ACCESS_TOKEN environment variable is required');
  process.exit(1);
}

// ============================================
// SHOPIFY API
// ============================================

function shopifyRequest(endpoint) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: SHOPIFY_STORE,
      path: `/admin/api/${API_VERSION}/${endpoint}`,
      headers: {
        'X-Shopify-Access-Token': SHOPIFY_TOKEN,
        'Content-Type': 'application/json'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

async function fetchAllProducts() {
  let allProducts = [];
  let pageInfo = null;
  let hasNextPage = true;
  let pageNum = 1;

  console.log('📦 Fetching products from Shopify...\n');

  while (hasNextPage) {
    let endpoint = 'products.json?limit=250&status=active';
    if (pageInfo) {
      endpoint += `&page_info=${pageInfo}`;
    }

    const response = await shopifyRequest(endpoint);
    const products = response.products || [];
    allProducts = allProducts.concat(products);
    
    console.log(`   Page ${pageNum}: ${products.length} products (Total: ${allProducts.length})`);

    // Check for next page
    hasNextPage = products.length === 250;
    if (hasNextPage && response.link) {
      const match = response.link.match(/page_info=([^>&]+)/);
      pageInfo = match ? match[1] : null;
      hasNextPage = !!pageInfo;
    } else {
      hasNextPage = false;
    }
    pageNum++;
  }

  console.log(`\n✅ Total products fetched: ${allProducts.length}\n`);
  return allProducts;
}

// ============================================
// LOCAL INVENTORY FEED GENERATION
// ============================================

function generateLocalInventoryFeed(products) {
  console.log('🏭 Generating Local Inventory Feed...\n');

  let items = [];
  let stats = {
    totalVariants: 0,
    inStock: 0,
    outOfStock: 0
  };

  products.forEach(product => {
    product.variants.forEach(variant => {
      stats.totalVariants++;
      
      // Use inventory_quantity or default to 0
      const quantity = variant.inventory_quantity || 0;
      
      if (quantity > 0) {
        stats.inStock++;
      } else {
        stats.outOfStock++;
      }

      // Get price in EUR
      const price = `${parseFloat(variant.price).toFixed(2)} EUR`;

      // Create item entry
      const item = `    <entry>
      <g:id>${variant.id}</g:id>
      <g:store_code>${STORE_CODE}</g:store_code>
      <g:quantity>${quantity}</g:quantity>
      <g:price>${price}</g:price>
      <g:availability>${quantity > 0 ? 'in_stock' : 'out_of_stock'}</g:availability>
    </entry>`;

      items.push(item);
    });
  });

  console.log(`   📊 Stats:`);
  console.log(`      Total variants: ${stats.totalVariants}`);
  console.log(`      In stock: ${stats.inStock}`);
  console.log(`      Out of stock: ${stats.outOfStock}`);
  console.log('');

  // Build XML feed
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:g="http://base.google.com/ns/1.0">
  <title>EMMANUELA Local Inventory Feed</title>
  <link href="https://emmanuela.gr"/>
  <updated>${new Date().toISOString()}</updated>
${items.join('\n')}
</feed>`;

  return xml;
}

// ============================================
// MAIN
// ============================================

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  EMMANUELA Local Inventory Feed Generator v1.0');
  console.log('═══════════════════════════════════════════════════════════\n');
  console.log(`Store Code: ${STORE_CODE}`);
  console.log(`Address: Gymnaisiou 15, 57007 Nea Chalkidona, Thessaloniki\n`);

  try {
    // Fetch products
    const products = await fetchAllProducts();

    // Generate local inventory feed
    const feed = generateLocalInventoryFeed(products);

    // Save feed
    const feedsDir = path.join(__dirname, 'feeds');
    if (!fs.existsSync(feedsDir)) {
      fs.mkdirSync(feedsDir, { recursive: true });
    }

    const feedPath = path.join(feedsDir, 'local-inventory-gr.xml');
    fs.writeFileSync(feedPath, feed, 'utf8');
    console.log(`\n✅ Local Inventory Feed saved to: ${feedPath}`);

    // Summary
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('  Feed generated successfully!');
    console.log('═══════════════════════════════════════════════════════════\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();
