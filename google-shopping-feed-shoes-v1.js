/**
 * Google Shopping Feed Generator v1.0 for EMMANUELA SHOES
 *
 * Adapted from google-shopping-feed-v7.js (jewelry v11.2).
 *
 * Key differences from jewelry script:
 *   - Store: emmanuela-shoes.myshopify.com / emmanuela.shoes
 *   - Single domain with subfolders (/de/, /fr/, etc.) — no dedicated domains
 *   - GTINs: All variants have barcodes → <g:gtin> + identifier_exists=true
 *   - Categories: Shoes/Sandals (187, 1897, 2745) instead of Jewelry
 *   - Materials: Default "Leather" (no metafield) — translated per locale
 *   - Colors: Expanded Greek→English color map for shoe colors
 *   - Product types: Sandals/mules/espadrilles translations
 *   - 38 target countries (no hub-and-spoke, all GMC-supported)
 *   - Multi-language feeds: CH (de/fr/it), BE (fr/nl), CA (en/fr)
 *   - Feed naming: emmanuela-shoes-{cc}.xml
 *
 * Usage:
 *   node google-shopping-feed-shoes-v1.js GR          # Single market
 *   node google-shopping-feed-shoes-v1.js all         # All markets
 *   node google-shopping-feed-shoes-v1.js list        # List available markets
 *
 * Created: 2026-04-02
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
  console.error('❌ ERROR: SHOPIFY_ACCESS_TOKEN environment variable not set!');
  console.error('   Set it with: set SHOPIFY_ACCESS_TOKEN=your_token_here');
  process.exit(1);
}
const API_VERSION = '2024-01';
const BRAND = 'Emmanuela - handcrafted for you';
const OUTPUT_DIR = path.join(__dirname, 'feeds');

// ============================================
// GOOGLE PRODUCT CATEGORY MAPPING (Shoes)
// ============================================

const GOOGLE_CATEGORY_MAP = {
  // Sandals
  'σανδάλια': 1897, 'sandals': 1897, 'sandal': 1897,
  'σανδάλια μονομάχου': 1897, 'gladiator sandals': 1897, 'gladiator': 1897,
  'σανδάλια με λουριά στη φτέρνα': 1897, 'strap sandals': 1897,
  'σανδάλια & πέδιλα παντόφλες': 1897,
  'πέδιλα με κούμπωμα': 1897,
  // Slides / Mules
  'slide sandals': 2504, 'slides': 2504, 'slide': 2504,
  'flat mules': 2504, 'mules': 2504,
  'παντόφλες': 2504,
  // Espadrilles
  'εσπαντρίγιες': 2745, 'espadrilles': 2745,
  // Men's sandals
  'ανδρικά σανδάλια': 1897, "men's sandals": 1897,
};

// Default: Clothing & Accessories > Shoes (general)
const DEFAULT_GOOGLE_CATEGORY = 187;

function getGoogleCategory(productType) {
  if (!productType) return DEFAULT_GOOGLE_CATEGORY;
  const type = productType.toLowerCase();
  for (const [keyword, categoryId] of Object.entries(GOOGLE_CATEGORY_MAP)) {
    if (type.includes(keyword)) return categoryId;
  }
  return DEFAULT_GOOGLE_CATEGORY;
}

// ============================================
// COLOR MAP (Greek → English)
// Expanded for shoe-specific colors
// ============================================

const COLOR_MAP = {
  // Basic colors
  'μαύρο': 'Black', 'μαύρα': 'Black', 'μαύρος': 'Black',
  'λευκό': 'White', 'λευκά': 'White',
  'καφέ': 'Brown', 'σκούρο καφέ': 'Dark Brown',
  'μπεζ': 'Beige', 'μπεζ φυσικό': 'Beige', 'μπεζ σουέντ': 'Beige',
  'κόκκινο': 'Red', 'κόκκινα': 'Red',
  'μπλε': 'Blue',
  'πράσινο': 'Green', 'πράσινα': 'Green',
  'κίτρινο': 'Yellow', 'κίτρινα': 'Yellow',
  'ροζ': 'Pink',
  'μωβ': 'Purple', 'λιλά': 'Lilac',
  'γκρι': 'Gray', 'γκρί': 'Gray',
  'πορτοκαλί': 'Orange',
  'φούξια': 'Fuchsia',
  'τιρκουάζ': 'Turquoise',
  'κοραλί': 'Coral',

  // Metallic colors
  'χρυσό': 'Gold', 'xρυσό': 'Gold',
  'ασημί': 'Silver',
  'ροζ χρυσό': 'Rose Gold', 'ροζ χρυσό ασημί': 'Rose Gold/Silver',
  'μπρούτζος': 'Bronze',

  // Suede variants
  'σουέντ': 'Suede', 'σουέν': 'Suede',
  'καφέ σουέντ': 'Brown', 'σουέντ καφέ': 'Brown',
  'ανοιχτό καφέ σουέντ': 'Tan',
  'μαύρο σουέντ': 'Black', 'γκρι σουέντ': 'Gray',
  'γκρι-μπλε σουέντ': 'Gray/Blue',
  'κίτρινο σουέντ': 'Yellow',
  'λιλά σουέντ': 'Lilac', 'λαδί σουέντ': 'Olive', 'λαδί σουέν': 'Olive',
  'πετρόλ σουέντ': 'Teal', 'πράσινο σουέντ': 'Green',
  'κόκκινο-καφέ σουέντ': 'Red/Brown',
  'σκούρο ματζέντα σουέντ': 'Magenta',

  // Patterns
  'λέοπαρντ': 'Leopard Print', 'ζέβρα': 'Zebra Print',
  'δέρμα φιδιού': 'Snakeskin',
  'μαύρο κροκό': 'Black', 'ροζ χρυσό κροκό': 'Rose Gold',

  // Natural
  'φυσικό': 'Natural', 'φυσικό-λευκό': 'Natural/White',
  'άμμος': 'Sand', 'πάγος': 'Ice',
  'λαδί': 'Olive',
  'κεραμιδί': 'Terracotta',
  'μουσταρδί': 'Mustard',
  'μέντα': 'Mint',

  // Combinations
  'μαύρο - ροζ χρυσό': 'Black/Rose Gold',
  'μαύρο-χρυσό': 'Black/Gold',
  'μπεζ-χρυσο': 'Beige/Gold', 'μπεζ-χρυσό': 'Beige/Gold',
  'κίτρινο-καφέ': 'Yellow/Brown',
  'λευκό - κοραλί': 'White/Coral', 'λευκό - τιρκουάζ': 'White/Turquoise',
  'λευκό κοραλί ροζ': 'White/Coral/Pink',
  'λευκό ροζ λιλά': 'White/Pink/Lilac',
  'λευκό τιρκουάζ μουσταρδί': 'White/Turquoise/Mustard',
  'λευκό με καφέ πάτο': 'White/Brown', 'λευκό με μπέζ πάτο': 'White/Beige',
  'ροζ λευκό κοραλί': 'Pink/White/Coral', 'ροζ λευκό λιλά': 'Pink/White/Lilac',
  'τιρκουάζ - λευκό': 'Turquoise/White', 'τιρκουάζ-λευκό': 'Turquoise/White',
  'τιρκουάζ με μουσταρδί': 'Turquoise/Mustard',
  'μουσταρδί - καφέ': 'Mustard/Brown', 'μουσταρδί με τιρκουάζ': 'Mustard/Turquoise',

  // Metallic variants
  'λιλά μεταλλικό': 'Metallic Lilac', 'λιλά μεταλλικο': 'Metallic Lilac',
  'πράσινο μεταλλικό': 'Metallic Green',
  'φούξια μεταλλικό': 'Metallic Fuchsia', 'φούξια μεταλλικο': 'Metallic Fuchsia',
  '3χρωμία μεταλλική': 'Multicolor Metallic',

  // Multi-color
  'πολύχρωμο': 'Multicolor', 'πολύχρωμα': 'Multicolor',
  'πολύχρωμο ύφασμα': 'Multicolor', 'πολύχρωμη ψάθα': 'Multicolor',
  'πολύχρωμα με πούλιες': 'Multicolor',
};

// ============================================
// MATERIAL TRANSLATIONS (Shoes — default: Leather)
// No metafield exists; we hardcode "Leather" translated per locale
// ============================================

const MATERIAL_TRANSLATIONS = {
  en: 'Leather',
  de: 'Leder',
  fr: 'Cuir',
  it: 'Pelle',
  es: 'Cuero',
  el: 'Δέρμα',
  nl: 'Leer',
  sv: 'Läder',
  da: 'Læder',
  fi: 'Nahka',
  cs: 'Kůže',
  ja: 'レザー',
  no: 'Lær',
  pl: 'Skóra',
  ro: 'Piele',
  ru: 'Кожа',
  ms: 'Kulit',
  mt: 'Ġilda',
  'pt-PT': 'Couro',
};

function getMaterial(language) {
  return MATERIAL_TRANSLATIONS[language] || MATERIAL_TRANSLATIONS['en'];
}


// ============================================
// PRODUCT HIGHLIGHTS (per language — max 6 bullet points)
// ============================================

const PRODUCT_HIGHLIGHTS = {
  en: [
    'Handcrafted in Greece by skilled artisans',
    'Made from 100% genuine leather',
    'Anti-slip EVA rubber outsole',
    'Leather insole that molds to your feet',
    'Free shipping to most countries',
    'Easy 14-day returns',
  ],
  de: [
    'Handgefertigt in Griechenland von erfahrenen Kunsthandwerkern',
    'Aus 100% echtem Leder gefertigt',
    'Rutschfeste EVA-Gummisohle',
    'Lederinnensohle, die sich dem Fuß anpasst',
    'Kostenloser Versand in die meisten Länder',
    'Einfache Rückgabe innerhalb von 14 Tagen',
  ],
  fr: [
    'Fabriqué à la main en Grèce par des artisans qualifiés',
    'Fabriqué en cuir véritable 100%',
    'Semelle extérieure antidérapante en caoutchouc EVA',
    'Semelle intérieure en cuir qui épouse la forme du pied',
    'Livraison gratuite dans la plupart des pays',
    'Retours faciles sous 14 jours',
  ],
  it: [
    'Realizzato a mano in Grecia da artigiani esperti',
    'Realizzato in 100% vera pelle',
    'Suola esterna antiscivolo in gomma EVA',
    'Soletta in pelle che si adatta al piede',
    'Spedizione gratuita nella maggior parte dei paesi',
    'Reso facile entro 14 giorni',
  ],
  es: [
    'Hecho a mano en Grecia por artesanos cualificados',
    'Fabricado con 100% cuero genuino',
    'Suela exterior antideslizante de goma EVA',
    'Plantilla de cuero que se amolda al pie',
    'Envío gratuito a la mayoría de los países',
    'Devoluciones fáciles en 14 días',
  ],
  el: [
    'Χειροποίητο στην Ελλάδα από εξειδικευμένους τεχνίτες',
    'Κατασκευασμένο από 100% γνήσιο δέρμα',
    'Αντιολισθητική σόλα από καουτσούκ EVA',
    'Δερμάτινος πάτος που προσαρμόζεται στο πόδι',
    'Δωρεάν αποστολή στις περισσότερες χώρες',
    'Εύκολες επιστροφές εντός 14 ημερών',
  ],
  nl: [
    'Handgemaakt in Griekenland door ervaren ambachtslieden',
    'Gemaakt van 100% echt leer',
    'Antislip EVA-rubberen buitenzool',
    'Leren binnenzool die zich vormt naar uw voet',
    'Gratis verzending naar de meeste landen',
    'Eenvoudig retourneren binnen 14 dagen',
  ],
  ja: [
    'ギリシャの熟練職人による手作り',
    '100%本革製',
    '滑り止めEVAラバーアウトソール',
    '足に馴染むレザーインソール',
    'ほとんどの国への送料無料',
    '14日間の簡単返品',
  ],
};

function getProductHighlights(language) {
  return PRODUCT_HIGHLIGHTS[language] || PRODUCT_HIGHLIGHTS['en'];
}


// ============================================
// PRODUCT TYPE TRANSLATIONS
// ============================================

const PRODUCT_TYPE_TRANSLATIONS = {
  en: {
    'Σανδάλια μονομάχου': 'Gladiator Sandals',
    'Σανδάλια με λουριά στη φτέρνα': 'Strap Sandals',
    'Σανδάλια & πέδιλα παντόφλες': 'Slide Sandals',
    'Πέδιλα με κούμπωμα': 'Buckle Sandals',
    'Ανδρικά σανδάλια': "Men's Sandals",
    'Εσπαντρίγιες': 'Espadrilles',
    'Flat mules': 'Flat Mules',
    'Gladiator Sandals': 'Gladiator Sandals',
    "Men's Sandals": "Men's Sandals",
    'Slide Sandals': 'Slide Sandals',
    'Strap Sandals': 'Strap Sandals',
  },
  de: {
    'Σανδάλια μονομάχου': 'Gladiator-Sandalen',
    'Σανδάλια με λουριά στη φτέρνα': 'Riemchensandalen',
    'Σανδάλια & πέδιλα παντόφλες': 'Pantoletten',
    'Πέδιλα με κούμπωμα': 'Schnallensandalen',
    'Ανδρικά σανδάλια': 'Herren Sandalen',
    'Εσπαντρίγιες': 'Espadrilles',
    'Flat mules': 'Flache Mules',
    'Gladiator Sandals': 'Gladiator-Sandalen',
    "Men's Sandals": 'Herren Sandalen',
    'Slide Sandals': 'Pantoletten',
    'Strap Sandals': 'Riemchensandalen',
  },
  fr: {
    'Σανδάλια μονομάχου': 'Sandales Gladiateur',
    'Σανδάλια με λουριά στη φτέρνα': 'Sandales à Brides',
    'Σανδάλια & πέδιλα παντόφλες': 'Sandales Mules',
    'Πέδιλα με κούμπωμα': 'Sandales à Boucle',
    'Ανδρικά σανδάλια': 'Sandales Homme',
    'Εσπαντρίγιες': 'Espadrilles',
    'Flat mules': 'Mules Plates',
    'Gladiator Sandals': 'Sandales Gladiateur',
    "Men's Sandals": 'Sandales Homme',
    'Slide Sandals': 'Sandales Mules',
    'Strap Sandals': 'Sandales à Brides',
  },
  it: {
    'Σανδάλια μονομάχου': 'Sandali Gladiatore',
    'Σανδάλια με λουριά στη φτέρνα': 'Sandali con Cinturino',
    'Σανδάλια & πέδιλα παντόφλες': 'Ciabatte',
    'Πέδιλα με κούμπωμα': 'Sandali con Fibbia',
    'Ανδρικά σανδάλια': 'Sandali Uomo',
    'Εσπαντρίγιες': 'Espadrillas',
    'Flat mules': 'Mule Basse',
    'Gladiator Sandals': 'Sandali Gladiatore',
    "Men's Sandals": 'Sandali Uomo',
    'Slide Sandals': 'Ciabatte',
    'Strap Sandals': 'Sandali con Cinturino',
  },
  es: {
    'Σανδάλια μονομάχου': 'Sandalias Gladiadoras',
    'Σανδάλια με λουριά στη φτέρνα': 'Sandalias con Tiras',
    'Σανδάλια & πέδιλα παντόφλες': 'Sandalias Mule',
    'Πέδιλα με κούμπωμα': 'Sandalias con Hebilla',
    'Ανδρικά σανδάλια': 'Sandalias de Hombre',
    'Εσπαντρίγιες': 'Alpargatas',
    'Flat mules': 'Mules Planas',
    'Gladiator Sandals': 'Sandalias Gladiadoras',
    "Men's Sandals": 'Sandalias de Hombre',
    'Slide Sandals': 'Sandalias Mule',
    'Strap Sandals': 'Sandalias con Tiras',
  },
};

function translateProductType(greekType, language) {
  if (!greekType) return 'Sandals';
  if (language === 'el') return greekType;
  const langMap = PRODUCT_TYPE_TRANSLATIONS[language] || PRODUCT_TYPE_TRANSLATIONS['en'];
  return langMap[greekType] || PRODUCT_TYPE_TRANSLATIONS['en']?.[greekType] || greekType;
}


// ============================================
// MARKET DEFINITIONS
// Single domain: emmanuela.shoes with subfolders
// 38 target countries + multi-language variants
// ============================================

const DOMAIN = 'emmanuela.shoes';

// ⚠ PATHS (fixed 2026-07-10): live market URLs are /{lang}-{cc} subfolders (verified against the
// storefront hreflang cluster). Bare /{cc} paths DO NOT EXIST → they 404'd and caused ~4,900
// landing_page_error disapprovals per country in GMC. Only el/en/fr/de/cs exist as language-only
// folders (primary market). Working reference pattern = the Shopify Google app links:
// /{lang}-{cc}/products/{handle}?variant=…&country={CC}&currency={CUR}
const MARKETS = {
  // PRIMARY — Greece (no subfolder)
  GR: { country: 'GR', language: 'el', currency: 'EUR', locale: 'el', path: '', priority: 0, name: 'Greece' },

  // TIER 1 — Major EU
  DE: { country: 'DE', language: 'de', currency: 'EUR', locale: 'de', path: '/de-de', priority: 1, name: 'Germany' },
  FR: { country: 'FR', language: 'fr', currency: 'EUR', locale: 'fr', path: '/fr-fr', priority: 1, name: 'France' },
  IT: { country: 'IT', language: 'it', currency: 'EUR', locale: 'it', path: '/it-it', priority: 1, name: 'Italy' },
  ES: { country: 'ES', language: 'es', currency: 'EUR', locale: 'es', path: '/es-es', priority: 1, name: 'Spain' },
  GB: { country: 'GB', language: 'en', currency: 'GBP', locale: 'en', path: '/en-gb', priority: 1, name: 'United Kingdom' },
  NL: { country: 'NL', language: 'nl', currency: 'EUR', locale: 'nl', path: '/nl-nl', priority: 1, name: 'Netherlands' },
  AT: { country: 'AT', language: 'de', currency: 'EUR', locale: 'de', path: '/de-at', priority: 1, name: 'Austria' },
  BE: { country: 'BE', language: 'fr', currency: 'EUR', locale: 'fr', path: '/fr-be', priority: 1, name: 'Belgium' },

  // TIER 2 — EU
  PL: { country: 'PL', language: 'pl', currency: 'PLN', locale: 'pl', path: '/pl-pl', priority: 2, name: 'Poland' },
  CZ: { country: 'CZ', language: 'cs', currency: 'CZK', locale: 'cs', path: '/cs-cz', priority: 2, name: 'Czech Republic' },
  RO: { country: 'RO', language: 'ro', currency: 'RON', locale: 'ro', path: '/ro-ro', priority: 2, name: 'Romania' },
  HU: { country: 'HU', language: 'en', currency: 'HUF', locale: 'en', path: '/en-hu', priority: 2, name: 'Hungary' },
  SE: { country: 'SE', language: 'sv', currency: 'SEK', locale: 'sv', path: '/sv-se', priority: 2, name: 'Sweden' },
  DK: { country: 'DK', language: 'da', currency: 'DKK', locale: 'da', path: '/da-dk', priority: 2, name: 'Denmark' },
  FI: { country: 'FI', language: 'fi', currency: 'EUR', locale: 'fi', path: '/fi-fi', priority: 2, name: 'Finland' },
  PT: { country: 'PT', language: 'pt', currency: 'EUR', locale: 'pt-PT', path: '/pt-pt', priority: 2, name: 'Portugal' },
  IE: { country: 'IE', language: 'en', currency: 'EUR', locale: 'en', path: '/en-ie', priority: 2, name: 'Ireland' },
  SK: { country: 'SK', language: 'en', currency: 'EUR', locale: 'en', path: '/en-sk', priority: 2, name: 'Slovakia' },
  SI: { country: 'SI', language: 'en', currency: 'EUR', locale: 'en', path: '/en-si', priority: 2, name: 'Slovenia' },
  BG: { country: 'BG', language: 'en', currency: 'BGN', locale: 'en', path: '/en-bg', priority: 2, name: 'Bulgaria' },
  HR: { country: 'HR', language: 'en', currency: 'EUR', locale: 'en', path: '/en', priority: 2, name: 'Croatia' },  // No HR market on the store — land on the EN language folder (exists, 200)
  CY: { country: 'CY', language: 'el', currency: 'EUR', locale: 'el', path: '/el-cy', priority: 2, name: 'Cyprus' },
  EE: { country: 'EE', language: 'en', currency: 'EUR', locale: 'en', path: '/en-ee', priority: 2, name: 'Estonia' },
  LV: { country: 'LV', language: 'en', currency: 'EUR', locale: 'en', path: '/en-lv', priority: 2, name: 'Latvia' },
  LT: { country: 'LT', language: 'en', currency: 'EUR', locale: 'en', path: '/en-lt', priority: 2, name: 'Lithuania' },
  MT: { country: 'MT', language: 'mt', currency: 'EUR', locale: 'mt', path: '/mt-mt', priority: 2, name: 'Malta' },
  LU: { country: 'LU', language: 'de', currency: 'EUR', locale: 'de', path: '/de-lu', priority: 2, name: 'Luxembourg' },

  // TIER 3 — Europe non-EU
  CH: { country: 'CH', language: 'de', currency: 'CHF', locale: 'de', path: '/de-ch', priority: 3, name: 'Switzerland' },
  // NO: store's Norway market sells EUR (not NOK) — NOK caused inconsistent_currencies ×4,911; locale is 'no' (published), not 'nb'
  NO: { country: 'NO', language: 'no', currency: 'EUR', locale: 'no', path: '/no-no', priority: 3, name: 'Norway' },

  // TIER 4 — Americas
  US: { country: 'US', language: 'en', currency: 'USD', locale: 'en', path: '/en-us', priority: 4, name: 'USA' },
  CA: { country: 'CA', language: 'en', currency: 'CAD', locale: 'en', path: '/en-ca', priority: 4, name: 'Canada' },
  // MX: store's Mexico market sells EUR (not MXN) — MXN caused inconsistent_currencies ×4,911
  MX: { country: 'MX', language: 'es', currency: 'EUR', locale: 'es', path: '/es-mx', priority: 4, name: 'Mexico' },

  // TIER 5 — Oceania
  AU: { country: 'AU', language: 'en', currency: 'AUD', locale: 'en', path: '/en-au', priority: 5, name: 'Australia' },
  NZ: { country: 'NZ', language: 'en', currency: 'NZD', locale: 'en', path: '/en-nz', priority: 5, name: 'New Zealand' },

  // TIER 6 — Asia/Middle East
  JP: { country: 'JP', language: 'ja', currency: 'JPY', locale: 'ja', path: '/ja-jp', priority: 6, name: 'Japan' },
  SG: { country: 'SG', language: 'en', currency: 'SGD', locale: 'en', path: '/en-sg', priority: 6, name: 'Singapore' },
  TW: { country: 'TW', language: 'en', currency: 'TWD', locale: 'en', path: '/en-tw', priority: 6, name: 'Taiwan' },
  IL: { country: 'IL', language: 'en', currency: 'ILS', locale: 'en', path: '/en-il', priority: 6, name: 'Israel' },
  SA: { country: 'SA', language: 'en', currency: 'SAR', locale: 'en', path: '/en-sa', priority: 6, name: 'Saudi Arabia' },
  AE: { country: 'AE', language: 'en', currency: 'AED', locale: 'en', path: '/en-ae', priority: 6, name: 'UAE' },

  // Multi-language country feeds
  CH_FR: { country: 'CH', language: 'fr', currency: 'CHF', locale: 'fr', path: '/fr-ch', priority: 3, name: 'Switzerland (French)', feedSuffix: 'ch-fr' },
  CH_IT: { country: 'CH', language: 'it', currency: 'CHF', locale: 'it', path: '/it-ch', priority: 3, name: 'Switzerland (Italian)', feedSuffix: 'ch-it' },
  BE_NL: { country: 'BE', language: 'nl', currency: 'EUR', locale: 'nl', path: '/nl-be', priority: 1, name: 'Belgium (Dutch)', feedSuffix: 'be-nl' },
  CA_FR: { country: 'CA', language: 'fr', currency: 'CAD', locale: 'fr', path: '/fr-ca', priority: 4, name: 'Canada (French)', feedSuffix: 'ca-fr' },
};


// ============================================
// SHIPPING TIME CONFIGURATION
// Same courier structure as jewelry (ships from Greece)
// ============================================

const HANDLING_TIME = { min: 1, max: 1 };

const TRANSIT_TIMES = {
  GR: { min: 1, max: 3 },
  DE: { min: 1, max: 3 },
  EU: { min: 2, max: 4 },
  GB: { min: 2, max: 5 },
  CH: { min: 2, max: 4 },
  NO: { min: 2, max: 4 },
  US: { min: 2, max: 6 },
  CA: { min: 2, max: 4 },
  AU: { min: 2, max: 7 },
  NZ: { min: 2, max: 7 },
  MX: { min: 2, max: 7 },
  AE: { min: 2, max: 7 },
  IL: { min: 2, max: 7 },
  SA: { min: 2, max: 7 },
  ASIA: { min: 2, max: 7 },
};

const TRANSIT_GROUP = {
  GR: 'GR', DE: 'DE', GB: 'GB', CH: 'CH', NO: 'NO',
  US: 'US', CA: 'CA', AU: 'AU', NZ: 'NZ', MX: 'MX', AE: 'AE', IL: 'IL', SA: 'SA',
  // EU countries
  AT: 'EU', BE: 'EU', HR: 'EU', CZ: 'EU', DK: 'EU',
  EE: 'EU', FI: 'EU', FR: 'EU', HU: 'EU', IE: 'EU', IT: 'EU', LV: 'EU',
  LT: 'EU', NL: 'EU', PL: 'EU', PT: 'EU', RO: 'EU',
  SK: 'EU', SI: 'EU', ES: 'EU', SE: 'EU', CY: 'EU', MT: 'EU', LU: 'EU', BG: 'EU',
  // Asia
  JP: 'ASIA', SG: 'ASIA', TW: 'ASIA',
};


// ============================================
// RETURN POLICY LABELS
// ============================================

const RETURN_POLICY_LABELS = {
  // Non-EU: customer pays return shipping
  US: 'international_returns',
  CH: 'international_returns',
  NO: 'international_returns',
  GB: 'international_returns',
  AU: 'international_returns',
  NZ: 'international_returns',
  JP: 'international_returns',
  SG: 'international_returns',
  AE: 'international_returns',
  IL: 'international_returns',
  SA: 'international_returns',
  MX: 'international_returns',
  TW: 'international_returns',
  // All EU + GR + CY: "default" (free returns, seller pays)
};


// ============================================
// SHIPPING SERVICE NAMES
// ============================================

const SHIPPING_SERVICE_MAP = {
  GR: 'ACS Courier',
  US: 'DHL DDP Express',
};

const DEFAULT_SHIPPING_SERVICE = 'DHL Express';


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

function smartTruncate(str, maxLen = 150) {
  if (!str || str.length <= maxLen) return str;
  const truncated = str.substring(0, maxLen);
  const lastSpace = truncated.lastIndexOf(' ');
  const lastSlash = truncated.lastIndexOf(' / ');
  const cutPoint = lastSlash > maxLen * 0.6 ? lastSlash : (lastSpace > 0 ? lastSpace : maxLen);
  return truncated.substring(0, cutPoint);
}

function buildProductUrl(handle, variantId, market) {
  // country + currency params keep Shopify in the right market context (without them the
  // /{lang}-{cc} prefix 302-bounces to the base product URL) — same pattern as the
  // Shopify Google app's approved links.
  return `https://${DOMAIN}${market.path}/products/${handle}?variant=${variantId}&country=${market.country}&currency=${market.currency}`;
}

function formatPrice(amount, currency) {
  const num = parseFloat(amount);
  return isNaN(num) ? `0.00 ${currency}` : `${num.toFixed(2)} ${currency}`;
}

function formatWeight(grams) {
  if (!grams || grams <= 0) return null;
  return `${grams} g`;
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
    const isThrottled = result.statusCode === 429 ||
      (result.data?.errors && result.data.errors[0]?.extensions?.code === 'THROTTLED');
    if (isThrottled && attempt < maxRetries) {
      const wait = Math.min(2000 * Math.pow(2, attempt), 15000);
      process.stdout.write(` [throttled, retry in ${wait/1000}s]`);
      await new Promise(r => setTimeout(r, wait));
      continue;
    }
    return result;
  }
}


// ============================================
// COLOR EXTRACTION
// ============================================

function normalizeColor(greekColor) {
  if (!greekColor) return null;
  const normalized = greekColor.toLowerCase().trim();
  if (/\d/.test(normalized) && !normalized.startsWith('3χρωμ')) return null;
  if (normalized.length > 40) return null;
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
  if (type.includes('ανδρικ') || t.includes('ανδρικ') || type.includes("men's") || t.includes("men's")) return 'male';
  if (type.includes('γυναικ') || t.includes('γυναικ') || type.includes("women's") || t.includes("women's")) return 'female';
  return 'female'; // Default: shoes store is primarily women's sandals
}


// ============================================
// FETCH SHIPPING RATES FROM SHOPIFY
// ============================================

async function fetchShippingRates() {
  console.log('🚚 Fetching shipping rates from Shopify...\n');

  const query = `
    query GetShippingRates {
      deliveryProfiles(first: 5) {
        nodes {
          id name default
          profileLocationGroups {
            locationGroupZones(first: 50) {
              nodes {
                zone {
                  name
                  countries { code { countryCode } }
                }
                methodDefinitions(first: 10, eligible: true) {
                  nodes {
                    name active
                    rateProvider {
                      ... on DeliveryRateDefinition {
                        price { amount currencyCode }
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
    if (data.errors) { console.error('⚠️ Shipping API errors:', data.errors); return null; }

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
            if (!price) continue;

            for (const cc of countries) {
              const rateAmount = parseFloat(price.amount);
              if (!countryRates[cc] || rateAmount < countryRates[cc].price) {
                countryRates[cc] = { price: rateAmount, currency: price.currencyCode };
              }
            }
          }
        }
      }
    }

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


// ============================================
// SHIPPING TAG FORMATTING
// ============================================

function formatShippingTag(countryCode, shippingRates) {
  if (!shippingRates || !shippingRates[countryCode]) return '';

  const rate = shippingRates[countryCode];
  const currency = (MARKETS[countryCode] && MARKETS[countryCode].currency) || rate.currency;
  const priceStr = rate.price === 0 ? `0.00 ${currency}` : `${rate.price.toFixed(2)} ${currency}`;
  const serviceName = SHIPPING_SERVICE_MAP[countryCode] || DEFAULT_SHIPPING_SERVICE;
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

function formatShippingTimeAttributes(countryCode) {
  const returnLabel = RETURN_POLICY_LABELS[countryCode] || 'default';
  return `
      <g:ships_from_country>GR</g:ships_from_country>
      <g:return_policy_label>${returnLabel}</g:return_policy_label>`;
}


// ============================================
// FETCH PRODUCTS (GraphQL)
// ============================================

async function fetchProductsWithOptions() {
  console.log('📦 Fetching products with options + weight + video...\n');

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
                    image { id url }
                  }
                  ... on Video {
                    id
                    sources { url mimeType height }
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
            colorPattern: metafield(namespace: "shopify", key: "color-pattern") { value }
            targetGender: metafield(namespace: "shopify", key: "target-gender") { value }
            gsGender: metafield(namespace: "google", key: "gender") { value }
            gsAgeGroup: metafield(namespace: "google", key: "age_group") { value }
          }
        }
      }
    }`;

    try {
      const { data } = await graphqlRequest(query);
      if (data.errors) { console.error('GraphQL errors:', data.errors); break; }

      const products = data.data?.products?.edges || [];
      products.forEach(({ node }) => {
        const mediaEdges = node.media?.edges || [];
        const images = [];
        const videos = [];
        for (const edge of mediaEdges) {
          const m = edge.node;
          if (m.mediaContentType === 'IMAGE' && m.image?.url) {
            images.push({
              id: m.id.replace('gid://shopify/MediaImage/', ''),
              productImageId: m.image.id ? m.image.id.replace('gid://shopify/ProductImage/', '') : null,
              src: m.image.url
            });
          } else if (m.mediaContentType === 'VIDEO' && m.sources?.length > 0) {
            // Prefer the HIGHEST-RESOLUTION mp4 (Google video processing needs >=720p; the first
            // source is often the lowest/SD rendition -> video_link_processing_error, 2026-07-18)
            const mp4s = m.sources.filter(s => s.mimeType === 'video/mp4').sort((a, b) => (b.height || 0) - (a.height || 0));
            const bestSource = mp4s[0] || m.sources[0];
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
// CONTEXTUAL PRICING (Market-Adjusted Prices)
// ============================================

async function fetchPriceAdjustments(products) {
  console.log('💰 Fetching contextual pricing for market-adjusted prices...\n');

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

  // Multi-language feeds share pricing with their parent country
  const PRICING_EXCLUDED = new Set(['CH_FR', 'CH_IT', 'BE_NL', 'CA_FR']);
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
        adjustments[cc] = { factor: 1.0, currency: MARKETS[cc].currency };
        console.log(`   ⚠️ ${cc}: No contextual pricing returned — using catalog price`);
      }
    }

    // Inherit pricing for multi-language feeds
    if (adjustments.CH) {
      adjustments.CH_FR = { ...adjustments.CH };
      adjustments.CH_IT = { ...adjustments.CH };
      console.log(`   CH_FR/CH_IT: inherited CH pricing (×${adjustments.CH.factor.toFixed(6)} ${adjustments.CH.currency})`);
    }
    if (adjustments.BE) {
      adjustments.BE_NL = { ...adjustments.BE };
      console.log(`   BE_NL: inherited BE pricing (×${adjustments.BE.factor.toFixed(6)} ${adjustments.BE.currency})`);
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
// XML FEED GENERATION
// ============================================

function generateFeedForMarket(products, translations, market, shippingRates, priceAdj) {
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
    totalVariants: 0, withGender: 0, withColor: 0, withGtin: 0,
    withWeight: 0, withSize: 0, withShipping: 0, withVideo: 0,
    productsWithVideo: 0, categoryBreakdown: {}
  };

  const hasShipping = shippingRates && shippingRates[market.country];
  if (hasShipping) {
    const rate = shippingRates[market.country];
    console.log(`   🚚 Shipping: ${rate.price === 0 ? 'FREE' : rate.price + ' ' + rate.currency}`);
  } else {
    console.log(`   ⚠️ No shipping rate found for ${market.country}`);
  }

  const material = getMaterial(market.language);

  products.forEach(product => {
    const variants = product.variants || [];
    const images = product.images || [];
    const mainImage = images[0]?.src || '';

    if (!mainImage) { stats.noImage++; return; }

    // Color-correct additional images — match via productImageId (ProductImage GID)
    const allVariantImageIds = new Set(
      variants.map(v => v.image_id).filter(Boolean)
    );
    const variantImageIndices = [];
    images.forEach((img, idx) => {
      if (img.productImageId && allVariantImageIds.has(img.productImageId)) {
        variantImageIndices.push({ id: img.productImageId, idx });
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
    const enFallback = translations.englishFallback?.products[product.id] || {};
    const translatedTitle = prodTrans.title || enFallback.title || product.title;
    const translatedDesc = stripHtml(prodTrans.body_html || enFallback.body_html || product.body_html);
    const gender = getGender(product.product_type, product.title);
    const googleCategory = getGoogleCategory(product.product_type);
    stats.categoryBreakdown[googleCategory] = (stats.categoryBreakdown[googleCategory] || 0) + 1;

    if (gender !== 'unisex') stats.withGender++;
    if (product.videos && product.videos.length > 0) stats.productsWithVideo++;

    variants.forEach(variant => {
      if (variant.inventory_quantity <= 0) { stats.outOfStock++; return; }

      stats.inStock++;
      stats.totalVariants++;

      let variantSuffix = '';
      let variantColorOriginal = '';
      let shoeSize = null;

      if (variant.title && variant.title !== 'Default Title') {
        const translatedOptions = (variant.selectedOptions || []).map(opt => {
          if (opt.name === 'Χρώμα' || opt.name === 'Χρώμα μετάλλου' || opt.name.toLowerCase() === 'color') {
            variantColorOriginal = opt.value;
          }
          const enOptFallback = translations.englishFallback?.optionValues || {};
          return translations.optionValues[opt.value] || enOptFallback[opt.value] || opt.value;
        });
        variantSuffix = translatedOptions.join(' / ');
        if (translatedOptions.some((t, i) => t !== variant.selectedOptions[i]?.value)) {
          stats.translatedVariants++;
        }
        shoeSize = getSize(variant.selectedOptions);
        if (shoeSize) stats.withSize++;
      }

      const fullTitle = variantSuffix ? `${translatedTitle} - ${variantSuffix}` : translatedTitle;
      const enOptFallbackForColor = translations.englishFallback?.optionValues || {};
      const translatedColor = translations.optionValues[variantColorOriginal] || enOptFallbackForColor[variantColorOriginal] || null;
      const colorNormalized = translatedColor
        || normalizeColor(variantColorOriginal)
        || normalizeColor(product.metafields?.color)
        || 'Brown'; // Default color for shoes: Brown (leather)
      if (colorNormalized) stats.withColor++;
      if (variant.weight) stats.withWeight++;

      // Color-correct images
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
        // Fallback: use all product images (no color-correct grouping)
        variantImage = mainImage;
        variantAdditionalImages = images
          .map(img => img.src)
          .filter(src => src !== mainImage)
          .slice(0, 9);
      }

      const translatedHandle = prodTrans.handle || enFallback.handle || product.handle;
      const productUrl = buildProductUrl(translatedHandle, variant.id, market);
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

      // Lifestyle image (always 2nd image in Shopify)
      const lifestyleImage = images[1]?.src;
      if (lifestyleImage && lifestyleImage !== variantImage) {
        item += `\n      <g:lifestyle_image_link>${lifestyleImage}</g:lifestyle_image_link>`;
      }

      // Video links
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

      // GTIN: All shoes variants have barcodes
      if (variant.barcode) {
        item += `\n      <g:gtin>${escapeXml(variant.barcode)}</g:gtin>`;
        stats.withGtin++;
      }
      // MPN from SKU (additional identifier)
      if (variant.sku) {
        item += `\n      <g:mpn><![CDATA[${variant.sku}]]></g:mpn>`;
      }
      // identifier_exists is true by default when gtin is present, so omit tag

      item += `\n      <g:google_product_category>${googleCategory}</g:google_product_category>`;
      item += `\n      <g:product_type><![CDATA[${translateProductType(product.product_type, market.language)}]]></g:product_type>`;
      item += `\n      <g:age_group>adult</g:age_group>`;
      item += `\n      <g:gender>${gender}</g:gender>`;

      if (colorNormalized) item += `\n      <g:color><![CDATA[${colorNormalized}]]></g:color>`;
      item += `\n      <g:material><![CDATA[${material}]]></g:material>`;

      const weightFormatted = formatWeight(variant.weight);
      if (weightFormatted) item += `\n      <g:shipping_weight>${weightFormatted}</g:shipping_weight>`;
      if (shoeSize) {
        item += `\n      <g:size><![CDATA[${shoeSize}]]></g:size>`;
        item += `\n      <g:size_type>regular</g:size_type>`;
        item += `\n      <g:size_system>EU</g:size_system>`;
      }

      // Pattern (shoes are solid leather unless title indicates otherwise)
      item += `\n      <g:pattern>Solid</g:pattern>`;

      // Product highlights (localized bullet points)
      const highlights = getProductHighlights(market.language);
      highlights.forEach(h => {
        item += `\n      <g:product_highlight><![CDATA[${h}]]></g:product_highlight>`;
      });

      // Product detail (structured specs)
      item += `\n      <g:product_detail>`;
      item += `\n        <g:section_name>General</g:section_name>`;
      item += `\n        <g:attribute_name>Country of Origin</g:attribute_name>`;
      item += `\n        <g:attribute_value>Greece</g:attribute_value>`;
      item += `\n      </g:product_detail>`;
      item += `\n      <g:product_detail>`;
      item += `\n        <g:section_name>General</g:section_name>`;
      item += `\n        <g:attribute_name>Craftsmanship</g:attribute_name>`;
      item += `\n        <g:attribute_value>Handmade</g:attribute_value>`;
      item += `\n      </g:product_detail>`;
      item += `\n      <g:product_detail>`;
      item += `\n        <g:section_name>Sole</g:section_name>`;
      item += `\n        <g:attribute_name>Outsole Material</g:attribute_name>`;
      item += `\n        <g:attribute_value>EVA Rubber</g:attribute_value>`;
      item += `\n      </g:product_detail>`;
      item += `\n      <g:product_detail>`;
      item += `\n        <g:section_name>Sole</g:section_name>`;
      item += `\n        <g:attribute_name>Insole</g:attribute_name>`;
      item += `\n        <g:attribute_value>Leather</g:attribute_value>`;
      item += `\n      </g:product_detail>`;

      // Custom labels for campaign segmentation
      // label_0: product type (sandals, mules, espadrilles)
      const typeEN = translateProductType(product.product_type, 'en').toLowerCase();
      item += `\n      <g:custom_label_0><![CDATA[${typeEN}]]></g:custom_label_0>`;
      // label_1: price range
      const priceNum = adjustedVariantPrice;
      const priceRange = priceNum < 50 ? 'under-50' : priceNum < 80 ? '50-80' : priceNum < 120 ? '80-120' : 'over-120';
      item += `\n      <g:custom_label_1>${priceRange}</g:custom_label_1>`;
      // label_2: gender
      item += `\n      <g:custom_label_2>${gender}</g:custom_label_2>`;
      // label_3: has video
      item += `\n      <g:custom_label_3>${product.videos?.length > 0 ? 'has-video' : 'no-video'}</g:custom_label_3>`;
      // label_4: has sale
      const hasSale = variant.compare_at_price && parseFloat(variant.compare_at_price) > parseFloat(variant.price);
      item += `\n      <g:custom_label_4>${hasSale ? 'on-sale' : 'regular-price'}</g:custom_label_4>`;

      // Sale price handling
      if (variant.compare_at_price && parseFloat(variant.compare_at_price) > parseFloat(variant.price)) {
        item += `\n      <g:sale_price>${price}</g:sale_price>`;
        const adjustedCompareAt = Math.round(parseFloat(variant.compare_at_price) * priceFactor * 100) / 100;
        item += `\n      <g:price>${formatPrice(adjustedCompareAt, priceCurrency)}</g:price>`;
      }

      // Shipping tag
      if (hasShipping) {
        item += formatShippingTag(market.country, shippingRates);
        stats.withShipping++;
      }

      // Shipping time attributes
      item += formatShippingTimeAttributes(market.country);

      // Exclude GR from non-GR feeds (prevent MCA auto-expansion)
      if (market.country !== 'GR') {
        item += `\n      <g:shopping_ads_excluded_country>GR</g:shopping_ads_excluded_country>`;
      }

      item += `\n    </item>`;
      items.push(item);
    });
  });

  // Print stats
  console.log(`\n   📊 Stats for ${market.country}:`);
  console.log(`      In-stock items: ${stats.inStock}`);
  console.log(`      With GTIN: ${stats.withGtin} items`);
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
    <title>EMMANUELA - Handcrafted Leather Sandals (${market.name})</title>
    <link>https://${DOMAIN}${market.path}</link>
    <description>Handcrafted Leather Sandals from Greece - ${market.name}</description>
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
  console.log(`   Domain: ${DOMAIN}${market.path}`);
  console.log(`   Currency: ${market.currency}`);
  console.log(`${'='.repeat(60)}\n`);

  const shippingRates = await fetchShippingRates();
  const products = await fetchProductsWithOptions();
  if (products.length === 0) { console.error('❌ No products found'); return; }

  const priceAdjustments = await fetchPriceAdjustments(products);
  const priceAdj = priceAdjustments ? priceAdjustments[marketCode.toUpperCase()] : null;

  let translations = { products: {}, optionValues: {} };
  if (market.locale !== 'el') {
    translations = await fetchAllTranslations(products, market.locale);
  } else {
    console.log('ℹ️ Greek locale - skipping translations\n');
  }

  const { xml, stats } = generateFeedForMarket(products, translations, market, shippingRates, priceAdj);

  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const feedKey = market.feedSuffix || market.country.toLowerCase();
  const filename = `emmanuela-shoes-${feedKey}.xml`;
  const filepath = path.join(OUTPUT_DIR, filename);
  fs.writeFileSync(filepath, xml, 'utf8');

  const date = new Date().toISOString().split('T')[0];
  const datedFilename = `emmanuela-shoes-${feedKey}-${date}.xml`;
  const datedFilepath = path.join(OUTPUT_DIR, datedFilename);
  fs.writeFileSync(datedFilepath, xml, 'utf8');

  console.log(`\n✅ Feed saved:`);
  console.log(`   ${filepath}`);
  console.log(`   ${datedFilepath}`);
  console.log(`\n📊 Summary: ${stats.inStock} items (${stats.withGtin} with GTIN, ${stats.withShipping} with shipping)\n`);

  return { filepath, stats };
}

async function generateAllFeeds() {
  const feedCount = Object.keys(MARKETS).length;
  console.log(`\n🌍 GENERATING FEEDS FOR ${feedCount} MARKETS\n`);

  const shippingRates = await fetchShippingRates();
  const products = await fetchProductsWithOptions();
  if (products.length === 0) { console.error('❌ No products found'); return; }

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
  const totalMarkets = Object.keys(MARKETS).length;

  // Pre-fetch English translations ONCE (fallback for non-en/non-el locales)
  let englishTranslations = null;

  for (const [locale, markets] of Object.entries(marketsByLocale)) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`📦 Processing locale: ${locale} (${markets.length} markets)`);
    console.log(`${'='.repeat(60)}\n`);

    let translations = { products: {}, optionValues: {} };
    if (locale !== 'el') {
      translations = await fetchAllTranslations(products, locale);
    }

    if (locale !== 'el' && locale !== 'en') {
      if (!englishTranslations) {
        console.log(`\n🔄 Fetching English translations (fallback for non-en locales)...`);
        englishTranslations = await fetchAllTranslations(products, 'en');
      }
      translations.englishFallback = englishTranslations;
    }

    for (const market of markets) {
      marketCount++;
      console.log(`\n[${marketCount}/${totalMarkets}] Generating ${market.name} (${market.code})...`);

      const priceAdj = priceAdjustments ? priceAdjustments[market.code] : null;
      const { xml, stats } = generateFeedForMarket(products, translations, market, shippingRates, priceAdj);

      const feedKey = market.feedSuffix || market.country.toLowerCase();
      const filename = `emmanuela-shoes-${feedKey}.xml`;
      const filepath = path.join(OUTPUT_DIR, filename);
      fs.writeFileSync(filepath, xml, 'utf8');

      const hasShipping = shippingRates && shippingRates[market.country] ? '✓' : '✗';
      results.push({ market: market.code, items: stats.inStock, gtins: stats.withGtin, file: filename, shipping: hasShipping });
      console.log(`   ✅ Saved: ${filename} (${stats.inStock} items, ${stats.withGtin} GTINs, shipping: ${hasShipping})`);

      await new Promise(r => setTimeout(r, 100));
    }
  }

  // Print summary
  console.log(`\n${'='.repeat(60)}`);
  console.log('📊 GENERATION COMPLETE - SUMMARY');
  console.log(`${'='.repeat(60)}\n`);

  const withShipping = results.filter(r => r.shipping === '✓').length;
  console.log(`   Feeds generated: ${results.length}`);
  console.log(`   Markets with shipping: ${withShipping}/${results.length}\n`);

  results.forEach(r => {
    console.log(`   ${r.market}: ${r.items} items, ${r.gtins} GTINs [shipping: ${r.shipping}] → ${r.file}`);
  });

  console.log(`\n✅ Total: ${results.length} feeds generated`);
  console.log(`📁 Location: ${OUTPUT_DIR}\n`);
}

function listMarkets() {
  console.log(`\n📋 AVAILABLE MARKETS (${Object.keys(MARKETS).length} total)\n`);
  const byPriority = {};
  for (const [code, market] of Object.entries(MARKETS)) {
    if (!byPriority[market.priority]) byPriority[market.priority] = [];
    byPriority[market.priority].push({ code, ...market });
  }

  const priorityNames = {
    0: 'Primary (Greece)',
    1: 'Tier 1 (Major EU)',
    2: 'Tier 2 (EU)',
    3: 'Tier 3 (Europe non-EU)',
    4: 'Tier 4 (Americas)',
    5: 'Tier 5 (Oceania)',
    6: 'Tier 6 (Asia/Middle East)',
  };

  for (const priority of [0, 1, 2, 3, 4, 5, 6]) {
    if (byPriority[priority]) {
      console.log(`\n${priorityNames[priority]}:`);
      byPriority[priority].forEach(m => {
        const suffix = m.feedSuffix ? ` (feed: ${m.feedSuffix})` : '';
        console.log(`   ${m.code.padEnd(6)} ${m.name.padEnd(25)} ${DOMAIN}${m.path}${suffix}`);
      });
    }
  }

  console.log('\n💡 Usage:');
  console.log(`   node google-shopping-feed-shoes-v1.js GR     # Single market`);
  console.log(`   node google-shopping-feed-shoes-v1.js all    # All ${Object.keys(MARKETS).length} feeds`);
  console.log('   node google-shopping-feed-shoes-v1.js list   # This list\n');
}

// CLI
const arg = process.argv[2];
if (!arg) {
  console.log('❌ Please specify a market code or "all" or "list"');
  console.log('   Example: node google-shopping-feed-shoes-v1.js GR');
  process.exit(1);
}

if (arg.toLowerCase() === 'list') listMarkets();
else if (arg.toLowerCase() === 'all') generateAllFeeds().catch(console.error);
else generateFeed(arg).catch(console.error);
