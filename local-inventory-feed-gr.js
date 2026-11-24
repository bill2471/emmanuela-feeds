/**
 * Local Inventory Feed Generator v1.1.1 for EMMANUELA
 *
 * v1.1.1 (2026-11-24 — [SEO] lane · DRY, deployed only after Bill's explicit ok) — the BF effective date in UTC:
 *   <g:sale_price_effective_date> is written as 2026-11-22T22:00Z/2026-11-30T21:59Z (the same instants, Google's
 *   documented «Z» form) — same reason and same change as google-shopping-feed-v7.js v11.10.1. Nothing else changes.
 *
 * v1.1 (2026-11-12 — [SEO] lane · DRY, deployed only after Bill's explicit ok) — BLACK FRIDAY 23–30/11/2026:
 *   BF1 the workshop (store code «emmanuela») sells at −20% during Black Friday too (Bill 12/11/2026: «Ναι, −20% κι εκεί»).
 *       From GS_BF_ANNOUNCE_FROM (default 2026-11-20T00:00Z) until the end of the sale an entry also carries
 *       <g:sale_price> + <g:sale_price_effective_date>2026-11-23T00:00+0200/2026-11-30T23:59+0200</g:sale_price_effective_date>
 *       (Google fetches this file once a day at 00:00 Europe/Athens; without the date the in-store price would switch
 *       a day late and stay low a day too long). <g:price> stays the regular price.
 *       The sale price is READ from the Shopify price list «BF 2026 EUR (−20%)» — the same list the online store uses —
 *       and only when the list's reference price == the variant's price today (EUR); anything else gets no sale price.
 *       The in-store price is the owner's decision: this file does NOT follow the online Rollout.
 *       The price-list read is FAIL-OPEN: an error ⇒ no Black Friday tag in that run, the file is written as in v1.0.
 *       After the END the block is inert. Kill-switch GS_NO_BF=1 = v1.0 output. GS_BF_NOW / GS_BF_ANNOUNCE_FROM: tests only.
 *       ⚠ The BF constants below MUST stay identical to BF_CONFIG in google-shopping-feed-v7.js (v11.10).
 *   Offline self-test (no token, no network): node local-inventory-feed-gr.js selftest
 *
 * Based on google-shopping-feed-v7.js — same GraphQL fetch, same variant IDs.
 * Generates a Local Product Inventory Feed for Google Merchant Center.
 *
 * Google spec: https://support.google.com/merchants/answer/3061342
 *
 * Required fields per entry:
 *   - id (must match primary feed EXACTLY)
 *   - store_code (must match Business Profile in GMC)
 *   - availability (in_stock)
 *   - price (EUR)
 *   - quantity
 *
 * Logic:
 *   - Only includes variants with inventory_quantity > 0 (same as primary feed)
 *   - Variants with 0 stock are NOT included (product discontinued)
 *   - IDs are Shopify variant IDs (stripped from gid://) — matches primary feed
 *
 * Store: EMMANUELA handcrafted for you®
 * Address: Gymnasiou 15, 57007 Nea Chalkidona, Thessaloniki, Greece
 *
 * Usage:
 *   SHOPIFY_ACCESS_TOKEN=shpat_xxx node local-inventory-feed-gr.js
 *
 * Created: 2026-02-16
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

// ============================================
// CONFIGURATION
// ============================================

const SHOPIFY_STORE = 'emmanuela-gr.myshopify.com';
const API_VERSION = '2024-01';
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

if (!ACCESS_TOKEN && process.argv[2] !== 'selftest') {
  console.error('❌ ERROR: SHOPIFY_ACCESS_TOKEN environment variable not set!');
  console.error('   Set it with: set SHOPIFY_ACCESS_TOKEN=your_token_here');
  process.exit(1);
}

// Google Business Profile store code (case-sensitive, all lowercase)
// Verified from Google Business Profile Manager (16/02/2026)
const STORE_CODE = 'emmanuela';

const OUTPUT_DIR = path.join(__dirname, 'feeds');

// v1.1 (BF1): BLACK FRIDAY 2026 — the workshop sells at the BF price too. GS_NO_BF=1 = v1.0 output.
// ⚠ Keep identical to BF_CONFIG in google-shopping-feed-v7.js (v11.10.1): price list, effective date, start, end, announce date.
const BF_ON = process.env.GS_NO_BF !== '1';
const bfInstant = (name, fallbackMs) => {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallbackMs;
  const ms = Date.parse(raw);
  if (Number.isNaN(ms)) { console.error(`🔴 ${name}="${raw}" is not a date — ignored.`); return fallbackMs; }
  console.error(`🟠 ${name}=${raw} is set — the Black Friday timing is OVERRIDDEN for this run (tests only).`);
  return ms;
};
const BF_CONFIG = Object.freeze({
  priceListId: 'gid://shopify/PriceList/32322257230',                        // «BF 2026 EUR (−20%)» — bulletin 23586
  effective: '2026-11-22T22:00Z/2026-11-30T21:59Z',                          // v1.1.1: UTC «Z», the same instants (Help answer/6324460, answer/3061342)
  startMs: Date.UTC(2026, 10, 22, 22, 0),                                    // 23/11 00:00 Europe/Athens
  endMs: Date.UTC(2026, 10, 30, 21, 59),                                     // 30/11 23:59 Europe/Athens
  announceFromMs: bfInstant('GS_BF_ANNOUNCE_FROM', Date.UTC(2026, 10, 20, 0, 0)),
});
const BF_NOW_MS = bfInstant('GS_BF_NOW', Date.now());   // ONE clock per run

// ============================================
// SHOPIFY GraphQL (identical to google-shopping-feed-v7.js)
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
        } catch (e) { reject(new Error(`Parse error: ${e.message}`)); }
      });
    });
    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

async function graphqlRequest(query, variables = undefined) {
  const options = {
    hostname: SHOPIFY_STORE,
    path: `/admin/api/${API_VERSION}/graphql.json`,
    method: 'POST',
    headers: { 'X-Shopify-Access-Token': ACCESS_TOKEN, 'Content-Type': 'application/json' }
  };
  return httpsRequest(options, JSON.stringify(variables ? { query, variables } : { query }));
}

// ============================================
// FETCH PRODUCTS (same query as primary feed — ensures matching IDs)
// ============================================

async function fetchProducts() {
  console.log('📦 Fetching products from Shopify (GraphQL)...\n');

  const allProducts = [];
  let cursor = null;
  let page = 1;

  while (true) {
    const afterClause = cursor ? `, after: "${cursor}"` : '';

    // Simplified query — we only need id, price, inventory for local inventory
    const query = `{
      products(first: 50, query: "status:active"${afterClause}) {
        pageInfo { hasNextPage endCursor }
        edges {
          node {
            id
            variants(first: 100) {
              edges {
                node {
                  id
                  price
                  inventoryQuantity
                }
              }
            }
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
          variants: (node.variants?.edges || []).map(e => ({
            id: e.node.id.replace('gid://shopify/ProductVariant/', ''),
            price: e.node.price,
            inventory_quantity: e.node.inventoryQuantity
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
    } catch (error) { console.error(`❌ Error: ${error.message}`); break; }
  }

  console.log(`\n✅ Total products: ${allProducts.length}\n`);
  return allProducts;
}

// ============================================
// v1.1 (BF1): BLACK FRIDAY — sale price of the workshop, read from the Shopify BF price list
// ============================================

// PURE (every branch is in the self-test). basePrice = the variant's price today; bf = its row in the BF price list
// { price, compareAt, currency } or undefined → { state, salePrice (an amount) | null }
//   off        before the announce date · after the end · no config
//   sale       <g:sale_price> = the list price, with the effective date; <g:price> stays the regular price
//   no-entry | mismatch   → no Black Friday tag (counted in the log)
function bfLocalDecision(basePrice, bf, nowMs, cfg) {
  const none = state => ({ state, salePrice: null });
  if (!cfg || !(nowMs >= cfg.announceFromMs) || !(nowMs <= cfg.endMs)) return none('off');
  if (!bf) return none('no-entry');
  const cents = a => Math.round(parseFloat(a) * 100);
  const now = cents(basePrice), bfP = cents(bf.price), bfC = cents(bf.compareAt);
  if (bf.currency !== 'EUR' || !(bfP > 0) || !(bfC > bfP) || bfC !== now) return none('mismatch');
  return { state: 'sale', salePrice: bf.price };
}

// FAIL-OPEN: any error ⇒ null ⇒ this run writes the file exactly as v1.0 and says so in red.
async function fetchBfPrices() {
  if (!BF_ON) { console.log('🖤 BF: GS_NO_BF=1 — no Black Friday tags (= v1.0)\n'); return null; }
  if (BF_NOW_MS > BF_CONFIG.endMs) { console.log('🖤 BF: the window ended — no Black Friday tags\n'); return null; }
  try {
    const map = new Map();
    const query = `query($id: ID!, $c: String) { priceList(id: $id) { fixedPricesCount prices(first: 250, after: $c, originType: FIXED) {
      pageInfo { hasNextPage endCursor } nodes { variant { id } price { amount currencyCode } compareAtPrice { amount currencyCode } } } } }`;
    let cursor = null, pages = 0, expected = null;
    do {
      let data = null;
      for (let attempt = 1; attempt <= 4; attempt++) {
        ({ data } = await graphqlRequest(query, { id: BF_CONFIG.priceListId, c: cursor }));
        if (!(data.errors && JSON.stringify(data.errors).includes('THROTTLED'))) break;
        await new Promise(r => setTimeout(r, 2000 * attempt));
      }
      if (data.errors) throw new Error(`GraphQL errors ${JSON.stringify(data.errors).slice(0, 300)}`);
      const pl = data.data?.priceList;
      if (!pl || !pl.prices || !Array.isArray(pl.prices.nodes)) throw new Error('the price list was not returned');
      expected = pl.fixedPricesCount;
      for (const n of pl.prices.nodes) {
        if (!n.variant || !n.price || !n.compareAtPrice || n.price.currencyCode !== n.compareAtPrice.currencyCode) continue;
        map.set(n.variant.id.replace('gid://shopify/ProductVariant/', ''), { price: n.price.amount, compareAt: n.compareAtPrice.amount, currency: n.price.currencyCode });
      }
      cursor = pl.prices.pageInfo.hasNextPage ? pl.prices.pageInfo.endCursor : null;
      if (++pages > 200) throw new Error('more than 200 pages');
      await new Promise(r => setTimeout(r, 300));
    } while (cursor);
    if (!map.size) throw new Error('0 usable rows');
    const phase = BF_NOW_MS < BF_CONFIG.announceFromMs ? `read OK — nothing is announced before ${new Date(BF_CONFIG.announceFromMs).toISOString()}`
      : BF_NOW_MS < BF_CONFIG.startMs ? 'ANNOUNCING (before the start)' : 'SALE window';
    console.log(`🖤 BF: price list ${BF_CONFIG.priceListId.split('/').pop()} — ${map.size} of ${expected} fixed prices usable in ${pages} queries · ${phase}\n`);
    return map;
  } catch (e) {
    console.error(`🔴 BF: the price list could not be read (${e.message}) — this run writes NO Black Friday tag (= v1.0).\n`);
    return null;
  }
}

function runSelftest() {
  let pass = 0, fail = 0;
  const t = (name, cond) => { if (cond) pass++; else { fail++; console.error(`   ✗ FAIL: ${name}`); } };
  const C = BF_CONFIG, mid = C.startMs - 3600e3, live = C.startMs + 3600e3;
  const row = (p, c, cur = 'EUR') => ({ price: p, compareAt: c, currency: cur });
  const inst = s => Date.parse(s.replace(/([+-]\d{2})(\d{2})$/, '$1:$2'));
  console.log('\n🧪 local inventory v1.1.1 self-test (offline)\n');
  t('BF1a: the effective date is in Google\'s UTC format (YYYY-MM-DDThh:mmZ/…), at most 51 characters', /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}Z\/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}Z$/.test(C.effective) && C.effective.length <= 51);
  t('BF1a: control — the UTC format check rejects ±hhmm, ±hh:mm and a missing zone, and accepts …Z', ['2026-11-23T00:00+0200/', '2026-11-23T00:00+02:00/', '2026-11-23T00:00/'].every(s => !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}Z\//.test(s)) && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}Z\//.test('2026-11-22T22:00Z/'));
  t('BF1: the effective date IS 23/11 00:00 → 30/11 23:59 Europe/Athens', inst(C.effective.split('/')[0]) === C.startMs && inst(C.effective.split('/')[1]) === C.endMs && C.startMs === Date.parse('2026-11-22T22:00:00Z') && C.endMs === Date.parse('2026-11-30T21:59:00Z'));
  const a = bfLocalDecision('59.00', row('47.2', '59.0'), mid, C);
  t('BF1: before the start, 59 + list 47.20/59 → sale 47.20', a.state === 'sale' && `${parseFloat(a.salePrice).toFixed(2)} EUR` === '47.20 EUR');
  t('BF1: inside the sale window the same item keeps its sale price (the workshop does not follow the Rollout)', bfLocalDecision('59.00', row('47.2', '59.0'), live, C).state === 'sale');
  t('BF1: before the announce date and after the end → off', bfLocalDecision('59.00', row('47.2', '59.0'), C.announceFromMs - 1, C).state === 'off' && bfLocalDecision('59.00', row('47.2', '59.0'), C.endMs + 1, C).state === 'off');
  t('BF1: no list row → no tag', bfLocalDecision('59.00', undefined, mid, C).state === 'no-entry' && bfLocalDecision('59.00', undefined, mid, C).salePrice === null);
  t('BF1: list reference 69 ≠ today\'s price 79 (the 4 × 1365M) → no tag', bfLocalDecision('79.00', row('55.2', '69.0'), mid, C).state === 'mismatch');
  t('BF1: list in another currency, or list price not below its reference → no tag', bfLocalDecision('59.00', row('47.2', '59.0', 'USD'), mid, C).state === 'mismatch' && bfLocalDecision('59.00', row('59.0', '59.0'), mid, C).state === 'mismatch');
  t('BF1: no config → off', bfLocalDecision('59.00', row('47.2', '59.0'), mid, null).state === 'off');
  const feed = (now, prices) => generateLocalInventoryFeed([{ id: '1', variants: [{ id: '11', price: '59.00', inventory_quantity: 2 }, { id: '12', price: '79.00', inventory_quantity: 1 }, { id: '13', price: '59.00', inventory_quantity: 0 }] }], prices, now).xml;
  const P = new Map([['11', row('47.2', '59.0')], ['12', row('55.2', '69.0')]]);
  const on = feed(mid, P), off = feed(mid, null), late = feed(C.endMs + 1, P);
  const strip = x => x.replace(/<updated>[^<]*<\/updated>/, '');
  t('BF1 feed: the announced entry has the sale price and the date right after <g:price>', on.includes(`<g:price>59.00 EUR</g:price>\n      <g:sale_price>47.20 EUR</g:sale_price>\n      <g:sale_price_effective_date>${C.effective}</g:sale_price_effective_date>\n      <g:availability>in_stock</g:availability>`));
  t('BF1 feed: exactly one sale price (the 79 ≠ 69 entry and the out-of-stock one get none)', (on.match(/<g:sale_price>/g) || []).length === 1 && (on.match(/<entry>/g) || []).length === 2);
  t('BF1 feed: without the price list, and after the end, the file is the v1.0 file', !/sale_price/.test(off) && strip(late) === strip(off));
  console.log(`🧪 self-test: ${pass} passed, ${fail} failed\n`);
  return fail === 0;
}

// ============================================
// GENERATE LOCAL INVENTORY FEED
// ============================================

function generateLocalInventoryFeed(products, bfPrices = null, nowMs = BF_NOW_MS) {
  console.log('🏭 Generating Local Inventory Feed...\n');

  const entries = [];
  let stats = { totalVariants: 0, inStock: 0, skipped: 0, bf: {} };

  products.forEach(product => {
    product.variants.forEach(variant => {
      stats.totalVariants++;

      // Only include variants with stock > 0
      // Variants with 0 = discontinued, not in feed
      if (variant.inventory_quantity <= 0) {
        stats.skipped++;
        return;
      }

      stats.inStock++;

      const price = `${parseFloat(variant.price).toFixed(2)} EUR`;
      // v1.1 (BF1): Black Friday sale price of the workshop (bfLocalDecision) — '' when there is none
      let bfTags = '';
      if (bfPrices) {
        const bf = bfLocalDecision(variant.price, bfPrices.get(String(variant.id)), nowMs, BF_CONFIG);
        stats.bf[bf.state] = (stats.bf[bf.state] || 0) + 1;
        if (bf.state === 'sale') bfTags = `\n      <g:sale_price>${parseFloat(bf.salePrice).toFixed(2)} EUR</g:sale_price>\n      <g:sale_price_effective_date>${BF_CONFIG.effective}</g:sale_price_effective_date>`;
      }

      entries.push(`    <entry>
      <g:id>${variant.id}</g:id>
      <g:store_code>${STORE_CODE}</g:store_code>
      <g:quantity>${variant.inventory_quantity}</g:quantity>
      <g:price>${price}</g:price>${bfTags}
      <g:availability>in_stock</g:availability>
    </entry>`);
    });
  });

  console.log(`   📊 Stats:`);
  console.log(`      Total variants scanned: ${stats.totalVariants}`);
  console.log(`      In stock (included):    ${stats.inStock}`);
  console.log(`      Out of stock (skipped): ${stats.skipped}`);
  if (bfPrices && nowMs >= BF_CONFIG.announceFromMs && nowMs <= BF_CONFIG.endMs) {
    const n = k => stats.bf[k] || 0;
    console.log(`      🖤 [BF] with a sale price ${n('sale')} · without ${n('no-entry') + n('mismatch')} (no list row ${n('no-entry')} · list ≠ today's price ${n('mismatch')})`);
  }
  console.log('');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:g="http://base.google.com/ns/1.0">
  <title>EMMANUELA Local Inventory Feed — Greece</title>
  <link href="https://emmanuela.gr"/>
  <updated>${new Date().toISOString()}</updated>
${entries.join('\n')}
</feed>`;

  return { xml, stats };
}

// ============================================
// MAIN
// ============================================

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  EMMANUELA Local Inventory Feed Generator v1.1.1');
  console.log('  Based on google-shopping-feed-v7.js (same IDs)');
  console.log('═══════════════════════════════════════════════════════════\n');
  console.log(`Store Code: ${STORE_CODE}`);
  console.log(`Output: feeds/local-inventory-gr.xml\n`);

  try {
    const products = await fetchProducts();
    if (products.length === 0) { console.error('❌ No products found'); process.exit(1); }

    const bfPrices = await fetchBfPrices();   // v1.1 (BF1): fail-open — null = no Black Friday tag in this run
    const { xml, stats } = generateLocalInventoryFeed(products, bfPrices);

    // Save feed
    if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

    const feedPath = path.join(OUTPUT_DIR, 'local-inventory-gr.xml');
    fs.writeFileSync(feedPath, xml, 'utf8');

    console.log(`✅ Local Inventory Feed saved: ${feedPath}`);
    console.log(`   Entries: ${stats.inStock} (matching primary feed variant IDs)`);
    console.log(`   Skipped: ${stats.skipped} (out of stock)\n`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

if (process.argv[2] === 'selftest') process.exitCode = runSelftest() ? 0 : 1;
else main();
