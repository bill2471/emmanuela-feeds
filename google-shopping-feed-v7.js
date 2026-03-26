/**
 * Google Shopping Feed Generator v11.2 for EMMANUELA
 *
 * v11.2 (Shipping consistency fixes):
 *   - FIX: max_handling_time 2→1 (always 1 business day)
 *   - FIX: Transit times aligned with shipping pages (handling 1 + transit = page total)
 *     GR/DE: 1-3, EU/CH/NO/CA: 2-4, GB: 2-5, US: 2-6, AU/NZ/MX/AE/IL/SA/ASIA: 2-7
 *   - FIX: Courier names unified — ACS Courier (GR), DHL Express (all others)
 *     Removed UPS International Express, DHL Tracked Delivery variants
 *   - NEW: shipping_handling_business_days = Mon-Fri (explicit, matches default)
 *   - NEW: shipping_transit_business_days = Mon-Fri (overrides default Mon-Sat)
 *     Business days = Monday-Friday ONLY, no Saturday deliveries
 *
 * v11.1 (IS removal + PR→US Spanish):
 *   - REMOVED Iceland (IS) — microstate, not supported by GMC
 *   - PR (Puerto Rico): now uses US market with Spanish (/es-us) instead of
 *     separate PR market. feedSuffix='pr' keeps filename emmanuela-pr.xml.
 *     country='US' for GMC target, language='es' for Spanish content.
 *
 * v11.0 (Country-Specific Subfolder Migration):
 *   - BREAKING: Updated all .jewelry market paths from language-only (/fr/)
 *     to country-specific subfolders (/fr-fr/) matching Shopify Markets migration
 *   - Markets with dedicated country subfolders (verified from Shopify API):
 *     AU=/en-au, BE=/nl-be, CA=/en-ca, CH=/de-ch, DK=/da-dk, ES=/es-es,
 *     FI=/fi-fi, FR=/fr-fr, HU=/hu-hu, IT=/it-it, MX=/es-mx, NL=/nl-nl,
 *     NO=/no-no, NZ=/en-nz, PT=/pt-pt, SA=/en-sa, SG=/en-sg, US=/en-us
 *   - Markets still in International catch-all (keep old language-only paths
 *     until their dedicated markets are created): AT, IE, SE, CZ, RO, JP, AE,
 *     IL, SK, SI, EE, LV, LT, BG, HR, MY, ID, TW, TH, HK, PL
 *   - 4 NEW feeds for multi-language countries:
 *     CH-FR (/fr-ch), CH-IT (/it-ch), BE-FR (/fr-be), CA-FR (/fr-ca)
 *   - REMOVED 9 microstate entries: CY, MT, LU, MC, LI, AD, SM, VA, IS
 *     (Google does not support microstates as GMC target countries)
 *   - Hub-and-spoke updated: IT hub keeps BG/HR/SI, FI hub keeps EE/LV/LT
 *   - CI schedule changed from hourly to every 6 hours
 *
 * v10.1 (Localized Material Attribute):
 *   - Material names now translated per market language (DE, FR, IT, ES, EL)
 *   - DE: "Sterling Silver" → "925er Silber", "Silver" → "Silber", "Pearl" → "Perle"
 *   - Falls back to English for unsupported languages
 *
 * v10.0 (Market-Adjusted Pricing):
 *   - CRITICAL FIX: Feed prices now match landing page prices for ALL markets
 *   - Problem: variant.price from Admin API includes Greek 24% VAT (taxesIncluded=true)
 *     but Shopify Markets auto-recalculates VAT per country on landing pages.
 *     Example: DE product 49.00 EUR (feed) vs 47.03 EUR (page) = 4% mismatch
 *   - Fix: Uses Shopify contextualPricing API to determine exact price adjustment
 *     factor per market (VAT adjustment + currency conversion) in ONE API call
 *   - GR feed: unchanged (same 24% VAT, factor ≈ 1.0)
 *   - EUR markets: VAT-adjusted (e.g., DE 19% → factor ≈ 0.9598)
 *   - Non-EUR markets: VAT-adjusted + currency-converted (e.g., GB → GBP)
 *   - Sale prices (compare_at_price) also adjusted with same factor
 *   - Hub feeds use hub country pricing (matching hub landing page URLs)
 *   - Graceful fallback to catalog prices if contextualPricing API fails
 *
 * v9.0 (Hub-and-Spoke):
 *   - 14 countries that can't be GMC target countries now served via hub feeds
 *   - Hub IT (EUR): CY, BG, HR, SI, MT, VA, SM (7 spokes)
 *   - Hub FR (EUR): LU, MC, AD (3 spokes)
 *   - Hub FI (EUR): EE, LV, LT (3 spokes)
 *   - Hub CH (CHF): LI (1 spoke)
 *   - Hub feeds include multiple <g:shipping> blocks (hub + all spoke countries)
 *   - Spoke countries no longer generate standalone XML files
 *   - MARKETS entries retained for spoke countries (needed for shipping rates/transit times)
 *   - Feed count: 36 (was 50). All hubs use emmanuela.jewelry domain.
 *
 * v8.2:
 *   - FIX: Size extraction for ALL products, not just rings
 *     Chokers, bracelets, and other products with S/M/L sizing now get <g:size>
 *     Added "νούμερα" to option name detection (was missing 78 products)
 *     Renamed getRingSize → getSize, removed isRing gate
 *
 * v8.1:
 *   - FIX: Exclude PR from non-PR feeds (shopping_ads_excluded_country=PR)
 *     GMC auto-expanded Puerto Rico to all 47 feeds. Same pattern as GR exclusion (v7.6).
 *
 * NEW in v8.0 (Shipping + Returns + Checkout Overhaul):
 *   - REMOVED: <g:checkout_link_template> from ALL feeds
 *     Google Bot cannot validate Shopify dynamic checkout URLs (session tokens).
 *     Feature only works in US/CA/GB/IN/DE/JP — not for GR or .jewelry markets.
 *     Cart permalink /cart/{variant}:1 caused persistent "checkout URL not approved" warnings.
 *     Zero commercial impact — only removes "Buy Now" button, not ads/listings.
 *   - NEW: <g:service> shipping service name in ALL feeds
 *     Per-country carrier names: ACS Courier Express (GR), DHL Tracked Delivery (DE/BG/CZ),
 *     DHL DDP Express (US/PR), DHL Express (MX/SA), UPS International Express (all others).
 *   - NEW: Per-country <g:return_policy_label> (replaces hardcoded "default")
 *     3 labels: "default" (EU free returns), "international_returns" (customer pays),
 *     "us_no_returns" (no returns). Fixes UK Misrepresentation suspension root cause.
 *   - NEW: Puerto Rico (PR) market — Spanish, USD, DHL DDP, us_no_returns
 *   - FIX: Norway/Iceland/Liechtenstein reclassified as "international_returns"
 *     (paid shipping = paid returns, NOT EU free returns)
 *   - Total markets: 50 (was 49)
 *
 * v7.10:
 *   - FIX: Norway path '/nb' → '/no'
 *
 * v7.9:
 *   - FIX: Malta/Malaysia native languages + English fallback chain
 *
 * v7.8:
 *   - FIX: Removed '/en' path prefix from 20 English-language markets
 *
 * v7.7 (REMOVED in v8.0):
 *   - CHECKOUT LINK: Was adding <g:checkout_link_template> — now removed
 *
 * NEW in v7.6:
 *   - GREECE EXCLUSION: Adds <g:shopping_ads_excluded_country>GR</g:shopping_ads_excluded_country>
 *     to all non-GR feeds. Prevents Google MCA inheritance auto-expansion that adds Greece
 *     as target country to UK/International sub-accounts (root cause of Misrepresentation issue).
 *
 * NEW in v7.5:
 *   - VIDEO SUPPORT: Fetches product videos from Shopify media API
 *   - Outputs <g:video_link> tag for products with hosted videos
 *   - Uses media(first: 20) GraphQL query instead of images(first: 10)
 *   - Supports Shopify-hosted videos (CDN URLs, .mp4)
 *   - YouTube URLs NOT supported by Google Merchant Center feed spec
 *   - Stats tracking: withVideo counter
 *
 * NEW in v7.3:
 *   - FIXED: Color fallback chain for missing colors
 *     1. First checks variant option "Χρώμα" or "Color"
 *     2. Falls back to product metafield color-pattern
 *     3. Defaults to "Silver" if no color found
 *   - This fixes ~1,100 products missing color in GMC
 *
 * NEW in v7.2:
 *   - FIXED: Transit times now INSIDE <g:shipping> tag (Google requirement)
 *   - handling_time and transit_time are now sub-attributes of shipping
 *   - ships_from_country and return_policy_label remain item-level
 *   - (v8: return_policy_label now per-country, service name added)
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
// COLOR FALLBACK MAP (English - used when Shopify translation is missing)
// Primary source is Shopify translations per locale; this is the safety net
// ============================================

const COLOR_MAP = {
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
  'επιχυσωμένο': 'Gold',  // typo fix - missing ρ
  'πολύχρωμο': 'Multicolor', 'πολύχρωμα': 'Multicolor', 'πολύχρωμο σετ': 'Multicolor',
  'black': 'Black',
};

// ============================================
// MATERIAL TRANSLATIONS
// ============================================

const MATERIAL_TRANSLATIONS = {
  en: {
    'sterling-silver': 'Sterling Silver', 'silver': 'Silver', 'silver-1': 'Silver',
    'gold-1': 'Gold', 'gold': 'Gold', 'synthetic': 'Synthetic', 'pearl': 'Pearl',
    'zircon': 'Zircon', 'ασήμι': 'Sterling Silver', 'ασήμι 925': 'Sterling Silver',
  },
  de: {
    'sterling-silver': '925er Silber', 'silver': 'Silber', 'silver-1': 'Silber',
    'gold-1': 'Gold', 'gold': 'Gold', 'synthetic': 'Synthetik', 'pearl': 'Perle',
    'zircon': 'Zirkon', 'ασήμι': '925er Silber', 'ασήμι 925': '925er Silber',
  },
  fr: {
    'sterling-silver': 'Argent Sterling', 'silver': 'Argent', 'silver-1': 'Argent',
    'gold-1': 'Or', 'gold': 'Or', 'synthetic': 'Synthétique', 'pearl': 'Perle',
    'zircon': 'Zircon', 'ασήμι': 'Argent Sterling', 'ασήμι 925': 'Argent Sterling',
  },
  it: {
    'sterling-silver': 'Argento 925', 'silver': 'Argento', 'silver-1': 'Argento',
    'gold-1': 'Oro', 'gold': 'Oro', 'synthetic': 'Sintetico', 'pearl': 'Perla',
    'zircon': 'Zircone', 'ασήμι': 'Argento 925', 'ασήμι 925': 'Argento 925',
  },
  es: {
    'sterling-silver': 'Plata de Ley', 'silver': 'Plata', 'silver-1': 'Plata',
    'gold-1': 'Oro', 'gold': 'Oro', 'synthetic': 'Sintético', 'pearl': 'Perla',
    'zircon': 'Circón', 'ασήμι': 'Plata de Ley', 'ασήμι 925': 'Plata de Ley',
  },
  el: {
    'sterling-silver': 'Ασήμι 925', 'silver': 'Ασήμι', 'silver-1': 'Ασήμι',
    'gold-1': 'Χρυσός', 'gold': 'Χρυσός', 'synthetic': 'Συνθετικό', 'pearl': 'Μαργαριτάρι',
    'zircon': 'Ζιρκόν', 'ασήμι': 'Ασήμι 925', 'ασήμι 925': 'Ασήμι 925',
  },
};


// ============================================
// PRODUCT TYPE TRANSLATIONS (Shopify product_type is NOT translatable via API)
// ============================================

const PRODUCT_TYPE_TRANSLATIONS = {
  en: {
    'Ανδρικά σκουλαρίκια ear cuff': "Men's Ear Cuff Earrings",
    'Ανδρικά καρφωτά σκουλαρίκια': "Men's Stud Earrings",
    'Γυναικεία καρφωτά σκουλαρίκια': "Women's Stud Earrings",
    'Γυναικεία κρεμαστά σκουλαρίκια': "Women's Dangle Earrings",
    'Γυναικεία σκουλαρίκια κρίκοι': "Women's Hoop Earrings",
    'Γυναικεία σκουλαρίκια ear cuff': "Women's Ear Cuff Earrings",
    'Γυναικεία σκουλαρίκια ear climber': "Women's Ear Climber Earrings",
    'Γυναικεία δαχτυλίδια': "Women's Rings",
    'Γυναικεία βραχιόλια': "Women's Bracelets",
    'Γυναικεία μενταγιόν': "Women's Pendants",
    'Γυναικεία κολιέ': "Women's Necklaces",
    'Γυναικεία καρφίτσες': "Women's Brooches",
    'Γυναικεία σετ κοσμημάτων': "Women's Jewelry Sets",
    'Στέφανα γάμου': 'Wedding Crowns',
    'Δωροκάρτα': 'Gift Card',
    'Ανδρικά δαχτυλίδια': "Men's Rings",
    'Ανδρικά βραχιόλια': "Men's Bracelets",
    'Ανδρικά κολιέ': "Men's Necklaces",
    'Μινιατούρες': 'Miniatures',
  },
  de: {
    'Ανδρικά σκουλαρίκια ear cuff': 'Herren Ear Cuff Ohrringe',
    'Ανδρικά καρφωτά σκουλαρίκια': 'Herren Ohrstecker',
    'Γυναικεία καρφωτά σκουλαρίκια': 'Damen Ohrstecker',
    'Γυναικεία κρεμαστά σκουλαρίκια': 'Damen Hängeohrringe',
    'Γυναικεία σκουλαρίκια κρίκοι': 'Damen Creolen',
    'Γυναικεία σκουλαρίκια ear cuff': 'Damen Ear Cuff Ohrringe',
    'Γυναικεία σκουλαρίκια ear climber': 'Damen Ear Climber Ohrringe',
    'Γυναικεία δαχτυλίδια': 'Damen Ringe',
    'Γυναικεία βραχιόλια': 'Damen Armbänder',
    'Γυναικεία μενταγιόν': 'Damen Anhänger',
    'Γυναικεία κολιέ': 'Damen Halsketten',
    'Γυναικεία καρφίτσες': 'Damen Broschen',
    'Γυναικεία σετ κοσμημάτων': 'Damen Schmucksets',
    'Στέφανα γάμου': 'Hochzeitskronen',
    'Δωροκάρτα': 'Geschenkkarte',
    'Ανδρικά δαχτυλίδια': 'Herren Ringe',
    'Ανδρικά βραχιόλια': 'Herren Armbänder',
    'Ανδρικά κολιέ': 'Herren Halsketten',
    'Μινιατούρες': 'Miniaturen',
  },
  fr: {
    'Ανδρικά σκουλαρίκια ear cuff': "Boucles d'oreilles Ear Cuff Homme",
    'Ανδρικά καρφωτά σκουλαρίκια': "Boucles d'oreilles Puces Homme",
    'Γυναικεία καρφωτά σκουλαρίκια': "Boucles d'oreilles Puces Femme",
    'Γυναικεία κρεμαστά σκουλαρίκια': "Boucles d'oreilles Pendantes Femme",
    'Γυναικεία σκουλαρίκια κρίκοι': "Boucles d'oreilles Créoles Femme",
    'Γυναικεία σκουλαρίκια ear cuff': "Boucles d'oreilles Ear Cuff Femme",
    'Γυναικεία σκουλαρίκια ear climber': "Boucles d'oreilles Ear Climber Femme",
    'Γυναικεία δαχτυλίδια': 'Bagues Femme',
    'Γυναικεία βραχιόλια': 'Bracelets Femme',
    'Γυναικεία μενταγιόν': 'Pendentifs Femme',
    'Γυναικεία κολιέ': 'Colliers Femme',
    'Γυναικεία καρφίτσες': 'Broches Femme',
    'Γυναικεία σετ κοσμημάτων': 'Parures Femme',
    'Στέφανα γάμου': 'Couronnes de Mariage',
    'Δωροκάρτα': 'Carte Cadeau',
    'Ανδρικά δαχτυλίδια': 'Bagues Homme',
    'Ανδρικά βραχιόλια': 'Bracelets Homme',
    'Ανδρικά κολιέ': 'Colliers Homme',
    'Μινιατούρες': 'Miniatures',
  },
  it: {
    'Ανδρικά σκουλαρίκια ear cuff': 'Orecchini Ear Cuff Uomo',
    'Ανδρικά καρφωτά σκουλαρίκια': 'Orecchini a Bottone Uomo',
    'Γυναικεία καρφωτά σκουλαρίκια': 'Orecchini a Bottone Donna',
    'Γυναικεία κρεμαστά σκουλαρίκια': 'Orecchini Pendenti Donna',
    'Γυναικεία σκουλαρίκια κρίκοι': 'Orecchini a Cerchio Donna',
    'Γυναικεία σκουλαρίκια ear cuff': 'Orecchini Ear Cuff Donna',
    'Γυναικεία σκουλαρίκια ear climber': 'Orecchini Ear Climber Donna',
    'Γυναικεία δαχτυλίδια': 'Anelli Donna',
    'Γυναικεία βραχιόλια': 'Bracciali Donna',
    'Γυναικεία μενταγιόν': 'Ciondoli Donna',
    'Γυναικεία κολιέ': 'Collane Donna',
    'Στέφανα γάμου': 'Corone Nuziali',
    'Δωροκάρτα': 'Carta Regalo',
    'Μινιατούρες': 'Miniature',
  },
  es: {
    'Ανδρικά σκουλαρίκια ear cuff': 'Pendientes Ear Cuff Hombre',
    'Ανδρικά καρφωτά σκουλαρίκια': 'Pendientes de Botón Hombre',
    'Γυναικεία καρφωτά σκουλαρίκια': 'Pendientes de Botón Mujer',
    'Γυναικεία κρεμαστά σκουλαρίκια': 'Pendientes Colgantes Mujer',
    'Γυναικεία σκουλαρίκια κρίκοι': 'Pendientes de Aro Mujer',
    'Γυναικεία σκουλαρίκια ear cuff': 'Pendientes Ear Cuff Mujer',
    'Γυναικεία σκουλαρίκια ear climber': 'Pendientes Ear Climber Mujer',
    'Γυναικεία δαχτυλίδια': 'Anillos Mujer',
    'Γυναικεία βραχιόλια': 'Pulseras Mujer',
    'Γυναικεία μενταγιόν': 'Colgantes Mujer',
    'Γυναικεία κολιέ': 'Collares Mujer',
    'Στέφανα γάμου': 'Coronas de Boda',
    'Δωροκάρτα': 'Tarjeta Regalo',
    'Μινιατούρες': 'Miniaturas',
  },
};

/**
 * Translate product type from Greek to target language
 * Falls back to English, then to original Greek
 */
function translateProductType(greekType, language) {
  if (!greekType) return 'Jewelry';
  if (language === 'el') return greekType;
  const langMap = PRODUCT_TYPE_TRANSLATIONS[language] || PRODUCT_TYPE_TRANSLATIONS['en'];
  return langMap[greekType] || PRODUCT_TYPE_TRANSLATIONS['en']?.[greekType] || greekType;
}


// ============================================
// MARKET DEFINITIONS
// v11.0: Country-specific subfolders (verified from Shopify Markets API 2026-03-17)
// Markets with dedicated Shopify markets use new /lang-country/ paths
// Markets still in International catch-all use old /lang/ paths (will be updated when their markets are created)
// REMOVED: CY, MT, LU, MC, LI, AD, SM, VA (microstates — Google does not support as GMC target countries)
// NEW: CH_FR, CH_IT, BE_FR, CA_FR (multi-language country feeds)
// ============================================

const MARKETS = {
  // DEDICATED DOMAINS (no change)
  GR: { country: 'GR', language: 'el', currency: 'EUR', locale: 'el', domain: 'emmanuela.gr', path: '', priority: 0, name: 'Greece' },
  DE: { country: 'DE', language: 'de', currency: 'EUR', locale: 'de', domain: 'emmanuela-schmuck.de', path: '', priority: 0, name: 'Germany' },
  GB: { country: 'GB', language: 'en', currency: 'GBP', locale: 'en', domain: 'emmanuela.co.uk', path: '', priority: 0, name: 'United Kingdom' },

  // PRIORITY 1 — Major Markets (all have dedicated Shopify markets)
  FR: { country: 'FR', language: 'fr', currency: 'EUR', locale: 'fr', domain: 'emmanuela.jewelry', path: '/fr-fr', priority: 1, name: 'France' },
  IT: { country: 'IT', language: 'it', currency: 'EUR', locale: 'it', domain: 'emmanuela.jewelry', path: '/it-it', priority: 1, name: 'Italy' },
  ES: { country: 'ES', language: 'es', currency: 'EUR', locale: 'es', domain: 'emmanuela.jewelry', path: '/es-es', priority: 1, name: 'Spain' },
  US: { country: 'US', language: 'en', currency: 'USD', locale: 'en', domain: 'emmanuela.jewelry', path: '/en-us', priority: 1, name: 'USA' },
  CA: { country: 'CA', language: 'en', currency: 'CAD', locale: 'en', domain: 'emmanuela.jewelry', path: '/en-ca', priority: 1, name: 'Canada' },
  AU: { country: 'AU', language: 'en', currency: 'AUD', locale: 'en', domain: 'emmanuela.jewelry', path: '/en-au', priority: 1, name: 'Australia' },
  NL: { country: 'NL', language: 'nl', currency: 'EUR', locale: 'nl', domain: 'emmanuela.jewelry', path: '/nl-nl', priority: 1, name: 'Netherlands' },

  // PRIORITY 2 — EU Markets
  BE: { country: 'BE', language: 'nl', currency: 'EUR', locale: 'nl', domain: 'emmanuela.jewelry', path: '/nl-be', priority: 2, name: 'Belgium' },
  AT: { country: 'AT', language: 'de', currency: 'EUR', locale: 'de', domain: 'emmanuela.jewelry', path: '/de-at', priority: 2, name: 'Austria' },
  CH: { country: 'CH', language: 'de', currency: 'CHF', locale: 'de', domain: 'emmanuela.jewelry', path: '/de-ch', priority: 2, name: 'Switzerland' },
  IE: { country: 'IE', language: 'en', currency: 'EUR', locale: 'en', domain: 'emmanuela.jewelry', path: '/en-ie', priority: 2, name: 'Ireland' },
  SE: { country: 'SE', language: 'sv', currency: 'SEK', locale: 'sv', domain: 'emmanuela.jewelry', path: '/sv-se', priority: 2, name: 'Sweden' },
  DK: { country: 'DK', language: 'da', currency: 'DKK', locale: 'da', domain: 'emmanuela.jewelry', path: '/da-dk', priority: 2, name: 'Denmark' },
  NO: { country: 'NO', language: 'no', currency: 'NOK', locale: 'nb', domain: 'emmanuela.jewelry', path: '/no-no', priority: 2, name: 'Norway' },
  PL: { country: 'PL', language: 'pl', currency: 'PLN', locale: 'pl', domain: 'emmanuela.jewelry', path: '/pl-pl', priority: 2, name: 'Poland' },
  PT: { country: 'PT', language: 'pt', currency: 'EUR', locale: 'pt-PT', domain: 'emmanuela.jewelry', path: '/pt-pt', priority: 2, name: 'Portugal' },
  FI: { country: 'FI', language: 'fi', currency: 'EUR', locale: 'fi', domain: 'emmanuela.jewelry', path: '/fi-fi', priority: 2, name: 'Finland' },
  CZ: { country: 'CZ', language: 'cs', currency: 'CZK', locale: 'cs', domain: 'emmanuela.jewelry', path: '/cs-cz', priority: 2, name: 'Czech Republic' },
  RO: { country: 'RO', language: 'ro', currency: 'RON', locale: 'ro', domain: 'emmanuela.jewelry', path: '/ro-ro', priority: 2, name: 'Romania' },
  HU: { country: 'HU', language: 'hu', currency: 'HUF', locale: 'hu', domain: 'emmanuela.jewelry', path: '/hu-hu', priority: 2, name: 'Hungary' },

  // PRIORITY 3 — International
  JP: { country: 'JP', language: 'ja', currency: 'JPY', locale: 'ja', domain: 'emmanuela.jewelry', path: '/ja-jp', priority: 3, name: 'Japan' },
  // KR: REMOVED — South Korea requires local business registration (사업자등록번호)
  SG: { country: 'SG', language: 'en', currency: 'SGD', locale: 'en', domain: 'emmanuela.jewelry', path: '/en-sg', priority: 3, name: 'Singapore' },
  AE: { country: 'AE', language: 'en', currency: 'AED', locale: 'en', domain: 'emmanuela.jewelry', path: '/en-ae', priority: 3, name: 'UAE' },
  IL: { country: 'IL', language: 'he', currency: 'ILS', locale: 'he', domain: 'emmanuela.jewelry', path: '/he-il', priority: 3, name: 'Israel' },
  MX: { country: 'MX', language: 'es', currency: 'MXN', locale: 'es', domain: 'emmanuela.jewelry', path: '/es-mx', priority: 3, name: 'Mexico' },
  SK: { country: 'SK', language: 'cs', currency: 'EUR', locale: 'cs', domain: 'emmanuela.jewelry', path: '/cs-sk', priority: 3, name: 'Slovakia' },
  SI: { country: 'SI', language: 'en', currency: 'EUR', locale: 'en', domain: 'emmanuela.jewelry', path: '', priority: 3, name: 'Slovenia' },              // TODO: update when SI market created → /en-si
  EE: { country: 'EE', language: 'en', currency: 'EUR', locale: 'en', domain: 'emmanuela.jewelry', path: '', priority: 3, name: 'Estonia' },               // TODO: update when EE market created → /en-ee
  LV: { country: 'LV', language: 'en', currency: 'EUR', locale: 'en', domain: 'emmanuela.jewelry', path: '', priority: 3, name: 'Latvia' },                // TODO: update when LV market created → /en-lv
  LT: { country: 'LT', language: 'en', currency: 'EUR', locale: 'en', domain: 'emmanuela.jewelry', path: '', priority: 3, name: 'Lithuania' },             // TODO: update when LT market created → /en-lt
  // BG (Bulgaria) REMOVED in v11.1 — GMC does not support as target country
  HR: { country: 'HR', language: 'en', currency: 'EUR', locale: 'en', domain: 'emmanuela.jewelry', path: '', priority: 3, name: 'Croatia' },               // TODO: update when HR market created → /en-hr
  MY: { country: 'MY', language: 'ms', currency: 'MYR', locale: 'ms', domain: 'emmanuela.jewelry', path: '/ms-my', priority: 3, name: 'Malaysia' },
  ID: { country: 'ID', language: 'id', currency: 'IDR', locale: 'id', domain: 'emmanuela.jewelry', path: '/id-id', priority: 3, name: 'Indonesia' },
  TW: { country: 'TW', language: 'en', currency: 'TWD', locale: 'en', domain: 'emmanuela.jewelry', path: '/en-tw', priority: 3, name: 'Taiwan' },
  // IS (Iceland) REMOVED in v11.1 — microstate, Google does not support as GMC target country
  SA: { country: 'SA', language: 'en', currency: 'SAR', locale: 'en', domain: 'emmanuela.jewelry', path: '/en-sa', priority: 3, name: 'Saudi Arabia' },
  NZ: { country: 'NZ', language: 'en', currency: 'NZD', locale: 'en', domain: 'emmanuela.jewelry', path: '/en-nz', priority: 3, name: 'New Zealand' },
  HK: { country: 'HK', language: 'en', currency: 'HKD', locale: 'en', domain: 'emmanuela.jewelry', path: '/en-hk', priority: 3, name: 'Hong Kong' },
  TH: { country: 'TH', language: 'en', currency: 'THB', locale: 'en', domain: 'emmanuela.jewelry', path: '/en-th', priority: 3, name: 'Thailand' },
  // v11.1: Puerto Rico → US market with Spanish (no separate PR market in Shopify)
  PR: { country: 'US', language: 'es', currency: 'USD', locale: 'es', domain: 'emmanuela.jewelry', path: '/es-us', priority: 3, name: 'Puerto Rico', feedSuffix: 'pr' },

  // v11 NEW: Multi-language country feeds (same country, different language)
  CH_FR: { country: 'CH', language: 'fr', currency: 'CHF', locale: 'fr', domain: 'emmanuela.jewelry', path: '/fr-ch', priority: 2, name: 'Switzerland (French)', feedSuffix: 'ch-fr' },
  CH_IT: { country: 'CH', language: 'it', currency: 'CHF', locale: 'it', domain: 'emmanuela.jewelry', path: '/it-ch', priority: 2, name: 'Switzerland (Italian)', feedSuffix: 'ch-it' },
  BE_FR: { country: 'BE', language: 'fr', currency: 'EUR', locale: 'fr', domain: 'emmanuela.jewelry', path: '/fr-be', priority: 2, name: 'Belgium (French)', feedSuffix: 'be-fr' },
  CA_FR: { country: 'CA', language: 'fr', currency: 'CAD', locale: 'fr', domain: 'emmanuela.jewelry', path: '/fr-ca', priority: 1, name: 'Canada (French)', feedSuffix: 'ca-fr' },

  // REMOVED in v11.0 (microstates — Google does not support as GMC target countries):
  // CY (Cyprus), MT (Malta), LU (Luxembourg), MC (Monaco), LI (Liechtenstein),
  // AD (Andorra), SM (San Marino), VA (Vatican City)
};


// ============================================
// v7 NEW: SHIPPING TIME CONFIGURATION
// ============================================

// Handling time (same for all countries) - 1 business day always
const HANDLING_TIME = { min: 1, max: 1 };

// Transit times by region (in business days)
// Source: shipping pages (total delivery = handling 1 day + transit)
// GR page: 2-4 days total → transit 1-3
// DE page: 2-4 days total → transit 1-3
// EU page: 3-5 days total → transit 2-4
// GB page: 3-6 days total → transit 2-5
// US page: 3-7 days total → transit 2-6
// Other page: 3-8 days total → transit 2-7
const TRANSIT_TIMES = {
  GR: { min: 1, max: 3 },      // Greece - domestic (page: 2-4 total)
  DE: { min: 1, max: 3 },      // Germany - fast EU (page: 2-4 total)
  EU: { min: 2, max: 4 },      // Rest of EU (page: 3-5 total)
  GB: { min: 2, max: 5 },      // UK (page: 3-6 total)
  CH: { min: 2, max: 4 },      // Switzerland (EU-like)
  NO: { min: 2, max: 4 },      // Norway (EU-like)
  // IS removed (microstate)
  US: { min: 2, max: 6 },      // USA (page: 3-7 total)
  CA: { min: 2, max: 4 },      // Canada (EU-like)
  AU: { min: 2, max: 7 },      // Australia (page: 3-8 "other")
  NZ: { min: 2, max: 7 },      // New Zealand (page: 3-8 "other")
  MX: { min: 2, max: 7 },      // Mexico (page: 3-8 "other")
  AE: { min: 2, max: 7 },      // UAE (page: 3-8 "other")
  IL: { min: 2, max: 7 },      // Israel (page: 3-8 "other")
  SA: { min: 2, max: 7 },      // Saudi Arabia (page: 3-8 "other")
  ASIA: { min: 2, max: 7 },    // Japan, Korea, Singapore, etc. (page: 3-8 "other")
};

// Map country codes to transit time groups
// v11.0: Removed microstates (CY, MT, LU, MC, LI, AD, SM, VA)
const TRANSIT_GROUP = {
  // Specific countries with their own times
  GR: 'GR', DE: 'DE', GB: 'GB', CH: 'CH', NO: 'NO',
  US: 'US', CA: 'CA', AU: 'AU', NZ: 'NZ', MX: 'MX', AE: 'AE', IL: 'IL',
  SA: 'SA',
  // EU countries → EU group
  AT: 'EU', BE: 'EU', HR: 'EU', CZ: 'EU', DK: 'EU',
  EE: 'EU', FI: 'EU', FR: 'EU', HU: 'EU', IE: 'EU', IT: 'EU', LV: 'EU',
  LT: 'EU', NL: 'EU', PL: 'EU', PT: 'EU', RO: 'EU',
  SK: 'EU', SI: 'EU', ES: 'EU', SE: 'EU',
  // Asia countries → ASIA group
  JP: 'ASIA', KR: 'ASIA', SG: 'ASIA', TW: 'ASIA', TH: 'ASIA',
  MY: 'ASIA', HK: 'ASIA', ID: 'ASIA',
  // Puerto Rico → US group
  PR: 'US',
};


// ============================================
// v8 NEW: RETURN POLICY LABELS
// ============================================
// Maps country codes to GMC return_policy_label values.
// - "default" = EU free returns (seller pays) — used by EU countries + GR/DE/GB sub-account defaults
// - "international_returns" = customer pays return shipping, 30 days
// (Previously: "us_no_returns" = no returns. Changed Session 7: US now accepts returns like other non-EU.)
//
// GR/DE/GB each have their own sub-account where "default" maps to
// the correct policy for that country. Only the Jewelry sub-account
// (47 countries) needs custom labels for non-EU countries.

const RETURN_POLICY_LABELS = {
  // US + Puerto Rico: customer pays return shipping, 30 days (same as other non-EU)
  US: 'international_returns',
  PR: 'international_returns',
  // International: customer pays return shipping
  // v11.0: Removed LI (microstate removed from MARKETS)
  CH: 'international_returns',
  NO: 'international_returns',
  // IS removed (microstate)
  GB: 'international_returns',   // UK sub-account: "default" is also correct, but explicit for clarity
  AU: 'international_returns',
  NZ: 'international_returns',
  JP: 'international_returns',
  SG: 'international_returns',
  AE: 'international_returns',
  IL: 'international_returns',
  SA: 'international_returns',
  MX: 'international_returns',
  HK: 'international_returns',
  TW: 'international_returns',
  TH: 'international_returns',
  MY: 'international_returns',
  ID: 'international_returns',
  // All others (EU + GR + DE): "default" (free returns, seller pays)
};


// ============================================
// v8 NEW: SHIPPING SERVICE NAMES
// ============================================
// Maps country codes to shipping service names for <g:service>.
// Google requires a descriptive name matching what the customer sees.

const SHIPPING_SERVICE_MAP = {
  GR: 'ACS Courier',
  US: 'DHL DDP Express',
  PR: 'DHL DDP Express',
  // All others default to DHL Express
};

const DEFAULT_SHIPPING_SERVICE = 'DHL Express';


// ============================================
// v9/v11 HUB-AND-SPOKE CONFIGURATION
// ============================================
// Countries that cannot be registered as GMC target countries have their
// <g:shipping> entries added to a geographically-close "hub" feed.
// All hubs use emmanuela.jewelry domain (NEVER GR/DE/GB).
// v11.0: Removed microstate spokes (CY, MT, VA, SM, LU, MC, AD, LI).
// Remaining spokes: HR, SI (IT hub), EE, LV, LT (FI hub).
// BG removed in v11.1 — GMC does not support as target country

const HUB_SPOKES = {
  IT: ['HR', 'SI'],          // EUR — South/Southeast Europe
  FI: ['EE', 'LV', 'LT'],  // EUR — Baltic states
};

// Pre-computed set of all spoke countries (for fast O(1) lookup)
const SPOKE_COUNTRIES = new Set(Object.values(HUB_SPOKES).flat());
// => Set(5) { 'HR', 'SI', 'EE', 'LV', 'LT' }


// ============================================
// HELPER FUNCTIONS
// ============================================

function stripHtml(html) {
  if (!html) return '';
  return html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{2B55}\u{200D}\u{FE0F}\u{20E3}\u{E0020}-\u{E007F}]/gu, '')
    .replace(/\s+/g, ' ').trim().substring(0, 5000);
}

function escapeXml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

/**
 * Smart truncate: cuts at word boundary, never mid-word/mid-letter
 * Google allows 150 chars for title — we truncate cleanly
 */
function smartTruncate(str, maxLen = 150) {
  if (!str || str.length <= maxLen) return str;
  const truncated = str.substring(0, maxLen);
  const lastSpace = truncated.lastIndexOf(' ');
  const lastSlash = truncated.lastIndexOf(' / ');
  // Prefer cutting at " / " separator (option boundary) over mid-option
  const cutPoint = lastSlash > maxLen * 0.6 ? lastSlash : (lastSpace > 0 ? lastSpace : maxLen);
  return truncated.substring(0, cutPoint);
}

function buildProductUrl(handle, variantId, market) {
  return `https://${market.domain}${market.path}/products/${handle}?country=${market.country}&variant=${variantId}`;
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

// v8.2: Detect ANY product with a size option (not just rings)
function hasProductSize(selectedOptions) {
  if (!selectedOptions) return false;
  for (const opt of selectedOptions) {
    const name = (opt.name || '').toLowerCase();
    if (name.includes('size') || name.includes('μέγεθος') || name.includes('νούμερο') || name.includes('νούμερα')) {
      return true;
    }
  }
  return false;
}

function getSize(selectedOptions) {
  if (!selectedOptions) return null;
  for (const opt of selectedOptions) {
    const name = (opt.name || '').toLowerCase();
    if (name.includes('size') || name.includes('μέγεθος') || name.includes('νούμερο') || name.includes('νούμερα')) {
      return opt.value;
    }
  }
  return null;
}

function httpsRequest(options, postData = null) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        try {
          const data = Buffer.concat(chunks).toString('utf8');
          resolve({ data: JSON.parse(data), statusCode: res.statusCode, headers: res.headers });
        } catch (e) { reject(new Error(`Parse error: ${e.message}`)); }
      });
    });
    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

async function graphqlRequest(query, maxRetries = 4) {
  const options = {
    hostname: SHOPIFY_STORE,
    path: `/admin/api/${API_VERSION}/graphql.json`,
    method: 'POST',
    headers: { 'X-Shopify-Access-Token': ACCESS_TOKEN, 'Content-Type': 'application/json' }
  };
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const result = await httpsRequest(options, JSON.stringify({ query }));
    // Check for Shopify throttling (THROTTLED error or 429 status)
    const isThrottled = result.statusCode === 429 ||
      (result.data?.errors && result.data.errors[0]?.extensions?.code === 'THROTTLED');
    if (isThrottled && attempt < maxRetries) {
      const wait = Math.min(2000 * Math.pow(2, attempt), 15000); // 2s, 4s, 8s, 15s
      process.stdout.write(` [throttled, retry in ${wait/1000}s]`);
      await new Promise(r => setTimeout(r, wait));
      continue;
    }
    return result;
  }
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
    
    // v8: Puerto Rico fallback — PR is a US territory, shares US shipping rate
    // Shopify may not list PR as a separate country in shipping zones
    if (!countryRates['PR'] && countryRates['US']) {
      countryRates['PR'] = { ...countryRates['US'] };
      console.log(`   📌 PR (Puerto Rico): inherited US shipping rate (${countryRates['US'].price} ${countryRates['US'].currency})`);
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
 * v8.0: Format shipping tag for Google Shopping with service name + handling/transit times
 * @param {string} countryCode - 2-letter country code
 * @param {object} shippingRates - Rates from fetchShippingRates()
 * @returns {string} XML shipping tag or empty string
 */
function formatShippingTag(countryCode, shippingRates) {
  if (!shippingRates || !shippingRates[countryCode]) {
    return '';  // No shipping data available
  }

  const rate = shippingRates[countryCode];
  // v9: Use MARKETS currency (authoritative) instead of Shopify API currency
  // Fixes BG showing BGN instead of EUR (Shopify API hasn't updated post-Euro adoption)
  const currency = (MARKETS[countryCode] && MARKETS[countryCode].currency) || rate.currency;
  const priceStr = rate.price === 0 ? `0.00 ${currency}` : `${rate.price.toFixed(2)} ${currency}`;

  // v8: Get shipping service name for this country
  const serviceName = SHIPPING_SERVICE_MAP[countryCode] || DEFAULT_SHIPPING_SERVICE;

  // Get transit times for this country
  const group = TRANSIT_GROUP[countryCode] || 'EU';
  const transit = TRANSIT_TIMES[group] || TRANSIT_TIMES.EU;

  return `
      <g:shipping>
        <g:country>${countryCode}</g:country>
        <g:service>${serviceName}</g:service>
        <g:price>${priceStr}</g:price>
        <g:min_handling_time>${HANDLING_TIME.min}</g:min_handling_time>
        <g:max_handling_time>${HANDLING_TIME.max}</g:max_handling_time>
        <g:min_transit_time>${transit.min}</g:min_transit_time>
        <g:max_transit_time>${transit.max}</g:max_transit_time>
      </g:shipping>`;
}

/**
 * v8.0: Format item-level shipping attributes (NOT inside shipping tag)
 * - ships_from_country: always GR
 * - return_policy_label: per-country (default / international_returns / us_no_returns)
 * @param {string} countryCode - 2-letter country code
 * @returns {string} XML item-level shipping attributes
 */
function formatShippingTimeAttributes(countryCode) {
  // v8: Per-country return policy label
  const returnLabel = RETURN_POLICY_LABELS[countryCode] || 'default';

  return `
      <g:ships_from_country>GR</g:ships_from_country>
      <g:return_policy_label>${returnLabel}</g:return_policy_label>
      <g:shipping_handling_business_days>Mon,Tue,Wed,Thu,Fri</g:shipping_handling_business_days>
      <g:shipping_transit_business_days>Mon,Tue,Wed,Thu,Fri</g:shipping_transit_business_days>`;
}


// ============================================
// COLOR & MATERIAL EXTRACTION
// ============================================

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

function getGender(productType, title) {
  const type = (productType || '').toLowerCase();
  const t = (title || '').toLowerCase();
  if (type.includes('ανδρικ') || t.includes('ανδρικ') || type.includes('men')) return 'male';
  if (type.includes('γυναικ') || t.includes('γυναικ') || type.includes('women')) return 'female';
  return 'unisex';
}

function translateMaterial(materialStr, language) {
  const langMap = MATERIAL_TRANSLATIONS[language] || MATERIAL_TRANSLATIONS['en'];
  const defaultMat = langMap['sterling-silver'] || 'Sterling Silver';
  if (!materialStr) return defaultMat;
  const materials = materialStr.split(';').map(m => m.trim().toLowerCase());
  const translated = [];
  for (const mat of materials) {
    if (langMap[mat] && !translated.includes(langMap[mat])) {
      translated.push(langMap[mat]);
    }
  }
  return translated.length > 0 ? translated.join('/') : defaultMat;
}


// ============================================
// FETCH PRODUCTS (GraphQL with weight)
// ============================================

async function fetchProductsWithOptions() {
  console.log('📦 Fetching products with options + metafields + weight + video...\n');
  
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
            media(first: 20) {
              edges {
                node {
                  mediaContentType
                  ... on MediaImage {
                    id
                    image { url }
                  }
                  ... on Video {
                    id
                    sources { url mimeType }
                  }
                }
              }
            }
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
        // v7.5: Separate media into images and videos
        const mediaEdges = node.media?.edges || [];
        const images = [];
        const videos = [];
        for (const edge of mediaEdges) {
          const m = edge.node;
          if (m.mediaContentType === 'IMAGE' && m.image?.url) {
            images.push({
              id: m.id.replace('gid://shopify/MediaImage/', ''),
              src: m.image.url
            });
          } else if (m.mediaContentType === 'VIDEO' && m.sources?.length > 0) {
            // Prefer mp4 source, fallback to first available
            const mp4Source = m.sources.find(s => s.mimeType === 'video/mp4');
            const bestSource = mp4Source || m.sources[0];
            if (bestSource?.url) {
              videos.push({
                id: m.id.replace('gid://shopify/Video/', ''),
                src: bestSource.url,
                mimeType: bestSource.mimeType
              });
            }
          }
        }

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
          images: images,
          videos: videos,
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
      await new Promise(r => setTimeout(r, 400));
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
      await new Promise(r => setTimeout(r, 400));
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
// v10.0: CONTEXTUAL PRICING (Market-Adjusted Prices)
// ============================================

/**
 * Fetches contextual pricing for a reference variant across ALL markets in ONE API call.
 *
 * Why: The store has taxesIncluded=true, so catalog prices include Greek 24% VAT.
 * Shopify Markets auto-recalculates VAT per destination country on landing pages.
 * The Admin API variant.price always returns the catalog price (Greek VAT included),
 * causing a systematic price mismatch in feeds for all non-GR countries.
 *
 * How: contextualPricing returns the exact price a customer sees on the landing page
 * for a given country. Since there are no price lists (priceList=null), the adjustment
 * is a constant multiplicative factor for all products in a market:
 *   factor = contextualPrice / catalogPrice
 * This factor captures both VAT adjustment and currency conversion.
 *
 * @param {Array} products - Products from fetchProductsWithOptions()
 * @returns {Object|null} { 'DE': { factor, currency }, 'GB': { factor, currency }, ... }
 */
async function fetchPriceAdjustments(products) {
  console.log('💰 Fetching contextual pricing for market-adjusted prices (v10)...\n');

  // Find a reference variant: first in-stock variant with price > 0
  let refVariant = null;
  let refProduct = null;
  for (const p of products) {
    for (const v of p.variants) {
      if (v.inventory_quantity > 0 && parseFloat(v.price) > 0) {
        refVariant = v;
        refProduct = p;
        break;
      }
    }
    if (refVariant) break;
  }

  if (!refVariant) {
    console.error('❌ No in-stock variant found for price adjustment reference');
    return null;
  }

  const refPrice = parseFloat(refVariant.price);
  console.log(`   📌 Reference variant: ${refVariant.id} ("${refProduct.title}")`);
  console.log(`   📌 Catalog price: ${refPrice.toFixed(2)} EUR (includes Greek 24% VAT)\n`);

  // Build GraphQL query with aliases for all market countries (one API call)
  // Note: PR is a US territory, not a valid CountryCode in Shopify GraphQL.
  // Multi-language market keys (CH_FR, CH_IT, BE_FR, CA_FR) share pricing with their country.
  const PRICING_EXCLUDED = new Set(['PR', 'CH_FR', 'CH_IT', 'BE_FR', 'CA_FR']);
  const countries = Object.keys(MARKETS);
  const queryCountries = countries.filter(cc => !PRICING_EXCLUDED.has(cc));
  const aliases = queryCountries.map(cc =>
    `price${cc}: contextualPricing(context: { country: ${cc} }) {\n` +
    `        price { amount currencyCode }\n` +
    `        compareAtPrice { amount currencyCode }\n` +
    `      }`
  ).join('\n      ');

  const query = `{
    node(id: "gid://shopify/ProductVariant/${refVariant.id}") {
      ... on ProductVariant {
        ${aliases}
      }
    }
  }`;

  try {
    const { data } = await graphqlRequest(query);

    if (data.errors) {
      console.error('⚠️ Contextual pricing API errors:', JSON.stringify(data.errors, null, 2));
      return null;
    }

    const variantData = data.data?.node;
    if (!variantData) {
      console.error('❌ No variant data returned from contextual pricing query');
      return null;
    }

    const adjustments = {};
    let adjustedCount = 0;
    let unchangedCount = 0;

    for (const cc of queryCountries) {
      const ctxPricing = variantData[`price${cc}`];

      if (ctxPricing?.price) {
        const ctxPrice = parseFloat(ctxPricing.price.amount);
        const currency = ctxPricing.price.currencyCode;
        const factor = ctxPrice / refPrice;

        adjustments[cc] = { factor, currency };

        if (Math.abs(factor - 1.0) > 0.001 || currency !== 'EUR') {
          console.log(`   ${cc}: ${refPrice.toFixed(2)} EUR → ${ctxPrice.toFixed(2)} ${currency} (×${factor.toFixed(6)})`);
          adjustedCount++;
        } else {
          unchangedCount++;
        }
      } else {
        // Fallback: no contextual pricing — use catalog price as-is
        adjustments[cc] = { factor: 1.0, currency: MARKETS[cc].currency };
        console.log(`   ⚠️ ${cc}: No contextual pricing returned — using catalog price`);
      }
    }

    // Copy pricing for excluded territories/multi-language variants from their parent countries
    if (adjustments.US) {
      adjustments.PR = { ...adjustments.US };
      console.log(`   PR: inherited US pricing (×${adjustments.US.factor.toFixed(6)} ${adjustments.US.currency})`);
    }
    // v11: Multi-language country feeds inherit pricing from primary country feed
    if (adjustments.CH) {
      adjustments.CH_FR = { ...adjustments.CH };
      adjustments.CH_IT = { ...adjustments.CH };
      console.log(`   CH_FR/CH_IT: inherited CH pricing (×${adjustments.CH.factor.toFixed(6)} ${adjustments.CH.currency})`);
    }
    if (adjustments.BE) {
      adjustments.BE_FR = { ...adjustments.BE };
      console.log(`   BE_FR: inherited BE pricing (×${adjustments.BE.factor.toFixed(6)} ${adjustments.BE.currency})`);
    }
    if (adjustments.CA) {
      adjustments.CA_FR = { ...adjustments.CA };
      console.log(`   CA_FR: inherited CA pricing (×${adjustments.CA.factor.toFixed(6)} ${adjustments.CA.currency})`);
    }

    console.log(`\n   ✅ Price adjustments: ${adjustedCount} adjusted, ${unchangedCount} unchanged`);
    if (adjustments.GR) {
      console.log(`   ✅ GR factor: ${adjustments.GR.factor.toFixed(6)} (expected ≈1.000000)`);
    }
    console.log('');

    return adjustments;

  } catch (error) {
    console.error(`⚠️ Error fetching contextual pricing: ${error.message}`);
    console.error('   ⚠️ Falling back to catalog prices (PRICES MAY NOT MATCH LANDING PAGES)\n');
    return null;
  }
}


// ============================================
// XML FEED GENERATION (v6 with dynamic shipping)
// ============================================

function generateFeedForMarket(products, translations, market, shippingRates, priceAdj) {
  // v10: Price adjustment factor and currency from contextualPricing
  const priceFactor = priceAdj ? priceAdj.factor : 1.0;
  const priceCurrency = priceAdj ? priceAdj.currency : market.currency;

  console.log(`🔧 Generating XML feed for ${market.name} (${market.country})...`);
  if (Math.abs(priceFactor - 1.0) > 0.001 || priceCurrency !== 'EUR') {
    console.log(`   💰 Price: ×${priceFactor.toFixed(6)} → ${priceCurrency}`);
  }
  console.log('');
  
  let items = [];
  let stats = {
    inStock: 0, outOfStock: 0, noImage: 0, translatedVariants: 0,
    totalVariants: 0, withGender: 0, withColor: 0, withMaterial: 0,
    withWeight: 0, withSize: 0, withShipping: 0, withVideo: 0,
    productsWithVideo: 0, categoryBreakdown: {}
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

    // v11.2: Pre-compute image ranges per variant for color-correct additional images
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

    const prodTrans = translations.products[product.id] || {};
    // v7.9: Fallback chain — target locale → English → Greek (original)
    const enFallback = translations.englishFallback?.products[product.id] || {};
    const translatedTitle = prodTrans.title || enFallback.title || product.title;
    const translatedDesc = stripHtml(prodTrans.body_html || enFallback.body_html || product.body_html);
    const gender = getGender(product.product_type, product.title);
    const material = translateMaterial(product.metafields?.material, market.language);
    const googleCategory = getGoogleCategory(product.product_type);
    stats.categoryBreakdown[googleCategory] = (stats.categoryBreakdown[googleCategory] || 0) + 1;
    const productIsRing = isRing(product.product_type);
    const productHasSize = true; // v8.2: size extraction for ALL products, not just rings
    
    if (gender !== 'unisex') stats.withGender++;
    if (product.metafields?.material) stats.withMaterial++;
    if (product.videos && product.videos.length > 0) stats.productsWithVideo++;
    
    variants.forEach(variant => {
      if (variant.inventory_quantity <= 0) { stats.outOfStock++; return; }
      
      stats.inStock++;
      stats.totalVariants++;
      
      let variantSuffix = '';
      let variantColorOriginal = '';
      let ringSize = null;
      
      if (variant.title && variant.title !== 'Default Title') {
        const translatedOptions = (variant.selectedOptions || []).map(opt => {
          if (opt.name === 'Χρώμα' || opt.name === 'Χρώμα μετάλλου' || opt.name.toLowerCase() === 'color') {
            variantColorOriginal = opt.value;
          }
          // v7.9: option value fallback — target locale → English → Greek original
          const enOptFallback = translations.englishFallback?.optionValues || {};
          return translations.optionValues[opt.value] || enOptFallback[opt.value] || opt.value;
        });
        variantSuffix = translatedOptions.join(' / ');
        if (translatedOptions.some((t, i) => t !== variant.selectedOptions[i]?.value)) {
          stats.translatedVariants++;
        }
        // v8.2: Extract size for ALL products with size options (not just rings)
        ringSize = getSize(variant.selectedOptions);
        if (ringSize) stats.withSize++;
      }
      
      const fullTitle = variantSuffix ? `${translatedTitle} - ${variantSuffix}` : translatedTitle;
      // Color: use translated value if available, otherwise normalize Greek original
      // Fallback chain: translated option → normalized variant → normalized metafield → default
      // v7.9: color fallback — target locale → English → normalize Greek
      const enOptFallbackForColor = translations.englishFallback?.optionValues || {};
      const translatedColor = translations.optionValues[variantColorOriginal] || enOptFallbackForColor[variantColorOriginal] || null;
      const colorNormalized = translatedColor
        || normalizeColor(variantColorOriginal)
        || normalizeColor(product.metafields?.color)
        || 'Silver';
      if (colorNormalized) stats.withColor++;
      if (variant.weight) stats.withWeight++;
      
      // v11.2: Color-correct images — use variant boundary heuristic
      let variantImage;
      let variantAdditionalImages;

      if (variant.image_id && imageRangeByVariantImageId[variant.image_id]) {
        const range = imageRangeByVariantImageId[variant.image_id];
        variantImage = range[0]?.src || mainImage;
        variantAdditionalImages = range
          .map(img => img.src)
          .filter(src => src !== variantImage)
          .slice(0, 9);
      } else {
        variantImage = mainImage;
        variantAdditionalImages = [];
      }

      const translatedHandle = prodTrans.handle || enFallback.handle || product.handle;
      const productUrl = buildProductUrl(translatedHandle, variant.id, market);
      // v10: Apply market-specific price adjustment (VAT + currency conversion)
      const adjustedVariantPrice = Math.round(parseFloat(variant.price) * priceFactor * 100) / 100;
      const price = formatPrice(adjustedVariantPrice, priceCurrency);

      // Build XML item
      let item = `    <item>
      <g:id>${variant.id}</g:id>
      <g:item_group_id>${product.id}</g:item_group_id>
      <g:title><![CDATA[${smartTruncate(fullTitle)}]]></g:title>
      <g:description><![CDATA[${translatedDesc.substring(0, 5000)}]]></g:description>
      <g:link>${escapeXml(productUrl)}</g:link>
      <g:image_link>${variantImage}</g:image_link>`;

      variantAdditionalImages.forEach(img => { item += `\n      <g:additional_image_link>${img}</g:additional_image_link>`; });

      // v7.5: Add video links (up to 10, direct-hosted only — no YouTube)
      if (product.videos && product.videos.length > 0) {
        product.videos.slice(0, 10).forEach(video => {
          item += `\n      <g:video_link>${escapeXml(video.src)}</g:video_link>`;
        });
        stats.withVideo++;
      }

      item += `
      <g:price>${price}</g:price>
      <g:availability>in_stock</g:availability>
      <g:brand><![CDATA[${BRAND}]]></g:brand>
      <g:condition>new</g:condition>`;

      // MPN / identifier_exists logic:
      // If SKU exists → send as MPN, identifier_exists defaults to true (omit tag)
      // If no SKU → identifier_exists=false (handmade, no standard identifier)
      if (variant.sku) {
        item += `\n      <g:mpn><![CDATA[${variant.sku}]]></g:mpn>`;
      } else {
        item += `\n      <g:identifier_exists>false</g:identifier_exists>`;
      }

      item += `\n      <g:google_product_category>${googleCategory}</g:google_product_category>`;
      item += `\n      <g:product_type><![CDATA[${translateProductType(product.product_type, market.language)}]]></g:product_type>`;
      item += `\n      <g:age_group>adult</g:age_group>`;
      item += `\n      <g:gender>${gender}</g:gender>`;

      if (colorNormalized) item += `\n      <g:color><![CDATA[${colorNormalized}]]></g:color>`;
      if (material) item += `\n      <g:material><![CDATA[${material}]]></g:material>`;

      const weightFormatted = formatWeight(variant.weight);
      if (weightFormatted) item += `\n      <g:shipping_weight>${weightFormatted}</g:shipping_weight>`;
      if (ringSize) item += `\n      <g:size><![CDATA[${ringSize}]]></g:size>`;

      // Sale price handling (v10: both prices adjusted with same market factor)
      if (variant.compare_at_price && parseFloat(variant.compare_at_price) > parseFloat(variant.price)) {
        item += `\n      <g:sale_price>${price}</g:sale_price>`;
        const adjustedCompareAt = Math.round(parseFloat(variant.compare_at_price) * priceFactor * 100) / 100;
        item += `\n      <g:price>${formatPrice(adjustedCompareAt, priceCurrency)}</g:price>`;
      }

      // v6 NEW: Add shipping tag
      if (hasShipping) {
        item += formatShippingTag(market.country, shippingRates);
        stats.withShipping++;
      }

      // v9 NEW: Hub-and-spoke — add shipping blocks for spoke countries
      const spokeCountries = HUB_SPOKES[market.country];
      if (spokeCountries) {
        for (const spokeCC of spokeCountries) {
          item += formatShippingTag(spokeCC, shippingRates);
        }
      }

      // v7 NEW: Add shipping time attributes
      item += formatShippingTimeAttributes(market.country);

      // v7.6+v8.1: Exclude GR and PR from feeds that don't target them (prevent MCA auto-expansion)
      if (market.country !== 'GR') {
        item += `\n      <g:shopping_ads_excluded_country>GR</g:shopping_ads_excluded_country>`;
      }
      if (market.country !== 'PR') {
        item += `\n      <g:shopping_ads_excluded_country>PR</g:shopping_ads_excluded_country>`;
      }

      item += `\n    </item>`;
      items.push(item);
    });
  });

  // Print stats
  console.log(`\n   📊 Stats for ${market.country}:`);
  console.log(`      In-stock items: ${stats.inStock}`);
  console.log(`      With shipping: ${stats.withShipping} items`);
  console.log(`      With video: ${stats.withVideo} items (${stats.productsWithVideo} products)`);
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

  // v9: Warn if this is a spoke country
  if (SPOKE_COUNTRIES.has(market.country)) {
    const hubCode = Object.entries(HUB_SPOKES).find(([_, spokes]) => spokes.includes(market.country))?.[0];
    console.log(`\n⚠️  ${market.name} (${market.country}) is a spoke country — shipping is included in ${hubCode} hub feed.`);
    console.log(`   Generating standalone feed for debugging only (not used in production).\n`);
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

  // v10: Fetch contextual pricing for market-adjusted prices
  const priceAdjustments = await fetchPriceAdjustments(products);
  const priceAdj = priceAdjustments ? priceAdjustments[marketCode.toUpperCase()] : null;

  // Fetch translations
  let translations = { products: {}, optionValues: {} };
  if (market.locale !== 'el') {
    translations = await fetchAllTranslations(products, market.locale);
  } else {
    console.log('ℹ️ Greek locale - skipping translations\n');
  }

  // v6+v10: Generate XML with shipping and market-adjusted prices
  const { xml, stats } = generateFeedForMarket(products, translations, market, shippingRates, priceAdj);

  // Ensure output directory exists
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // Write files
  // v11: Use feedSuffix for multi-language country feeds (e.g., ch-fr, be-fr)
  const feedKey = market.feedSuffix || market.country.toLowerCase();
  const filename = `emmanuela-${feedKey}.xml`;
  const filepath = path.join(OUTPUT_DIR, filename);
  fs.writeFileSync(filepath, xml, 'utf8');

  const date = new Date().toISOString().split('T')[0];
  const datedFilename = `emmanuela-${feedKey}-${date}.xml`;
  const datedFilepath = path.join(OUTPUT_DIR, datedFilename);
  fs.writeFileSync(datedFilepath, xml, 'utf8');

  console.log(`\n✅ Feed saved:`);
  console.log(`   ${filepath}`);
  console.log(`   ${datedFilepath}`);
  console.log(`\n📊 Summary: ${stats.inStock} items (${stats.withShipping} with shipping)\n`);
  
  return { filepath, stats };
}

async function generateAllFeeds() {
  const feedCount = Object.keys(MARKETS).length - SPOKE_COUNTRIES.size;
  console.log(`\n🌍 GENERATING FEEDS FOR ${feedCount} MARKETS (v9 hub-and-spoke: ${SPOKE_COUNTRIES.size} spoke countries via hub shipping)\n`);
  
  // v6: Fetch shipping rates ONCE for all markets
  const shippingRates = await fetchShippingRates();
  
  // Fetch products once
  const products = await fetchProductsWithOptions();
  if (products.length === 0) { console.error('❌ No products found'); return; }

  // v10: Fetch contextual pricing for market-adjusted prices (ONE API call for all markets)
  const priceAdjustments = await fetchPriceAdjustments(products);

  // Group markets by locale
  const marketsByLocale = {};
  for (const [code, market] of Object.entries(MARKETS)) {
    if (!marketsByLocale[market.locale]) marketsByLocale[market.locale] = [];
    marketsByLocale[market.locale].push({ code, ...market });
  }

  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const results = [];
  let marketCount = 0;
  let skippedSpokes = 0;
  const totalMarkets = Object.keys(MARKETS).length;

  // v7.9: Pre-fetch English translations ONCE — used as fallback for all non-en/non-el locales
  let englishTranslations = null;

  for (const [locale, markets] of Object.entries(marketsByLocale)) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`📦 Processing locale: ${locale} (${markets.length} markets)`);
    console.log(`${'='.repeat(60)}\n`);

    let translations = { products: {}, optionValues: {} };
    if (locale !== 'el') {
      translations = await fetchAllTranslations(products, locale);
    }

    // v7.9: For non-English, non-Greek locales, ensure English fallback is available
    if (locale !== 'el' && locale !== 'en') {
      if (!englishTranslations) {
        console.log(`\n🔄 Fetching English translations (fallback for non-en locales)...`);
        englishTranslations = await fetchAllTranslations(products, 'en');
      }
      translations.englishFallback = englishTranslations;
    }

    for (const market of markets) {
      marketCount++;

      // v9: Skip spoke countries — their shipping is handled by hub feeds
      if (SPOKE_COUNTRIES.has(market.country)) {
        console.log(`\n[${marketCount}/${totalMarkets}] ⏭️  Skipping ${market.name} (${market.code}) — spoke of hub feed`);
        skippedSpokes++;
        continue;
      }

      console.log(`\n[${marketCount}/${totalMarkets}] Generating ${market.name} (${market.code})...`);

      // v9: Log spoke countries for hub feeds
      if (HUB_SPOKES[market.code]) {
        console.log(`   🔗 Hub feed — includes shipping for: ${HUB_SPOKES[market.code].join(', ')}`);
      }

      // v6+v10: Pass shipping rates and price adjustments to generator
      const priceAdj = priceAdjustments ? priceAdjustments[market.code] : null;
      const { xml, stats } = generateFeedForMarket(products, translations, market, shippingRates, priceAdj);

      // v11: Use feedSuffix for multi-language country feeds (e.g., ch-fr, be-fr)
      const feedKey = market.feedSuffix || market.country.toLowerCase();
      const filename = `emmanuela-${feedKey}.xml`;
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
  console.log(`   Feeds generated: ${results.length} (${skippedSpokes} spoke countries via hub shipping)`);
  console.log(`   Markets with shipping: ${withShipping}/${results.length}\n`);

  // v9: Show hub-spoke mapping
  console.log('   Hub-spoke mapping:');
  for (const [hub, spokes] of Object.entries(HUB_SPOKES)) {
    console.log(`     ${hub} → ${spokes.join(', ')} (${spokes.length} spokes)`);
  }
  console.log('');

  results.forEach(r => {
    const hubLabel = HUB_SPOKES[r.market] ? ` [+${HUB_SPOKES[r.market].length} spokes]` : '';
    console.log(`   ${r.market}: ${r.items} items [shipping: ${r.shipping}] → ${r.file}${hubLabel}`);
  });

  console.log(`\n✅ Total: ${results.length} feeds generated (${SPOKE_COUNTRIES.size} spoke countries handled via hub shipping)`);
  console.log(`📁 Location: ${OUTPUT_DIR}\n`);
}

function listMarkets() {
  const feedCount = Object.keys(MARKETS).length - SPOKE_COUNTRIES.size;
  console.log(`\n📋 AVAILABLE MARKETS (${Object.keys(MARKETS).length} total, ${feedCount} feeds + ${SPOKE_COUNTRIES.size} via hub shipping)\n`);
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
        const spokeLabel = SPOKE_COUNTRIES.has(m.country)
          ? ` [spoke → ${Object.entries(HUB_SPOKES).find(([_, s]) => s.includes(m.country))?.[0]}]`
          : '';
        const hubLabel = HUB_SPOKES[m.code]
          ? ` [hub for ${HUB_SPOKES[m.code].join(',')}]`
          : '';
        console.log(`   ${m.code.padEnd(4)} ${m.name.padEnd(20)} ${m.domain}${m.path}${spokeLabel}${hubLabel}`);
      });
    }
  }

  console.log('\n💡 Usage:');
  console.log(`   node google-shopping-feed-v7.js GR     # Single market`);
  console.log(`   node google-shopping-feed-v7.js all    # All ${feedCount} feeds (${SPOKE_COUNTRIES.size} spokes via hubs)`);
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
