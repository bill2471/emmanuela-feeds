/**
 * Google Shopping Feed Generator v5.0 for EMMANUELA
 * 
 * NEW in v5 (from v4):
 *   - Dynamic Google Product Categories (not hardcoded 188)
 *   - Shipping weight from variant.weight
 *   - Size attribute for rings
 *   - Better category mapping from productType
 * 
 * Usage: 
 *   node google-shopping-feed-v5.js GR          # Single market
 *   node google-shopping-feed-v5.js all         # All markets
 *   node google-shopping-feed-v5.js list        # List available markets
 * 
 * Created: 2026-01-28
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

// ============================================
// CONFIGURATION
// ============================================

const SHOPIFY_STORE = 'emmanuela-gr.myshopify.com';
// Token: MUST be set via environment variable (for security)
// Local: set SHOPIFY_ACCESS_TOKEN=shpat_xxx before running
// GitHub Actions: uses repository secret
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
if (!ACCESS_TOKEN) {
  console.error('❌ ERROR: SHOPIFY_ACCESS_TOKEN environment variable not set!');
  console.error('   Set it with: set SHOPIFY_ACCESS_TOKEN=your_token_here');
  process.exit(1);
}
const API_VERSION = '2024-01';
const BRAND = 'Emmanuela - handcrafted for you';
const OUTPUT_DIR = path.join(__dirname, 'feeds');

// ============================================
// v5 NEW: GOOGLE PRODUCT CATEGORY MAPPING
// ============================================

const GOOGLE_CATEGORY_MAP = {
  // Specific jewelry categories
  'earrings': 194,        // Apparel & Accessories > Jewelry > Earrings
  'σκουλαρίκια': 194,
  'ear cuff': 194,
  'rings': 200,           // Apparel & Accessories > Jewelry > Rings
  'δαχτυλίδια': 200,
  'δαχτυλίδι': 200,
  'ring': 200,
  'bracelets': 191,       // Apparel & Accessories > Jewelry > Bracelets
  'βραχιόλια': 191,
  'βραχιόλι': 191,
  'bracelet': 191,
  'necklaces': 196,       // Apparel & Accessories > Jewelry > Necklaces
  'κολιέ': 196,
  'necklace': 196,
  'pendants': 192,        // Apparel & Accessories > Jewelry > Charms & Pendants
  'μενταγιόν': 192,
  'pendant': 192,
  'charms': 192,
  'brooches': 197,        // Apparel & Accessories > Jewelry > Brooches & Lapel Pins
  'καρφίτσες': 197,
  'brooch': 197,
  'pins': 197,
  'jewelry sets': 6463,   // Apparel & Accessories > Jewelry > Jewelry Sets
  'σετ': 6463,
  'set': 6463,
  // Hair accessories for wedding wreaths
  'στέφανα': 110,         // Hair Accessories > Hair Wreaths
  'hair wreaths': 110,
  'wreaths': 110,
  // Gift cards
  'gift card': 53,
  'gift cards': 53,
  'δωροκάρτα': 53,
};

// Default category for jewelry
const DEFAULT_GOOGLE_CATEGORY = 188;  // Apparel & Accessories > Jewelry

/**
 * v5: Get Google Product Category from product type
 */
function getGoogleCategory(productType) {
  if (!productType) return DEFAULT_GOOGLE_CATEGORY;
  
  const type = productType.toLowerCase();
  
  // Check for specific keywords
  for (const [keyword, categoryId] of Object.entries(GOOGLE_CATEGORY_MAP)) {
    if (type.includes(keyword)) {
      return categoryId;
    }
  }
  
  return DEFAULT_GOOGLE_CATEGORY;
}

// ============================================
// COLOR TRANSLATIONS (Greek to English for Google)
// ============================================

const COLOR_TRANSLATIONS = {
  // Main colors
  'επιχρυσωμένο': 'Gold',
  'επιχρυσωμένα': 'Gold',
  'επιχρυσωμένος': 'Gold',
  'επιχρυσωμένη': 'Gold',
  'χρυσό': 'Gold',
  'χρυσός': 'Gold',
  'ασημένιο': 'Silver',
  'ασημένια': 'Silver',
  'ασημένιος': 'Silver',
  'ασημί': 'Silver',
  'silver': 'Silver',
  'gold': 'Gold',
  'μαύρο': 'Black',
  'μαύρα': 'Black',
  'μαύρος': 'Black',
  'οξειδωμένο': 'Gray',
  'οξειδωμένα': 'Gray',
  'ανθρακί': 'Gray',
  'ροζ': 'Rose Gold',
  'ροζ επιχρυσωμένο': 'Rose Gold',
  'ροζ χρυσό': 'Rose Gold',
  'λευκό': 'White',
  'λευκά': 'White',
  'μπλε': 'Blue',
  'πράσινο': 'Green',
  'πράσινα': 'Green',
  'κόκκινο': 'Red',
  'κόκκινα': 'Red',
  'μπορντό': 'Burgundy',
  'μωβ': 'Purple',
  'τιρκουάζ': 'Turquoise',
  'σομόν': 'Coral',
  // Combinations
  'ασημένιο με μπλε': 'Silver/Blue',
  'ασημένιο με πράσινο': 'Silver/Green',
  'επιχρυσωμένο με σομόν': 'Gold/Coral',
  'μαύρο ανθρακί': 'Black',
};

// ============================================
// MATERIAL TRANSLATIONS
// ============================================

const MATERIAL_TRANSLATIONS = {
  'sterling-silver': 'Sterling Silver',
  'silver': 'Silver',
  'silver-1': 'Silver',
  'gold-1': 'Gold',
  'gold': 'Gold',
  'synthetic': 'Synthetic',
  'pearl': 'Pearl',
  'zircon': 'Zircon',
  'ασήμι': 'Sterling Silver',
  'ασήμι 925': 'Sterling Silver',
};

// ============================================
// MARKET DEFINITIONS (49 markets)
// ============================================

const MARKETS = {
  // DEDICATED DOMAINS
  GR: { country: 'GR', language: 'el', currency: 'EUR', locale: 'el', domain: 'emmanuela.gr', path: '', priority: 0, name: 'Greece' },
  DE: { country: 'DE', language: 'de', currency: 'EUR', locale: 'de', domain: 'emmanuela-schmuck.de', path: '', priority: 0, name: 'Germany' },
  GB: { country: 'GB', language: 'en', currency: 'GBP', locale: 'en', domain: 'emmanuela.co.uk', path: '', priority: 0, name: 'United Kingdom' },
  // PRIORITY 1
  FR: { country: 'FR', language: 'fr', currency: 'EUR', locale: 'fr', domain: 'emmanuela.jewelry', path: '/fr', priority: 1, name: 'France' },
  IT: { country: 'IT', language: 'it', currency: 'EUR', locale: 'it', domain: 'emmanuela.jewelry', path: '/it', priority: 1, name: 'Italy' },
  ES: { country: 'ES', language: 'es', currency: 'EUR', locale: 'es', domain: 'emmanuela.jewelry', path: '/es', priority: 1, name: 'Spain' },
  US: { country: 'US', language: 'en', currency: 'USD', locale: 'en', domain: 'emmanuela.jewelry', path: '/en', priority: 1, name: 'USA' },
  CA: { country: 'CA', language: 'en', currency: 'CAD', locale: 'en', domain: 'emmanuela.jewelry', path: '/en', priority: 1, name: 'Canada' },
  AU: { country: 'AU', language: 'en', currency: 'AUD', locale: 'en', domain: 'emmanuela.jewelry', path: '/en', priority: 1, name: 'Australia' },
  NL: { country: 'NL', language: 'nl', currency: 'EUR', locale: 'nl', domain: 'emmanuela.jewelry', path: '/nl', priority: 1, name: 'Netherlands' },
  // PRIORITY 2
  BE: { country: 'BE', language: 'nl', currency: 'EUR', locale: 'nl', domain: 'emmanuela.jewelry', path: '/nl', priority: 2, name: 'Belgium' },
  AT: { country: 'AT', language: 'de', currency: 'EUR', locale: 'de', domain: 'emmanuela.jewelry', path: '/de', priority: 2, name: 'Austria' },
  CH: { country: 'CH', language: 'de', currency: 'CHF', locale: 'de', domain: 'emmanuela.jewelry', path: '/de', priority: 2, name: 'Switzerland' },
  IE: { country: 'IE', language: 'en', currency: 'EUR', locale: 'en', domain: 'emmanuela.jewelry', path: '/en', priority: 2, name: 'Ireland' },
  SE: { country: 'SE', language: 'sv', currency: 'SEK', locale: 'sv', domain: 'emmanuela.jewelry', path: '/sv', priority: 2, name: 'Sweden' },
  DK: { country: 'DK', language: 'da', currency: 'DKK', locale: 'da', domain: 'emmanuela.jewelry', path: '/da', priority: 2, name: 'Denmark' },
  NO: { country: 'NO', language: 'no', currency: 'NOK', locale: 'nb', domain: 'emmanuela.jewelry', path: '/nb', priority: 2, name: 'Norway' },
  PL: { country: 'PL', language: 'pl', currency: 'PLN', locale: 'pl', domain: 'emmanuela.jewelry', path: '/pl', priority: 2, name: 'Poland' },
  PT: { country: 'PT', language: 'pt', currency: 'EUR', locale: 'pt-PT', domain: 'emmanuela.jewelry', path: '/pt', priority: 2, name: 'Portugal' },
  FI: { country: 'FI', language: 'fi', currency: 'EUR', locale: 'fi', domain: 'emmanuela.jewelry', path: '/fi', priority: 2, name: 'Finland' },
  CZ: { country: 'CZ', language: 'cs', currency: 'CZK', locale: 'cs', domain: 'emmanuela.jewelry', path: '/cs', priority: 2, name: 'Czech Republic' },
  RO: { country: 'RO', language: 'ro', currency: 'RON', locale: 'ro', domain: 'emmanuela.jewelry', path: '/ro', priority: 2, name: 'Romania' },
  HU: { country: 'HU', language: 'hu', currency: 'HUF', locale: 'hu', domain: 'emmanuela.jewelry', path: '/hu', priority: 2, name: 'Hungary' },
  CY: { country: 'CY', language: 'el', currency: 'EUR', locale: 'el', domain: 'emmanuela.jewelry', path: '/el', priority: 2, name: 'Cyprus' },
  // PRIORITY 3
  JP: { country: 'JP', language: 'ja', currency: 'JPY', locale: 'ja', domain: 'emmanuela.jewelry', path: '/ja', priority: 3, name: 'Japan' },
  KR: { country: 'KR', language: 'ko', currency: 'KRW', locale: 'ko', domain: 'emmanuela.jewelry', path: '/ko', priority: 3, name: 'South Korea' },
  SG: { country: 'SG', language: 'en', currency: 'SGD', locale: 'en', domain: 'emmanuela.jewelry', path: '/en', priority: 3, name: 'Singapore' },
  AE: { country: 'AE', language: 'en', currency: 'AED', locale: 'en', domain: 'emmanuela.jewelry', path: '/en', priority: 3, name: 'UAE' },
  IL: { country: 'IL', language: 'he', currency: 'ILS', locale: 'he', domain: 'emmanuela.jewelry', path: '/he', priority: 3, name: 'Israel' },
  MX: { country: 'MX', language: 'es', currency: 'MXN', locale: 'es', domain: 'emmanuela.jewelry', path: '/es', priority: 3, name: 'Mexico' },
  MT: { country: 'MT', language: 'en', currency: 'EUR', locale: 'en', domain: 'emmanuela.jewelry', path: '/en', priority: 3, name: 'Malta' },
  LU: { country: 'LU', language: 'fr', currency: 'EUR', locale: 'fr', domain: 'emmanuela.jewelry', path: '/fr', priority: 3, name: 'Luxembourg' },
  SK: { country: 'SK', language: 'cs', currency: 'EUR', locale: 'cs', domain: 'emmanuela.jewelry', path: '/cs', priority: 3, name: 'Slovakia' },
  SI: { country: 'SI', language: 'en', currency: 'EUR', locale: 'en', domain: 'emmanuela.jewelry', path: '/en', priority: 3, name: 'Slovenia' },
  EE: { country: 'EE', language: 'en', currency: 'EUR', locale: 'en', domain: 'emmanuela.jewelry', path: '/en', priority: 3, name: 'Estonia' },
  LV: { country: 'LV', language: 'en', currency: 'EUR', locale: 'en', domain: 'emmanuela.jewelry', path: '/en', priority: 3, name: 'Latvia' },
  LT: { country: 'LT', language: 'en', currency: 'EUR', locale: 'en', domain: 'emmanuela.jewelry', path: '/en', priority: 3, name: 'Lithuania' },
  BG: { country: 'BG', language: 'en', currency: 'BGN', locale: 'en', domain: 'emmanuela.jewelry', path: '/en', priority: 3, name: 'Bulgaria' },
  HR: { country: 'HR', language: 'en', currency: 'EUR', locale: 'en', domain: 'emmanuela.jewelry', path: '/en', priority: 3, name: 'Croatia' },
  MY: { country: 'MY', language: 'ms', currency: 'MYR', locale: 'ms', domain: 'emmanuela.jewelry', path: '/ms', priority: 3, name: 'Malaysia' },
  ID: { country: 'ID', language: 'id', currency: 'IDR', locale: 'id', domain: 'emmanuela.jewelry', path: '/id', priority: 3, name: 'Indonesia' },
  TW: { country: 'TW', language: 'zh', currency: 'TWD', locale: 'zh-TW', domain: 'emmanuela.jewelry', path: '/zh-TW', priority: 3, name: 'Taiwan' },
  IS: { country: 'IS', language: 'en', currency: 'ISK', locale: 'en', domain: 'emmanuela.jewelry', path: '/en', priority: 3, name: 'Iceland' },
  SA: { country: 'SA', language: 'en', currency: 'SAR', locale: 'en', domain: 'emmanuela.jewelry', path: '/en', priority: 3, name: 'Saudi Arabia' },
  // MICRO STATES
  MC: { country: 'MC', language: 'fr', currency: 'EUR', locale: 'fr', domain: 'emmanuela.jewelry', path: '/fr', priority: 4, name: 'Monaco' },
  AD: { country: 'AD', language: 'es', currency: 'EUR', locale: 'es', domain: 'emmanuela.jewelry', path: '/es', priority: 4, name: 'Andorra' },
  SM: { country: 'SM', language: 'it', currency: 'EUR', locale: 'it', domain: 'emmanuela.jewelry', path: '/it', priority: 4, name: 'San Marino' },
  VA: { country: 'VA', language: 'it', currency: 'EUR', locale: 'it', domain: 'emmanuela.jewelry', path: '/it', priority: 4, name: 'Vatican City' },
  LI: { country: 'LI', language: 'de', currency: 'CHF', locale: 'de', domain: 'emmanuela.jewelry', path: '/de', priority: 4, name: 'Liechtenstein' },
};



// ============================================
// HELPER FUNCTIONS
// ============================================

function stripHtml(html) {
  if (!html) return '';
  return html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim().substring(0, 5000);
}

function escapeXml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function buildProductUrl(handle, variantId, market) {
  return `https://${market.domain}${market.path}/products/${handle}?variant=${variantId}`;
}

function formatPrice(amount, currency) {
  const num = parseFloat(amount);
  return isNaN(num) ? `0.00 ${currency}` : `${num.toFixed(2)} ${currency}`;
}

/**
 * v5: Format weight for Google (in grams)
 */
function formatWeight(grams) {
  if (!grams || grams <= 0) return null;
  return `${grams} g`;
}

/**
 * v5: Check if product is a ring (for size attribute)
 */
function isRing(productType) {
  if (!productType) return false;
  const type = productType.toLowerCase();
  return type.includes('ring') || type.includes('δαχτυλίδ');
}

/**
 * v5: Get ring size from variant options
 */
function getRingSize(selectedOptions) {
  if (!selectedOptions) return null;
  
  for (const opt of selectedOptions) {
    const name = (opt.name || '').toLowerCase();
    // Check for size-related option names
    if (name.includes('size') || name.includes('μέγεθος') || name.includes('νούμερο')) {
      return opt.value;
    }
  }
  return null;
}

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
    headers: { 'X-Shopify-Access-Token': ACCESS_TOKEN, 'Content-Type': 'application/json' }
  };
  return httpsRequest(options, JSON.stringify({ query }));
}

// ============================================
// COLOR & MATERIAL EXTRACTION
// ============================================

function translateColor(greekColor) {
  if (!greekColor) return null;
  
  const normalized = greekColor.toLowerCase().trim();
  
  if (COLOR_TRANSLATIONS[normalized]) {
    return COLOR_TRANSLATIONS[normalized];
  }
  
  for (const [greek, english] of Object.entries(COLOR_TRANSLATIONS)) {
    if (normalized.includes(greek)) {
      return english;
    }
  }
  
  return greekColor.charAt(0).toUpperCase() + greekColor.slice(1);
}

function getGender(productType, title) {
  const type = (productType || '').toLowerCase();
  const t = (title || '').toLowerCase();
  
  if (type.includes('ανδρικ') || t.includes('ανδρικ')) return 'male';
  if (type.includes('men') || type.includes("men's")) return 'male';
  
  if (type.includes('γυναικ') || t.includes('γυναικ')) return 'female';
  if (type.includes('women') || type.includes("women's")) return 'female';
  
  if (type.includes('στέφαν') || type.includes('γάμ')) return 'unisex';
  if (type.includes('gift') || type.includes('δώρ')) return 'unisex';
  
  return 'unisex';
}

function translateMaterial(materialStr) {
  if (!materialStr) return 'Sterling Silver';
  
  const materials = materialStr.split(';').map(m => m.trim().toLowerCase());
  const translated = [];
  
  for (const mat of materials) {
    if (MATERIAL_TRANSLATIONS[mat]) {
      if (!translated.includes(MATERIAL_TRANSLATIONS[mat])) {
        translated.push(MATERIAL_TRANSLATIONS[mat]);
      }
    }
  }
  
  return translated.length > 0 ? translated.join('/') : 'Sterling Silver';
}



// ============================================
// FETCH PRODUCTS WITH OPTIONS + METAFIELDS + WEIGHT (GraphQL)
// v5: Added weight and weightUnit to variants
// ============================================

async function fetchProductsWithOptions() {
  console.log('📦 Fetching products with options + metafields + weight (GraphQL v5)...\n');
  
  const allProducts = [];
  let cursor = null;
  let page = 1;
  
  while (true) {
    const afterClause = cursor ? `, after: "${cursor}"` : '';
    
    // v5: Added weight and weightUnit to variants query
    const query = `{
      products(first: 50, query: "status:active"${afterClause}) {
        pageInfo { hasNextPage endCursor }
        edges {
          node {
            id
            title
            handle
            descriptionHtml
            productType
            vendor
            images(first: 10) { edges { node { id url } } }
            options {
              id
              name
              optionValues { id name }
            }
            variants(first: 100) {
              edges {
                node {
                  id
                  sku
                  price
                  compareAtPrice
                  inventoryQuantity
                  barcode
                  image { id }
                  selectedOptions { name value }
                  inventoryItem {
                    measurement {
                      weight {
                        value
                        unit
                      }
                    }
                  }
                }
              }
            }
            gsGender: metafield(namespace: "google", key: "gender") { value }
            gsAgeGroup: metafield(namespace: "google", key: "age_group") { value }
            gsCondition: metafield(namespace: "google", key: "condition") { value }
            gsCategory: metafield(namespace: "google", key: "custom_product_type") { value }
            colorPattern: metafield(namespace: "shopify", key: "color-pattern") { value }
            material: metafield(namespace: "shopify", key: "jewelry-material") { value }
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
          metafields: {
            gender: node.gsGender?.value || node.targetGender?.value || null,
            age_group: node.gsAgeGroup?.value || 'adult',
            condition: node.gsCondition?.value || 'new',
            category: node.gsCategory?.value || null,
            color: node.colorPattern?.value || null,
            material: node.material?.value || null,
          },
          images: (node.images?.edges || []).map(e => ({
            id: e.node.id.replace('gid://shopify/ProductImage/', ''),
            src: e.node.url
          })),
          options: (node.options || []).map(o => ({
            id: o.id.replace('gid://shopify/ProductOption/', ''),
            gid: o.id,
            name: o.name,
            values: (o.optionValues || []).map(v => ({
              id: v.id.replace('gid://shopify/ProductOptionValue/', ''),
              gid: v.id,
              name: v.name
            }))
          })),
          // v5: Added weight conversion to grams
          variants: (node.variants?.edges || []).map(e => {
            // Convert weight to grams (from inventoryItem.measurement.weight)
            let weightInGrams = null;
            const weightData = e.node.inventoryItem?.measurement?.weight;
            if (weightData && weightData.value > 0) {
              const unit = (weightData.unit || 'GRAMS').toUpperCase();
              switch (unit) {
                case 'KILOGRAMS':
                  weightInGrams = Math.round(weightData.value * 1000);
                  break;
                case 'POUNDS':
                  weightInGrams = Math.round(weightData.value * 453.592);
                  break;
                case 'OUNCES':
                  weightInGrams = Math.round(weightData.value * 28.3495);
                  break;
                default: // GRAMS
                  weightInGrams = Math.round(weightData.value);
              }
            }
            
            return {
              id: e.node.id.replace('gid://shopify/ProductVariant/', ''),
              gid: e.node.id,
              sku: e.node.sku,
              price: e.node.price,
              compare_at_price: e.node.compareAtPrice,
              inventory_quantity: e.node.inventoryQuantity,
              barcode: e.node.barcode,
              weight: weightInGrams,  // v5: weight in grams
              image_id: e.node.image?.id?.replace('gid://shopify/ProductImage/', ''),
              title: e.node.selectedOptions.map(o => o.value).join(' / '),
              selectedOptions: e.node.selectedOptions
            };
          })
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
      console.error(`❌ Error: ${error.message}`);
      break;
    }
  }
  
  console.log(`\n✅ Total products: ${allProducts.length}\n`);
  return allProducts;
}



// ============================================
// FETCH TRANSLATIONS
// ============================================

async function fetchProductTranslations(products, locale) {
  console.log(`🌐 Fetching PRODUCT translations for locale: ${locale}...`);
  
  const translations = {};
  const batchSize = 30;
  
  for (let i = 0; i < products.length; i += batchSize) {
    const batch = products.slice(i, i + batchSize);
    
    const queries = batch.map((p, idx) => `
      p${idx}: translatableResource(resourceId: "${p.gid}") {
        translations(locale: "${locale}") { key value }
      }
    `).join('\n');
    
    try {
      const { data } = await graphqlRequest(`query { ${queries} }`);
      
      if (data.data) {
        batch.forEach((product, idx) => {
          const result = data.data[`p${idx}`];
          if (result?.translations) {
            translations[product.id] = {};
            result.translations.forEach(t => {
              translations[product.id][t.key] = t.value;
            });
          }
        });
      }
      
      process.stdout.write(`\r   Products: ${Math.min(i + batchSize, products.length)}/${products.length}`);
      await new Promise(r => setTimeout(r, 200));
    } catch (error) {
      console.error(`\n   ⚠️ Error: ${error.message}`);
    }
  }
  
  console.log(`\n   ✅ Product translations: ${Object.keys(translations).length}\n`);
  return translations;
}

async function fetchOptionValueTranslations(products, locale) {
  console.log(`🌐 Fetching OPTION VALUE translations for locale: ${locale}...`);
  
  const translations = {};
  const optionValues = [];
  
  products.forEach(product => {
    (product.options || []).forEach(option => {
      (option.values || []).forEach(value => {
        if (!optionValues.find(ov => ov.gid === value.gid)) {
          optionValues.push({ gid: value.gid, originalName: value.name });
        }
      });
    });
  });
  
  console.log(`   Found ${optionValues.length} unique option values to translate`);
  
  const batchSize = 50;
  for (let i = 0; i < optionValues.length; i += batchSize) {
    const batch = optionValues.slice(i, i + batchSize);
    
    const queries = batch.map((ov, idx) => `
      ov${idx}: translatableResource(resourceId: "${ov.gid}") {
        translations(locale: "${locale}") { key value }
      }
    `).join('\n');
    
    try {
      const { data } = await graphqlRequest(`query { ${queries} }`);
      
      if (data.data) {
        batch.forEach((ov, idx) => {
          const result = data.data[`ov${idx}`];
          if (result?.translations) {
            const nameTrans = result.translations.find(t => t.key === 'name');
            if (nameTrans?.value) {
              translations[ov.originalName] = nameTrans.value;
            }
          }
        });
      }
      
      process.stdout.write(`\r   Option values: ${Math.min(i + batchSize, optionValues.length)}/${optionValues.length}`);
      await new Promise(r => setTimeout(r, 200));
    } catch (error) {
      console.error(`\n   ⚠️ Error: ${error.message}`);
    }
  }
  
  console.log(`\n   ✅ Option value translations: ${Object.keys(translations).length}\n`);
  return translations;
}

async function fetchAllTranslations(products, locale) {
  console.log(`\n📊 Fetching translations for locale: ${locale}\n`);
  
  const [productTrans, optionTrans] = await Promise.all([
    fetchProductTranslations(products, locale),
    fetchOptionValueTranslations(products, locale)
  ]);
  
  return { products: productTrans, optionValues: optionTrans };
}



// ============================================
// XML FEED GENERATION (v5 with dynamic categories, weight, size)
// ============================================

function generateFeedForMarket(products, translations, market) {
  console.log(`🔧 Generating XML feed for ${market.name} (${market.country})...\n`);
  
  let items = [];
  let stats = { 
    inStock: 0, 
    outOfStock: 0, 
    noImage: 0, 
    translatedVariants: 0, 
    totalVariants: 0, 
    translatedHandles: 0,
    withGender: 0,
    withColor: 0,
    withMaterial: 0,
    // v5 new stats
    withWeight: 0,
    withSize: 0,
    categoryBreakdown: {}
  };

  products.forEach(product => {
    const variants = product.variants || [];
    const images = product.images || [];
    const mainImage = images[0]?.src || '';
    
    if (!mainImage) { stats.noImage++; return; }
    
    const additionalImages = images.slice(1, 10).map(img => img.src);
    
    // Get translated product content
    const prodTrans = translations.products[product.id] || {};
    const translatedTitle = prodTrans.title || product.title;
    const translatedDesc = stripHtml(prodTrans.body_html || product.body_html);
    
    // v4: Get product-level attributes
    const gender = getGender(product.product_type, product.title);
    const material = translateMaterial(product.metafields?.material);
    
    // v5: Get Google Product Category
    const googleCategory = getGoogleCategory(product.product_type);
    stats.categoryBreakdown[googleCategory] = (stats.categoryBreakdown[googleCategory] || 0) + 1;
    
    // v5: Check if this is a ring (for size attribute)
    const productIsRing = isRing(product.product_type);
    
    if (gender !== 'unisex') stats.withGender++;
    if (product.metafields?.material) stats.withMaterial++;
    
    variants.forEach(variant => {
      if (variant.inventory_quantity <= 0) { stats.outOfStock++; return; }
      
      stats.inStock++;
      stats.totalVariants++;
      
      // Build translated variant title
      let variantSuffix = '';
      let variantColorOriginal = '';
      let ringSize = null;
      
      if (variant.title && variant.title !== 'Default Title') {
        const translatedOptions = (variant.selectedOptions || []).map(opt => {
          const translated = translations.optionValues[opt.value];
          
          // Capture color
          if (opt.name === 'Χρώμα' || opt.name.toLowerCase() === 'color') {
            variantColorOriginal = opt.value;
          }
          
          return translated || opt.value;
        });
        
        variantSuffix = translatedOptions.join(' / ');
        
        if (translatedOptions.some((t, i) => t !== variant.selectedOptions[i]?.value)) {
          stats.translatedVariants++;
        }
        
        // v5: Get ring size if applicable
        if (productIsRing) {
          ringSize = getRingSize(variant.selectedOptions);
          if (ringSize) stats.withSize++;
        }
      }
      
      const fullTitle = variantSuffix ? `${translatedTitle} - ${variantSuffix}` : translatedTitle;
      
      const colorEnglish = translateColor(variantColorOriginal);
      if (colorEnglish) stats.withColor++;
      
      // v5: Track weight
      if (variant.weight) stats.withWeight++;
      
      const variantImage = variant.image_id 
        ? images.find(img => img.id === variant.image_id)?.src || mainImage
        : mainImage;

      const translatedHandle = prodTrans.handle || product.handle;
      if (prodTrans.handle) stats.translatedHandles++;
      const productUrl = buildProductUrl(translatedHandle, variant.id, market);
      const price = formatPrice(variant.price, market.currency);

      // Build XML item
      let item = `    <item>
      <g:id>${variant.id}</g:id>
      <g:item_group_id>${product.id}</g:item_group_id>
      <g:title><![CDATA[${fullTitle.substring(0, 150)}]]></g:title>
      <g:description><![CDATA[${translatedDesc.substring(0, 5000)}]]></g:description>
      <g:link>${escapeXml(productUrl)}</g:link>
      <g:image_link>${variantImage}</g:image_link>`;
      
      additionalImages.forEach(img => {
        item += `\n      <g:additional_image_link>${img}</g:additional_image_link>`;
      });
      
      item += `
      <g:price>${price}</g:price>
      <g:availability>in_stock</g:availability>
      <g:brand><![CDATA[${BRAND}]]></g:brand>
      <g:condition>new</g:condition>
      <g:identifier_exists>false</g:identifier_exists>`;

      // v5: Dynamic Google Product Category
      item += `\n      <g:google_product_category>${googleCategory}</g:google_product_category>`;
      item += `\n      <g:product_type><![CDATA[${product.product_type || 'Jewelry'}]]></g:product_type>`;

      // Gender & Age Group
      item += `\n      <g:age_group>adult</g:age_group>`;
      item += `\n      <g:gender>${gender}</g:gender>`;
      
      // Color (if available)
      if (colorEnglish) {
        item += `\n      <g:color><![CDATA[${colorEnglish}]]></g:color>`;
      }
      
      // Material
      if (material) {
        item += `\n      <g:material><![CDATA[${material}]]></g:material>`;
      }

      // v5: Shipping Weight (if available)
      const weightFormatted = formatWeight(variant.weight);
      if (weightFormatted) {
        item += `\n      <g:shipping_weight>${weightFormatted}</g:shipping_weight>`;
      }

      // v5: Size for rings (if available)
      if (ringSize) {
        item += `\n      <g:size><![CDATA[${ringSize}]]></g:size>`;
      }

      // SKU / MPN
      if (variant.sku) item += `\n      <g:mpn><![CDATA[${variant.sku}]]></g:mpn>`;

      // Sale price
      if (variant.compare_at_price && parseFloat(variant.compare_at_price) > parseFloat(variant.price)) {
        item += `\n      <g:sale_price>${price}</g:sale_price>`;
        item += `\n      <g:price>${formatPrice(variant.compare_at_price, market.currency)}</g:price>`;
      }

      item += `\n    </item>`;
      items.push(item);
    });
  });

  // Print stats
  console.log(`   📊 Stats for ${market.country}:`);
  console.log(`      In-stock items: ${stats.inStock}`);
  console.log(`      With gender: ${stats.withGender} products`);
  console.log(`      With color: ${stats.withColor} variants`);
  console.log(`      With material: ${stats.withMaterial} products`);
  console.log(`      With weight: ${stats.withWeight} variants`);  // v5
  console.log(`      With size: ${stats.withSize} variants`);      // v5
  console.log(`      Variants with translated options: ${stats.translatedVariants}/${stats.totalVariants}`);
  console.log(`      Out-of-stock (skipped): ${stats.outOfStock}`);
  console.log(`      No image (skipped): ${stats.noImage}`);
  
  // v5: Category breakdown
  console.log(`      📁 Categories:`);
  for (const [cat, count] of Object.entries(stats.categoryBreakdown)) {
    const catName = cat === '188' ? 'Jewelry (general)' :
                    cat === '194' ? 'Earrings' :
                    cat === '200' ? 'Rings' :
                    cat === '191' ? 'Bracelets' :
                    cat === '196' ? 'Necklaces' :
                    cat === '192' ? 'Charms & Pendants' :
                    cat === '197' ? 'Brooches' :
                    cat === '110' ? 'Hair Wreaths' :
                    cat === '53' ? 'Gift Cards' : `Category ${cat}`;
    console.log(`         ${catName}: ${count}`);
  }
  console.log('');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss xmlns:g="http://base.google.com/ns/1.0" version="2.0">
  <channel>
    <title>EMMANUELA - Handcrafted Jewelry (${market.name})</title>
    <link>https://${market.domain}${market.path}</link>
    <description>Handcrafted 925 Sterling Silver Jewelry from Greece - ${market.name}</description>
${items.join('\n')}
  </channel>
</rss>`;

  return { xml, stats };
}



// ============================================
// MAIN EXECUTION
// ============================================

async function generateFeed(marketCode) {
  const market = MARKETS[marketCode.toUpperCase()];
  if (!market) {
    console.error(`❌ Unknown market: ${marketCode}`);
    console.log('Use "list" to see available markets');
    return;
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`🌍 Generating feed for: ${market.name} (${market.country})`);
  console.log(`   Domain: ${market.domain}${market.path}`);
  console.log(`   Currency: ${market.currency}`);
  console.log(`   Language: ${market.language}`);
  console.log(`${'='.repeat(60)}\n`);

  // Fetch products
  const products = await fetchProductsWithOptions();
  if (products.length === 0) {
    console.error('❌ No products found');
    return;
  }

  // Fetch translations (skip for Greek locale)
  let translations = { products: {}, optionValues: {} };
  if (market.locale !== 'el') {
    translations = await fetchAllTranslations(products, market.locale);
  } else {
    console.log('ℹ️ Greek locale - skipping translations\n');
  }

  // Generate XML
  const { xml, stats } = generateFeedForMarket(products, translations, market);

  // Ensure output directory exists
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // Write files
  const filename = `emmanuela-${market.country.toLowerCase()}.xml`;
  const filepath = path.join(OUTPUT_DIR, filename);
  fs.writeFileSync(filepath, xml, 'utf8');

  // Also write dated version
  const date = new Date().toISOString().split('T')[0];
  const datedFilename = `emmanuela-${market.country.toLowerCase()}-${date}.xml`;
  const datedFilepath = path.join(OUTPUT_DIR, datedFilename);
  fs.writeFileSync(datedFilepath, xml, 'utf8');

  console.log(`\n✅ Feed saved:`);
  console.log(`   ${filepath}`);
  console.log(`   ${datedFilepath}`);
  console.log(`\n📊 Summary: ${stats.inStock} items in feed\n`);
  
  return { filepath, stats };
}

async function generateAllFeeds() {
  console.log('\n🌍 GENERATING FEEDS FOR ALL 49 MARKETS\n');
  console.log('⚠️  This will take a while due to API rate limits.\n');
  
  // Fetch products once
  const products = await fetchProductsWithOptions();
  if (products.length === 0) {
    console.error('❌ No products found');
    return;
  }

  // Group markets by locale to reuse translations
  const marketsByLocale = {};
  for (const [code, market] of Object.entries(MARKETS)) {
    if (!marketsByLocale[market.locale]) {
      marketsByLocale[market.locale] = [];
    }
    marketsByLocale[market.locale].push({ code, ...market });
  }

  // Ensure output directory exists
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const results = [];
  let marketCount = 0;
  const totalMarkets = Object.keys(MARKETS).length;

  for (const [locale, markets] of Object.entries(marketsByLocale)) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`📦 Processing locale: ${locale} (${markets.length} markets)`);
    console.log(`${'='.repeat(60)}\n`);

    // Fetch translations once per locale
    let translations = { products: {}, optionValues: {} };
    if (locale !== 'el') {
      translations = await fetchAllTranslations(products, locale);
    }

    // Generate feed for each market with this locale
    for (const market of markets) {
      marketCount++;
      console.log(`\n[${marketCount}/${totalMarkets}] Generating ${market.name} (${market.code})...`);
      
      const { xml, stats } = generateFeedForMarket(products, translations, market);
      
      const filename = `emmanuela-${market.country.toLowerCase()}.xml`;
      const filepath = path.join(OUTPUT_DIR, filename);
      fs.writeFileSync(filepath, xml, 'utf8');
      
      results.push({ market: market.code, items: stats.inStock, file: filename });
      console.log(`   ✅ Saved: ${filename} (${stats.inStock} items)`);
      
      // Small delay to prevent overwhelming the filesystem
      await new Promise(r => setTimeout(r, 100));
    }
  }

  // Print summary
  console.log(`\n${'='.repeat(60)}`);
  console.log('📊 GENERATION COMPLETE - SUMMARY');
  console.log(`${'='.repeat(60)}\n`);
  
  results.forEach(r => {
    console.log(`   ${r.market}: ${r.items} items → ${r.file}`);
  });
  
  console.log(`\n✅ Total: ${results.length} feeds generated`);
  console.log(`📁 Location: ${OUTPUT_DIR}\n`);
}

function listMarkets() {
  console.log('\n📋 AVAILABLE MARKETS (49 total)\n');
  
  const byPriority = {};
  for (const [code, market] of Object.entries(MARKETS)) {
    if (!byPriority[market.priority]) byPriority[market.priority] = [];
    byPriority[market.priority].push({ code, ...market });
  }
  
  const priorityNames = {
    0: 'Dedicated Domains',
    1: 'Priority 1 (Major Markets)',
    2: 'Priority 2 (EU Markets)',
    3: 'Priority 3 (International)',
    4: 'Priority 4 (Micro States)'
  };
  
  for (const priority of [0, 1, 2, 3, 4]) {
    if (byPriority[priority]) {
      console.log(`\n${priorityNames[priority]}:`);
      byPriority[priority].forEach(m => {
        console.log(`   ${m.code.padEnd(4)} ${m.name.padEnd(20)} ${m.domain}${m.path}`);
      });
    }
  }
  
  console.log('\n💡 Usage:');
  console.log('   node google-shopping-feed-v5.js GR     # Single market');
  console.log('   node google-shopping-feed-v5.js all    # All 49 markets');
  console.log('   node google-shopping-feed-v5.js list   # This list\n');
}

// CLI
const arg = process.argv[2];

if (!arg) {
  console.log('❌ Please specify a market code or "all" or "list"');
  console.log('   Example: node google-shopping-feed-v5.js GR');
  process.exit(1);
}

if (arg.toLowerCase() === 'list') {
  listMarkets();
} else if (arg.toLowerCase() === 'all') {
  generateAllFeeds().catch(console.error);
} else {
  generateFeed(arg).catch(console.error);
}
