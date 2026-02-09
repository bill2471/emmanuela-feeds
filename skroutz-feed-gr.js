/**
 * Skroutz.gr Product Feed Generator v1.2 for EMMANUELA
 *
 * Generates a valid XML product feed per Skroutz.gr specifications.
 * Reference: https://developer.skroutz.gr/el/feedspec/
 *
 * Key features:
 *   - ALL active products via Shopify GraphQL API
 *   - Skroutz-compliant XML with <mywebstore> root
 *   - Per-color product entries with size variations nested
 *   - Fashion-compliant: mandatory color, additionalimage, size
 *   - Greek availability strings (Skroutz accepted values)
 *   - Greek category paths (Κοσμήματα > Δαχτυλίδια > ...)
 *   - VAT-inclusive pricing (24% standard rate)
 *   - Quantity tracking per variant
 *   - Weight in grams
 *   - Up to 15 additional images per product
 *   - CDATA wrappers for text fields
 *   - Material phrase in titles (v1.1): "από Ασήμι 925", "από Επιχρυσωμένο Ασήμι 925"
 *   - "Χρώμα μετάλλου" option name support (v1.2)
 *
 * Usage:
 *   node skroutz-feed-gr.js                    # Generate feed
 *   node skroutz-feed-gr.js --validate         # Generate and show samples
 *
 * Output: feeds/skroutz-gr.xml
 *
 * Created: 2026-02-09
 * Updated: 2026-02-09 — "Χρώμα μετάλλου" option name support (v1.2)
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
const VAT_RATE = 24; // Standard Greek VAT %

// ============================================
// SKROUTZ CATEGORY MAPPING
// ============================================

// Skroutz uses " > " as separator (not "->")
// Exact match: Shopify productType (lowercase) → Skroutz category path
const SKROUTZ_CATEGORY_MAP = {
  // Women's
  'γυναικεία δαχτυλίδια':              'Κοσμήματα > Δαχτυλίδια > Γυναικεία Δαχτυλίδια',
  'γυναικεία σκουλαρίκια':             'Κοσμήματα > Σκουλαρίκια > Γυναικεία Σκουλαρίκια',
  'γυναικεία κρεμαστά σκουλαρίκια':    'Κοσμήματα > Σκουλαρίκια > Γυναικεία Σκουλαρίκια',
  'γυναικεία καρφωτά σκουλαρίκια':     'Κοσμήματα > Σκουλαρίκια > Γυναικεία Σκουλαρίκια',
  'γυναικεία σκουλαρίκια κρίκοι':      'Κοσμήματα > Σκουλαρίκια > Γυναικεία Σκουλαρίκια',
  'γυναικεία σκουλαρίκια ear cuff':    'Κοσμήματα > Σκουλαρίκια > Γυναικεία Σκουλαρίκια',
  'γυναικεία σκουλαρίκια ear climber': 'Κοσμήματα > Σκουλαρίκια > Γυναικεία Σκουλαρίκια',
  'γυναικεία σκουλαρίκια ear jacket':  'Κοσμήματα > Σκουλαρίκια > Γυναικεία Σκουλαρίκια',
  'γυναικεία σκουλαρίκια μύτης':       'Κοσμήματα > Σκουλαρίκια > Γυναικεία Σκουλαρίκια',
  'γυναικεία βραχιόλια':               'Κοσμήματα > Βραχιόλια > Γυναικεία Βραχιόλια',
  'γυναικεία κολιέ':                   'Κοσμήματα > Κολιέ > Γυναικεία Κολιέ',
  'γυναικεία μενταγιόν':               'Κοσμήματα > Μενταγιόν > Γυναικεία Μενταγιόν',
  'γυναικείες αλυσίδες':               'Κοσμήματα > Αλυσίδες > Γυναικείες Αλυσίδες',
  'καρφίτσες':                         'Κοσμήματα > Καρφίτσες',
  'γυναικεία σύνολα κοσμημάτων':       'Κοσμήματα > Σετ Κοσμημάτων',
  // Men's
  'ανδρικά δαχτυλίδια':               'Κοσμήματα > Δαχτυλίδια > Ανδρικά Δαχτυλίδια',
  'ανδρικά σκουλαρίκια':              'Κοσμήματα > Σκουλαρίκια > Ανδρικά Σκουλαρίκια',
  'ανδρικά σκουλαρίκια ear cuff':     'Κοσμήματα > Σκουλαρίκια > Ανδρικά Σκουλαρίκια',
  'ανδρικά καρφωτά σκουλαρίκια':      'Κοσμήματα > Σκουλαρίκια > Ανδρικά Σκουλαρίκια',
  'ανδρικά σκουλαρίκια κρίκοι':       'Κοσμήματα > Σκουλαρίκια > Ανδρικά Σκουλαρίκια',
  'ανδρικά σκουλαρίκια ear climber':  'Κοσμήματα > Σκουλαρίκια > Ανδρικά Σκουλαρίκια',
  'ανδρικά σκουλαρίκια ear jacket':   'Κοσμήματα > Σκουλαρίκια > Ανδρικά Σκουλαρίκια',
  'ανδρικά βραχιόλια':                'Κοσμήματα > Βραχιόλια > Ανδρικά Βραχιόλια',
  'ανδρικά κολιέ':                    'Κοσμήματα > Κολιέ > Ανδρικά Κολιέ',
  'ανδρικά μενταγιόν':                'Κοσμήματα > Μενταγιόν > Ανδρικά Μενταγιόν',
  'ανδρικές αλυσίδες':                'Κοσμήματα > Αλυσίδες > Ανδρικές Αλυσίδες',
  // Generic
  'στέφανα γάμου':                    'Κοσμήματα > Στέφανα Γάμου',
};

// Keyword-based fallback (order: more specific first)
const SKROUTZ_CATEGORY_KEYWORDS = [
  // Women's
  { keywords: ['γυναικεί', 'δαχτυλίδ'],   category: 'Κοσμήματα > Δαχτυλίδια > Γυναικεία Δαχτυλίδια' },
  { keywords: ['γυναικεί', 'σκουλαρίκ'],  category: 'Κοσμήματα > Σκουλαρίκια > Γυναικεία Σκουλαρίκια' },
  { keywords: ['γυναικεί', 'βραχιόλ'],    category: 'Κοσμήματα > Βραχιόλια > Γυναικεία Βραχιόλια' },
  { keywords: ['γυναικεί', 'κολιέ'],      category: 'Κοσμήματα > Κολιέ > Γυναικεία Κολιέ' },
  { keywords: ['γυναικεί', 'μενταγιόν'],  category: 'Κοσμήματα > Μενταγιόν > Γυναικεία Μενταγιόν' },
  { keywords: ['γυναικεί', 'αλυσίδ'],     category: 'Κοσμήματα > Αλυσίδες > Γυναικείες Αλυσίδες' },
  { keywords: ['γυναικεί', 'σετ'],        category: 'Κοσμήματα > Σετ Κοσμημάτων' },
  { keywords: ['καρφίτσ'],                 category: 'Κοσμήματα > Καρφίτσες' },
  // Men's
  { keywords: ['ανδρικ', 'δαχτυλίδ'],     category: 'Κοσμήματα > Δαχτυλίδια > Ανδρικά Δαχτυλίδια' },
  { keywords: ['ανδρικ', 'σκουλαρίκ'],    category: 'Κοσμήματα > Σκουλαρίκια > Ανδρικά Σκουλαρίκια' },
  { keywords: ['ανδρικ', 'βραχιόλ'],      category: 'Κοσμήματα > Βραχιόλια > Ανδρικά Βραχιόλια' },
  { keywords: ['ανδρικ', 'κολιέ'],        category: 'Κοσμήματα > Κολιέ > Ανδρικά Κολιέ' },
  { keywords: ['ανδρικ', 'μενταγιόν'],    category: 'Κοσμήματα > Μενταγιόν > Ανδρικά Μενταγιόν' },
  { keywords: ['ανδρικ', 'αλυσίδ'],       category: 'Κοσμήματα > Αλυσίδες > Ανδρικές Αλυσίδες' },
  // Generic fallbacks
  { keywords: ['στέφαν'],                  category: 'Κοσμήματα > Στέφανα Γάμου' },
  { keywords: ['δαχτυλίδ'],               category: 'Κοσμήματα > Δαχτυλίδια > Γυναικεία Δαχτυλίδια' },
  { keywords: ['σκουλαρίκ'],              category: 'Κοσμήματα > Σκουλαρίκια > Γυναικεία Σκουλαρίκια' },
  { keywords: ['βραχιόλ'],                category: 'Κοσμήματα > Βραχιόλια > Γυναικεία Βραχιόλια' },
  { keywords: ['κολιέ'],                  category: 'Κοσμήματα > Κολιέ > Γυναικεία Κολιέ' },
  { keywords: ['μενταγιόν'],              category: 'Κοσμήματα > Μενταγιόν > Γυναικεία Μενταγιόν' },
  { keywords: ['αλυσίδ'],                 category: 'Κοσμήματα > Αλυσίδες > Γυναικείες Αλυσίδες' },
  { keywords: ['σετ'],                    category: 'Κοσμήματα > Σετ Κοσμημάτων' },
];

const DEFAULT_SKROUTZ_CATEGORY = 'Κοσμήματα';

function getSkroutzCategory(productType) {
  if (!productType) return DEFAULT_SKROUTZ_CATEGORY;
  const type = productType.toLowerCase().trim();

  // Exact match first
  if (SKROUTZ_CATEGORY_MAP[type]) return SKROUTZ_CATEGORY_MAP[type];

  // Keyword-based match
  for (const entry of SKROUTZ_CATEGORY_KEYWORDS) {
    const allMatch = entry.keywords.every(kw => type.includes(kw));
    if (allMatch) return entry.category;
  }

  return DEFAULT_SKROUTZ_CATEGORY;
}

// ============================================
// COLOR MAPPING (Greek variant names → Greek color for Skroutz)
// ============================================

const COLOR_MAP_GREEK = {
  'ασημένιο': 'Ασημί', 'ασημένια': 'Ασημί', 'ασημένιος': 'Ασημί', 'ασημί': 'Ασημί',
  'επιχρυσωμένο': 'Χρυσό', 'επιχρυσωμένα': 'Χρυσό', 'επιχρυσωμένος': 'Χρυσό',
  'επιχρυσωμένη': 'Χρυσό', 'επιχυσωμένο': 'Χρυσό',
  'χρυσό': 'Χρυσό', 'χρυσός': 'Χρυσό',
  'μαύρο': 'Μαύρο', 'μαύρα': 'Μαύρο', 'μαύρος': 'Μαύρο', 'μαύρο ανθρακί': 'Μαύρο',
  'οξειδωμένο': 'Γκρι', 'οξειδωμένα': 'Γκρι', 'ανθρακί': 'Γκρι',
  'ροζ': 'Ροζ', 'ροζ επιχρυσωμένο': 'Ροζ', 'ροζ επιχρυσωμένα': 'Ροζ', 'ροζ χρυσό': 'Ροζ',
  'λευκό': 'Λευκό', 'λευκά': 'Λευκό',
  'μπλε': 'Μπλε', 'πράσινο': 'Πράσινο', 'πράσινα': 'Πράσινο',
  'κόκκινο': 'Κόκκινο', 'κόκκινα': 'Κόκκινο', 'μπορντό': 'Μπορντό',
  'μωβ': 'Μωβ', 'τιρκουάζ': 'Τιρκουάζ', 'σομόν': 'Σομόν',
  'πολύχρωμο': 'Πολύχρωμο', 'πολύχρωμα': 'Πολύχρωμο', 'πολύχρωμο σετ': 'Πολύχρωμο',
  'silver': 'Ασημί', 'gold': 'Χρυσό', 'black': 'Μαύρο',
};

function getGreekColor(variantColorRaw) {
  if (!variantColorRaw) return null;
  const normalized = variantColorRaw.toLowerCase().trim();
  if (/\d/.test(normalized)) return null;        // skip numeric values (sizes)
  if (normalized.length > 25) return null;        // skip corrupted strings
  if (COLOR_MAP_GREEK[normalized]) return COLOR_MAP_GREEK[normalized];
  // Partial match
  for (const [key, val] of Object.entries(COLOR_MAP_GREEK)) {
    if (normalized.includes(key)) return val;
  }
  // Return capitalized original if unmapped
  return variantColorRaw.trim().charAt(0).toUpperCase() + variantColorRaw.trim().slice(1);
}

// ============================================
// MATERIAL PHRASE MAPPING (color family → Greek material phrase for Skroutz titles)
// ============================================
// Skroutz requires material info in titles for jewelry. We derive it from the
// color/finish of the variant, since nearly all products are sterling silver 925.

function getMaterialPhrase(variantColorRaw) {
  if (!variantColorRaw) return 'από Ασήμι 925';
  const c = variantColorRaw.toLowerCase().trim();

  // Gold-plated family
  if (c.startsWith('ροζ επιχρ') || c.startsWith('ροζ χρυσ') || c === 'ροζ επιχευσωμένα') {
    return 'από Ροζ Επιχρυσωμένο Ασήμι 925';
  }
  if (c.startsWith('επιχρυσ') || c.startsWith('επιχυσ') || c === 'gold' || c.startsWith('χρυσό') || c.startsWith('χρυσα') || c.startsWith('χρυσός')) {
    return 'από Επιχρυσωμένο Ασήμι 925';
  }

  // Oxidized / anthracite family
  if (c.startsWith('οξειδ') || c.startsWith('μαύρο ανθρ') || c.startsWith('μαύρα ανθρ') || c.startsWith('μάυρο') || c === 'black') {
    return 'από Οξειδωμένο Ασήμι 925';
  }
  if (c.startsWith('μαύρο') || c.startsWith('μαύρα')) {
    return 'από Οξειδωμένο Ασήμι 925';
  }

  // Silver family (default)
  // Covers: ασημένιο, ασημένια, ασημί, silver, and all composites starting with these
  return 'από Ασήμι 925';
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

function stripHtml(html) {
  if (!html) return '';
  return html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/p>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractVariantColor(selectedOptions) {
  if (!selectedOptions) return null;
  for (const opt of selectedOptions) {
    const name = (opt.name || '').toLowerCase();
    if (name.includes('χρώμα') || name.includes('color') || name.includes('colour')
        || name === 'χρώμα μετάλλου') {
      return opt.value;
    }
  }
  // Fallback: single-option variant that is a known color
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
      const wait = Math.min(attempt * 5000, 30000);
      console.log(`   ⏳ Throttled — waiting ${wait / 1000}s (attempt ${attempt}/${retries})...`);
      await new Promise(r => setTimeout(r, wait));
      continue;
    }
    return result;
  }
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
            id title handle descriptionHtml productType vendor tags
            images(first: 15) { edges { node { id url } } }
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
            material: metafield(namespace: "shopify", key: "jewelry-material") { value }
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
        console.log(`   Waiting 30s before retrying page ${page}...`);
        await new Promise(r => setTimeout(r, 30000));
        continue;
      }
      consecutiveErrors = 0;

      const products = data.data?.products?.edges || [];
      products.forEach(({ node }) => {
        const product = {
          id: node.id.replace('gid://shopify/Product/', ''),
          title: node.title,
          handle: node.handle,
          description: stripHtml(node.descriptionHtml),
          product_type: node.productType,
          vendor: node.vendor,
          tags: node.tags || [],
          metafields: {
            color: node.colorPattern?.value || null,
            material: node.material?.value || null,
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
// XML FEED GENERATION FOR SKROUTZ
// ============================================

function generateSkroutzFeed(products) {
  console.log('Generating Skroutz XML feed...\n');

  const items = [];
  const stats = {
    totalProducts: 0,
    inStock: 0,
    outOfStock: 0,
    noImage: 0,
    totalVariants: 0,
    skippedGiftCards: 0,
    feedEntries: 0,
    withColor: 0,
    withSize: 0,
    withWeight: 0,
    withMPN: 0,
    withEAN: 0,
    withDescription: 0,
    withVariations: 0,
    withMaterial: 0,
    categoryBreakdown: {},
    unmappedTypes: {},
    sampleItems: []
  };

  products.forEach(product => {
    stats.totalProducts++;

    // Skip gift cards
    const typeLC = (product.product_type || '').toLowerCase();
    if (typeLC.includes('gift card') || typeLC.includes('δωροκάρτα')) {
      stats.skippedGiftCards++;
      return;
    }

    const variants = product.variants || [];
    const images = product.images || [];
    const mainImage = images[0]?.src || '';
    const categoryPath = getSkroutzCategory(product.product_type);

    // Track category
    stats.categoryBreakdown[categoryPath] = (stats.categoryBreakdown[categoryPath] || 0) + 1;
    if (categoryPath === DEFAULT_SKROUTZ_CATEGORY && product.product_type) {
      stats.unmappedTypes[product.product_type] = (stats.unmappedTypes[product.product_type] || 0) + 1;
    }

    // Determine if product has size options (rings, etc.)
    const hasSizeOption = variants.some(v => extractVariantSize(v.selectedOptions) !== null);

    // Group in-stock variants by normalized color → 1 feed entry per color
    const colorGroups = {};

    variants.forEach(variant => {
      stats.totalVariants++;

      if (variant.inventory_quantity <= 0) {
        stats.outOfStock++;
        return;
      }
      stats.inStock++;

      const rawColor = extractVariantColor(variant.selectedOptions);
      const color = getGreekColor(rawColor) || getGreekColor(product.metafields.color) || 'Ασημί';

      if (!colorGroups[color]) {
        colorGroups[color] = [];
      }
      colorGroups[color].push(variant);
    });

    // Create 1 entry per color group
    for (const [color, groupVariants] of Object.entries(colorGroups)) {
      const repVariant = groupVariants[0];

      // Image: variant-specific or product-level
      const variantImage = repVariant.image_id
        ? images.find(img => img.id === repVariant.image_id)?.src || mainImage
        : mainImage;

      if (!variantImage) {
        stats.noImage++;
        continue;
      }

      // Price: lowest in-stock price for this color group
      const lowestPrice = Math.min(...groupVariants.map(v => parseFloat(v.price)));

      // Total quantity for this color group
      const totalQuantity = groupVariants.reduce((sum, v) => sum + Math.max(0, v.inventory_quantity), 0);

      // Weight from representative variant
      const weightGrams = getWeightGrams(repVariant);

      // Build name: product title + material phrase + color
      // Skroutz requires material in title for jewelry (e.g., "από Ασήμι 925")
      const rawColorForMaterial = extractVariantColor(repVariant.selectedOptions);
      const materialPhrase = getMaterialPhrase(rawColorForMaterial);
      const colorForTitle = Object.keys(colorGroups).length > 1 ? color : null;
      let name = product.title;
      // Add material phrase (always for jewelry)
      if (materialPhrase) {
        name = `${name} ${materialPhrase}`;
      }
      // Add color suffix for multi-color products
      if (colorForTitle) {
        name = `${name} ${colorForTitle}`;
      }
      // Ensure name is max 300 chars (Skroutz limit)
      if (name.length > 300) name = name.substring(0, 297) + '...';

      if (materialPhrase) stats.withMaterial++;

      // MPN
      const mpn = repVariant.sku || `EMM-${repVariant.id}`;

      // EAN/Barcode
      const ean = repVariant.barcode && /^\d{8,13}$/.test(repVariant.barcode.trim())
        ? repVariant.barcode.trim() : null;

      // Description: max 10000 chars, no HTML
      let description = product.description || '';
      if (description.length > 10000) description = description.substring(0, 9997) + '...';

      // Additional images (up to 15, excluding main image)
      const additionalImages = images
        .map(img => img.src)
        .filter(src => src !== variantImage)
        .slice(0, 14); // 14 additional + 1 main = 15 total max

      // Build product XML entry
      let item = '';
      item += `      <product>\n`;
      item += `        <id>${repVariant.id}</id>\n`;
      item += `        <name><![CDATA[${name}]]></name>\n`;
      item += `        <link><![CDATA[https://${DOMAIN}/products/${product.handle}?variant=${repVariant.id}]]></link>\n`;
      item += `        <image><![CDATA[${variantImage}]]></image>\n`;

      // Additional images (fashion: mandatory when available)
      for (const addImg of additionalImages) {
        item += `        <additionalimage><![CDATA[${addImg}]]></additionalimage>\n`;
      }

      // Category
      item += `        <category><![CDATA[${categoryPath}]]></category>\n`;

      // Price with VAT (already VAT-inclusive in Shopify for .gr)
      item += `        <price_with_vat>${lowestPrice.toFixed(2)}</price_with_vat>\n`;
      item += `        <vat>${VAT_RATE}.00</vat>\n`;

      // Manufacturer
      item += `        <manufacturer><![CDATA[${BRAND}]]></manufacturer>\n`;

      // MPN
      item += `        <mpn><![CDATA[${mpn}]]></mpn>\n`;
      if (repVariant.sku) stats.withMPN++;

      // EAN
      if (ean) {
        item += `        <ean>${ean}</ean>\n`;
        stats.withEAN++;
      }

      // Availability (Skroutz accepted Greek values)
      item += `        <availability>Παράδοση 1 έως 3 ημέρες</availability>\n`;

      // Quantity
      item += `        <quantity>${totalQuantity}</quantity>\n`;

      // Color (fashion: mandatory)
      item += `        <color>${escapeXml(color)}</color>\n`;
      stats.withColor++;

      // Size — either flat field or variations block
      if (hasSizeOption && groupVariants.length > 1) {
        // Use variations block for sized products with multiple variants in this color
        const sizes = [];
        item += `        <variations>\n`;

        for (const v of groupVariants) {
          const size = extractVariantSize(v.selectedOptions);
          if (!size) continue;
          sizes.push(size);

          const vPrice = parseFloat(v.price);
          const vQty = Math.max(0, v.inventory_quantity);
          const vEan = v.barcode && /^\d{8,13}$/.test(v.barcode.trim()) ? v.barcode.trim() : null;

          item += `          <variation>\n`;
          item += `            <variationid>${v.id}</variationid>\n`;
          item += `            <availability>Παράδοση 1 έως 3 ημέρες</availability>\n`;
          item += `            <size>${escapeXml(size)}</size>\n`;
          item += `            <quantity>${vQty}</quantity>\n`;
          // Include price only if different from parent
          if (Math.abs(vPrice - lowestPrice) > 0.01) {
            item += `            <price_with_vat>${vPrice.toFixed(2)}</price_with_vat>\n`;
          }
          // MPN per variation
          if (v.sku) {
            item += `            <manufacturersku><![CDATA[${v.sku}]]></manufacturersku>\n`;
          }
          // EAN per variation
          if (vEan) {
            item += `            <ean>${vEan}</ean>\n`;
          }
          item += `          </variation>\n`;
        }

        item += `        </variations>\n`;

        if (sizes.length > 0) stats.withSize++;
        stats.withVariations++;
      } else if (hasSizeOption) {
        // Single variant with size — flat <size> field
        const allSizes = groupVariants
          .map(v => extractVariantSize(v.selectedOptions))
          .filter(Boolean);
        if (allSizes.length > 0) {
          item += `        <size>${escapeXml(allSizes.join(','))}</size>\n`;
          stats.withSize++;
        }
      }

      // Weight (grams)
      if (weightGrams) {
        item += `        <weight>${weightGrams}</weight>\n`;
        stats.withWeight++;
      }

      // Description
      if (description) {
        item += `        <description><![CDATA[${description}]]></description>\n`;
        stats.withDescription++;
      }

      // Shipping (free shipping for emmanuela.gr)
      item += `        <shipping>0</shipping>\n`;

      item += `      </product>`;
      items.push(item);
      stats.feedEntries++;

      // Collect samples
      if (stats.sampleItems.length < 5) {
        stats.sampleItems.push({
          id: repVariant.id,
          name: name,
          price: lowestPrice.toFixed(2),
          category: categoryPath,
          color: color,
          mpn: mpn,
          ean: ean || '(none)',
          quantity: totalQuantity,
          variations: groupVariants.length,
          weight: weightGrams || '(none)',
          hasDescription: description ? 'yes' : 'no',
          additionalImages: additionalImages.length
        });
      }
    }
  });

  // Build full XML — Skroutz format
  const now = new Date();
  const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  xml += `<mywebstore>\n`;
  xml += `  <created_at>${dateStr}</created_at>\n`;
  xml += `  <products>\n`;
  xml += items.join('\n');
  xml += `\n  </products>\n`;
  xml += `</mywebstore>\n`;

  return { xml, stats };
}

// ============================================
// MAIN FUNCTION
// ============================================

async function generateFeed(options = {}) {
  console.log('='.repeat(60));
  console.log('Skroutz.gr Feed Generator v1.2 for EMMANUELA');
  console.log('='.repeat(60));
  console.log(`Store: ${SHOPIFY_STORE}`);
  console.log(`Domain: ${DOMAIN}`);
  console.log(`Brand: ${BRAND}`);
  console.log(`VAT Rate: ${VAT_RATE}%\n`);

  // Fetch products
  const products = await fetchProducts();
  if (products.length === 0) {
    console.error('No products found!');
    process.exit(1);
  }

  // Generate feed
  let { xml, stats } = generateSkroutzFeed(products);

  // Sanitize: remove any U+FFFD replacement characters
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
  const filename = 'skroutz-gr.xml';
  const filepath = path.join(OUTPUT_DIR, filename);
  fs.writeFileSync(filepath, xml, 'utf8');

  const date = new Date().toISOString().split('T')[0];
  const datedFilename = `skroutz-gr-${date}.xml`;
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
  console.log(`  Products fetched:      ${stats.totalProducts}`);
  console.log(`  Total variants:        ${stats.totalVariants}`);
  console.log(`  In stock:              ${stats.inStock}`);
  console.log(`  Out of stock (skip):   ${stats.outOfStock}`);
  console.log(`  No image (skip):       ${stats.noImage}`);
  console.log(`  Gift cards (skip):     ${stats.skippedGiftCards}`);
  console.log(`  Feed entries:          ${stats.feedEntries}`);
  console.log(`  With material phrase:   ${stats.withMaterial}`);
  console.log(`  With color:            ${stats.withColor}`);
  console.log(`  With MPN/SKU:          ${stats.withMPN}`);
  console.log(`  With EAN/barcode:      ${stats.withEAN}`);
  console.log(`  With size:             ${stats.withSize}`);
  console.log(`  With weight:           ${stats.withWeight}`);
  console.log(`  With description:      ${stats.withDescription}`);
  console.log(`  With size variations:  ${stats.withVariations}`);

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
      console.log(`\n  [${i + 1}] ${s.name}`);
      console.log(`      ID:               ${s.id}`);
      console.log(`      Price (VAT inc):   ${s.price} EUR`);
      console.log(`      Category:          ${s.category}`);
      console.log(`      Color:             ${s.color}`);
      console.log(`      MPN:               ${s.mpn}`);
      console.log(`      EAN:               ${s.ean}`);
      console.log(`      Quantity:           ${s.quantity}`);
      console.log(`      Variations:         ${s.variations}`);
      console.log(`      Weight:             ${s.weight}`);
      console.log(`      Description:        ${s.hasDescription}`);
      console.log(`      Additional images:  ${s.additionalImages}`);
    });
  }
}

// Entry point
const args = process.argv.slice(2);
const options = {
  validate: args.includes('--validate') || args.includes('-v')
};
generateFeed(options).catch(console.error);
