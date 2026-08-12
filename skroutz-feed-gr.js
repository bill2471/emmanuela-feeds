/**
 * Skroutz.gr Product Feed Generator v3.0 for EMMANUELA
 *
 * Generates a valid XML product feed per Skroutz.gr specifications.
 * Reference: https://developer.skroutz.gr/el/feedspec/
 * Jewelry-specific: https://partnersupport.skroutz.gr/hc/en-us/articles/15680091365265-Jewelry
 *
 * v3.4 (2026-05-12) — Size field cleanup for length-axis entries:
 *   - SIZE FIELD CORRECTNESS: per Skroutz feedspec, the <size> field is
 *     exclusively for clothing/footwear sizes and ring numbers (48-63 etc.).
 *     It is NOT for jewelry length values (16cm, 50cm, etc.). v3.0 was
 *     emitting "16cm" / "50cm" / "Τεχνόδερμα 50cm" as <size> values for
 *     bracelets/chains/necklaces with length axis. v3.4 emits <size>One
 *     Size</size> for these entries instead.
 *   - LENGTH PRESERVATION: per-length splitting is preserved (each length
 *     remains its own <product> entry per Skroutz Jewelry spec), and the
 *     length is still part of the <name>/title and description. We just
 *     stop misusing the <size> field.
 *   - CHOKER SIZE LABEL CLEANUP: chokers (4063/4064/4065 family) used
 *     non-standard labels like "S / 28-33cm Περίμετρος λαιμού" via the
 *     Shopify "Μέγεθος" option. New cleanSizeLabel() strips everything
 *     after the first " / " or multi-space separator so we emit clean
 *     "S"/"M"/"L". Plain ring numbers (e.g. "53") and standard letters
 *     pass through unchanged.
 *   - RINGS UNCHANGED: products with size option (Μέγεθος/νούμερο) still
 *     emit ring sizes 48-63 in <size> (this is valid per feedspec).
 *   - Voluntary disclosure to Skroutz support 2026-05-12 ticket.
 *
 * v3.3 (2026-05-11) — Filename color regex anchored to start of name:
 *   - REGEX TIGHTENING: anchor all FILENAME_COLOR_PATTERNS to `^` (start of
 *     filename) instead of `(^|[\/_-])` (any separator). This fixes false
 *     color classification of two filename styles:
 *     (a) material-described neutrals like "minimalistiko-tsoker-apo-ashmi-..."
 *         where -ashmi- mid-filename used to claim Ασημί;
 *     (b) packaging photos like "925-sterling-silver-jewelry-gift-packaging-..."
 *         where -silver- mid-filename used to claim Ασημί.
 *   - Effect: product 33034738761763 (Μινιμαλιστικό τσόκερ Ροζ) now correctly
 *     picks one of its 10 material-described neutral photos as main, instead
 *     of the packaging shot. One more product auto-fixed; total stuck-on-
 *     packaging drops from 15 to 14.
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
 * Updated: 2026-05-12 — v3.4: size field cleanup for length-axis entries
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

// v3.5 (2026-05-14): Total title-builder redesign per authoritative spec v2
// (XML-FEED-TITLE-STRUCTURE-SPEC.md). All title construction is now delegated
// to `skroutz-title-builder-v35.js`, which implements:
//  - Canonical 12-position title order per spec §2
//  - 5-finish system S/G/R/O/X (X = Μαύρο/Black Rhodium ≠ Οξειδωμένο/Γκρι)
//  - Greek grammatical agreement (χειροποίητο/η/α, μαύρο/α/η)
//  - Singular vs plural from VARIANT OPTIONS (not Shopify title)
//  - Verbatim motif preservation from Shopify title
//  - "από ασήμι 925" ALWAYS mandatory
//  - Ring size, bracelet length, chain type+length at end as appropriate
//  - Monogram letter injection for letter-bearing pendants
//  - cuff → ear cuff normalization
// See: skroutz-feed/emmanuela-gr/HANDOFF-SESSION-2026-05-14-V35-REDESIGN.md
const { buildSkroutzTitle, buildStructuredAttributes } = require('./skroutz-title-builder-v35');

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
  // ── v4.0 (2026-08-12): ΣΥΝΘΕΤΕΣ ΤΙΜΕΣ ΧΡΩΜΑΤΟΣ ────────────────────────────
  // Το partial-match παρακάτω επιστρέφει το πρώτο κλειδί ΤΟΥ ΛΕΞΙΚΟΥ που
  // περιέχεται στη φράση — όχι την πρώτη λέξη ΤΗΣ ΦΡΑΣΗΣ. Έτσι το
  // «Μαύρο με χρυσό σύρμα» έπαιρνε το χρώμα του ΣΥΡΜΑΤΟΣ (Χρυσό) και το
  // «Ροζ επιχρυσωμένα με μαύρο» το σκίαζε το 'επιχρυσωμένα' (Χρυσό αντί Ροζ).
  // Ο title-builder resolveFinish() σπάει ήδη στο « με » και κρατά το ΜΕΤΑΛΛΟ —
  // εδώ ευθυγραμμίζονται τα δύο αντίγραφα της ίδιας απόφασης.
  // Kill-switch: SKROUTZ_COLOURFIX=off ⇒ byte-identical με πριν.
  const _cfMode = process.env.SKROUTZ_COLOURFIX || 'wide';
  if (_cfMode !== 'off') {
    const _seps = (_cfMode === 'wide' || _cfMode === 'widelong') ? [' - ', ' με '] : [' με '];
    const _keys = _cfMode === 'widelong'
      ? Object.keys(COLOR_MAP_GREEK).sort((a, b) => b.length - a.length)
      : Object.keys(COLOR_MAP_GREEK);
    for (const _s of _seps) {
      const _i = normalized.indexOf(_s);
      if (_i > 0) {
        const _head = normalized.slice(0, _i).trim();
        if (COLOR_MAP_GREEK[_head]) return COLOR_MAP_GREEK[_head];
        for (const _k of _keys) if (_head.includes(_k)) return COLOR_MAP_GREEK[_k];
        break;                       // fail-open: συνεχίζει στη σημερινή λογική
      }
    }
    if (_cfMode === 'widelong') {
      for (const _k of _keys) if (normalized.includes(_k)) return COLOR_MAP_GREEK[_k];
    }
  }
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

// v4.1 (2026-08-12): ΦΙΝΙΡΙΣΜΑ ΑΠΟ ΤΟΝ ΤΙΤΛΟ ΤΟΥ ΠΡΟΪΟΝΤΟΣ — τελευταίο καταφύγιο.
// Χρησιμοποιείται ΜΟΝΟ στην εκπομπή του <color>, ΜΟΝΟ όταν το προϊόν βγάζει ΜΙΑ
// καταχώρηση (οπότε το mpn δεν περιέχει χρώμα ⇒ κανένα soft reset) και ΜΟΝΟ όταν
// το χρώμα ήταν η προεπιλογή 'Ασημί' επειδή δεν υπήρχε ούτε option ούτε metafield.
// ⛔ Τα χρώματα ΠΕΤΡΩΝ δεν είναι χρώμα μετάλλου («με μαύρη πέτρα») — αφαιρούνται.
// ⛔ Το «ασήμι 925» ΔΕΝ είναι σήμα — υπάρχει σε κάθε τίτλο.
const _TF_GEM = /(μαυρ|λευκ|κοκκιν|πρασιν|γαλαζ|μπλε|ροζ|τιρκουαζ|πολυχρωμ)[α-ωa-z]*\s+(πετρ|ζιργκον|ζιρκον|σμαλτ|οπαλ|αχατ|μαργαριταρ|κρυσταλλ|αιματιτ|ονυχ|χαλαζ|ρουμπιν|ζαφειρ)[α-ωa-z]*/g;
function finishFromProductTitle(title) {
  if (!title || process.env.SKROUTZ_TITLEFINISH === 'off') return null;
  const t = String(title).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(_TF_GEM, ' ');
  if (/ροζ\s*επιχρυσ/.test(t)) return 'Ροζ';
  if (/επιχρυσ/.test(t)) return 'Χρυσό';
  if (/οξειδωμ/.test(t)) return 'Γκρι';
  return null;
}

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

// v3.4 (2026-05-12): clean cm descriptors from non-ring size labels.
// EMMANUELA choker variants are labelled "S / 28-33cm Περίμετρος λαιμού" etc.
// The Skroutz <size> field is for clothing/footwear sizes and ring numbers —
// not for centimeter measurements. Strip everything after the first " / " or
// "  " (multi-space) separator so we emit clean "S"/"M"/"L". Plain ring
// numbers like "53" and standard letters like "M" pass through unchanged.
function cleanSizeLabel(rawValue) {
  if (!rawValue) return rawValue;
  const slashIdx = rawValue.indexOf(' / ');
  if (slashIdx > 0) {
    return rawValue.substring(0, slashIdx).trim();
  }
  // Multi-space separator: "S  11"-13" (28-33cm) ..."
  const multiSpaceIdx = rawValue.indexOf('  ');
  if (multiSpaceIdx > 0) {
    const head = rawValue.substring(0, multiSpaceIdx).trim();
    if (head.length <= 5 && /^[A-Za-zΑ-Ωα-ω0-9.\/-]+$/.test(head)) return head;
  }
  return rawValue;
}

function extractVariantSize(selectedOptions) {
  if (!selectedOptions) return null;
  for (const opt of selectedOptions) {
    const name = (opt.name || '').toLowerCase();
    if (name.includes('μέγεθος') || name.includes('size') || name.includes('νούμερο')) {
      return cleanSizeLabel(opt.value);
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

// v3.3: Anchor color keywords at the START of the filename.
//
// The old v3.0 regex `(^|[\/_-])(...)` matched color keywords ANYWHERE in
// the filename preceded by a separator. This caused false classifications:
//
//   "minimalistiko-tsoker-apo-ashmi-925-kosmhmata-...jpg"
//     → matched "-ashmi-" mid-filename → wrongly classified as Ασημί
//     → for the Ροζ variant of product 33034738761763, the actual Ροζ-plated
//        product photos got excluded as "cross-color" because they were
//        labeled Ασημί by this regex, leaving only packaging in the
//        matched pool → main image became packaging-photo.
//
//   "925-sterling-silver-jewelry-gift-packaging-...jpg"
//     → matched "-silver-" mid-filename → classified as Ασημί
//     → 15 Ασημί variants got the packaging as main (compounded by
//        isPackagingImage which v3.2 introduced).
//
// EMMANUELA's CDN convention is `<colorprefix>-<rest>.jpg` for color-specific
// product photos and `<materialword>-925-<rest>.jpg` for material-described
// neutral photos. Anchoring to `^` correctly separates these two cases:
// material-described neutral photos no longer steal color slots, and packaging
// filenames (which don't start with a color word) become neutral.
//
// Also dropped the standalone "ashmi" alternation — it's already covered by
// "ashmenio" (masc.) and "ashmenia" (neuter pl.), the actual word forms used
// in EMMANUELA filenames.
const FILENAME_COLOR_PATTERNS = [
  // Ροζ MUST be checked before Χρυσό (roz-epixryswmeno-...)
  { pattern: /^roz[-_]/i, color: 'Ροζ' },
  // Gold-plated family
  // v3.4 (2026-07-29) — SYMMETRIC Greek noun endings. The v3.3 character classes were
  // inconsistent: gold accepted only the PLURAL (epixryswmenA-) while oxidized accepted
  // only the SINGULAR (oxeidwmenO-) and black only "mayro" (not "mayra"). Every unmatched
  // form fell through to "colour-neutral", and a colour-neutral image is emitted into EVERY
  // colour group — i.e. exactly the "additional images show another colourway" defect
  // Skroutz penalises (ticket #33670445).
  // Measured on the live feed of 2026-07-29: 303 of 2855 jewelry image URLs were wrongly
  // classified neutral (248 Χρυσό, 52 Γκρι, 3 Μαύρο), producing 143 wrong-colour
  // <additionalimage> and 23 wrong-colour MAIN images across 62 entries.
  // Endings accepted: -ο (neut.sg), -α (neut.pl/fem.sg), -η (fem.sg), plus - and _.
  // Verified before deploy: 0 images CHANGE colour — the fix only ADDS attribution.
  // KNOWN CONSEQUENCE, approved by Bill 2026-07-29: the v3.5.1 SAFETY GATE below (which
  // was silently under-firing because of this gap) now correctly drops 23 entries whose
  // MAIN image is of another colourway — per his 2026-05-14 rule "better to not list than
  // to mislead the customer with a wrong-color photo". They return once photographed.
  { pattern: /^(epixryswmen|epixrysomen|epixysomen|xrys|gold)[-_aoh]/i, color: 'Χρυσό' },
  // Oxidized → Γκρι (per COLOR_MAP_GREEK)
  { pattern: /^(oxeidwmen|oxidomen|anthrak)[-_oah]/i, color: 'Γκρι' },
  // Black
  { pattern: /^(mayr|mavr|black)[-_oah]/i, color: 'Μαύρο' },
  // Silver / default — only word forms that actually appear at start of CDN names
  { pattern: /^(ashmeni|ashmen|silver)[-_oah]/i, color: 'Ασημί' },
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

// v3.2: Packaging photos must NEVER be used as the main <image> for a product
// entry. Skroutz curators reject these as "Μη έγκυρη εικόνα προϊόντος". The bug
// in v3.0/v3.1 was that the "silver" keyword in the packaging filename made it
// match the Ασημί color filter, so 15 Ασημί variants ended up with the gift-box
// photo as main. These images are still allowed in <additionalimage> (showing
// nice packaging is fine as a secondary shot per Skroutz spec).
//
// Three distinct packaging filename patterns observed in EMMANUELA's CDN
// (confirmed by `grep -oE '[a-z0-9_-]*packaging[a-z0-9_-]*\.(jpg|png|jpeg)'`):
//   1. 925-sterling-silver-jewelry-gift-packaging-emmanuela-handcrafted.jpg
//      (the main gift-box photo, 15 occurrences as main image in v3.1)
//   2. packaging-photo_<uuid>.jpg
//      (1 occurrence: product 33034738761763 "Μινιμαλιστικό τσόκερ Ροζ")
//   3. emmanuela_925_sterling_silver_packaging_bag_box_cleaning_cloth.jpg
//      (cleaning cloth packaging shot — 0 as main but kept in regex for safety)
const PACKAGING_PATTERN = /(?:925[-_]sterling[-_]silver[-_]jewelry[-_]gift[-_]packaging|gift[-_]packaging|packaging[-_]emmanuela|packaging[-_]photo|emmanuela[-_]925[-_]sterling[-_]silver[-_]packaging)/i;

// 2026-08-04: the SAME gift-box photograph is uploaded under 86 DIFFERENT filenames, and only 3
// of them match the name-based PACKAGING_PATTERN above. The other 83 read like ordinary product
// names ("epixryswmeno-karfitsa-fylla-...jpg") — 68 of the 86 even START with a colour word, so
// getColorFromFilename happily assigns them a colour and they sail through every colour filter.
// Consequence measured on the live feed of 2026-08-04: 89 of them still shipped as
// <additionalimage> across 89 entries, plus 3 as the MAIN image — exactly what Skroutz penalises
// ("οι πρόσθετες εικόνες απεικονίζουν άλλα σχέδια ή αποχρώσεις", ticket #33670445).
//
// Identity must therefore be the SHOT, not the name. The list is produced OFFLINE by
// skroutz-feed/_make-pkglist-0804.js (dHash <= 6 from the named packaging files) so the builder
// only does a Set lookup — no image fetch, no hashing at runtime.
// Threshold is NOT critical: over 3.014 catalogue images there are 11 files at distance 0 and
// 75 at distance 1 and NOTHING AT ALL between 2 and 12.
//
// ⚠ THE LIST IS FROZEN. A gift-box photo uploaded AFTER it was generated is invisible to both
// detectors until someone re-runs _make-pkglist-0804.js. That is why the file carries a
// "generated" date and why it is printed on every run — a stale date is the only warning you get.
// Missing / unreadable / empty list => name-only behaviour, i.e. exactly what shipped before.
let PACKAGING_FILES = new Set();
let PACKAGING_LIST_STAMP = 'not loaded';
if (process.env.SKROUTZ_NO_PKGLIST !== '1') {
  const pkgListPath = path.join(__dirname, 'skroutz-jewelry-packaging.json');
  try {
    const j = JSON.parse(fs.readFileSync(pkgListPath, 'utf8'));
    // tolerant on shape — same idiom the sibling skroutz-shoes-builder.js already uses for its
    // three frozen maps, so provenance can be added later without silently disabling the fix.
    const files = Array.isArray(j) ? j : (j.files || []);
    PACKAGING_FILES = new Set(files);
    PACKAGING_LIST_STAMP = (!Array.isArray(j) && j.generated) ? j.generated : 'undated';
    if (PACKAGING_FILES.size === 0) {
      console.error('  [PKGLIST] WARNING: packaging-shot list is EMPTY — name-only detection (the shot-based fix is INERT).');
    } else {
      console.log(`  [PKGLIST] Packaging-shot list: ${PACKAGING_FILES.size} files, generated ${PACKAGING_LIST_STAMP}`);
    }
  } catch (e) {
    console.error(`  [PKGLIST] WARNING: skroutz-jewelry-packaging.json missing or unreadable (${e.message}) — name-only detection (the shot-based fix is INERT).`);
  }
} else {
  console.error('  [PKGLIST] kill-switch SKROUTZ_NO_PKGLIST=1 — name-only detection.');
}

// 2026-08-05: HUMAN photo-colour labels (Emmanouela, sheet of 2026-08-04 — 106 of 110 cards).
// The 29/07 retraction established that NO per-photo metadata (filename OR altText) is
// reliable; colour-word-less filenames fell through both colour filters as "neutral" and
// leaked into EVERY colourway of their design (89 entries / 399 additionals measured live).
// Attribution for those files now comes from a frozen human-label map:
//   basename -> Greek colour word  = the photo belongs ONLY to that colourway
//   basename -> __NONE__           = the photo does not show the jewel (gift box, prop...):
//                                    treated exactly like packaging — never MAIN, never additional.
// ⚠ THE MAP IS FROZEN (same duty as the packaging list): photos uploaded after its
// "generated" date are invisible to it and keep today's behaviour (fail-open, no ban).
// Missing / unreadable / empty map => the fix is INERT and the feed is byte-identical
// to the pre-patch output.
let JPHOTO_LABELS = new Map();
let JPHOTO_NONE = new Set();
let JPHOTO_STAMP = 'not loaded';
if (process.env.SKROUTZ_NO_JPHOTO !== '1') {
  const jphotoPath = path.join(__dirname, 'jewelry-photocolor.json');
  try {
    const j = JSON.parse(fs.readFileSync(jphotoPath, 'utf8'));
    const obj = (j && typeof j === 'object' && j.labels && typeof j.labels === 'object') ? j.labels : j;
    for (const [f, c] of Object.entries(obj || {})) {
      if (typeof c !== 'string') continue;
      if (c === '__NONE__') JPHOTO_NONE.add(f); else JPHOTO_LABELS.set(f, c);
    }
    JPHOTO_STAMP = (j && j.generated) ? j.generated : 'undated';
    if (JPHOTO_LABELS.size === 0 && JPHOTO_NONE.size === 0) {
      console.error('  [JPHOTO] WARNING: photo-colour label map is EMPTY — label routing is INERT.');
    } else {
      console.log(`  [JPHOTO] Photo-colour labels: ${JPHOTO_LABELS.size} colour + ${JPHOTO_NONE.size} not-jewel, generated ${JPHOTO_STAMP}`);
    }
  } catch (e) {
    console.error(`  [JPHOTO] WARNING: jewelry-photocolor.json missing or unreadable (${e.message}) — label routing is INERT.`);
  }
} else {
  console.error('  [JPHOTO] kill-switch SKROUTZ_NO_JPHOTO=1 — label routing disabled.');
}

// Colour label of a photo, or null. __NONE__ files are NOT returned here — they are
// handled by isPackagingImage below (never main, never additional).
function jphotoColourOf(imageUrl) {
  if (!imageUrl) return null;
  const base = (String(imageUrl).split('/').pop() || '').split('?')[0];
  return JPHOTO_LABELS.get(base) || null;
}

function isPackagingImage(imageUrl) {
  if (!imageUrl) return false;
  const filename = imageUrl.split('/').pop() || '';
  if (PACKAGING_PATTERN.test(filename)) return true;
  const base = filename.split('?')[0];
  if (PACKAGING_FILES.has(base)) return true;
  // 2026-08-05: Emmanouela-confirmed "does not show the jewel" photos — same class.
  return JPHOTO_NONE.has(base);
}

// Filter images for a specific color group when variant.image_id is unavailable.
// Returns images whose filename matches the target color, plus color-neutral images
// (packaging shots, generic details).
function filterImagesByColorFromFilename(images, targetColor) {
  if (!images || images.length === 0) return [];
  return images.filter(img => {
    // 2026-08-05: human label outranks the filename (see jewelry-photocolor.json).
    const lc = jphotoColourOf(img.src);
    if (lc) return lc === targetColor;
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

// 2026-07-23: socket INACTIVITY timeout (env SHOPIFY_SOCKET_TIMEOUT_MS, default 90s).
// Without it a half-open TLS socket leaves the promise below PENDING FOREVER — the generator
// hangs silently and the CI job stalls until the 6h runner limit. This is an IDLE timeout:
// it does NOT cut a slow-but-progressing response. ETIMEDOUT is kept in the message and
// err.code is set so string-matching transient-error classifiers recognise it.
const SOCKET_TIMEOUT_MS = parseInt(process.env.SHOPIFY_SOCKET_TIMEOUT_MS || '90000', 10);

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
    req.setTimeout(SOCKET_TIMEOUT_MS, () => {
      const e = new Error(`Shopify socket timeout (ETIMEDOUT) after ${SOCKET_TIMEOUT_MS}ms`);
      e.code = 'ESOCKETTIMEDOUT';
      req.destroy(e);            // -> emits 'error' -> reject (same path as a network error)
    });
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
    packagingAdditionalDropped: 0,  // 2026-08-03: packaging shots kept out of <additionalimage>
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

    // v3.7 (2026-08-06): SIDE SPLIT — left/right ear as SEPARATE entries.
    // Reported by Emmanouela; measured on the 06/08 feed: 21 titles already say «δεξί» and
    // 27 «αριστερό», with ZERO colliding pairs — Skroutz accepts side-specific listings, but
    // today only ONE side per (colour) bucket is ever emitted while the bucket's quantity is
    // the sum of BOTH sides (+ the pair). A shopper sees «αριστερό αυτί, 27 available» when
    // only 4 left cuffs exist.
    // ⛔ SPLIT ONLY WHEN THE SIDES ARE DIFFERENT MERCHANDISE. Measured: 14 products carry a
    // distinct SKU per side (8027L vs 8027, 8056GRL vs 8056GRR …) — those are genuinely two
    // items. 7 products use ONE SKU for both sides (8006, 8003, 8048, 8017, 8026, 1320,
    // 1303M) — splitting those would emit two entries for the SAME sku, which Skroutz files
    // as «Διπλή εγγραφή» and hides (the «Καλυψώ» failure of 03/08). The disjoint-SKU test
    // below is what separates the two cases; it fails CLOSED (no split when unsure).
    // Kill-switch: SKROUTZ_NO_SIDESPLIT=1 restores the previous grouping.
    const _SIDE_VALUE_RE = /αριστερ|δεξ[ιί]/i;
    // στάδιο-2Α (2026-08-10): ο άξονας μεγέθους του psize πιλότου («Μικρό, μεγάλο ή …»)
    // γίνεται ΚΙ ΑΥΤΟΣ άξονας διαχωρισμού — ΜΟΝΟ για τα whitelisted προϊόντα (καθρέφτης
    // του PSIZE_PILOT_PRODUCTS στον title builder). Kill-switch: SKROUTZ_NO_PSIZE_SPLIT=1.
    const _PSIZE_SPLIT_PRODUCTS = new Set(['4376372379683']); // Κρεμαστό μενταγιόν "κασέτα"
    let _axisFromPsize = false;
    let _sideAxis = null;
    let _sidePrimary = null;
    let _sideValuesWithSku = null;
    if (process.env.SKROUTZ_NO_SIDESPLIT !== '1') {
      const _eligible = variants.filter(v =>
        v.inventory_quantity > 0 && !(excludePairs && isPairVariant(v)));
      const _names = [...new Set(_eligible.flatMap(v => (v.selectedOptions || []).map(o => o.name)))];
      for (const _nm of _names) {
        const _valOf = v => ((v.selectedOptions || []).find(o => o.name === _nm) || {}).value;
        const _vals = [...new Set(_eligible.map(_valOf).filter(Boolean))];
        if (_vals.length < 2) continue;
        const _isPsizeAxis = process.env.SKROUTZ_NO_PSIZE_SPLIT !== '1' &&
          _PSIZE_SPLIT_PRODUCTS.has(String(product.id)) &&
          _nm.toLowerCase().includes('μικρ') && _nm.toLowerCase().includes('μεγάλ');
        if (!_vals.some(x => _SIDE_VALUE_RE.test(x)) && !_isPsizeAxis) continue;
        // Ο έλεγχος γίνεται ΜΟΝΟ πάνω στις τιμές που ΕΧΟΥΝ sku. Οι παραλλαγές «Ζευγάρι»
        // συχνά δεν φέρουν sku· δεν μπορούν να αποδείξουν τίποτα, αλλά δεν πρέπει και να
        // μπλοκάρουν τον διαχωρισμό των δύο πλευρών που ΕΧΟΥΝ ξεχωριστούς κωδικούς.
        const _skusOf = val => new Set(
          _eligible.filter(v => _valOf(v) === val)
            .map(v => (v.sku || '').trim()).filter(Boolean));
        const _withSku0 = _vals.filter(val => _skusOf(val).size > 0);
        // ΠΥΛΗ PYLON (στάδιο-2Α): στον psize άξονα, τιμή με SKU που περιέχει ΚΕΝΟ = πακέτο
        // δύο κωδικών («LU288pe LU325pe»). Παραγγελία του θα έφτανε στο Pylon ως άγνωστο
        // είδος (περιστατικό 04/08) ⇒ ΔΕΝ εκπέμπεται. Αίρεται στο στάδιο-2Β μόνο μετά από
        // ρητό OK του order-aggregator. Στον κλασικό αριστερό/δεξί άξονα: ταυτοτικό φίλτρο.
        const _withSku = _isPsizeAxis
          ? _withSku0.filter(val => [..._skusOf(val)].every(s => !/\s/.test(s)))
          : _withSku0;
        if (_withSku.length < 2) continue;                     // δεν αποδεικνύεται ⇒ ΟΧΙ split
        const _sets = _withSku.map(_skusOf);
        let _disjoint = true;
        for (let i = 0; i < _sets.length && _disjoint; i++) {
          for (let j = i + 1; j < _sets.length; j++) {
            if ([..._sets[i]].some(s => _sets[j].has(s))) { _disjoint = false; break; }
          }
        }
        if (!_disjoint) continue;                              // ίδιο sku σε 2 πλευρές ⇒ ΟΧΙ split
        _sideAxis = _nm;
        _axisFromPsize = _isPsizeAxis;
        // ⛔ Εκπέμπονται ΜΟΝΟ οι τιμές που έχουν sku. Οι παραλλαγές «Ζευγάρι» αυτών των
        // σχεδίων δεν φέρουν κωδικό: αν γίνονταν δική τους καταχώρηση, μια παραγγελία θα
        // επέστρεφε κενό sku και θα κατέληγε «άγνωστο είδος» στο Pylon (το περιστατικό της
        // 04/08). Σήμερα ούτως ή άλλως δεν είναι ξεχωριστά αγοράσιμες — απλώς φούσκωναν το
        // άθροισμα της ομάδας. Ίδια φιλοσοφία με το υπάρχον excludePairs.
        _sideValuesWithSku = new Set(_withSku);
        const _first = _eligible.find(v => _sideValuesWithSku.has(_valOf(v)));
        _sidePrimary = _first ? _valOf(_first) : null;         // η πλευρά που εκπέμπεται ΣΗΜΕΡΑ
        break;
      }
    }

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
      // v4.1: το χρώμα ήταν ΟΝΤΩΣ η προεπιλογή; (ούτε option ούτε metafield)
      const _colorDefaulted = !getGreekColor(rawColor) && !getGreekColor(product.metafields.color);

      // v3.0: When the product has a length axis, include length in the group
      // key so each (color × length) becomes its own feed entry. Otherwise
      // group by color only (existing v2.1 behavior — sizes go in variations).
      let groupKey = color;
      let groupSideRaw = null;
      if (_sideAxis) {
        const _sv = ((variant.selectedOptions || []).find(o => o.name === _sideAxis) || {}).value;
        if (_sv && _sideValuesWithSku && !_sideValuesWithSku.has(_sv)) {
          stats.outOfStock++;                                  // τιμή χωρίς sku ⇒ δεν εκπέμπεται
          return;
        }
        if (_sv) { groupSideRaw = _sv; groupKey = `${color}|side:${_sv}`; }
      }
      let groupLengthRaw = null;
      let groupLengthParsed = { length: null, type: null };
      if (hasLengthAxis) {
        const lengthOpt = extractVariantLength(variant.selectedOptions);
        if (lengthOpt) {
          groupLengthRaw = lengthOpt.value;
          groupLengthParsed = parseLengthValue(lengthOpt.value);
          // στάδιο-2Α: στον psize άξονα το μήκος ΠΡΟΣΤΙΘΕΤΑΙ στο κλειδί (color|side|length) —
          // το παλιό rebuild πετούσε την πλευρά, οπότε προϊόν με ΚΑΙ άξονα μεγέθους ΚΑΙ άξονα
          // μήκους (η κασέτα) δεν θα διαχωριζόταν ποτέ. Εκτός psize: ΑΚΡΙΒΩΣ το παλιό κλειδί.
          groupKey = _axisFromPsize ? `${groupKey}|${lengthOpt.value}` : `${color}|${lengthOpt.value}`;
        }
      }

      if (!entryGroups[groupKey]) {
        entryGroups[groupKey] = {
          color,
          colorDefaulted: _colorDefaulted,   // v4.1
          variants: [],
          lengthRaw: groupLengthRaw,
          lengthParsed: groupLengthParsed,
          sideRaw: groupSideRaw,
          // κλειδί ΧΩΡΙΣ την πλευρά: κρατά το πλήθος καταχωρήσεων όπως ΠΡΙΝ, ώστε το MPN
          // της πλευράς που ήδη ζει στη Skroutz να μείνει ΑΠΑΡΑΛΛΑΚΤΟ (κανένα soft reset).
          oldKey: groupKey.replace(/\|side:[^|]*/, ''),
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

    // v3.9 (2026-08-11): COLOUR-AWARE BOUNDARIES — ποιο χρώμα κάρφωσε κάθε εικόνα.
    // Χρειάζεται για να μη κόβει η φέτα ενός χρώματος πάνω σε pin ΤΟΥ ΙΔΙΟΥ χρώματος.
    const _colourOfPin = new Map();
    for (const _g of Object.values(entryGroups)) {
      for (const _v of _g.variants) {
        if (_v.image_id && !_colourOfPin.has(_v.image_id)) _colourOfPin.set(_v.image_id, _g.color);
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
    const _noCbnd = process.env.SKROUTZ_NO_CBND === '1';
    for (let i = 0; i < variantImageIndices.length; i++) {
      const start = variantImageIndices[i].idx;
      let end = i + 1 < variantImageIndices.length
        ? variantImageIndices[i + 1].idx
        : images.length;
      // v3.9: προχώρα το τέλος πέρα από διαδοχικά pins ΤΟΥ ΙΔΙΟΥ χρώματος — μόνο pin ΑΛΛΟΥ
      // χρώματος κλείνει τη φέτα. Καμία εικόνα άλλης απόχρωσης δεν μπαίνει: το εύρος που
      // προστίθεται ανήκε ήδη στο ίδιο χρώμα, και το colour filter παρακάτω μένει ανέπαφο.
      // Μετρημένο A/B (cache 03/08): +5 καταχωρήσεις περνούν το «≥2 πρόσθετες», διαρροή 0,
      // 0 χαμένες, 0 αλλαγές MPN/τίτλων/κύριας εικόνας.
      if (!_noCbnd) {
        const _mine = _colourOfPin.get(variantImageIndices[i].id);
        let j = i + 1;
        while (j < variantImageIndices.length && _colourOfPin.get(variantImageIndices[j].id) === _mine) j++;
        end = j < variantImageIndices.length ? variantImageIndices[j].idx : images.length;
      }
      imageRangeByVariantImageId[variantImageIndices[i].id] = images.slice(start, end);
    }

    // Create 1 entry per group (color × second option)
    for (const [groupKey, group] of Object.entries(entryGroups)) {
      const { color, variants: groupVariants, lengthRaw, lengthParsed, sideRaw, oldKey } = group;
      const repVariant = groupVariants[0];

      // Images: use variant image boundaries to select same-color images.
      // v3.7 (2026-08-06): when the bucket was split by SIDE, the image pool must stay the
      // pool of the WHOLE colour, not of one side. Left and right are the SAME DESIGN in the
      // SAME colourway — mirrored — so a photo of the left cuff depicts the right one just as
      // truthfully; Skroutz's rule bans images of a different design or a different colourway,
      // which this is not. Without this, splitting halves each entry's photos: measured on the
      // 03/08 cache, 23 entries lost images and 14 fell below the «1 main + 2 additional»
      // threshold — trading an accuracy defect for an exclusion risk, which is exactly the
      // trap the 31/07 sandal measurement warned about.
      const _imagePoolVariants = (sideRaw && oldKey)
        ? Object.values(entryGroups).filter(g => (g.oldKey || '') === oldKey)
            .flatMap(g => g.variants)
        : groupVariants;
      const groupImageIds = new Set(
        _imagePoolVariants.map(v => v.image_id).filter(Boolean)
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
          // 2026-08-05: a human label outranks the filename. A colour-word-less file
          // that Emmanouela labelled for ANOTHER colour no longer passes the
          // fc===null door into this entry; labelled-for-THIS-colour files stay.
          const lc = jphotoColourOf(img.src);
          if (lc) return lc === color;
          const fc = getColorFromFilename(img.src);
          return fc === null || fc === color;
        });
        const finalImages = filteredColorImages.length > 0 ? filteredColorImages : colorImages;
        // v3.3 image-decision ladder for Path A (same structure as Path B):
        //   (1) Pick a non-packaging image from the color-safe pool.
        //   (2) If the safe pool is all packaging (or empty), fall back to
        //       the first non-packaging image in the full product gallery —
        //       even if it's a different color. Cross-color jewelry photo
        //       is closer to the product than a gift-box shot.
        //   (3) Last resort: mainImage even if packaging.
        const finalNonPkg = finalImages.filter(img => !isPackagingImage(img.src));
        const v30PathAChoice = finalImages[0] || null;
        let mainPickPathA;
        if (finalNonPkg.length > 0) {
          mainPickPathA = finalNonPkg[0];
        } else {
          // Safe pool is all packaging — try wider gallery for any jewelry photo
          mainPickPathA = images.find(img => !isPackagingImage(img.src)) || finalImages[0];
        }
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
        // v3.3 image-decision ladder for Path B:
        //   (1) Try to pick a non-packaging image from the matched pool
        //       (target color photos + color-neutral lifestyle/detail shots).
        //   (2) If matched pool has nothing but packaging (or is empty), fall
        //       back to the FIRST non-packaging image in the full gallery —
        //       even if it's a different color. Rationale: a wrong-color
        //       jewelry photo is closer to the product than a gift-box shot.
        //       v3.0 already did this implicitly because the old regex
        //       classified packaging as Ασημί (color-bound), so packaging was
        //       cross-color-filtered out of e.g. Χρυσό variants. The tightened
        //       v3.3 regex correctly makes packaging neutral, so we must
        //       explicitly fall through when matched is packaging-only.
        //   (3) Last resort: mainImage (could be packaging).
        const matchedNonPkg = matchedImages.filter(img => !isPackagingImage(img.src));
        const v30PathBChoice = matchedImages.length > 0
          ? (matchedImages.find(img => getColorFromFilename(img.src) === color) || matchedImages[0])
          : null;

        if (matchedNonPkg.length > 0) {
          // (1) At least one valid non-packaging match in the color-safe pool.
          const colorSpecific = matchedNonPkg.find(img => getColorFromFilename(img.src) === color);
          const mainPickPathB = colorSpecific || matchedNonPkg[0];
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
          // (2) Matched pool is empty or all packaging.
          // Fall back to first non-packaging in full gallery (any color).
          // Better to show wrong-color jewelry than a gift-box shot — Skroutz
          // is more lenient about color mismatch than about invalid images.
          const galleryNonPkg = images.find(img => !isPackagingImage(img.src));
          if (mainImage && isPackagingImage(mainImage) && galleryNonPkg) {
            stats.packagingDemoted++;
          }
          // (3) Last resort: mainImage even if packaging (no non-packaging
          //     image exists anywhere — Manuela needs to upload product
          //     photos to Shopify).
          variantImage = galleryNonPkg?.src || mainImage;
          additionalImages = [];
        }
      }

      if (!variantImage) {
        stats.noImage++;
        continue;
      }

      // v3.5.1 SAFETY GATE: when variant has color variation but the selected main image
      // suggests a DIFFERENT color (filename color word doesn't match group's color), skip
      // this entry entirely. Per Bill 2026-05-14: "better to not list than to mislead the
      // customer with a wrong-color photo." Color-neutral images (lifestyle/generic shots
      // with no color word in filename) pass the check.
      const _hasColorOption = (repVariant.selectedOptions || []).some(o =>
        (o.name || '').toLowerCase().includes('χρώμα'));
      // 2026-08-05: the human label outranks the filename here too — a MAIN image that
      // Emmanouela labelled for another colourway now (correctly) trips the gate.
      const _picturedColor = jphotoColourOf(variantImage) || getColorFromFilename(variantImage);
      if (_hasColorOption && _picturedColor && _picturedColor !== color) {
        stats.skippedColorMismatch = (stats.skippedColorMismatch || 0) + 1;
        continue;
      }

      // Price: lowest in-stock price for this group.
      // v3.0 note: when this group represents a single (color × length) bucket,
      // the variants in the group typically share a price, so "min" equals the
      // actual price. Only multi-variant groups (e.g., rings) actually need min.
      const lowestPrice = Math.min(...groupVariants.map(v => parseFloat(v.price)));

      // Quantity for this entry.
      // v3.6 (2026-08-06): the number must describe THE ENTRY, not the bucket.
      // When this entry emits a <variations> block, every size carries its own <quantity>
      // and the product-level total is the documented Skroutz semantics — kept as the sum.
      // When it does NOT (1180 of 1285 jewelry entries on 06/08), every non-representative
      // variant of the bucket is INVISIBLE to the shopper — a different monogram letter, a
      // different stone, small-vs-large, or a same-SKU mirror — yet its units were being
      // added into the advertised number. The «κασέτα» pendant Emmanouela reported showed
      // 13 = 4 small + 4 large + 5 bundle on nine entries, of which only the small could
      // ever be bought. A variant with inventory <= 0 is already dropped at the top of the
      // loop, so the representative always carries >= 1 and no entry can fall to zero.
      // Kill-switch: SKROUTZ_NO_REPQTY=1 restores the previous (sum) behaviour.
      const _bucketSizes = [...new Set(
        groupVariants.map(v => extractVariantSize(v.selectedOptions)).filter(Boolean)
      )];
      const _emitsVariations = groupVariants.length > 1 && _bucketSizes.length > 1;
      const totalQuantity = (_emitsVariations || process.env.SKROUTZ_NO_REPQTY === '1')
        ? groupVariants.reduce((sum, v) => sum + Math.max(0, v.inventory_quantity), 0)
        : Math.max(0, repVariant.inventory_quantity);

      // Weight from representative variant
      const weightGrams = getWeightGrams(repVariant);

      // v3.5 (2026-05-14): Title construction delegated to skroutz-title-builder-v35.js
      // which implements the authoritative spec v2. The builder handles type detection,
      // gender, motif extraction, color/finish, ring/chain/bracelet sizing, grammar,
      // and all the cleanup rules. See top of file for spec link.
      const skroutzCategory = categoryPath; // already computed above (Greek path)
      const name = buildSkroutzTitle({
        product,
        variant: repVariant,
        skroutzCategory,
      });

      // Track stat for "has material" — v3.5 always emits "από ασήμι 925" so always true
      const materialPhrase = 'από ασήμι 925'; // sentinel for downstream code that may check
      stats.withMaterial++;

      // MPN — must be unique per feed entry while sharing a STABLE root per
      // Shopify product (so Skroutz can pattern-match siblings as variants of
      // the same family — color swatches, spec variations UI).
      // v3.1: baseMpn comes from `productMpnBase` (computed once above), NOT
      // from repVariant.sku/id. The color and length suffixes (added below)
      // are what discriminate siblings.
      // Πλήθος καταχωρήσεων ΑΓΝΟΩΝΤΑΣ τον διαχωρισμό πλευράς: έτσι ένα προϊόν που ΠΡΙΝ
      // έβγαζε 1 καταχώρηση (χωρίς επίθεμα χρώματος) δεν αποκτά ξαφνικά επίθεμα.
      const entryCount = new Set(Object.values(entryGroups).map(g => g.oldKey || '')).size;
      let mpn = productMpnBase;
      if (entryCount > 1) {
        mpn = `${productMpnBase}-${color}`;
        if (lengthRaw) {
          // Sanitize: replace whitespace with dashes for stable MPN tokens
          const lengthToken = lengthRaw.trim().replace(/\s+/g, '-');
          if (lengthToken) mpn = `${mpn}-${lengthToken}`;
        }
      }
      // Η πλευρά που ήδη εκπέμπεται σήμερα κρατά ΤΟ ΙΔΙΟ MPN· μόνο η ΝΕΑ πλευρά παίρνει
      // επίθεμα ⇒ καμία υπάρχουσα καταχώρηση δεν αλλάζει ταυτότητα στη Skroutz.
      if (sideRaw && _sidePrimary && sideRaw !== _sidePrimary) {
        const sideToken = sideRaw.trim().replace(/\s+/g, '-');
        if (sideToken) mpn = `${mpn}-${sideToken}`;
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
      // 2026-08-03: the PACKAGING shot must not ship as an <additionalimage>. Skroutz stated the
      // rule twice on ticket #33670445 (24/07, refined 31/07): every additional image must show
      // THE PRODUCT, in a DIFFERENT VIEW of that colourway. The gift-bag/box/cleaning-cloth photo
      // contains no jewellery at all — visually confirmed on all 3 distinct files that match.
      // Scale of the violation on the live feed of 2026-08-03: ONE file appeared 777 times, ~50x
      // more than any other image in the whole feed, across 785 of 1355 jewelry entries.
      // The v3.2 note above ("still allowed in <additionalimage>") was written BEFORE that rule
      // existed and is what this supersedes.
      // Measured cost, live feed: 785 images removed · 41 entries drop 2+ -> 1 · 23 drop 1 -> 0.
      // This filter runs only on the additional list, so it cannot change the MAIN image.
      // ⚠ CORRECTED 2026-08-04: the original note here said the MAIN image "was already never
      // packaging — measured 0 of 1694 entries". That was a measurement of the NAME detector,
      // not of reality: with shot-based identity, 3 of 1356 jewelry entries were serving the
      // gift-box photo AS THEIR MAIN IMAGE. They are handled by the main-picking ladder above
      // (which calls isPackagingImage), not here.
      const emittedAdditional = additionalImages.filter(src => !isPackagingImage(src));
      stats.packagingAdditionalDropped += additionalImages.length - emittedAdditional.length;
      for (const addImg of emittedAdditional) {
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
      // v4.2 (2026-08-12): η πύλη entryCount===1 ΑΦΑΙΡΕΘΗΚΕ. Ιχνηλατήθηκε ότι το mpn
      // (γρ. ~1453) διαβάζει `color`, ΟΧΙ `_emitColor` — άρα η διόρθωση του εκπεμπόμενου
      // <color> ΔΕΝ αγγίζει το mpn σε καμία περίπτωση ⇒ κανένα soft reset, ούτε με
      // entryCount > 1. Μετρημένος αντίκτυπος: 4 καταχωρήσεις / 2 προϊόντα (5036G επιχρυσωμένο
      // ως «Ασημί», 7031MO οξειδωμένο ως «Ασημί»). Τα 1101 και 2124M τα κάλυψε ήδη η v4.1.
      const _emitColor = group.colorDefaulted
        ? (finishFromProductTitle(product.title) || color)
        : color;
      item += `        <color>${escapeXml(_emitColor)}</color>\n`;
      stats.withColor++;

      // Size — per Skroutz quality reviewer (Γιάννης, 18/02/2026):
      // - Products with sizes: comma-separated UNIQUE list (e.g., "XS,S,M,L")
      // - Products WITHOUT sizes: <size>One Size</size> (explicit reviewer instruction)
      // Ref: https://developer.skroutz.gr/feedspec/#size
      //
      // v3.4 (2026-05-12): For length-axis entries (bracelets/chains/necklaces
      // with Μήκος/Περίμετρος/Τύπος κορδονιού), emit <size>One Size</size>.
      // The <size> field is exclusively for clothing/footwear sizes and ring
      // numbers per Skroutz feedspec — NOT for jewelry length values like
      // "16cm" or "Τεχνόδερμα 50cm". The length information remains in the
      // <name>/title and description, and per-length splitting (one <product>
      // entry per length) is preserved per the Skroutz Jewelry spec.
      // Voluntary disclosure to Skroutz support 2026-05-12.
      if (hasLengthAxis && lengthParsed && (lengthParsed.length || lengthParsed.type)) {
        item += `        <size>One Size</size>\n`;
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

      // Description — v3.5.5: prepend structured-attribute block per Skroutz
      // catalog engine guidance (2026-05-15 support reply). Skroutz feedspec
      // doesn't expose dedicated tags for jewelry attributes (material/plating/
      // pieces/gender), so cluster engine parses these from description text.
      const structuredBlock = buildStructuredAttributes({
        product, variant: repVariant, skroutzCategory,
      });
      let fullDescription = description ? `${structuredBlock}\n\n${description}` : structuredBlock;
      // Hard cap at 10,000 chars per feedspec (truncate the long-tail of the body, not the structured top)
      if (fullDescription.length > 10000) fullDescription = fullDescription.substring(0, 9997) + '...';
      item += `        <description><![CDATA[${fullDescription}]]></description>\n`;
      stats.withDescription++;

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

  // ============================================================
  // COMBINED FEED - merge SANDAL entries (store emmanuela-shoes) into the SAME
  // <mywebstore><products> as the jewelry. Per George/Skroutz 08/06: one account
  // (29632), one feed for jewelry + footwear. Sandal price/tier = FROZEN
  // (skroutz-shoes-pricing.json), stock = LIVE. The builder is throttle-resilient
  // and THROWS on a partial shoes pull - on ANY failure we keep the JEWELRY-only
  // feed (a shoes-store hiccup must never break the jewelry feed, and we never
  // ship a sandal-less feed that looks complete).
  // ============================================================
  let sandalMerged = 0;
  try {
    const { buildSandalItems } = require('./skroutz-shoes-builder');
    const { items: sandalItems, stats: sStats } = await buildSandalItems();
    if (sandalItems && sandalItems.length) {
      const marker = '\n  </products>\n</mywebstore>';
      if (xml.includes(marker)) {
        xml = xml.replace(marker, '\n' + sandalItems.join('\n') + marker);
        sandalMerged = sandalItems.length;
        console.log(`\n  + Merged ${sandalMerged} SANDAL entries (SLASH ${sStats.slash} / KEEP ${sStats.keep}, ${sStats.variations} variations, ${sStats.units} units, unmatched ${sStats.unmatched}).`);
      } else {
        console.error('  WARNING: </products> marker not found - wrote JEWELRY-ONLY.');
      }
    } else {
      console.error('  WARNING: sandal builder returned 0 items - wrote JEWELRY-ONLY.');
    }
  } catch (e) {
    console.error(`  WARNING: SANDAL merge skipped - JEWELRY feed unaffected: ${e.message}`);
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
  // 2026-08-04: this counter existed since v3.5.1 but was never printed, so the only cost
  // channel of the packaging fix was invisible. A jump here after a deploy is the signal.
  console.log(`  Colour mismatch (skip):${stats.skippedColorMismatch || 0}`);
  console.log(`  Gift cards (skip):     ${stats.skippedGiftCards}`);
  console.log(`  Feed entries:          ${stats.feedEntries}`);
  console.log(`  With material phrase:   ${stats.withMaterial}`);
  console.log(`  Packaging demoted:     ${stats.packagingDemoted}  (v3.2: packaging photos not used as main)`);
  console.log(`  Packaging additionals dropped: ${stats.packagingAdditionalDropped}  (2026-08-03: a gift-box shot is not a product view)`);
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
