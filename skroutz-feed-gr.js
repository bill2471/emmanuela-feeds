/**
 * Skroutz.gr Product Feed Generator v3.0 for EMMANUELA
 *
 * Generates a valid XML product feed per Skroutz.gr specifications.
 * Reference: https://developer.skroutz.gr/el/feedspec/
 * Jewelry-specific: https://partnersupport.skroutz.gr/hc/en-us/articles/15680091365265-Jewelry
 *
 * v3.2 (2026-05-11) — Packaging photo demotion fix:
 *   - PACKAGING DEMOTION: gift-packaging photos (filename pattern
 *     "925-sterling-silver-jewelry-gift-packaging-*") are no longer eligible
 *     as the main <image> for any entry. Skroutz rejected 15 Ασημί variants
 *     as "Μη έγκυρη εικόνα προϊόντος" because the v3.0 filename color filter
 *     classified packaging shots as Ασημί (the regex `silver` matched
 *     "sterling-silver"). Packaging remains allowed as <additionalimage>.
 *
 * v3.1 (2026-05-11) — MPN root stabilization (variant grouping):
 *   - STABLE MPN PER PRODUCT: when variants of one Shopify product had
 *     different SKUs per color (e.g. 4070SS/GS/XS) or no SKU at all, v3.0
 *     emitted a different MPN root per color group, breaking Skroutz catalog
 *     pattern matching. v3.1 derives a single product-level MPN root from
 *     the longest common SKU prefix, with `EMM-{product.id}` as fallback.
 *     Cross-product collisions are auto-resolved by demoting both to EMM-.
 *
 * v3.0 (2026-05-11) — Major spec-compliance rewrite:
 *   - PER-LENGTH SPLITTING: bracelets, chains, necklaces with Μήκος αλυσίδας /
 *     Περίμετρος καρπού / Διάλεξε είδος και μήκος / Τύπος κορδονιού now generate
 *     separate <product> entries per (color × length) instead of one merged entry.
 *     Per Skroutz Jewelry spec: "In earrings, bracelets, and chains, the sizes
 *     of a product should be sent in separate entries."
 *   - FILENAME-BASED IMAGE GROUPING: when Shopify variants lack assigned images
 *     (~44% of catalog), images are filtered per color group based on filename
 *     keywords (ashmenio-, epixryswmeno-, roz-, mayro-, oxeidwmeno-). This fixes
 *     the "all colors show same image" bug.
 *   - CROSS-COLOR IMAGE FILTERING: skips images whose filename indicates a
 *     different color than the current entry (Skroutz: "additional images must
 *     not show color variations of the product").
 *   - TITLE ENRICHMENT FOR CHAINS: products with length axis get length/type in
 *     title per Skroutz spec ("the title should include the thickness of the
 *     chain in mm, as well as the length of the chain in cm").
 *   - MONO DISCLOSURE: products with Μονό/Ζευγάρι where Μονό is kept get
 *     "Μονό" appended to title so customer knows they're buying a single piece.
 *
 * v2.0–v2.1 history retained:
 *   - v2.0: Color-correct images via variant.image_id boundary heuristic, smart titles
 *   - v2.1: Reverted Μονό/Ζευγάρι split (Skroutz flagged as duplicates)
 *
 * v1.0–v1.6 history retained:
 *   - v1.1: Material phrase in titles ("από Ασήμι 925")
 *   - v1.2: "Χρώμα μετάλλου" option name support
 *   - v1.3: Validator fixes — unique names, category fallback, MPN dedup
 *   - v1.4: Size field fix — comma-separated + One Size fallback
 *   - v1.5: Size dedup
 *   - v1.6: "One Size" restored per Skroutz reviewer
 *
 * Usage:
 *   node skroutz-feed-gr.js                    # Generate feed
 *   node skroutz-feed-gr.js --validate         # Generate and show samples
 *
 * Output: feeds/skroutz-gr.xml
 *
 * Created: 2026-02-09
 * Updated: 2026-05-11 — v3.2: packaging photo demoted from main image
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

function getSkroutzCategory(productType, productTitle) {
  const type = (productType || '').toLowerCase().trim();

  // Exact match first
  if (type && SKROUTZ_CATEGORY_MAP[type]) return SKROUTZ_CATEGORY_MAP[type];

  // Keyword-based match on productType
  if (type) {
    for (const entry of SKROUTZ_CATEGORY_KEYWORDS) {
      const allMatch = entry.keywords.every(kw => type.includes(kw));
      if (allMatch) return entry.category;
    }
  }

  // Fallback: keyword match on product TITLE (catches products with missing/generic productType)
  const title = (productTitle || '').toLowerCase().trim();
  if (title) {
    for (const entry of SKROUTZ_CATEGORY_KEYWORDS) {
      const allMatch = entry.keywords.every(kw => title.includes(kw));
      if (allMatch) return entry.category;
    }
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

// ============================================
// v3.0: LENGTH-AXIS RECOGNITION
// ============================================
// Skroutz spec: bracelets, chains, necklaces must be sent as SEPARATE ENTRIES per
// size/length. Detect option names that represent a length/circumference axis
// (which must NOT be merged into a single entry with size variations).

const LENGTH_AXIS_KEYWORDS = [
  'μήκος',          // Μήκος αλυσίδας → 45cm/60cm/...
  'περίμετρος',     // Περίμετρος καρπού, Περίμετρος λαιμού → 17cm/19cm/...
  'διάλεξε είδος',  // Διάλεξε είδος και μήκος → "Τεχνόδερμα 50cm" combined
  'τύπος κορδονιού',
  'τύπος αλυσίδας',
];

function isLengthAxisName(optionName) {
  if (!optionName) return false;
  const n = optionName.toLowerCase();
  return LENGTH_AXIS_KEYWORDS.some(kw => n.includes(kw));
}

function extractVariantLength(selectedOptions) {
  if (!selectedOptions) return null;
  for (const opt of selectedOptions) {
    if (isLengthAxisName(opt.name)) {
      return { name: opt.name, value: opt.value };
    }
  }
  return null;
}

// Parse a length value into normalized cm/chain-type tokens.
// "45cm" → { length: '45cm', type: null }
// "Τεχνόδερμα 50cm" → { length: '50cm', type: 'Τεχνόδερμα' }
// "Αλυσίδα rolo 60cm" → { length: '60cm', type: 'Αλυσίδα rolo' }
function parseLengthValue(rawValue) {
  if (!rawValue) return { length: null, type: null };
  const v = rawValue.trim();
  const cmMatch = v.match(/(\d{1,3}(?:\.\d+)?)\s*cm/i);
  const length = cmMatch ? `${cmMatch[1]}cm` : null;
  let type = null;
  if (length) {
    // Remove length token and any trailing/leading whitespace+commas to get chain type
    type = v.replace(cmMatch[0], '').trim().replace(/^[,\s-]+|[,\s-]+$/g, '');
    if (!type) type = null;
  } else {
    // No "cm" found — entire value might be a bare label like "Ανοιχτή γάμπα"
    type = v;
  }
  return { length, type };
}

// Μονό/Ζευγάρι detection (extracted from inline code in v2.1)
const PAIR_VALUES = ['ζευγάρι', 'ζεύγος', 'pair'];
const SINGLE_VALUES = ['μονό', 'single'];

function isPairVariant(variant) {
  if (!variant.selectedOptions) return false;
  return variant.selectedOptions.some(opt =>
    PAIR_VALUES.includes((opt.value || '').toLowerCase().trim())
  );
}

function isSingleVariant(variant) {
  if (!variant.selectedOptions) return false;
  return variant.selectedOptions.some(opt =>
    SINGLE_VALUES.includes((opt.value || '').toLowerCase().trim())
  );
}

// ============================================
// v3.0: FILENAME → COLOR MAPPING
// ============================================
// When Shopify variants lack assigned image_id (~44% of catalog), we cannot use
// the v2.0 boundary heuristic. Fall back to filename keyword matching — Shopify
// CDN filenames in EMMANUELA's catalog are remarkably systematic.

const FILENAME_COLOR_PATTERNS = [
  // Ροζ MUST be checked before Χρυσό (roz-epixryswmeno-...)
  { pattern: /(^|[\/_-])roz[-_]/i, color: 'Ροζ' },
  // Gold-plated family
  { pattern: /(^|[\/_-])(epixryswmen|epixrysomen|epixysomen|xryso|xrysa|gold)[-_a]/i, color: 'Χρυσό' },
  // Oxidized → Γκρι (per COLOR_MAP_GREEK)
  { pattern: /(^|[\/_-])(oxeidwmen|oxidomen|anthrak)[-_o]/i, color: 'Γκρι' },
  // Black
  { pattern: /(^|[\/_-])(mayro|mavro|black)[-_a]/i, color: 'Μαύρο' },
  // Silver / default
  { pattern: /(^|[\/_-])(ashmenio|ashmenia|ashmi|silver)[-_a]/i, color: 'Ασημί' },
];

function getColorFromFilename(imageUrl) {
  if (!imageUrl) return null;
  // Extract filename only (path-agnostic)
  const filename = imageUrl.split('/').pop() || '';
  for (const { pattern, color } of FILENAME_COLOR_PATTERNS) {
    if (pattern.test(filename)) return color;
  }
  return null;
}

// Image is "color-neutral" if its filename doesn't suggest any specific color
// (packaging shots, lifestyle, etc.). These are safe to include in any color group.
function isColorNeutralFilename(imageUrl) {
  return getColorFromFilename(imageUrl) === null;
}

// v3.2: Packaging photos (e.g. "925-sterling-silver-jewelry-gift-packaging-...")
// must NEVER be used as the main <image> for a product entry. Skroutz curators
// reject these as "Μη έγκυρη εικόνα προϊόντος". The bug in v3.0/v3.1 was that
// the "silver" keyword in the packaging filename made it match Ασημί color
// filter — so 15 Ασημί variants ended up with the gift-box photo as main.
// These images are still allowed in <additionalimage> (showing nice packaging
// is fine as a secondary shot per Skroutz spec).
const PACKAGING_PATTERN = /(^|[\/_-])(925-sterling-silver-jewelry-gift-packaging|gift[-_]packaging|packaging[-_]emmanuela)/i;

function isPackagingImage(imageUrl) {
  if (!imageUrl) return false;
  const filename = imageUrl.split('/').pop() || '';
  return PACKAGING_PATTERN.test(filename);
}

// Filter images for a specific color group when variant.image_id is unavailable.
// Returns images whose filename matches the target color, plus color-neutral images
// (packaging shots, generic details).
function filterImagesByColorFromFilename(images, targetColor) {
  if (!images || images.length === 0) return [];
  return images.filter(img => {
    const c = getColorFromFilename(img.src);
    return c === targetColor || c === null;
  });
}

// Check if color suffix is redundant with the material phrase
// e.g., "από Επιχρυσωμένο Ασήμι 925" already implies Χρυσό → no need to append "Χρυσό"
const MATERIAL_IMPLIED_COLORS = {
  'από Ασήμι 925': ['Ασημί'],
  'από Επιχρυσωμένο Ασήμι 925': ['Χρυσό'],
  'από Ροζ Επιχρυσωμένο Ασήμι 925': ['Ροζ'],
  // Οξειδωμένο intentionally excluded: both Μαύρο and Γκρι map to it,
  // so suppressing both would create duplicate names within the same product
};

function isColorRedundant(materialPhrase, color) {
  const implied = MATERIAL_IMPLIED_COLORS[materialPhrase];
  return implied ? implied.includes(color) : false;
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

/**
 * Longest common prefix of an array of strings.
 * Used to derive a stable PRODUCT-LEVEL MPN root when variant SKUs share a prefix
 * (e.g. ["4070SS", "4070GS", "4070XS"] → "4070"). Skroutz pattern-matches variant
 * families by MPN root; without a stable root, sibling variants are not linked.
 */
function longestCommonPrefix(strs) {
  if (!strs || strs.length === 0) return '';
  if (strs.length === 1) return strs[0];
  let prefix = strs[0];
  for (let i = 1; i < strs.length; i++) {
    while (strs[i].indexOf(prefix) !== 0) {
      prefix = prefix.substring(0, prefix.length - 1);
      if (prefix === '') return '';
    }
  }
  return prefix;
}

/**
 * Compute a stable, product-level base MPN that is identical for ALL feed entries
 * derived from the same Shopify product (regardless of color/length grouping).
 *
 * Strategy:
 *  1. If ALL variants share a long-enough alphanumeric SKU prefix (≥3 chars after
 *     trimming trailing separators), use that prefix. Example: 4070SS/4070GS/4070XS → "4070".
 *  2. If a stable prefix can't be derived (mixed SKUs, missing SKUs, very short
 *     common prefix), fall back to `EMM-{productId}` — the Shopify PRODUCT id
 *     (NOT the variant id), so all sibling entries still share the same root.
 *
 * This is what enables Skroutz catalog UI cross-link grouping (color swatches /
 * spec variations) for our variant families. Without it, sibling color entries
 * get unrelated MPN roots and Skroutz treats them as independent products.
 */
function computeProductMpnBase(product, variants) {
  const skus = variants.map(v => v.sku).filter(s => s && s.trim().length > 0);
  if (skus.length >= 2) {
    const rawPrefix = longestCommonPrefix(skus).replace(/[-_\s]+$/, '');
    if (rawPrefix.length >= 3 && /^[A-Za-z0-9]+$/.test(rawPrefix)) {
      return rawPrefix;
    }
  } else if (skus.length === 1) {
    // Single-variant product: use the SKU as-is (still product-level since there's one variant)
    return skus[0];
  }
  // No usable SKU prefix — fall back to product-level Shopify ID.
  return `EMM-${product.id}`;
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
    packagingDemoted: 0,  // v3.2: count of entries where packaging photo was demoted from main
    categoryBreakdown: {},
    unmappedTypes: {},
    sampleItems: []
  };

  // v3.1 PRE-PASS: compute candidate MPN base per product and detect collisions.
  // If two DIFFERENT Shopify products would yield the same SKU-derived MPN root
  // (e.g. multiple products with variants sharing SKU prefix "1265"), we cannot
  // safely use that root — Skroutz would see them as a single family and our
  // entries would collide. For colliding roots, fall back to `EMM-{product.id}`
  // (still product-level, but globally unique).
  const baseByProduct = new Map();   // product.id → final MPN base
  const baseCounts = new Map();      // candidate base → Set of product.ids using it
  for (const product of products) {
    const typeLC = (product.product_type || '').toLowerCase();
    if (typeLC.includes('gift card') || typeLC.includes('δωροκάρτα')) continue;
    const candidate = computeProductMpnBase(product, product.variants || []);
    if (!baseCounts.has(candidate)) baseCounts.set(candidate, new Set());
    baseCounts.get(candidate).add(product.id);
  }
  for (const product of products) {
    const typeLC = (product.product_type || '').toLowerCase();
    if (typeLC.includes('gift card') || typeLC.includes('δωροκάρτα')) continue;
    const candidate = computeProductMpnBase(product, product.variants || []);
    const usersOfCandidate = baseCounts.get(candidate);
    if (usersOfCandidate && usersOfCandidate.size > 1) {
      // Collision — multiple Shopify products share this root. Use product.id.
      baseByProduct.set(product.id, `EMM-${product.id}`);
    } else {
      baseByProduct.set(product.id, candidate);
    }
  }
  const collisionCount = [...baseCounts.values()].filter(s => s.size > 1).length;
  if (collisionCount > 0) {
    console.log(`  MPN base collisions detected & resolved: ${collisionCount} root(s) → fell back to EMM-{productId}\n`);
  }

  // Track every MPN we emit so we can disambiguate intra-product collisions
  // (rare case: two Shopify variants of the same product share identical
  // color+length selectedOptions — e.g. Shopify data inconsistency). In that
  // case we append a variant.id suffix to keep MPNs globally unique.
  const seenMpns = new Set();
  let intraProductDupCount = 0;

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
    const categoryPath = getSkroutzCategory(product.product_type, product.title);

    // Track category
    stats.categoryBreakdown[categoryPath] = (stats.categoryBreakdown[categoryPath] || 0) + 1;
    if (categoryPath === DEFAULT_SKROUTZ_CATEGORY && product.product_type) {
      stats.unmappedTypes[product.product_type] = (stats.unmappedTypes[product.product_type] || 0) + 1;
    }

    // Determine if product has size options (rings, etc.)
    const hasSizeOption = variants.some(v => extractVariantSize(v.selectedOptions) !== null);

    // v3.0: Detect if product has a length-axis option (Μήκος αλυσίδας,
    // Περίμετρος καρπού, Διάλεξε είδος και μήκος, Τύπος κορδονιού/αλυσίδας).
    // Per Skroutz spec, bracelets/chains/necklaces with different sizes must be
    // sent as SEPARATE ENTRIES. We split per (color × length) instead of merging.
    const hasLengthAxis = variants.some(v => extractVariantLength(v.selectedOptions) !== null);

    // Μονό/Ζευγάρι: if product has BOTH, only include Μονό (base unit).
    // If product only has Ζευγάρι (no Μονό option), keep it as-is.
    // Αριστερό/Δεξί: merged into same color group (same product, same price).
    const hasSingleOption = variants.some(isSingleVariant);
    const hasPairOption = variants.some(isPairVariant);
    const excludePairs = hasSingleOption && hasPairOption;

    // v3.1: Look up the STABLE product-level base MPN computed in the pre-pass.
    // Previously (v3.0) we used `repVariant.sku || EMM-{variant.id}` inside the
    // group loop, which produced a DIFFERENT MPN root per color group when:
    //   (a) the Shopify owner assigned different SKUs per variant
    //       (e.g. 4070SS / 4070GS / 4070XS for one product), OR
    //   (b) variants had no SKU at all (fallback used variant.id, which is
    //       unique per variant — so each color group got a unique root).
    // This broke Skroutz's catalog variant grouping (color swatches, spec
    // variations UI). Now every entry of the same Shopify product shares the
    // same MPN root, with the color/length suffix discriminating siblings.
    // The pre-pass also resolves collisions where different Shopify products
    // would yield the same SKU-derived root (falls back to EMM-{product.id}).
    const productMpnBase = baseByProduct.get(product.id) || `EMM-${product.id}`;

    const entryGroups = {};

    variants.forEach(variant => {
      stats.totalVariants++;

      if (variant.inventory_quantity <= 0) {
        stats.outOfStock++;
        return;
      }

      // If product has both Μονό and Ζευγάρι, exclude Ζευγάρι variants
      if (excludePairs && isPairVariant(variant)) {
        stats.outOfStock++; // count as excluded
        return;
      }

      stats.inStock++;

      const rawColor = extractVariantColor(variant.selectedOptions);
      const color = getGreekColor(rawColor) || getGreekColor(product.metafields.color) || 'Ασημί';

      // v3.0: When the product has a length axis, include length in the group
      // key so each (color × length) becomes its own feed entry. Otherwise
      // group by color only (existing v2.1 behavior — sizes go in variations).
      let groupKey = color;
      let groupLengthRaw = null;
      let groupLengthParsed = { length: null, type: null };
      if (hasLengthAxis) {
        const lengthOpt = extractVariantLength(variant.selectedOptions);
        if (lengthOpt) {
          groupLengthRaw = lengthOpt.value;
          groupLengthParsed = parseLengthValue(lengthOpt.value);
          groupKey = `${color}|${lengthOpt.value}`;
        }
      }

      if (!entryGroups[groupKey]) {
        entryGroups[groupKey] = {
          color,
          variants: [],
          lengthRaw: groupLengthRaw,
          lengthParsed: groupLengthParsed,
        };
      }
      entryGroups[groupKey].variants.push(variant);
    });

    // Pre-compute image ranges per color group.
    // In Shopify, images are typically ordered by color (e.g., silver shots, then gold shots).
    // Variant-assigned images serve as boundaries — we include adjacent images between boundaries.
    // This captures same-color lifestyle/detail shots without cross-color contamination.
    const allVariantImageIds = new Set();
    for (const group of Object.values(entryGroups)) {
      for (const v of group.variants) {
        if (v.image_id) allVariantImageIds.add(v.image_id);
      }
    }

    // Build sorted list of variant image positions (boundaries)
    const variantImageIndices = [];
    images.forEach((img, idx) => {
      if (allVariantImageIds.has(img.id)) {
        variantImageIndices.push({ id: img.id, idx });
      }
    });
    variantImageIndices.sort((a, b) => a.idx - b.idx);

    // Map each variant image → range of images (from this boundary to the next)
    const imageRangeByVariantImageId = {};
    for (let i = 0; i < variantImageIndices.length; i++) {
      const start = variantImageIndices[i].idx;
      const end = i + 1 < variantImageIndices.length
        ? variantImageIndices[i + 1].idx
        : images.length;
      imageRangeByVariantImageId[variantImageIndices[i].id] = images.slice(start, end);
    }

    // Create 1 entry per group (color × second option)
    for (const [groupKey, group] of Object.entries(entryGroups)) {
      const { color, variants: groupVariants, lengthRaw, lengthParsed } = group;
      const repVariant = groupVariants[0];

      // Images: use variant image boundaries to select same-color images
      const groupImageIds = new Set(
        groupVariants.map(v => v.image_id).filter(Boolean)
      );

      let variantImage;
      let additionalImages;

      if (groupImageIds.size > 0) {
        // Path A: variant.image_id available — use boundary heuristic (v2.0).
        // Collect images from ranges of all variant-assigned images in this group,
        // then filter out any image whose filename indicates a different color
        // (Skroutz spec: "additional images must not show color variations").
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
        // Cross-color filter: drop images whose filename color != entry's color
        // (color-neutral images like packaging shots are kept).
        const filteredColorImages = colorImages.filter(img => {
          const fc = getColorFromFilename(img.src);
          return fc === null || fc === color;
        });
        const finalImages = filteredColorImages.length > 0 ? filteredColorImages : colorImages;
        // v3.2: Demote packaging photos from main <image> selection. They remain
        // eligible as additional images. IMPORTANT: stay within the cross-color-
        // safe finalImages pool — never substitute a different-color photo just
        // to avoid packaging (Skroutz flags color mismatch as "Ασυμφωνία εικόνας").
        // If every option in the safe pool is packaging, packaging is the lesser
        // evil and remains as main (the underlying fix is Manuela uploading real
        // color photos to Shopify).
        const v30PathAChoice = finalImages[0] || null;
        const mainPickPathA = finalImages.find(img => !isPackagingImage(img.src))
          || finalImages[0]
          || null;
        if (v30PathAChoice && isPackagingImage(v30PathAChoice.src)
            && mainPickPathA && !isPackagingImage(mainPickPathA.src)) {
          stats.packagingDemoted++;
        }
        variantImage = mainPickPathA?.src || mainImage;
        additionalImages = finalImages
          .map(img => img.src)
          .filter(src => src !== variantImage)
          .slice(0, 14);
      } else {
        // Path B (v3.0): no variant images — use filename-based color matching.
        // EMMANUELA's CDN filenames consistently start with the Greek-transliterated
        // color (ashmenio-, epixryswmeno-, roz-, mayro-, oxeidwmeno-) so we can
        // reliably pick the right photos for each color entry.
        const matchedImages = filterImagesByColorFromFilename(images, color);
        if (matchedImages.length > 0) {
          // v3.2: Decision ladder restricted to the matched pool (which already
          // excludes other-color photos via filename). Order:
          //   (a) color-specific non-packaging  (the ideal photo)
          //   (b) color-neutral non-packaging   (acceptable lifestyle / detail shot)
          //   (c) any matched image incl. packaging (last resort — gallery has no
          //       valid color photo; Manuela needs to upload one to Shopify)
          // We deliberately do NOT cross over to other-color photos: Skroutz flags
          // wrong-color as "Ασυμφωνία εικόνας με προϊόν" — worse than packaging.
          const v30PathBChoice = matchedImages.find(img => getColorFromFilename(img.src) === color)
            || matchedImages[0];
          const colorSpecificNonPkg = matchedImages.find(img =>
            getColorFromFilename(img.src) === color && !isPackagingImage(img.src));
          const neutralNonPkg = matchedImages.find(img =>
            getColorFromFilename(img.src) === null && !isPackagingImage(img.src));
          const mainPickPathB = colorSpecificNonPkg
            || neutralNonPkg
            || matchedImages[0];
          if (v30PathBChoice && isPackagingImage(v30PathBChoice.src)
              && !isPackagingImage(mainPickPathB.src)) {
            stats.packagingDemoted++;
          }
          variantImage = mainPickPathB.src;
          additionalImages = matchedImages
            .map(img => img.src)
            .filter(src => src !== variantImage)
            .slice(0, 14);
        } else {
          // v3.2: No filename match at all — fall back to first color-neutral
          // non-packaging in the full gallery. If none, accept mainImage even if
          // packaging (cross-color substitution is rejected, same as Path B above).
          const neutralNonPkg = images.find(img =>
            getColorFromFilename(img.src) === null && !isPackagingImage(img.src));
          if (mainImage && isPackagingImage(mainImage) && neutralNonPkg) {
            stats.packagingDemoted++;
          }
          variantImage = neutralNonPkg?.src || mainImage;
          additionalImages = [];
        }
      }

      if (!variantImage) {
        stats.noImage++;
        continue;
      }

      // Price: lowest in-stock price for this group.
      // v3.0 note: when this group represents a single (color × length) bucket,
      // the variants in the group typically share a price, so "min" equals the
      // actual price. Only multi-variant groups (e.g., rings) actually need min.
      const lowestPrice = Math.min(...groupVariants.map(v => parseFloat(v.price)));

      // Total quantity for this group (sum of all variants in the bucket).
      // For length-axis entries this is now per-length, not inflated across lengths.
      const totalQuantity = groupVariants.reduce((sum, v) => sum + Math.max(0, v.inventory_quantity), 0);

      // Weight from representative variant
      const weightGrams = getWeightGrams(repVariant);

      // Build name per Skroutz jewelry spec:
      //   {product.title} [chain_type] [length_cm] [Μονό] {materialPhrase} [color]
      // Skroutz requires: material in title; for chains include length cm; for
      // single-earring/charm cases include disclosure ("Μονό", "η αλυσίδα δεν περιλαμβάνεται").
      const rawColorForMaterial = extractVariantColor(repVariant.selectedOptions);
      const materialPhrase = getMaterialPhrase(rawColorForMaterial);

      let name = product.title;
      const titleExtras = [];

      // v3.0: Append chain type and/or length for length-axis entries.
      // "Τεχνόδερμα 50cm" → "Τεχνόδερμα 50cm"; "45cm" → "45cm"; "Ανοιχτή γάμπα" → "Ανοιχτή γάμπα"
      if (lengthParsed && (lengthParsed.length || lengthParsed.type)) {
        if (lengthParsed.type && lengthParsed.length) {
          titleExtras.push(`${lengthParsed.type} ${lengthParsed.length}`);
        } else if (lengthParsed.length) {
          titleExtras.push(lengthParsed.length);
        } else if (lengthParsed.type) {
          titleExtras.push(lengthParsed.type);
        }
      }

      // v3.0: "Μονό" disclosure when product has both Μονό and Ζευγάρι.
      // We keep only the Μονό variant (v2.1 behavior) but now mark the title so
      // customers don't assume they're buying a pair.
      if (excludePairs) {
        titleExtras.push('Μονό');
      }

      if (titleExtras.length > 0) {
        name = `${name} ${titleExtras.join(' ')}`;
      }

      // Material phrase (always for jewelry — Skroutz requirement)
      if (materialPhrase) {
        name = `${name} ${materialPhrase}`;
      }

      // Color suffix ONLY when not already implied by material phrase
      if (color && !isColorRedundant(materialPhrase, color)) {
        name = `${name} ${color}`;
      }

      // Skroutz limit: max 300 chars
      if (name.length > 300) name = name.substring(0, 297) + '...';

      if (materialPhrase) stats.withMaterial++;

      // MPN — must be unique per feed entry while sharing a STABLE root per
      // Shopify product (so Skroutz can pattern-match siblings as variants of
      // the same family — color swatches, spec variations UI).
      // v3.1: baseMpn comes from `productMpnBase` (computed once above), NOT
      // from repVariant.sku/id. The color and length suffixes (added below)
      // are what discriminate siblings.
      const entryCount = Object.keys(entryGroups).length;
      let mpn = productMpnBase;
      if (entryCount > 1) {
        mpn = `${productMpnBase}-${color}`;
        if (lengthRaw) {
          // Sanitize: replace whitespace with dashes for stable MPN tokens
          const lengthToken = lengthRaw.trim().replace(/\s+/g, '-');
          if (lengthToken) mpn = `${mpn}-${lengthToken}`;
        }
      }

      // Intra-product disambiguation: if we've already emitted this exact MPN,
      // append the variant.id to guarantee global uniqueness. This preserves
      // the family root (same productMpnBase) so Skroutz can still pattern-match,
      // while keeping each entry's MPN unique as required by the feed spec.
      if (seenMpns.has(mpn)) {
        mpn = `${mpn}-${repVariant.id}`;
        intraProductDupCount++;
      }
      seenMpns.add(mpn);

      // EAN/Barcode
      const ean = repVariant.barcode && /^\d{8,13}$/.test(repVariant.barcode.trim())
        ? repVariant.barcode.trim() : null;

      // Description: max 10000 chars, no HTML
      let description = product.description || '';
      if (description.length > 10000) description = description.substring(0, 9997) + '...';

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

      // Size — per Skroutz quality reviewer (Γιάννης, 18/02/2026):
      // - Products with sizes: comma-separated UNIQUE list (e.g., "XS,S,M,L")
      // - Products WITHOUT sizes: <size>One Size</size> (explicit reviewer instruction)
      // Ref: https://developer.skroutz.gr/feedspec/#size
      //
      // v3.0: For length-axis entries (this group represents ONE specific length),
      // emit the length as the size value — no <variations> block needed because
      // each length is already its own <product> entry per Skroutz spec.
      if (hasLengthAxis && lengthParsed && (lengthParsed.length || lengthParsed.type)) {
        const sizeValue = lengthParsed.length || lengthParsed.type;
        item += `        <size>${escapeXml(sizeValue)}</size>\n`;
        stats.withSize++;
      } else if (hasSizeOption) {
        // Collect all available sizes from this color group, DEDUPLICATED
        const allSizes = [...new Set(
          groupVariants
            .map(v => extractVariantSize(v.selectedOptions))
            .filter(Boolean)
        )];

        // Product-level <size> with ALL unique sizes comma-separated
        if (allSizes.length > 0) {
          item += `        <size>${escapeXml(allSizes.join(','))}</size>\n`;
          stats.withSize++;
        } else {
          // hasSizeOption but no sizes extracted → One Size
          item += `        <size>One Size</size>\n`;
          stats.withSize++;
        }

        // Size Variations block (for products with multiple size variants in this color)
        // Ref: https://developer.skroutz.gr/feedspec/#xml-with-size-variations
        const uniqueSizes = allSizes.length;
        if (groupVariants.length > 1 && uniqueSizes > 1) {
          item += `        <variations>\n`;

          for (const v of groupVariants) {
            const size = extractVariantSize(v.selectedOptions);
            if (!size) continue;

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
          stats.withVariations++;
        }
      } else {
        // No size option → "One Size" per Skroutz reviewer explicit instruction
        item += `        <size>One Size</size>\n`;
        stats.withSize++;
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
  console.log('Skroutz.gr Feed Generator v2.0 for EMMANUELA');
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
  console.log(`  Packaging demoted:     ${stats.packagingDemoted}  (v3.2: packaging photos not used as main)`);
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
