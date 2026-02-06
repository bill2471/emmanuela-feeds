/**
 * BestPrice.gr Product Feed Generator v1.0 for EMMANUELA
 *
 * Generates a valid XML product feed per BestPrice.gr specifications (v2.0.12).
 *
 * Key features:
 *   - ALL active products via Shopify GraphQL API
 *   - Creates separate <product> per variant (color) — as required by BestPrice
 *   - Skips out-of-stock variants
 *   - Full Greek category paths (Κοσμήματα->Δαχτυλίδια->...)
 *   - Greek color mapping from variant options
 *   - Size aggregation for rings
 *   - productId = Shopify Variant ID (stable identifier)
 *
 * Usage:
 *   node bestprice-feed-gr.js                    # Generate feed
 *   node bestprice-feed-gr.js --validate         # Generate and show sample
 *
 * Output: feeds/bestprice-gr.xml
 *
 * Created: 2026-02-06
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

// ============================================
// CONFIGURATION
// ============================================

const SHOPIFY_STORE = 'emmanuela-gr.myshopify.com';
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
if (!ACCESS_TOKEN) {
  console.error('ERROR: SHOPIFY_ACCESS_TOKEN environment variable not set!');
  console.error('   Set it with: set SHOPIFY_ACCESS_TOKEN=your_token_here');
  process.exit(1);
}
const API_VERSION = '2024-01';
const BRAND = 'Emmanuela - handcrafted for you';
const OUTPUT_DIR = path.join(__dirname, 'feeds');
const DOMAIN = 'emmanuela.gr';

// ============================================
// BESTPRICE CATEGORY PATH MAPPING
// ============================================

// Exact match: Shopify productType (lowercase) → BestPrice category_path
const BESTPRICE_CATEGORY_MAP = {
  // Women's
  'γυναικεία δαχτυλίδια':              'Κοσμήματα->Δαχτυλίδια->Γυναικεία δαχτυλίδια',
  'γυναικεία σκουλαρίκια':             'Κοσμήματα->Σκουλαρίκια->Γυναικεία σκουλαρίκια',
  'γυναικεία κρεμαστά σκουλαρίκια':    'Κοσμήματα->Σκουλαρίκια->Γυναικεία σκουλαρίκια',
  'γυναικεία καρφωτά σκουλαρίκια':     'Κοσμήματα->Σκουλαρίκια->Γυναικεία σκουλαρίκια',
  'γυναικεία σκουλαρίκια κρίκοι':      'Κοσμήματα->Σκουλαρίκια->Γυναικεία σκουλαρίκια',
  'γυναικεία σκουλαρίκια ear cuff':    'Κοσμήματα->Σκουλαρίκια->Γυναικεία σκουλαρίκια',
  'γυναικεία σκουλαρίκια ear climber': 'Κοσμήματα->Σκουλαρίκια->Γυναικεία σκουλαρίκια',
  'γυναικεία σκουλαρίκια ear jacket':  'Κοσμήματα->Σκουλαρίκια->Γυναικεία σκουλαρίκια',
  'γυναικεία σκουλαρίκια μύτης':       'Κοσμήματα->Σκουλαρίκια->Γυναικεία σκουλαρίκια',
  'γυναικεία βραχιόλια':               'Κοσμήματα->Βραχιόλια->Γυναικεία βραχιόλια',
  'γυναικεία κολιέ':                   'Κοσμήματα->Κολιέ->Γυναικεία κολιέ',
  'γυναικεία μενταγιόν':               'Κοσμήματα->Μενταγιόν->Γυναικεία μενταγιόν',
  'γυναικείες αλυσίδες':               'Κοσμήματα->Αλυσίδες->Γυναικείες αλυσίδες',
  'καρφίτσες':                         'Κοσμήματα->Καρφίτσες',
  'γυναικεία σύνολα κοσμημάτων':       'Κοσμήματα->Σετ κοσμημάτων',
  // Men's
  'ανδρικά δαχτυλίδια':               'Κοσμήματα->Δαχτυλίδια->Ανδρικά δαχτυλίδια',
  'ανδρικά σκουλαρίκια':              'Κοσμήματα->Σκουλαρίκια->Ανδρικά σκουλαρίκια',
  'ανδρικά σκουλαρίκια ear cuff':     'Κοσμήματα->Σκουλαρίκια->Ανδρικά σκουλαρίκια',
  'ανδρικά καρφωτά σκουλαρίκια':      'Κοσμήματα->Σκουλαρίκια->Ανδρικά σκουλαρίκια',
  'ανδρικά σκουλαρίκια κρίκοι':       'Κοσμήματα->Σκουλαρίκια->Ανδρικά σκουλαρίκια',
  'ανδρικά σκουλαρίκια ear climber':  'Κοσμήματα->Σκουλαρίκια->Ανδρικά σκουλαρίκια',
  'ανδρικά σκουλαρίκια ear jacket':   'Κοσμήματα->Σκουλαρίκια->Ανδρικά σκουλαρίκια',
  'ανδρικά βραχιόλια':                'Κοσμήματα->Βραχιόλια->Ανδρικά βραχιόλια',
  'ανδρικά κολιέ':                    'Κοσμήματα->Κολιέ->Ανδρικά κολιέ',
  'ανδρικά μενταγιόν':                'Κοσμήματα->Μενταγιόν->Ανδρικά μενταγιόν',
  'ανδρικές αλυσίδες':                'Κοσμήματα->Αλυσίδες->Ανδρικές αλυσίδες',
  // Generic
  'στέφανα γάμου':                    'Κοσμήματα->Στέφανα γάμου',
};

// Keyword-based fallback (order matters: more specific first)
const BESTPRICE_CATEGORY_KEYWORDS = [
  // Women's
  { keywords: ['γυναικεί', 'δαχτυλίδ'],   category: 'Κοσμήματα->Δαχτυλίδια->Γυναικεία δαχτυλίδια' },
  { keywords: ['γυναικεί', 'σκουλαρίκ'],  category: 'Κοσμήματα->Σκουλαρίκια->Γυναικεία σκουλαρίκια' },
  { keywords: ['γυναικεί', 'βραχιόλ'],    category: 'Κοσμήματα->Βραχιόλια->Γυναικεία βραχιόλια' },
  { keywords: ['γυναικεί', 'κολιέ'],      category: 'Κοσμήματα->Κολιέ->Γυναικεία κολιέ' },
  { keywords: ['γυναικεί', 'μενταγιόν'],  category: 'Κοσμήματα->Μενταγιόν->Γυναικεία μενταγιόν' },
  { keywords: ['γυναικεί', 'αλυσίδ'],     category: 'Κοσμήματα->Αλυσίδες->Γυναικείες αλυσίδες' },
  { keywords: ['γυναικεί', 'σετ'],        category: 'Κοσμήματα->Σετ κοσμημάτων' },
  { keywords: ['καρφίτσ'],                 category: 'Κοσμήματα->Καρφίτσες' },
  // Men's
  { keywords: ['ανδρικ', 'δαχτυλίδ'],     category: 'Κοσμήματα->Δαχτυλίδια->Ανδρικά δαχτυλίδια' },
  { keywords: ['ανδρικ', 'σκουλαρίκ'],    category: 'Κοσμήματα->Σκουλαρίκια->Ανδρικά σκουλαρίκια' },
  { keywords: ['ανδρικ', 'βραχιόλ'],      category: 'Κοσμήματα->Βραχιόλια->Ανδρικά βραχιόλια' },
  { keywords: ['ανδρικ', 'κολιέ'],        category: 'Κοσμήματα->Κολιέ->Ανδρικά κολιέ' },
  { keywords: ['ανδρικ', 'μενταγιόν'],    category: 'Κοσμήματα->Μενταγιόν->Ανδρικά μενταγιόν' },
  { keywords: ['ανδρικ', 'αλυσίδ'],       category: 'Κοσμήματα->Αλυσίδες->Ανδρικές αλυσίδες' },
  // Generic fallbacks
  { keywords: ['στέφαν'],                  category: 'Κοσμήματα->Στέφανα γάμου' },
  { keywords: ['δαχτυλίδ'],               category: 'Κοσμήματα->Δαχτυλίδια->Γυναικεία δαχτυλίδια' },
  { keywords: ['σκουλαρίκ'],              category: 'Κοσμήματα->Σκουλαρίκια->Γυναικεία σκουλαρίκια' },
  { keywords: ['βραχιόλ'],                category: 'Κοσμήματα->Βραχιόλια->Γυναικεία βραχιόλια' },
  { keywords: ['κολιέ'],                  category: 'Κοσμήματα->Κολιέ->Γυναικεία κολιέ' },
  { keywords: ['μενταγιόν'],              category: 'Κοσμήματα->Μενταγιόν->Γυναικεία μενταγιόν' },
  { keywords: ['αλυσίδ'],                 category: 'Κοσμήματα->Αλυσίδες->Γυναικείες αλυσίδες' },
  { keywords: ['σετ'],                    category: 'Κοσμήματα->Σετ κοσμημάτων' },
];

const DEFAULT_BESTPRICE_CATEGORY = 'Κοσμήματα';

function getBestPriceCategory(productType) {
  if (!productType) return DEFAULT_BESTPRICE_CATEGORY;
  const type = productType.toLowerCase().trim();

  // Exact match first
  if (BESTPRICE_CATEGORY_MAP[type]) return BESTPRICE_CATEGORY_MAP[type];

  // Keyword-based match
  for (const entry of BESTPRICE_CATEGORY_KEYWORDS) {
    const allMatch = entry.keywords.every(kw => type.includes(kw));
    if (allMatch) return entry.category;
  }

  return DEFAULT_BESTPRICE_CATEGORY;
}

// ============================================
// COLOR MAPPING (Greek variant names → Greek color for BestPrice)
// ============================================

const COLOR_MAP_GREEK = {
  'ασημένιο': 'ασημί', 'ασημένια': 'ασημί', 'ασημένιος': 'ασημί', 'ασημί': 'ασημί',
  'επιχρυσωμένο': 'χρυσό', 'επιχρυσωμένα': 'χρυσό', 'επιχρυσωμένος': 'χρυσό',
  'επιχρυσωμένη': 'χρυσό', 'επιχυσωμένο': 'χρυσό',
  'χρυσό': 'χρυσό', 'χρυσός': 'χρυσό',
  'μαύρο': 'μαύρο', 'μαύρα': 'μαύρο', 'μαύρος': 'μαύρο', 'μαύρο ανθρακί': 'μαύρο',
  'οξειδωμένο': 'γκρι', 'οξειδωμένα': 'γκρι', 'ανθρακί': 'γκρι',
  'ροζ': 'ροζ', 'ροζ επιχρυσωμένο': 'ροζ', 'ροζ επιχρυσωμένα': 'ροζ', 'ροζ χρυσό': 'ροζ',
  'λευκό': 'λευκό', 'λευκά': 'λευκό',
  'μπλε': 'μπλε', 'πράσινο': 'πράσινο', 'πράσινα': 'πράσινο',
  'κόκκινο': 'κόκκινο', 'κόκκινα': 'κόκκινο', 'μπορντό': 'μπορντό',
  'μωβ': 'μωβ', 'τιρκουάζ': 'τιρκουάζ', 'σομόν': 'σομόν',
  'πολύχρωμο': 'πολύχρωμο', 'πολύχρωμα': 'πολύχρωμο', 'πολύχρωμο σετ': 'πολύχρωμο',
  'silver': 'ασημί', 'gold': 'χρυσό', 'black': 'μαύρο',
};

function getGreekColor(variantColorRaw) {
  if (!variantColorRaw) return null;
  const normalized = variantColorRaw.toLowerCase().trim();
  if (/\d/.test(normalized)) return null;
  if (normalized.length > 25) return null;
  if (COLOR_MAP_GREEK[normalized]) return COLOR_MAP_GREEK[normalized];
  for (const [key, val] of Object.entries(COLOR_MAP_GREEK)) {
    if (normalized.includes(key)) return val;
  }
  return variantColorRaw.trim();
}

// ============================================
// VARIANT NAME TRANSLATION (German/English → Greek for titles)
// ============================================

const VARIANT_NAME_TRANSLATIONS = {
  // German → Greek
  'manschetten': 'μανσέτ', 'manschette': 'μανσέτ',
  'mehrfarbige': 'πολύχρωμες', 'mehrfarbig': 'πολύχρωμο',
  'schwarze': 'μαύρες', 'schwarz': 'μαύρο',
  'silberne': 'ασημένιες', 'silber': 'ασημί',
  'goldene': 'χρυσές', 'gold': 'χρυσό',
  'vergoldet': 'επιχρυσωμένο', 'rosévergoldet': 'ροζ επιχρυσωμένο',
  'oxidiert': 'οξειδωμένο',
  // English → Greek
  'silver': 'ασημί', 'black': 'μαύρο',
};

function translateVariantName(name) {
  if (!name) return name;
  let result = name;
  // Replace German/English words with Greek equivalents
  for (const [foreign, greek] of Object.entries(VARIANT_NAME_TRANSLATIONS)) {
    const regex = new RegExp(`\\b${foreign}\\b`, 'gi');
    result = result.replace(regex, greek);
  }
  return result;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function escapeXml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function extractVariantColor(selectedOptions) {
  if (!selectedOptions) return null;
  for (const opt of selectedOptions) {
    const name = (opt.name || '').toLowerCase();
    if (name.includes('χρώμα') || name.includes('color') || name.includes('colour')) {
      return opt.value;
    }
  }
  if (selectedOptions.length === 1) {
    const val = selectedOptions[0].value.toLowerCase().trim();
    if (COLOR_MAP_GREEK[val]) return selectedOptions[0].value;
  }
  return null;
}

function extractVariantSize(selectedOptions) {
  if (!selectedOptions) return null;
  for (const opt of selectedOptions) {
    const name = (opt.name || '').toLowerCase();
    if (name.includes('μέγεθος') || name.includes('size') || name.includes('νούμερο')) {
      return opt.value;
    }
  }
  return null;
}

// Collect all in-stock sizes for a product (for rings)
function collectAvailableSizes(variants) {
  const sizes = new Set();
  for (const v of variants) {
    if (v.inventory_quantity <= 0) continue;
    const size = extractVariantSize(v.selectedOptions);
    if (size) sizes.add(size);
  }
  return sizes.size > 0 ? Array.from(sizes).join(',') : null;
}

// Get variant weight in grams
function getWeightGrams(variant) {
  const w = variant.weight;
  if (!w || !w.value || w.value <= 0) return null;
  const val = parseFloat(w.value);
  if (isNaN(val) || val <= 0) return null;
  const unit = (w.unit || '').toUpperCase();
  if (unit === 'GRAMS' || unit === 'G') return Math.round(val);
  if (unit === 'KILOGRAMS' || unit === 'KG') return Math.round(val * 1000);
  if (unit === 'POUNDS' || unit === 'LB') return Math.round(val * 453.592);
  if (unit === 'OUNCES' || unit === 'OZ') return Math.round(val * 28.3495);
  return Math.round(val); // assume grams
}

// ============================================
// HTTPS REQUEST HELPERS
// ============================================

function httpsRequest(options, postData = null) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        try {
          // Concatenate as Buffer first, then decode as UTF-8 to avoid stream boundary corruption
          const data = Buffer.concat(chunks).toString('utf8');
          resolve({ data: JSON.parse(data), statusCode: res.statusCode, headers: res.headers });
        } catch (e) {
          reject(new Error(`Parse error: ${e.message}`));
        }
      });
    });
    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

async function graphqlRequest(query, retries = 6) {
  const options = {
    hostname: SHOPIFY_STORE,
    path: `/admin/api/${API_VERSION}/graphql.json`,
    method: 'POST',
    headers: {
      'X-Shopify-Access-Token': ACCESS_TOKEN,
      'Content-Type': 'application/json'
    }
  };
  for (let attempt = 1; attempt <= retries; attempt++) {
    const result = await httpsRequest(options, JSON.stringify({ query }));
    const errors = result.data?.errors;
    if (errors && errors[0]?.extensions?.code === 'THROTTLED') {
      const wait = Math.min(attempt * 5000, 30000); // 5s, 10s, 15s, 20s, 25s, 30s
      console.log(`   ⏳ Throttled — waiting ${wait / 1000}s (attempt ${attempt}/${retries})...`);
      await new Promise(r => setTimeout(r, wait));
      continue;
    }
    return result;
  }
  // Final attempt after all retries exhausted
  console.log('   ⚠️ Final retry after all throttle waits...');
  return httpsRequest(options, JSON.stringify({ query }));
}

// ============================================
// FETCH ALL ACTIVE PRODUCTS (GraphQL)
// ============================================

async function fetchProducts() {
  // Wait 30s before starting if running in CI (after other feeds consumed API budget)
  if (process.env.CI || process.env.GITHUB_ACTIONS) {
    console.log('⏳ Running in CI — waiting 30s for API rate limit recovery...\n');
    await new Promise(r => setTimeout(r, 30000));
  }
  console.log('Fetching ALL active products from Shopify...\n');

  const allProducts = [];
  let cursor = null;
  let page = 1;
  let consecutiveErrors = 0;

  while (true) {
    const afterClause = cursor ? `, after: "${cursor}"` : '';

    const query = `{
      products(first: 50, query: "status:active"${afterClause}) {
        pageInfo { hasNextPage endCursor }
        edges {
          node {
            id title handle productType vendor tags
            images(first: 10) { edges { node { id url } } }
            options { id name optionValues { id name } }
            variants(first: 100) {
              edges {
                node {
                  id sku price compareAtPrice inventoryQuantity barcode
                  image { id }
                  selectedOptions { name value }
                  inventoryItem { measurement { weight { value unit } } }
                }
              }
            }
            colorPattern: metafield(namespace: "shopify", key: "color-pattern") { value }
          }
        }
      }
    }`;

    try {
      const { data } = await graphqlRequest(query);
      if (data.errors) {
        consecutiveErrors++;
        console.error(`GraphQL errors (attempt ${consecutiveErrors}/3):`, data.errors[0]?.message || data.errors);
        if (consecutiveErrors >= 3) {
          console.error('Too many consecutive errors — aborting.');
          break;
        }
        // Wait extra before retrying this page
        console.log(`   Waiting 30s before retrying page ${page}...`);
        await new Promise(r => setTimeout(r, 30000));
        continue; // retry same page
      }
      consecutiveErrors = 0; // reset on success

      const products = data.data?.products?.edges || [];
      products.forEach(({ node }) => {
        const product = {
          id: node.id.replace('gid://shopify/Product/', ''),
          title: node.title,
          handle: node.handle,
          product_type: node.productType,
          vendor: node.vendor,
          tags: node.tags || [],
          metafields: {
            color: node.colorPattern?.value || null,
          },
          images: (node.images?.edges || []).map(e => ({
            id: e.node.id.replace('gid://shopify/ProductImage/', ''),
            src: e.node.url
          })),
          variants: (node.variants?.edges || []).map(e => ({
            id: e.node.id.replace('gid://shopify/ProductVariant/', ''),
            sku: e.node.sku,
            price: e.node.price,
            compare_at_price: e.node.compareAtPrice,
            inventory_quantity: e.node.inventoryQuantity,
            barcode: e.node.barcode,
            image_id: e.node.image?.id?.replace('gid://shopify/ProductImage/', ''),
            selectedOptions: e.node.selectedOptions,
            weight: e.node.inventoryItem?.measurement?.weight || null
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
    } catch (error) {
      console.error(`Error: ${error.message}`);
      break;
    }
  }

  console.log(`\nTotal products fetched: ${allProducts.length}\n`);
  return allProducts;
}

// ============================================
// XML FEED GENERATION FOR BESTPRICE
// ============================================

function generateBestPriceFeed(products) {
  console.log('Generating BestPrice XML feed...\n');

  const items = [];
  const stats = {
    inStock: 0,
    outOfStock: 0,
    noImage: 0,
    totalVariants: 0,
    skippedGiftCards: 0,
    withColor: 0,
    withSize: 0,
    withWeight: 0,
    withMPN: 0,
    categoryBreakdown: {},
    unmappedTypes: {},
    sampleItems: []
  };

  products.forEach(product => {
    // Skip gift cards
    const typeLC = (product.product_type || '').toLowerCase();
    if (typeLC.includes('gift card') || typeLC.includes('δωροκάρτα')) {
      stats.skippedGiftCards++;
      return;
    }

    const variants = product.variants || [];
    const images = product.images || [];
    const mainImage = images[0]?.src || '';
    const categoryPath = getBestPriceCategory(product.product_type);

    // Track category
    stats.categoryBreakdown[categoryPath] = (stats.categoryBreakdown[categoryPath] || 0) + 1;
    if (categoryPath === DEFAULT_BESTPRICE_CATEGORY && product.product_type) {
      stats.unmappedTypes[product.product_type] = (stats.unmappedTypes[product.product_type] || 0) + 1;
    }

    // Collect available sizes for this product (for size field)
    const isRingOrSized = typeLC.includes('δαχτυλίδ') || typeLC.includes('ring');
    const availableSizes = isRingOrSized ? collectAvailableSizes(variants) : null;

    variants.forEach(variant => {
      stats.totalVariants++;

      // Skip out of stock
      if (variant.inventory_quantity <= 0) {
        stats.outOfStock++;
        return;
      }
      stats.inStock++;

      // Images: variant-specific or product-level
      const variantImage = variant.image_id
        ? images.find(img => img.id === variant.image_id)?.src || mainImage
        : mainImage;

      if (!variantImage) {
        stats.noImage++;
        return;
      }

      // Color (fallback to "ασημί" since most jewelry is sterling silver)
      const rawColor = extractVariantColor(variant.selectedOptions);
      const color = getGreekColor(rawColor) || getGreekColor(product.metafields.color) || 'ασημί';

      // Size (for this variant specifically)
      const variantSize = extractVariantSize(variant.selectedOptions);

      // Weight
      const weightGrams = getWeightGrams(variant);

      // Build title: product title + all variant options for uniqueness
      // Translate German variant names to Greek for BestPrice.gr
      let title = product.title;
      if (variants.length > 1 && variant.selectedOptions) {
        // Collect ALL non-default option values for the title suffix
        const extraParts = [];
        for (const opt of variant.selectedOptions) {
          const optName = (opt.name || '').toLowerCase().trim();
          const optVal = (opt.value || '').trim();
          // Skip "Default Title" placeholder
          if (optVal.toLowerCase() === 'default title') continue;
          // Translate German/English variant names
          const translated = translateVariantName(optVal);
          // Format size with "Νο" prefix
          if (optName.includes('μέγεθος') || optName.includes('size') || optName.includes('νούμερο')) {
            extraParts.push(`Νο ${translated}`);
          } else {
            extraParts.push(translated);
          }
        }
        if (extraParts.length > 0) {
          title = `${product.title} - ${extraParts.join(', ')}`;
        }
      }

      // Build product XML
      let item = '';
      item += `    <product>\n`;
      item += `      <productId>${variant.id}</productId>\n`;
      item += `      <title><![CDATA[${title}]]></title>\n`;
      item += `      <productURL>https://${DOMAIN}/products/${product.handle}?variant=${variant.id}</productURL>\n`;

      // Images: always include imageURL (required) + imagesURL for additional images
      const allImages = [variantImage, ...images.filter(img => img.src !== variantImage).map(img => img.src)].slice(0, 5);
      item += `      <imageURL>${escapeXml(allImages[0])}</imageURL>\n`;
      if (allImages.length > 1) {
        item += `      <imagesURL>\n`;
        allImages.forEach((img, i) => {
          item += `        <img${i + 1}>${escapeXml(img)}</img${i + 1}>\n`;
        });
        item += `      </imagesURL>\n`;
      }

      // Price (decimal with dot, BestPrice accepts both formats)
      item += `      <price>${parseFloat(variant.price).toFixed(2)}</price>\n`;

      // Category
      item += `      <category_path><![CDATA[${categoryPath}]]></category_path>\n`;

      // Availability & stock
      item += `      <availability>Παράδοση σε 1-3 ημέρες</availability>\n`;
      item += `      <stock>Y</stock>\n`;

      // Brand
      item += `      <brand><![CDATA[${BRAND}]]></brand>\n`;

      // MPN (SKU, fallback to variant ID if no SKU — MPN is required by BestPrice)
      const mpnValue = variant.sku || `EMM-${variant.id}`;
      item += `      <MPN><![CDATA[${mpnValue}]]></MPN>\n`;
      if (variant.sku) stats.withMPN++;

      // Color (always present — fallback is "ασημί")
      item += `      <color>${escapeXml(color)}</color>\n`;
      if (color !== 'ασημί') stats.withColor++;

      // Size (for rings: all available sizes)
      if (availableSizes) {
        item += `      <size>${escapeXml(availableSizes)}</size>\n`;
        stats.withSize++;
      }

      // Weight (grams)
      if (weightGrams) {
        item += `      <weight>${weightGrams}</weight>\n`;
        stats.withWeight++;
      }

      // Shipping (free)
      item += `      <shipping>0</shipping>\n`;

      item += `    </product>`;
      items.push(item);

      // Collect samples
      if (stats.sampleItems.length < 3) {
        stats.sampleItems.push({
          productId: variant.id,
          title: title,
          price: variant.price,
          category: categoryPath,
          color: color || '(none)',
          sku: variant.sku || '(none)',
          size: availableSizes || '(none)'
        });
      }
    });
  });

  // Build full XML
  const now = new Date();
  const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  xml += `<store>\n`;
  xml += `  <date>${dateStr}</date>\n`;
  xml += `  <products>\n`;
  xml += items.join('\n');
  xml += `\n  </products>\n`;
  xml += `</store>\n`;

  return { xml, stats };
}

// ============================================
// MAIN FUNCTION
// ============================================

async function generateFeed(options = {}) {
  console.log('='.repeat(60));
  console.log('BestPrice.gr Feed Generator v1.0 for EMMANUELA');
  console.log('='.repeat(60));
  console.log(`Store: ${SHOPIFY_STORE}`);
  console.log(`Domain: ${DOMAIN}`);
  console.log(`Brand: ${BRAND}\n`);

  // Fetch products
  const products = await fetchProducts();
  if (products.length === 0) {
    console.error('No products found!');
    process.exit(1);
  }

  // Generate feed
  let { xml, stats } = generateBestPriceFeed(products);

  // Sanitize: remove any U+FFFD replacement characters (Node.js/API encoding glitch)
  const fffdCount = (xml.match(/\uFFFD/g) || []).length;
  if (fffdCount > 0) {
    console.log(`⚠️ Removing ${fffdCount} corrupted characters (U+FFFD)...`);
    xml = xml.replace(/\uFFFD+/g, '');
  }

  // Create output directory
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // Write files
  const filename = 'bestprice-gr.xml';
  const filepath = path.join(OUTPUT_DIR, filename);
  fs.writeFileSync(filepath, xml, 'utf8');

  const date = new Date().toISOString().split('T')[0];
  const datedFilename = `bestprice-gr-${date}.xml`;
  const datedFilepath = path.join(OUTPUT_DIR, datedFilename);
  fs.writeFileSync(datedFilepath, xml, 'utf8');

  // Summary
  console.log('='.repeat(60));
  console.log('FEED GENERATION COMPLETE');
  console.log('='.repeat(60));
  console.log(`Output: ${filepath}`);
  console.log(`Dated:  ${datedFilepath}`);
  console.log(`Size:   ${(Buffer.byteLength(xml) / 1024).toFixed(1)} KB`);
  console.log('');
  console.log('STATS:');
  console.log(`  Products fetched:    ${products.length}`);
  console.log(`  Total variants:      ${stats.totalVariants}`);
  console.log(`  In stock (included): ${stats.inStock}`);
  console.log(`  Out of stock (skip): ${stats.outOfStock}`);
  console.log(`  No image (skip):     ${stats.noImage}`);
  console.log(`  Gift cards (skip):   ${stats.skippedGiftCards}`);
  console.log(`  With color:          ${stats.withColor}`);
  console.log(`  With MPN/SKU:        ${stats.withMPN}`);
  console.log(`  With size:           ${stats.withSize}`);
  console.log(`  With weight:         ${stats.withWeight}`);

  // Category breakdown
  console.log('\nCATEGORY BREAKDOWN:');
  const sorted = Object.entries(stats.categoryBreakdown).sort((a, b) => b[1] - a[1]);
  for (const [cat, count] of sorted) {
    console.log(`  ${cat}: ${count} products`);
  }

  // Unmapped types warning
  if (Object.keys(stats.unmappedTypes).length > 0) {
    console.log('\nUNMAPPED PRODUCT TYPES (using fallback "Κοσμήματα"):');
    for (const [type, count] of Object.entries(stats.unmappedTypes)) {
      console.log(`  "${type}": ${count} products`);
    }
  }

  // Validation samples
  if (options.validate && stats.sampleItems.length > 0) {
    console.log('\nSAMPLE ITEMS:');
    stats.sampleItems.forEach((s, i) => {
      console.log(`\n  [${i + 1}] ${s.title}`);
      console.log(`      ID:       ${s.productId}`);
      console.log(`      Price:    ${s.price}`);
      console.log(`      Category: ${s.category}`);
      console.log(`      Color:    ${s.color}`);
      console.log(`      SKU:      ${s.sku}`);
      console.log(`      Size:     ${s.size}`);
    });
  }
}

// Entry point
const args = process.argv.slice(2);
const options = {
  validate: args.includes('--validate') || args.includes('-v')
};
generateFeed(options).catch(console.error);
