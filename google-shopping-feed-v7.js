/**
 * Google Shopping Feed Generator v11.5 for EMMANUELA
 *
 * v11.5 (2026-09-21 — [SEO] lane · DEV build, deployed only after Bill's explicit ok):
 *   B1  API_VERSION '2024-01' (silently served as 2025-10) → '2026-07'; one WARN if the served version differs.
 *   B2  media(first: 50) + pageInfo; variants carry media(first: 1) instead of the deprecated image { id };
 *       variantsCount + variants pageInfo.
 *   B3  ALL variants are read (fetchRemainingVariants, first: 250 per follow-up page). What is EMITTED for a
 *       product with > 100 variants is the owner decision E2: GS_BIGPRODUCT_MODE = colour-stone (DEFAULT, see
 *       "Owner decisions" below) | legacy (the first 100, exactly as before v11.5) | all | colour.
 *   B4  FAIL-CLOSED: GraphQL error, still-throttled after the retries, variants read ≠ variantsCount or media
 *       with more pages ⇒ throw before the write loop ⇒ exit code 1, the previous XML files stay untouched.
 *   B5  the variant's OWN photo is matched through ProductVariant.media (MediaImage id). The old match
 *       (ProductImage id vs MediaImage.image.id = ImageSource id) matched 0 of 2,002 since ~21/02/2026.
 *       Same-colour sibling borrow for variants without a photo of their own.
 *   B6  PKGFILTER and B7 PHOTOEXCL — same shared JSONs and matchers as bestprice/glami. Cut to the cap FIRST,
 *       then filter, never refill. image_link is never a packaging photo.
 *   B8  fallback items in multi-colour products keep only the images that no variant owns.
 *   B9  lifestyle_image_link only if not packaging / not listed / not another colour's / not the image_link.
 *   B10 per-variant contextual prices (nodes(ids) × one alias per feed country) instead of one reference
 *       ratio; on sale: g:price = compare-at + g:sale_price (the second g:price is gone).
 *   B11 WARN when the Admin API shipping currency ≠ MARKETS currency (output unchanged).
 *   Kill-switches (each restores today's behaviour for its fix): GS_LEGACY_CAPS=1, GS_NO_VARIANTMEDIA=1,
 *   GS_NO_PKGFILTER=1, GS_NO_PHOTOEXCL=1, GS_NO_OTHERCOLOUR=1, GS_NO_LIFESTYLE_GUARD=1, GS_LEGACY_PRICING=1,
 *   GS_BIGPRODUCT_MODE=legacy (E2). All 8 together = the v11.4 output, byte for byte (41 of 41 feeds, replay of 21/09).
 *   Owner decisions (Bill, 2026-09-21 «Ok σε όλα») — built in as the DEFAULTS:
 *   E1 = A   items without a photo of their own colour stay listed as before (fallback image_link = images[0]);
 *            GS_APPLY_PHOTOGATE=1 (E1-B) and GS_APPLY_DROPENTRIES=1 stay OPT-IN. The photo-shoot list (E1-Γ) is a
 *            separate deliverable, not produced by this file.
 *   E2 = ii  GS_BIGPRODUCT_MODE default = colour-stone (was legacy): kremasto-monogramma-louloudi (product id
 *            4448531972131, 702 variants) emits ONE item per Χρώμα × Χρώμα πέτρας — 27 items on 21/09, the in-stock
 *            variant with the lowest variant id of each group — instead of its first 100 variants.
 *            legacy | all | colour stay selectable; GS_LEGACY_CAPS=1 forces legacy; an invalid value → the default + 🔴.
 *   E3 = A   GS_EXTRA_IMAGES_CAP default 9: up to 9 additional images, cut BEFORE the filters, never refilled.
 *   Offline self-test (no token, no network): node google-shopping-feed-v7.js selftest
 *   Review fixes (21/09, DEV round 2):
 *   F1  TIERED sibling borrow (R3a) for a variant without a photo of its own: (1) the sibling with the same metal AND
 *       every colour-like option (stone / pearl / zircon colour) equal; else (2) the round-1 sibling with the same
 *       metal; else (3) the fallback path. GS_BORROW_METAL_ONLY=1 = tier 2 only (round 1).
 *   F2  GS_PKG_EXTRA_LOCAL: Google-only packaging photos that the shared (frozen) list misses.
 *   F3  a failed / truncated shipping fetch THROWS (was: all feeds without g:shipping). GS_SHIPPING_SOFTFAIL=1 = v11.4.
 *   F4  fewer emitted in-stock variants than GS_MIN_ITEMS (default 1500), or 0 variants to price ⇒ throw.
 *   F5  null contextual prices: at most 0.5% PER PRICING COUNTRY (was one global 0.5%).
 *   F6  variant follow-up pages are bounded: the cursor must advance, pages ≤ ceil(variantsCount / 250) + 2.
 *   F7  GS_BIGPRODUCT_MODE applies ONLY to the PRODUCT IDS in GS_BIGPRODUCT_IDS (R3b; default 4448531972131 =
 *       kremasto-monogramma-louloudi, the handle is only logged); any other product with > 100 variants emits the
 *       first 100 (legacy) and logs a 🔴 line naming it, so no product grows the feed silently.
 *   F8  the two shared JSONs are fail-closed (missing / corrupt ⇒ throw before any request). GS_ALLOW_MISSING_SHARED=1 = v11.4.
 *
 * v11.3 (2026-08-27 — ΖΩΝΕΣ ΜΕ CARRIER SERVICE · διόρθωση σιωπηλής παλινδρόμησης):
 *   - FIX: μια ζώνη με ΕΝΕΡΓΟ carrier service δεν δηλώνει πια τη φθηνότερη FLAT μέθοδο.
 *     Από 25/08 19:30Z (πρώτο run μετά το go-live BOX NOW) ο feed δήλωνε GR = 4,00 EUR
 *     ενώ ο πελάτης πληρώνει 0,00 — σε 3.310 items, χωρίς κανένα σφάλμα.
 *   - NEW: CARRIER_BACKED_DECLARED — ρητή, μετρημένη τιμή ανά carrier-backed χώρα, με τεκμήριο.
 *   - NEW: fail-closed — carrier ζώνη χωρίς καταχώρηση αφαιρείται από τα rates (🔴 στο log)
 *     αντί να δηλωθεί λάθος τιμή.
 *   Λεπτομέρειες + τεκμήρια: δες το σχόλιο πάνω από το CARRIER_BACKED_DECLARED.
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
if (!ACCESS_TOKEN && process.argv[2] !== 'selftest') {   // v11.5: the offline self-test needs no token
  console.error('❌ ERROR: SHOPIFY_ACCESS_TOKEN environment variable not set!');
  console.error('   Set it with: set SHOPIFY_ACCESS_TOKEN=your_token_here');
  process.exit(1);
}
// v11.5 (B1): pin a SUPPORTED version. '2024-01' was silently served as 2025-10 (measured 21/09/2026);
// every value this generator reads was identical in 2025-10, 2026-01, 2026-04 and 2026-07 (0 differences).
const API_VERSION = '2026-07';
const BRAND = 'Emmanuela - handcrafted for you';
const OUTPUT_DIR = path.join(__dirname, 'feeds');

// ============================================
// v11.5 SWITCHES (environment). A KILL-SWITCH restores today's (v11.4) behaviour for its fix.
// OWNER-DECISION switches default to Bill's decisions of 21/09/2026: E1 = A and E3 = A reproduce today's output
// (GS_APPLY_PHOTOGATE / GS_APPLY_DROPENTRIES stay opt-in); E2 = ii does NOT — GS_BIGPRODUCT_MODE defaults to
// colour-stone, and GS_BIGPRODUCT_MODE=legacy is its kill-switch.
// ============================================
const envOn = name => process.env[name] === '1';
const LEGACY_CAPS = envOn('GS_LEGACY_CAPS');                // B2/B3 off: 20 media + first 100 variants (sliced in JS)
const VARIANTMEDIA_ON = !envOn('GS_NO_VARIANTMEDIA');       // B5 off: every variant is treated as unmatched (= today)
const OTHERCOLOUR_ON = !envOn('GS_NO_OTHERCOLOUR');         // B8 off
const LIFESTYLE_GUARD_ON = !envOn('GS_NO_LIFESTYLE_GUARD'); // B9 off
const LEGACY_PRICING = envOn('GS_LEGACY_PRICING');          // B10 off: v10 reference ratio (its fallbacks now THROW)
const APPLY_PHOTOGATE = envOn('GS_APPLY_PHOTOGATE');        // E1-B, opt-in: BestPrice FEED GATE v3
const APPLY_DROPENTRIES = envOn('GS_APPLY_DROPENTRIES');    // opt-in: PHOTOEXCL dropEntries (approved 15/09 for BP/GLAMI only)
const LEGACY_VARIANT_CAP = 100;                             // the old variants(first: 100)
const LEGACY_MEDIA_CAP = 20;                                // the old media(first: 20)
const BIGPRODUCT_MODES = ['legacy', 'all', 'colour-stone', 'colour'];
const BIGPRODUCT_MODE_DEFAULT = 'colour-stone';   // E2 = ii (Bill, 21/09/2026). 'legacy' = its kill-switch: the first 100, as before v11.5
let BIGPRODUCT_MODE = String(process.env.GS_BIGPRODUCT_MODE || BIGPRODUCT_MODE_DEFAULT).trim().toLowerCase();
if (!BIGPRODUCT_MODES.includes(BIGPRODUCT_MODE)) {
  // a typo must not change the feed: fall back to the DEFAULT (= the variable not set), loudly
  console.error(`🔴 GS_BIGPRODUCT_MODE="${process.env.GS_BIGPRODUCT_MODE}" is not one of ${BIGPRODUCT_MODES.join(' | ')} — using the default "${BIGPRODUCT_MODE_DEFAULT}".`);
  BIGPRODUCT_MODE = BIGPRODUCT_MODE_DEFAULT;
}
let EXTRA_IMAGES_CAP = 9;   // E3 default (A): up to 9 additional images, cut BEFORE the filters and never refilled
if (process.env.GS_EXTRA_IMAGES_CAP !== undefined && process.env.GS_EXTRA_IMAGES_CAP !== '') {
  const n = Number(process.env.GS_EXTRA_IMAGES_CAP);
  if (Number.isInteger(n) && n >= 0 && n <= 10) EXTRA_IMAGES_CAP = n;
  else console.error(`🔴 GS_EXTRA_IMAGES_CAP="${process.env.GS_EXTRA_IMAGES_CAP}" must be an integer 0..10 — using 9.`);
}
const CTX_BATCH = 250;             // B10: variant ids per contextual-pricing query (cost 37-38 per query, measured)
const CTX_MAX_NULL_SHARE = 0.005;  // B10/F5: more than 0.5% null prices IN ANY ONE pricing country ⇒ throw (0 of 118,692 on 21/09)
const BORROW_METAL_ONLY = envOn('GS_BORROW_METAL_ONLY');       // F1 off: the sibling borrow matches the metal colour only (round 1)
const SHIPPING_SOFTFAIL = envOn('GS_SHIPPING_SOFTFAIL');       // F3 off: a failed shipping fetch → feeds WITHOUT g:shipping (v11.4)
const ALLOW_MISSING_SHARED = envOn('GS_ALLOW_MISSING_SHARED'); // F8 off: a missing / corrupt shared JSON only logs (v11.4 copy)
let MIN_ITEMS = 1500;   // F4: fewer emitted in-stock variants than this ⇒ throw (3,297 on 21/09/2026)
if (process.env.GS_MIN_ITEMS !== undefined && process.env.GS_MIN_ITEMS !== '') {
  const n = Number(process.env.GS_MIN_ITEMS);
  if (Number.isInteger(n) && n >= 0) MIN_ITEMS = n;
  else console.error(`🔴 GS_MIN_ITEMS="${process.env.GS_MIN_ITEMS}" must be an integer ≥ 0 — using 1500.`);
}
// F7 / R3b: GS_BIGPRODUCT_MODE (E2) applies ONLY to these PRODUCT IDS (comma list of numeric ids or
// gid://shopify/Product/<id>). Default 4448531972131 = kremasto-monogramma-louloudi (702 variants on 21/09/2026).
// An id survives a handle rename. Any OTHER product with > 100 variants emits the first 100 (legacy) + a 🔴 line.
// An entry that is not a product id is ignored LOUDLY: it can only shrink the list, i.e. fall back to legacy.
const BIGPRODUCT_IDS = new Set();
for (const entry of String(process.env.GS_BIGPRODUCT_IDS === undefined ? '4448531972131' : process.env.GS_BIGPRODUCT_IDS).split(',')) {
  const id = entry.trim().replace(/^gid:\/\/shopify\/Product\//, '');
  if (/^\d+$/.test(id)) BIGPRODUCT_IDS.add(id);
  else if (id) console.error(`🔴 GS_BIGPRODUCT_IDS: "${entry.trim()}" is not a product id — ignored (an unlisted product with > 100 variants emits the first 100).`);
}
if (process.env.GS_BIGPRODUCT_HANDLES !== undefined) {
  console.error('🔴 GS_BIGPRODUCT_HANDLES is no longer read (v11.5 R3b) — the E2 list is GS_BIGPRODUCT_IDS (product ids).');
}
{
  const set = ['GS_LEGACY_CAPS', 'GS_NO_VARIANTMEDIA', 'GS_NO_PKGFILTER', 'GS_NO_PHOTOEXCL', 'GS_NO_OTHERCOLOUR',
    'GS_NO_LIFESTYLE_GUARD', 'GS_LEGACY_PRICING', 'GS_APPLY_PHOTOGATE', 'GS_APPLY_DROPENTRIES',
    'GS_BORROW_METAL_ONLY', 'GS_SHIPPING_SOFTFAIL', 'GS_ALLOW_MISSING_SHARED'].filter(envOn);
  console.log(`⚙️  v11.5 · API ${API_VERSION} · switches: ${set.length ? set.join(', ') : 'none'} · ` +
    `GS_BIGPRODUCT_MODE=${BIGPRODUCT_MODE} (product ids: ${[...BIGPRODUCT_IDS].join(',') || 'none'})` +
    `${LEGACY_CAPS && BIGPRODUCT_MODE !== 'legacy' ? ' → legacy, forced by GS_LEGACY_CAPS' : ''} · ` +
    `GS_EXTRA_IMAGES_CAP=${EXTRA_IMAGES_CAP} · GS_MIN_ITEMS=${MIN_ITEMS}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// v11.5 B6 — PKGFILTER. COPIED from bestprice-feed-gr.js L182-211 (approved there by Bill 14/09/2026);
// only the kill-switch name differs. No gift-box / packaging photo among the ADDITIONAL images, and the
// image_link guard in pickItemImages() keeps it out of image_link too.
// Data = the SHARED skroutz-jewelry-packaging.json (Skroutz lane, dHash, FROZEN 04/08) + name + PKG_EXTRA.
// ⚠ Since v11.5 an edit of that shared JSON also changes all 41 Google feeds.
// SUBTRACTIVE ONLY: cut to the cap first, then filter, NEVER refill. Kill-switch: GS_NO_PKGFILTER=1
// ─────────────────────────────────────────────────────────────────────────────
const PKG_NAME_RE = /(?:925[-_]sterling[-_]silver[-_]jewelry[-_]gift[-_]packaging|gift[-_]packaging|packaging[-_]emmanuela|packaging[-_]photo|emmanuela[-_]925[-_]sterling[-_]silver[-_]packaging)/i;
const PKG_EXTRA = ['ashmenio-mple-skoylariki-cuff-fidi-apo-ashmi-925-kosmhmata-emmanuela-856327.jpg'];
let PKG_FILES = new Set(PKG_EXTRA);
const PKG_ON = process.env.GS_NO_PKGFILTER !== '1';
if (PKG_ON) {
  try {
    const pj = JSON.parse(fs.readFileSync(path.join(__dirname, 'skroutz-jewelry-packaging.json'), 'utf8'));
    for (const f of (pj && pj.files) || []) PKG_FILES.add(String(f).toLowerCase());
    console.log(`  [PKGFILTER] λίστα συσκευασίας: ${PKG_FILES.size} αρχεία (generated ${(pj && pj.generated) || 'undated'}) + όνομα`);
  } catch (e) {
    console.error(`  [PKGFILTER] WARNING: skroutz-jewelry-packaging.json δεν διαβάζεται (${e.message}) — φίλτρο ΜΟΝΟ με όνομα + ${PKG_EXTRA.length} επιπλέον.`);
  }
} else {
  console.log('  [PKGFILTER] ΑΝΕΝΕΡΓΟ (GS_NO_PKGFILTER=1)');
}
function isPackagingImage(url) {
  if (!PKG_ON || !url) return false;
  const b = (String(url).split('/').pop() || '').split('?')[0].toLowerCase();
  return PKG_FILES.has(b) || PKG_NAME_RE.test(b);
}
// ─────────────────────────────────────────────────────────────────────────────
// v11.5 F2 — GOOGLE-LOCAL packaging additions (GS_PKG_EXTRA_LOCAL). They are NOT in the shared
// skroutz-jewelry-packaging.json: that file belongs to the Skroutz lane and is FROZEN (04/08) — never edit it from
// here. Each entry below was checked by eye AND by dHash on 21/09/2026:
//   …-413823.jpg  kremasto-monogramma, the last of its 17 images: the EMMANUELA branded bag, box and pouch — the same
//                 shot as the listed …gift-packaging… photos (dHash 0–1 bits). With B5 it had started to ship as an
//                 additional image of the 24 Μαύρο ανθρακί items per feed (984 items in 41 feeds).
// Same scope as PKG_EXTRA: additional images, lifestyle and the image_link guard. GS_NO_PKGFILTER=1 turns these off too.
// ─────────────────────────────────────────────────────────────────────────────
const GS_PKG_EXTRA_LOCAL = [
  'ashmenio-kremasto-mentagion-monogramma-apo-ashmi-925-kosmhmata-emmanuela-413823.jpg',
];
for (const f of GS_PKG_EXTRA_LOCAL) PKG_FILES.add(f.toLowerCase());
if (PKG_ON) console.log(`  [PKGFILTER] + ${GS_PKG_EXTRA_LOCAL.length} Google-local (GS_PKG_EXTRA_LOCAL) = ${PKG_FILES.size} αρχεία`);

// ─────────────────────────────────────────────────────────────────────────────
// v11.5 B7 — PHOTOEXCL. COPIED from bestprice-feed-gr.js L223-248 (approved there by Bill 15/09/2026);
// only the kill-switch name differs. Data: the SHARED jewelry-photo-exclusions.json, key
// (handle, RAW Shopify colour value, basename). Google keys EACH ITEM by its own raw colour:
// raws = [extractVariantColor(variant.selectedOptions)]. Removes ADDITIONAL images only (never image_link).
// dropEntries is applied ONLY with the opt-in GS_APPLY_DROPENTRIES=1 (the 15/09 approval covered BP/GLAMI).
// ⚠ FROZEN: newer / re-ordered photos are not covered until a new measurement. Kill-switch: GS_NO_PHOTOEXCL=1
// ─────────────────────────────────────────────────────────────────────────────
let PHOTOEXCL = { extras: {}, dropEntries: {} };
const PHOTOEXCL_ON = process.env.GS_NO_PHOTOEXCL !== '1';
if (PHOTOEXCL_ON) {
  try {
    const pe = JSON.parse(fs.readFileSync(path.join(__dirname, 'jewelry-photo-exclusions.json'), 'utf8'));
    PHOTOEXCL = { extras: (pe && pe.extras) || {}, dropEntries: (pe && pe.dropEntries) || {} };
    console.log(`  [PHOTOEXCL] προϊόντα με αποκλεισμούς: ${Object.keys(PHOTOEXCL.extras).length} · καταχωρήσεις προς αποκοπή: ${Object.keys(PHOTOEXCL.dropEntries).length} (generated ${(pe && pe.generated) || 'undated'})`);
  } catch (e) {
    console.error(`  [PHOTOEXCL] WARNING: jewelry-photo-exclusions.json δεν διαβάζεται (${e.message}) — ΚΑΝΕΝΑΣ αποκλεισμός.`);
  }
} else {
  console.log('  [PHOTOEXCL] ΑΝΕΝΕΡΓΟ (GS_NO_PHOTOEXCL=1)');
}
function isExcludedExtra(handle, raws, url) {
  if (!PHOTOEXCL_ON || !raws.length || !url) return false;
  const byRaw = PHOTOEXCL.extras[handle]; if (!byRaw) return false;
  const b = (String(url).split('/').pop() || '').split('?')[0].toLowerCase();
  return raws.every(r => Array.isArray(byRaw[r]) && byRaw[r].includes(b));
}
function isDroppedEntry(handle, raws) {
  const d = PHOTOEXCL.dropEntries[handle];
  return !!(PHOTOEXCL_ON && Array.isArray(d) && raws.length && raws.every(r => d.includes(r)));
}

// ─────────────────────────────────────────────────────────────────────────────
// v11.5 F8 — the two SHARED JSONs are FAIL-CLOSED for Google. The loaders above are verbatim BestPrice copies and only
// log; without the files ~2,237 packaging and ~693 listed wrong-colour extras per feed would silently come back.
// A missing, unparsable or wrongly shaped file is recorded here and assertSharedJson() — the FIRST step of both CLI
// paths — stops the run before any request or write. Kill-switch GS_ALLOW_MISSING_SHARED=1 = log and continue (v11.4 copy).
// ─────────────────────────────────────────────────────────────────────────────
const _sharedJsonProblems = [];
function _checkSharedJson(file, validate) {
  let problem;
  try { problem = validate(JSON.parse(fs.readFileSync(path.join(__dirname, file), 'utf8'))); }
  catch (e) { problem = e.message; }
  if (problem) _sharedJsonProblems.push(`${file}: ${problem}`);
}
if (PKG_ON) _checkSharedJson('skroutz-jewelry-packaging.json', j =>
  (j && Array.isArray(j.files) && j.files.length > 0 && j.files.every(f => typeof f === 'string'))
    ? null : '"files" is not a non-empty list of file names');
if (PHOTOEXCL_ON) _checkSharedJson('jewelry-photo-exclusions.json', j =>
  (j && j.extras && typeof j.extras === 'object' && !Array.isArray(j.extras) && Object.keys(j.extras).length > 0
    && (j.dropEntries === undefined || (j.dropEntries && typeof j.dropEntries === 'object' && !Array.isArray(j.dropEntries))))
    ? null : '"extras" is not a non-empty object (or "dropEntries" is not an object)');
function assertSharedJson() {
  if (!_sharedJsonProblems.length) return;
  for (const p of _sharedJsonProblems) console.error(`   🔴 shared JSON: ${p}`);
  if (ALLOW_MISSING_SHARED) {
    console.error('   🔴 GS_ALLOW_MISSING_SHARED=1 — continuing WITHOUT it (v11.4 behaviour): packaging / listed photos may ship.');
    return;
  }
  throw new Error(`${_sharedJsonProblems.length} shared JSON file(s) missing or corrupt — fail-closed, nothing fetched or written ` +
    '(GS_ALLOW_MISSING_SHARED=1 overrides)');
}

// ─────────────────────────────────────────────────────────────────────────────
// v11.5 — RAW COLOUR of a variant. extractVariantColor + COLOR_MAP_GREEK COPIED from bestprice-feed-gr.js
// (L477-502 and L377-406) so that the PHOTOEXCL key is IDENTICAL to BestPrice/GLAMI.
// getGreekColor (L413-433) is used ONLY by the opt-in E1-B gate.
// ─────────────────────────────────────────────────────────────────────────────
const COLOR_MAP_GREEK = {
  'ασημένιο': 'ασημί', 'ασημένια': 'ασημί', 'ασημένιος': 'ασημί', 'ασημί': 'ασημί',
  'επιχρυσωμένο': 'χρυσό', 'επιχρυσωμένα': 'χρυσό', 'επιχρυσωμένος': 'χρυσό',
  'επιχρυσωμένη': 'χρυσό', 'επιχυσωμένο': 'χρυσό',
  'χρυσό': 'χρυσό', 'χρυσός': 'χρυσό', 'χρυσά': 'χρυσό', 'χρυσή': 'χρυσό',
  'χρυσές': 'χρυσό', 'χρυσοί': 'χρυσό',
  'μαύρη': 'μαύρο', 'μαύρες': 'μαύρο', 'μαύροι': 'μαύρο',
  'ασημένιες': 'ασημί', 'ασημένιοι': 'ασημί',
  'επιχρυσωμένες': 'χρυσό', 'επιχρυσωμένοι': 'χρυσό',
  'οξειδωμένη': 'γκρι', 'οξειδωμένες': 'γκρι', 'οξειδωμένος': 'γκρι', 'οξειδωμένοι': 'γκρι',
  'λευκή': 'λευκό', 'λευκές': 'λευκό', 'λευκός': 'λευκό', 'λευκοί': 'λευκό',
  'μαύρο': 'μαύρο', 'μαύρα': 'μαύρο', 'μαύρος': 'μαύρο', 'μαύρο ανθρακί': 'μαύρο',
  'οξειδωμένο': 'γκρι', 'οξειδωμένα': 'γκρι', 'ανθρακί': 'γκρι',
  'μαύρα ανθρακί': 'μαύρο',
  'ροζ': 'ροζ', 'ροζ επιχρυσωμένο': 'ροζ', 'ροζ επιχρυσωμένα': 'ροζ', 'ροζ χρυσό': 'ροζ',
  'λευκό': 'λευκό', 'λευκά': 'λευκό',
  'μπλε': 'μπλε', 'πράσινο': 'πράσινο', 'πράσινα': 'πράσινο',
  'κόκκινο': 'κόκκινο', 'κόκκινα': 'κόκκινο', 'μπορντό': 'μπορντό',
  'μωβ': 'μωβ', 'τιρκουάζ': 'τιρκουάζ', 'σομόν': 'σομόν',
  'πολύχρωμο': 'πολύχρωμο', 'πολύχρωμα': 'πολύχρωμο', 'πολύχρωμο σετ': 'πολύχρωμο',
  'silver': 'ασημί', 'gold': 'χρυσό', 'black': 'μαύρο',
};
function getGreekColor(variantColorRaw) {
  if (!variantColorRaw) return null;
  if (/\d/.test(variantColorRaw)) return null;
  const rawHead = variantColorRaw.trim().split(/\s+με\s+/)[0].trim() || variantColorRaw.trim();
  const normalized = rawHead.toLowerCase();
  if (normalized.length > 25) return null;
  if (COLOR_MAP_GREEK[normalized]) return COLOR_MAP_GREEK[normalized];
  for (const key of Object.keys(COLOR_MAP_GREEK).sort((a, b) => b.length - a.length)) {
    if (normalized.includes(key)) return COLOR_MAP_GREEK[key];
  }
  return rawHead;
}
function extractVariantColor(selectedOptions) {
  if (!selectedOptions) return null;
  // bestprice v3.2 (2026-08-24): the EXACT colour axis first, so a composite option name
  // («Επίλεξε νούμερο και χρώμα») cannot shadow the genuine «Χρώμα» that follows it.
  for (const opt of selectedOptions) {
    const exact = (opt.name || '').toLowerCase().trim();
    if (exact === 'χρώμα' || exact === 'χρώμα μετάλλου' || exact === 'color' || exact === 'colour') {
      return opt.value;
    }
  }
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
// v11.5 F1 — the key of the same-colour sibling borrow: the raw colour (as above) PLUS every colour-like option
// (name contains χρώμα / color / colour, accents and case ignored: Χρώμα, Χρώμα μετάλλου, Χρώμα πέτρας, Χρώμα
// μαργαριταριού, Χρώμα ζιρκόν …). With the metal alone, a black-pearl item showed its white-pearl sibling's photo
// and a purple-stone item the yellow one (11 of 20 borrow items per feed on 21/09).
const _flatName = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
function isColourLikeOption(name) {
  const n = _flatName(name);
  return n.includes('χρωμα') || n.includes('color') || n.includes('colour');
}
function borrowKeyOf(selectedOptions) {
  const raw = extractVariantColor(selectedOptions);
  if (!raw || BORROW_METAL_ONLY) return raw;   // GS_BORROW_METAL_ONLY=1: the round-1 key (metal colour only)
  return raw + '\u0001' + (selectedOptions || []).filter(o => isColourLikeOption(o.name))
    .map(o => _flatName(o.name) + '=' + o.value).join('\u0001');
}

// ─────────────────────────────────────────────────────────────────────────────
// v11.5 E1-B (OPT-IN, GS_APPLY_PHOTOGATE=1) — BestPrice FEED GATE v3 (bestprice L930-958, Bill's rule of
// 14/05/2026 «better to not list than to mislead»): an item with NO photo of its own colour (fallback path)
// in a product with > 1 distinct colour is NOT listed, unless Emmanouela's label in the SHARED
// jewelry-photocolor.json says its image_link shows exactly that colour. Loader COPIED from bestprice L257-285.
// Default OFF = option (A): keep listing such items, as today.
// ─────────────────────────────────────────────────────────────────────────────
let JPHOTO_LABELS = new Map();
let JPHOTO_NONE = new Set();
if (APPLY_PHOTOGATE) {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(__dirname, 'jewelry-photocolor.json'), 'utf8'));
    const obj = (j && typeof j === 'object' && j.labels && typeof j.labels === 'object') ? j.labels : j;
    for (const [f, c] of Object.entries(obj || {})) {
      if (typeof c !== 'string') continue;
      if (c === '__NONE__') JPHOTO_NONE.add(f); else JPHOTO_LABELS.set(f, c);
    }
    console.log(`  [JPHOTO] ετικέτες: ${JPHOTO_LABELS.size} χρώμα + ${JPHOTO_NONE.size} μη-κόσμημα, generated ${(j && j.generated) || 'undated'}`);
  } catch (e) {
    console.error(`  [JPHOTO] WARNING: jewelry-photocolor.json δεν διαβάζεται (${e.message}) — το gate θα κόβει ΧΩΡΙΣ δεύτερη γνώμη.`);
  }
}
function jphotoColourOf(imageUrl) {
  if (!imageUrl) return null;
  const b = (String(imageUrl).split('/').pop() || '').split('?')[0];
  return JPHOTO_LABELS.get(b) || null;
}
const GATE_COLOUR_TO_LABEL = {
  'ασημί': 'Ασημί', 'χρυσό': 'Χρυσό', 'ροζ': 'Ροζ',
  'μαύρο': 'Μαύρο', 'πολύχρωμο': 'Πολύχρωμο', 'γκρι': null,
};

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
// PRODUCT TYPE TRANSLATIONS — ΕΠΙΜΕΛΗΜΕΝΟΣ χάρτης (ΟΧΙ οι μεταφράσεις της Shopify).
// ⚠ 2026-08-11: το παλιό σχόλιο έλεγε «Shopify product_type is NOT translatable via API» και ΕΙΝΑΙ
// ΨΕΥΔΕΣ — το product_type ΕΧΕΙ μεταφράσεις σε 20 locales (μετρημένο, 464 προϊόντα). Τις ΔΕΝ
// χρησιμοποιούμε ΣΚΟΠΙΜΑ: φέρουν 53 ασυνέπειες και λάθος σημασίες (π.χ. mt «Widnejn»=ΑΥΤΙΑ).
// Ο επιμελημένος χάρτης είναι ΑΝΩΤΕΡΟΣ — αρκεί να μη λείπουν κλειδιά (βλ. FILL παρακάτω).
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

// ============================================
// 2026-08-11 — ΣΥΜΠΛΗΡΩΣΗ ΚΕΝΩΝ ΚΛΕΙΔΙΩΝ (μετρημένο πρόβλημα, όχι εικασία)
// 7 ζωντανοί τύποι ΔΕΝ υπήρχαν σε ΚΑΜΙΑ γλώσσα ⇒ ο fallback έβγαζε ΩΜΑ ΕΛΛΗΝΙΚΑ μέσα σε κάθε
// ξενόγλωσσο feed: 671 / 3.283 items = 20,4% (μετρημένο σε de/it/es/fr, 11/08/2026).
// Επιπλέον it/es δεν είχαν «Ανδρικά δαχτυλίδια»/«Ανδρικά βραχιόλια» ⇒ 274 items (8,3%) έβγαιναν
// ΑΓΓΛΙΚΑ («Men's Rings») μέσα σε ιταλικό/ισπανικό feed.
// Οι όροι είναι HARVESTED: είτε από τους δικούς μας τίτλους ανά γλώσσα, είτε mirror του ήδη
// υπάρχοντος θηλυκού κλειδιού του ίδιου χάρτη. Το «Ear Jacket» μένει δάνειο, όπως ήδη κάνει ο
// χάρτης για «Ear Cuff» και «Ear Climber» και στις 5 γλώσσες.
// ⚠ Ο βρόχος γράφει ΜΟΝΟ όπου ΔΕΝ υπάρχει κλειδί — καμία υπάρχουσα τιμή δεν αλλάζει.
// ============================================
const PRODUCT_TYPE_TRANSLATIONS_FILL = {
  en: {
    'Ανδρικά μενταγιόν': "Men's Pendants",
    'Ανδρικά σκουλαρίκια κρίκοι': "Men's Hoop Earrings",
    'Ανδρικά σκουλαρίκια ear climber': "Men's Ear Climber Earrings",
    'Ανδρικά σκουλαρίκια ear jacket': "Men's Ear Jacket Earrings",
    'Γυναικεία σκουλαρίκια ear jacket': "Women's Ear Jacket Earrings",
    'Γυναικεία σκουλαρίκια μύτης': "Women's Nose Rings",
    'Καρφίτσες': 'Brooches',
  },
  de: {
    'Ανδρικά μενταγιόν': 'Herren Anhänger',
    'Ανδρικά σκουλαρίκια κρίκοι': 'Herren Creolen',
    'Ανδρικά σκουλαρίκια ear climber': 'Herren Ear Climber Ohrringe',
    'Ανδρικά σκουλαρίκια ear jacket': 'Herren Ear Jacket Ohrringe',
    'Γυναικεία σκουλαρίκια ear jacket': 'Damen Ear Jacket Ohrringe',
    'Γυναικεία σκουλαρίκια μύτης': 'Damen Nasenringe',
    'Καρφίτσες': 'Broschen',
  },
  fr: {
    'Ανδρικά μενταγιόν': 'Pendentifs Homme',
    'Ανδρικά σκουλαρίκια κρίκοι': "Boucles d'oreilles Créoles Homme",
    'Ανδρικά σκουλαρίκια ear climber': "Boucles d'oreilles Ear Climber Homme",
    'Ανδρικά σκουλαρίκια ear jacket': "Boucles d'oreilles Ear Jacket Homme",
    'Γυναικεία σκουλαρίκια ear jacket': "Boucles d'oreilles Ear Jacket Femme",
    'Γυναικεία σκουλαρίκια μύτης': 'Anneaux de Nez Femme',
    'Καρφίτσες': 'Broches',
  },
  it: {
    'Ανδρικά μενταγιόν': 'Ciondoli Uomo',
    'Ανδρικά σκουλαρίκια κρίκοι': 'Orecchini a Cerchio Uomo',
    'Ανδρικά σκουλαρίκια ear climber': 'Orecchini Ear Climber Uomo',
    'Ανδρικά σκουλαρίκια ear jacket': 'Orecchini Ear Jacket Uomo',
    'Γυναικεία σκουλαρίκια ear jacket': 'Orecchini Ear Jacket Donna',
    'Γυναικεία σκουλαρίκια μύτης': 'Anelli al Naso Donna',
    'Καρφίτσες': 'Spille',
    'Ανδρικά δαχτυλίδια': 'Anelli Uomo',
    'Ανδρικά βραχιόλια': 'Bracciali Uomo',
    'Ανδρικά κολιέ': 'Collane Uomo',
  },
  es: {
    'Ανδρικά μενταγιόν': 'Colgantes Hombre',
    'Ανδρικά σκουλαρίκια κρίκοι': 'Pendientes de Aro Hombre',
    'Ανδρικά σκουλαρίκια ear climber': 'Pendientes Ear Climber Hombre',
    'Ανδρικά σκουλαρίκια ear jacket': 'Pendientes Ear Jacket Hombre',
    'Γυναικεία σκουλαρίκια ear jacket': 'Pendientes Ear Jacket Mujer',
    'Γυναικεία σκουλαρίκια μύτης': 'Anillos Nasales Mujer',
    'Καρφίτσες': 'Broches',
    'Ανδρικά δαχτυλίδια': 'Anillos Hombre',
    'Ανδρικά βραχιόλια': 'Pulseras Hombre',
    'Ανδρικά κολιέ': 'Collares Hombre',
  },
};
for (const _lang of Object.keys(PRODUCT_TYPE_TRANSLATIONS_FILL)) {
  if (!PRODUCT_TYPE_TRANSLATIONS[_lang]) continue;
  for (const [_k, _v] of Object.entries(PRODUCT_TYPE_TRANSLATIONS_FILL[_lang])) {
    if (!PRODUCT_TYPE_TRANSLATIONS[_lang][_k]) PRODUCT_TYPE_TRANSLATIONS[_lang][_k] = _v;
  }
}

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

let _servedVersionWarned = false;   // v11.5 (B1)

// v11.5: optional GraphQL `variables` (a request without them sends exactly the same bytes as before).
async function graphqlRequest(query, maxRetries = 4, variables = undefined) {
  const options = {
    hostname: SHOPIFY_STORE,
    path: `/admin/api/${API_VERSION}/graphql.json`,
    method: 'POST',
    headers: { 'X-Shopify-Access-Token': ACCESS_TOKEN, 'Content-Type': 'application/json' }
  };
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const result = await httpsRequest(options, JSON.stringify(variables ? { query, variables } : { query }));
    // v11.5 (B1): Shopify silently serves ANOTHER version when the requested one is unsupported — say so, once
    const served = result.headers && result.headers['x-shopify-api-version'];
    if (served && served !== API_VERSION && !_servedVersionWarned) {
      _servedVersionWarned = true;
      console.warn(`\n⚠️  WARN: requested Shopify API ${API_VERSION} but was SERVED ${served} — update API_VERSION to a supported version.`);
    }
    // Check for Shopify throttling (THROTTLED error or 429 status)
    const isThrottled = result.statusCode === 429 ||
      (result.data?.errors && result.data.errors[0]?.extensions?.code === 'THROTTLED');
    if (isThrottled && attempt < maxRetries) {
      const wait = Math.min(2000 * Math.pow(2, attempt), 15000); // 2s, 4s, 8s, 15s
      process.stdout.write(` [throttled, retry in ${wait/1000}s]`);
      await new Promise(r => setTimeout(r, wait));
      continue;
    }
    // v11.5 (B4): still throttled after the last retry = a FAILURE, never data (it used to be returned as data)
    if (isThrottled) throw new Error(`Shopify THROTTLED after ${maxRetries} retries — giving up (fail-closed)`);
    return result;
  }
}


// ============================================
// v6 NEW: FETCH SHIPPING RATES FROM SHOPIFY
// ============================================

/**
 * v11.3 (2026-08-27) — ΖΩΝΕΣ ΜΕ CARRIER SERVICE
 *
 * ΤΟ ΠΕΡΙΣΤΑΤΙΚΟ: στις 25/08 14:01Z, με το go-live του BOX NOW, απενεργοποιήθηκε η flat
 * μέθοδος «Δωρεάν αποστολή ACS» (0,00 EUR) της ζώνης Ελλάδας και τη θέση της πήρε ένα
 * carrier service. Η συνάρτηση αγνοεί τα carrier rates (`if (!price) continue`), οπότε
 * άρχισε να παίρνει ως «φθηνότερη» την επόμενη flat: **4,00 EUR**.
 * Αποτέλεσμα: από το run της 25/08 19:30Z, **και τα 3.310 ελληνικά items δήλωναν στη
 * Google 4,00 EUR μεταφορικά ενώ ο πελάτης πληρώνει 0,00** — χωρίς κανένα σφάλμα.
 * Τεκμήριο: feeds/emmanuela-gr.xml @ 9bc107f2 (21/08 13:36Z) = 0.00 EUR
 *                                  @ 11737b6a (25/08 19:30Z) = 4.00 EUR.
 *
 * Ο ΚΑΝΟΝΑΣ: όταν μια ζώνη έχει ΕΝΕΡΓΟ carrier service, την τιμή την υπολογίζει το app
 * τη στιγμή του checkout — ΔΕΝ ζει στο Admin API. Η φθηνότερη flat μέθοδος ΔΕΝ είναι
 * αυτό που πληρώνει ο πελάτης, και ΑΠΑΓΟΡΕΥΕΤΑΙ να δηλωθεί ως τέτοια.
 *
 * ΤΙ ΚΑΝΟΥΜΕ: κάθε carrier-backed χώρα πρέπει να έχει ρητή, ΜΕΤΡΗΜΕΝΗ καταχώρηση εδώ.
 * Αν δεν έχει → fail-closed: αφαιρείται από τα rates (η Google πέφτει στις ρυθμίσεις
 * λογαριασμού GMC) και τυπώνεται 🔴. ΠΟΤΕ σιωπηλή επιστροφή στη flat τιμή.
 */
const CARRIER_BACKED_DECLARED = {
  GR: {
    price: 0, currency: 'EUR',
    measuredAt: '2026-08-27T10:50Z',
    evidence: 'emmanuela.gr/cart/shipping_rates.json με πραγματικό καλάθι, 5 ΤΚ ' +
              '(54622 Θεσσαλονίκη · 41221 Λάρισα · 36100 Καρπενήσι · 84600 Μύκονος · 82101 Οινούσσες) ' +
              '→ φθηνότερη 0,00 EUR σε 5/5. Όπου υπάρχει BOX NOW = δωρεάν θυρίδα· ' +
              'όπου δεν υπάρχει, το app γυρίζει ACS στην πόρτα 0,00 EUR. ' +
              'Επιβεβαιωμένο από τον ιδιοκτήτη 27/08.'
  },
};

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
            locationGroupZones(first: 100) {
              pageInfo { hasNextPage }
              nodes {
                zone {
                  name
                  countries {
                    code {
                      countryCode
                    }
                  }
                }
                methodDefinitions(first: 50, eligible: true) {
                  pageInfo { hasNextPage }
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
                      ... on DeliveryParticipant {
                        carrierService {
                          formattedName
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
      // v11.5 F3: FAIL-CLOSED — a null here used to write all 41 feeds with NO g:shipping and exit 0
      if (SHIPPING_SOFTFAIL) return null;
      throw new Error('shipping rates: GraphQL errors — fail-closed, nothing written (GS_SHIPPING_SOFTFAIL=1 = feeds without g:shipping)');
    }
    
    const profiles = data.data?.deliveryProfiles?.nodes || [];
    // v11.5 F3: no delivery profile at all = not a real answer (every g:shipping would silently disappear)
    if (!profiles.length && !SHIPPING_SOFTFAIL) throw new Error('shipping rates: no delivery profiles in the response — fail-closed, nothing written');
    const countryRates = {};
    const carrierBacked = new Set();   // v11.3: χώρες όπου την τιμή τη λέει το app, όχι το Admin API

    for (const profile of profiles) {
      for (const group of profile.profileLocationGroups || []) {
        // v11.4: ΦΡΟΥΡΟΣ ΚΟΠΗΣ. Ένα `first: N` χωρίς έλεγχο παράγει ΣΙΩΠΗΛΗ απώλεια ζωνών —
        // και η ζώνη «Ελλάδα» κάθεται στο ΤΕΛΟΣ της λίστας (ελληνικό όνομα, μετά τα λατινικά),
        // δηλαδή είναι Η ΠΡΩΤΗ που χάνεται. (Μετρημένο από τη λωρίδα [BestPrice] 27/08:
        // `first: 12` γύρισε 12 ζώνες ΧΩΡΙΣ την Ελλάδα και τύπωσε «δεν βρέθηκε ζώνη GR».)
        if (group.locationGroupZones?.pageInfo?.hasNextPage) {
          console.error('   🔴 ΚΟΜΜΕΝΟ locationGroupZones — υπάρχουν ΠΕΡΙΣΣΟΤΕΡΕΣ ζώνες από όσες διάβασα.');
          console.error('      Τα shipping rates ΕΙΝΑΙ ΕΛΛΙΠΗ. Αύξησε το `first:` και ξανατρέξε.');
          // v11.5 F3: an incomplete zone list is an incomplete fetch ⇒ stop (40 of 100 zones on 21/09, hasNextPage false)
          if (!SHIPPING_SOFTFAIL) throw new Error('shipping rates: locationGroupZones truncated — fail-closed, nothing written');
        }

        for (const zoneData of group.locationGroupZones?.nodes || []) {
          const zone = zoneData.zone;
          const countries = (zone?.countries || []).map(c => c.code?.countryCode).filter(Boolean);

          // v11.3: έχει η ζώνη ΕΝΕΡΓΟ carrier service; Αν ναι, οι flat τιμές της ΔΕΝ κρίνουν.
          if ((zoneData.methodDefinitions?.nodes || []).some(m => m.active && m.rateProvider?.carrierService)) {
            for (const cc of countries) carrierBacked.add(cc);
          }

          // v11.4: αν οι μέθοδοι της ζώνης ΚΟΠΗΚΑΝ, ο carrier μπορεί να κρύβεται πέρα από το όριο
          // ⇒ ΔΕΝ ΞΕΡΩ αν η ζώνη είναι carrier-backed. Την περνώ ως ΑΓΝΩΣΤΗ, ώστε να πιαστεί από
          // τον fail-closed κλάδο παρακάτω — ΠΟΤΕ σιωπηλή αποδοχή της φθηνότερης flat.
          if (zoneData.methodDefinitions?.pageInfo?.hasNextPage) {
            console.error(`   🔴 ΚΟΜΜΕΝΟ methodDefinitions στη ζώνη «${zone?.name}» — ο carrier μπορεί να είναι εκτός ορίου.`);
            for (const cc of countries) carrierBacked.add(cc);
          }

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
    
    // ── v11.3: CARRIER-BACKED ΖΩΝΕΣ — η flat τιμή ΔΕΝ είναι αυτό που πληρώνει ο πελάτης ──
    if (carrierBacked.size) {
      console.log(`   🚚 Carrier-backed χώρες: ${[...carrierBacked].join(', ')} (τιμή από το app στο checkout)`);
    }
    for (const cc of carrierBacked) {
      const declared = CARRIER_BACKED_DECLARED[cc];
      const flat = countryRates[cc];

      if (!declared) {
        // FAIL-CLOSED: καλύτερα ΚΑΜΙΑ δήλωση (η Google πέφτει στο GMC) παρά ΛΑΘΟΣ δήλωση.
        console.error(`   🔴 ${cc}: ζώνη με ΕΝΕΡΓΟ carrier χωρίς καταχώρηση στο CARRIER_BACKED_DECLARED.`);
        console.error(`      flat cheapest = ${flat ? flat.price + ' ' + flat.currency : '—'} — ΔΕΝ το δηλώνω, ΔΕΝ το ξέρω.`);
        console.error(`      ΕΝΕΡΓΕΙΑ: μέτρα το ταμείο (/cart/shipping_rates.json) και πρόσθεσε τη χώρα με τεκμήριο.`);
        delete countryRates[cc];
        continue;
      }

      if (flat && Math.abs(flat.price - declared.price) > 0.005) {
        console.log(`   ⚠️  ${cc}: flat cheapest ${flat.price} ${flat.currency} → ΔΗΛΩΝΩ ${declared.price} ${declared.currency}`);
        console.log(`      τεκμήριο (${declared.measuredAt}): ${declared.evidence}`);
      }
      countryRates[cc] = { price: declared.price, currency: declared.currency };
    }

    // v8: Puerto Rico fallback — PR is a US territory, shares US shipping rate
    // Shopify may not list PR as a separate country in shipping zones
    if (!countryRates['PR'] && countryRates['US']) {
      countryRates['PR'] = { ...countryRates['US'] };
      console.log(`   📌 PR (Puerto Rico): inherited US shipping rate (${countryRates['US'].price} ${countryRates['US'].currency})`);
    }

    // v11.5 F3: 0 countries with a rate = every item would lose g:shipping ⇒ stop (61 countries on 21/09)
    if (!Object.keys(countryRates).length && !SHIPPING_SOFTFAIL) {
      throw new Error('shipping rates: 0 countries with a rate — fail-closed, nothing written');
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
    if (SHIPPING_SOFTFAIL) return null;   // v11.4 behaviour: feeds without g:shipping
    throw error;                          // v11.5 F3: THROTTLED after the retries / network / the checks above
  }
}

/**
 * v8.0: Format shipping tag for Google Shopping with service name + handling/transit times
 * @param {string} countryCode - 2-letter country code
 * @param {object} shippingRates - Rates from fetchShippingRates()
 * @returns {string} XML shipping tag or empty string
 */
const _shipCurrencyWarned = new Set();   // v11.5 (B11)

function formatShippingTag(countryCode, shippingRates) {
  if (!shippingRates || !shippingRates[countryCode]) {
    return '';  // No shipping data available
  }

  const rate = shippingRates[countryCode];
  // v9: Use MARKETS currency (authoritative) instead of Shopify API currency
  // Fixes BG showing BGN instead of EUR (Shopify API hasn't updated post-Euro adoption)
  const currency = (MARKETS[countryCode] && MARKETS[countryCode].currency) || rate.currency;
  // v11.5 (B11): the relabel above is deliberate (BG/BGN) but must be VISIBLE — once per country, output unchanged
  if (rate.currency && rate.currency !== currency && !_shipCurrencyWarned.has(countryCode)) {
    _shipCurrencyWarned.add(countryCode);
    console.warn(`   ⚠️ WARN shipping ${countryCode}: Admin API rate is in ${rate.currency}, the feed labels it ${currency} (MARKETS) — the amount is NOT converted`);
  }
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
      <g:return_policy_label>${returnLabel}</g:return_policy_label>`;
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
// PRODUCT HIGHLIGHTS (per language — max 6 bullet points)
// ============================================

const PRODUCT_HIGHLIGHTS = {
  en: [
    'Handcrafted in Greece by skilled artisans',
    'Made with premium quality materials',
    'Unique artisan design — no two pieces are identical',
    'Comes in a beautiful gift-ready box',
    'Free shipping to most countries',
    'Easy 30-day returns',
  ],
  de: [
    'Handgefertigt in Griechenland von erfahrenen Kunsthandwerkern',
    'Hergestellt aus hochwertigen Materialien',
    'Einzigartiges Kunsthandwerk — kein Stück gleicht dem anderen',
    'Wird in einer schönen Geschenkbox geliefert',
    'Kostenloser Versand in die meisten Länder',
    'Einfache Rückgabe innerhalb von 30 Tagen',
  ],
  fr: [
    'Fabriqué à la main en Grèce par des artisans qualifiés',
    'Fabriqué avec des matériaux de qualité supérieure',
    'Design artisanal unique — aucune pièce n\'est identique',
    'Livré dans un bel écrin cadeau',
    'Livraison gratuite dans la plupart des pays',
    'Retours faciles sous 30 jours',
  ],
  it: [
    'Realizzato a mano in Grecia da artigiani esperti',
    'Realizzato con materiali di prima qualità',
    'Design artigianale unico — nessun pezzo è identico',
    'Consegnato in un\'elegante confezione regalo',
    'Spedizione gratuita nella maggior parte dei paesi',
    'Reso facile entro 30 giorni',
  ],
  es: [
    'Hecho a mano en Grecia por artesanos cualificados',
    'Fabricado con materiales de primera calidad',
    'Diseño artesanal único — no hay dos piezas iguales',
    'Se entrega en una hermosa caja de regalo',
    'Envío gratuito a la mayoría de los países',
    'Devoluciones fáciles en 30 días',
  ],
  el: [
    'Χειροποίητο στην Ελλάδα από εξειδικευμένους τεχνίτες',
    'Κατασκευασμένο από υλικά υψηλής ποιότητας',
    'Μοναδικός σχεδιασμός — κανένα κομμάτι δεν είναι ίδιο',
    'Παραδίδεται σε όμορφη συσκευασία δώρου',
    'Δωρεάν αποστολή στις περισσότερες χώρες',
    'Εύκολες επιστροφές εντός 30 ημερών',
  ],
  nl: [
    'Handgemaakt in Griekenland door ervaren ambachtslieden',
    'Gemaakt van hoogwaardige materialen',
    'Uniek ambachtelijk ontwerp — geen twee stuks zijn identiek',
    'Wordt geleverd in een prachtige geschenkdoos',
    'Gratis verzending naar de meeste landen',
    'Eenvoudig retourneren binnen 30 dagen',
  ],
  ja: [
    'ギリシャの熟練職人による手作り',
    '高品質な素材を使用',
    'ユニークな職人デザイン — 同じものは二つとない',
    '美しいギフトボックス入り',
    'ほとんどの国への送料無料',
    '30日間の簡単返品',
  ],
};

function getProductHighlights(language) {
  return PRODUCT_HIGHLIGHTS[language] || PRODUCT_HIGHLIGHTS['en'];
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
            media(first: 50) {
              pageInfo { hasNextPage }
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
            variantsCount { count precision }
            variants(first: 100) {
              pageInfo { hasNextPage endCursor }
              edges {
                node {
                  ${VARIANT_NODE_FIELDS}
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
      // v11.5 (B4): an error page used to `break` and the PARTIAL catalog was written to all feeds
      if (data.errors) { console.error('GraphQL errors:', data.errors); throw new Error(`products page ${page}: GraphQL errors — fail-closed, nothing written`); }
      
      const products = data.data?.products?.edges || [];
      // v11.5 (B3): for…of instead of forEach, so the loop can await the variant follow-up pages
      for (const { node } of products) {
        // v11.5 (B2): media must be COMPLETE (the old media(first: 20) cut 12 images in 3 products)
        if (node.media?.pageInfo?.hasNextPage) {
          throw new Error(`${node.handle}: more than 50 media — raise media(first:) (fail-closed, nothing written)`);
        }
        // v7.5: Separate media into images and videos
        // v11.5: GS_LEGACY_CAPS=1 slices back to the old 20 media slots (YouTube items included, as before)
        const mediaEdges = LEGACY_CAPS ? (node.media?.edges || []).slice(0, LEGACY_MEDIA_CAP) : (node.media?.edges || []);
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
            // source is often the lowest/SD rendition -> video_link_processing_error x444, 2026-07-17)
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

        // v11.5 (B3): read ALL variants — the page carries the first 100, fetchRemainingVariants() the rest —
        // and PROVE completeness against variantsCount (602 of 702 louloudi variants were never read).
        const vc = node.variantsCount;
        if (!vc || typeof vc.count !== 'number') {
          throw new Error(`${node.handle}: variantsCount missing — cannot prove the variants are complete (fail-closed)`);
        }
        const allVariants = (node.variants?.edges || []).map(e => mapVariant(e.node));
        if (node.variants?.pageInfo?.hasNextPage) {
          // v11.5 F6: the follow-up pages are BOUNDED by variantsCount (a stuck cursor used to loop until the CI timeout)
          allVariants.push(...await fetchRemainingVariants(node.id, node.variants.pageInfo.endCursor, vc.count));
        }
        if (vc.precision === 'EXACT' ? allVariants.length !== vc.count : allVariants.length < vc.count) {
          throw new Error(`${node.handle}: read ${allVariants.length} variants but variantsCount = ${vc.count} (${vc.precision}) — fail-closed, nothing written`);
        }
        _fetchStats.variantsRead += allVariants.length;
        // WHAT is emitted for a product with > 100 variants is owner decision E2 (default since 21/09: one item per
        // colour × stone; GS_BIGPRODUCT_MODE=legacy = the old first 100), scoped by PRODUCT ID (R3b); the handle is only logged
        const emittedVariants = selectEmittedVariants(node.id.replace('gid://shopify/Product/', ''), node.handle, allVariants);

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
          // v11.5: the variants that become feed items (E2) …
          variants: emittedVariants,
          // … and ALL variants in position order: image-range boundaries + same-colour borrow use these.
          // GS_LEGACY_CAPS=1 → exactly the old first 100.
          allVariants: LEGACY_CAPS ? emittedVariants : allVariants
        };
        allProducts.push(product);
      }
      
      console.log(`   Page ${page}: ${products.length} products (Total: ${allProducts.length})`);
      const pageInfo = data.data?.products?.pageInfo;
      if (!pageInfo?.hasNextPage) break;
      cursor = pageInfo.endCursor;
      page++;
      await new Promise(r => setTimeout(r, 300));
    } catch (error) { console.error(`❌ Error: ${error.message}`); throw error; }   // v11.5 (B4): was `break` → partial catalog
  }
  
  console.log(`\n✅ Total products: ${allProducts.length}\n`);
  console.log(`✅ Variants read: ${_fetchStats.variantsRead} (each product checked against variantsCount) · ` +
    `follow-up variant pages: ${_fetchStats.followUpPages}\n`);
  return allProducts;
}

// ============================================
// v11.5 (B2/B3): variant fields, shared by the products page and the follow-up pages
// ============================================

// ProductVariant.image is deprecated ("Use media instead") — the variant's own photo comes from media(first: 1)
const VARIANT_NODE_FIELDS = `id sku price compareAtPrice inventoryQuantity barcode
                  media(first: 1) { nodes { id } }
                  selectedOptions { name value }
                  inventoryItem { measurement { weight { value unit } } }`;

const _fetchStats = { variantsRead: 0, followUpPages: 0 };

// The MediaImage number of the variant's own photo (= images[].id), or null. Only a MediaImage gid counts.
function variantMediaImageId(node) {
  const id = (node && node.media && node.media.nodes && node.media.nodes[0] && node.media.nodes[0].id) || '';
  return id.startsWith('gid://shopify/MediaImage/') ? id.slice('gid://shopify/MediaImage/'.length) : null;
}

// One mapping for every variant (was inline in the products loop; weight logic unchanged)
function mapVariant(n) {
  let weightInGrams = null;
  const weightData = n.inventoryItem?.measurement?.weight;
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
    id: n.id.replace('gid://shopify/ProductVariant/', ''),
    gid: n.id, sku: n.sku, price: n.price,
    compare_at_price: n.compareAtPrice,
    inventory_quantity: n.inventoryQuantity,
    barcode: n.barcode, weight: weightInGrams,
    media_id: variantMediaImageId(n),   // v11.5 (B5): replaces image_id (ProductImage id, never matched)
    title: n.selectedOptions.map(o => o.value).join(' / '),
    selectedOptions: n.selectedOptions
  };
}

// The variants after the first page (first: 250 per page, cursor passed as a GraphQL variable). Any error throws.
// v11.5 F6: BOUNDED — a cursor that does not advance, or more than ceil(variantsCount / 250) + 2 pages, throws.
async function fetchRemainingVariants(productGid, after, expectedCount) {
  const q = `query RemainingVariants($id: ID!, $after: String) {
    product(id: $id) {
      variants(first: 250, after: $after) {
        pageInfo { hasNextPage endCursor }
        edges {
          node {
            ${VARIANT_NODE_FIELDS}
          }
        }
      }
    }
  }`;
  const out = [];
  let cursor = after;
  const maxPages = Math.ceil((Number(expectedCount) || 0) / 250) + 2;
  const usedCursors = new Set();
  let pages = 0;
  while (cursor) {
    if (usedCursors.has(cursor)) throw new Error(`variants follow-up for ${productGid}: the cursor did not advance — fail-closed`);
    usedCursors.add(cursor);
    if (++pages > maxPages) {
      throw new Error(`variants follow-up for ${productGid}: more than ${maxPages} pages for variantsCount ${expectedCount} — fail-closed`);
    }
    await new Promise(r => setTimeout(r, 300));
    const { data } = await graphqlRequest(q, 4, { id: productGid, after: cursor });
    if (data.errors) throw new Error(`variants follow-up for ${productGid}: GraphQL errors ${JSON.stringify(data.errors).slice(0, 300)}`);
    const conn = data.data?.product?.variants;
    if (!conn) throw new Error(`variants follow-up for ${productGid}: empty response`);
    for (const e of conn.edges || []) out.push(mapVariant(e.node));
    _fetchStats.followUpPages++;
    if (conn.pageInfo?.hasNextPage && !conn.pageInfo.endCursor) throw new Error(`variants follow-up for ${productGid}: hasNextPage without a cursor`);
    cursor = conn.pageInfo?.hasNextPage ? conn.pageInfo.endCursor : null;
  }
  return out;
}

// E2 — what a product with MORE than 100 variants emits (today only kremasto-monogramma-louloudi, 702).
// ALL variants are always read and checked; only the emitted set differs:
//   colour-stone     = DEFAULT (owner decision E2 = ii, Bill 21/09/2026): one item per (colour × stone), the in-stock
//                      variant with the LOWEST variant id (louloudi: 27 items on 21/09)
//   legacy           = KILL-SWITCH: the first 100 by position — byte-for-byte the item set before v11.5
//   all              = every variant
//   colour           = one item per colour: the in-stock variant with the lowest variant id
// The chosen variants keep their position order. GS_LEGACY_CAPS=1 forces legacy.
// v11.5 F7 / R3b: the mode applies ONLY to the PRODUCT IDS in GS_BIGPRODUCT_IDS (default 4448531972131 =
// kremasto-monogramma-louloudi); the handle is only logged. Any OTHER product that grows past 100 variants (next
// largest: kremasto-monogramma, 96) emits the FIRST 100 (legacy, as before v11.5) and logs a 🔴 line naming it:
// no product grows the feed silently, and a renamed handle or an emptied list cannot turn 100 items into 702.
function selectEmittedVariants(productId, handle, allVariants, mode = (LEGACY_CAPS ? 'legacy' : BIGPRODUCT_MODE),
  quiet = false, productIds = BIGPRODUCT_IDS) {
  if (allVariants.length <= LEGACY_VARIANT_CAP) return allVariants;
  if (!productIds.has(String(productId))) {
    const first = allVariants.slice(0, LEGACY_VARIANT_CAP);
    if (!quiet) {
      console.error(`   🔴 ${handle} (product ${productId}): ${allVariants.length} variants read (complete) · NOT in ` +
        `GS_BIGPRODUCT_IDS → the FIRST ${first.length} emitted (legacy, ${first.filter(v => v.inventory_quantity > 0).length} in stock), ` +
        `${allVariants.length - first.length} left out — add its id to GS_BIGPRODUCT_IDS to apply GS_BIGPRODUCT_MODE`);
    }
    return first;
  }
  let chosen;
  if (mode === 'all') {
    chosen = allVariants;
  } else if (mode === 'colour-stone' || mode === 'colour') {
    const stoneOf = v => {
      const o = (v.selectedOptions || []).find(opt => {
        const n = (opt.name || '').toLowerCase();
        return n.includes('πέτρ') || n.includes('stone');
      });
      return o ? o.value : '';
    };
    const best = new Map();
    for (const v of allVariants) {
      if (!(v.inventory_quantity > 0)) continue;
      const key = (extractVariantColor(v.selectedOptions) || '') + (mode === 'colour-stone' ? '\u0001' + stoneOf(v) : '');
      const cur = best.get(key);
      if (!cur || BigInt(v.id) < BigInt(cur.id)) best.set(key, v);
    }
    const keep = new Set([...best.values()].map(v => v.id));
    chosen = allVariants.filter(v => keep.has(v.id));
  } else {
    chosen = allVariants.slice(0, LEGACY_VARIANT_CAP);
  }
  if (!quiet) {
    console.log(`   📌 ${handle}: ${allVariants.length} variants read (complete) · GS_BIGPRODUCT_MODE=${mode}` +
      `${LEGACY_CAPS ? ' (forced by GS_LEGACY_CAPS)' : ''} → ${chosen.length} emitted ` +
      `(${chosen.filter(v => v.inventory_quantity > 0).length} in stock)`);
  }
  return chosen;
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
// v11.5: used ONLY with GS_LEGACY_PRICING=1 (kill-switch for B10, one cycle). Its factor-1.0 fallbacks
// (EUR amounts labelled CHF/JPY/IDR) now THROW. Default path: fetchContextualPrices() below.
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
    throw new Error('legacy pricing: no reference variant (fail-closed)');   // v11.5: was `return null` → factor 1.0
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
      throw new Error('legacy pricing: GraphQL errors (fail-closed)');   // v11.5: was `return null`
    }

    const variantData = data.data?.node;
    if (!variantData) {
      console.error('❌ No variant data returned from contextual pricing query');
      throw new Error('legacy pricing: no variant data (fail-closed)');   // v11.5: was `return null`
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
        // v11.5: NO fallback to the catalog price (it labelled EUR amounts in the local currency)
        throw new Error(`legacy pricing: no contextual price returned for ${cc} (fail-closed)`);
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
    throw error;   // v11.5: was a fallback to catalog prices (PRICES MAY NOT MATCH LANDING PAGES) — fail-closed now
  }
}

// ============================================
// v11.5 (B10): PER-VARIANT CONTEXTUAL PRICES
// ============================================

/**
 * The storefront's OWN price of every in-stock emitted variant, per feed country — Shopify's per-variant
 * rounding included, which one reference ratio can never reproduce (non-EUR: 87,958 of 92,316 items differed
 * from the storefront on 21/09; DE: 2,517 of 3,297 were 0.01-0.04 EUR too high).
 * One query per 250 variants: nodes(ids) × one contextualPricing alias per UNIQUE market.country of the
 * non-spoke MARKETS (36 countries; PR → US, CH_FR/CH_IT → CH, BE_FR → BE, CA_FR → CA).
 * FAIL-CLOSED, all checked HERE, before any file is written:
 *   - GraphQL errors, or still throttled after the retries           → throw
 *   - a node missing / null / not the requested variant               → throw
 *   - currencyCode ≠ the market currency of that country             → throw
 *   - 0 in-stock variants to price (F4)                               → throw
 *   - more than 0.5% of the variants null in ANY ONE country (F5)     → throw
 *   - fewer null prices: that item is left out of THAT feed only, and every null pair is logged
 * @returns {Map<string, Object>} variantId → { [countryCode]: { price: {amount, currencyCode}, compareAtPrice } }
 */
async function fetchContextualPrices(products) {
  console.log('💰 Fetching per-variant contextual prices (v11.5)...\n');

  const countryCurrency = {};
  for (const [code, m] of Object.entries(MARKETS)) {
    if (SPOKE_COUNTRIES.has(m.country)) continue;
    if (countryCurrency[m.country] && countryCurrency[m.country] !== m.currency) {
      throw new Error(`MARKETS: ${code} prices country ${m.country} in ${m.currency}, another market of it uses ${countryCurrency[m.country]}`);
    }
    countryCurrency[m.country] = m.currency;
  }
  const countries = Object.keys(countryCurrency);

  const ids = [];
  const seen = new Set();
  for (const p of products) {
    for (const v of p.variants) {
      if (v.inventory_quantity > 0 && !seen.has(v.id)) { seen.add(v.id); ids.push(v.id); }
    }
  }
  // v11.5 F4: nothing to price = nothing to list (e.g. every inventoryQuantity null after a lost read_inventory
  // scope) — it used to print a green «0 variants» line and write 41 EMPTY feeds with exit 0
  if (!ids.length) throw new Error('contextual prices: 0 in-stock variants to price — fail-closed, nothing written');

  const aliases = countries.map(cc =>
    `c${cc}: contextualPricing(context: { country: ${cc} }) { price { amount currencyCode } compareAtPrice { amount currencyCode } }`
  ).join('\n          ');

  const byVariant = new Map();
  const nullPairs = [];
  const nullByCountry = {};   // F5
  const batches = Math.ceil(ids.length / CTX_BATCH);
  for (let i = 0, b = 1; i < ids.length; i += CTX_BATCH, b++) {
    const batch = ids.slice(i, i + CTX_BATCH);
    const query = `{
      nodes(ids: [${batch.map(id => `"gid://shopify/ProductVariant/${id}"`).join(', ')}]) {
        ... on ProductVariant {
          id
          ${aliases}
        }
      }
    }`;
    const { data } = await graphqlRequest(query);   // throttled after the retries → throws (B4)
    if (data.errors) throw new Error(`contextual prices batch ${b}/${batches}: GraphQL errors ${JSON.stringify(data.errors).slice(0, 300)}`);
    const nodes = data.data?.nodes;
    if (!Array.isArray(nodes) || nodes.length !== batch.length) {
      throw new Error(`contextual prices batch ${b}/${batches}: asked ${batch.length} variants, got ${Array.isArray(nodes) ? nodes.length : 'no'} nodes`);
    }
    nodes.forEach((node, k) => {
      const want = `gid://shopify/ProductVariant/${batch[k]}`;
      if (!node || node.id !== want) throw new Error(`contextual prices batch ${b}/${batches}: node ${k} is ${node ? node.id : 'null'}, expected ${want}`);
      const perCountry = {};
      for (const cc of countries) {
        const cp = node[`c${cc}`];
        if (!cp || !cp.price) { nullPairs.push(`${batch[k]}/${cc}`); nullByCountry[cc] = (nullByCountry[cc] || 0) + 1; continue; }
        if (cp.price.currencyCode !== countryCurrency[cc]) {
          throw new Error(`contextual price of ${batch[k]} for ${cc} is in ${cp.price.currencyCode}, market currency is ${countryCurrency[cc]}`);
        }
        if (cp.compareAtPrice && cp.compareAtPrice.currencyCode !== countryCurrency[cc]) {
          throw new Error(`contextual compare-at of ${batch[k]} for ${cc} is in ${cp.compareAtPrice.currencyCode}, market currency is ${countryCurrency[cc]}`);
        }
        perCountry[cc] = { price: cp.price, compareAtPrice: cp.compareAtPrice || null };
      }
      byVariant.set(batch[k], perCountry);
    });
    process.stdout.write(`\r   Contextual prices: ${Math.min(i + CTX_BATCH, ids.length)}/${ids.length} variants × ${countries.length} countries`);
    await new Promise(r => setTimeout(r, 300));
  }
  console.log('');

  const pairs = ids.length * countries.length;
  if (nullPairs.length) {
    console.error(`   ⚠️ ${nullPairs.length} of ${pairs} (variant/country) prices are NULL — those items are left out of that country's feeds:`);
    for (const p of nullPairs) console.error(`      ${p}`);
  }
  // v11.5 F5: the limit is PER PRICING COUNTRY. One global 0.5% (593 of 118,692 pairs) let a single country's
  // feed(s) silently lose up to 593 of 3,297 items (18%) with exit 0.
  const maxNullPerCountry = ids.length * CTX_MAX_NULL_SHARE;
  const overLimit = [];
  for (const cc of countries) {
    const n = nullByCountry[cc] || 0;
    if (!n) continue;
    const over = n > maxNullPerCountry;
    if (over) overLimit.push(`${cc} ${n}`);
    console.error(`      ${cc}: ${n} of ${ids.length} null (${(100 * n / ids.length).toFixed(2)}%)${over ? ` > ${CTX_MAX_NULL_SHARE * 100}%` : ''}`);
  }
  if (overLimit.length) {
    throw new Error(`contextual prices: more than ${CTX_MAX_NULL_SHARE * 100}% of ${ids.length} variants null in ` +
      `${overLimit.join(', ')} — fail-closed, nothing written`);
  }
  console.log(`   ✅ ${ids.length} variants × ${countries.length} countries = ${pairs} prices (${nullPairs.length} null) in ${batches} queries\n`);
  return byVariant;
}

// v11.5 F4: a FLOOR on what is emitted. A collapsed catalog (lost scope, a filter gone wrong) must stop the run
// instead of shipping near-empty feeds. Counted over the emitted variants (E2 applied), in stock. Called in both
// CLI paths right after the products are read, before prices and before any write.
function assertEmittedVolume(products) {
  let inStock = 0;
  for (const p of products) for (const v of p.variants) if (v.inventory_quantity > 0) inStock++;
  console.log(`✅ Emitted in-stock variants: ${inStock} (floor GS_MIN_ITEMS=${MIN_ITEMS})\n`);
  if (inStock < MIN_ITEMS) {
    throw new Error(`only ${inStock} emitted in-stock variants (< GS_MIN_ITEMS=${MIN_ITEMS}) — fail-closed, nothing written`);
  }
}

// B10 switch point, called BEFORE the write loop: { byVariant } (default) | { adjustments } (GS_LEGACY_PRICING=1)
async function fetchPricing(products) {
  if (LEGACY_PRICING) {
    const adjustments = await fetchPriceAdjustments(products);
    for (const [code, m] of Object.entries(MARKETS)) {
      if (!SPOKE_COUNTRIES.has(m.country) && !adjustments[code]) throw new Error(`legacy pricing: no adjustment for market ${code} (fail-closed)`);
    }
    return { adjustments, byVariant: null };
  }
  return { adjustments: null, byVariant: await fetchContextualPrices(products) };
}


// ============================================
// v11.5 (B5-B9): COLOUR-CORRECT IMAGES
// ============================================

/**
 * Product-level image plan. A variant OWNS the image that its ProductVariant.media points at; the RANGE of an
 * owned image runs up to the next owned image (the v11.2 boundary heuristic, now actually fed with matching ids).
 * Boundaries come from ALL variants (out-of-stock and not-emitted included). GS_NO_VARIANTMEDIA=1 ⇒ no owned
 * images at all ⇒ every item takes the fallback path = today's behaviour.
 */
function buildImagePlan(product) {
  const images = product.images || [];
  const rangeVariants = product.allVariants || product.variants || [];
  const idxById = new Map();
  images.forEach((img, idx) => { if (!idxById.has(img.id)) idxById.set(img.id, idx); });

  const ownerRaws = new Map();   // owned image index → Set of the raw colours of the variants that own it
  if (VARIANTMEDIA_ON) {
    for (const v of rangeVariants) {
      if (!v.media_id || !idxById.has(v.media_id)) continue;
      const idx = idxById.get(v.media_id);
      if (!ownerRaws.has(idx)) ownerRaws.set(idx, new Set());
      ownerRaws.get(idx).add(extractVariantColor(v.selectedOptions) || '');
    }
  }
  const starts = [...ownerRaws.keys()].sort((a, b) => a - b);
  const rangeByMediaId = new Map();                   // owned image id → images[start, next owned)
  const rangeRawsByIdx = new Array(images.length).fill(null);
  for (let i = 0; i < starts.length; i++) {
    const start = starts[i];
    const end = i + 1 < starts.length ? starts[i + 1] : images.length;
    rangeByMediaId.set(images[start].id, images.slice(start, end));
    for (let k = start; k < end; k++) rangeRawsByIdx[k] = ownerRaws.get(start);
  }

  // Same-colour sibling borrow, TIERED (v11.5 R3a): a variant without a photo of its own takes the range of the
  // FIRST variant (position order) that has one and
  //   tier 1 (borrowByKey): the same raw colour AND every other colour-like option (stone, pearl, zircon …), F1;
  //   tier 2 (borrowByRaw): else the same raw colour only = the round-1 sibling (right metal, the stone may differ);
  //   tier 3: else no sibling ⇒ the fallback path (images[0], E1 option A).
  // Measured 21/09: without tier 2, 11 items per feed fell back to images[0] and 6 of them showed ANOTHER metal.
  const borrowByKey = new Map();
  const borrowByRaw = new Map();
  const raws = new Set();
  for (const v of rangeVariants) {
    const raw = extractVariantColor(v.selectedOptions);
    if (!raw) continue;
    raws.add(raw);
    if (VARIANTMEDIA_ON && v.media_id && rangeByMediaId.has(v.media_id)) {
      const range = rangeByMediaId.get(v.media_id);
      if (!borrowByRaw.has(raw)) borrowByRaw.set(raw, range);
      const key = borrowKeyOf(v.selectedOptions);
      if (!borrowByKey.has(key)) borrowByKey.set(key, range);
    }
  }

  // E1-B gate (opt-in): distinct colours among the IN-STOCK emitted variants, normalised as BestPrice does
  const gateColours = new Set();
  if (APPLY_PHOTOGATE) {
    for (const v of product.variants || []) {
      if (v.inventory_quantity > 0) gateColours.add(gateColourOf(extractVariantColor(v.selectedOptions), product));
    }
  }

  return {
    images, rangeByMediaId, rangeRawsByIdx, borrowByKey, borrowByRaw, gateColours,
    ownedIdx: new Set(starts),
    firstOwnedIdx: starts.length ? starts[0] : images.length,
    multiColour: raws.size >= 2,
  };
}

// BestPrice's colour of a group (bestprice L865) — used ONLY by the opt-in E1-B gate
function gateColourOf(raw, product) {
  return getGreekColor(raw) || getGreekColor(product.metafields?.color) || 'ασημί';
}

/**
 * Item-level image choice. Returns { path, variantImage, additional, lifestyle, guardFired, pkgRemoved,
 * exclRemoved, lifestyleBlocked }. path: own | borrow | fallback | fallback-trimmed.
 *  - own / borrow: image_link = range[0]; additional = the rest of the range.
 *  - fallback (no photo of this colour): image_link = images[0] (E1 option A, as today); additional = all other
 *    images, EXCEPT in a product with ≥ 2 raw colours (B8): only the images before the first owned image.
 *  - B6 guard: image_link is never a packaging photo (next non-packaging image in the range, else in the product).
 *  - additional: cut to GS_EXTRA_IMAGES_CAP (9) FIRST, then drop packaging (B6) and listed photos (B7); never refilled.
 *  - B9 lifestyle = images[1] only if not the image_link, not packaging, not listed for this colour and not
 *    inside another colour's range.
 */
function pickItemImages(plan, handle, variant, raw) {
  const images = plan.images;
  const mainImage = images[0]?.src || '';
  const own = (VARIANTMEDIA_ON && variant.media_id && plan.rangeByMediaId.get(variant.media_id)) || null;
  // R3a tiered borrow: tier 1 = same metal + every colour-like option; tier 2 = same metal only (round 1);
  // GS_BORROW_METAL_ONLY=1 = tier 2 only. No sibling of that metal ⇒ the fallback path (tier 3, borrowTier 0).
  const tier1 = (!own && VARIANTMEDIA_ON && raw && !BORROW_METAL_ONLY && plan.borrowByKey.get(borrowKeyOf(variant.selectedOptions))) || null;
  const tier2 = (!own && !tier1 && VARIANTMEDIA_ON && raw && plan.borrowByRaw.get(raw)) || null;
  const borrowed = tier1 || tier2;
  const borrowTier = tier1 ? 1 : tier2 ? 2 : 0;
  const range = own || borrowed;

  let path, variantImage, candidates;
  if (range) {
    path = own ? 'own' : 'borrow';
    variantImage = range[0]?.src || mainImage;
    candidates = range;
  } else {
    variantImage = mainImage;
    const trim = OTHERCOLOUR_ON && plan.multiColour && plan.firstOwnedIdx < images.length;
    path = trim ? 'fallback-trimmed' : 'fallback';
    candidates = trim ? images.slice(0, plan.firstOwnedIdx) : images;
  }

  let guardFired = false;
  if (isPackagingImage(variantImage)) {
    const next = candidates.find(img => img.src !== variantImage && !isPackagingImage(img.src))
      || images.find(img => img.src !== variantImage && !isPackagingImage(img.src));
    if (next) { variantImage = next.src; guardFired = true; }
  }

  const raws = raw ? [raw] : [];
  const cut = candidates.map(img => img.src).filter(src => src !== variantImage).slice(0, EXTRA_IMAGES_CAP);
  const noPkg = cut.filter(src => !isPackagingImage(src));
  const additional = noPkg.filter(src => !isExcludedExtra(handle, raws, src));

  let lifestyle = images[1]?.src || null;
  let lifestyleBlocked = null;
  let lifestyleSame = false;   // F9: images[1] IS this item's image_link (counted separately from the guard's bans)
  if (lifestyle && lifestyle === variantImage) {
    lifestyle = null;
    lifestyleSame = true;
  } else if (lifestyle && LIFESTYLE_GUARD_ON) {
    const owners = plan.rangeRawsByIdx[1];
    if (isPackagingImage(lifestyle)) lifestyleBlocked = 'packaging';
    else if (isExcludedExtra(handle, raws, lifestyle)) lifestyleBlocked = 'photoexcl';
    // I6 = the I5 bans: another colour's OWN photo, or any photo inside another colour's RANGE
    else if (owners && !owners.has(raw || '')) lifestyleBlocked = plan.ownedIdx.has(1) ? 'other-colour-own' : 'other-colour-range';
    if (lifestyleBlocked) lifestyle = null;
  }

  return {
    path, variantImage, additional, lifestyle, guardFired, lifestyleBlocked, lifestyleSame, borrowTier,
    pkgRemoved: cut.length - noPkg.length, exclRemoved: noPkg.length - additional.length,
  };
}


// ============================================
// XML FEED GENERATION (v6 with dynamic shipping)
// ============================================

function generateFeedForMarket(products, translations, market, shippingRates, priceAdj, ctxPrices) {
  // v10 (GS_LEGACY_PRICING=1 only): price adjustment factor and currency from ONE reference variant.
  // v11.5: the factor-1.0 fallback is gone — both price sources are validated before the write loop.
  if (LEGACY_PRICING && !priceAdj) throw new Error(`legacy pricing: no price adjustment for ${market.name} (${market.country})`);
  if (!LEGACY_PRICING && !ctxPrices) throw new Error(`no contextual prices for ${market.name} (${market.country})`);
  const priceFactor = priceAdj ? priceAdj.factor : 1.0;
  const priceCurrency = priceAdj ? priceAdj.currency : market.currency;

  console.log(`🔧 Generating XML feed for ${market.name} (${market.country})...`);
  if (!LEGACY_PRICING) {
    console.log(`   💰 Price: contextual, per variant (country ${market.country}, ${market.currency})`);
  } else if (Math.abs(priceFactor - 1.0) > 0.001 || priceCurrency !== 'EUR') {
    console.log(`   💰 Price: ×${priceFactor.toFixed(6)} → ${priceCurrency}`);
  }
  console.log('');
  
  let items = [];
  let stats = {
    inStock: 0, outOfStock: 0, noImage: 0, translatedVariants: 0,
    totalVariants: 0, withGender: 0, withColor: 0, withMaterial: 0,
    withWeight: 0, withSize: 0, withShipping: 0, withVideo: 0,
    productsWithVideo: 0, categoryBreakdown: {},
    // v11.5
    imgPath: { own: 0, borrow: 0, fallback: 0, 'fallback-trimmed': 0 }, pkgRemoved: 0, exclRemoved: 0,
    imageLinkGuard: 0, droppedEntries: 0, gateDropped: 0, gateSavedByLabel: 0,
    lifestyleBlocked: { packaging: 0, photoexcl: 0, 'other-colour-own': 0, 'other-colour-range': 0 },
    priceOmitted: 0, onSale: 0,
    borrowTier1: 0, borrowTier2: 0, lifestyleEmitted: 0, lifestyleNone: 0, lifestyleSame: 0   // R3a / F9
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
    // v11.5 (B5): the v11.2 match compared a ProductImage id with MediaImage.image.id — which is an
    // ImageSource id — so it matched 0 of 2,002 variants and every item fell back to images[0] + all images.
    // images[].productImageId is therefore NOT used; matching is variant.media_id ↔ images[].id (MediaImage).
    const plan = buildImagePlan(product);

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

      // v11.5: every decision that can LEAVE THIS ITEM OUT is taken here, before any stat counts it
      const rawColour = extractVariantColor(variant.selectedOptions);
      const pick = pickItemImages(plan, product.handle, variant, rawColour);
      if (APPLY_DROPENTRIES && isDroppedEntry(product.handle, rawColour ? [rawColour] : [])) {
        stats.droppedEntries++;   // PHOTOEXCL dropEntries (opt-in)
        return;
      }
      if (APPLY_PHOTOGATE && pick.path.startsWith('fallback') && plan.gateColours.size > 1) {
        // E1-B (opt-in): no photo of this colour in a multi-colour product ⇒ not listed, unless labelled
        const want = GATE_COLOUR_TO_LABEL[gateColourOf(rawColour, product)];
        const lab = jphotoColourOf(pick.variantImage);
        if (lab && want && lab === want) stats.gateSavedByLabel++;
        else { stats.gateDropped++; return; }
      }
      const itemCp = LEGACY_PRICING ? null : (ctxPrices.get(variant.id) || {})[market.country];
      if (!LEGACY_PRICING && !(itemCp && itemCp.price)) {
        stats.priceOmitted++;     // null contextual price (≤ 0.5%, each pair logged at fetch time)
        return;
      }
      
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
      // v11.5 (B5-B9): decided by pickItemImages() above (own photo → same-colour sibling → fallback)
      const variantImage = pick.variantImage;
      const variantAdditionalImages = pick.additional;
      stats.imgPath[pick.path]++;
      stats.pkgRemoved += pick.pkgRemoved;
      stats.exclRemoved += pick.exclRemoved;
      if (pick.guardFired) stats.imageLinkGuard++;
      if (pick.lifestyleBlocked) stats.lifestyleBlocked[pick.lifestyleBlocked]++;
      if (pick.borrowTier === 1) stats.borrowTier1++;
      else if (pick.borrowTier === 2) stats.borrowTier2++;
      if (pick.lifestyle) stats.lifestyleEmitted++;
      else if (pick.lifestyleSame) stats.lifestyleSame++;
      else if (!pick.lifestyleBlocked) stats.lifestyleNone++;

      const translatedHandle = prodTrans.handle || enFallback.handle || product.handle;
      const productUrl = buildProductUrl(translatedHandle, variant.id, market);
      // v11.5 (B10): the storefront's OWN contextual price for this variant in this country (its rounding
      // included); on sale, g:price = the regular (compare-at) price and g:sale_price = what the customer pays.
      // GS_LEGACY_PRICING=1 → v10: catalog price × one reference ratio per market (today's behaviour).
      let adjustedVariantPrice, price, hasSale, salePrice = null;
      if (LEGACY_PRICING) {
        // v10: Apply market-specific price adjustment (VAT + currency conversion)
        adjustedVariantPrice = Math.round(parseFloat(variant.price) * priceFactor * 100) / 100;
        price = formatPrice(adjustedVariantPrice, priceCurrency);
        hasSale = variant.compare_at_price && parseFloat(variant.compare_at_price) > parseFloat(variant.price);
      } else {
        adjustedVariantPrice = parseFloat(itemCp.price.amount);
        hasSale = !!(itemCp.compareAtPrice && parseFloat(itemCp.compareAtPrice.amount) > adjustedVariantPrice);
        price = formatPrice(hasSale ? itemCp.compareAtPrice.amount : itemCp.price.amount, itemCp.price.currencyCode);
        if (hasSale) salePrice = formatPrice(itemCp.price.amount, itemCp.price.currencyCode);
      }
      if (hasSale) stats.onSale++;

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
      // v11.5 (B9): pick.lifestyle = images[1] unless it is the image_link, packaging, listed for this colour
      // or inside another colour's range (GS_NO_LIFESTYLE_GUARD=1 → only the image_link check, as before)
      const lifestyleImage = pick.lifestyle;
      if (lifestyleImage) {
        item += `\n      <g:lifestyle_image_link>${lifestyleImage}</g:lifestyle_image_link>`;
      }

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
      if (ringSize) {
        item += `\n      <g:size><![CDATA[${ringSize}]]></g:size>`;
        item += `\n      <g:size_system>EU</g:size_system>`;
      }

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
      if (material) {
        item += `\n      <g:product_detail>`;
        item += `\n        <g:section_name>Materials</g:section_name>`;
        item += `\n        <g:attribute_name>Primary Material</g:attribute_name>`;
        item += `\n        <g:attribute_value><![CDATA[${material}]]></g:attribute_value>`;
        item += `\n      </g:product_detail>`;
      }

      // Custom labels for campaign segmentation
      // label_0: product type (rings, necklaces, earrings, etc.)
      const typeEN = translateProductType(product.product_type, 'en').toLowerCase();
      item += `\n      <g:custom_label_0><![CDATA[${typeEN}]]></g:custom_label_0>`;
      // label_1: price range
      const priceNum = adjustedVariantPrice;
      const priceRange = priceNum < 30 ? 'under-30' : priceNum < 60 ? '30-60' : priceNum < 100 ? '60-100' : 'over-100';
      item += `\n      <g:custom_label_1>${priceRange}</g:custom_label_1>`;
      // label_2: gender
      item += `\n      <g:custom_label_2>${gender}</g:custom_label_2>`;
      // label_3: has video
      item += `\n      <g:custom_label_3>${product.videos?.length > 0 ? 'has-video' : 'no-video'}</g:custom_label_3>`;
      // label_4: has sale (v11.5: hasSale comes from the same price source as g:price, see B10 above)
      item += `\n      <g:custom_label_4>${hasSale ? 'on-sale' : 'regular-price'}</g:custom_label_4>`;

      if (LEGACY_PRICING) {
        // Sale price handling (v10: both prices adjusted with same market factor) — kept verbatim for
        // GS_LEGACY_PRICING=1; note that it emits a SECOND <g:price>
        if (variant.compare_at_price && parseFloat(variant.compare_at_price) > parseFloat(variant.price)) {
          item += `\n      <g:sale_price>${price}</g:sale_price>`;
          const adjustedCompareAt = Math.round(parseFloat(variant.compare_at_price) * priceFactor * 100) / 100;
          item += `\n      <g:price>${formatPrice(adjustedCompareAt, priceCurrency)}</g:price>`;
        }
      } else if (hasSale) {
        // v11.5 (B10): exactly ONE <g:price> (the regular price, emitted above) + <g:sale_price>
        item += `\n      <g:sale_price>${salePrice}</g:sale_price>`;
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
  // v11.5
  const ip = stats.imgPath;
  console.log(`      Image path: own ${ip.own} · same-colour sibling ${ip.borrow} · fallback ${ip.fallback} · fallback trimmed (B8) ${ip['fallback-trimmed']}`);
  // R3a: every sibling borrow is tier 1 or tier 2, so the two must add up to the borrow count above
  const tierSum = stats.borrowTier1 + stats.borrowTier2;
  console.log(`      Sibling borrow tiers (R3a): 1 same metal + same stone / pearl / zircon colour ${stats.borrowTier1} · ` +
    `2 same metal only (${BORROW_METAL_ONLY ? 'GS_BORROW_METAL_ONLY=1: every borrow' : 'another stone / pearl / zircon colour'}) ` +
    `${stats.borrowTier2} · 3 no sibling of that metal → fallback ` +
    `${ip.fallback + ip['fallback-trimmed']}${tierSum === ip.borrow ? '' : ' 🔴 MISMATCH'}`);
  const lb = stats.lifestyleBlocked;
  console.log(`      Additional images removed: packaging ${stats.pkgRemoved} · listed other colour ${stats.exclRemoved} · image_link guard fired ${stats.imageLinkGuard}`);
  console.log(`      Lifestyle blocked: packaging ${lb.packaging} · listed ${lb.photoexcl} · another colour's own photo ${lb['other-colour-own']} · inside another colour's range ${lb['other-colour-range']}`);
  // F9: every listed item falls in exactly ONE lifestyle outcome — the parts must add up to the in-stock items
  const lbSum = lb.packaging + lb.photoexcl + lb['other-colour-own'] + lb['other-colour-range'];
  const lifeSum = stats.lifestyleEmitted + stats.lifestyleNone + stats.lifestyleSame + lbSum;
  console.log(`      Lifestyle outcome: emitted ${stats.lifestyleEmitted} · no 2nd image ${stats.lifestyleNone} · 2nd image = its image_link ${stats.lifestyleSame} · ` +
    `blocked ${lbSum} (reasons above) · total ${lifeSum} of ${stats.inStock} items${lifeSum === stats.inStock ? '' : ' 🔴 MISMATCH'}`);
  console.log(`      Left out: dropEntries ${stats.droppedEntries} · E1 gate ${stats.gateDropped} (saved by label ${stats.gateSavedByLabel}) · null price ${stats.priceOmitted} · on sale ${stats.onSale}`);
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

  assertSharedJson();   // v11.5 F8: before any request

  // v6: Fetch shipping rates first
  const shippingRates = await fetchShippingRates();

  // Fetch products
  const products = await fetchProductsWithOptions();
  if (products.length === 0) { console.error('❌ No products found'); throw new Error('no products — nothing written (fail-closed)'); }
  assertEmittedVolume(products);   // v11.5 F4

  // v11.5 (B10): per-variant contextual prices (default) | v10 reference ratio (GS_LEGACY_PRICING=1)
  const pricing = await fetchPricing(products);
  const priceAdj = pricing.adjustments ? pricing.adjustments[marketCode.toUpperCase()] : null;

  // Fetch translations
  let translations = { products: {}, optionValues: {} };
  if (market.locale !== 'el') {
    translations = await fetchAllTranslations(products, market.locale);
  } else {
    console.log('ℹ️ Greek locale - skipping translations\n');
  }

  // v6+v10: Generate XML with shipping and market-adjusted prices
  const { xml, stats } = generateFeedForMarket(products, translations, market, shippingRates, priceAdj, pricing.byVariant);

  // Ensure output directory exists
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // Write files
  // v11: Use feedSuffix for multi-language country feeds (e.g., ch-fr, be-fr)
  const feedKey = market.feedSuffix || market.country.toLowerCase();
  const filename = `emmanuela-${feedKey}.xml`;
  const filepath = path.join(OUTPUT_DIR, filename);
  fs.writeFileSync(filepath, xml, 'utf8');
  _filesWritten++;

  const date = new Date().toISOString().split('T')[0];
  const datedFilename = `emmanuela-${feedKey}-${date}.xml`;
  const datedFilepath = path.join(OUTPUT_DIR, datedFilename);
  fs.writeFileSync(datedFilepath, xml, 'utf8');
  _filesWritten++;

  console.log(`\n✅ Feed saved:`);
  console.log(`   ${filepath}`);
  console.log(`   ${datedFilepath}`);
  console.log(`\n📊 Summary: ${stats.inStock} items (${stats.withShipping} with shipping)\n`);
  
  return { filepath, stats };
}

async function generateAllFeeds() {
  const feedCount = Object.keys(MARKETS).length - SPOKE_COUNTRIES.size;
  console.log(`\n🌍 GENERATING FEEDS FOR ${feedCount} MARKETS (v9 hub-and-spoke: ${SPOKE_COUNTRIES.size} spoke countries via hub shipping)\n`);
  
  assertSharedJson();   // v11.5 F8: before any request

  // v6: Fetch shipping rates ONCE for all markets
  const shippingRates = await fetchShippingRates();
  
  // Fetch products once
  const products = await fetchProductsWithOptions();
  if (products.length === 0) { console.error('❌ No products found'); throw new Error('no products — nothing written (fail-closed)'); }
  assertEmittedVolume(products);   // v11.5 F4

  // v11.5 (B10): ALL prices are fetched and validated HERE, before the write loop — a failure writes nothing.
  // Default: per-variant contextual prices · GS_LEGACY_PRICING=1: v10 reference ratio (ONE API call)
  const pricing = await fetchPricing(products);

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

      // v6+v10: Pass shipping rates and price adjustments to generator (v11.5: or the contextual prices)
      const priceAdj = pricing.adjustments ? pricing.adjustments[market.code] : null;
      const { xml, stats } = generateFeedForMarket(products, translations, market, shippingRates, priceAdj, pricing.byVariant);

      // v11: Use feedSuffix for multi-language country feeds (e.g., ch-fr, be-fr)
      const feedKey = market.feedSuffix || market.country.toLowerCase();
      const filename = `emmanuela-${feedKey}.xml`;
      const filepath = path.join(OUTPUT_DIR, filename);
      fs.writeFileSync(filepath, xml, 'utf8');
      _filesWritten++;

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

// ============================================
// v11.5: OFFLINE SELF-TEST — node google-shopping-feed-v7.js selftest   (no token, no network, writes nothing)
// Known positives AND negatives for every matcher this version adds; exit code 1 on any failure.
// ============================================
function runSelftest() {
  let pass = 0, fail = 0;
  const skipped = [];
  const t = (name, cond) => { if (cond) pass++; else { fail++; console.error(`   ✗ FAIL: ${name}`); } };
  const cdn = f => `https://cdn.shopify.com/s/files/1/0277/0183/7859/files/${f}?v=1767371094`;
  console.log('\n🧪 v11.5 self-test (offline)\n');

  // 1. PKGFILTER (B6)
  if (PKG_ON) {
    const fromShared = [...PKG_FILES].filter(f => !PKG_EXTRA.includes(f) && !GS_PKG_EXTRA_LOCAL.includes(f));
    const listed = fromShared.find(f => !PKG_NAME_RE.test(f));
    t('PKGFILTER: the shared list is loaded', fromShared.length > 0);
    t('PKGFILTER: a file of the shared list, as a CDN URL with ?v=', !!listed && isPackagingImage(cdn(listed)));
    t('PKGFILTER: name regex', isPackagingImage(cdn('925-sterling-silver-jewelry-gift-packaging-emmanuela-handcrafted.jpg')));
    t('PKGFILTER: name regex, other case / separator', isPackagingImage(cdn('NEW_Gift_Packaging_2027.JPG')));
    t('PKGFILTER: PKG_EXTRA', isPackagingImage(cdn(PKG_EXTRA[0])));
    t('PKGFILTER: GS_PKG_EXTRA_LOCAL (F2), any case', GS_PKG_EXTRA_LOCAL.length > 0
      && isPackagingImage(cdn('ashmenio-kremasto-mentagion-monogramma-apo-ashmi-925-kosmhmata-emmanuela-413823.jpg'))
      && GS_PKG_EXTRA_LOCAL.every(f => isPackagingImage(cdn(f)) && isPackagingImage(cdn(f.toUpperCase()))));
    t('PKGFILTER: the neighbour of a local entry is NOT packaging',
      !isPackagingImage(cdn('ashmenio-kremasto-mentagion-monogramma-apo-ashmi-925-kosmhmata-emmanuela-413824.jpg')));
    t('PKGFILTER: an ordinary product photo is NOT packaging',
      !isPackagingImage(cdn('ashmenia-karfwta-skoylarikia-mikra-huggies-apo-ashmi-925-kosmhmata-emmanuela-731970.jpg')));
    t('PKGFILTER: the bare word "packaging" is NOT enough', !isPackagingImage(cdn('packaging.jpg')));
    t('PKGFILTER: empty URL', !isPackagingImage(''));
  } else skipped.push('PKGFILTER (GS_NO_PKGFILTER=1)');

  // 2. PHOTOEXCL (B7) — the positive case is taken from the shared JSON itself
  if (PHOTOEXCL_ON) {
    const h = Object.keys(PHOTOEXCL.extras).find(k => Object.keys(PHOTOEXCL.extras[k] || {}).length);
    const raw = h && Object.keys(PHOTOEXCL.extras[h])[0];
    const f = raw && (PHOTOEXCL.extras[h][raw] || [])[0];
    t('PHOTOEXCL: the shared JSON is loaded', !!f);
    if (f) {
      t('PHOTOEXCL: listed (handle, raw colour, file) → removed', isExcludedExtra(h, [raw], cdn(f)));
      t('PHOTOEXCL: same file, another colour → kept', !isExcludedExtra(h, ['__another colour__'], cdn(f)));
      t('PHOTOEXCL: same file, another product → kept', !isExcludedExtra('__another-handle__', [raw], cdn(f)));
      t('PHOTOEXCL: item without a raw colour → kept', !isExcludedExtra(h, [], cdn(f)));
      t('PHOTOEXCL: unlisted file → kept', !isExcludedExtra(h, [raw], cdn('unlisted-' + f)));
    }
    const dh = Object.keys(PHOTOEXCL.dropEntries)[0];
    if (dh) {
      t('dropEntries: listed (handle, raw colour) → dropped', isDroppedEntry(dh, [PHOTOEXCL.dropEntries[dh][0]]));
      t('dropEntries: another colour → kept', !isDroppedEntry(dh, ['__another colour__']));
    }
  } else skipped.push('PHOTOEXCL (GS_NO_PHOTOEXCL=1)');
  t('F8: the enabled shared JSONs are present and well formed', _sharedJsonProblems.length === 0);

  // 3. raw colour (the PHOTOEXCL key) and the variant's own media id (B5)
  t('colour: «Χρώμα» wins over «Χρώμα πέτρας»',
    extractVariantColor([{ name: 'Χρώμα', value: 'Ασημένιο' }, { name: 'Χρώμα πέτρας', value: 'Σιτρίν' }]) === 'Ασημένιο');
  t('colour: the exact axis wins over an earlier composite name',
    extractVariantColor([{ name: 'Επίλεξε νούμερο και χρώμα', value: '52' }, { name: 'Χρώμα', value: 'Επιχρυσωμένο' }]) === 'Επιχρυσωμένο');
  t('colour: no colour option → null', extractVariantColor([{ name: 'Μέγεθος', value: '52' }]) === null);
  t('media id: MediaImage gid → its number', variantMediaImageId({ media: { nodes: [{ id: 'gid://shopify/MediaImage/123' }] } }) === '123');
  t('media id: ImageSource gid → null', variantMediaImageId({ media: { nodes: [{ id: 'gid://shopify/ImageSource/123' }] } }) === null);
  t('media id: no media → null', variantMediaImageId({ media: { nodes: [] } }) === null && variantMediaImageId({}) === null);

  // 4. price strings (B10): Shopify returns "49.0"; the v10 path produced 49 → both must print "49.00 EUR"
  t('price: contextual "49.0" EUR = the v10 string', formatPrice('49.0', 'EUR') === '49.00 EUR' && formatPrice(Math.round(49 * 1 * 100) / 100, 'EUR') === '49.00 EUR');
  t('price: "1018000.0" IDR', formatPrice('1018000.0', 'IDR') === '1018000.00 IDR');

  // 5. image choice on a synthetic 3-colour product (B5, B6, B8, B9)
  if (VARIANTMEDIA_ON && PKG_ON && OTHERCOLOUR_ON && LIFESTYLE_GUARD_ON && EXTRA_IMAGES_CAP >= 3) {
    const im = (id, f) => ({ id: String(id), src: cdn(f) });
    const V = (id, colour, media) => ({ id: String(id), inventory_quantity: 1, media_id: media, selectedOptions: [{ name: 'Χρώμα', value: colour }] });
    const imgs = [im(1, 'st-silver-a.jpg'), im(2, 'st-silver-b.jpg'), im(3, 'st-gift-packaging.jpg'), im(4, 'st-gold-a.jpg'), im(5, 'st-gold-b.jpg')];
    const vS = V(11, 'Ασημένιο', '1'), vS2 = V(12, 'Ασημένιο', null), vG = V(13, 'Επιχρυσωμένο', '4'), vR = V(14, 'Ροζ επιχρυσωμένο', null);
    const prod = { handle: '__selftest__', images: imgs, variants: [vS, vS2, vG, vR], allVariants: [vS, vS2, vG, vR], metafields: {} };
    const plan = buildImagePlan(prod);
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    const pS = pickItemImages(plan, prod.handle, vS, 'Ασημένιο');
    t('images: own photo → image_link = that photo', pS.path === 'own' && pS.variantImage === imgs[0].src);
    t('images: own range, packaging cut out of the extras (B6)', same(pS.additional, [imgs[1].src]) && pS.pkgRemoved === 1);
    t("images: lifestyle kept when images[1] is this colour's", pS.lifestyle === imgs[1].src);
    const pS2 = pickItemImages(plan, prod.handle, vS2, 'Ασημένιο');
    t('images: no own photo → same-colour sibling borrow', pS2.path === 'borrow' && pS2.variantImage === imgs[0].src && same(pS2.additional, [imgs[1].src]));
    const pG = pickItemImages(plan, prod.handle, vG, 'Επιχρυσωμένο');
    t('images: another colour → its own photo and its own range only', pG.path === 'own' && pG.variantImage === imgs[3].src && same(pG.additional, [imgs[4].src]));
    t("images: lifestyle inside another colour's range is blocked (B9/I6)", pG.lifestyle === null && pG.lifestyleBlocked === 'other-colour-range');
    const pG2 = pickItemImages(buildImagePlan({ ...prod, images: [imgs[0], imgs[3], imgs[1]] }), prod.handle, vS, 'Ασημένιο');
    t("images: lifestyle = another colour's OWN photo is blocked (B9)", pG2.lifestyle === null && pG2.lifestyleBlocked === 'other-colour-own');
    const pR = pickItemImages(plan, prod.handle, vR, 'Ροζ επιχρυσωμένο');
    t('images: a colour with no photo → fallback image_link = images[0] (E1 option A)', pR.path === 'fallback-trimmed' && pR.variantImage === imgs[0].src);
    t("images: …and no other colour's photos as extras (B8)", pR.additional.length === 0);
    const imgs2 = [im(21, 'st2-gift-packaging.jpg'), im(22, 'st2-a.jpg'), im(23, 'st2-b.jpg')];
    const v2 = V(31, 'Ασημένιο', null);
    const p2 = pickItemImages(buildImagePlan({ handle: '__st2__', images: imgs2, variants: [v2], allVariants: [v2], metafields: {} }), '__st2__', v2, 'Ασημένιο');
    t('images: image_link is never a packaging photo (guard)', p2.guardFired && p2.variantImage === imgs2[1].src);
    t('images: …the extras hold neither the new image_link nor packaging', same(p2.additional, [imgs2[2].src]));
    t('images: lifestyle equal to the image_link is dropped', p2.lifestyle === null && p2.lifestyleSame === true);
    // R3a tiered borrow. images[0] is the SILVER photo, so a gold item that falls back shows another metal (the
    // 21/09 regression). Gold owns 2 ranges: white pearl [1, 2] (first by position) and black pearl [3, 4].
    const VP = (id, metal, pearl, size, media) => ({ id: String(id), inventory_quantity: 1, media_id: media, selectedOptions: [
      { name: 'Χρώμα', value: metal }, { name: 'Χρώμα μαργαριταριού', value: pearl }, { name: 'Μέγεθος', value: size }] });
    const G = 'Επιχρυσωμένα';
    const vS3 = VP(40, 'Ασημένια', 'Λευκό', 'Μικρά', '51'), vW = VP(41, G, 'Λευκό', 'Μικρά', '52'), vB = VP(42, G, 'Μαύρο', 'Μικρά', '54');
    const vB2 = VP(43, G, 'Μαύρο', 'Μεγάλα', null), vP = VP(44, G, 'Ροζ', 'Μικρά', null), vW2 = VP(45, G, 'Λευκό', 'Μεγάλα', null);
    const vR3 = VP(46, 'Ροζ επιχρυσωμένα', 'Λευκό', 'Μικρά', null);
    const imgs3 = [im(51, 'st3-silver-white.jpg'), im(52, 'st3-gold-white-a.jpg'), im(53, 'st3-gold-white-b.jpg'),
      im(54, 'st3-gold-black-a.jpg'), im(55, 'st3-gold-black-b.jpg')];
    const all3 = [vS3, vW, vB, vB2, vP, vW2, vR3];
    const plan3 = buildImagePlan({ handle: '__st3__', images: imgs3, variants: all3, allVariants: all3, metafields: {} });
    const pB2 = pickItemImages(plan3, '__st3__', vB2, G);
    if (!BORROW_METAL_ONLY) {
      t("R3a tier 1: same metal + same pearl colour → THAT sibling's photo, not the first same-metal sibling's",
        pB2.path === 'borrow' && pB2.borrowTier === 1 && pB2.variantImage === imgs3[3].src && same(pB2.additional, [imgs3[4].src]));
    } else {
      t('R3a with GS_BORROW_METAL_ONLY=1: tier 2 only → the first same-metal sibling, as in round 1',
        pB2.path === 'borrow' && pB2.borrowTier === 2 && pB2.variantImage === imgs3[1].src && same(pB2.additional, [imgs3[2].src]));
    }
    const pP = pickItemImages(plan3, '__st3__', vP, G);
    t('R3a tier 2: same metal, no sibling with this pearl colour → the round-1 same-metal sibling, NOT images[0] (another metal)',
      pP.path === 'borrow' && pP.borrowTier === 2 && pP.variantImage === imgs3[1].src && same(pP.additional, [imgs3[2].src]));
    const pW2 = pickItemImages(plan3, '__st3__', vW2, G);
    t('R3a: same metal and pearl colour, another size → borrow',
      pW2.path === 'borrow' && pW2.variantImage === imgs3[1].src && pW2.borrowTier === (BORROW_METAL_ONLY ? 2 : 1));
    const pR3 = pickItemImages(plan3, '__st3__', vR3, 'Ροζ επιχρυσωμένα');
    t('R3a tier 3: no sibling of that metal → fallback, image_link = images[0] (E1 option A)',
      pR3.path.startsWith('fallback') && pR3.borrowTier === 0 && pR3.variantImage === imgs3[0].src);
    t('F1: colour-like option names, accents / case ignored',
      isColourLikeOption('ΧΡΩΜΑ ΠΕΤΡΑΣ') && isColourLikeOption('Χρώμα ζιρκόν') && isColourLikeOption('Colour') && !isColourLikeOption('Μέγεθος'));
    t('F1: the key keeps the raw colour of a single unnamed option (any switch)',
      borrowKeyOf([{ name: 'Επιλογή', value: 'Ασημένιο' }]) !== borrowKeyOf([{ name: 'Επιλογή', value: 'Χρυσό' }]));
  } else skipped.push('image choice (an image switch is set)');

  // 6. E2 selector on 3 colours × 3 stones × 12 letters = 108 variants, ids DEScending with position
  const big = [];
  let n = 0;
  for (const c of ['Ασημένιο', 'Επιχρυσωμένο', 'Ροζ Επιχρυσωμένο']) {
    for (const s of ['Σιτρίν', 'Ζιρκόν', 'Αμέθυστος']) {
      for (let l = 0; l < 12; l++) {
        big.push({ id: String(900000 - n++), inventory_quantity: 1,
          selectedOptions: [{ name: 'Χρώμα', value: c }, { name: 'Χρώμα πέτρας', value: s }, { name: 'Γράμμα', value: 'L' + l }] });
      }
    }
  }
  big[11].inventory_quantity = 0;   // the lowest id of the first (colour × stone) group is out of stock
  const ids = a => a.map(v => v.id).join(',');
  const P = new Set(['777']);   // R3b: the E2 mode applies only to listed PRODUCT IDS
  t('E2 legacy: the first 100 by position', ids(selectEmittedVariants('777', 't', big, 'legacy', true, P)) === ids(big.slice(0, 100)));
  t('E2 all: every variant', selectEmittedVariants('777', 't', big, 'all', true, P).length === 108);
  const cs = selectEmittedVariants('777', 't', big, 'colour-stone', true, P);
  t('E2 colour-stone: one per colour × stone', cs.length === 9);
  t('E2 colour-stone: the in-stock variant with the LOWEST id, position order kept',
    cs[0].id === big[10].id && cs[1].id === big[23].id && cs.every((v, i) => i === 0 || big.indexOf(v) > big.indexOf(cs[i - 1])));
  t('E2 colour: one per colour', selectEmittedVariants('777', 't', big, 'colour', true, P).length === 3);
  t('E2: a product with ≤ 100 variants is never touched', selectEmittedVariants('777', 't', big.slice(0, 100), 'colour', true, P).length === 100);
  t('R3b: a product id NOT in GS_BIGPRODUCT_IDS with > 100 variants emits the FIRST 100 (legacy), whatever the mode',
    ['legacy', 'all', 'colour', 'colour-stone'].every(m => ids(selectEmittedVariants('778', 't', big, m, true, P)) === ids(big.slice(0, 100))));
  t('R3b: the scope is the product id, not the handle (renamed handle keeps the mode; an empty list → legacy)',
    selectEmittedVariants('777', 'renamed-handle', big, 'all', true, P).length === 108
    && selectEmittedVariants('777', 't', big, 'all', true, new Set()).length === 100);
  t('R3b: the default id list is exactly 4448531972131 = kremasto-monogramma-louloudi (unless GS_BIGPRODUCT_IDS is set)',
    process.env.GS_BIGPRODUCT_IDS !== undefined || [...BIGPRODUCT_IDS].join(',') === '4448531972131');
  // E2 = ii (Bill, 21/09/2026): colour-stone is the DEFAULT; GS_BIGPRODUCT_MODE=legacy (or GS_LEGACY_CAPS=1) is the kill-switch
  const envMode = String(process.env.GS_BIGPRODUCT_MODE || '').trim().toLowerCase();
  t('E2 default: the built-in default is colour-stone (owner decision ii)', BIGPRODUCT_MODE_DEFAULT === 'colour-stone');
  t('E2 default: GS_BIGPRODUCT_MODE unset / invalid → colour-stone; a valid value is honoured',
    BIGPRODUCT_MODE === (BIGPRODUCT_MODES.includes(envMode) ? envMode : 'colour-stone'));
  const effMode = LEGACY_CAPS ? 'legacy' : BIGPRODUCT_MODE;
  const dflt = selectEmittedVariants('777', 't', big, undefined, true, P);   // no mode passed = what a real run does
  t(`E2 effective mode "${effMode}": a run (no mode passed) emits exactly that mode's set`,
    ids(dflt) === ids(selectEmittedVariants('777', 't', big, effMode, true, P)));
  t('E2: default run → one per colour × stone (9 here); kill-switch (GS_BIGPRODUCT_MODE=legacy / GS_LEGACY_CAPS=1) → the first 100',
    effMode === 'colour-stone' ? dflt.length === 9 && ids(dflt) === ids(cs)
      : effMode === 'legacy' ? ids(dflt) === ids(big.slice(0, 100)) : ['all', 'colour'].includes(effMode));

  console.log(`🧪 self-test: ${pass} passed, ${fail} failed` + (skipped.length ? ` · skipped: ${skipped.join('; ')}` : '') + '\n');
  return fail === 0;
}

// v11.5 (B4): how many feed files THIS run wrote — reported on failure (0 ⇒ every previous XML is intact)
let _filesWritten = 0;
function failRun(e) {
  console.error(`\n🔴 GENERATOR FAILED — ${_filesWritten} feed file(s) written by this run before the failure; every other file keeps its previous XML.`);
  console.error(e);
  process.exitCode = 1;   // v11.5: the old .catch(console.error) exited 0, so the workflow never saw a failure
}

// CLI
const arg = process.argv[2];
if (!arg) {
  console.log('❌ Please specify a market code or "all" or "list"');
  console.log('   Example: node google-shopping-feed-v7.js GR');
  process.exit(1);
}

if (arg.toLowerCase() === 'list') listMarkets();
else if (arg.toLowerCase() === 'selftest') process.exitCode = runSelftest() ? 0 : 1;
else if (arg.toLowerCase() === 'all') generateAllFeeds().catch(failRun);
else generateFeed(arg).catch(failRun);
