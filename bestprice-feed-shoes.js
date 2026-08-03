/**
 * BestPrice.gr Product Feed Generator v1.0 for EMMANUELA SHOES
 *
 * Generates a valid XML product feed per BestPrice.gr specifications (v2.0.12).
 * Based on bestprice-feed-gr.js v2.0 (jewelry), adapted for leather sandals.
 *
 * Key features:
 *   - ALL active products via Shopify GraphQL API
 *   - Creates separate <product> per color × secondOption — as required by BestPrice
 *   - Skips out-of-stock variants
 *   - Full Greek category paths (Μόδα->Σανδάλια->...)
 *   - Greek color mapping for leather/sandal colors
 *   - Shoe size aggregation (35-45) for ALL products
 *   - productId = Shopify Variant ID (stable identifier)
 *
 * Usage:
 *   node bestprice-feed-shoes.js                    # Generate feed
 *   node bestprice-feed-shoes.js --validate         # Generate and show sample
 *
 * Output: feeds/bestprice-shoes.xml
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
// BESTPRICE CATEGORY PATH MAPPING (SHOES/SANDALS)
// ============================================

// Exact match: Shopify productType (lowercase) → BestPrice category_path
// NOTE: These categories may need adjustment after checking BestPrice's actual taxonomy.
// Verify at merchants.bestprice.gr after first feed submission.
const BESTPRICE_CATEGORY_MAP = {
  // Women's sandals
  'γυναικεία σανδάλια':                    'Μόδα->Γυναικεία Παπούτσια->Σανδάλια',
  'γυναικεία δερμάτινα σανδάλια':          'Μόδα->Γυναικεία Παπούτσια->Σανδάλια',
  'γυναικεία flat σανδάλια':               'Μόδα->Γυναικεία Παπούτσια->Σανδάλια',
  'γυναικεία πλατφόρμες':                  'Μόδα->Γυναικεία Παπούτσια->Πλατφόρμες',
  'γυναικείες πλατφόρμες':                 'Μόδα->Γυναικεία Παπούτσια->Πλατφόρμες',
  'γυναικεία slides':                      'Μόδα->Γυναικεία Παπούτσια->Σανδάλια',
  'γυναικεία σαγιονάρες':                  'Μόδα->Γυναικεία Παπούτσια->Σαγιονάρες',
  'γυναικεία πέδιλα':                      'Μόδα->Γυναικεία Παπούτσια->Πέδιλα',
  'γυναικείες παντόφλες':                  'Μόδα->Γυναικεία Παπούτσια->Παντόφλες',
  // Men's sandals
  'ανδρικά σανδάλια':                      'Μόδα->Ανδρικά Παπούτσια->Σανδάλια',
  'ανδρικά δερμάτινα σανδάλια':            'Μόδα->Ανδρικά Παπούτσια->Σανδάλια',
  'ανδρικά slides':                        'Μόδα->Ανδρικά Παπούτσια->Σανδάλια',
  'ανδρικά πέδιλα':                        'Μόδα->Ανδρικά Παπούτσια->Πέδιλα',
  'ανδρικές παντόφλες':                    'Μόδα->Ανδρικά Παπούτσια->Παντόφλες',
  // Kids
  'παιδικά σανδάλια':                      'Μόδα->Παιδικά Παπούτσια->Σανδάλια',
  // Specific types from store
  'σανδάλια μονομάχου':                    'Μόδα->Γυναικεία Παπούτσια->Σανδάλια',
  'σανδάλια με λουριά στη φτέρνα':         'Μόδα->Γυναικεία Παπούτσια->Σανδάλια',
  'εσπαντρίγιες':                          'Μόδα->Γυναικεία Παπούτσια->Εσπαντρίγιες',
  'flat mules':                            'Μόδα->Γυναικεία Παπούτσια->Παντόφλες',
  // Unisex / generic
  'σανδάλια':                              'Μόδα->Γυναικεία Παπούτσια->Σανδάλια',
  'δερμάτινα σανδάλια':                    'Μόδα->Γυναικεία Παπούτσια->Σανδάλια',
  'leather sandals':                       'Μόδα->Γυναικεία Παπούτσια->Σανδάλια',
  'sandals':                               'Μόδα->Γυναικεία Παπούτσια->Σανδάλια',
  'women sandals':                         'Μόδα->Γυναικεία Παπούτσια->Σανδάλια',
  'men sandals':                           'Μόδα->Ανδρικά Παπούτσια->Σανδάλια',
  // English product types from Shopify catalog (exact match — priority over keyword fallback)
  'gladiator sandals':                     'Μόδα->Γυναικεία Παπούτσια->Σανδάλια',
  'slide sandals':                         'Μόδα->Γυναικεία Παπούτσια->Σανδάλια',
  'strap sandals':                         'Μόδα->Γυναικεία Παπούτσια->Σανδάλια',
  // "Men's Sandals" — exact match BEFORE keyword fallback (which incorrectly catches 'sandal' before 'men')
  // Multiple apostrophe variants for safety (Shopify may store straight ' or curly ’)
  "men's sandals":                         'Μόδα->Ανδρικά Παπούτσια->Σανδάλια',
  "men’s sandals":                    'Μόδα->Ανδρικά Παπούτσια->Σανδάλια',
  'mens sandals':                          'Μόδα->Ανδρικά Παπούτσια->Σανδάλια',
  'slides':                                'Μόδα->Γυναικεία Παπούτσια->Σανδάλια',
  'πέδιλα':                                'Μόδα->Γυναικεία Παπούτσια->Πέδιλα',
  'πλατφόρμες':                            'Μόδα->Γυναικεία Παπούτσια->Πλατφόρμες',
};

// Keyword-based fallback (order matters: more specific first)
const BESTPRICE_CATEGORY_KEYWORDS = [
  // Gender-specific
  { keywords: ['ανδρικ', 'σανδάλ'],       category: 'Μόδα->Ανδρικά Παπούτσια->Σανδάλια' },
  { keywords: ['ανδρικ', 'πέδιλ'],        category: 'Μόδα->Ανδρικά Παπούτσια->Πέδιλα' },
  { keywords: ['ανδρικ', 'παντόφλ'],      category: 'Μόδα->Ανδρικά Παπούτσια->Παντόφλες' },
  { keywords: ['γυναικεί', 'πλατφόρμ'],   category: 'Μόδα->Γυναικεία Παπούτσια->Πλατφόρμες' },
  { keywords: ['γυναικεί', 'σανδάλ'],     category: 'Μόδα->Γυναικεία Παπούτσια->Σανδάλια' },
  { keywords: ['γυναικεί', 'πέδιλ'],      category: 'Μόδα->Γυναικεία Παπούτσια->Πέδιλα' },
  { keywords: ['γυναικεί', 'σαγιονάρ'],   category: 'Μόδα->Γυναικεία Παπούτσια->Σαγιονάρες' },
  { keywords: ['γυναικεί', 'παντόφλ'],    category: 'Μόδα->Γυναικεία Παπούτσια->Παντόφλες' },
  { keywords: ['παιδικ', 'σανδάλ'],       category: 'Μόδα->Παιδικά Παπούτσια->Σανδάλια' },
  // Generic fallbacks
  { keywords: ['πλατφόρμ'],               category: 'Μόδα->Γυναικεία Παπούτσια->Πλατφόρμες' },
  { keywords: ['σαγιονάρ'],               category: 'Μόδα->Γυναικεία Παπούτσια->Σαγιονάρες' },
  { keywords: ['παντόφλ'],                category: 'Μόδα->Γυναικεία Παπούτσια->Παντόφλες' },
  { keywords: ['πέδιλ'],                  category: 'Μόδα->Γυναικεία Παπούτσια->Πέδιλα' },
  { keywords: ['σανδάλ'],                 category: 'Μόδα->Γυναικεία Παπούτσια->Σανδάλια' },
  { keywords: ['μονομάχ'],                category: 'Μόδα->Γυναικεία Παπούτσια->Σανδάλια' },
  { keywords: ['λουριά', 'φτέρνα'],       category: 'Μόδα->Γυναικεία Παπούτσια->Σανδάλια' },
  { keywords: ['εσπαντρίγ'],              category: 'Μόδα->Γυναικεία Παπούτσια->Εσπαντρίγιες' },
  { keywords: ['mule'],                   category: 'Μόδα->Γυναικεία Παπούτσια->Παντόφλες' },
  { keywords: ['sandal'],                 category: 'Μόδα->Γυναικεία Παπούτσια->Σανδάλια' },
  { keywords: ['slide'],                  category: 'Μόδα->Γυναικεία Παπούτσια->Σανδάλια' },
  { keywords: ['men'],                    category: 'Μόδα->Ανδρικά Παπούτσια->Σανδάλια' },
];

const DEFAULT_BESTPRICE_CATEGORY = 'Μόδα->Γυναικεία Παπούτσια->Σανδάλια';

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
// COLOR MAPPING (Greek/English variant names → Greek color for BestPrice)
// ============================================

// Leather sandal color palette — different from jewelry metals
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
  // Green / Olive (common for leather)
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

// ── v2.2-shoes (2026-08-03) ── ΠΡΟΣΘΗΚΕΣ ΣΤΟΝ ΧΑΡΤΗ: μόνο ΝΕΑ κλειδιά, κανένα υπάρχον
// δεν αλλάζει τιμή (επαληθεύτηκε: 0 συγκρούσεις σε 33 προσθήκες).
Object.assign(COLOR_MAP_GREEK, {
  // Απόφαση Bill 03/08: «Μπρονζέ» → καφέ. ⛔ ΟΧΙ χρυσό: το ίδιο προϊόν («Κνωσσός»)
  // εκπέμπει ήδη «χρυσό» και το groupKey (color|||secondOpt) θα τα ΣΥΓΧΩΝΕΥΕ, χάνοντας
  // τη μία απόχρωση. Δεκτές ΚΑΙ οι δύο γραφές ώστε η μετονομασία του καταλόγου
  // («Μπρούτζος» → «Μπρονζέ») να γίνει ανεξάρτητα, όποτε αποφασίσουν.
  'μπρούτζος': 'καφέ', 'μπρουτζος': 'καφέ', 'μπρονζέ': 'καφέ', 'μπρονζε': 'καφέ',
  'bronze': 'καφέ', 'μπρούντζος': 'καφέ',
  // Κόβονταν από τον φρουρό ψηφίων ⇒ έπεφταν στο σκληρό fallback 'καφέ' (γρ. 606).
  '3χρωμία μεταλλική': 'πολύχρωμο', '3χρωμία': 'πολύχρωμο',
  'τρίχρωμο': 'πολύχρωμο', 'τρίχρωμη': 'πολύχρωμο',
  // Συμμετρία γένους/αριθμού — ίδια κλάση με το v2.2 των κοσμημάτων (03/08) και το
  // ασύμμετρο FILENAME_COLOR_PATTERNS του Skroutz (29/07).
  'μαύρη': 'μαύρο', 'μαύρες': 'μαύρο', 'μαύροι': 'μαύρο',
  'λευκή': 'λευκό', 'λευκές': 'λευκό', 'λευκοί': 'λευκό',
  'χρυσά': 'χρυσό', 'χρυσή': 'χρυσό', 'χρυσές': 'χρυσό', 'χρυσοί': 'χρυσό',
  'ασημένια': 'ασημί', 'ασημένιες': 'ασημί', 'ασημένιοι': 'ασημί', 'ασημένιος': 'ασημί',
  'κόκκινη': 'κόκκινο', 'κόκκινες': 'κόκκινο',
  'πράσινη': 'πράσινο', 'πράσινες': 'πράσινο',
  'μουσταρδιά': 'κίτρινο',
});
// Υπολογίζεται ΜΙΑ φορά· η σάρωση τρέχει σε κάθε variant (13.976 στον κατάλογο).
const COLOR_KEYS_BY_LEN = Object.keys(COLOR_MAP_GREEK).sort((a, b) => b.length - a.length);

// v2.2-shoes (2026-08-03) — ΤΡΙΑ ελαττώματα, μετρημένα σε ΟΛΟΝ τον ζωντανό κατάλογο
// (486 ενεργά / 480 δημοσιευμένα / 71 τιμές χρώματος):
//  ① σάρωση με σειρά ΔΗΛΩΣΗΣ του χάρτη ⇒ επέστρεφε το χρώμα της ΣΟΛΑΣ ή της λεπτομέρειας
//     («Λευκό με καφέ πάτο» → καφέ· «Μουσταρδί με τιρκουάζ» → τιρκουάζ)
//  ② φρουρός ψηφίων ⇒ «3χρωμία μεταλλική» → null → σκληρό fallback 'καφέ' (γρ. 606)
//  ③ ασύμμετρος χάρτης σε γένος/αριθμό
// A/B με τον ΠΡΑΓΜΑΤΙΚΟ generator στον ίδιο κατάλογο: 313 → 316 καταχωρήσεις,
// 0 αλλαγές τίτλων, 0 αλλαγές τιμών, λεξιλόγιο <color> 16 → 16 (καμία νέα τιμή).
function getGreekColor(variantColorRaw) {
  if (!variantColorRaw) return null;

  // ① Το χρώμα του ΣΑΝΔΑΛΙΟΥ είναι το κομμάτι ΠΡΙΝ το « με ». Ό,τι ακολουθεί περιγράφει
  //    σόλα/πάτο/λεπτομέρεια: «Λευκό με καφέ πάτο» είναι ΛΕΥΚΟ σανδάλι, όχι καφέ.
  //    Κρατάμε το κεφάλι ΣΤΗΝ ΑΡΧΙΚΗ ΓΡΑΦΗ ώστε το τελικό fallback να μην επιστρέψει
  //    ολόκληρη τη σύνθετη συμβολοσειρά ως «χρώμα».
  const rawHead = variantColorRaw.trim().split(/\s+με\s+/)[0].trim() || variantColorRaw.trim();
  const normalized = rawHead.toLowerCase();

  // ② ΑΚΡΙΒΗΣ ΑΝΤΙΣΤΟΙΧΙΣΗ ΠΡΙΝ ΤΟΥΣ ΦΡΟΥΡΟΥΣ — καθαρά ΠΡΟΣΘΕΤΙΚΟ: περνούν μόνο κλειδιά
  //    που βάλαμε ΕΜΕΙΣ ρητά στον χάρτη· τα σκουπίδια με ψηφία μένουν null όπως πριν.
  if (COLOR_MAP_GREEK[normalized]) return COLOR_MAP_GREEK[normalized];

  if (/\d/.test(normalized)) return null;
  if (normalized.length > 30) return null;

  // ③ ΝΩΡΙΤΕΡΗ ΘΕΣΗ ΚΕΡΔΙΖΕΙ· σε ισοπαλία θέσης, το ΜΕΓΑΛΥΤΕΡΟ κλειδί.
  //    ⛔ ΟΧΙ «μεγαλύτερο κλειδί πρώτα» όπως στα ΚΟΣΜΗΜΑΤΑ: εκεί ο κανόνας λύνει
  //    ΕΓΚΛΕΙΣΜΟ (ροζ επιχρυσωμένα ⊃ επιχρυσωμένα). Εδώ η οικογένεια είναι ΠΟΛΥ-ΧΡΩΜΑΤΙΚΑ
  //    ονόματα («Μπεζ-Χρυσό», «Ροζ Λευκό Κοραλί»), όπου το μήκος διαλέγει άλλοτε την 1η
  //    και άλλοτε την 3η λέξη — δηλαδή αυθαίρετα. Η ΘΕΣΗ κωδικοποιεί την κυρίαρχη απόχρωση.
  //    Μετρημένο: χαμένες αποχρώσεις ανά φυσική γραμμή 36 (τώρα) · 31 (μήκος) · 29 (θέση).
  let best = null;
  for (const key of COLOR_KEYS_BY_LEN) {
    const i = normalized.indexOf(key);
    if (i < 0) continue;
    if (best === null || i < best.i) best = { i, key };
  }
  if (best) return COLOR_MAP_GREEK[best.key];

  return rawHead;   // το ΚΕΦΑΛΙ, ποτέ ολόκληρη η σύνθετη συμβολοσειρά
}

// ============================================
// VARIANT NAME TRANSLATION (English/German → Greek for titles)
// ============================================

const VARIANT_NAME_TRANSLATIONS = {
  // English → Greek (most common for shoes store)
  'brown': 'καφέ', 'dark brown': 'σκούρο καφέ', 'light brown': 'ανοιχτό καφέ',
  'black': 'μαύρο', 'white': 'λευκό', 'natural': 'φυσικό',
  'tan': 'ταμπά', 'red': 'κόκκινο', 'green': 'πράσινο',
  'blue': 'μπλε', 'gold': 'χρυσό', 'silver': 'ασημί',
  'beige': 'μπεζ', 'nude': 'nude', 'olive': 'ελιά',
  'pink': 'ροζ', 'grey': 'γκρι', 'orange': 'πορτοκαλί',
  // German → Greek
  'braun': 'καφέ', 'dunkelbraun': 'σκούρο καφέ', 'hellbraun': 'ανοιχτό καφέ',
  'schwarz': 'μαύρο', 'weiß': 'λευκό', 'weiss': 'λευκό',
  'rot': 'κόκκινο', 'grün': 'πράσινο', 'blau': 'μπλε',
};

function translateVariantName(name) {
  if (!name) return name;
  let result = name;
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
  // Note: do NOT emit &apos; — some XML parsers (incl. BestPrice public validator)
  // don't recognize it and fail with generic "syntax error". Apostrophe is valid
  // literal char in element content per XML spec — only needs escape inside
  // attribute values delimited by '. Escape to &quot; for consistency since
  // titles often have "Product Name" wrapping which uses same role visually.
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&quot;');
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
    if (name.includes('μέγεθος') || name.includes('size') || name.includes('νούμερο')
        || name.includes('number') || name.includes('shoe size')) {
      return opt.value;
    }
  }
  return null;
}

// Extract product-splitting option value — ONLY known patterns
// For sandals: Μονό/Ζευγάρι unlikely, but keep for safety
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

// Strip "EU " prefix from shoe sizes (e.g. "EU 37" → "37")
function normalizeShoeSize(size) {
  if (!size) return size;
  return size.replace(/^EU\s*/i, '').trim();
}

// Collect all in-stock sizes for a product (for sandals: ALL products have sizes)
function collectAvailableSizes(variants) {
  const sizes = new Set();
  for (const v of variants) {
    if (v.inventory_quantity <= 0) continue;
    const size = extractVariantSize(v.selectedOptions);
    if (size) sizes.add(normalizeShoeSize(size));
  }
  if (sizes.size === 0) return null;
  // Sort numerically for shoe sizes (35, 36, 37, ...)
  const sorted = Array.from(sizes).sort((a, b) => {
    const na = parseFloat(a);
    const nb = parseFloat(b);
    if (!isNaN(na) && !isNaN(nb)) return na - nb;
    return a.localeCompare(b);
  });
  return sorted.join(',');
}

// Collect sizes per color group (only in-stock variants of that color)
function collectGroupSizes(groupVariants) {
  const sizes = new Set();
  for (const v of groupVariants) {
    const size = extractVariantSize(v.selectedOptions);
    if (size) sizes.add(normalizeShoeSize(size));
  }
  if (sizes.size === 0) return null;
  const sorted = Array.from(sizes).sort((a, b) => {
    const na = parseFloat(a);
    const nb = parseFloat(b);
    if (!isNaN(na) && !isNaN(nb)) return na - nb;
    return a.localeCompare(b);
  });
  return sorted.join(',');
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
  // Cross-product dedupe: Shopify shoes catalog has massive replication where the
  // SAME physical product (same MPN/SKU + same color + same size set) exists as
  // multiple Shopify products with different productIds. Without deduplication
  // BestPrice gets ~310 sets of identical entries (1322/1382 = 95.7% duplicates),
  // which likely caused the rejection. Key = MPN | color | size-set.
  // Discovered via _audit-shoes-2026-05-15.js on 2026-05-15.
  const seenDedupeKeys = new Map(); // key → first productId emitted
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
    withBarcode: 0,
    dedupedSkipped: 0,
    dedupeDetails: [],
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
    // (URL audit 2026-06-08 found "Ιθάκη" leaking 5 such 404 URLs into the shoes feed.)
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

    // Group in-stock variants by color × secondOption → 1 feed entry per group (v2.0 pattern)
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
      const color = getGreekColor(rawColor) || getGreekColor(product.metafields.color) || 'καφέ';
      const secondOpt = hasSecondOption ? (extractSecondOption(variant.selectedOptions) || null) : null;
      const groupKey = secondOpt ? `${color}|||${secondOpt}` : color;

      if (!entryGroups[groupKey]) {
        entryGroups[groupKey] = { color, secondOption: secondOpt, variants: [] };
      }
      entryGroups[groupKey].variants.push(variant);
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

    // Create 1 entry per group
    for (const [groupKey, group] of Object.entries(entryGroups)) {
      const { color, secondOption: secondOpt, variants: groupVariants } = group;
      const repVariant = groupVariants[0];

      // Color-correct images: use variant boundary heuristic
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

      // Sizes: per color group (shoes always have sizes)
      const groupSizes = collectGroupSizes(groupVariants);

      // Build title: product title + color (if multiple entries) + second option
      const colorForTitle = Object.keys(entryGroups).length > 1
        ? translateVariantName(extractVariantColor(repVariant.selectedOptions) || color)
        : null;
      let title = product.title;
      if (colorForTitle) {
        title = `${product.title} - ${colorForTitle}`;
      }
      if (secondOpt) {
        title = `${title} ${secondOpt}`;
      }
      // v1.3 fix (2026-05-15): collapse repeated quote characters and normalize
      // curly quotes. Shopify catalog has 17 product titles with literal ""Name""
      // (double straight quotes) which escapeXml() then turns into
      // &quot;&quot;Name&quot;&quot; in the feed. BestPrice flags these as
      // malformed titles. Collapse to single quote pairs.
      title = title
        .replace(/[“”]+/g, '"')   // “” → "
        .replace(/[‘’]+/g, "'")   // ‘’ → '
        .replace(/"+/g, '"')                  // "" → "
        .replace(/'+/g, "'")                  // '' → '
        .replace(/\s+/g, ' ')                 // collapse multiple spaces
        .trim();

      // CROSS-PRODUCT DEDUPE: skip if (MPN, color, sizes) already emitted
      // Shopify shoes catalog has multiple productIds for the same physical SKU.
      const dedupeMpn = repVariant.sku || `EMM-${repVariant.id}`;
      const dedupeKey = `${dedupeMpn}|${color}|${groupSizes || ''}`;
      if (seenDedupeKeys.has(dedupeKey)) {
        stats.dedupedSkipped++;
        if (stats.dedupeDetails.length < 10) {
          stats.dedupeDetails.push({
            skippedId: repVariant.id,
            keptId: seenDedupeKeys.get(dedupeKey),
            key: dedupeKey,
            title,
          });
        }
        continue;
      }
      seenDedupeKeys.set(dedupeKey, repVariant.id);

      // Build product XML
      let item = '';
      item += `    <product>\n`;
      item += `      <productId>${repVariant.id}</productId>\n`;
      // Title: USE CDATA wrapping per official BestPrice XML spec v2.0.14
      // "Υπόδειγμα XML" example: <title><![CDATA[Apple iPhone 7 32GB μαύρο]]></title>.
      // This is the SAME pattern jewelry feed uses (production-accepted 10/02/2026).
      // v1.2 had removed CDATA based on a misread of the public validator warning
      // (the actual issue was that &quot; entities cause "0% Alphanumeric coverage"
      // in the validator because it doesn't decode entities. CDATA + raw quotes
      // → 100% coverage). Per spec Section 10, brand MUST be in the title, so
      // we prepend "Emmanuela" to titles that don't already contain it.
      const titleWithBrand = /emmanuela/i.test(title) ? title : `Emmanuela ${title}`;
      const titleCdata = titleWithBrand.replace(/]]>/g, ']]]]><![CDATA[>');
      item += `      <title><![CDATA[${titleCdata}]]></title>\n`;
      item += `      <productURL>https://${DOMAIN}/products/${product.handle}</productURL>\n`;

      // Images: color-correct only
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
      stats.withColor++;

      // Size (shoe sizes per color group — always present for sandals)
      if (groupSizes) {
        item += `      <size>${escapeXml(groupSizes)}</size>\n`;
        stats.withSize++;
      }

      // Weight (grams)
      if (weightGrams) {
        item += `      <weight>${weightGrams}</weight>\n`;
        stats.withWeight++;
      }

      // EAN/GTIN barcode — normalize to EAN-13 where possible
      // (v1.3 fix 2026-05-15): Shopify catalog stores many barcodes as GTIN-14
      // (14 digits with leading "0" indicator). BestPrice/GS1 expects EAN-13.
      // Audit on 2026-05-15 found 248/326 entries (76%) were 14-digit. Strip
      // leading "0" to convert GTIN-14 → EAN-13 when applicable.
      if (repVariant.barcode) {
        let ean = String(repVariant.barcode).trim();
        if (ean.length === 14 && ean.startsWith('0')) {
          ean = ean.substring(1);
        }
        if (/^\d{8}$|^\d{12}$|^\d{13}$/.test(ean)) {
          item += `      <EAN>${ean}</EAN>\n`;
          stats.withBarcode++;
        }
      }

      // Shipping (free)
      item += `      <shipping>0</shipping>\n`;

      item += `    </product>`;
      items.push(item);

      // Collect samples
      if (stats.sampleItems.length < 5) {
        stats.sampleItems.push({
          productId: repVariant.id,
          title: title,
          price: lowestPrice.toFixed(2),
          category: categoryPath,
          color: color,
          sku: repVariant.sku || '(none)',
          size: groupSizes || '(none)',
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
  console.log('BestPrice.gr Feed Generator v1.0 for EMMANUELA SHOES');
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
  const filename = 'bestprice-shoes.xml';
  const filepath = path.join(OUTPUT_DIR, filename);
  fs.writeFileSync(filepath, xml, 'utf8');

  const date = new Date().toISOString().split('T')[0];
  const datedFilename = `bestprice-shoes-${date}.xml`;
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
  console.log(`  Cross-product dupes: ${stats.dedupedSkipped}  (deduped on MPN|color|size)`);
  if (stats.dedupeDetails.length > 0) {
    console.log('  Sample dedupe skips (first 5):');
    for (const d of stats.dedupeDetails.slice(0, 5)) {
      console.log(`    skip ${d.skippedId} (kept ${d.keptId}) — ${d.title.substring(0, 60)}`);
    }
  }
  console.log(`  With color:          ${stats.withColor}`);
  console.log(`  With MPN/SKU:        ${stats.withMPN}`);
  console.log(`  With size:           ${stats.withSize}`);
  console.log(`  With weight:         ${stats.withWeight}`);
  console.log(`  With EAN/barcode:    ${stats.withBarcode}`);

  // Category breakdown
  console.log('\nCATEGORY BREAKDOWN:');
  const sorted = Object.entries(stats.categoryBreakdown).sort((a, b) => b[1] - a[1]);
  for (const [cat, count] of sorted) {
    console.log(`  ${cat}: ${count} products`);
  }

  // Unmapped types warning
  if (Object.keys(stats.unmappedTypes).length > 0) {
    console.log('\nUNMAPPED PRODUCT TYPES (using fallback):');
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
      console.log(`      Variants: ${s.variantsInGroup}`);
    });
  }
}

// Entry point
const args = process.argv.slice(2);
const options = {
  validate: args.includes('--validate') || args.includes('-v')
};
generateFeed(options).catch(console.error);
