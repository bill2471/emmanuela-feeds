/**
 * Skroutz COMBINED feed — SANDAL entries builder (MODULE).
 * =======================================================
 * Produces the footwear <product> entries that get MERGED into skroutz-gr.xml
 * (jewelry + sandals in one <mywebstore><products>), per George's 08/06 decision
 * (same account 29632, same feed).
 *
 * TWO-LAYER design (so prices are human-controlled, stock is always live):
 *   • PRICE/TIER = FROZEN — read from skroutz-shoes-pricing.json (built by
 *     emmanuela-shoes/_make-pricing-frozen.js, reviewed/tweaked by Bill+Emmanuela,
 *     COGS-floor clamped). Matched per group via skuToKey (any in-stock SKU).
 *       - SLASH  -> frozen clearance price (deliberate, floored)
 *       - KEEP   -> LIVE normal Shopify price (follows the store)
 *       - unmatched in-stock published sandal -> KEEP @ live normal (feed stays complete)
 *   • STOCK = LIVE — per-size <quantity> pulled from Shopify-shoes each run.
 *
 * Grouping/dedup is IDENTICAL to the approved skroutz-shoes-DRAFT.xml
 * (group by product+rawColor, dedup the 4x catalog duplication via sku-set
 * fingerprint) so the merged output matches what Bill reviewed (~355 entries).
 *
 * RESILIENCE (the 2026-06-08 GLAMI lesson): CI pre-wait + strong throttle backoff,
 * and FAIL-LOUD — if the shoes pull comes back partial it THROWS, so the caller
 * writes a jewelry-only feed instead of silently dropping sandals or shipping a
 * sandal-less feed that looks complete.
 *
 * Exports: async buildSandalItems() -> { items: string[], stats }
 * Standalone: `node skroutz-shoes-builder.js` writes a local review DRAFT.
 *
 * Token: process.env.SHOPIFY_SHOES_ACCESS_TOKEN (CI) OR SHOPIFY_TOKEN_SHOES in
 * order-aggregator/.env (local). NEVER the jewelry token.
 */
'use strict';
const https = require('https');
const fs = require('fs');
const path = require('path');

const SHOP = 'emmanuela-shoes.myshopify.com';
const API = '2024-10';
const DOMAIN = 'emmanuela.shoes';
const BRAND = 'Emmanuela - handcrafted for you';
const VAT_RATE = 24;
const AVAIL = 'Παράδοση 1 έως 3 ημέρες';
const PRICING_PATH = path.join(__dirname, 'skroutz-shoes-pricing.json');
// imageId -> 'L' (lifestyle: model/scene, shared across the product's colors)
//          | 'P' (white-bg product shot, color-specific)
//          | 'C' (size-chart/infographic uploaded as product media — never emitted)
//          | 'G' (generic asset reused across >3 distinct designs: charts, flex demos,
//                 packaging, cross-product shots — never emitted; would show «άλλα σχέδια»)
//          | 'F' (theme-file upload: size charts, brand assets — never emitted).
// Built offline by skroutz-feed/emmanuela-shoes/_classify-lifestyle.py. Missing/empty file
// -> builder behaves exactly like the pre-lifestyle version (pure boundary heuristic).
const LIFESTYLE_PATH = path.join(__dirname, 'skroutz-shoes-lifestyle.json');
const MIN_PRODUCTS = 100;   // full shoes catalog ~495; anything tiny = failed/partial fetch

// ---- token resolution (CI env first, then local .env) ----
function loadToken() {
  if (process.env.SHOPIFY_SHOES_ACCESS_TOKEN) return process.env.SHOPIFY_SHOES_ACCESS_TOKEN;
  const candidates = ['C:/Users/bill/shopify-mcp-work/order-aggregator/.env', path.join(__dirname, '.env')];
  for (const p of candidates) {
    try {
      const t = fs.readFileSync(p, 'utf8');
      for (const l of t.split(/\r?\n/)) { if (l.trim().startsWith('#')) continue; const i = l.indexOf('='); if (i > 0 && l.slice(0, i).trim() === 'SHOPIFY_TOKEN_SHOES') return l.slice(i + 1).trim(); }
    } catch { /* next */ }
  }
  return null;
}

// ---- colors (verbatim from build-skroutz-shoes-feed.js) ----
const COLOR_MAP = { 'καφε': 'Καφέ', 'καφέ': 'Καφέ', 'ταμπα': 'Ταμπά', 'ταμπά': 'Ταμπά', 'tan': 'Ταμπά', 'cognac': 'Ταμπά', 'camel': 'Ταμπά',
  'μαυρο': 'Μαύρο', 'μαύρο': 'Μαύρο', 'black': 'Μαύρο', 'λευκο': 'Λευκό', 'λευκό': 'Λευκό', 'white': 'Λευκό',
  'μπεζ': 'Μπεζ', 'beige': 'Μπεζ', 'εκρου': 'Μπεζ', 'εκρού': 'Μπεζ', 'nude': 'Μπεζ', 'φυσικο': 'Μπεζ', 'φυσικό': 'Μπεζ', 'natural': 'Μπεζ',
  'κοκκινο': 'Κόκκινο', 'κόκκινο': 'Κόκκινο', 'red': 'Κόκκινο', 'μπορντο': 'Μπορντό', 'μπορντό': 'Μπορντό',
  'πρασινο': 'Πράσινο', 'πράσινο': 'Πράσινο', 'green': 'Πράσινο', 'χακι': 'Χακί', 'λαδι': 'Λαδί',
  'μπλε': 'Μπλε', 'blue': 'Μπλε', 'navy': 'Μπλε', 'κιτρινο': 'Κίτρινο', 'χρυσο': 'Χρυσό', 'χρυσό': 'Χρυσό', 'gold': 'Χρυσό',
  'ασημι': 'Ασημί', 'ασημί': 'Ασημί', 'silver': 'Ασημί', 'ροζ': 'Ροζ', 'pink': 'Ροζ', 'γκρι': 'Γκρι', 'grey': 'Γκρι', 'gray': 'Γκρι',
  'πορτοκαλι': 'Πορτοκαλί', 'μωβ': 'Μωβ', 'purple': 'Μωβ', 'λιλα': 'Λιλά' };
function greekColor(raw) { if (!raw) return null; const n = String(raw).toLowerCase().trim(); if (COLOR_MAP[n]) return COLOR_MAP[n]; for (const [k, v] of Object.entries(COLOR_MAP)) if (n.includes(k)) return v; return String(raw).trim(); }

function escapeXml(s) { if (!s) return ''; return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&quot;'); }
function extractColor(opts) { if (!opts) return null; for (const o of opts) { const n = (o.name || '').toLowerCase(); if (n.includes('χρώμα') || n.includes('color') || n.includes('colour')) return o.value; } return null; }
function extractSize(opts) { if (!opts) return null; for (const o of opts) { const n = (o.name || '').toLowerCase(); if (n.includes('μέγεθος') || n.includes('size') || n.includes('νούμερο') || n.includes('number')) return o.value; } return null; }
const normSize = (s) => s ? String(s).replace(/^EU\s*/i, '').trim() : s;
function ean13(b) { if (!b) return null; let e = String(b).trim(); if (e.length === 14 && e.startsWith('0')) e = e.slice(1); return /^\d{8}$|^\d{12}$|^\d{13}$/.test(e) ? e : null; }
function category(productType, isMen) {
  const t = (productType || '').toLowerCase();
  const gender = (/ανδρικ|men/.test(t) || isMen) ? 'Ανδρικά' : 'Γυναικεία';
  let sub = 'Σανδάλια';
  if (/παντόφλ|mule/.test(t)) sub = 'Παντόφλες'; else if (/πέδιλ/.test(t)) sub = 'Πέδιλα';
  else if (/εσπαντρίγ|espadrille/.test(t)) sub = 'Εσπαντρίγιες'; else if (/σαγιονάρ/.test(t)) sub = 'Σαγιονάρες';
  return `Μόδα > ${gender} Παπούτσια > ${sub}`;
}

// ---- HTTPS / GraphQL (throttle-resilient) ----
function req(opts, body) { return new Promise((res, rej) => { const r = https.request(opts, (x) => { const c = []; x.on('data', (d) => c.push(d)); x.on('end', () => { try { res(JSON.parse(Buffer.concat(c).toString('utf8'))); } catch (e) { rej(e); } }); }); r.on('error', rej); r.setTimeout(30000, () => r.destroy(new Error('timeout'))); if (body) r.write(body); r.end(); }); }
async function gql(query, token, tries = 6) {
  const opts = { hostname: SHOP, path: `/admin/api/${API}/graphql.json`, method: 'POST', headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' } };
  let lastErr;
  for (let i = 1; i <= tries; i++) {
    try {
      const r = await req(opts, JSON.stringify({ query }));
      const throttled = r && r.errors && (r.errors[0]?.extensions?.code === 'THROTTLED' || JSON.stringify(r.errors).includes('Throttled'));
      if (throttled) { await new Promise((x) => setTimeout(x, Math.min(i * 5000, 30000))); continue; }
      return r;
    } catch (e) { lastErr = e; await new Promise((x) => setTimeout(x, Math.min(i * 5000, 30000))); }
  }
  throw lastErr || new Error('GraphQL: max retries exceeded');
}

async function fetchProducts(token) {
  // CI pre-wait: BestPrice-shoes / GLAMI-shoes / Google-shoes drain the shoes-store
  // budget; without this the pull throttles → partial → (now) THROWS instead of
  // silently emitting a sandal-less feed.
  if (process.env.CI || process.env.GITHUB_ACTIONS) { await new Promise((r) => setTimeout(r, 30000)); }
  const out = []; let cursor = null; let page = 1; let consecutiveErrors = 0;
  while (true) {
    const after = cursor ? `, after: "${cursor}"` : '';
    const q = `{ products(first: 50, query: "status:active"${after}) { pageInfo { hasNextPage endCursor } edges { node {
      id title handle productType onlineStoreUrl images(first: 30){ edges { node { id url } } }
      variants(first: 100){ edges { node { id sku price inventoryQuantity barcode image { id } selectedOptions { name value } } } } } } } }`;
    const r = await gql(q, token);
    if (r.errors) {
      consecutiveErrors++;
      if (consecutiveErrors >= 3) throw new Error('GraphQL errors x3: ' + JSON.stringify(r.errors[0] || r.errors));
      await new Promise((x) => setTimeout(x, 30000)); continue;
    }
    consecutiveErrors = 0;
    const edges = (r.data && r.data.products && r.data.products.edges) || [];
    for (const { node } of edges) {
      out.push({ id: node.id.replace('gid://shopify/Product/', ''), title: node.title, handle: node.handle, productType: node.productType, onlineStoreUrl: node.onlineStoreUrl,
        images: (node.images.edges || []).map((e) => ({ id: e.node.id.replace('gid://shopify/ProductImage/', ''), src: e.node.url })),
        variants: (node.variants.edges || []).map((e) => ({ id: e.node.id.replace('gid://shopify/ProductVariant/', ''), sku: e.node.sku, price: e.node.price != null ? parseFloat(e.node.price) : null, qty: e.node.inventoryQuantity || 0, barcode: e.node.barcode, imageId: e.node.image && e.node.image.id ? e.node.image.id.replace('gid://shopify/ProductImage/', '') : null, opts: e.node.selectedOptions })) });
    }
    const pi = r.data.products.pageInfo; if (!pi.hasNextPage) break; cursor = pi.endCursor; page++; await new Promise((x) => setTimeout(x, 320));
  }
  return out;
}

// ---- COGS floor resolution ----
// number = flat floor; object = { grossUp, packagingPerPair, inboundShipPerPair, byRoot{root:netCost}, byType{type:netCost}, default }.
// floor = (base_net_cost + packaging + inbound_shipping) * grossUp ; base = byRoot[root] ?? byType[type] ?? legacy[type] ?? default.
// grossUp covers VAT (1.24) + Skroutz commission (Bill set 1.46). packaging (~€1.5) + inbound
// shipping from Crete (~€2) are per-pair logistics added to supplier cost (Bill 2026-06-09). Labor NOT added.
function resolveFloor(cogsFloor, type, root) {
  if (cogsFloor == null) return null;
  if (typeof cogsFloor === 'number') return cogsFloor;
  if (typeof cogsFloor !== 'object') return null;
  const g = (typeof cogsFloor.grossUp === 'number') ? cogsFloor.grossUp : 1;
  let base = null;
  if (cogsFloor.byRoot && root != null && cogsFloor.byRoot[root] != null) base = cogsFloor.byRoot[root];
  else if (cogsFloor.byType && type != null && cogsFloor.byType[type] != null) base = cogsFloor.byType[type];
  else if (cogsFloor[type] != null) base = cogsFloor[type];          // legacy per-type at top level
  else if (cogsFloor.default != null) base = cogsFloor.default;
  else if (cogsFloor['*'] != null) base = cogsFloor['*'];            // legacy wildcard
  if (base == null) return null;
  // per-pair logistics added to the supplier cost BEFORE grossUp (Bill 2026-06-09):
  // packaging + inbound shipping from Crete. Labor NOT added (already in supplier price).
  const addPerPair = (cogsFloor.packagingPerPair || 0) + (cogsFloor.inboundShipPerPair || 0);
  return (base + addPerPair) * g;
}

async function buildSandalItems() {
  const token = loadToken();
  if (!token) throw new Error('No shoes token (set SHOPIFY_SHOES_ACCESS_TOKEN, or SHOPIFY_TOKEN_SHOES in order-aggregator/.env)');
  if (!fs.existsSync(PRICING_PATH)) throw new Error('Missing frozen pricing table: ' + PRICING_PATH);
  const pricing = JSON.parse(fs.readFileSync(PRICING_PATH, 'utf8'));
  const skuToKey = pricing.skuToKey || {};
  const prices = pricing.prices || {};
  const overrides = pricing.overrides || {};

  const products = await fetchProducts(token);
  if (products.length < MIN_PRODUCTS) {
    throw new Error(`Only ${products.length} shoes products fetched (expected ~495) — partial/throttled pull; refusing to emit a sandal-less feed.`);
  }

  // lifestyle map (optional — empty map = legacy pure-boundary behavior)
  let LIFE = {};
  try { LIFE = JSON.parse(fs.readFileSync(LIFESTYLE_PATH, 'utf8')); } catch { /* keep legacy */ }
  const hasLife = Object.keys(LIFE).length > 0;
  // No URL-shape fallback: newer product media ALSO lives under .../files/ (the φύλλα-ελιάς family
  // galleries are entirely there, incl. their lifestyle). Unmapped image -> null = legacy behavior.
  const cls = (im) => LIFE[im.id] || null;

  // Lifestyle pool per PHYSICAL product. The 4-8× catalog clones MIRROR the same variants, but the
  // lifestyle uploads are SPRINKLED unevenly across them (one clone holds 1, a sibling holds 2…), so
  // we UNION every clone's lifestyle into one shared pool, keyed by the SIZELESS sku-root set (clones
  // with partial size ranges still group). Without the union a clone holding a single lifestyle stays
  // at +1 additional instead of inheriting its siblings' shots (Bill 2026-06-10).
  const sizelessKey = (p) => [...new Set(p.variants.map((v) => (v.sku || '').replace(/\d+$/, '')).filter(Boolean))].sort().join('|');
  const clonePools = new Map();
  if (hasLife) {
    for (const p of products) {
      const key = sizelessKey(p);
      if (!key) continue;
      let acc = clonePools.get(key);
      if (!acc) { acc = []; clonePools.set(key, acc); }
      for (const im of p.images) if (cls(im) === 'L' && !acc.includes(im.src)) acc.push(im.src);
    }
  }

  const stats = { products: products.length, groups: 0, slash: 0, keep: 0, keepDefault: 0, variations: 0, units: 0, unmatched: 0, skippedUnpublished: 0, withAdditional: 0, additionalTotal: 0, multiColorMainOnly: 0, lifestylePooled: 0, byType: {}, samples: [] };
  const items = [];
  const seenFp = new Set();

  for (const p of products) {
    if (!p.onlineStoreUrl) { stats.skippedUnpublished++; continue; }  // unpublished → /products/handle 404
    // group in-stock variants by raw color (matches approved DRAFT granularity)
    const byColor = {};
    for (const v of p.variants) {
      if (v.qty <= 0) continue;
      const size = normSize(extractSize(v.opts)); if (!size) continue;
      const ckey = (extractColor(v.opts) || '∅').toLowerCase().trim();
      (byColor[ckey] ||= { colorRaw: extractColor(v.opts), sizes: [] }).sizes.push({ size, qty: v.qty, sku: v.sku, barcode: v.barcode, variantId: v.id, price: v.price, imageId: v.imageId });
    }
    for (const g of Object.values(byColor)) {
      // collapse duplicate sizes (keep max qty), order by numeric size
      const bySize = {};
      for (const s of g.sizes) { const cur = bySize[s.size]; if (!cur || s.qty > cur.qty) bySize[s.size] = s; }
      const sizes = Object.values(bySize).sort((a, b) => (parseFloat(a.size) || 0) - (parseFloat(b.size) || 0));
      if (!sizes.length) continue;
      // dedup 4x catalog duplication (clones share identical SKUs)
      const fp = sizes.map((s) => s.sku).sort().join('|');
      if (seenFp.has(fp)) continue; seenFp.add(fp);

      const color = greekColor(g.colorRaw) || 'Καφέ';
      const type = p.productType || '';
      const isMen = /ανδρικ|men/i.test(type);
      const liveNormal = Math.max(...sizes.map((s) => s.price || 0), 0);

      // --- frozen price/tier lookup (via any in-stock sku) ---
      let key = null;
      for (const s of sizes) { if (s.sku && skuToKey[s.sku]) { key = skuToKey[s.sku]; break; } }
      const fr = key ? prices[key] : null;
      const ov = key ? overrides[key] : null;
      let tier, finalPrice;
      if (!fr && !ov) {
        // not in approved snapshot → keep at live normal (feed stays complete)
        tier = 'KEEP'; finalPrice = liveNormal; stats.unmatched++; stats.keepDefault++;
      } else {
        tier = (ov && ov.tier) ? ov.tier : fr.tier;
        if (tier === 'KEEP') {
          finalPrice = (ov && ov.price != null) ? ov.price : liveNormal;   // KEEP follows live store price
        } else {
          finalPrice = (ov && ov.price != null) ? ov.price : fr.price;     // SLASH = frozen clearance
          const floor = resolveFloor(pricing.cogsFloor, type, key ? key.split('|')[0] : null);
          if (floor != null && finalPrice < floor) { finalPrice = Math.round(floor * 100) / 100; stats.floored = (stats.floored || 0) + 1; }  // COGS floor clamp

        }
      }
      if (!(finalPrice > 0)) { stats.unmatched++; continue; }  // no usable price → skip

      // images — color-correct gallery via the BOUNDARY HEURISTIC (Shopify orders a
      // product's photos by color: each color's variant is pinned to its FIRST photo,
      // and the unassigned photos that follow — up to the NEXT color's photo — belong
      // to that color), REFINED by the lifestyle map (Bill 2026-06-10):
      //   • 'L' lifestyle (model/scene) photos are shot in ONE color by convention and are
      //     SHARED across ALL colors of the product (industry standard — Skroutz-safe).
      //   • 'P' white-bg shots stay color-specific; an 'L' or 'F' image ENDS a color's run
      //     (the gallery tail mixes other colorways' shots, size charts, brand demos —
      //     sharing those would trigger the «άλλες αποχρώσεις» panel flag).
      //   • 'F' (theme /files/ uploads: size charts, brand assets) are never emitted.
      // Empty/missing map -> exact legacy boundary behavior.
      const imgIndex = new Map(p.images.map((im, i) => [im.id, i]));
      const productColors = new Set(p.variants.map((v) => greekColor(extractColor(v.opts))).filter(Boolean));
      const singleColor = productColors.size <= 1;
      const anchors = new Set();   // every image-index pinned to ANY color's variant
      for (const v of p.variants) { if (v.imageId && imgIndex.has(v.imageId)) anchors.add(imgIndex.get(v.imageId)); }
      const myAnchor = sizes.map((s) => s.imageId).filter((id) => id && imgIndex.has(id)).map((id) => imgIndex.get(id)).sort((a, b) => a - b)[0];
      let own;                       // this color's own product shots (gallery order)
      if (singleColor) {
        own = p.images.filter((im) => { const c = cls(im); return c !== 'F' && c !== 'L' && c !== 'C' && c !== 'G'; }).map((i) => i.src);
      } else if (myAnchor != null) {
        own = [p.images[myAnchor].src];
        for (let i = myAnchor + 1; i < p.images.length; i++) {
          if (anchors.has(i)) break;                                // next color's block
          const c = cls(p.images[i]);
          if (hasLife && (c === 'L' || c === 'F' || c === 'C' || c === 'G')) break; // lifestyle/files/chart/generic end the color run
          own.push(p.images[i].src);
        }
      } else {
        own = p.images[0] ? [p.images[0].src] : [];                 // multi-color, no per-variant image → main only
      }
      // shared lifestyle pool = the UNION of this physical product's lifestyle across ALL its clones
      // (this clone may hold only 1 of several — always take the full deduped pool). Applies to
      // single-color too: its `own` is product shots only (L is filtered out), so the pool adds the
      // lifestyle. .slice() because the degenerate shift() below must not mutate the shared array.
      const pool = hasLife ? (clonePools.get(sizelessKey(p)) || []).slice() : [];
      if (!own.length && pool.length) own = [pool.shift()];         // degenerate: no product shot at all
      if (!own.length) continue;  // image mandatory
      const mainImg = own[0];
      const seenUrl = new Set([mainImg]);
      const additionalImgs = [];
      for (const u of [...own.slice(1), ...pool]) {                 // own angles first, lifestyle after
        if (seenUrl.has(u)) continue; seenUrl.add(u);
        additionalImgs.push(u);
        if (additionalImgs.length >= 9) break;
      }
      if (pool.length && additionalImgs.some((u) => pool.includes(u))) stats.lifestylePooled++;

      const sizesCsv = sizes.map((s) => s.size).join(',');
      const name = `${p.title} - ${color}`.replace(/\s+/g, ' ').trim();
      const desc = `${p.title}. Χειροποίητα δερμάτινα σανδάλια EMMANUELA. Χρώμα: ${color}. Διαθέσιμα νούμερα: ${sizesCsv}.`;
      const cat = category(type, isMen);
      const rep = sizes.slice().sort((a, b) => Number(a.variantId) - Number(b.variantId))[0];
      const totalQty = sizes.reduce((s, x) => s + x.qty, 0);

      let it = '      <product>\n';   // 6-space indent — matches jewelry entries
      it += `        <id>${rep.variantId}</id>\n`;
      it += `        <name><![CDATA[${name}]]></name>\n`;
      it += `        <link><![CDATA[https://${DOMAIN}/products/${p.handle}?variant=${rep.variantId}]]></link>\n`;
      it += `        <image><![CDATA[${mainImg}]]></image>\n`;
      for (const a of additionalImgs) it += `        <additionalimage><![CDATA[${a}]]></additionalimage>\n`;
      it += `        <category><![CDATA[${cat}]]></category>\n`;
      it += `        <price_with_vat>${finalPrice.toFixed(2)}</price_with_vat>\n`;
      it += `        <vat>${VAT_RATE}.00</vat>\n`;
      it += `        <manufacturer><![CDATA[${BRAND}]]></manufacturer>\n`;
      it += `        <mpn><![CDATA[${rep.sku || 'EMM-' + rep.variantId}]]></mpn>\n`;
      const pean = ean13(rep.barcode); if (pean) it += `        <ean>${pean}</ean>\n`;
      it += `        <availability>${AVAIL}</availability>\n`;
      it += `        <quantity>${totalQty}</quantity>\n`;
      it += `        <color>${escapeXml(color)}</color>\n`;
      it += `        <size>${escapeXml(sizesCsv)}</size>\n`;
      it += '        <variations>\n';
      for (const s of sizes) {
        it += '          <variation>\n';
        it += `            <variationid>${s.variantId}</variationid>\n`;
        it += `            <availability>${AVAIL}</availability>\n`;
        it += `            <size>${escapeXml(s.size)}</size>\n`;
        it += `            <quantity>${s.qty}</quantity>\n`;
        if (s.sku) {
          it += `            <manufacturersku><![CDATA[${s.sku}]]></manufacturersku>\n`;
          // ALSO emit per-variation <mpn> (the spec lists BOTH <manufacturersku> and <mpn> as the
          // Variation MPN). Skroutz reads our per-variation <ean> but NOT <manufacturersku>, so the
          // order's size.mpn came back null and the line fell back to the product-level <mpn> (a single
          // representative size) -> the warehouse picked by that wrong SKU. <mpn> fills size.mpn with the
          // SELECTED size's SKU. (Diagnosed 2026-06-17: «Σίφνος» size 38 shipped as 37.)
          it += `            <mpn><![CDATA[${s.sku}]]></mpn>\n`;
        }
        const vean = ean13(s.barcode); if (vean) it += `            <ean>${vean}</ean>\n`;
        it += '          </variation>\n';
        stats.variations++;
      }
      it += '        </variations>\n';
      it += `        <description><![CDATA[${desc}]]></description>\n`;
      it += '        <shipping>0</shipping>\n';
      it += '      </product>';
      items.push(it);

      stats.groups++; stats[tier === 'SLASH' ? 'slash' : 'keep']++; stats.units += totalQty;
      stats.byType[type] = (stats.byType[type] || 0) + 1;
      if (additionalImgs.length) { stats.withAdditional++; stats.additionalTotal += additionalImgs.length; }
      else if (!singleColor) stats.multiColorMainOnly++;   // a color whose Shopify block is a single photo
      if (stats.samples.length < 6) stats.samples.push({ name, color, type, tier, price: finalPrice, normal: liveNormal, sizes: sizesCsv, qty: totalQty, key: key || '(unmatched)', addl: additionalImgs.length, mainImg, addlSample: additionalImgs[0] || '' });
    }
  }
  return { items, stats };
}

module.exports = { buildSandalItems };

// ---- standalone review mode ----
if (require.main === module) {
  (async () => {
    const { items, stats } = await buildSandalItems();
    const now = new Date();
    const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<mywebstore>\n  <created_at>' + dateStr + '</created_at>\n  <products>\n';
    xml += items.join('\n') + '\n  </products>\n</mywebstore>\n';
    xml = xml.replace(/�+/g, '');
    const OUT = path.join(__dirname, 'skroutz-shoes-standalone-DRAFT.xml');
    fs.writeFileSync(OUT, xml, 'utf8');
    const L = console.log;
    L('='.repeat(60)); L('SKROUTZ SANDAL MODULE — standalone DRAFT'); L('='.repeat(60));
    L(`products fetched: ${stats.products}  ·  unpublished skipped: ${stats.skippedUnpublished}`);
    L(`entries: ${stats.groups}  (SLASH ${stats.slash} / KEEP ${stats.keep})  ·  variations: ${stats.variations}  ·  units: ${stats.units}`);
    L(`COGS-floored SLASH groups: ${stats.floored || 0}  (price raised to cost×grossUp)`);
    L(`additionalimages: ${stats.withAdditional}/${stats.groups} groups have >=1 (total ${stats.additionalTotal}, avg ${(stats.additionalTotal / Math.max(stats.groups, 1)).toFixed(1)})  ·  main-only (multicolor, no per-variant img): ${stats.multiColorMainOnly}  ·  lifestyle-pooled: ${stats.lifestylePooled}`);
    L(`unmatched (defaulted to KEEP@normal): ${stats.unmatched}  (of which kept: ${stats.keepDefault})`);
    L('by type: ' + Object.entries(stats.byType).sort((a, b) => b[1] - a[1]).map(([t, c]) => `${c} ${t}`).join(' | '));
    L('samples:'); for (const s of stats.samples) { L(`  [${s.tier}] ${s.name} | νούμερα ${s.sizes} | €${s.normal}→€${s.price} | +${s.addl} additional img | key ${s.key}`); if (s.addl) L(`        main: ...${s.mainImg.slice(-46)}\n        +1st: ...${s.addlSample.slice(-46)}`); }
    L(`Wrote ${OUT}`);
  })().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
}
