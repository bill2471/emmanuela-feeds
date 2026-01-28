/**
 * Google Shopping Feed Generator v7.2 for EMMANUELA
 * 
 * NEW in v7.2:
 *   - FIXED: Transit times now INSIDE <g:shipping> tag (Google requirement)
 *   - handling_time and transit_time are now sub-attributes of shipping
 *   - ships_from_country and return_policy_label remain item-level
 *
 * NEW in v7.1:
 *   - Fixed 4 missing color mappings (επιχυσωμένο, πολύχρωμο σετ, black, mehrfarbig)
 *
 * NEW in v7 (from v6):
 *   - Shipping Time Attributes (handling_time, transit_time)
 *   - ships_from_country attribute (GR)
 *   - return_policy_label attribute
 *   - Regional transit times for 46+ countries
 * 
 * Previous features (v6):
 *   - Dynamic Shipping Rates from Shopify API
 *   - Automatic <g:shipping> tags for each country
 * 
 * Previous features (v5):
 *   - Dynamic Google Product Categories
 *   - Shipping weight from variant.weight
 *   - Size attribute for rings
 * 
 * Usage: 
 *   node google-shopping-feed-v7.js GR          # Single market
 *   node google-shopping-feed-v7.js all         # All markets
 *   node google-shopping-feed-v7.js list        # List available markets
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
// v5: GOOGLE PRODUCT CATEGORY MAPPING
// ============================================

const GOOGLE_CATEGORY_MAP = {
  'earrings': 194, 'σκουλαρίκια': 194, 'ear cuff': 194,
  'rings': 200, 'δαχτυλίδια': 200, 'δαχτυλίδι': 200, 'ring': 200,
  'bracelets': 191, 'βραχιόλια': 191, 'βραχιόλι': 191, 'bracelet': 191,
  'necklaces': 196, 'κολιέ': 196, 'necklace': 196,
  'pendants': 192, 'μενταγιόν': 192, 'pendant': 192, 'charms': 192,
  'brooches': 197, 'καρφίτσες': 197, 'brooch': 197, 'pins': 197,
  'jewelry sets': 6463, 'σετ': 6463, 'set': 6463,
  'στέφανα': 110, 'hair wreaths': 110, 'wreaths': 110,
  'gift card': 53, 'gift cards': 53, 'δωροκάρτα': 53,
};

const DEFAULT_GOOGLE_CATEGORY = 188;

function getGoogleCategory(productType) {
  if (!productType) return DEFAULT_GOOGLE_CATEGORY;
  const type = productType.toLowerCase();
  for (const [keyword, categoryId] of Object.entries(GOOGLE_CATEGORY_MAP)) {
    if (type.includes(keyword)) return categoryId;
  }
  return DEFAULT_GOOGLE_CATEGORY;
}

// ============================================
// COLOR TRANSLATIONS
// ============================================

const COLOR_TRANSLATIONS = {
  'επιχρυσωμένο': 'Gold', 'επιχρυσωμένα': 'Gold', 'επιχρυσωμένος': 'Gold', 'επιχρυσωμένη': 'Gold',
  'χρυσό': 'Gold', 'χρυσός': 'Gold', 'ασημένιο': 'Silver', 'ασημένια': 'Silver',
  'ασημένιος': 'Silver', 'ασημί': 'Silver', 'silver': 'Silver', 'gold': 'Gold',
  'μαύρο': 'Black', 'μαύρα': 'Black', 'μαύρος': 'Black',
  'οξειδωμένο': 'Gray', 'οξειδωμένα': 'Gray', 'ανθρακί': 'Gray',
  'ροζ': 'Rose Gold', 'ροζ επιχρυσωμένο': 'Rose Gold', 'ροζ χρυσό': 'Rose Gold',
  'λευκό': 'White', 'λευκά': 'White', 'μπλε': 'Blue',
  'πράσινο': 'Green', 'πράσινα': 'Green', 'κόκκινο': 'Red', 'κόκκινα': 'Red',
  'μπορντό': 'Burgundy', 'μωβ': 'Purple', 'τιρκουάζ': 'Turquoise', 'σομόν': 'Coral',
  'ασημένιο με μπλε': 'Silver/Blue', 'ασημένιο με πράσινο': 'Silver/Green',
  'επιχρυσωμένο με σομόν': 'Gold/Coral', 'μαύρο ανθρακί': 'Black',
  // v7.1: Missing mappings (4 fixes)
  'επιχυσωμένο': 'Gold',  // typo fix - missing ρ
  'πολύχρωμο': 'Multicolor', 'πολύχρωμα': 'Multicolor', 'πολύχρωμο σετ': 'Multicolor',
  'black': 'Black',  // English lowercase
  'mehrfarbig': 'Multicolor', '3 mehrfarbige manschetten': 'Multicolor',  // German
};

// ============================================
// MATERIAL TRANSLATIONS
// ============================================

const MATERIAL_TRANSLATIONS = {
  'sterling-silver': 'Sterling Silver', 'silver': 'Silver', 'silver-1': 'Silver',
  'gold-1': 'Gold', 'gold': 'Gold', 'synthetic': 'Synthetic', 'pearl': 'Pearl',
  'zircon': 'Zircon', 'ασήμι': 'Sterling Silver', 'ασήμι 925': 'Sterling Silver',
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
// v7 NEW: SHIPPING TIME CONFIGURATION
// ============================================

// Handling time (same for all countries) - days to prepare order
const HANDLING_TIME = { min: 1, max: 2 };

// Transit times by region (in business days)
const TRANSIT_TIMES = {
  GR: { min: 1, max: 2 },      // Greece - domestic
  DE: { min: 1, max: 2 },      // Germany - fast EU
  EU: { min: 2, max: 3 },      // Rest of EU
  GB: { min: 2, max: 4 },      // UK (post-Brexit)
  CH: { min: 2, max: 3 },      // Switzerland
  NO: { min: 2, max: 3 },      // Norway
  IS: { min: 2, max: 3 },      // Iceland
  LI: { min: 2, max: 3 },      // Liechtenstein
  US: { min: 2, max: 5 },      // USA
  CA: { min: 2, max: 3 },      // Canada
  AU: { min: 3, max: 6 },      // Australia
  NZ: { min: 3, max: 5 },      // New Zealand
  MX: { min: 2, max: 4 },      // Mexico
  AE: { min: 2, max: 3 },      // UAE
  IL: { min: 2, max: 4 },      // Israel
  SA: { min: 2, max: 4 },      // Saudi Arabia
  ASIA: { min: 2, max: 4 },    // Japan, Korea, Singapore, etc.
  CN: { min: 3, max: 5 },      // China
};

// Map country codes to transit time groups
const TRANSIT_GROUP = {
  // Specific countries with their own times
  GR: 'GR', DE: 'DE', GB: 'GB', CH: 'CH', NO: 'NO', IS: 'IS', LI: 'LI',
  US: 'US', CA: 'CA', AU: 'AU', NZ: 'NZ', MX: 'MX', AE: 'AE', IL: 'IL', 
  SA: 'SA', CN: 'CN',
  // EU countries → EU group
  AT: 'EU', BE: 'EU', BG: 'EU', HR: 'EU', CY: 'EU', CZ: 'EU', DK: 'EU',
  EE: 'EU', FI: 'EU', FR: 'EU', HU: 'EU', IE: 'EU', IT: 'EU', LV: 'EU',
  LT: 'EU', LU: 'EU', MT: 'EU', NL: 'EU', PL: 'EU', PT: 'EU', RO: 'EU',
  SK: 'EU', SI: 'EU', ES: 'EU', SE: 'EU', MC: 'EU', SM: 'EU', VA: 'EU', AD: 'EU',
  // Asia countries → ASIA group
  JP: 'ASIA', KR: 'ASIA', SG: 'ASIA', TW: 'ASIA', TH: 'ASIA', 
  MY: 'ASIA', HK: 'ASIA', ID: 'ASIA',
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

function formatWeight(grams) {
  if (!grams || grams <= 0) return null;
  return `${grams} g`;
}

function isRing(productType) {
  if (!productType) return false;
  const type = productType.toLowerCase();
  return type.includes('ring') || type.includes('δαχτυλίδ');
}

function getRingSize(selectedOptions) {
  if (!selectedOptions) return null;
  for (const opt of selectedOptions) {
    const name = (opt.name || '').toLowerCase();
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
// v6 NEW: FETCH SHIPPING RATES FROM SHOPIFY
// ============================================

/**
 * Fetches shipping rates from Shopify Delivery Profiles API
 * Returns: { 'GR': { price: 0, currency: 'EUR' }, 'GB': { price: 9.90, currency: 'GBP' }, ... }
 */
async function fetchShippingRates() {
  console.log('🚚 Fetching shipping rates from Shopify...\n');
  
  const query = `
    query GetShippingRates {
      deliveryProfiles(first: 5) {
        nodes {
          id
          name
          default
          profileLocationGroups {
            locationGroupZones(first: 50) {
              nodes {
                zone {
                  name
                  countries {
                    code {
                      countryCode
                    }
                  }
                }
                methodDefinitions(first: 10, eligible: true) {
                  nodes {
                    name
                    active
                    rateProvider {
                      ... on DeliveryRateDefinition {
                        price {
                          amount
                          currencyCode
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  `;
  
  try {
    const { data } = await graphqlRequest(query);
    
    if (data.errors) {
      console.error('⚠️ Shipping API errors:', data.errors);
      return null;
    }
    
    const profiles = data.data?.deliveryProfiles?.nodes || [];
    const countryRates = {};
    
    for (const profile of profiles) {
      for (const group of profile.profileLocationGroups || []) {
        for (const zoneData of group.locationGroupZones?.nodes || []) {
          const zone = zoneData.zone;
          const countries = (zone?.countries || []).map(c => c.code?.countryCode).filter(Boolean);
          
          for (const method of zoneData.methodDefinitions?.nodes || []) {
            if (!method.active) continue;
            
            const price = method.rateProvider?.price;
            if (!price) continue;  // Skip carrier-calculated rates
            
            // Store rate for each country (take cheapest if multiple)
            for (const cc of countries) {
              const rateAmount = parseFloat(price.amount);
              
              if (!countryRates[cc] || rateAmount < countryRates[cc].price) {
                countryRates[cc] = {
                  price: rateAmount,
                  currency: price.currencyCode
                };
              }
            }
          }
        }
      }
    }
    
    // Log summary
    const freeCount = Object.values(countryRates).filter(r => r.price === 0).length;
    const paidCount = Object.values(countryRates).filter(r => r.price > 0).length;
    console.log(`   ✅ Found shipping rates for ${Object.keys(countryRates).length} countries`);
    console.log(`      FREE shipping: ${freeCount} countries`);
    console.log(`      Paid shipping: ${paidCount} countries\n`);
    
    return countryRates;
    
  } catch (error) {
    console.error('⚠️ Error fetching shipping rates:', error.message);
    return null;
  }
}

/**
 * v7.2: Format shipping tag for Google Shopping with handling/transit times INSIDE
 * @param {string} countryCode - 2-letter country code
 * @param {object} shippingRates - Rates from fetchShippingRates()
 * @returns {string} XML shipping tag or empty string
 */
function formatShippingTag(countryCode, shippingRates) {
  if (!shippingRates || !shippingRates[countryCode]) {
    return '';  // No shipping data available
  }
  
  const rate = shippingRates[countryCode];
  const priceStr = rate.price === 0 ? `0.00 ${rate.currency}` : `${rate.price.toFixed(2)} ${rate.currency}`;
  
  // Get transit times for this country
  const group = TRANSIT_GROUP[countryCode] || 'EU';
  const transit = TRANSIT_TIMES[group] || TRANSIT_TIMES.EU;
  
  return `
      <g:shipping>
        <g:country>${countryCode}</g:country>
        <g:price>${priceStr}</g:price>
        <g:min_handling_time>${HANDLING_TIME.min}</g:min_handling_time>
        <g:max_handling_time>${HANDLING_TIME.max}</g:max_handling_time>
        <g:min_transit_time>${transit.min}</g:min_transit_time>
        <g:max_transit_time>${transit.max}</g:max_transit_time>
      </g:shipping>`;
}

/**
 * v7.2 UPDATED: Format item-level shipping attributes (NOT inside shipping tag)
 * Handling/transit times are now inside <g:shipping> tag via formatShippingTag()
 * @param {string} countryCode - 2-letter country code
 * @returns {string} XML item-level shipping attributes
 */
function formatShippingTimeAttributes(countryCode) {
  return `
      <g:ships_from_country>GR</g:ships_from_country>
      <g:return_policy_label>default</g:return_policy_label>`;
}


// ============================================
// COLOR & MATERIAL EXTRACTION
// ============================================

function translateColor(greekColor) {
  if (!greekColor) return null;
  const normalized = greekColor.toLowerCase().trim();
  if (COLOR_TRANSLATIONS[normalized]) return COLOR_TRANSLATIONS[normalized];
  for (const [greek, english] of Object.entries(COLOR_TRANSLATIONS)) {
    if (normalized.includes(greek)) return english;
  }
  return greekColor.charAt(0).toUpperCase() + greekColor.slice(1);
}

function getGender(productType, title) {
  const type = (productType || '').toLowerCase();
  const t = (title || '').toLowerCase();
  if (type.includes('ανδρικ') || t.includes('ανδρικ') || type.includes('men')) return 'male';
  if (type.includes('γυναικ') || t.includes('γυναικ') || type.includes('women')) return 'female';
  return 'unisex';
}

function translateMaterial(materialStr) {
  if (!materialStr) return 'Sterling Silver';
  const materials = materialStr.split(';').map(m => m.trim().toLowerCase());
  const translated = [];
  for (const mat of materials) {
    if (MATERIAL_TRANSLATIONS[mat] && !translated.includes(MATERIAL_TRANSLATIONS[mat])) {
      translated.push(MATERIAL_TRANSLATIONS[mat]);
    }
  }
  return translated.length > 0 ? translated.join('/') : 'Sterling Silver';
}


// ============================================
// FETCH PRODUCTS (GraphQL with weight)
// ============================================

async function fetchProductsWithOptions() {
  console.log('📦 Fetching products with options + metafields + weight...\n');
  
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
            id title handle descriptionHtml productType vendor
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
            gsGender: metafield(namespace: "google", key: "gender") { value }
            gsAgeGroup: metafield(namespace: "google", key: "age_group") { value }
            colorPattern: metafield(namespace: "shopify", key: "color-pattern") { value }
            material: metafield(namespace: "shopify", key: "jewelry-material") { value }
            targetGender: metafield(namespace: "shopify", key: "target-gender") { value }
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
          gid: node.id,
          title: node.title,
          handle: node.handle,
          body_html: node.descriptionHtml,
          product_type: node.productType,
          vendor: node.vendor,
          metafields: {
            gender: node.gsGender?.value || node.targetGender?.value || null,
            age_group: node.gsAgeGroup?.value || 'adult',
            color: node.colorPattern?.value || null,
            material: node.material?.value || null,
          },
          images: (node.images?.edges || []).map(e => ({
            id: e.node.id.replace('gid://shopify/ProductImage/', ''),
            src: e.node.url
          })),
          options: (node.options || []).map(o => ({
            id: o.id.replace('gid://shopify/ProductOption/', ''),
            gid: o.id, name: o.name,
            values: (o.optionValues || []).map(v => ({
              id: v.id.replace('gid://shopify/ProductOptionValue/', ''),
              gid: v.id, name: v.name
            }))
          })),
          variants: (node.variants?.edges || []).map(e => {
            let weightInGrams = null;
            const weightData = e.node.inventoryItem?.measurement?.weight;
            if (weightData && weightData.value > 0) {
              const unit = (weightData.unit || 'GRAMS').toUpperCase();
              switch (unit) {
                case 'KILOGRAMS': weightInGrams = Math.round(weightData.value * 1000); break;
                case 'POUNDS': weightInGrams = Math.round(weightData.value * 453.592); break;
                case 'OUNCES': weightInGrams = Math.round(weightData.value * 28.3495); break;
                default: weightInGrams = Math.round(weightData.value);
              }
            }
            return {
              id: e.node.id.replace('gid://shopify/ProductVariant/', ''),
              gid: e.node.id, sku: e.node.sku, price: e.node.price,
              compare_at_price: e.node.compareAtPrice,
              inventory_quantity: e.node.inventoryQuantity,
              barcode: e.node.barcode, weight: weightInGrams,
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
    } catch (error) { console.error(`❌ Error: ${error.message}`); break; }
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
            result.translations.forEach(t => { translations[product.id][t.key] = t.value; });
          }
        });
      }
      process.stdout.write(`\r   Products: ${Math.min(i + batchSize, products.length)}/${products.length}`);
      await new Promise(r => setTimeout(r, 200));
    } catch (error) { console.error(`\n   ⚠️ Error: ${error.message}`); }
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
            if (nameTrans?.value) translations[ov.originalName] = nameTrans.value;
          }
        });
      }
      process.stdout.write(`\r   Option values: ${Math.min(i + batchSize, optionValues.length)}/${optionValues.length}`);
      await new Promise(r => setTimeout(r, 200));
    } catch (error) { console.error(`\n   ⚠️ Error: ${error.message}`); }
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
// XML FEED GENERATION (v6 with dynamic shipping)
// ============================================

function generateFeedForMarket(products, translations, market, shippingRates) {
  console.log(`🔧 Generating XML feed for ${market.name} (${market.country})...\n`);
  
  let items = [];
  let stats = { 
    inStock: 0, outOfStock: 0, noImage: 0, translatedVariants: 0, 
    totalVariants: 0, withGender: 0, withColor: 0, withMaterial: 0,
    withWeight: 0, withSize: 0, withShipping: 0, categoryBreakdown: {}
  };

  // v6: Check if we have shipping for this country
  const hasShipping = shippingRates && shippingRates[market.country];
  if (hasShipping) {
    const rate = shippingRates[market.country];
    console.log(`   🚚 Shipping: ${rate.price === 0 ? 'FREE' : rate.price + ' ' + rate.currency}`);
  } else {
    console.log(`   ⚠️ No shipping rate found for ${market.country}`);
  }

  products.forEach(product => {
    const variants = product.variants || [];
    const images = product.images || [];
    const mainImage = images[0]?.src || '';
    
    if (!mainImage) { stats.noImage++; return; }
    
    const additionalImages = images.slice(1, 10).map(img => img.src);
    const prodTrans = translations.products[product.id] || {};
    const translatedTitle = prodTrans.title || product.title;
    const translatedDesc = stripHtml(prodTrans.body_html || product.body_html);
    const gender = getGender(product.product_type, product.title);
    const material = translateMaterial(product.metafields?.material);
    const googleCategory = getGoogleCategory(product.product_type);
    stats.categoryBreakdown[googleCategory] = (stats.categoryBreakdown[googleCategory] || 0) + 1;
    const productIsRing = isRing(product.product_type);
    
    if (gender !== 'unisex') stats.withGender++;
    if (product.metafields?.material) stats.withMaterial++;
    
    variants.forEach(variant => {
      if (variant.inventory_quantity <= 0) { stats.outOfStock++; return; }
      
      stats.inStock++;
      stats.totalVariants++;
      
      let variantSuffix = '';
      let variantColorOriginal = '';
      let ringSize = null;
      
      if (variant.title && variant.title !== 'Default Title') {
        const translatedOptions = (variant.selectedOptions || []).map(opt => {
          if (opt.name === 'Χρώμα' || opt.name.toLowerCase() === 'color') {
            variantColorOriginal = opt.value;
          }
          return translations.optionValues[opt.value] || opt.value;
        });
        variantSuffix = translatedOptions.join(' / ');
        if (translatedOptions.some((t, i) => t !== variant.selectedOptions[i]?.value)) {
          stats.translatedVariants++;
        }
        if (productIsRing) {
          ringSize = getRingSize(variant.selectedOptions);
          if (ringSize) stats.withSize++;
        }
      }
      
      const fullTitle = variantSuffix ? `${translatedTitle} - ${variantSuffix}` : translatedTitle;
      const colorEnglish = translateColor(variantColorOriginal);
      if (colorEnglish) stats.withColor++;
      if (variant.weight) stats.withWeight++;
      
      const variantImage = variant.image_id 
        ? images.find(img => img.id === variant.image_id)?.src || mainImage
        : mainImage;
      const translatedHandle = prodTrans.handle || product.handle;
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
      
      additionalImages.forEach(img => { item += `\n      <g:additional_image_link>${img}</g:additional_image_link>`; });
      
      item += `
      <g:price>${price}</g:price>
      <g:availability>in_stock</g:availability>
      <g:brand><![CDATA[${BRAND}]]></g:brand>
      <g:condition>new</g:condition>
      <g:identifier_exists>false</g:identifier_exists>`;

      item += `\n      <g:google_product_category>${googleCategory}</g:google_product_category>`;
      item += `\n      <g:product_type><![CDATA[${product.product_type || 'Jewelry'}]]></g:product_type>`;
      item += `\n      <g:age_group>adult</g:age_group>`;
      item += `\n      <g:gender>${gender}</g:gender>`;
      
      if (colorEnglish) item += `\n      <g:color><![CDATA[${colorEnglish}]]></g:color>`;
      if (material) item += `\n      <g:material><![CDATA[${material}]]></g:material>`;
      
      const weightFormatted = formatWeight(variant.weight);
      if (weightFormatted) item += `\n      <g:shipping_weight>${weightFormatted}</g:shipping_weight>`;
      if (ringSize) item += `\n      <g:size><![CDATA[${ringSize}]]></g:size>`;
      if (variant.sku) item += `\n      <g:mpn><![CDATA[${variant.sku}]]></g:mpn>`;

      // Sale price handling
      if (variant.compare_at_price && parseFloat(variant.compare_at_price) > parseFloat(variant.price)) {
        item += `\n      <g:sale_price>${price}</g:sale_price>`;
        item += `\n      <g:price>${formatPrice(variant.compare_at_price, market.currency)}</g:price>`;
      }

      // v6 NEW: Add shipping tag
      if (hasShipping) {
        item += formatShippingTag(market.country, shippingRates);
        stats.withShipping++;
      }

      // v7 NEW: Add shipping time attributes
      item += formatShippingTimeAttributes(market.country);

      item += `\n    </item>`;
      items.push(item);
    });
  });

  // Print stats
  console.log(`\n   📊 Stats for ${market.country}:`);
  console.log(`      In-stock items: ${stats.inStock}`);
  console.log(`      With shipping: ${stats.withShipping} items`);  // v6 new
  console.log(`      With weight: ${stats.withWeight} variants`);
  console.log(`      With size: ${stats.withSize} variants`);
  console.log(`      Translated variants: ${stats.translatedVariants}/${stats.totalVariants}`);
  console.log(`      Out-of-stock (skipped): ${stats.outOfStock}`);
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
// MAIN EXECUTION (v6 with shipping)
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
  console.log(`${'='.repeat(60)}\n`);

  // v6: Fetch shipping rates first
  const shippingRates = await fetchShippingRates();

  // Fetch products
  const products = await fetchProductsWithOptions();
  if (products.length === 0) { console.error('❌ No products found'); return; }

  // Fetch translations
  let translations = { products: {}, optionValues: {} };
  if (market.locale !== 'el') {
    translations = await fetchAllTranslations(products, market.locale);
  } else {
    console.log('ℹ️ Greek locale - skipping translations\n');
  }

  // v6: Generate XML with shipping
  const { xml, stats } = generateFeedForMarket(products, translations, market, shippingRates);

  // Ensure output directory exists
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // Write files
  const filename = `emmanuela-${market.country.toLowerCase()}.xml`;
  const filepath = path.join(OUTPUT_DIR, filename);
  fs.writeFileSync(filepath, xml, 'utf8');

  const date = new Date().toISOString().split('T')[0];
  const datedFilename = `emmanuela-${market.country.toLowerCase()}-${date}.xml`;
  const datedFilepath = path.join(OUTPUT_DIR, datedFilename);
  fs.writeFileSync(datedFilepath, xml, 'utf8');

  console.log(`\n✅ Feed saved:`);
  console.log(`   ${filepath}`);
  console.log(`   ${datedFilepath}`);
  console.log(`\n📊 Summary: ${stats.inStock} items (${stats.withShipping} with shipping)\n`);
  
  return { filepath, stats };
}

async function generateAllFeeds() {
  console.log('\n🌍 GENERATING FEEDS FOR ALL 49 MARKETS (v7 with Shipping Times)\n');
  
  // v6: Fetch shipping rates ONCE for all markets
  const shippingRates = await fetchShippingRates();
  
  // Fetch products once
  const products = await fetchProductsWithOptions();
  if (products.length === 0) { console.error('❌ No products found'); return; }

  // Group markets by locale
  const marketsByLocale = {};
  for (const [code, market] of Object.entries(MARKETS)) {
    if (!marketsByLocale[market.locale]) marketsByLocale[market.locale] = [];
    marketsByLocale[market.locale].push({ code, ...market });
  }

  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const results = [];
  let marketCount = 0;
  const totalMarkets = Object.keys(MARKETS).length;

  for (const [locale, markets] of Object.entries(marketsByLocale)) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`📦 Processing locale: ${locale} (${markets.length} markets)`);
    console.log(`${'='.repeat(60)}\n`);

    let translations = { products: {}, optionValues: {} };
    if (locale !== 'el') {
      translations = await fetchAllTranslations(products, locale);
    }

    for (const market of markets) {
      marketCount++;
      console.log(`\n[${marketCount}/${totalMarkets}] Generating ${market.name} (${market.code})...`);
      
      // v6: Pass shipping rates to generator
      const { xml, stats } = generateFeedForMarket(products, translations, market, shippingRates);
      
      const filename = `emmanuela-${market.country.toLowerCase()}.xml`;
      const filepath = path.join(OUTPUT_DIR, filename);
      fs.writeFileSync(filepath, xml, 'utf8');
      
      const hasShipping = shippingRates && shippingRates[market.country] ? '✓' : '✗';
      results.push({ market: market.code, items: stats.inStock, file: filename, shipping: hasShipping });
      console.log(`   ✅ Saved: ${filename} (${stats.inStock} items, shipping: ${hasShipping})`);
      
      await new Promise(r => setTimeout(r, 100));
    }
  }

  // Print summary
  console.log(`\n${'='.repeat(60)}`);
  console.log('📊 GENERATION COMPLETE - SUMMARY');
  console.log(`${'='.repeat(60)}\n`);
  
  const withShipping = results.filter(r => r.shipping === '✓').length;
  console.log(`   Markets with shipping: ${withShipping}/${results.length}\n`);
  results.forEach(r => {
    console.log(`   ${r.market}: ${r.items} items [shipping: ${r.shipping}] → ${r.file}`);
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
    0: 'Dedicated Domains', 1: 'Priority 1 (Major Markets)',
    2: 'Priority 2 (EU Markets)', 3: 'Priority 3 (International)', 4: 'Priority 4 (Micro States)'
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
  console.log('   node google-shopping-feed-v7.js GR     # Single market');
  console.log('   node google-shopping-feed-v7.js all    # All 49 markets');
  console.log('   node google-shopping-feed-v7.js list   # This list\n');
}

// CLI
const arg = process.argv[2];
if (!arg) {
  console.log('❌ Please specify a market code or "all" or "list"');
  console.log('   Example: node google-shopping-feed-v7.js GR');
  process.exit(1);
}

if (arg.toLowerCase() === 'list') listMarkets();
else if (arg.toLowerCase() === 'all') generateAllFeeds().catch(console.error);
else generateFeed(arg).catch(console.error);
