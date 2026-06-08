/**
 * GLAMI Product Feed Generator v1.0 for EMMANUELA SHOES
 *
 * Generates a valid XML product feed per GLAMI.gr specifications.
 * Based on glami-feed-gr.js v3.0 (jewelry), adapted for leather sandals.
 *
 * Key features:
 *   - ALL active products (Shopify GraphQL API)
 *   - COLOR-GROUPED: 1 SHOPITEM per color × secondOption per product
 *   - Every entry has a color PARAM (mandatory for variant grouping)
 *   - Size variants (shoe sizes 35-45) handled via PARAM per color group
 *   - Skips out-of-stock variants
 *   - GLAMI CATEGORYTEXT mapping for sandals/shoes
 *   - UPPERCASE XML tags as required by GLAMI
 *   - ITEM_ID = representative Shopify Variant ID (must match GLAMI piXel)
 *   - ITEMGROUP_ID = Shopify Product ID (groups color variants together)
 *   - Buffer.concat UTF-8 fix for Greek characters
 *   - CI cooldown + retry for API throttle handling
 *
 * Usage:
 *   node glami-feed-shoes.js                    # Generate feed
 *   node glami-feed-shoes.js --validate         # Generate and show sample
 *
 * Output: feeds/glami-shoes.xml
 *
 * Created: 2026-03-20
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

// ============================================
// CONFIGURATION
// ============================================

const SHOPIFY_STORE = 'emmanuela-shoes.myshopify.com';
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
if (!ACCESS_TOKEN) {
  console.error('ERROR: SHOPIFY_ACCESS_TOKEN environment variable not set!');
  console.error('   Set it with: set SHOPIFY_ACCESS_TOKEN=your_token_here');
  process.exit(1);
}
const API_VERSION = '2024-01';
const BRAND = 'Emmanuela - handcrafted for you';
const OUTPUT_DIR = path.join(__dirname, 'feeds');
const DOMAIN = 'emmanuela.shoes';

// ============================================
// GLAMI CATEGORY MAPPING (SHOES/SANDALS)
// ============================================

// GLAMI category taxonomy for shoes
// Full path format: "Glami.gr | Gender section | Shoe category | Sub-category"
// NOTE: Verify these paths against GLAMI's actual taxonomy after first submission.
const GLAMI_CATEGORY_MAP = {
  // --- Women's ---
  'γυναικεία σανδάλια':                    'Glami.gr | Γυναικεία ρούχα και παπούτσια | Γυναικεία παπούτσια | Γυναικεία σανδάλια',
  'γυναικεία δερμάτινα σανδάλια':          'Glami.gr | Γυναικεία ρούχα και παπούτσια | Γυναικεία παπούτσια | Γυναικεία σανδάλια',
  'γυναικεία flat σανδάλια':               'Glami.gr | Γυναικεία ρούχα και παπούτσια | Γυναικεία παπούτσια | Γυναικεία σανδάλια',
  'γυναικεία πέδιλα':                      'Glami.gr | Γυναικεία ρούχα και παπούτσια | Γυναικεία παπούτσια | Γυναικεία πέδιλα',
  'γυναικείες πλατφόρμες':                 'Glami.gr | Γυναικεία ρούχα και παπούτσια | Γυναικεία παπούτσια | Γυναικείες πλατφόρμες',
  'γυναικεία πλατφόρμες':                  'Glami.gr | Γυναικεία ρούχα και παπούτσια | Γυναικεία παπούτσια | Γυναικείες πλατφόρμες',
  'γυναικεία slides':                      'Glami.gr | Γυναικεία ρούχα και παπούτσια | Γυναικεία παπούτσια | Γυναικεία σανδάλια',
  'γυναικεία σαγιονάρες':                  'Glami.gr | Γυναικεία ρούχα και παπούτσια | Γυναικεία παπούτσια | Γυναικείες σαγιονάρες',
  'γυναικείες παντόφλες':                  'Glami.gr | Γυναικεία ρούχα και παπούτσια | Γυναικεία παπούτσια | Γυναικείες παντόφλες',
  // --- Men's ---
  'ανδρικά σανδάλια':                      'Glami.gr | Ανδρικά ρούχα και παπούτσια | Ανδρικά παπούτσια | Ανδρικά σανδάλια',
  'ανδρικά δερμάτινα σανδάλια':            'Glami.gr | Ανδρικά ρούχα και παπούτσια | Ανδρικά παπούτσια | Ανδρικά σανδάλια',
  'ανδρικά slides':                        'Glami.gr | Ανδρικά ρούχα και παπούτσια | Ανδρικά παπούτσια | Ανδρικά σανδάλια',
  'ανδρικά πέδιλα':                        'Glami.gr | Ανδρικά ρούχα και παπούτσια | Ανδρικά παπούτσια | Ανδρικά πέδιλα',
  'ανδρικές παντόφλες':                    'Glami.gr | Ανδρικά ρούχα και παπούτσια | Ανδρικά παπούτσια | Ανδρικές παντόφλες',
  // --- Kids ---
  'παιδικά σανδάλια':                      'Glami.gr | Παιδικά ρούχα και παπούτσια | Παιδικά παπούτσια | Παιδικά σανδάλια',
  // --- Specific types from store ---
  'σανδάλια μονομάχου':                    'Glami.gr | Γυναικεία ρούχα και παπούτσια | Γυναικεία παπούτσια | Γυναικεία σανδάλια',
  'σανδάλια με λουριά στη φτέρνα':         'Glami.gr | Γυναικεία ρούχα και παπούτσια | Γυναικεία παπούτσια | Γυναικεία σανδάλια',
  'εσπαντρίγιες':                          'Glami.gr | Γυναικεία ρούχα και παπούτσια | Γυναικεία παπούτσια | Γυναικείες εσπαντρίγιες',
  'flat mules':                            'Glami.gr | Γυναικεία ρούχα και παπούτσια | Γυναικεία παπούτσια | Γυναικείες παντόφλες',
  // --- Generic / English ---
  'σανδάλια':                              'Glami.gr | Γυναικεία ρούχα και παπούτσια | Γυναικεία παπούτσια | Γυναικεία σανδάλια',
  'δερμάτινα σανδάλια':                    'Glami.gr | Γυναικεία ρούχα και παπούτσια | Γυναικεία παπούτσια | Γυναικεία σανδάλια',
  'leather sandals':                       'Glami.gr | Γυναικεία ρούχα και παπούτσια | Γυναικεία παπούτσια | Γυναικεία σανδάλια',
  'sandals':                               'Glami.gr | Γυναικεία ρούχα και παπούτσια | Γυναικεία παπούτσια | Γυναικεία σανδάλια',
  'women sandals':                         'Glami.gr | Γυναικεία ρούχα και παπούτσια | Γυναικεία παπούτσια | Γυναικεία σανδάλια',
  'men sandals':                           'Glami.gr | Ανδρικά ρούχα και παπούτσια | Ανδρικά παπούτσια | Ανδρικά σανδάλια',
  'slides':                                'Glami.gr | Γυναικεία ρούχα και παπούτσια | Γυναικεία παπούτσια | Γυναικεία σανδάλια',
  'πέδιλα':                                'Glami.gr | Γυναικεία ρούχα και παπούτσια | Γυναικεία παπούτσια | Γυναικεία πέδιλα',
  'πλατφόρμες':                            'Glami.gr | Γυναικεία ρούχα και παπούτσια | Γυναικεία παπούτσια | Γυναικείες πλατφόρμες',
};

// Keyword-based fallback for partial matches
const GLAMI_CATEGORY_KEYWORDS = [
  // Gender-specific — order matters, more specific first
  { keywords: ['ανδρικ', 'σανδάλ'],       category: 'Glami.gr | Ανδρικά ρούχα και παπούτσια | Ανδρικά παπούτσια | Ανδρικά σανδάλια' },
  { keywords: ['ανδρικ', 'πέδιλ'],        category: 'Glami.gr | Ανδρικά ρούχα και παπούτσια | Ανδρικά παπούτσια | Ανδρικά πέδιλα' },
  { keywords: ['ανδρικ', 'παντόφλ'],      category: 'Glami.gr | Ανδρικά ρούχα και παπούτσια | Ανδρικά παπούτσια | Ανδρικές παντόφλες' },
  { keywords: ['γυναικεί', 'πλατφόρμ'],   category: 'Glami.gr | Γυναικεία ρούχα και παπούτσια | Γυναικεία παπούτσια | Γυναικείες πλατφόρμες' },
  { keywords: ['γυναικεί', 'σανδάλ'],     category: 'Glami.gr | Γυναικεία ρούχα και παπούτσια | Γυναικεία παπούτσια | Γυναικεία σανδάλια' },
  { keywords: ['γυναικεί', 'πέδιλ'],      category: 'Glami.gr | Γυναικεία ρούχα και παπούτσια | Γυναικεία παπούτσια | Γυναικεία πέδιλα' },
  { keywords: ['γυναικεί', 'σαγιονάρ'],   category: 'Glami.gr | Γυναικεία ρούχα και παπούτσια | Γυναικεία παπούτσια | Γυναικείες σαγιονάρες' },
  { keywords: ['γυναικεί', 'παντόφλ'],    category: 'Glami.gr | Γυναικεία ρούχα και παπούτσια | Γυναικεία παπούτσια | Γυναικείες παντόφλες' },
  { keywords: ['παιδικ', 'σανδάλ'],       category: 'Glami.gr | Παιδικά ρούχα και παπούτσια | Παιδικά παπούτσια | Παιδικά σανδάλια' },
  // Generic fallbacks
  { keywords: ['πλατφόρμ'],               category: 'Glami.gr | Γυναικεία ρούχα και παπούτσια | Γυναικεία παπούτσια | Γυναικείες πλατφόρμες' },
  { keywords: ['σαγιονάρ'],               category: 'Glami.gr | Γυναικεία ρούχα και παπούτσια | Γυναικεία παπούτσια | Γυναικείες σαγιονάρες' },
  { keywords: ['παντόφλ'],                category: 'Glami.gr | Γυναικεία ρούχα και παπούτσια | Γυναικεία παπούτσια | Γυναικείες παντόφλες' },
  { keywords: ['πέδιλ'],                  category: 'Glami.gr | Γυναικεία ρούχα και παπούτσια | Γυναικεία παπούτσια | Γυναικεία πέδιλα' },
  { keywords: ['σανδάλ'],                 category: 'Glami.gr | Γυναικεία ρούχα και παπούτσια | Γυναικεία παπούτσια | Γυναικεία σανδάλια' },
  { keywords: ['μονομάχ'],                category: 'Glami.gr | Γυναικεία ρούχα και παπούτσια | Γυναικεία παπούτσια | Γυναικεία σανδάλια' },
  { keywords: ['λουριά', 'φτέρνα'],       category: 'Glami.gr | Γυναικεία ρούχα και παπούτσια | Γυναικεία παπούτσια | Γυναικεία σανδάλια' },
  { keywords: ['εσπαντρίγ'],              category: 'Glami.gr | Γυναικεία ρούχα και παπούτσια | Γυναικεία παπούτσια | Γυναικείες εσπαντρίγιες' },
  { keywords: ['mule'],                   category: 'Glami.gr | Γυναικεία ρούχα και παπούτσια | Γυναικεία παπούτσια | Γυναικείες παντόφλες' },
  { keywords: ['sandal'],                 category: 'Glami.gr | Γυναικεία ρούχα και παπούτσια | Γυναικεία παπούτσια | Γυναικεία σανδάλια' },
  { keywords: ['slide'],                  category: 'Glami.gr | Γυναικεία ρούχα και παπούτσια | Γυναικεία παπούτσια | Γυναικεία σανδάλια' },
  { keywords: ['men'],                    category: 'Glami.gr | Ανδρικά ρούχα και παπούτσια | Ανδρικά παπούτσια | Ανδρικά σανδάλια' },
];

const DEFAULT_GLAMI_CATEGORY = 'Glami.gr | Γυναικεία ρούχα και παπούτσια | Γυναικεία παπούτσια | Γυναικεία σανδάλια';

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
// COLOR MAPPING (Greek/English variant names → Greek color for GLAMI)
// ============================================

// Leather sandal color palette
const COLOR_MAP_GREEK = {
  // Brown / Tan family (most common for leather sandals)
  'καφέ': 'καφέ', 'καφε': 'καφέ', 'σκούρο καφέ': 'καφέ', 'σκουρο καφε': 'καφέ',
  'ανοιχτό καφέ': 'καφέ', 'ανοιχτο καφε': 'καφέ',
  'ταμπά': 'ταμπά', 'ταμπα': 'ταμπά', 'tab': 'ταμπά', 'tan': 'ταμπά',
  'κανελί': 'καφέ', 'κανελι': 'καφέ',
  'σοκολά': 'καφέ', 'σοκολατί': 'καφέ',
  'brown': 'καφέ', 'dark brown': 'καφέ', 'light brown': 'καφέ',
  'chocolate': 'καφέ', 'chestnut': 'καφέ', 'tobacco': 'ταμπά',
  'cognac': 'ταμπά', 'camel': 'ταμπά', 'honey': 'ταμπά',
  // Black
  'μαύρο': 'μαύρο', 'μαύρα': 'μαύρο', 'μαύρος': 'μαύρο',
  'black': 'μαύρο',
  // White / Natural
  'λευκό': 'λευκό', 'λευκά': 'λευκό', 'λευκός': 'λευκό', 'άσπρο': 'λευκό',
  'white': 'λευκό', 'off-white': 'λευκό', 'offwhite': 'λευκό',
  'φυσικό': 'μπεζ', 'natural': 'μπεζ', 'nude': 'μπεζ',
  // Beige / Cream
  'μπεζ': 'μπεζ', 'εκρού': 'μπεζ', 'κρεμ': 'μπεζ',
  'beige': 'μπεζ', 'cream': 'μπεζ', 'ivory': 'μπεζ',
  // Red / Coral
  'κόκκινο': 'κόκκινο', 'κόκκινα': 'κόκκινο', 'red': 'κόκκινο',
  'μπορντό': 'μπορντό', 'bordeaux': 'μπορντό', 'burgundy': 'μπορντό', 'wine': 'μπορντό',
  'κοραλί': 'κοραλί', 'coral': 'κοραλί',
  // Green / Olive
  'πράσινο': 'πράσινο', 'πράσινα': 'πράσινο', 'green': 'πράσινο',
  'ελιά': 'πράσινο', 'λαδί': 'πράσινο', 'olive': 'πράσινο', 'χακί': 'πράσινο', 'khaki': 'πράσινο',
  // Blue
  'μπλε': 'μπλε', 'blue': 'μπλε', 'navy': 'μπλε', 'ναυτικό μπλε': 'μπλε',
  'τιρκουάζ': 'τιρκουάζ', 'turquoise': 'τιρκουάζ',
  // Yellow / Gold
  'κίτρινο': 'κίτρινο', 'κίτρινα': 'κίτρινο', 'yellow': 'κίτρινο',
  'χρυσό': 'χρυσό', 'χρυσός': 'χρυσό', 'gold': 'χρυσό', 'golden': 'χρυσό',
  // Silver / Metallic
  'ασημί': 'ασημί', 'ασημένιο': 'ασημί', 'silver': 'ασημί',
  // Pink
  'ροζ': 'ροζ', 'pink': 'ροζ', 'fuchsia': 'ροζ', 'φούξια': 'ροζ',
  // Grey
  'γκρι': 'γκρι', 'grey': 'γκρι', 'gray': 'γκρι',
  // Orange
  'πορτοκαλί': 'πορτοκαλί', 'orange': 'πορτοκαλί',
  // Multi
  'πολύχρωμο': 'πολύχρωμο', 'πολύχρωμα': 'πολύχρωμο', 'multi': 'πολύχρωμο', 'multicolor': 'πολύχρωμο',
  'πολύχρωμη ψάθα': 'πολύχρωμο',
  // Special / Pattern colors from store
  'μουσταρδί': 'κίτρινο', 'mustard': 'κίτρινο',
  'λέοπαρντ': 'πολύχρωμο', 'leopard': 'πολύχρωμο',
  'δέρμα φιδιού': 'πολύχρωμο', 'snake': 'πολύχρωμο', 'snakeskin': 'πολύχρωμο',
  'ζέβρα': 'πολύχρωμο', 'zebra': 'πολύχρωμο',
  'πάγος': 'λευκό', 'ice': 'λευκό',
  'κεραμιδί': 'κόκκινο', 'terracotta': 'κόκκινο',
  'μέντα': 'πράσινο', 'mint': 'πράσινο',
  'λιλά': 'μωβ', 'λιλά μεταλλικό': 'μωβ', 'lilac': 'μωβ',
  'σκούρο ματζέντα σουέντ': 'ροζ', 'magenta': 'ροζ',
  'άμμος': 'μπεζ', 'sand': 'μπεζ',
  'πετρόλ': 'μπλε', 'πετρόλ σουέντ': 'μπλε', 'teal': 'μπλε', 'petrol': 'μπλε',
  'λιλά σουέντ': 'μωβ',
  'xρυσό': 'χρυσό',
  'μωβ': 'μωβ', 'purple': 'μωβ',
};

function getGreekColor(variantColorRaw) {
  if (!variantColorRaw) return null;
  const normalized = variantColorRaw.toLowerCase().trim();
  if (/\d/.test(normalized)) return null;
  if (normalized.length > 30) return null;
  if (COLOR_MAP_GREEK[normalized]) return COLOR_MAP_GREEK[normalized];
  for (const [key, val] of Object.entries(COLOR_MAP_GREEK)) {
    if (normalized.includes(key)) return val;
  }
  return variantColorRaw.trim();
}

// ============================================
// MATERIAL TRANSLATIONS (for PARAM)
// ============================================

// Shoes: leather-based materials instead of jewelry metals
const MATERIAL_TRANSLATIONS = {
  'leather': 'δέρμα',
  'genuine leather': 'γνήσιο δέρμα',
  'full grain leather': 'δέρμα πλήρους κόκκου',
  'nubuck': 'nubuck δέρμα',
  'suede': 'σουέντ',
  'nappa': 'nappa δέρμα',
  'vegetable tanned': 'φυτικής δέψης δέρμα',
  'rubber': 'καουτσούκ',
  'eva': 'EVA',
  'δέρμα': 'δέρμα',
  'γνήσιο δέρμα': 'γνήσιο δέρμα',
  'σουέντ': 'σουέντ',
  'καουτσούκ': 'καουτσούκ',
};

function translateMaterial(materialStr) {
  if (!materialStr) return 'δέρμα';
  // Shopify metaobject references come as GID arrays - skip them
  if (materialStr.includes('gid://shopify/')) return null;
  const materials = materialStr.split(';').map(m => m.trim().toLowerCase());
  const translated = [];
  for (const mat of materials) {
    const val = MATERIAL_TRANSLATIONS[mat] || mat;
    if (!translated.includes(val)) translated.push(val);
  }
  return translated.length > 0 ? translated.join(', ') : 'δέρμα';
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
  if (type.includes('ανδρικ') || t.includes('ανδρικ') || t.includes('men')) return 'male';
  if (type.includes('παιδικ') || t.includes('παιδικ') || t.includes('kid')) return 'unisex';
  if (type.includes('γυναικ') || t.includes('γυναικ')) return 'female';
  return 'female'; // Default for sandals store
}

// ============================================
// HTTPS REQUEST HELPERS
// ============================================

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
            material: metafield(namespace: "shopify", key: "material") { value }
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
  if (selectedOptions.length === 1) {
    const val = selectedOptions[0].value.toLowerCase().trim();
    if (COLOR_MAP_GREEK[val]) return selectedOptions[0].value;
  }
  return null;
}

// ============================================
// EXTRACT VARIANT SIZE (shoe sizes)
// ============================================

// Strip "EU " prefix from shoe sizes (e.g. "EU 37" → "37")
function normalizeShoeSize(size) {
  if (!size) return size;
  return size.replace(/^EU\s*/i, '').trim();
}

function extractVariantSize(selectedOptions) {
  if (!selectedOptions) return null;
  for (const opt of selectedOptions) {
    const name = (opt.name || '').toLowerCase();
    if (name.includes('μέγεθος') || name.includes('size') || name.includes('νούμερο')
        || name.includes('number') || name.includes('shoe size')) {
      return normalizeShoeSize(opt.value);
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
    if (name.includes('μέγεθος') || name.includes('size') || name.includes('νούμερο')
        || name.includes('number') || name.includes('shoe size')) continue;
    const val = (opt.value || '').toLowerCase().trim();
    if (SPLITTING_VALUES.includes(val)) {
      return opt.value;
    }
  }
  return null;
}

// ============================================
// XML FEED GENERATION FOR GLAMI (color × secondOption grouped)
// ============================================

function generateGlamiFeed(products) {
  console.log('Generating GLAMI XML feed for Shoes (color × secondOption)...\n');

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

  // Cross-product dedupe (shoes Shopify catalog is ~4x duplicated: same physical sandal
  // = multiple products with mirrored inventory). Key = MPN | greekColor | size-set.
  // Ported from bestprice-feed-shoes.js (2026-06-08) — without it GLAMI shows ~4x copies.
  const seenDedupeKeys = new Map();

  products.forEach(product => {
    // Skip gift cards
    if ((product.product_type || '').toLowerCase().includes('gift card')) return;

    // Skip products NOT published to the Online Store (status:active but unpublished
    // → /products/{handle} 404s). URL audit 2026-06-08 found "Ιθάκη" dups leaking 36 404 URLs.
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
    // Try mm-google-shopping material first, then shopify metafield
    const material = translateMaterial(product.metafields?.materialGS)
      || translateMaterial(product.metafields?.material)
      || 'δέρμα';

    // Track categories
    stats.categoryBreakdown[glamiCategory] = (stats.categoryBreakdown[glamiCategory] || 0) + 1;
    if (glamiCategory === DEFAULT_GLAMI_CATEGORY && product.product_type) {
      stats.unmappedTypes[product.product_type] = (stats.unmappedTypes[product.product_type] || 0) + 1;
    }

    // ═══════════════════════════════════════════════════════════
    // GROUP VARIANTS BY COLOR × SECOND OPTION
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
          greekColor: greekColor || 'καφέ',
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

    // Pre-compute image ranges per color group (color-correct images)
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

      // Cross-product dedupe: skip if this (MPN, color, size-set) already emitted (4x catalog dup).
      const dedupeKey = `${repVariant.sku || 'EMM-' + repVariant.id}|${group.greekColor}|${group.sizes.slice().sort().join(',')}`;
      if (seenDedupeKeys.has(dedupeKey)) { stats.dedupedSkipped = (stats.dedupedSkipped || 0) + 1; return; }
      seenDedupeKeys.set(dedupeKey, repVariant.id);

      stats.feedEntries++;

      // Stats
      stats.withColor++;
      if (group.sizes.length > 0) stats.withSize++;
      if (description) stats.withDescription++;
      if (repVariant.barcode) stats.withBarcode++;

      // Track color breakdown
      stats.colorBreakdown[group.greekColor] = (stats.colorBreakdown[group.greekColor] || 0) + 1;

      // Color-correct images: use variant boundary heuristic
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

      // Sort sizes numerically for shoe sizes
      const sortedSizes = group.sizes.slice().sort((a, b) => {
        const na = parseFloat(a);
        const nb = parseFloat(b);
        if (!isNaN(na) && !isNaN(nb)) return na - nb;
        return a.localeCompare(b);
      });

      // Collect sample items for validation
      if (stats.sampleItems.length < 10) {
        stats.sampleItems.push({
          itemId: repVariant.id,
          groupId: product.id,
          name: productName.substring(0, 60),
          color: group.greekColor,
          sizes: sortedSizes.length,
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
      if (hasMultipleEntries) {
        item += `\n    <ITEMGROUP_ID>${escapeXml(product.id)}</ITEMGROUP_ID>`;
      }

      // Alternative images (color-correct only)
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

      // PARAM: size — shoe sizes, sorted numerically, comma-separated
      if (sortedSizes.length > 0) {
        stats.withSizeVariations++;
        item += `\n    <PARAM>`;
        item += `\n      <PARAM_NAME>μέγεθος</PARAM_NAME>`;
        item += `\n      <VAL>${escapeXml(sortedSizes.join(', '))}</VAL>`;
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

  // Build final XML - GLAMI format
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
  console.log('GLAMI PRODUCT FEED GENERATOR v1.0 — EMMANUELA SHOES');
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
  const filename = 'glami-shoes.xml';
  const filepath = path.join(OUTPUT_DIR, filename);
  fs.writeFileSync(filepath, xml, 'utf8');

  const date = new Date().toISOString().split('T')[0];
  const datedFilename = `glami-shoes-${date}.xml`;
  const datedFilepath = path.join(OUTPUT_DIR, datedFilename);
  fs.writeFileSync(datedFilepath, xml, 'utf8');

  console.log(`\nFeed saved:`);
  console.log(`   ${filepath}`);
  console.log(`   ${datedFilepath}`);
  console.log(`\nSummary: ${stats.feedEntries} entries in feed\n`);

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
