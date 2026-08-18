/**
 * Meta/Facebook Product Feed Generator v1.1 for EMMANUELA
 *
 * CRITICAL DIFFERENCES FROM GOOGLE SHOPPING FEED:
 *   - g:id = Shopify Variant ID (numeric only) - MUST match Pixel content_id
 *   - g:item_group_id = Shopify Product ID (numeric only)
 *   - URLs = emmanuela.gr ONLY (Greece market)
 *   - Currency = EUR
 *   - Language = Greek
 *   - No shipping tags (handled by Commerce Manager)
 *   - Support for video_link (if available)
 *   - Custom labels for campaign segmentation
 *
 * Target Catalog ID: 725638723377889
 *
 * Usage:
 *   node meta-feed-gr.js                    # Generate feed
 *   node meta-feed-gr.js --validate         # Generate and show sample IDs for validation
 *
 * Output: feeds/meta-gr.xml
 *
 * Created: 2026-02-05
 * Updated: 2026-03-20 — v1.1: Color-correct additional images (variant boundary heuristic)
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
const BRAND = 'EMMANUELA handcrafted for you';
const OUTPUT_DIR = path.join(__dirname, 'feeds');

// Meta Catalog Configuration
const META_CATALOG_ID = '725638723377889';
const FEED_TITLE = 'EMMANUELA Meta Product Feed - Greece';
const FEED_DESCRIPTION = 'Χειροποίητα κοσμήματα από ασήμι 925 - Handcrafted Sterling Silver Jewelry';

// Greece Market Configuration
const MARKET = {
  country: 'GR',
  language: 'el',
  currency: 'EUR',
  domain: 'emmanuela.gr',
  path: ''
};

// ============================================
// GOOGLE PRODUCT CATEGORY MAPPING
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

const DEFAULT_GOOGLE_CATEGORY = 188; // Jewelry

function getGoogleCategory(productType) {
  if (!productType) return DEFAULT_GOOGLE_CATEGORY;
  const type = productType.toLowerCase();
  for (const [keyword, categoryId] of Object.entries(GOOGLE_CATEGORY_MAP)) {
    if (type.includes(keyword)) return categoryId;
  }
  return DEFAULT_GOOGLE_CATEGORY;
}

// ============================================
// COLOR NORMALIZATION (Greek - for Greece market feed)
// ============================================

const COLOR_MAP = {
  'επιχρυσωμένο': 'Χρυσό', 'επιχρυσωμένα': 'Χρυσό', 'επιχρυσωμένος': 'Χρυσό', 'επιχρυσωμένη': 'Χρυσό',
  'χρυσό': 'Χρυσό', 'χρυσός': 'Χρυσό', 'ασημένιο': 'Ασημένιο', 'ασημένια': 'Ασημένιο',
  'ασημένιος': 'Ασημένιο', 'ασημί': 'Ασημένιο', 'silver': 'Ασημένιο', 'gold': 'Χρυσό',
  'μαύρο': 'Μαύρο', 'μαύρα': 'Μαύρο', 'μαύρος': 'Μαύρο',
  'οξειδωμένο': 'Ανθρακί', 'οξειδωμένα': 'Ανθρακί', 'ανθρακί': 'Ανθρακί',
  'ροζ': 'Ροζ Χρυσό', 'ροζ επιχρυσωμένο': 'Ροζ Χρυσό', 'ροζ χρυσό': 'Ροζ Χρυσό',
  'λευκό': 'Λευκό', 'λευκά': 'Λευκό', 'μπλε': 'Μπλε',
  'πράσινο': 'Πράσινο', 'πράσινα': 'Πράσινο', 'κόκκινο': 'Κόκκινο', 'κόκκινα': 'Κόκκινο',
  'μπορντό': 'Μπορντό', 'μωβ': 'Μωβ', 'τιρκουάζ': 'Τιρκουάζ', 'σομόν': 'Σομόν',
  'ασημένιο με μπλε': 'Ασημένιο/Μπλε', 'ασημένιο με πράσινο': 'Ασημένιο/Πράσινο',
  'επιχρυσωμένο με σομόν': 'Χρυσό/Σομόν', 'μαύρο ανθρακί': 'Μαύρο',
  'επιχυσωμένο': 'Χρυσό',  // typo fix
  'πολύχρωμο': 'Πολύχρωμο', 'πολύχρωμα': 'Πολύχρωμο', 'πολύχρωμο σετ': 'Πολύχρωμο',
  'black': 'Μαύρο',
};

// ============================================
// MATERIAL TRANSLATIONS
// ============================================

const MATERIAL_TRANSLATIONS = {
  'sterling-silver': '925 Sterling Silver', 'silver': '925 Sterling Silver', 'silver-1': '925 Sterling Silver',
  'gold-1': 'Gold', 'gold': 'Gold', 'synthetic': 'Synthetic', 'pearl': 'Pearl',
  'zircon': 'Cubic Zirconia', 'ασήμι': '925 Sterling Silver', 'ασήμι 925': '925 Sterling Silver',
};

// ============================================
// CUSTOM LABELS CONFIGURATION
// For campaign segmentation in Meta Ads
// ============================================

const PRICE_TIERS = {
  'Under30': { min: 0, max: 30 },
  'Under50': { min: 30, max: 50 },
  'Under100': { min: 50, max: 100 },
  'Premium': { min: 100, max: Infinity }
};

function getPriceTier(price) {
  const p = parseFloat(price);
  for (const [tier, range] of Object.entries(PRICE_TIERS)) {
    if (p >= range.min && p < range.max) return tier;
  }
  return 'Premium';
}

function getProductTypeLabel(productType) {
  if (!productType) return 'Jewelry';
  const type = productType.toLowerCase();
  if (type.includes('ring') || type.includes('δαχτυλίδ')) return 'Ring';
  if (type.includes('earring') || type.includes('σκουλαρίκ')) return 'Earring';
  if (type.includes('necklace') || type.includes('κολιέ')) return 'Necklace';
  if (type.includes('bracelet') || type.includes('βραχιόλ')) return 'Bracelet';
  if (type.includes('pendant') || type.includes('μενταγιόν')) return 'Pendant';
  if (type.includes('set') || type.includes('σετ')) return 'Set';
  return 'Jewelry';
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
    .trim()
    .substring(0, 5000);
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
  // Meta feed: emmanuela.gr domain only
  return `https://${MARKET.domain}/products/${handle}?variant=${variantId}`;
}

function formatPrice(amount, currency = 'EUR') {
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

function normalizeColor(greekColor) {
  if (!greekColor) return null;
  const normalized = greekColor.toLowerCase().trim();
  // Skip values containing digits (e.g. "3 mehrfarbige manschetten")
  if (/\d/.test(normalized)) return null;
  // Skip overly long values (variant descriptions, not colors)
  if (normalized.length > 25) return null;
  // Skip values with encoding corruption (replacement characters)
  if (/\uFFFD/.test(normalized)) return null;
  if (COLOR_MAP[normalized]) return COLOR_MAP[normalized];
  for (const [key, val] of Object.entries(COLOR_MAP)) {
    if (normalized.includes(key)) return val;
  }
  return greekColor.charAt(0).toUpperCase() + greekColor.slice(1);
}

function translateMaterial(materialStr) {
  if (!materialStr) return '925 Sterling Silver';
  const materials = materialStr.split(';').map(m => m.trim().toLowerCase());
  const translated = [];
  for (const mat of materials) {
    if (MATERIAL_TRANSLATIONS[mat] && !translated.includes(MATERIAL_TRANSLATIONS[mat])) {
      translated.push(MATERIAL_TRANSLATIONS[mat]);
    }
  }
  return translated.length > 0 ? translated.join('/') : '925 Sterling Silver';
}

function getGender(productType, title) {
  const type = (productType || '').toLowerCase();
  const t = (title || '').toLowerCase();
  if (type.includes('ανδρικ') || t.includes('ανδρικ') || type.includes('men')) return 'male';
  if (type.includes('γυναικ') || t.includes('γυναικ') || type.includes('women')) return 'female';
  return 'female'; // Default to female for jewelry
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
  for (let attempt = 1; attempt <= retries; attempt++) {
    const result = await httpsRequest(options, JSON.stringify({ query }));
    const isThrottled = result.data?.errors?.some(e => e.extensions?.code === 'THROTTLED');
    if (isThrottled && attempt < retries) {
      const wait = attempt * 4;
      console.log(`   ⏳ Throttled, waiting ${wait}s (attempt ${attempt}/${retries})...`);
      await new Promise(r => setTimeout(r, wait * 1000));
      continue;
    }
    return result;
  }
}

// ============================================
// FETCH PRODUCTS (GraphQL)
// ============================================

async function fetchProducts() {
  console.log('📦 Fetching products from Shopify...\n');

  const allProducts = [];
  let cursor = null;
  let page = 1;

  while (true) {
    const afterClause = cursor ? `, after: "${cursor}"` : '';

    const query = `{
      products(first: 50${afterClause}) {
        pageInfo { hasNextPage endCursor }
        edges {
          node {
            id title handle descriptionHtml productType vendor status
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
          status: node.status,
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
            gid: o.id,
            name: o.name,
            values: (o.optionValues || []).map(v => ({
              id: v.id.replace('gid://shopify/ProductOptionValue/', ''),
              gid: v.id,
              name: v.name
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
              gid: e.node.id,
              sku: e.node.sku,
              price: e.node.price,
              compare_at_price: e.node.compareAtPrice,
              inventory_quantity: e.node.inventoryQuantity,
              barcode: e.node.barcode,
              weight: weightInGrams,
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
// XML FEED GENERATION FOR META
// ============================================

function generateMetaFeed(products) {
  console.log(`🔧 Generating Meta XML feed for Greece...\n`);

  const items = [];
  const stats = {
    inStock: 0,
    outOfStock: 0,
    noImage: 0,
    totalVariants: 0,
    withColor: 0,
    withMaterial: 0,
    withWeight: 0,
    withSize: 0,
    withSalePrice: 0,
    categoryBreakdown: {},
    sampleIds: [] // For validation
  };

  products.forEach(product => {
    const variants = product.variants || [];
    const images = product.images || [];
    const mainImage = images[0]?.src || '';

    if (!mainImage) {
      stats.noImage++;
      return;
    }

    // v1.1: Pre-compute image ranges per variant for color-correct additional images
    const allVariantImageIds = new Set(
      variants.map(v => v.image_id).filter(Boolean)
    );
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

    // Product-level data
    const description = stripHtml(product.body_html);
    const gender = getGender(product.product_type, product.title);
    const material = translateMaterial(product.metafields?.material);
    const googleCategory = getGoogleCategory(product.product_type);
    const productTypeLabel = getProductTypeLabel(product.product_type);
    const productIsRing = isRing(product.product_type);

    // Track categories
    stats.categoryBreakdown[googleCategory] = (stats.categoryBreakdown[googleCategory] || 0) + 1;

    variants.forEach(variant => {
      // 2026-08-18: ΔΕΝ παραλείπουμε τα εξαντλημένα/draft — τα εκπέμπουμε με availability=out of stock,
      // ώστε το Meta να τα ΕΝΗΜΕΡΩΝΕΙ (το scheduled fetch δεν διαγράφει απόντα items: num_deleted_items=0 ⇒
      // ό,τι έλειπε από το feed έμενε «in stock» για πάντα και σερβιριζόταν — μετρημένο 14,7% των catalog κλικ).
      const sellable = product.status === 'ACTIVE' && variant.inventory_quantity > 0;
      const availability = sellable ? 'in stock' : 'out of stock';
      if (sellable) stats.inStock++; else stats.outOfStock++;
      stats.totalVariants++;

      // Extract variant options
      let variantSuffix = '';
      let variantColorOriginal = '';
      let ringSize = null;

      if (variant.title && variant.title !== 'Default Title') {
        const options = (variant.selectedOptions || []).map(opt => {
          if (opt.name === 'Χρώμα' || opt.name === 'Χρώμα μετάλλου' || opt.name.toLowerCase() === 'color') {
            variantColorOriginal = opt.value;
          }
          return opt.value;
        });
        variantSuffix = options.join(' / ');

        if (productIsRing) {
          ringSize = getRingSize(variant.selectedOptions);
          if (ringSize) stats.withSize++;
        }
      }

      // Build title
      const fullTitle = variantSuffix ? `${product.title} - ${variantSuffix}` : product.title;

      // Color translation
      const colorNormalized = normalizeColor(variantColorOriginal);
      if (colorNormalized) stats.withColor++;
      if (variant.weight) stats.withWeight++;

      // v1.1: Color-correct images — use variant boundary heuristic
      let variantImage;
      let variantAdditionalImages;

      if (variant.image_id && imageRangeByVariantImageId[variant.image_id]) {
        const range = imageRangeByVariantImageId[variant.image_id];
        variantImage = range[0]?.src || mainImage;
        variantAdditionalImages = range
          .map(img => img.src)
          .filter(src => src !== variantImage)
          .slice(0, 10);
      } else {
        variantImage = variant.image_id
          ? images.find(img => img.id === variant.image_id)?.src || mainImage
          : mainImage;
        variantAdditionalImages = [];
      }

      // Build URL
      const productUrl = buildProductUrl(product.handle, variant.id);

      // Price formatting
      const price = formatPrice(variant.price, MARKET.currency);
      const priceTier = getPriceTier(variant.price);

      // Store sample IDs for validation (first 10)
      if (stats.sampleIds.length < 10) {
        stats.sampleIds.push({
          variantId: variant.id,
          productId: product.id,
          title: fullTitle.substring(0, 50)
        });
      }

      // ═══════════════════════════════════════════════════════════
      // BUILD XML ITEM
      // ═══════════════════════════════════════════════════════════

      let item = `    <item>
      <!-- IDENTIFIERS - MUST match Pixel content_ids -->
      <g:id>${variant.id}</g:id>
      <g:item_group_id>${product.id}</g:item_group_id>

      <!-- BASIC INFO -->
      <g:title><![CDATA[${fullTitle.substring(0, 150)}]]></g:title>
      <g:description><![CDATA[${description.substring(0, 5000)}]]></g:description>
      <g:link>${escapeXml(productUrl)}</g:link>

      <!-- IMAGES -->
      <g:image_link>${variantImage}</g:image_link>`;

      // Additional images (v1.1: color-correct only)
      variantAdditionalImages.forEach(img => {
        item += `\n      <g:additional_image_link>${img}</g:additional_image_link>`;
      });

      // Price and availability
      item += `

      <!-- PRICE & AVAILABILITY -->
      <g:price>${price}</g:price>
      <g:availability>${availability}</g:availability>
      <g:condition>new</g:condition>`;

      // Sale price handling
      if (variant.compare_at_price && parseFloat(variant.compare_at_price) > parseFloat(variant.price)) {
        stats.withSalePrice++;
        item += `
      <g:sale_price>${price}</g:sale_price>`;
        // Override price with compare_at_price
        item = item.replace(
          `<g:price>${price}</g:price>`,
          `<g:price>${formatPrice(variant.compare_at_price, MARKET.currency)}</g:price>`
        );
      }

      // Brand
      item += `

      <!-- BRAND & CATEGORY -->
      <g:brand><![CDATA[${BRAND}]]></g:brand>
      <g:google_product_category>${googleCategory}</g:google_product_category>
      <g:product_type><![CDATA[${product.product_type || 'Jewelry'}]]></g:product_type>`;

      // Demographics
      item += `

      <!-- DEMOGRAPHICS -->
      <g:gender>${gender}</g:gender>
      <g:age_group>adult</g:age_group>`;

      // Jewelry-specific attributes
      item += `

      <!-- JEWELRY ATTRIBUTES -->`;

      if (material) {
        stats.withMaterial++;
        item += `\n      <g:material><![CDATA[${material}]]></g:material>`;
      }

      if (colorNormalized) {
        item += `\n      <g:color><![CDATA[${colorNormalized}]]></g:color>`;
      }

      if (ringSize) {
        item += `\n      <g:size><![CDATA[${ringSize}]]></g:size>`;
      }

      // Weight
      const weightFormatted = formatWeight(variant.weight);
      if (weightFormatted) {
        item += `\n      <g:shipping_weight>${weightFormatted}</g:shipping_weight>`;
      }

      // Custom Labels for Meta Ads Segmentation
      item += `

      <!-- CUSTOM LABELS (for Meta Ads segmentation) -->
      <g:custom_label_0>${productTypeLabel}</g:custom_label_0>
      <g:custom_label_1>${priceTier}</g:custom_label_1>`;

      // Label 2: Collection (based on product type)
      const collectionLabel = product.product_type || 'General';
      item += `\n      <g:custom_label_2><![CDATA[${collectionLabel}]]></g:custom_label_2>`;

      // Label 3: Material-based
      const materialLabel = material.includes('Gold') ? 'Gold' : 'Silver';
      item += `\n      <g:custom_label_3>${materialLabel}</g:custom_label_3>`;

      // SKU/MPN
      if (variant.sku) {
        item += `

      <!-- IDENTIFIERS -->
      <g:mpn><![CDATA[${variant.sku}]]></g:mpn>`;
      }

      item += `\n    </item>`;
      items.push(item);
    });
  });

  // Print stats
  console.log(`\n   📊 Feed Statistics:`);
  console.log(`      In-stock items: ${stats.inStock}`);
  console.log(`      Out-of-stock / draft (emitted as "out of stock"): ${stats.outOfStock}`);
  console.log(`      Products without image (skipped): ${stats.noImage}`);
  console.log(`      With color: ${stats.withColor}`);
  console.log(`      With material: ${stats.withMaterial}`);
  console.log(`      With weight: ${stats.withWeight}`);
  console.log(`      With size (rings): ${stats.withSize}`);
  console.log(`      With sale price: ${stats.withSalePrice}`);
  console.log('');

  // Build final XML
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss xmlns:g="http://base.google.com/ns/1.0" version="2.0">
  <channel>
    <title>${FEED_TITLE}</title>
    <link>https://${MARKET.domain}</link>
    <description>${FEED_DESCRIPTION}</description>
${items.join('\n')}
  </channel>
</rss>`;

  return { xml, stats };
}

// ============================================
// VALIDATION HELPER
// ============================================

function printValidationInfo(stats) {
  console.log(`\n${'='.repeat(60)}`);
  console.log('🔍 VALIDATION INFO - Compare with Meta Commerce Manager');
  console.log(`${'='.repeat(60)}\n`);

  console.log('📋 Sample Content IDs (g:id) - These MUST match Pixel content_ids:\n');
  stats.sampleIds.forEach((sample, i) => {
    console.log(`   ${i + 1}. Variant ID: ${sample.variantId}`);
    console.log(`      Product ID: ${sample.productId}`);
    console.log(`      Title: ${sample.title}...`);
    console.log('');
  });

  console.log('🎯 Target Catalog ID:', META_CATALOG_ID);
  console.log('');
  console.log('📌 Verify in Commerce Manager:');
  console.log(`   https://business.facebook.com/commerce/catalogs/${META_CATALOG_ID}/products/`);
  console.log('');
  console.log('✅ Check that the Content IDs in your catalog match the Variant IDs above');
  console.log('');
}

// ============================================
// MAIN EXECUTION
// ============================================

async function generateFeed(options = {}) {
  console.log(`\n${'='.repeat(60)}`);
  console.log('🔵 META PRODUCT FEED GENERATOR v1.1');
  console.log(`${'='.repeat(60)}`);
  console.log(`   Target: Greece (emmanuela.gr)`);
  console.log(`   Catalog ID: ${META_CATALOG_ID}`);
  console.log(`   Currency: EUR`);
  console.log(`${'='.repeat(60)}\n`);

  // Fetch products
  const products = await fetchProducts();
  if (products.length === 0) {
    console.error('❌ No products found');
    return;
  }

  // Generate feed
  const { xml, stats } = generateMetaFeed(products);

  // Ensure output directory exists
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // Write files
  const filename = 'meta-gr.xml';
  const filepath = path.join(OUTPUT_DIR, filename);
  fs.writeFileSync(filepath, xml, 'utf8');

  // Also write dated version
  const date = new Date().toISOString().split('T')[0];
  const datedFilename = `meta-gr-${date}.xml`;
  const datedFilepath = path.join(OUTPUT_DIR, datedFilename);
  fs.writeFileSync(datedFilepath, xml, 'utf8');

  console.log(`\n✅ Feed saved:`);
  console.log(`   ${filepath}`);
  console.log(`   ${datedFilepath}`);
  console.log(`\n📊 Summary: ${stats.totalVariants} items in feed (${stats.inStock} in stock)\n`);

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
