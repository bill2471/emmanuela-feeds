/**
 * GLAMI Product Feed Generator v3.0 for EMMANUELA
 *
 * Generates a valid XML product feed per GLAMI.gr specifications.
 *
 * Key features:
 *   - ALL active products (same as Google Shopping feed)
 *   - COLOR-GROUPED: 1 SHOPITEM per color × secondOption per product
 *   - Every entry has a color PARAM (mandatory for variant grouping)
 *   - Size variants handled via URL_SIZE per entry
 *   - Skips out-of-stock variants
 *   - GLAMI CATEGORYTEXT mapping from Shopify product types
 *   - UPPERCASE XML tags as required by GLAMI
 *   - ITEM_ID = representative Shopify Variant ID (must match GLAMI piXel)
 *   - ITEMGROUP_ID = Shopify Product ID (groups color variants together)
 *   - Buffer.concat UTF-8 fix for Greek characters
 *   - CI cooldown + retry for API throttle handling
 *
 * v3.1 changes (2026-08-17):
 *   - DELIVERY block (ACS, DELIVERY_PRICE 0 — free GR shipping, per GLAMI recommendations)
 *   - size_system=EU PARAM, ONLY for entries whose sizes are all EU ring numbers (44-75)
 *
 * v3.0 changes (2026-03-20):
 *   - Μονό/Ζευγάρι split: separate entries per color × second option (correct prices)
 *   - Color-correct images: variant boundary heuristic (no cross-color contamination)
 *   - Smart title: skip redundant color suffix when material phrase implies it
 *
 * v2.0 changes (2026-02-09):
 *   - Color-grouped entries (1 per color, not 1 per variant) — fixes 1,298 blocked duplicates
 *   - Every entry now has color PARAM (default: "ασημί" for unmapped)
 *   - "Χρώμα μετάλλου" option name support
 *   - Buffer.concat UTF-8 fix (same as BestPrice/Skroutz)
 *   - API retry with exponential backoff (5 retries)
 *   - CI cooldown (30s) for GitHub Actions
 *
 * Usage:
 *   node glami-feed-gr.js                    # Generate feed
 *   node glami-feed-gr.js --validate         # Generate and show sample for validation
 *
 * Output: feeds/glami-gr.xml
 *
 * Created: 2026-02-06
 * Updated: 2026-03-20 — v3.0: Μονό/Ζευγάρι split, color-correct images, smart titles
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

// Detect CI environment for cooldown
const IS_CI = !!(process.env.CI || process.env.GITHUB_ACTIONS);

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

async function graphqlRequest(query, retries = 5) {
  const options = {
    hostname: SHOPIFY_STORE,
    path: `/admin/api/${API_VERSION}/graphql.json`,
    method: 'POST',
    headers: {
      'X-Shopify-Access-Token': ACCESS_TOKEN,
      'Content-Type': 'application/json'
    }
  };
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const result = await httpsRequest(options, JSON.stringify({ query }));
      // Handle throttle (429 or cost exceeded)
      if (result.statusCode === 429 || (result.data && result.data.errors &&
          JSON.stringify(result.data.errors).includes('Throttled'))) {
        const wait = (attempt + 1) * 4000;
        console.log(`   Throttled, waiting ${wait / 1000}s (attempt ${attempt + 1}/${retries})...`);
        await new Promise(r => setTimeout(r, wait));
        continue;
      }
      return result;
    } catch (e) {
      if (attempt < retries) {
        const wait = (attempt + 1) * 4000;
        console.log(`   Request error: ${e.message}, retrying in ${wait / 1000}s...`);
        await new Promise(r => setTimeout(r, wait));
      } else {
        throw e;
      }
    }
  }
  throw new Error('Max retries exceeded for GraphQL request');
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
            id title handle descriptionHtml productType vendor tags onlineStoreUrl
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
          onlineStoreUrl: node.onlineStoreUrl,
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
      // CI needs longer cooldown to avoid throttle across multiple feed scripts
      await new Promise(r => setTimeout(r, IS_CI ? 1500 : 300));
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
    if (name.includes('χρώμα') || name.includes('color') || name.includes('colour')
        || name === 'χρώμα μετάλλου') {
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
// EXTRACT SECOND OPTION (Μονό/Ζευγάρι split)
// ============================================

const SPLITTING_VALUES = [
  'μονό', 'ζευγάρι', 'ζεύγος',
  'αριστερό', 'δεξί', 'αριστερά', 'δεξιά',
  'pair', 'single', 'left', 'right',
];

function extractSecondOption(selectedOptions) {
  if (!selectedOptions) return null;
  for (const opt of selectedOptions) {
    const name = (opt.name || '').toLowerCase();
    if (name.includes('χρώμα') || name.includes('color') || name.includes('colour')
        || name === 'χρώμα μετάλλου') continue;
    if (name.includes('μέγεθος') || name.includes('size') || name.includes('νούμερο')) continue;
    const val = (opt.value || '').toLowerCase().trim();
    if (SPLITTING_VALUES.includes(val)) {
      return opt.value;
    }
  }
  return null;
}

// ============================================
// XML FEED GENERATION FOR GLAMI (v3.0 — color × secondOption grouped)
// ============================================

function generateGlamiFeed(products) {
  console.log('Generating GLAMI XML feed for Greece (v3.0 — color × secondOption)...\n');

  const items = [];
  const stats = {
    totalProducts: 0,
    inStock: 0,
    outOfStock: 0,
    noImage: 0,
    feedEntries: 0,
    withColor: 0,
    withMaterial: 0,
    withSize: 0,
    withDescription: 0,
    withSalePrice: 0,
    withBarcode: 0,
    withSizeVariations: 0,
    categoryBreakdown: {},
    unmappedTypes: {},
    colorBreakdown: {},
    sampleItems: []
  };

  products.forEach(product => {
    // Skip gift cards - not relevant for GLAMI
    if ((product.product_type || '').toLowerCase().includes('gift card')) return;

    // Skip products NOT published to the Online Store (status:active but unpublished
    // → /products/{handle} 404s on the storefront). Prevents dead GLAMI URLs.
    if (!product.onlineStoreUrl) { stats.skippedUnpublished = (stats.skippedUnpublished || 0) + 1; return; }

    stats.totalProducts++;
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
    const altImages = images.slice(1, 14).map(img => img.src);

    // ═══════════════════════════════════════════════════════════
    // GROUP VARIANTS BY COLOR × SECOND OPTION (v3.0)
    // ═══════════════════════════════════════════════════════════
    const hasSecondOption = variants.some(v => extractSecondOption(v.selectedOptions) !== null);
    const entryGroups = {};

    variants.forEach(variant => {
      if (variant.inventory_quantity <= 0) {
        stats.outOfStock++;
        return;
      }
      stats.inStock++;

      const variantColorRaw = extractVariantColor(variant.selectedOptions);
      const variantSize = extractVariantSize(variant.selectedOptions);
      const greekColor = getGreekColor(variantColorRaw);

      const colorKey = greekColor || '_default_';
      const secondOpt = hasSecondOption ? (extractSecondOption(variant.selectedOptions) || null) : null;
      const groupKey = secondOpt ? `${colorKey}|||${secondOpt}` : colorKey;

      if (!entryGroups[groupKey]) {
        entryGroups[groupKey] = {
          greekColor: greekColor || 'ασημί',
          rawColor: variantColorRaw || null,
          secondOption: secondOpt,
          representativeVariant: variant,
          variants: [],
          sizes: [],
          lowestPrice: parseFloat(variant.price),
          highestCompareAt: variant.compare_at_price ? parseFloat(variant.compare_at_price) : null,
        };
      }

      const group = entryGroups[groupKey];
      group.variants.push(variant);

      if (variantSize && !group.sizes.includes(variantSize)) {
        group.sizes.push(variantSize);
      }

      const price = parseFloat(variant.price);
      if (price < group.lowestPrice) {
        group.lowestPrice = price;
        group.representativeVariant = variant;
      }

      if (variant.compare_at_price) {
        const cap = parseFloat(variant.compare_at_price);
        if (!group.highestCompareAt || cap > group.highestCompareAt) {
          group.highestCompareAt = cap;
        }
      }
    });

    // Pre-compute image ranges per color group (v3.0 — color-correct images)
    const allVariantImageIds = new Set();
    for (const group of Object.values(entryGroups)) {
      for (const v of group.variants) {
        if (v.image_id) allVariantImageIds.add(v.image_id);
      }
    }
    const variantImageIndices = [];
    images.forEach((img, idx) => {
      if (allVariantImageIds.has(img.id)) {
        variantImageIndices.push({ id: img.id, idx });
      }
    });
    variantImageIndices.sort((a, b) => a.idx - b.idx);
    const imageRangeByVariantImageId = {};
    for (let i = 0; i < variantImageIndices.length; i++) {
      const start = variantImageIndices[i].idx;
      const end = i + 1 < variantImageIndices.length
        ? variantImageIndices[i + 1].idx
        : images.length;
      imageRangeByVariantImageId[variantImageIndices[i].id] = images.slice(start, end);
    }

    // ═══════════════════════════════════════════════════════════
    // BUILD 1 SHOPITEM PER ENTRY GROUP (color × secondOption)
    // ═══════════════════════════════════════════════════════════
    const groupKeys = Object.keys(entryGroups);
    const hasMultipleEntries = groupKeys.length > 1;

    groupKeys.forEach(groupKey => {
      const group = entryGroups[groupKey];
      const repVariant = group.representativeVariant;
      stats.feedEntries++;

      // Stats
      stats.withColor++;
      if (group.sizes.length > 0) stats.withSize++;
      if (description) stats.withDescription++;
      if (repVariant.barcode) stats.withBarcode++;

      // Track color breakdown
      stats.colorBreakdown[group.greekColor] = (stats.colorBreakdown[group.greekColor] || 0) + 1;

      // Color-correct images (v3.0): use variant boundary heuristic
      const groupImageIds = new Set(
        group.variants.map(v => v.image_id).filter(Boolean)
      );

      let variantImage;
      let altImages;

      if (groupImageIds.size > 0) {
        const colorImages = [];
        const seen = new Set();
        for (const imgId of groupImageIds) {
          const range = imageRangeByVariantImageId[imgId] || [];
          for (const img of range) {
            if (!seen.has(img.id)) {
              seen.add(img.id);
              colorImages.push(img);
            }
          }
        }
        variantImage = colorImages[0]?.src || mainImage;
        altImages = colorImages
          .map(img => img.src)
          .filter(src => src !== variantImage)
          .slice(0, 14);
      } else {
        variantImage = mainImage;
        altImages = [];
      }

      // URLs
      const productUrl = buildProductUrlBase(product.handle);
      const variantUrl = buildProductUrl(product.handle, repVariant.id);

      // Price
      const price = group.lowestPrice;
      const hasSalePrice = group.highestCompareAt && group.highestCompareAt > price;
      if (hasSalePrice) stats.withSalePrice++;

      // PRODUCTNAME: include color if multiple entries, add second option label
      let productName = product.title;
      if (hasMultipleEntries && group.rawColor) {
        const colorSuffix = group.rawColor;
        if (!productName.toLowerCase().includes(colorSuffix.toLowerCase())) {
          productName = `${productName} - ${colorSuffix}`;
        }
      }
      if (group.secondOption) {
        productName = `${productName} ${group.secondOption}`;
      }
      productName = productName.substring(0, 200);

      // Collect sample items for validation
      if (stats.sampleItems.length < 10) {
        stats.sampleItems.push({
          itemId: repVariant.id,
          groupId: product.id,
          name: productName.substring(0, 60),
          color: group.greekColor,
          sizes: group.sizes.length,
          variants: group.variants.length,
          category: glamiCategory,
          price: price
        });
      }

      // ═══════════════════════════════════════════════════════════
      // BUILD GLAMI XML SHOPITEM
      // ═══════════════════════════════════════════════════════════

      let item = `  <SHOPITEM>`;

      // MANDATORY fields
      item += `\n    <ITEM_ID>${escapeXml(repVariant.id)}</ITEM_ID>`;
      item += `\n    <PRODUCTNAME><![CDATA[${productName}]]></PRODUCTNAME>`;
      item += `\n    <URL>${escapeXml(productUrl)}</URL>`;
      item += `\n    <IMGURL>${escapeXml(variantImage)}</IMGURL>`;
      item += `\n    <PRICE_VAT>${price}</PRICE_VAT>`;
      item += `\n    <MANUFACTURER><![CDATA[${BRAND}]]></MANUFACTURER>`;
      item += `\n    <CATEGORYTEXT><![CDATA[${glamiCategory}]]></CATEGORYTEXT>`;

      // STRONGLY RECOMMENDED fields
      if (description) {
        item += `\n    <DESCRIPTION><![CDATA[${description.substring(0, 65535)}]]></DESCRIPTION>`;
      }

      // ITEMGROUP_ID — groups color variants of the same product
      // Only emit when there are multiple colors (GLAMI needs this for variant grouping)
      if (hasMultipleEntries) {
        item += `\n    <ITEMGROUP_ID>${escapeXml(product.id)}</ITEMGROUP_ID>`;
      }

      // Alternative images (v3.0: color-correct only)
      altImages.forEach(img => {
        item += `\n    <IMGURL_ALTERNATIVE>${escapeXml(img)}</IMGURL_ALTERNATIVE>`;
      });

      // URL_SIZE (variant-specific URL)
      item += `\n    <URL_SIZE>${escapeXml(variantUrl)}</URL_SIZE>`;

      // PARAM: color — ALWAYS present (mandatory for GLAMI variant grouping)
      item += `\n    <PARAM>`;
      item += `\n      <PARAM_NAME>χρώμα</PARAM_NAME>`;
      item += `\n      <VAL>${escapeXml(group.greekColor)}</VAL>`;
      item += `\n    </PARAM>`;

      // PARAM: size — comma-separated sizes if multiple, single if one
      if (group.sizes.length > 0) {
        stats.withSizeVariations++;
        item += `\n    <PARAM>`;
        item += `\n      <PARAM_NAME>μέγεθος</PARAM_NAME>`;
        item += `\n      <VAL>${escapeXml(group.sizes.join(', '))}</VAL>`;
        item += `\n    </PARAM>`;
        // PARAM: size_system (GLAMI recommended) — ONLY when every size is an EU
        // ring-size number (44-75). Chain/wrist lengths in cm are NOT a size system.
        const allEuRingSizes = group.sizes.every(s => /^\d{2}$/.test(String(s).trim()) && +String(s).trim() >= 44 && +String(s).trim() <= 75);
        if (allEuRingSizes) {
          stats.withSizeSystem = (stats.withSizeSystem || 0) + 1;
          item += `\n    <PARAM>`;
          item += `\n      <PARAM_NAME>size_system</PARAM_NAME>`;
          item += `\n      <VAL>EU</VAL>`;
          item += `\n    </PARAM>`;
        }
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

      // DELIVERY (GLAMI recommended): free courier shipping in Greece
      // (verified on the live storefront shipping page: «Δωρεάν μεταφορικά»)
      item += `\n    <DELIVERY>`;
      item += `\n      <DELIVERY_ID>ACS</DELIVERY_ID>`;
      item += `\n      <DELIVERY_PRICE>0</DELIVERY_PRICE>`;
      item += `\n    </DELIVERY>`;

      // GTIN (EAN barcode) if available
      if (repVariant.barcode && /^\d{8,18}$/.test(repVariant.barcode)) {
        item += `\n    <GTIN>${repVariant.barcode}</GTIN>`;
      }

      item += `\n  </SHOPITEM>`;
      items.push(item);
    });
  });

  // Print stats
  console.log('   Feed Statistics:');
  console.log(`      Total products: ${stats.totalProducts}`);
  console.log(`      In-stock variants: ${stats.inStock}`);
  console.log(`      Out-of-stock variants (skipped): ${stats.outOfStock}`);
  console.log(`      Products without image (skipped): ${stats.noImage}`);
  console.log(`      Feed entries (color-grouped): ${stats.feedEntries}`);
  console.log(`      With color: ${stats.withColor} (100%)`);
  console.log(`      With material: ${stats.withMaterial}`);
  console.log(`      With size: ${stats.withSize}`);
  console.log(`      With size variations: ${stats.withSizeVariations}`);
  console.log(`      With description: ${stats.withDescription}`);
  console.log(`      With sale price: ${stats.withSalePrice}`);
  console.log(`      With barcode (GTIN): ${stats.withBarcode}`);
  console.log('');

  if (Object.keys(stats.colorBreakdown).length > 0) {
    console.log('   Color Breakdown:');
    Object.entries(stats.colorBreakdown).sort((a, b) => b[1] - a[1]).forEach(([color, count]) => {
      console.log(`      ${color}: ${count} entries`);
    });
    console.log('');
  }

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

  console.log('Sample entries (color-grouped) - ITEM_IDs must match GLAMI piXel:\n');
  stats.sampleItems.forEach((sample, i) => {
    console.log(`   ${i + 1}. ITEM_ID: ${sample.itemId}`);
    console.log(`      ITEMGROUP_ID: ${sample.groupId}`);
    console.log(`      Name: ${sample.name}...`);
    console.log(`      Color: ${sample.color}`);
    console.log(`      Sizes: ${sample.sizes || 0} | Variants in group: ${sample.variants}`);
    console.log(`      Category: ${sample.category.split(' | ').pop()}`);
    console.log(`      Price: ${sample.price} EUR`);
    console.log('');
  });

  console.log('GLAMI piXel Integration:');
  console.log('   The ITEM_ID in the feed = representative Shopify Variant ID');
  console.log('   The piXel sends the current variant ID — GLAMI matches via ITEMGROUP_ID');
  console.log('   ITEM_ID format: Shopify Variant ID (numeric)');
  console.log('');
}

// ============================================
// MAIN EXECUTION
// ============================================

async function generateFeed(options = {}) {
  console.log(`\n${'='.repeat(60)}`);
  console.log('GLAMI PRODUCT FEED GENERATOR v3.0 (color × secondOption)');
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
