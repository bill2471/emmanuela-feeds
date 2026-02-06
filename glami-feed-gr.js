/**
 * GLAMI Product Feed Generator v1.0 for EMMANUELA
 *
 * Generates a valid XML product feed per GLAMI.gr specifications.
 *
 * Key features:
 *   - ALL active products (same as Google Shopping feed)
 *   - Creates separate SHOPITEM per variant (color+size combo)
 *   - Skips out-of-stock variants
 *   - GLAMI CATEGORYTEXT mapping from Shopify product types
 *   - UPPERCASE XML tags as required by GLAMI
 *   - ITEM_ID = Shopify Variant ID (must match GLAMI piXel)
 *   - ITEMGROUP_ID = Shopify Product ID
 *
 * Usage:
 *   node glami-feed-gr.js                    # Generate feed
 *   node glami-feed-gr.js --validate         # Generate and show sample for validation
 *
 * Output: feeds/glami-gr.xml
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
// GLAMI CATEGORY MAPPING
// ============================================

// Maps Shopify productType (lowercase) keywords to GLAMI category paths
const GLAMI_CATEGORY_MAP = {
  // --- Women's ---
  'γυναικεία δαχτυλίδια':       'Glami.gr | Γυναικεία ρούχα και παπούτσια | Γυναικεία κοσμήματα και ρολόγια | Γυναικεία δαχτυλίδια',
  'γυναικεία σκουλαρίκια':      'Glami.gr | Γυναικεία ρούχα και παπούτσια | Γυναικεία κοσμήματα και ρολόγια | Γυναικεία σκουλαρίκια',
  'γυναικεία κρεμαστά σκουλαρίκια': 'Glami.gr | Γυναικεία ρούχα και παπούτσια | Γυναικεία κοσμήματα και ρολόγια | Γυναικεία σκουλαρίκια',
  'γυναικεία καρφωτά σκουλαρίκια':  'Glami.gr | Γυναικεία ρούχα και παπούτσια | Γυναικεία κοσμήματα και ρολόγια | Γυναικεία σκουλαρίκια',
  'γυναικεία σκουλαρίκια κρίκοι':   'Glami.gr | Γυναικεία ρούχα και παπούτσια | Γυναικεία κοσμήματα και ρολόγια | Γυναικεία σκουλαρίκια',
  'γυναικεία σκουλαρίκια ear cuff':  'Glami.gr | Γυναικεία ρούχα και παπούτσια | Γυναικεία κοσμήματα και ρολόγια | Γυναικεία σκουλαρίκια',
  'γυναικεία σκουλαρίκια ear climber':'Glami.gr | Γυναικεία ρούχα και παπούτσια | Γυναικεία κοσμήματα και ρολόγια | Γυναικεία σκουλαρίκια',
  'γυναικεία σκουλαρίκια ear jacket':'Glami.gr | Γυναικεία ρούχα και παπούτσια | Γυναικεία κοσμήματα και ρολόγια | Γυναικεία σκουλαρίκια',
  'γυναικεία σκουλαρίκια μύτης':     'Glami.gr | Γυναικεία ρούχα και παπούτσια | Γυναικεία κοσμήματα και ρολόγια | Γυναικεία σκουλαρίκια',
  'γυναικεία βραχιόλια':        'Glami.gr | Γυναικεία ρούχα και παπούτσια | Γυναικεία κοσμήματα και ρολόγια | Γυναικεία βραχιόλια',
  'γυναικεία κολιέ':            'Glami.gr | Γυναικεία ρούχα και παπούτσια | Γυναικεία κοσμήματα και ρολόγια | Γυναικεία κολιέ',
  'γυναικεία μενταγιόν':        'Glami.gr | Γυναικεία ρούχα και παπούτσια | Γυναικεία κοσμήματα και ρολόγια | Γυναικεία μενταγιόν',
  'γυναικείες αλυσίδες':        'Glami.gr | Γυναικεία ρούχα και παπούτσια | Γυναικεία κοσμήματα και ρολόγια | Γυναικείες αλυσίδες',
  'καρφίτσες':                  'Glami.gr | Γυναικεία ρούχα και παπούτσια | Γυναικεία κοσμήματα και ρολόγια | Καρφίτσες',
  'γυναικεία σύνολα κοσμημάτων':'Glami.gr | Γυναικεία ρούχα και παπούτσια | Γυναικεία κοσμήματα και ρολόγια | Γυναικεία σύνολα κοσμημάτων',
  // --- Men's ---
  'ανδρικά δαχτυλίδια':         'Glami.gr | Ανδρικά ρούχα και παπούτσια | Ανδρικά κοσμήματα και ρολόγια | Ανδρικά δαχτυλίδια',
  'ανδρικά σκουλαρίκια':        'Glami.gr | Ανδρικά ρούχα και παπούτσια | Ανδρικά κοσμήματα και ρολόγια | Ανδρικά σκουλαρίκια',
  'ανδρικά σκουλαρίκια ear cuff':'Glami.gr | Ανδρικά ρούχα και παπούτσια | Ανδρικά κοσμήματα και ρολόγια | Ανδρικά σκουλαρίκια',
  'ανδρικά καρφωτά σκουλαρίκια':   'Glami.gr | Ανδρικά ρούχα και παπούτσια | Ανδρικά κοσμήματα και ρολόγια | Ανδρικά σκουλαρίκια',
  'ανδρικά σκουλαρίκια κρίκοι':    'Glami.gr | Ανδρικά ρούχα και παπούτσια | Ανδρικά κοσμήματα και ρολόγια | Ανδρικά σκουλαρίκια',
  'ανδρικά σκουλαρίκια ear climber':'Glami.gr | Ανδρικά ρούχα και παπούτσια | Ανδρικά κοσμήματα και ρολόγια | Ανδρικά σκουλαρίκια',
  'ανδρικά σκουλαρίκια ear jacket':'Glami.gr | Ανδρικά ρούχα και παπούτσια | Ανδρικά κοσμήματα και ρολόγια | Ανδρικά σκουλαρίκια',
  'ανδρικά βραχιόλια':          'Glami.gr | Ανδρικά ρούχα και παπούτσια | Ανδρικά κοσμήματα και ρολόγια | Ανδρικά βραχιόλια',
  'ανδρικά κολιέ':              'Glami.gr | Ανδρικά ρούχα και παπούτσια | Ανδρικά κοσμήματα και ρολόγια | Ανδρικά κολιέ',
  'ανδρικά μενταγιόν':          'Glami.gr | Ανδρικά ρούχα και παπούτσια | Ανδρικά κοσμήματα και ρολόγια | Ανδρικά μενταγιόν',
  'ανδρικές αλυσίδες':          'Glami.gr | Ανδρικά ρούχα και παπούτσια | Ανδρικά κοσμήματα και ρολόγια | Ανδρικές αλυσίδες',
  // --- Gender-neutral / generic ---
  'στέφανα γάμου':              'Glami.gr | Γυναικεία ρούχα και παπούτσια | Γυναικεία κοσμήματα και ρολόγια',
  'jewelry':                    'Glami.gr | Γυναικεία ρούχα και παπούτσια | Γυναικεία κοσμήματα και ρολόγια',
};

// Keyword-based fallback for partial matches
const GLAMI_CATEGORY_KEYWORDS = [
  // Women's - order matters, more specific first
  { keywords: ['γυναικεί', 'δαχτυλίδ'],   category: GLAMI_CATEGORY_MAP['γυναικεία δαχτυλίδια'] },
  { keywords: ['γυναικεί', 'σκουλαρίκ'],  category: GLAMI_CATEGORY_MAP['γυναικεία σκουλαρίκια'] },
  { keywords: ['γυναικεί', 'ear cuff'],   category: GLAMI_CATEGORY_MAP['γυναικεία σκουλαρίκια ear cuff'] },
  { keywords: ['γυναικεί', 'ear climber'],category: GLAMI_CATEGORY_MAP['γυναικεία σκουλαρίκια ear climber'] },
  { keywords: ['γυναικεί', 'ear jacket'], category: GLAMI_CATEGORY_MAP['γυναικεία σκουλαρίκια ear jacket'] },
  { keywords: ['γυναικεί', 'μύτης'],      category: GLAMI_CATEGORY_MAP['γυναικεία σκουλαρίκια μύτης'] },
  { keywords: ['γυναικεί', 'βραχιόλ'],    category: GLAMI_CATEGORY_MAP['γυναικεία βραχιόλια'] },
  { keywords: ['γυναικεί', 'κολιέ'],      category: GLAMI_CATEGORY_MAP['γυναικεία κολιέ'] },
  { keywords: ['γυναικεί', 'μενταγιόν'],  category: GLAMI_CATEGORY_MAP['γυναικεία μενταγιόν'] },
  { keywords: ['γυναικεί', 'αλυσίδ'],     category: GLAMI_CATEGORY_MAP['γυναικείες αλυσίδες'] },
  { keywords: ['καρφίτσ'],                 category: GLAMI_CATEGORY_MAP['καρφίτσες'] },
  { keywords: ['γυναικεί', 'σετ'],        category: GLAMI_CATEGORY_MAP['γυναικεία σύνολα κοσμημάτων'] },
  // Men's
  { keywords: ['ανδρικ', 'δαχτυλίδ'],     category: GLAMI_CATEGORY_MAP['ανδρικά δαχτυλίδια'] },
  { keywords: ['ανδρικ', 'σκουλαρίκ'],    category: GLAMI_CATEGORY_MAP['ανδρικά σκουλαρίκια'] },
  { keywords: ['ανδρικ', 'ear cuff'],     category: GLAMI_CATEGORY_MAP['ανδρικά σκουλαρίκια ear cuff'] },
  { keywords: ['ανδρικ', 'βραχιόλ'],      category: GLAMI_CATEGORY_MAP['ανδρικά βραχιόλια'] },
  { keywords: ['ανδρικ', 'κολιέ'],        category: GLAMI_CATEGORY_MAP['ανδρικά κολιέ'] },
  { keywords: ['ανδρικ', 'μενταγιόν'],    category: GLAMI_CATEGORY_MAP['ανδρικά μενταγιόν'] },
  { keywords: ['ανδρικ', 'αλυσίδ'],       category: GLAMI_CATEGORY_MAP['ανδρικές αλυσίδες'] },
  { keywords: ['ανδρικ', 'ear climber'],  category: GLAMI_CATEGORY_MAP['ανδρικά σκουλαρίκια'] },
  { keywords: ['ανδρικ', 'ear jacket'],   category: GLAMI_CATEGORY_MAP['ανδρικά σκουλαρίκια'] },
  { keywords: ['στέφαν', 'γάμ'],          category: GLAMI_CATEGORY_MAP['στέφανα γάμου'] },
  // Generic fallbacks
  { keywords: ['δαχτυλίδ'],               category: GLAMI_CATEGORY_MAP['γυναικεία δαχτυλίδια'] },
  { keywords: ['σκουλαρίκ'],              category: GLAMI_CATEGORY_MAP['γυναικεία σκουλαρίκια'] },
  { keywords: ['βραχιόλ'],                category: GLAMI_CATEGORY_MAP['γυναικεία βραχιόλια'] },
  { keywords: ['κολιέ', 'τσόκερ'],        category: GLAMI_CATEGORY_MAP['γυναικεία κολιέ'] },
  { keywords: ['κολιέ'],                  category: GLAMI_CATEGORY_MAP['γυναικεία κολιέ'] },
  { keywords: ['μενταγιόν'],              category: GLAMI_CATEGORY_MAP['γυναικεία μενταγιόν'] },
  { keywords: ['αλυσίδ'],                 category: GLAMI_CATEGORY_MAP['γυναικείες αλυσίδες'] },
  { keywords: ['σετ'],                    category: GLAMI_CATEGORY_MAP['γυναικεία σύνολα κοσμημάτων'] },
];

const DEFAULT_GLAMI_CATEGORY = 'Glami.gr | Γυναικεία ρούχα και παπούτσια | Γυναικεία κοσμήματα και ρολόγια';

function getGlamiCategory(productType) {
  if (!productType) return DEFAULT_GLAMI_CATEGORY;
  const type = productType.toLowerCase().trim();

  // Exact match first
  if (GLAMI_CATEGORY_MAP[type]) return GLAMI_CATEGORY_MAP[type];

  // Keyword-based match
  for (const entry of GLAMI_CATEGORY_KEYWORDS) {
    const allMatch = entry.keywords.every(kw => type.includes(kw));
    if (allMatch) return entry.category;
  }

  return DEFAULT_GLAMI_CATEGORY;
}

// ============================================
// COLOR MAPPING (Greek variant names → Greek color for GLAMI)
// ============================================

const COLOR_MAP_GREEK = {
  'ασημένιο': 'ασημί',
  'ασημένια': 'ασημί',
  'ασημένιος': 'ασημί',
  'ασημί': 'ασημί',
  'επιχρυσωμένο': 'χρυσό',
  'επιχρυσωμένα': 'χρυσό',
  'επιχρυσωμένος': 'χρυσό',
  'επιχρυσωμένη': 'χρυσό',
  'επιχυσωμένο': 'χρυσό',  // typo variant
  'χρυσό': 'χρυσό',
  'χρυσός': 'χρυσό',
  'μαύρο': 'μαύρο',
  'μαύρα': 'μαύρο',
  'μαύρος': 'μαύρο',
  'μαύρο ανθρακί': 'μαύρο',
  'οξειδωμένο': 'γκρι',
  'οξειδωμένα': 'γκρι',
  'ανθρακί': 'γκρι',
  'ροζ': 'ροζ',
  'ροζ επιχρυσωμένο': 'ροζ',
  'ροζ επιχρυσωμένα': 'ροζ',
  'ροζ χρυσό': 'ροζ',
  'λευκό': 'λευκό',
  'λευκά': 'λευκό',
  'μπλε': 'μπλε',
  'πράσινο': 'πράσινο',
  'πράσινα': 'πράσινο',
  'κόκκινο': 'κόκκινο',
  'κόκκινα': 'κόκκινο',
  'μπορντό': 'μπορντό',
  'μωβ': 'μωβ',
  'τιρκουάζ': 'τιρκουάζ',
  'σομόν': 'σομόν',
  'πολύχρωμο': 'πολύχρωμο',
  'πολύχρωμα': 'πολύχρωμο',
  'πολύχρωμο σετ': 'πολύχρωμο',
  'silver': 'ασημί',
  'gold': 'χρυσό',
  'black': 'μαύρο',
};

function getGreekColor(variantColorRaw) {
  if (!variantColorRaw) return null;
  const normalized = variantColorRaw.toLowerCase().trim();
  // Skip values that contain digits (e.g. "3 mehrfarbige manschetten", "2 gold + 1 silber")
  if (/\d/.test(normalized)) return null;
  // Skip long values that are clearly not simple colors
  if (normalized.length > 25) return null;
  if (COLOR_MAP_GREEK[normalized]) return COLOR_MAP_GREEK[normalized];
  // Partial match - only for short values
  for (const [key, val] of Object.entries(COLOR_MAP_GREEK)) {
    if (normalized.includes(key)) return val;
  }
  // Return as-is if we can't map
  return variantColorRaw.trim();
}

// ============================================
// MATERIAL TRANSLATIONS (for PARAM)
// ============================================

const MATERIAL_TRANSLATIONS = {
  'sterling-silver': 'ασήμι 925',
  'sterling silver': 'ασήμι 925',
  'silver': 'ασήμι 925',
  'silver-1': 'ασήμι 925',
  'gold-1': 'χρυσός',
  'gold': 'χρυσός',
  'pearl': 'μαργαριτάρι',
  'zircon': 'ζιργκόν',
  'ασήμι': 'ασήμι 925',
  'ασήμι 925': 'ασήμι 925',
};

function translateMaterial(materialStr) {
  if (!materialStr) return 'ασήμι 925';
  // Shopify metaobject references come as GID arrays - skip them
  if (materialStr.includes('gid://shopify/')) return null;
  const materials = materialStr.split(';').map(m => m.trim().toLowerCase());
  const translated = [];
  for (const mat of materials) {
    const val = MATERIAL_TRANSLATIONS[mat] || mat;
    if (!translated.includes(val)) translated.push(val);
  }
  return translated.length > 0 ? translated.join(', ') : 'ασήμι 925';
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function stripHtml(html) {
  if (!html) return '';
  return html.replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeXml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function buildProductUrl(handle, variantId) {
  return `https://${DOMAIN}/products/${handle}?variant=${variantId}`;
}

function buildProductUrlBase(handle) {
  return `https://${DOMAIN}/products/${handle}`;
}

function getGender(productType, title) {
  const type = (productType || '').toLowerCase();
  const t = (title || '').toLowerCase();
  if (type.includes('ανδρικ') || t.includes('ανδρικ')) return 'male';
  if (type.includes('γυναικ') || t.includes('γυναικ')) return 'female';
  return 'female'; // Default for jewelry
}

// ============================================
// HTTPS REQUEST HELPERS
// ============================================

function httpsRequest(options, postData = null) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
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

async function graphqlRequest(query) {
  const options = {
    hostname: SHOPIFY_STORE,
    path: `/admin/api/${API_VERSION}/graphql.json`,
    method: 'POST',
    headers: {
      'X-Shopify-Access-Token': ACCESS_TOKEN,
      'Content-Type': 'application/json'
    }
  };
  return httpsRequest(options, JSON.stringify({ query }));
}

// ============================================
// FETCH ALL ACTIVE PRODUCTS (GraphQL)
// ============================================

async function fetchProducts() {
  console.log('Fetching ALL active products from Shopify...\n');

  const allProducts = [];
  let cursor = null;
  let page = 1;

  while (true) {
    const afterClause = cursor ? `, after: "${cursor}"` : '';

    const query = `{
      products(first: 50, query: "status:active"${afterClause}) {
        pageInfo { hasNextPage endCursor }
        edges {
          node {
            id title handle descriptionHtml productType vendor tags
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
            material: metafield(namespace: "shopify", key: "jewelry-material") { value }
            materialGS: metafield(namespace: "mm-google-shopping", key: "material") { value }
            targetGender: metafield(namespace: "shopify", key: "target-gender") { value }
          }
        }
      }
    }`;

    try {
      const { data } = await graphqlRequest(query);
      if (data.errors) {
        console.error('GraphQL errors:', data.errors);
        break;
      }

      const products = data.data?.products?.edges || [];
      products.forEach(({ node }) => {
        const product = {
          id: node.id.replace('gid://shopify/Product/', ''),
          gid: node.id,
          title: node.title,
          handle: node.handle,
          body_html: node.descriptionHtml,
          product_type: node.productType,
          vendor: node.vendor,
          tags: node.tags || [],
          metafields: {
            color: node.colorPattern?.value || null,
            material: node.material?.value || null,
            materialGS: node.materialGS?.value || null,
            gender: node.targetGender?.value || null,
          },
          images: (node.images?.edges || []).map(e => ({
            id: e.node.id.replace('gid://shopify/ProductImage/', ''),
            src: e.node.url
          })),
          options: (node.options || []).map(o => ({
            name: o.name,
            values: (o.optionValues || []).map(v => v.name)
          })),
          variants: (node.variants?.edges || []).map(e => ({
            id: e.node.id.replace('gid://shopify/ProductVariant/', ''),
            gid: e.node.id,
            sku: e.node.sku,
            price: e.node.price,
            compare_at_price: e.node.compareAtPrice,
            inventory_quantity: e.node.inventoryQuantity,
            barcode: e.node.barcode,
            image_id: e.node.image?.id?.replace('gid://shopify/ProductImage/', ''),
            title: e.node.selectedOptions.map(o => o.value).join(' / '),
            selectedOptions: e.node.selectedOptions
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
// EXTRACT VARIANT COLOR
// ============================================

function extractVariantColor(selectedOptions) {
  if (!selectedOptions) return null;
  for (const opt of selectedOptions) {
    const name = (opt.name || '').toLowerCase();
    if (name.includes('χρώμα') || name.includes('color') || name.includes('colour')) {
      return opt.value;
    }
  }
  // If only one option, check if its value is an EXACT color match (not partial)
  if (selectedOptions.length === 1) {
    const val = selectedOptions[0].value.toLowerCase().trim();
    if (COLOR_MAP_GREEK[val]) return selectedOptions[0].value;
  }
  return null;
}

// ============================================
// EXTRACT VARIANT SIZE
// ============================================

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

// ============================================
// XML FEED GENERATION FOR GLAMI
// ============================================

function generateGlamiFeed(products) {
  console.log('Generating GLAMI XML feed for Greece...\n');

  const items = [];
  const stats = {
    inStock: 0,
    outOfStock: 0,
    noImage: 0,
    totalVariants: 0,
    withColor: 0,
    withMaterial: 0,
    withSize: 0,
    withDescription: 0,
    withSalePrice: 0,
    withBarcode: 0,
    categoryBreakdown: {},
    unmappedTypes: {},
    sampleItems: []
  };

  products.forEach(product => {
    // Skip gift cards - not relevant for GLAMI
    if ((product.product_type || '').toLowerCase().includes('gift card')) return;

    const variants = product.variants || [];
    const images = product.images || [];
    const mainImage = images[0]?.src || '';

    if (!mainImage) {
      stats.noImage++;
      return;
    }

    // Product-level data
    const description = stripHtml(product.body_html);
    const glamiCategory = getGlamiCategory(product.product_type);
    // Try mm-google-shopping material (readable text) first, then shopify metaobject (may be GID)
    const material = translateMaterial(product.metafields?.materialGS)
      || translateMaterial(product.metafields?.material)
      || 'ασήμι 925';

    // Track categories
    stats.categoryBreakdown[glamiCategory] = (stats.categoryBreakdown[glamiCategory] || 0) + 1;
    if (glamiCategory === DEFAULT_GLAMI_CATEGORY && product.product_type) {
      stats.unmappedTypes[product.product_type] = (stats.unmappedTypes[product.product_type] || 0) + 1;
    }

    // Alternative images (skip first = main image)
    const altImages = images.slice(1, 10).map(img => img.src);

    variants.forEach(variant => {
      // Skip out of stock
      if (variant.inventory_quantity <= 0) {
        stats.outOfStock++;
        return;
      }

      stats.inStock++;
      stats.totalVariants++;

      // Extract color & size from variant options
      const variantColorRaw = extractVariantColor(variant.selectedOptions);
      const variantSize = extractVariantSize(variant.selectedOptions);
      const greekColor = getGreekColor(variantColorRaw);

      if (greekColor) stats.withColor++;
      if (variantSize) stats.withSize++;
      if (description) stats.withDescription++;
      if (variant.barcode) stats.withBarcode++;

      // Get variant-specific image or fallback to main
      const variantImage = variant.image_id
        ? images.find(img => img.id === variant.image_id)?.src || mainImage
        : mainImage;

      // Build URLs
      const productUrl = buildProductUrlBase(product.handle);
      const variantUrl = buildProductUrl(product.handle, variant.id);

      // Price - GLAMI wants number without currency
      const price = parseFloat(variant.price);
      const compareAtPrice = variant.compare_at_price ? parseFloat(variant.compare_at_price) : null;
      const hasSalePrice = compareAtPrice && compareAtPrice > price;
      if (hasSalePrice) stats.withSalePrice++;

      // PRODUCTNAME: should NOT include size (GLAMI rule)
      // Include color variant info only if it mapped to a valid Greek color
      let productName = product.title;
      if (greekColor && variantColorRaw && variant.title !== 'Default Title') {
        // Only add color to name, not size
        const colorPart = variantColorRaw;
        if (!productName.toLowerCase().includes(colorPart.toLowerCase())) {
          productName = `${productName} - ${colorPart}`;
        }
      }
      productName = productName.substring(0, 200);

      // Collect sample items for validation
      if (stats.sampleItems.length < 10) {
        stats.sampleItems.push({
          itemId: variant.id,
          groupId: product.id,
          name: productName.substring(0, 60),
          category: glamiCategory,
          price: price
        });
      }

      // ═══════════════════════════════════════════════════════════
      // BUILD GLAMI XML SHOPITEM
      // ═══════════════════════════════════════════════════════════

      let item = `  <SHOPITEM>`;

      // MANDATORY fields
      item += `\n    <ITEM_ID>${escapeXml(variant.id)}</ITEM_ID>`;
      item += `\n    <PRODUCTNAME><![CDATA[${productName}]]></PRODUCTNAME>`;
      item += `\n    <URL>${escapeXml(productUrl)}</URL>`;
      item += `\n    <IMGURL>${escapeXml(variantImage)}</IMGURL>`;

      // PRICE_VAT - the actual selling price with VAT
      if (hasSalePrice) {
        // When on sale, PRICE_VAT should be the sale price
        item += `\n    <PRICE_VAT>${price}</PRICE_VAT>`;
      } else {
        item += `\n    <PRICE_VAT>${price}</PRICE_VAT>`;
      }

      item += `\n    <MANUFACTURER><![CDATA[${BRAND}]]></MANUFACTURER>`;
      item += `\n    <CATEGORYTEXT><![CDATA[${glamiCategory}]]></CATEGORYTEXT>`;

      // STRONGLY RECOMMENDED fields
      if (description) {
        item += `\n    <DESCRIPTION><![CDATA[${description.substring(0, 65535)}]]></DESCRIPTION>`;
      }

      item += `\n    <ITEMGROUP_ID>${escapeXml(product.id)}</ITEMGROUP_ID>`;

      // Alternative images
      altImages.forEach(img => {
        item += `\n    <IMGURL_ALTERNATIVE>${escapeXml(img)}</IMGURL_ALTERNATIVE>`;
      });

      // URL_SIZE (variant-specific URL with size preselected)
      if (variantSize) {
        item += `\n    <URL_SIZE>${escapeXml(variantUrl)}</URL_SIZE>`;
      }

      // PARAM: color
      if (greekColor) {
        item += `\n    <PARAM>`;
        item += `\n      <PARAM_NAME>χρώμα</PARAM_NAME>`;
        item += `\n      <VAL>${escapeXml(greekColor)}</VAL>`;
        item += `\n    </PARAM>`;
      }

      // PARAM: size (for rings, chokers, bracelets with size)
      if (variantSize) {
        item += `\n    <PARAM>`;
        item += `\n      <PARAM_NAME>μέγεθος</PARAM_NAME>`;
        item += `\n      <VAL>${escapeXml(variantSize)}</VAL>`;
        item += `\n    </PARAM>`;
      }

      // PARAM: material
      if (material) {
        stats.withMaterial++;
        item += `\n    <PARAM>`;
        item += `\n      <PARAM_NAME>υλικό</PARAM_NAME>`;
        item += `\n      <VAL><![CDATA[${material}]]></VAL>`;
        item += `\n    </PARAM>`;
      }

      // PARAM: style
      item += `\n    <PARAM>`;
      item += `\n      <PARAM_NAME>στιλ</PARAM_NAME>`;
      item += `\n      <VAL>χειροποίητο</VAL>`;
      item += `\n    </PARAM>`;

      // DELIVERY_DATE: 0 = in stock
      item += `\n    <DELIVERY_DATE>0</DELIVERY_DATE>`;

      // GTIN (EAN barcode) if available
      if (variant.barcode && /^\d{8,18}$/.test(variant.barcode)) {
        item += `\n    <GTIN>${variant.barcode}</GTIN>`;
      }

      item += `\n  </SHOPITEM>`;
      items.push(item);
    });
  });

  // Print stats
  console.log('   Feed Statistics:');
  console.log(`      In-stock items: ${stats.inStock}`);
  console.log(`      Out-of-stock (skipped): ${stats.outOfStock}`);
  console.log(`      Products without image (skipped): ${stats.noImage}`);
  console.log(`      With color: ${stats.withColor}`);
  console.log(`      With material: ${stats.withMaterial}`);
  console.log(`      With size: ${stats.withSize}`);
  console.log(`      With description: ${stats.withDescription}`);
  console.log(`      With sale price: ${stats.withSalePrice}`);
  console.log(`      With barcode (GTIN): ${stats.withBarcode}`);
  console.log('');

  if (Object.keys(stats.categoryBreakdown).length > 0) {
    console.log('   Category Breakdown:');
    Object.entries(stats.categoryBreakdown).sort((a, b) => b[1] - a[1]).forEach(([cat, count]) => {
      const shortCat = cat.split(' | ').pop();
      console.log(`      ${shortCat}: ${count} products`);
    });
    console.log('');
  }

  if (Object.keys(stats.unmappedTypes).length > 0) {
    console.log('   WARNING - Unmapped product types (using fallback category):');
    Object.entries(stats.unmappedTypes).forEach(([type, count]) => {
      console.log(`      "${type}": ${count} products`);
    });
    console.log('');
  }

  // Build final XML - GLAMI format (not RSS)
  const xml = `<?xml version="1.0" encoding="utf-8"?>\n<SHOP>\n${items.join('\n')}\n</SHOP>`;

  return { xml, stats };
}

// ============================================
// VALIDATION HELPER
// ============================================

function printValidationInfo(stats) {
  console.log(`\n${'='.repeat(60)}`);
  console.log('VALIDATION INFO - Compare with GLAMI piXel');
  console.log(`${'='.repeat(60)}\n`);

  console.log('Sample ITEM_IDs - These MUST match GLAMI piXel item_ids:\n');
  stats.sampleItems.forEach((sample, i) => {
    console.log(`   ${i + 1}. ITEM_ID: ${sample.itemId}`);
    console.log(`      ITEMGROUP_ID: ${sample.groupId}`);
    console.log(`      Name: ${sample.name}...`);
    console.log(`      Category: ${sample.category.split(' | ').pop()}`);
    console.log(`      Price: ${sample.price} EUR`);
    console.log('');
  });

  console.log('GLAMI piXel Integration:');
  console.log('   The ITEM_ID in the feed must match the "item_id" parameter');
  console.log('   in your GLAMI piXel tracking code on the product pages.');
  console.log('   ITEM_ID format: Shopify Variant ID (numeric)');
  console.log('');
}

// ============================================
// MAIN EXECUTION
// ============================================

async function generateFeed(options = {}) {
  console.log(`\n${'='.repeat(60)}`);
  console.log('GLAMI PRODUCT FEED GENERATOR v1.0');
  console.log(`${'='.repeat(60)}`);
  console.log(`   Target: Greece (${DOMAIN})`);
  console.log(`   Currency: EUR`);
  console.log(`   Filter: ALL active products`);
  console.log(`${'='.repeat(60)}\n`);

  // Fetch products
  const products = await fetchProducts();
  if (products.length === 0) {
    console.error('No active products found!');
    return;
  }

  // Generate feed
  const { xml, stats } = generateGlamiFeed(products);

  // Ensure output directory exists
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // Write files
  const filename = 'glami-gr.xml';
  const filepath = path.join(OUTPUT_DIR, filename);
  fs.writeFileSync(filepath, xml, 'utf8');

  // Also write dated version
  const date = new Date().toISOString().split('T')[0];
  const datedFilename = `glami-gr-${date}.xml`;
  const datedFilepath = path.join(OUTPUT_DIR, datedFilename);
  fs.writeFileSync(datedFilepath, xml, 'utf8');

  console.log(`\nFeed saved:`);
  console.log(`   ${filepath}`);
  console.log(`   ${datedFilepath}`);
  console.log(`\nSummary: ${stats.inStock} items in feed\n`);

  // Print validation info if requested
  if (options.validate) {
    printValidationInfo(stats);
  }

  return { filepath, stats };
}

// CLI
const args = process.argv.slice(2);
const options = {
  validate: args.includes('--validate') || args.includes('-v')
};

generateFeed(options).catch(console.error);
