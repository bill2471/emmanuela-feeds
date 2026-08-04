/**
 * BestPrice.gr Product Feed Generator v3.0 for EMMANUELA
 *
 * Generates a valid XML product feed per BestPrice.gr specifications (v2.0.12).
 *
 * Key features:
 *   - ALL active products via Shopify GraphQL API
 *   - Creates separate <product> per color × secondOption — as required by BestPrice
 *   - Skips out-of-stock variants
 *   - Full Greek category paths (Κοσμήματα->Δαχτυλίδια->...)
 *   - Greek color mapping from variant options
 *   - Size aggregation for rings
 *   - productId = Shopify Variant ID (stable identifier)
 *
 * v3.0 changes (2026-05-14): Title generation rebuilt on Skroutz spec v2
 *   - Reuses skroutz-title-builder-v35 (v3.5.2) for canonical title generation
 *   - Adds "από ασήμι 925" + "χειροποίητο/η/α" hard rules (per Skroutz spec §2.8, §2.11)
 *   - Greek finish prefixes (επιχρυσωμένο/ροζ επιχρυσωμένο/οξειδωμένο/μαύρο)
 *   - σταυρός→Μενταγιόν routing, Σετ κοσμημάτων multi-type detection
 *   - Body cleanup, monogram Greek glyph, no em-dashes, cord vs chain detection
 *   - Strips variant-specific suffixes (chain length, ring size, bracelet length)
 *     because BestPrice entry represents a color-group, not a single variant
 *
 * v2.0 (2026-03-20):
 *   - Μονό/Ζευγάρι split: separate entries per color × second option (correct prices)
 *   - Color-correct images: variant boundary heuristic (no cross-color contamination)
 *
 * Usage:
 *   node bestprice-feed-gr.js                    # Generate feed
 *   node bestprice-feed-gr.js --validate         # Generate and show sample
 *
 * Output: feeds/bestprice-gr.xml
 *
 * Created: 2026-02-06
 * Updated: 2026-05-14 — v3.0: Skroutz title-builder integration
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const { buildSkroutzTitle } = require('./skroutz-title-builder-v35');

// ============================================
// BESTPRICE TITLE BUILDER (v3.0)
// ============================================
//
// Reuses Skroutz title-builder for canonical title generation, then strips
// variant-specific suffixes that don't apply to BestPrice color-grouped entries:
//   - chain info (αλυσίδα/κορδόνι <type> <N>cm) — BestPrice entry covers all chain options
//   - ring size (μέγεθος N) — BestPrice <size> field aggregates all sizes
//   - bracelet length (Ncm at end) — BestPrice <size> field handles this
// KEEPS:
//   - Single/pair (Σκουλαρίκι vs Σκουλαρίκια) — affects type word
//   - Side (αριστερό αυτί / δεξί αυτί) — BestPrice splits left/right as separate entries
//   - Finish prefix (επιχρυσωμένο/ροζ επιχρυσωμένο/οξειδωμένο/μαύρο)
//
// Detect Shopify products that are physically multi-piece sets ("Σετ από N <item>").
// Skroutz title-builder strips this prefix (Skroutz marketplace removes quantity disclosures
// anyway). BestPrice is price-comparison — quantity info MUST be preserved or customers
// see a single-item title but receive a multi-piece set (price/expectation mismatch).
function detectSetQuantity(product) {
  const t = (product.title || '').trim();
  const h = (product.handle || '').toLowerCase();
  // Pattern 1: title starts with "Σετ από N" where N = digit or Greek number word
  let m = t.match(/^Σετ\s+από\s+(\d+|δύο|τρία|τέσσερα|πέντε|έξι)\b/i);
  if (m) return m[1];
  // Pattern 2: title starts with "Δύο/Τρία/Τέσσερα..." as standalone quantity prefix
  // (lowercase the Greek number word for mid-sentence use)
  m = t.match(/^(Δύο|Τρία|Τέσσερα|Πέντε|Έξι)\s/i);
  if (m) return m[1].toLowerCase();
  // Pattern 3: handle starts with "N-" (e.g. "3-andrika-skoularikia-krikoi")
  m = h.match(/^(\d+)-/);
  if (m) return m[1];
  return null;
}

function buildBestPriceTitle({ product, variant, categoryPath }) {
  let title = buildSkroutzTitle({ product, variant, skroutzCategory: categoryPath });
  if (!title) return title;
  // Strip trailing variant-specific suffixes that come AFTER "ασήμι 925" disclosure.
  // JS \b is not Unicode-aware for Greek, so we use Unicode lookahead.
  // Apply repeatedly until stable in case of nested patterns.
  let prev;
  do {
    prev = title;
    // Chain/cord info added by Skroutz builder ALWAYS comes after "ασήμι 925":
    // "...ασήμι 925 αλυσίδα ρολό 50cm" | "...ασήμι 925 κορδόνι τεχνόδερμα 40cm" | "...ασήμι 925 αλυσίδα"
    title = title.replace(/(ασήμι\s+925)\s+(?:αλυσίδα|κορδόνι)(?![\p{L}\p{N}])(?:\s+[\p{L}\p{N}]+)*\s*$/iu, '$1');
    // Ring size: "...ασήμι 925 μέγεθος N"
    title = title.replace(/(ασήμι\s+925)\s+μέγεθος\s+\S+(?:\s+\S+)?\s*$/iu, '$1');
    // Bracelet length: "...ασήμι 925 17cm" or "...ασήμι 925 16-18cm"
    title = title.replace(/(ασήμι\s+925)\s+\d+(?:[-–]\d+)?cm\s*$/iu, '$1');
  } while (title !== prev);
  // v3.0 fix #1: re-add "Σετ από N" prefix for multi-piece sets (Skroutz strips this).
  // Also inflect the leading type word + adjectives from singular to plural for grammatical
  // agreement with "Σετ από N <plural>".
  const setN = detectSetQuantity(product);
  if (setN) {
    title = applySetInflection(title, setN);
  }
  return title.replace(/\s+/g, ' ').trim();
}

// Inflect a singular-jewelry title to plural form when prepending "Σετ από N".
// Maps leading type substantive + agreement-bearing adjectives (χειροποίητο, ανδρικό, μαύρο).
// Keeps invariant types unchanged (Μενταγιόν, Κολιέ, Τσόκερ are indeclinable in MG plural).
const SET_INFLECTION_TYPES = {
  'δαχτυλίδι': { plural: 'δαχτυλίδια', adj: { 'χειροποίητο': 'χειροποίητα', 'ανδρικό': 'ανδρικά', 'γυναικείο': 'γυναικεία', 'μαύρο': 'μαύρα' }},
  'βραχιόλι':  { plural: 'βραχιόλια',  adj: { 'χειροποίητο': 'χειροποίητα', 'ανδρικό': 'ανδρικά', 'μαύρο': 'μαύρα' }},
  'σκουλαρίκι':{ plural: 'σκουλαρίκια',adj: { 'χειροποίητο': 'χειροποίητα', 'ανδρικό': 'ανδρικά', 'μαύρο': 'μαύρα' }},
  'καρφίτσα':  { plural: 'καρφίτσες',  adj: { 'χειροποίητη': 'χειροποίητες', 'μαύρη': 'μαύρες' }},
};

function applySetInflection(title, setN) {
  // v3.1 fix (2026-07-30): do NOT prepend when the prefix is ALREADY there.
  // The v3.0 logic above was written on the premise — stated verbatim in detectSetQuantity's
  // comment — that "Skroutz title-builder strips this prefix". That premise DIED on 2026-07-24:
  // skroutz-title-builder-v35 v3.5.7 deliberately RESTORED it ("a QUANTITY SET must say so in
  // the TITLE", shared module line ~890) and emits `Σετ από N` as parts[0] with a plural head
  // word. Since then both layers prepend, producing "Σετ από 3 σετ από 3 δαχτυλίδια μπίλιες" —
  // 24 live entries across 9 products, measured on the live feed 2026-07-30.
  // We KEEP BestPrice's broader detection (it also fires on a "Δύο…" title and on a handle that
  // starts with "N-", which the shared builder does not cover) and only stop double-writing.
  // If a prefix is present it already carries the quantity, so returning it unchanged cannot
  // lose information.
  if (/^Σετ\s+από\s+(?:\d+|δύο|τρία|τέσσερα|πέντε|έξι)\b/iu.test(title.trim())) {
    return title.trim();
  }
  let lower = title.charAt(0).toLowerCase() + title.slice(1);
  for (const [sg, { plural, adj }] of Object.entries(SET_INFLECTION_TYPES)) {
    if (lower.startsWith(sg + ' ')) {
      let result = plural + lower.slice(sg.length);
      for (const [from, to] of Object.entries(adj)) {
        result = result.replace(new RegExp(`(?<![\\p{L}\\p{N}])${from}(?![\\p{L}\\p{N}])`, 'gu'), to);
      }
      return `Σετ από ${setN} ${result}`;
    }
  }
  // Indeclinable or unmatched type — just prepend without inflection
  return `Σετ από ${setN} ${lower}`;
}

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
// BESTPRICE CATEGORY PATH MAPPING
// ============================================

// Exact match: Shopify productType (lowercase) → BestPrice category_path
const BESTPRICE_CATEGORY_MAP = {
  // Women's
  'γυναικεία δαχτυλίδια':              'Κοσμήματα->Δαχτυλίδια->Γυναικεία δαχτυλίδια',
  'γυναικεία σκουλαρίκια':             'Κοσμήματα->Σκουλαρίκια->Γυναικεία σκουλαρίκια',
  'γυναικεία κρεμαστά σκουλαρίκια':    'Κοσμήματα->Σκουλαρίκια->Γυναικεία σκουλαρίκια',
  'γυναικεία καρφωτά σκουλαρίκια':     'Κοσμήματα->Σκουλαρίκια->Γυναικεία σκουλαρίκια',
  'γυναικεία σκουλαρίκια κρίκοι':      'Κοσμήματα->Σκουλαρίκια->Γυναικεία σκουλαρίκια',
  'γυναικεία σκουλαρίκια ear cuff':    'Κοσμήματα->Σκουλαρίκια->Γυναικεία σκουλαρίκια',
  'γυναικεία σκουλαρίκια ear climber': 'Κοσμήματα->Σκουλαρίκια->Γυναικεία σκουλαρίκια',
  'γυναικεία σκουλαρίκια ear jacket':  'Κοσμήματα->Σκουλαρίκια->Γυναικεία σκουλαρίκια',
  'γυναικεία σκουλαρίκια μύτης':       'Κοσμήματα->Σκουλαρίκια->Γυναικεία σκουλαρίκια',
  'γυναικεία βραχιόλια':               'Κοσμήματα->Βραχιόλια->Γυναικεία βραχιόλια',
  'γυναικεία κολιέ':                   'Κοσμήματα->Κολιέ->Γυναικεία κολιέ',
  'γυναικεία μενταγιόν':               'Κοσμήματα->Μενταγιόν->Γυναικεία μενταγιόν',
  'γυναικείες αλυσίδες':               'Κοσμήματα->Αλυσίδες->Γυναικείες αλυσίδες',
  'καρφίτσες':                         'Κοσμήματα->Καρφίτσες',
  'γυναικεία σύνολα κοσμημάτων':       'Κοσμήματα->Σετ κοσμημάτων',
  // Men's
  'ανδρικά δαχτυλίδια':               'Κοσμήματα->Δαχτυλίδια->Ανδρικά δαχτυλίδια',
  'ανδρικά σκουλαρίκια':              'Κοσμήματα->Σκουλαρίκια->Ανδρικά σκουλαρίκια',
  'ανδρικά σκουλαρίκια ear cuff':     'Κοσμήματα->Σκουλαρίκια->Ανδρικά σκουλαρίκια',
  'ανδρικά καρφωτά σκουλαρίκια':      'Κοσμήματα->Σκουλαρίκια->Ανδρικά σκουλαρίκια',
  'ανδρικά σκουλαρίκια κρίκοι':       'Κοσμήματα->Σκουλαρίκια->Ανδρικά σκουλαρίκια',
  'ανδρικά σκουλαρίκια ear climber':  'Κοσμήματα->Σκουλαρίκια->Ανδρικά σκουλαρίκια',
  'ανδρικά σκουλαρίκια ear jacket':   'Κοσμήματα->Σκουλαρίκια->Ανδρικά σκουλαρίκια',
  'ανδρικά βραχιόλια':                'Κοσμήματα->Βραχιόλια->Ανδρικά βραχιόλια',
  'ανδρικά κολιέ':                    'Κοσμήματα->Κολιέ->Ανδρικά κολιέ',
  'ανδρικά μενταγιόν':                'Κοσμήματα->Μενταγιόν->Ανδρικά μενταγιόν',
  'ανδρικές αλυσίδες':                'Κοσμήματα->Αλυσίδες->Ανδρικές αλυσίδες',
  // Generic
  'στέφανα γάμου':                    'Κοσμήματα->Στέφανα γάμου',
};

// Keyword-based fallback (order matters: more specific first)
const BESTPRICE_CATEGORY_KEYWORDS = [
  // Women's
  { keywords: ['γυναικεί', 'δαχτυλίδ'],   category: 'Κοσμήματα->Δαχτυλίδια->Γυναικεία δαχτυλίδια' },
  { keywords: ['γυναικεί', 'σκουλαρίκ'],  category: 'Κοσμήματα->Σκουλαρίκια->Γυναικεία σκουλαρίκια' },
  { keywords: ['γυναικεί', 'βραχιόλ'],    category: 'Κοσμήματα->Βραχιόλια->Γυναικεία βραχιόλια' },
  { keywords: ['γυναικεί', 'κολιέ'],      category: 'Κοσμήματα->Κολιέ->Γυναικεία κολιέ' },
  { keywords: ['γυναικεί', 'μενταγιόν'],  category: 'Κοσμήματα->Μενταγιόν->Γυναικεία μενταγιόν' },
  { keywords: ['γυναικεί', 'αλυσίδ'],     category: 'Κοσμήματα->Αλυσίδες->Γυναικείες αλυσίδες' },
  { keywords: ['γυναικεί', 'σετ'],        category: 'Κοσμήματα->Σετ κοσμημάτων' },
  { keywords: ['καρφίτσ'],                 category: 'Κοσμήματα->Καρφίτσες' },
  // Men's
  { keywords: ['ανδρικ', 'δαχτυλίδ'],     category: 'Κοσμήματα->Δαχτυλίδια->Ανδρικά δαχτυλίδια' },
  { keywords: ['ανδρικ', 'σκουλαρίκ'],    category: 'Κοσμήματα->Σκουλαρίκια->Ανδρικά σκουλαρίκια' },
  { keywords: ['ανδρικ', 'βραχιόλ'],      category: 'Κοσμήματα->Βραχιόλια->Ανδρικά βραχιόλια' },
  { keywords: ['ανδρικ', 'κολιέ'],        category: 'Κοσμήματα->Κολιέ->Ανδρικά κολιέ' },
  { keywords: ['ανδρικ', 'μενταγιόν'],    category: 'Κοσμήματα->Μενταγιόν->Ανδρικά μενταγιόν' },
  { keywords: ['ανδρικ', 'αλυσίδ'],       category: 'Κοσμήματα->Αλυσίδες->Ανδρικές αλυσίδες' },
  // Generic fallbacks
  { keywords: ['στέφαν'],                  category: 'Κοσμήματα->Στέφανα γάμου' },
  { keywords: ['δαχτυλίδ'],               category: 'Κοσμήματα->Δαχτυλίδια->Γυναικεία δαχτυλίδια' },
  { keywords: ['σκουλαρίκ'],              category: 'Κοσμήματα->Σκουλαρίκια->Γυναικεία σκουλαρίκια' },
  { keywords: ['βραχιόλ'],                category: 'Κοσμήματα->Βραχιόλια->Γυναικεία βραχιόλια' },
  { keywords: ['κολιέ'],                  category: 'Κοσμήματα->Κολιέ->Γυναικεία κολιέ' },
  { keywords: ['μενταγιόν'],              category: 'Κοσμήματα->Μενταγιόν->Γυναικεία μενταγιόν' },
  { keywords: ['αλυσίδ'],                 category: 'Κοσμήματα->Αλυσίδες->Γυναικείες αλυσίδες' },
  { keywords: ['σετ'],                    category: 'Κοσμήματα->Σετ κοσμημάτων' },
];

const DEFAULT_BESTPRICE_CATEGORY = 'Κοσμήματα';

function getBestPriceCategory(productType) {
  if (!productType) return DEFAULT_BESTPRICE_CATEGORY;
  const type = productType.toLowerCase().trim();

  // Exact match first
  if (BESTPRICE_CATEGORY_MAP[type]) return BESTPRICE_CATEGORY_MAP[type];

  // Keyword-based match
  for (const entry of BESTPRICE_CATEGORY_KEYWORDS) {
    const allMatch = entry.keywords.every(kw => type.includes(kw));
    if (allMatch) return entry.category;
  }

  return DEFAULT_BESTPRICE_CATEGORY;
}

// ============================================
// COLOR MAPPING (Greek variant names → Greek color for BestPrice)
// ============================================

const COLOR_MAP_GREEK = {
  'ασημένιο': 'ασημί', 'ασημένια': 'ασημί', 'ασημένιος': 'ασημί', 'ασημί': 'ασημί',
  'επιχρυσωμένο': 'χρυσό', 'επιχρυσωμένα': 'χρυσό', 'επιχρυσωμένος': 'χρυσό',
  'επιχρυσωμένη': 'χρυσό', 'επιχυσωμένο': 'χρυσό',
  // v2.2 — ΣΥΜΜΕΤΡΙΑ ΓΕΝΟΥΣ/ΑΡΙΘΜΟΥ. Ο χάρτης είχε 4 μορφές για το «μαύρ-» και μόνο 2 για το
  // «χρυσ-» ⇒ το «Χρυσά με μαύρο σύρμα» έπεφτε στο τελικό fallback και έβγαινε αυτούσιο.
  // Ίδια κλάση με το ασύμμετρο FILENAME_COLOR_PATTERNS του Skroutz (29/07).
  'χρυσό': 'χρυσό', 'χρυσός': 'χρυσό', 'χρυσά': 'χρυσό', 'χρυσή': 'χρυσό',
  'χρυσές': 'χρυσό', 'χρυσοί': 'χρυσό',
  'μαύρη': 'μαύρο', 'μαύρες': 'μαύρο', 'μαύροι': 'μαύρο',
  'ασημένιες': 'ασημί', 'ασημένιοι': 'ασημί',
  'επιχρυσωμένες': 'χρυσό', 'επιχρυσωμένοι': 'χρυσό',
  'οξειδωμένη': 'γκρι', 'οξειδωμένες': 'γκρι', 'οξειδωμένος': 'γκρι', 'οξειδωμένοι': 'γκρι',
  'λευκή': 'λευκό', 'λευκές': 'λευκό', 'λευκός': 'λευκό', 'λευκοί': 'λευκό',
  'μαύρο': 'μαύρο', 'μαύρα': 'μαύρο', 'μαύρος': 'μαύρο', 'μαύρο ανθρακί': 'μαύρο',
  'οξειδωμένο': 'γκρι', 'οξειδωμένα': 'γκρι', 'ανθρακί': 'γκρι',
  // v2.2.1 (04/08/2026) — Η ΤΕΛΕΥΤΑΙΑ ΑΣΥΜΜΕΤΡΙΑ ΤΟΥ v2.2. Ο χάρτης είχε 'μαύρο ανθρακί'
  // (ενικός) αλλά όχι τον πληθυντικό ⇒ με τον κανόνα «μεγαλύτερο κλειδί πρώτα», το
  // «Μαύρα Ανθρακί» έπεφτε στο 'ανθρακί' (7 χαρ, νικά το 'μαύρα' 5 χαρ) και έβγαινε ΓΚΡΙ,
  // ενώ ο ΙΔΙΟΣ ο τίτλος του προϊόντος έλεγε «μαύρα». A/B με τον πραγματικό generator:
  // 1179 → 1181, 0 χαμένες, 0 τίτλοι, 0 τιμές, 6→6 διακριτές τιμές <color>.
  'μαύρα ανθρακί': 'μαύρο',
  'ροζ': 'ροζ', 'ροζ επιχρυσωμένο': 'ροζ', 'ροζ επιχρυσωμένα': 'ροζ', 'ροζ χρυσό': 'ροζ',
  'λευκό': 'λευκό', 'λευκά': 'λευκό',
  'μπλε': 'μπλε', 'πράσινο': 'πράσινο', 'πράσινα': 'πράσινο',
  'κόκκινο': 'κόκκινο', 'κόκκινα': 'κόκκινο', 'μπορντό': 'μπορντό',
  'μωβ': 'μωβ', 'τιρκουάζ': 'τιρκουάζ', 'σομόν': 'σομόν',
  'πολύχρωμο': 'πολύχρωμο', 'πολύχρωμα': 'πολύχρωμο', 'πολύχρωμο σετ': 'πολύχρωμο',
  'silver': 'ασημί', 'gold': 'χρυσό', 'black': 'μαύρο',
};

// v2.2 (03/08/2026) — ΣΥΝΘΕΤΕΣ ΑΠΟΧΡΩΣΕΙΣ.
// Μετρημένο σε ΟΛΟΝ τον ενεργό κατάλογο (464 προϊόντα / 288 με option χρώματος / 103 τιμές):
// 39 τιμές είναι σύνθετες («Μαύρα με χρυσό σύρμα», «Ασημένιο με δέσιμο από χαλκό») και
// 16 έβγαζαν ΛΑΘΟΣ αποτέλεσμα — 12 ως null (φρουρός 25 χαρακτήρων) + 4 ως χρώμα ΤΟΥ ΣΥΡΜΑΤΟΣ.
// Το null κατέληγε, μέσω του fallback της γρ. 619, σε σκληρά κωδικοποιημένο 'ασημί'.
function getGreekColor(variantColorRaw) {
  if (!variantColorRaw) return null;
  if (/\d/.test(variantColorRaw)) return null;

  // ① Το χρώμα του ΑΝΤΙΚΕΙΜΕΝΟΥ είναι το κομμάτι ΠΡΙΝ το « με ». Ό,τι ακολουθεί περιγράφει
  //    σύρμα/δέσιμο/πέτρα και ΔΕΝ είναι η απόχρωση του κοσμήματος.
  //    Κρατάμε και το κεφάλι ΣΤΗΝ ΑΡΧΙΚΗ ΓΡΑΦΗ, ώστε το τελικό fallback να μην επιστρέψει
  //    ολόκληρη τη σύνθετη συμβολοσειρά ως «χρώμα».
  const rawHead = variantColorRaw.trim().split(/\s+με\s+/)[0].trim() || variantColorRaw.trim();
  const normalized = rawHead.toLowerCase();

  if (normalized.length > 25) return null;
  if (COLOR_MAP_GREEK[normalized]) return COLOR_MAP_GREEK[normalized];

  // ② ΜΕΓΑΛΥΤΕΡΟ ΚΛΕΙΔΙ ΠΡΩΤΑ — η σάρωση με σειρά δήλωσης έκανε το 'επιχρυσωμένα' να νικά
  //    το 'ροζ επιχρυσωμένα' («Ροζ επιχρυσωμένα με μαύρο» → χρυσό αντί για ροζ).
  for (const key of Object.keys(COLOR_MAP_GREEK).sort((a, b) => b.length - a.length)) {
    if (normalized.includes(key)) return COLOR_MAP_GREEK[key];
  }
  return rawHead;
}

// ============================================
// VARIANT NAME TRANSLATION (German/English → Greek for titles)
// ============================================

const VARIANT_NAME_TRANSLATIONS = {
  // German → Greek
  'manschetten': 'μανσέτ', 'manschette': 'μανσέτ',
  'mehrfarbige': 'πολύχρωμες', 'mehrfarbig': 'πολύχρωμο',
  'schwarze': 'μαύρες', 'schwarz': 'μαύρο',
  'silberne': 'ασημένιες', 'silber': 'ασημί',
  'goldene': 'χρυσές', 'gold': 'χρυσό',
  'vergoldet': 'επιχρυσωμένο', 'rosévergoldet': 'ροζ επιχρυσωμένο',
  'oxidiert': 'οξειδωμένο',
  // English → Greek
  'silver': 'ασημί', 'black': 'μαύρο',
};

function translateVariantName(name) {
  if (!name) return name;
  let result = name;
  // Replace German/English words with Greek equivalents
  for (const [foreign, greek] of Object.entries(VARIANT_NAME_TRANSLATIONS)) {
    const regex = new RegExp(`\\b${foreign}\\b`, 'gi');
    result = result.replace(regex, greek);
  }
  return result;
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

// Extract product-splitting option value — ONLY known patterns like Μονό/Ζευγάρι
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

// Collect all in-stock sizes for a product (for rings)
function collectAvailableSizes(variants) {
  const sizes = new Set();
  for (const v of variants) {
    if (v.inventory_quantity <= 0) continue;
    const size = extractVariantSize(v.selectedOptions);
    if (size) sizes.add(size);
  }
  return sizes.size > 0 ? Array.from(sizes).join(',') : null;
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
          // Concatenate as Buffer first, then decode as UTF-8 to avoid stream boundary corruption
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
      const wait = Math.min(attempt * 5000, 30000); // 5s, 10s, 15s, 20s, 25s, 30s
      console.log(`   ⏳ Throttled — waiting ${wait / 1000}s (attempt ${attempt}/${retries})...`);
      await new Promise(r => setTimeout(r, wait));
      continue;
    }
    return result;
  }
  // Final attempt after all retries exhausted
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
            id title handle productType vendor tags onlineStoreUrl
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
        // Wait extra before retrying this page
        console.log(`   Waiting 30s before retrying page ${page}...`);
        await new Promise(r => setTimeout(r, 30000));
        continue; // retry same page
      }
      consecutiveErrors = 0; // reset on success

      const products = data.data?.products?.edges || [];
      products.forEach(({ node }) => {
        const product = {
          id: node.id.replace('gid://shopify/Product/', ''),
          title: node.title,
          handle: node.handle,
          onlineStoreUrl: node.onlineStoreUrl,
          product_type: node.productType,
          vendor: node.vendor,
          tags: node.tags || [],
          metafields: {
            color: node.colorPattern?.value || null,
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
// XML FEED GENERATION FOR BESTPRICE
// ============================================

function generateBestPriceFeed(products) {
  console.log('Generating BestPrice XML feed...\n');

  const items = [];
  const stats = {
    inStock: 0,
    outOfStock: 0,
    noImage: 0,
    totalVariants: 0,
    skippedGiftCards: 0,
    withColor: 0,
    withSize: 0,
    withWeight: 0,
    withMPN: 0,
    categoryBreakdown: {},
    unmappedTypes: {},
    sampleItems: []
  };

  products.forEach(product => {
    // Skip gift cards
    const typeLC = (product.product_type || '').toLowerCase();
    if (typeLC.includes('gift card') || typeLC.includes('δωροκάρτα')) {
      stats.skippedGiftCards++;
      return;
    }

    // Skip products NOT published to the Online Store (status:active but unpublished
    // → /products/{handle} 404s on the storefront). Prevents dead BestPrice URLs.
    // (URL audit 2026-06-08: this class is what would leak active-but-unpublished 404s.)
    if (!product.onlineStoreUrl) {
      stats.skippedUnpublished = (stats.skippedUnpublished || 0) + 1;
      return;
    }

    const variants = product.variants || [];
    const images = product.images || [];
    const mainImage = images[0]?.src || '';
    const categoryPath = getBestPriceCategory(product.product_type);

    // Track category
    stats.categoryBreakdown[categoryPath] = (stats.categoryBreakdown[categoryPath] || 0) + 1;
    if (categoryPath === DEFAULT_BESTPRICE_CATEGORY && product.product_type) {
      stats.unmappedTypes[product.product_type] = (stats.unmappedTypes[product.product_type] || 0) + 1;
    }

    // Collect available sizes for this product (for size field)
    const isRingOrSized = typeLC.includes('δαχτυλίδ') || typeLC.includes('ring');
    const availableSizes = isRingOrSized ? collectAvailableSizes(variants) : null;

    // Group in-stock variants by color × secondOption → 1 feed entry per group (v2.0)
    const hasSecondOption = variants.some(v => extractSecondOption(v.selectedOptions) !== null);
    const entryGroups = {};

    variants.forEach(variant => {
      stats.totalVariants++;

      if (variant.inventory_quantity <= 0) {
        stats.outOfStock++;
        return;
      }
      stats.inStock++;

      const rawColor = extractVariantColor(variant.selectedOptions);
      const color = getGreekColor(rawColor) || getGreekColor(product.metafields.color) || 'ασημί';
      const secondOpt = hasSecondOption ? (extractSecondOption(variant.selectedOptions) || null) : null;
      const groupKey = secondOpt ? `${color}|||${secondOpt}` : color;

      if (!entryGroups[groupKey]) {
        entryGroups[groupKey] = { color, secondOption: secondOpt, variants: [] };
      }
      entryGroups[groupKey].variants.push(variant);
    });

    // Pre-compute image ranges per color group (v2.0 — color-correct images)
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

    // Create 1 entry per group
    for (const [groupKey, group] of Object.entries(entryGroups)) {
      const { color, secondOption: secondOpt, variants: groupVariants } = group;
      const repVariant = groupVariants[0];

      // Color-correct images (v2.0): use variant boundary heuristic
      const groupImageIds = new Set(
        groupVariants.map(v => v.image_id).filter(Boolean)
      );

      let variantImage;
      let colorImages;

      if (groupImageIds.size > 0) {
        const collected = [];
        const seen = new Set();
        for (const imgId of groupImageIds) {
          const range = imageRangeByVariantImageId[imgId] || [];
          for (const img of range) {
            if (!seen.has(img.id)) {
              seen.add(img.id);
              collected.push(img);
            }
          }
        }
        variantImage = collected[0]?.src || mainImage;
        colorImages = collected.map(img => img.src).slice(0, 5);
      } else {
        variantImage = mainImage;
        colorImages = [mainImage];
      }

      if (!variantImage) {
        stats.noImage++;
        continue;
      }

      // Lowest price among in-stock variants of this group
      const lowestPrice = Math.min(...groupVariants.map(v => parseFloat(v.price)));

      // Weight from representative variant
      const weightGrams = getWeightGrams(repVariant);

      // Build title via Skroutz title-builder v3.5.2 (v3.0 rebuild)
      // Result is canonical Skroutz-style title MINUS variant-specific suffixes
      // (chain length, ring size, bracelet length) which don't apply to color-grouped entries.
      let title = buildBestPriceTitle({ product, variant: repVariant, categoryPath });
      // Fallback if title-builder returns empty (defensive)
      if (!title) {
        title = product.title;
        const colorForTitle = color !== 'ασημί' || Object.keys(entryGroups).length > 1
          ? translateVariantName(extractVariantColor(repVariant.selectedOptions) || color)
          : null;
        if (colorForTitle) title = `${product.title} - ${colorForTitle}`;
        if (secondOpt) title = `${title} ${secondOpt}`;
      }

      // Build product XML
      let item = '';
      item += `    <product>\n`;
      item += `      <productId>${repVariant.id}</productId>\n`;
      item += `      <title><![CDATA[${title}]]></title>\n`;
      item += `      <productURL>https://${DOMAIN}/products/${product.handle}</productURL>\n`;

      // Images: color-correct only (v2.0)
      item += `      <imageURL>${escapeXml(colorImages[0] || variantImage || mainImage)}</imageURL>\n`;
      if (colorImages.length > 1) {
        item += `      <imagesURL>\n`;
        colorImages.forEach((img, i) => {
          item += `        <img${i + 1}>${escapeXml(img)}</img${i + 1}>\n`;
        });
        item += `      </imagesURL>\n`;
      }

      // Price (lowest in group)
      item += `      <price>${lowestPrice.toFixed(2)}</price>\n`;

      // Category
      item += `      <category_path>${escapeXml(categoryPath)}</category_path>\n`;

      // Availability & stock
      item += `      <availability>Παράδοση σε 1-3 ημέρες</availability>\n`;
      item += `      <stock>Y</stock>\n`;

      // Brand
      item += `      <brand>${escapeXml(BRAND)}</brand>\n`;

      // MPN (SKU from representative variant)
      const mpnValue = repVariant.sku || `EMM-${repVariant.id}`;
      item += `      <MPN>${escapeXml(mpnValue)}</MPN>\n`;
      if (repVariant.sku) stats.withMPN++;

      // Color (always present)
      item += `      <color>${escapeXml(color)}</color>\n`;
      if (color !== 'ασημί') stats.withColor++;

      // Size (for rings: all available sizes across ALL variants, not just this color)
      if (availableSizes) {
        item += `      <size>${escapeXml(availableSizes)}</size>\n`;
        stats.withSize++;
      }

      // Weight (grams)
      if (weightGrams) {
        item += `      <weight>${weightGrams}</weight>\n`;
        stats.withWeight++;
      }

      // Shipping (free)
      item += `      <shipping>0</shipping>\n`;

      item += `    </product>`;
      items.push(item);

      // Collect samples
      if (stats.sampleItems.length < 3) {
        stats.sampleItems.push({
          productId: repVariant.id,
          title: title,
          price: lowestPrice.toFixed(2),
          category: categoryPath,
          color: color,
          sku: repVariant.sku || '(none)',
          size: availableSizes || '(none)',
          variantsInGroup: groupVariants.length
        });
      }
    }
  });

  // Build full XML
  const now = new Date();
  const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  xml += `<store>\n`;
  xml += `  <date>${dateStr}</date>\n`;
  xml += `  <products>\n`;
  xml += items.join('\n');
  xml += `\n  </products>\n`;
  xml += `</store>\n`;

  return { xml, stats };
}

// ============================================
// MAIN FUNCTION
// ============================================

async function generateFeed(options = {}) {
  console.log('='.repeat(60));
  console.log('BestPrice.gr Feed Generator v2.0 for EMMANUELA');
  console.log('='.repeat(60));
  console.log(`Store: ${SHOPIFY_STORE}`);
  console.log(`Domain: ${DOMAIN}`);
  console.log(`Brand: ${BRAND}\n`);

  // Fetch products
  const products = await fetchProducts();
  if (products.length === 0) {
    console.error('No products found!');
    process.exit(1);
  }

  // Generate feed
  let { xml, stats } = generateBestPriceFeed(products);

  // Sanitize: remove any U+FFFD replacement characters (Node.js/API encoding glitch)
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
  const filename = 'bestprice-gr.xml';
  const filepath = path.join(OUTPUT_DIR, filename);
  fs.writeFileSync(filepath, xml, 'utf8');

  const date = new Date().toISOString().split('T')[0];
  const datedFilename = `bestprice-gr-${date}.xml`;
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
  console.log(`  Products fetched:    ${products.length}`);
  console.log(`  Total variants:      ${stats.totalVariants}`);
  console.log(`  In stock (included): ${stats.inStock}`);
  console.log(`  Out of stock (skip): ${stats.outOfStock}`);
  console.log(`  No image (skip):     ${stats.noImage}`);
  console.log(`  Gift cards (skip):   ${stats.skippedGiftCards}`);
  console.log(`  With color:          ${stats.withColor}`);
  console.log(`  With MPN/SKU:        ${stats.withMPN}`);
  console.log(`  With size:           ${stats.withSize}`);
  console.log(`  With weight:         ${stats.withWeight}`);

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
      console.log(`\n  [${i + 1}] ${s.title}`);
      console.log(`      ID:       ${s.productId}`);
      console.log(`      Price:    ${s.price}`);
      console.log(`      Category: ${s.category}`);
      console.log(`      Color:    ${s.color}`);
      console.log(`      SKU:      ${s.sku}`);
      console.log(`      Size:     ${s.size}`);
    });
  }
}

// Entry point
const args = process.argv.slice(2);
const options = {
  validate: args.includes('--validate') || args.includes('-v')
};
generateFeed(options).catch(console.error);
