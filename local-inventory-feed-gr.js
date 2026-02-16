/**
 * Local Inventory Feed Generator v1.0 for EMMANUELA
 *
 * Based on google-shopping-feed-v7.js — same GraphQL fetch, same variant IDs.
 * Generates a Local Product Inventory Feed for Google Merchant Center.
 *
 * Google spec: https://support.google.com/merchants/answer/3061342
 *
 * Required fields per entry:
 *   - id (must match primary feed EXACTLY)
 *   - store_code (must match Business Profile in GMC)
 *   - availability (in_stock)
 *   - price (EUR)
 *   - quantity
 *
 * Logic:
 *   - Only includes variants with inventory_quantity > 0 (same as primary feed)
 *   - Variants with 0 stock are NOT included (product discontinued)
 *   - IDs are Shopify variant IDs (stripped from gid://) — matches primary feed
 *
 * Store: EMMANUELA handcrafted for you®
 * Address: Gymnasiou 15, 57007 Nea Chalkidona, Thessaloniki, Greece
 *
 * Usage:
 *   SHOPIFY_ACCESS_TOKEN=shpat_xxx node local-inventory-feed-gr.js
 *
 * Created: 2026-02-16
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

// ============================================
// CONFIGURATION
// ============================================

const SHOPIFY_STORE = 'emmanuela-gr.myshopify.com';
const API_VERSION = '2024-01';
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

if (!ACCESS_TOKEN) {
  console.error('❌ ERROR: SHOPIFY_ACCESS_TOKEN environment variable not set!');
  console.error('   Set it with: set SHOPIFY_ACCESS_TOKEN=your_token_here');
  process.exit(1);
}

// Google Business Profile store code (case-sensitive, all lowercase)
// Verified from Google Business Profile Manager (16/02/2026)
const STORE_CODE = 'emmanuela';

const OUTPUT_DIR = path.join(__dirname, 'feeds');

// ============================================
// SHOPIFY GraphQL (identical to google-shopping-feed-v7.js)
// ============================================

function httpsRequest(options, postData = null) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ data: JSON.parse(data), statusCode: res.statusCode, headers: res.headers });
        } catch (e) { reject(new Error(`Parse error: ${e.message}`)); }
      });
    });
    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

async function graphqlRequest(query) {
  const options = {
    hostname: SHOPIFY_STORE,
    path: `/admin/api/${API_VERSION}/graphql.json`,
    method: 'POST',
    headers: { 'X-Shopify-Access-Token': ACCESS_TOKEN, 'Content-Type': 'application/json' }
  };
  return httpsRequest(options, JSON.stringify({ query }));
}

// ============================================
// FETCH PRODUCTS (same query as primary feed — ensures matching IDs)
// ============================================

async function fetchProducts() {
  console.log('📦 Fetching products from Shopify (GraphQL)...\n');

  const allProducts = [];
  let cursor = null;
  let page = 1;

  while (true) {
    const afterClause = cursor ? `, after: "${cursor}"` : '';

    // Simplified query — we only need id, price, inventory for local inventory
    const query = `{
      products(first: 50, query: "status:active"${afterClause}) {
        pageInfo { hasNextPage endCursor }
        edges {
          node {
            id
            variants(first: 100) {
              edges {
                node {
                  id
                  price
                  inventoryQuantity
                }
              }
            }
          }
        }
      }
    }`;

    try {
      const { data } = await graphqlRequest(query);
      if (data.errors) { console.error('GraphQL errors:', data.errors); break; }

      const products = data.data?.products?.edges || [];
      products.forEach(({ node }) => {
        const product = {
          id: node.id.replace('gid://shopify/Product/', ''),
          variants: (node.variants?.edges || []).map(e => ({
            id: e.node.id.replace('gid://shopify/ProductVariant/', ''),
            price: e.node.price,
            inventory_quantity: e.node.inventoryQuantity
          }))
        };
        allProducts.push(product);
      });

      console.log(`   Page ${page}: ${products.length} products (Total: ${allProducts.length})`);
      const pageInfo = data.data?.products?.pageInfo;
      if (!pageInfo?.hasNextPage) break;
      cursor = pageInfo.endCursor;
      page++;
      await new Promise(r => setTimeout(r, 300));
    } catch (error) { console.error(`❌ Error: ${error.message}`); break; }
  }

  console.log(`\n✅ Total products: ${allProducts.length}\n`);
  return allProducts;
}

// ============================================
// GENERATE LOCAL INVENTORY FEED
// ============================================

function generateLocalInventoryFeed(products) {
  console.log('🏭 Generating Local Inventory Feed...\n');

  const entries = [];
  let stats = { totalVariants: 0, inStock: 0, skipped: 0 };

  products.forEach(product => {
    product.variants.forEach(variant => {
      stats.totalVariants++;

      // Only include variants with stock > 0
      // Variants with 0 = discontinued, not in feed
      if (variant.inventory_quantity <= 0) {
        stats.skipped++;
        return;
      }

      stats.inStock++;

      const price = `${parseFloat(variant.price).toFixed(2)} EUR`;

      entries.push(`    <entry>
      <g:id>${variant.id}</g:id>
      <g:store_code>${STORE_CODE}</g:store_code>
      <g:quantity>${variant.inventory_quantity}</g:quantity>
      <g:price>${price}</g:price>
      <g:availability>in_stock</g:availability>
    </entry>`);
    });
  });

  console.log(`   📊 Stats:`);
  console.log(`      Total variants scanned: ${stats.totalVariants}`);
  console.log(`      In stock (included):    ${stats.inStock}`);
  console.log(`      Out of stock (skipped): ${stats.skipped}`);
  console.log('');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:g="http://base.google.com/ns/1.0">
  <title>EMMANUELA Local Inventory Feed — Greece</title>
  <link href="https://emmanuela.gr"/>
  <updated>${new Date().toISOString()}</updated>
${entries.join('\n')}
</feed>`;

  return { xml, stats };
}

// ============================================
// MAIN
// ============================================

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  EMMANUELA Local Inventory Feed Generator v1.0');
  console.log('  Based on google-shopping-feed-v7.js (same IDs)');
  console.log('═══════════════════════════════════════════════════════════\n');
  console.log(`Store Code: ${STORE_CODE}`);
  console.log(`Output: feeds/local-inventory-gr.xml\n`);

  try {
    const products = await fetchProducts();
    if (products.length === 0) { console.error('❌ No products found'); process.exit(1); }

    const { xml, stats } = generateLocalInventoryFeed(products);

    // Save feed
    if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

    const feedPath = path.join(OUTPUT_DIR, 'local-inventory-gr.xml');
    fs.writeFileSync(feedPath, xml, 'utf8');

    console.log(`✅ Local Inventory Feed saved: ${feedPath}`);
    console.log(`   Entries: ${stats.inStock} (matching primary feed variant IDs)`);
    console.log(`   Skipped: ${stats.skipped} (out of stock)\n`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();
