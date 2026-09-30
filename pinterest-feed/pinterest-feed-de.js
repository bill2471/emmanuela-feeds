#!/usr/bin/env node
'use strict';
/**
 * EMMANUELA — Pinterest catalog data source, GERMANY (DE · de · EUR)            v0.1 (28/09/2026, [SEO])
 *
 * Request: [PINTEREST] bulletin 12086 · decisions Bill 28/09 (bulletin 12533).
 * Rebuilt DAILY from the LIVE store. Only products listed in the overrides file enter the feed ("only what is in the file").
 *
 *   texts  : title + description ONLY from pinterest-de-overrides.json ({ "<product id>": { title, description, image_link?, variant_id? } })
 *   price  : Admin contextualPricing(country: DE) of the pinned variant, always "NN.NN EUR" (the API returns e.g. "104.6")
 *   link   : https://emmanuela-schmuck.de/products/<de handle>   — NO ?country= / ?variant= (only this shape gives a clean 404
 *            when a product is unpublished; ?country=DE self-301s forever — measured 28/09)
 *   stock  : "in stock" / "out of stock" (with a space, Pinterest spec); out-of-stock items STAY; unpublished/non-ACTIVE/deleted LEAVE
 *   brand  : "EMMANUELA handcrafted for you®" (this file only — emmanuela-de.xml / GMC are NOT touched)
 *   no sale_price, ever (compareAtPrice is ignored).
 *
 * SETTINGS (CLI flag or env):
 *   --item-id product|variant      PIN_ITEM_ID      default product  (item_id = product id; stable when the variant changes)
 *   --variant fixed|available      PIN_VARIANT      default fixed    (fixed = overrides.variant_id, else position-1 variant;
 *                                                                     available = lowest position among availableForSale)
 *   --images N                     PIN_IMAGES       default 0        (extra images per item → each becomes a separate pin; max 10)
 *   --images-format comma|repeat   PIN_IMAGES_FMT   default comma    (Pinterest documents ONE comma-separated value)
 *   --image-source featured|variant PIN_IMAGE_SRC   default featured (main image when no override image_link)
 *   --overrides <file>             PIN_OVERRIDES    default ./pinterest-de-overrides.json
 *   --out <file>                   PIN_OUT          default ./feeds/pinterest-de.xml
 *   --report <file>                                 default <out>.report.json
 *   --dry                                           build + validate + print, write NOTHING
 * Token: SHOPIFY_ACCESS_TOKEN (CI secret; locally from the environment).
 *
 * FAIL-CLOSED: any GraphQL error, a missing DE price or a non-EUR currency for a listed ACTIVE product ⇒ exit 2 and the
 * previous output file is left untouched. Every item is validated against the Pinterest required-field rules before writing.
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const SHOP = 'emmanuela-gr.myshopify.com';
const API_VERSION = '2026-07';
const DOMAIN = 'https://emmanuela-schmuck.de';
const BRAND = 'EMMANUELA handcrafted for you®';
const COUNTRY = 'DE';
const LOCALE = 'de';

// ---------- settings ----------
const argv = process.argv.slice(2);
const flag = (name, env, def) => { const i = argv.indexOf(name); if (i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--')) return argv[i + 1]; return process.env[env] || def; };
const S = {
  itemId: flag('--item-id', 'PIN_ITEM_ID', 'product'),
  variant: flag('--variant', 'PIN_VARIANT', 'fixed'),
  images: Math.max(0, Math.min(10, parseInt(flag('--images', 'PIN_IMAGES', '0'), 10) || 0)),
  imagesFmt: flag('--images-format', 'PIN_IMAGES_FMT', 'comma'),
  imageSrc: flag('--image-source', 'PIN_IMAGE_SRC', 'featured'),
  overrides: flag('--overrides', 'PIN_OVERRIDES', path.join(__dirname, 'pinterest-de-overrides.json')),
  out: flag('--out', 'PIN_OUT', path.join(__dirname, 'feeds', 'pinterest-de.xml')),
  dry: argv.includes('--dry'),
};
S.report = flag('--report', 'PIN_REPORT', S.out.replace(/\.xml$/, '') + '.report.json');
const enumOk = (v, set, name) => { if (!set.includes(v)) { console.error(`⛔ ${name}=${v} (allowed: ${set.join('|')})`); process.exit(1); } };
enumOk(S.itemId, ['product', 'variant'], 'item-id'); enumOk(S.variant, ['fixed', 'available'], 'variant');
enumOk(S.imagesFmt, ['comma', 'repeat'], 'images-format'); enumOk(S.imageSrc, ['featured', 'variant'], 'image-source');
const TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
if (!TOKEN) { console.error('⛔ SHOPIFY_ACCESS_TOKEN missing'); process.exit(1); }

// ---------- helpers ----------
let SERVED_API = null;
// v0.2: every path settles exactly once (done flag) · response error/close + 60 s request timeout ⇒ retry (review 28/09: a cut
// mid-body used to leave the promise pending ⇒ exit 0 with nothing written).
function gql(query, variables, attempt = 1) {
  const body = JSON.stringify({ query, variables });
  return new Promise((resolve, reject) => {
    let done = false;
    const settle = (fn, v) => { if (!done) { done = true; fn(v); } };
    const retry = why => {
      if (done) return;
      if (attempt >= 6) return settle(reject, new Error(`GraphQL failed after ${attempt} attempts: ${why}`));
      done = true;
      setTimeout(() => gql(query, variables, attempt + 1).then(resolve, reject), 1000 * 2 ** attempt);
    };
    const req = https.request({ host: SHOP, path: `/admin/api/${API_VERSION}/graphql.json`, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': TOKEN, 'Content-Length': Buffer.byteLength(body) } }, res => {
      const chunks = []; res.on('data', c => chunks.push(c));
      res.on('error', e => retry('response error ' + e.message));
      res.on('close', () => { if (!res.complete) retry('connection closed mid-response'); });
      res.on('end', () => {
        if (!res.complete) return; // handled by 'close'
        const text = Buffer.concat(chunks).toString('utf8'); // Buffer.concat: no split multi-byte chars
        const served = res.headers['x-shopify-api-version'];
        if (served) SERVED_API = served;
        if (served && served !== API_VERSION && !gql._warned) { gql._warned = true; console.warn(`⚠ requested API ${API_VERSION}, served ${served}`); }
        let j; try { j = JSON.parse(text); } catch (e) { j = null; }
        const throttled = res.statusCode === 429 || (j && j.errors && JSON.stringify(j.errors).includes('THROTTLED'));
        if (throttled || res.statusCode >= 500) return retry(`HTTP ${res.statusCode}${throttled ? ' THROTTLED' : ''}`);
        if (res.statusCode !== 200 || !j || j.errors) return settle(reject, new Error(`GraphQL HTTP ${res.statusCode}: ${text.slice(0, 300)}`));
        settle(resolve, j.data);
      });
    });
    req.setTimeout(60000, () => req.destroy(new Error('request timeout 60s')));
    req.on('error', e => retry('request error ' + e.message));
    req.write(body); req.end();
  });
}
// characters XML 1.0 does not allow: C0 controls (except \t \n \r), U+FFFE/U+FFFF, unpaired surrogates
const XML_BAD = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u;
const XML_BAD_G = new RegExp(XML_BAD.source, 'gu');
const xml = s => String(s).replace(XML_BAD_G, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
// plain text; KEEPS line breaks (the overrides use paragraphs + "- " bullets), collapses runs of spaces and >2 newlines.
// v0.2: strips only REAL tags (not "Breite <5 mm … >3 mm"); decodes &amp; LAST (no double decoding); numeric entities decoded.
const TAG = /<\/?[a-z][a-z0-9]*(?:\s[^<>]*)?\/?>/gi;
const plain = s => String(s || '').replace(/^﻿/, '').replace(/\r\n?/g, '\n').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|li|h\d)>/gi, '\n').replace(TAG, '')
  .replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&#(\d+);/g, (m, d) => String.fromCodePoint(+d)).replace(/&#x([0-9a-f]+);/gi, (m, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&euro;/g, '€').replace(/&amp;/g, '&')
  .replace(/[ \t ]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
const oneLine = s => plain(s).replace(/\s*\n\s*/g, ' '); // titles: single line
const money = amount => { const n = Number(amount); if (!Number.isFinite(n) || n <= 0) return null; return n.toFixed(2) + ' EUR'; };
const rfc822 = d => d.toUTCString().replace('GMT', '+0000');

// ---------- data ----------
const PRODUCT_FIELDS = `
  id legacyResourceId status handle onlineStoreUrl
  publishedInContext(context: { country: ${COUNTRY} })
  translations(locale: "${LOCALE}") { key value }
  featuredMedia { preview { image { url width height } } }
  media(first: 20) { nodes { ... on MediaImage { image { url width height } } } }
  variants(first: 100) { pageInfo { hasNextPage endCursor } nodes { ...V } }`;
// v0.2: ProductVariant.image is deprecated in 2026-07 ⇒ media(first:1)
const VARIANT_FIELDS = `fragment V on ProductVariant { id legacyResourceId position availableForSale
  media(first: 1) { nodes { ... on MediaImage { image { url width height } } } }
  contextualPricing(context: { country: ${COUNTRY} }) { price { amount currencyCode } } }`;

async function fetchProducts(ids) {
  const out = [];
  for (let i = 0; i < ids.length; i += 25) {
    const batch = ids.slice(i, i + 25).map(id => `gid://shopify/Product/${id}`);
    const d = await gql(`query($ids:[ID!]!){ nodes(ids:$ids){ ... on Product { ${PRODUCT_FIELDS} } } } ${VARIANT_FIELDS}`, { ids: batch });
    for (const n of d.nodes) {
      if (!n || !n.id) { out.push(null); continue; }
      let page = n.variants.pageInfo; const vs = [...n.variants.nodes];
      while (page.hasNextPage) { // a product may have >100 variants (one ACTIVE product has 702)
        const more = await gql(`query($id:ID!,$after:String){ product(id:$id){ variants(first:100, after:$after){ pageInfo{ hasNextPage endCursor } nodes{ ...V } } } } ${VARIANT_FIELDS}`, { id: n.id, after: page.endCursor });
        vs.push(...more.product.variants.nodes); page = more.product.variants.pageInfo;
      }
      n.allVariants = vs.sort((a, b) => a.position - b.position);
      out.push(n);
    }
  }
  return out;
}

// ---------- validation (Pinterest required fields / formats) ----------
function validate(it) {
  const e = [];
  if (!/^\d{1,127}$/.test(String(it.id || ''))) e.push('id');
  if (!it.title || it.title.length > 500) e.push('title');
  if (!it.description || it.description.length > 10000) e.push('description');
  // v0.2: ASCII-only handle (a Greek base handle / «größe» would pass unencoded otherwise), ≤511
  if (!/^https:\/\/emmanuela-schmuck\.de\/products\/[a-z0-9][a-z0-9-]*$/.test(it.link || '') || it.link.length > 511) e.push('link');
  if (!/^https:\/\/\S+$/.test(it.image_link || '') || it.image_link.length > 2000) e.push('image_link');
  if ((it.additional || []).some(u => !/^https:\/\/\S+$/.test(u) || (S.imagesFmt === 'comma' && u.includes(',')))) e.push('additional_image_link');
  if (!/^\d+\.\d{2} EUR$/.test(it.price || '') || Number(String(it.price).split(' ')[0]) <= 0) e.push('price');
  if (!['in stock', 'out of stock'].includes(it.availability)) e.push('availability');
  if (/�/.test(it.title + it.description)) e.push('U+FFFD');
  if (XML_BAD.test(it.title + it.description)) e.push('xml-invalid-char');
  return e;
}
(function selftest() { // v0.2: EVERY rule must reject its own known-bad case, and the known-good must pass
  const good = { id: '1', title: 'T', description: 'D', link: 'https://emmanuela-schmuck.de/products/x-1', image_link: 'https://cdn.shopify.com/a.jpg', price: '47.03 EUR', availability: 'in stock', additional: [] };
  const bads = [{ id: '' }, { id: 'gid://shopify/Product/1' }, { title: '' }, { title: 'x'.repeat(501) }, { description: '' }, { description: 'x'.repeat(10001) },
    { link: 'https://emmanuela-schmuck.de/products/x?country=DE' }, { link: 'https://example.com/products/x' }, { link: 'https://emmanuela-schmuck.de/products/größe' },
    { link: 'https://emmanuela-schmuck.de/products/' + 'a'.repeat(480) }, { image_link: '' }, { image_link: 'http://x/a.jpg' },
    { price: '104.6 EUR' }, { price: '47.03 USD' }, { price: '0.00 EUR' }, { availability: 'in_stock' }, { title: 'a�b' }, { description: 'a￾b' }, { title: 'a\uD800b' }];
  const miss = bads.filter(b => !validate({ ...good, ...b }).length);
  if (validate(good).length || miss.length) { console.error('⛔ VALIDATOR SELFTEST FAILED', JSON.stringify(miss).slice(0, 200)); process.exit(2); }
})();

// ---------- main ----------
(async () => {
  const started = new Date();
  const raw = JSON.parse(fs.readFileSync(S.overrides, 'utf8').replace(/^﻿/, '')); // v0.2: tolerate a BOM
  // v0.2: keys starting with "_" are metadata; any other non-numeric key is an ERROR (was silently dropped)
  const badKeys = Object.keys(raw).filter(k => !k.startsWith('_') && !/^\d+$/.test(k));
  if (badKeys.length) { console.error(`⛔ overrides keys must be numeric product ids: ${JSON.stringify(badKeys.slice(0, 5))}`); process.exit(2); }
  const ids = Object.keys(raw).filter(k => /^\d+$/.test(k));
  if (!ids.length) { console.error('⛔ overrides file has no product ids'); process.exit(2); }
  const products = await fetchProducts(ids);
  const items = [], excluded = [], problems = [], notes = [];
  ids.forEach((pid, i) => {
    const p = products[i]; const o = raw[pid] || {};
    if (!p) return excluded.push({ pid, reason: 'not found (deleted)' });
    if (p.status !== 'ACTIVE') return excluded.push({ pid, reason: `status ${p.status}` });
    if (!p.onlineStoreUrl) return excluded.push({ pid, reason: 'not published on Online Store' });
    if (p.publishedInContext !== true) return excluded.push({ pid, reason: 'not published in DE context' });
    const vs = p.allVariants;
    let v;
    if (S.variant === 'fixed') {
      const hasVid = Object.prototype.hasOwnProperty.call(o, 'variant_id') && o.variant_id !== null;
      if (hasVid && !/^\d+$/.test(String(o.variant_id))) return problems.push({ pid, problem: `variant_id ${JSON.stringify(o.variant_id)} is not a numeric id` });
      v = hasVid ? vs.find(x => String(x.legacyResourceId) === String(o.variant_id)) : vs[0];
      if (!v) return problems.push({ pid, problem: `variant_id ${o.variant_id} not on product` });
    } else {
      v = vs.find(x => x.availableForSale) || vs[0];
    }
    const cp = v.contextualPricing && v.contextualPricing.price;
    if (!cp || cp.currencyCode !== 'EUR') return problems.push({ pid, problem: `no EUR DE price (${cp ? cp.currencyCode : 'null'})` });
    const handle = ((p.translations || []).find(t => t.key === 'handle') || {}).value || p.handle;
    if (!((p.translations || []).find(t => t.key === 'handle'))) notes.push({ pid, note: 'no de handle translation — using base handle' });
    const featured = p.featuredMedia && p.featuredMedia.preview && p.featuredMedia.preview.image && p.featuredMedia.preview.image.url;
    const vm = v.media && v.media.nodes && v.media.nodes[0];
    const variantImg = vm && vm.image && vm.image.url;
    const main = o.image_link || (S.imageSrc === 'variant' && variantImg) || featured || variantImg;
    if (variantImg && featured && variantImg !== featured) notes.push({ pid, note: 'pinned variant image ≠ featured image' });
    const extra = S.images ? [...new Set((p.media.nodes || []).map(m => m && m.image && m.image.url).filter(u => u && u !== main))].slice(0, S.images) : [];
    const it = {
      id: S.itemId === 'product' ? String(p.legacyResourceId) : String(v.legacyResourceId),
      item_group_id: S.itemId === 'variant' ? String(p.legacyResourceId) : null,
      title: oneLine(o.title), description: plain(o.description),
      link: `${DOMAIN}/products/${handle}`,
      image_link: main, additional: extra,
      price: money(cp.amount), availability: v.availableForSale ? 'in stock' : 'out of stock',
      _variant: String(v.legacyResourceId), _position: v.position,
    };
    const err = validate(it);
    if (err.length) return problems.push({ pid, problem: 'invalid ' + err.join(',') });
    items.push(it);
  });
  // FAIL-CLOSED: any listed ACTIVE product without a valid item ⇒ do not publish
  if (problems.length) {
    console.error(`⛔ ${problems.length} problem(s) — nothing written:\n` + problems.map(x => `  ${x.pid}: ${x.problem}`).join('\n'));
    process.exit(2);
  }
  // v0.2: never publish an empty or collapsed catalog (review 28/09: all-excluded wrote an empty <channel> with exit 0).
  // Floor: ≥80% of the ids listed, AND ≥80% of the previous successful build (a mass de-publish is a human decision).
  if (!items.length) { console.error(`⛔ 0 items (listed ${ids.length}, excluded ${excluded.length}) — nothing written`); process.exit(2); }
  if (items.length < 0.8 * ids.length) { console.error(`⛔ only ${items.length}/${ids.length} listed products would be published (excluded: ${JSON.stringify(excluded).slice(0, 300)}) — nothing written`); process.exit(2); }
  let prevCount = null; try { prevCount = JSON.parse(fs.readFileSync(S.report, 'utf8')).items; } catch (e) { /* first build */ }
  if (prevCount && items.length < 0.8 * prevCount && !process.env.PIN_ALLOW_SHRINK) { console.error(`⛔ items ${items.length} < 80% of previous build ${prevCount} — set PIN_ALLOW_SHRINK=1 if intended; nothing written`); process.exit(2); }
  items.sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }));
  const imgXml = it => !it.additional.length ? '' : S.imagesFmt === 'comma'
    ? `\n      <g:additional_image_link>${xml(it.additional.join(','))}</g:additional_image_link>`
    : it.additional.map(u => `\n      <g:additional_image_link>${xml(u)}</g:additional_image_link>`).join('');
  const body = items.map(it => `    <item>
      <g:id>${xml(it.id)}</g:id>${it.item_group_id ? `\n      <g:item_group_id>${xml(it.item_group_id)}</g:item_group_id>` : ''}
      <title>${xml(it.title)}</title>
      <description>${xml(it.description)}</description>
      <link>${xml(it.link)}</link>
      <g:image_link>${xml(it.image_link)}</g:image_link>${imgXml(it)}
      <g:price>${xml(it.price)}</g:price>
      <g:availability>${it.availability}</g:availability>
      <g:condition>new</g:condition>
      <g:brand>${xml(BRAND)}</g:brand>
    </item>`).join('\n');
  const doc = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>${xml(BRAND)} — Pinterest DE</title>
    <link>${DOMAIN}</link>
    <description>EMMANUELA handcrafted 925 silver jewellery — Pinterest catalog, Germany (de, EUR)</description>
    <lastBuildDate>${rfc822(started)}</lastBuildDate>
${body}
  </channel>
</rss>
`;
  const report = { generator: 'pinterest-feed-de.js v0.2', builtAt: started.toISOString(), apiVersionRequested: API_VERSION, apiVersionServed: SERVED_API, settings: { ...S, overrides: path.basename(S.overrides) },
    listed: ids.length, items: items.length, inStock: items.filter(i => i.availability === 'in stock').length, excluded, notes,
    perItem: items.map(i => ({ id: i.id, variant: i._variant, position: i._position, price: i.price, availability: i.availability })) };
  console.log(`listed ${ids.length} · items ${items.length} (in stock ${report.inStock}) · excluded ${excluded.length} · notes ${notes.length} · ${S.dry ? 'DRY' : 'write ' + S.out}`);
  if (S.dry) return;
  // v0.2: write BOTH temp files first, then rename both (a failing report write can no longer leave a new XML + exit 2)
  fs.mkdirSync(path.dirname(S.out), { recursive: true }); fs.mkdirSync(path.dirname(S.report), { recursive: true });
  const tmpX = S.out + '.tmp', tmpR = S.report + '.tmp';
  try {
    fs.writeFileSync(tmpX, doc, 'utf8'); fs.writeFileSync(tmpR, JSON.stringify(report, null, 1), 'utf8');
    fs.renameSync(tmpR, S.report); fs.renameSync(tmpX, S.out);
  } catch (e) { for (const t of [tmpX, tmpR]) { try { fs.unlinkSync(t); } catch (_) {} } throw e; }
})().catch(e => { console.error('⛔ ' + e.message); process.exit(2); });
