/**
 * Skroutz XML Feed Title Builder v3.5 (2026-05-14)
 *
 * Authoritative spec: C:\Users\bill\Ανεβασμα listing Jewelry\XML-FEED-TITLE-STRUCTURE-SPEC.md (v2)
 *
 * Implements:
 *  - Canonical title order per spec §2 (12 positions)
 *  - 5-finish color decoder: S/G/R/O/X (X = Μαύρο/Black Rhodium, NOT Οξειδωμένο)
 *  - Grammatical agreement for χειροποίητο/η/α and μαύρο/α/η
 *  - Singular vs plural earring source-of-truth = VARIANT OPTIONS (not Shopify title)
 *  - Verbatim motif/subcategory words from Shopify product title
 *  - Aggressive body cleanup to prevent type/gender duplicates
 *  - Σταυρός injection for cross items
 *  - Monogram letter injection for letter-bearing pendants
 *  - Σχήμα option value used to inflect motif to plural
 *  - X-finish μαύρ deduplication
 *  - cuff → ear cuff normalization
 *  - "από <material>" → "με <material>" rewrite to avoid double από
 *  - Ring size at end (μέγεθος N) for rings
 *  - Bracelet length at end for bracelets
 *  - Chain type + length at end for pendants/necklaces (αλυσίδα μπίλια 50cm)
 *
 * Port of: skroutz-feed/generate-correct-titles-v2-final.py
 *
 * USAGE:
 *   const { buildSkroutzTitle } = require('./skroutz-title-builder-v35');
 *   const title = buildSkroutzTitle({ product, variant, skroutzCategory });
 */

'use strict';

// ============================================
// UNICODE-AWARE WORD BOUNDARIES (Greek support)
// ============================================
// JavaScript's \b only treats [A-Za-z0-9_] as word chars, so it does NOT
// correctly bound Greek words. We use Unicode property lookahead/lookbehind.

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Build a Unicode-aware "whole word" regex.
 * Equivalent of /\bword\b/giu but works with Greek letters.
 */
function wordRegex(word, flags = 'giu') {
  return new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegex(word)}(?![\\p{L}\\p{N}])`, flags);
}

/**
 * Strip multiple words from a string with Unicode-aware boundaries.
 */
function stripWords(text, words) {
  for (const w of words) text = text.replace(wordRegex(w), '');
  return text;
}

/**
 * Pattern-based Unicode-aware regex.
 * Pass a pattern body (no \b markers) — boundaries are added automatically.
 */
function wordPatternRegex(pattern, flags = 'giu') {
  return new RegExp(`(?<![\\p{L}\\p{N}])${pattern}(?![\\p{L}\\p{N}])`, flags);
}

// ============================================
// COLOR / FINISH MAPPING
// ============================================

const COLOR_TO_FINISH = {
  // S = Ασημί (Sterling Silver)
  'ασημένιο': 'S', 'ασημένια': 'S', 'ασημί': 'S', 'silver': 'S',
  // G = Επιχρυσωμένο (Gold-plated SS)
  'επιχρυσωμένο': 'G', 'επιχρυσωμένα': 'G', 'επιχρυσωμένη': 'G', 'gold': 'G',
  'χρυσό': 'G', 'χρυσά': 'G', 'χρυσή': 'G', // v3.5.1: Shopify "Χρυσό" maps to G (hotfix for 7 χρυσά variants losing επιχρυσωμένο)
  // R = Ροζ Επιχρυσωμένο (Rose Gold-plated SS)
  'ροζ επιχρυσωμένο': 'R', 'ροζ επιχρυσωμένα': 'R', 'ροζ χρυσό': 'R',
  // O = Οξειδωμένο (Oxidised = ΓΚΡΙ — grey, NOT black)
  'οξειδωμένο': 'O', 'οξειδωμένα': 'O',
  // X = Μαύρο (Black Rhodium PVD — NOT oxidized!)
  'μαύρο ανθρακί': 'X', 'μαύρα ανθρακί': 'X', 'μαύρο': 'X', 'μαύρα': 'X', 'black': 'X',
};

// Gem color words for composite Shopify color values (e.g. "Μαύρο ανθρακί - Γαλάζιο")
const GEM_COLOR_MAP = {
  'γαλάζιο': 'γαλάζια πέτρα', 'γαλάζια': 'γαλάζια πέτρα',
  'μπλε': 'μπλε πέτρα', 'blue': 'μπλε πέτρα',
  'κόκκινο': 'κόκκινη πέτρα', 'κόκκινη': 'κόκκινη πέτρα',
  'πράσινο': 'πράσινη πέτρα', 'πράσινη': 'πράσινη πέτρα',
  'σαμπανί': 'σαμπανί πέτρα',
  'λευκό': 'λευκή πέτρα', 'λευκή': 'λευκή πέτρα',
  'μαύρο': 'μαύρη πέτρα', 'μαύρη': 'μαύρη πέτρα',
  'τιρκουάζ': 'τυρκουάζ πέτρα', 'τυρκουάζ': 'τυρκουάζ πέτρα',
  'μωβ': 'μωβ πέτρα', 'μώβ': 'μωβ πέτρα',
  'ρουμπινί': 'ρουμπινί πέτρα', 'ρουμπίνι': 'ρουμπινί πέτρα',
  'σομόν': 'σομόν πέτρα',
  'πολύχρωμα': 'πολύχρωμες πέτρες', 'πολύχρωμο': 'πολύχρωμες πέτρες',
  'χρυσό': 'χρυσή πέτρα',
};

const SUB_AXIS_MATERIAL = {
  'σμάλτο': 'σμάλτο', 'σμάλτου': 'σμάλτο',
  'ζιρκόν': 'ζιρκόν',
  'μαργαριτάρι': 'μαργαριτάρι', 'μαργαριταριού': 'μαργαριτάρι',
  'πέτρα': 'πέτρα', 'πέτρας': 'πέτρα', 'πέτρες': 'πέτρες',
  'νεφρίτη': 'νεφρίτη', 'νεφρίτης': 'νεφρίτη',
  'λάπις': 'λάπις',
};

function detectFinishFromTitle(ptitle) {
  const t = ptitle.toLowerCase();
  if (t.includes('ροζ επιχρυσ') || t.includes('ροζ χρυσ')) return 'R';
  if (t.includes('επιχρυσ') || t.includes('επιχευσ')) return 'G';
  if (t.includes('οξειδ')) return 'O';
  if (t.includes('μαύρο') || t.includes('μαύρα') || t.includes('black')) return 'X';
  if (t.includes('από ασήμι') || t.includes('ασήμι 925') || t.includes('ασημέν') || t.includes('silver')) return 'S';
  return null;
}

function resolveFinish(colorRaw) {
  if (!colorRaw) return { finish: null, gem: null };
  const c = colorRaw.toLowerCase().trim();
  if (COLOR_TO_FINISH[c]) return { finish: COLOR_TO_FINISH[c], gem: null };
  // Composite "<metal> - <gem>"
  if (c.includes(' - ')) {
    const [metalPart, gemPart] = c.split(' - ', 2).map((s) => s.trim());
    const finish = COLOR_TO_FINISH[metalPart] || null;
    let gem = GEM_COLOR_MAP[gemPart] || null;
    if (!gem && (gemPart.includes('&') || gemPart.includes(' και '))) {
      const gems = gemPart.split(/\s*(?:&| και )\s*/).map((g) => g.toLowerCase().trim()).filter((g) => GEM_COLOR_MAP[g]);
      if (gems.length >= 2) gem = `με ${gems.join(' και ')} πέτρες`.replace(/^με /, '');
    }
    return { finish, gem };
  }
  // Composite "<metal> με <substance>"
  if (c.includes(' με ')) {
    const [metalPart, subPart] = c.split(' με ', 2).map((s) => s.trim());
    const finish = COLOR_TO_FINISH[metalPart] || null;
    const gem = GEM_COLOR_MAP[subPart] || null;
    return { finish, gem };
  }
  // "Μονό X ανθρακί" → strip Μονό and retry
  if (c.startsWith('μονό ')) return resolveFinish(c.slice(5));
  // "Μαύρο με μαύρο σύρμα" → still X
  if (c.startsWith('μαύρο') || c.startsWith('μαύρα')) return { finish: 'X', gem: null };
  // Partial match fallback
  for (const k of Object.keys(COLOR_TO_FINISH)) {
    if (c.includes(k)) return { finish: COLOR_TO_FINISH[k], gem: null };
  }
  return { finish: null, gem: null };
}

function getFinishForVariant(product, variant) {
  let colorRaw = '';
  let colorMetal = '';
  let subAxisColor = null; // [value, subName]
  for (const opt of variant.selectedOptions || []) {
    const name = (opt.name || '').toLowerCase().trim();
    const val = (opt.value || '').trim();
    if (name === 'χρώμα μετάλλου') colorMetal = val;
    else if (name.startsWith('χρώμα ')) {
      const subName = name.replace('χρώμα ', '').trim();
      subAxisColor = [val, subName];
    } else if (name === 'χρώμα') colorRaw = val;
  }
  const chosen = colorMetal || colorRaw;
  let { finish, gem } = resolveFinish(chosen);
  if (!gem && subAxisColor) {
    const [val, subName] = subAxisColor;
    const valL = val.toLowerCase().trim();
    const gemWord = GEM_COLOR_MAP[valL];
    const material = SUB_AXIS_MATERIAL[subName];
    if (gemWord && material && material !== 'πέτρα') gem = `${valL} ${material}`;
    else if (gemWord) gem = gemWord;
    else if (material) gem = `${valL} ${material}`;
  }
  // v3.5.1: fallback — when option NAME is corrupted (Shopify data bug where the option NAME
  // is itself a color value like "Ασημένια" instead of "Χρώμα"), scan option VALUES for finish keywords.
  // Only fires when no χρώμα option was found at all.
  if (!finish) {
    const hasColorOpt = (variant.selectedOptions || []).some((o) => (o.name || '').toLowerCase().includes('χρώμα'));
    if (!hasColorOpt) {
      for (const opt of variant.selectedOptions || []) {
        const r = resolveFinish(opt.value || '');
        if (r.finish) { finish = r.finish; if (!gem) gem = r.gem; break; }
      }
    }
  }
  if (!finish) finish = detectFinishFromTitle(product.title || '');
  if (!finish) finish = 'S';
  return { finish, gem };
}

// ============================================
// GRAMMAR
// ============================================

const TYPE_GRAMMAR = {
  Σκουλαρίκι: ['n', 'sg'], Δαχτυλίδι: ['n', 'sg'], Βραχιόλι: ['n', 'sg'],
  Μενταγιόν: ['n', 'sg'], Κολιέ: ['n', 'sg'], Τσόκερ: ['n', 'sg'],
  Σκουλαρίκια: ['n', 'pl'], 'Στέφανα γάμου': ['n', 'pl'],
  Καρφίτσα: ['f', 'sg'],
  'Σετ κοσμημάτων': ['n', 'sg'],
};

function handcraftedForm(typeWord) {
  const g = TYPE_GRAMMAR[typeWord] || ['n', 'sg'];
  const [gender, number] = g;
  if (gender === 'f' && number === 'sg') return 'χειροποίητη';
  if (number === 'pl') return 'χειροποίητα';
  return 'χειροποίητο';
}

function blackForm(typeWord) {
  const g = TYPE_GRAMMAR[typeWord] || ['n', 'sg'];
  const [gender, number] = g;
  if (gender === 'f' && number === 'sg') return 'μαύρη';
  if (number === 'pl') return 'μαύρα';
  return 'μαύρο';
}

function genderForm(typeWord) {
  const g = TYPE_GRAMMAR[typeWord] || ['n', 'sg'];
  const [gender, number] = g;
  if (gender === 'f' && number === 'sg') return 'ανδρική';
  if (number === 'pl') return 'ανδρικά';
  return 'ανδρικό';
}

// ============================================
// TYPE DETECTION
// ============================================

function detectJewelryType(product, variant, skroutzCategory) {
  const ptitle = product.title || '';
  const ptype = (product.product_type || '').toLowerCase();
  const cat = (skroutzCategory || '').toLowerCase();

  // Jewelry sets first
  // v3.5.1: ONLY multi-type sets ("Σετ <X> και <Y>") become Σετ κοσμημάτων.
  // Quantity sets ("Σετ από N <type>") keep their underlying type word — "Σετ από N" is stripped
  // by baseStrips so the body remains clean.
  const ptitleLower = (ptitle || '').toLowerCase();
  const isMultiTypeSet = (
    ptitleLower.startsWith('σετ ') &&
    / και /.test(ptitleLower) &&
    !/^σετ\s+από\s+/.test(ptitleLower)
  );
  if ((cat.includes('σετ') && cat.includes('κοσμημάτων')) || isMultiTypeSet) return 'Σετ κοσμημάτων';

  // Earring detection
  const isEarringCat = cat.includes('σκουλαρίκ') || cat.includes('piercing') || ptitle.toLowerCase().includes('σκουλαρίκ');
  const isEarringType = ptype.includes('σκουλαρίκ');
  if (isEarringCat || isEarringType) {
    const opts = variant.selectedOptions || [];
    let isSingle = false;
    const singleVals = ['μονό', 'αριστερό', 'δεξί', 'single', 'μονό αριστερό', 'μονό δεξί'];
    const pairVals = ['ζευγάρι', 'ζευγάρι με έκπτωση', 'ένα ζευγάρι', 'ζεύγος'];
    for (const opt of opts) {
      const v = (opt.value || '').toLowerCase().trim();
      if (singleVals.includes(v) || singleVals.some((s) => v.startsWith(s + ' '))) { isSingle = true; break; }
      if (pairVals.includes(v)) { isSingle = false; break; }
    }
    for (const opt of opts) {
      const optName = (opt.name || '').toLowerCase();
      const optVal = (opt.value || '').toLowerCase().trim();
      if (optName.includes('πλευράς') && (optVal === 'αριστερό' || optVal === 'δεξί')) isSingle = true;
    }
    const hasPairOption = opts.some((o) => {
      const n = (o.name || '').toLowerCase();
      return n.includes('μον') || n.includes('αριστερ') || n.includes('δεξι') ||
             n.includes('τεμάχια') || n.includes('πλευράς') || n.includes('σχήμα');
    });
    if (!opts.length || !hasPairOption) {
      // Use Unicode-aware boundaries for Greek
      if (/(?<![\p{L}\p{N}])σκουλαρίκι(?!α)(?![\p{L}\p{N}])/iu.test(ptitle)) return 'Σκουλαρίκι';
      if (/(?<![\p{L}\p{N}])σκουλαρίκια(?![\p{L}\p{N}])/iu.test(ptitle)) return 'Σκουλαρίκια';
    }
    return isSingle ? 'Σκουλαρίκι' : 'Σκουλαρίκια';
  }
  if (cat.includes('δαχτυλίδ') || ptype.includes('δαχτυλίδ')) return 'Δαχτυλίδι';
  if (cat.includes('βραχιόλ') || ptype.includes('βραχιόλ')) return 'Βραχιόλι';
  // v3.5.1: detect cross products by title (feed-builder doesn't emit Σταυροί category)
  if (cat.includes('σταυρ') || ptype.includes('σταυρ') ||
      ptitle.toLowerCase().includes('σταυρός') || ptitle.toLowerCase().includes('σταυροί') ||
      ptitle.toLowerCase().includes('σταυρού')) return 'Μενταγιόν';
  if (cat.includes('κολιέ') || cat.includes('μενταγιόν') || cat.includes('charms')) {
    if (ptitle.toLowerCase().includes('τσόκερ') || ptitle.toLowerCase().includes('choker')) return 'Τσόκερ';
    // v3.5.1: Unicode-aware "κρεμαστ_" pendant indicator — fixed to include trailing ς (final letter of κρεμαστός)
    if (ptitle.toLowerCase().includes('μενταγιόν') ||
        ptitle.toLowerCase().includes('μενταγίον') ||
        /(?<![\p{L}\p{N}])κρεμαστ(?:ός|ή|ό|ά|έ|οί|ές|οι)(?![\p{L}\p{N}])/iu.test(ptitle)) return 'Μενταγιόν';
    if (cat.includes('charm')) return 'Μενταγιόν';
    if (ptitle.toLowerCase().includes('τέννις') || ptitle.toLowerCase().includes('tennis')) return 'Κολιέ';
    return 'Κολιέ';
  }
  if (cat.includes('καρφίτσ') || ptype.includes('καρφίτσ')) return 'Καρφίτσα';
  if (cat.includes('στέφαν') || ptype.includes('στέφαν')) return 'Στέφανα γάμου';
  if (cat.includes('αλυσίδ')) {
    const pt = ptitle.toLowerCase();
    if (pt.includes('βραχιόλ')) return 'Βραχιόλι';
    return 'Κολιέ';
  }
  return 'Κόσμημα';
}

function detectGender(product, variant, skroutzCategory) {
  const ptitle = (product.title || '').toLowerCase();
  const ptype = (product.product_type || '').toLowerCase();
  const cat = (skroutzCategory || '').toLowerCase();
  const tags = (product.tags || []).join(' ').toLowerCase();
  if (ptitle.includes('ανδρικ') || ptype.includes('ανδρικ') || cat.includes('ανδρικ') || tags.includes('men')) return 'male';
  if (ptitle.includes('γυναικ') || ptype.includes('γυναικ') || cat.includes('γυναικ')) return 'female';
  return 'unisex';
}

// ============================================
// BODY EXTRACTION & CLEANUP
// ============================================

function extractTitleBody(product, typeWord) {
  let t = product.title || '';
  // Type-aware strips: only strip type words for the types they correspond to
  // v3.5.1: added Χειροποίητο/η/α strip (fixes 23 entries in 3046 family)
  const baseStrips = [
    /^Χειροποίητο\s+/i, /^Χειροποίητη\s+/i, /^Χειροποίητα\s+/i,
    /^Ανδρικά\s+/i, /^Ανδρικό\s+/i, /^Ανδρική\s+/i,
    /^Γυναικεία\s+/i, /^Γυναικείο\s+/i, /^Παιδικά\s+/i,
    /^Σετ\s+από\s+\d+\s+/i,
    /^Δύο\s+/i, /^Τρία\s+/i,
  ];
  const typeStrips = {
    'Σκουλαρίκι': [/^Σκουλαρίκια\s+/i, /^Σκουλαρίκι\s+/i],
    'Σκουλαρίκια': [/^Σκουλαρίκια\s+/i, /^Σκουλαρίκι\s+/i],
    'Δαχτυλίδι': [/^Δαχτυλίδι\s+/i, /^Δαχτυλίδια\s+/i],
    'Βραχιόλι': [/^Βραχιόλι\s+/i, /^Βραχιόλια\s+/i],
    'Μενταγιόν': [
      // v3.5.1: added typo variant "μενταγίον" (Shopify product 7027 has this misspelling)
      /^Κρεμαστό\s+μενταγιόν\s+/i, /^Κρεμαστά\s+μενταγιόν\s+/i,
      /^Κρεμαστό\s+μενταγίον\s+/i, /^Κρεμαστά\s+μενταγίον\s+/i,
      /^Κρεμαστός\s+σταυρός\s+/i, /^Κρεμαστό\s+σταυρός\s+/i,
      /^Ασημένιος\s+Σταυρός\s+/i, /^Σταυρός\s+/i,
      /^Μενταγιόν\s+/i, /^Μενταγίον\s+/i,
    ],
    'Κολιέ': [/^Κολιέ\s+/i],
    'Τσόκερ': [/^Τσόκερ\s+/i],
    'Καρφίτσα': [/^Καρφίτσα\s+/i],
    'Στέφανα γάμου': [/^Στέφανα\s+γάμου\s+/i],
    'Σετ κοσμημάτων': [/^Σετ\s+/i],
  };
  const stripPatterns = [...baseStrips, ...(typeStrips[typeWord] || [])];
  let changed = true;
  while (changed) {
    changed = false;
    for (const pat of stripPatterns) {
      const newT = t.replace(pat, '');
      if (newT !== t) { t = newT; changed = true; break; }
    }
  }
  return t.trim();
}

const LOWERCASE_FIRST = new Set([
  'καρφωτά', 'καρφωτό', 'κρίκος', 'κρίκοι',
  'κρεμαστά', 'κρεμαστό',
  'τυλιχτό', 'τυλιχτά', 'τυλιχτή',
  'τριπλό', 'τριπλά',
  'κλασσικό', 'κλασσικά', 'κλασικό', 'κλασικά',
  'σφυρήλατο', 'σφυρήλατα', 'σφυρήλατη',
  'σφυρηλατημένο', 'σφυρηλατημένα', 'σφυρηλατημένη',
  'πλεκτό', 'πλεκτά',
  'ανόμοια', 'ανόμοιο',
  'μινιμαλιστικό', 'μινιμαλιστικά', 'μινιμαλιστική',
  'δίχρωμο', 'δίχρωμα',
  'βυζαντινό', 'βυζαντινά', 'γοτθικό', 'γοτθικά',
  'μοντέρνο', 'μοντέρνα',
  'τρίγωνο', 'τρίγωνα', 'τετράγωνο', 'τετράγωνα',
  'τοξωτό', 'τοξωτά',
  'πλατιά', 'πλατύ', 'τριγωνικά', 'τριγωνικό',
  'σιδηρούν', 'αλυσίδα', 'λαιμού',
  'στρόγγυλο', 'στρόγγυλα',
  'κρυφό', 'κρυφά',
  'μικρό', 'μικρά', 'μεγάλο', 'μεγάλα',
  'huggie', 'huggies', 'cuff', 'cuffs',
  'jackets', 'pins', 'helix',
]);

function cleanBody(body, typeWord) {
  const stripWordsList = [];
  if (typeWord === 'Σκουλαρίκι' || typeWord === 'Σκουλαρίκια') {
    stripWordsList.push('σκουλαρίκια', 'σκουλαρίκι');
  } else if (typeWord === 'Δαχτυλίδι') {
    stripWordsList.push('δαχτυλίδια', 'δαχτυλίδι', 'δαχτυλίδα', 'δαχτυλίδες');
  } else if (typeWord === 'Βραχιόλι') {
    stripWordsList.push('βραχιόλια', 'βραχιόλι');
  } else if (typeWord === 'Μενταγιόν') {
    // v3.5.1: added typo variant "μενταγίον" (Shopify product 7027 has this misspelling)
    stripWordsList.push('κρεμαστός', 'κρεμαστή', 'κρεμαστό', 'κρεμαστά', 'κρεμαστοί',
                        'μενταγιόν', 'μενταγίον', 'ασημένιος', 'ασημένια', 'ασημένιο', 'ασημένιοι');
  } else if (typeWord === 'Κολιέ') {
    stripWordsList.push('κολιέ');
  } else if (typeWord === 'Τσόκερ') {
    stripWordsList.push('τσόκερ', 'choker', 'κολιέ');
  } else if (typeWord === 'Καρφίτσα') {
    stripWordsList.push('καρφίτσα', 'καρφίτσες');
  } else if (typeWord === 'Στέφανα γάμου') {
    stripWordsList.push('στέφανα γάμου', 'στέφανα');
  } else if (typeWord === 'Σετ κοσμημάτων') {
    stripWordsList.push('σετ κοσμημάτων', 'σετ');
  }
  stripWordsList.push(
    'ανδρικά', 'ανδρικό', 'ανδρική', 'ανδρικοί', 'ανδρικές',
    'γυναικεία', 'γυναικείο', 'γυναικείες',
    'παιδικά', 'παιδικό',
    'για άνδρες', 'για άντρες', 'για γυναίκες',
    'σετ', 'δύο', 'τρία', 'τέσσερα', 'πέντε', 'έξι',
    'ένα ζευγάρι', 'μονό'
  );
  // First strip "Σετ από N" with digits
  body = body.replace(wordPatternRegex('σετ από \\d+'), '');
  body = body.replace(wordPatternRegex('σετ από (?:δύο|τρία|τέσσερα|πέντε|έξι)'), '');
  body = stripWords(body, stripWordsList);
  // Strip trailing material phrase if leaked
  body = body.replace(/\s+από\s+(ροζ\s+)?επιχρυσωμέν[οαη]\s+ασήμι\s+925\s*/giu, ' ');
  body = body.replace(/\s+από\s+οξειδωμέν[οαη]\s+ασήμι\s+925\s*/giu, ' ');
  body = body.replace(/\s+από\s+ασήμι\s+925\s*/giu, ' ');
  body = body.replace(wordPatternRegex('από\\s+ασήμι'), ' ');
  // Strip standalone finish adjectives that leak
  body = body.replace(wordPatternRegex('οξειδωμέν[οαηςώάέή]+'), '');
  body = body.replace(wordPatternRegex('επιχρυσωμέν[οαηςώάέή]+'), '');
  body = body.replace(wordPatternRegex('ασημέν[ιοαη]+[οαη]+ς?'), '');
  // Strip "&", "Box", "D.J.", "Minimal Bold"
  body = body.replace(/\s*&\s*/g, ' ');
  body = body.replace(wordRegex('Box'), '');
  // D.J. with literal dots — wordRegex's escapeRegex handles them; but Latin "D.J." has special pattern
  // We DON'T strip "D.J." per agent finding (PY keeps it)
  // body = body.replace(wordRegex('D.J.'), '');
  body = body.replace(/(?<![\p{L}\p{N}])[Mm]inimal\s*&?\s*[Bb]old(?![\p{L}\p{N}])/giu, '');
  body = body.replace(wordRegex('Minimal'), '');
  body = body.replace(wordRegex('Bold'), '');
  // Em-dashes and en-dashes
  body = body.replace(/\s*[–—]\s*/g, ' ');
  // Normalize chain length units: "εκ." → "cm"
  body = body.replace(/(\d+)\s*(εκ\.?|ΕΚ\.?)/g, '$1cm');
  body = body.replace(/\s+/g, ' ').trim();
  // Lowercase leading word and any mid-body cap of LOWERCASE_FIRST set
  if (body) {
    const words = body.split(/\s+/);
    if (words.length && LOWERCASE_FIRST.has(words[0].toLowerCase())) words[0] = words[0].toLowerCase();
    body = words.join(' ');
    for (const w of LOWERCASE_FIRST) {
      const cap = w[0].toUpperCase() + w.slice(1);
      body = body.replace(wordRegex(cap), w);
    }
  }
  return body;
}

// ============================================
// EXTRACTORS
// ============================================

function extractRingSize(variant) {
  for (const opt of variant.selectedOptions || []) {
    const name = (opt.name || '').toLowerCase();
    const val = (opt.value || '').trim();
    if (name.includes('νούμερο') || name === 'μέγεθος') {
      const valL = val.toLowerCase();
      if (['γάμπα', 'ανοιχτή', 'κανονικό', 'προσαρμόσιμη', ':'].some((p) => valL.includes(p))) {
        const m = val.match(/\b(\d{2})\b/);
        return m ? m[1] : null;
      }
      if (valL.includes('cm')) return null;
      if (valL === 'default title' || valL === 'default') return null;
      return val;
    }
  }
  return null;
}

function extractBraceletLength(variant) {
  for (const opt of variant.selectedOptions || []) {
    const name = (opt.name || '').toLowerCase();
    const val = (opt.value || '').trim();
    if ((name.includes('νούμερο') || name.includes('μέγεθος') || name.includes('περίμετρος')) && val.toLowerCase().includes('cm')) {
      const m = val.match(/(\d+(?:[-–]\d+)?)\s*cm/i);
      if (m) return m[0].replace(/\s/g, '');
    }
  }
  return null;
}

function extractSide(variant) {
  for (const opt of variant.selectedOptions || []) {
    const name = (opt.name || '').toLowerCase();
    const val = (opt.value || '').trim().toLowerCase();
    if (name.includes('πλευρά') || val === 'αριστερό' || val === 'δεξί' || val.startsWith('μονό αριστερό') || val.startsWith('μονό δεξί')) {
      if (val.includes('αριστερ')) return 'αριστερό αυτί';
      if (val.includes('δεξ')) return 'δεξί αυτί';
    }
  }
  return null;
}

// v3.5.1: Normalize Latin glyphs that look identical to Greek (Shopify data-entry typo)
// when the variant axis name suggests Greek letters (γράμμα/αρχικό/μονόγραμμα).
// Skip when the axis name is "letter" (Latin/English explicit).
const LATIN_TO_GREEK_GLYPH = {
  'A': 'Α', 'B': 'Β', 'E': 'Ε', 'H': 'Η', 'I': 'Ι',
  'K': 'Κ', 'M': 'Μ', 'N': 'Ν', 'O': 'Ο', 'P': 'Ρ',
  'T': 'Τ', 'X': 'Χ', 'Y': 'Υ', 'Z': 'Ζ',
  'a': 'α', 'b': 'β', 'e': 'ε', 'h': 'η', 'i': 'ι',
  'k': 'κ', 'm': 'μ', 'n': 'ν', 'o': 'ο', 'p': 'ρ',
  't': 'τ', 'x': 'χ', 'y': 'υ', 'z': 'ζ',
};

function normalizeMonogramLetter(val, optName) {
  if (!val || val.length !== 1) return val;
  const lowerName = (optName || '').toLowerCase();
  if (!lowerName.includes('γράμμα') && !lowerName.includes('αρχικό') && !lowerName.includes('μονόγραμμα')) return val;
  return LATIN_TO_GREEK_GLYPH[val] || val;
}

function extractMonogramLetter(variant) {
  for (const opt of variant.selectedOptions || []) {
    const name = (opt.name || '').toLowerCase().trim();
    const val = (opt.value || '').trim();
    if (name.includes('γράμμα') || name.includes('αρχικό') || name.toLowerCase().includes('letter') || name.includes('μονόγραμμα')) {
      return normalizeMonogramLetter(val, opt.name);
    }
  }
  return null;
}

function normalizeChainType(ct) {
  if (!ct) return ct;
  return ct.replace(/\brolo\b/gi, 'ρολό').replace(/\brollo\b/gi, 'ρολό');
}

function extractChainInfo(variant) {
  let chainType = null;
  let chainLength = null;
  for (const opt of variant.selectedOptions || []) {
    const name = (opt.name || '').toLowerCase();
    const val = (opt.value || '').trim();
    if (name.includes('μήκος αλυσίδας') || name === 'μήκος') chainLength = val;
    else if (name.includes('τύπος κορδονιού') || name.includes('τύπος αλυσίδας') || name.includes('τύπος κορδονιού ή αλυσίδας')) chainType = val;
    else if (name.includes('διάλεξε είδος και μήκος') || name.includes('διάλεξε είδος')) {
      const m1 = val.match(/^(.*?)\s+(\d+\s*cm)$/i);
      if (m1) { chainType = m1[1].trim(); chainLength = m1[2].trim(); }
      else {
        const m2 = val.match(/^(.*?)\s+(\d+)\s*εκ\.?$/i);
        if (m2) { chainType = m2[1].trim(); chainLength = `${m2[2]}cm`; }
        else chainType = val;
      }
    } else if (name.includes('περίμετρος καρπού')) chainLength = val;
  }
  if (chainType) chainType = normalizeChainType(chainType);
  if (chainLength) chainLength = chainLength.replace(/(\d+)\s*εκ\.?/g, '$1cm');
  return { chainType, chainLength };
}

// ============================================
// CORE: build title
// ============================================

function buildSkroutzTitle({ product, variant, skroutzCategory }) {
  // Normalize selectedOptions: some Shopify clients return camelCase 'selectedOptions' on variant,
  // others use 'selected_options' (Python data). Accept both.
  const v = { ...variant };
  if (!v.selectedOptions && v.selected_options) v.selectedOptions = v.selected_options;

  const typeWord = detectJewelryType(product, v, skroutzCategory);
  const gender = detectGender(product, v, skroutzCategory);
  const side = extractSide(v);
  const { finish, gem } = getFinishForVariant(product, v);

  // Body (type-aware extraction)
  let body = extractTitleBody(product, typeWord);
  body = body.replace(/["""«»]/g, '').replace(/''/g, '').replace(/'/g, '');
  body = body.replace(/\s+/g, ' ').trim();
  body = cleanBody(body, typeWord);

  // Cross motif injection
  const ptitleL = (product.title || '').toLowerCase();
  const isCross = ptitleL.includes('σταυρός') || (skroutzCategory || '').toLowerCase().includes('σταυρ');
  if (isCross && typeWord === 'Μενταγιόν') {
    const bodyL = body.toLowerCase();
    if (!bodyL.includes('σταυρός') && !bodyL.includes('σταυρ')) {
      body = body ? `σταυρός ${body}`.trim() : 'σταυρός';
    }
  }

  // Monogram letter injection
  // v3.5.1: check for "μονόγραμμα <letter>" exact pattern, not just letter presence anywhere
  // (prevents missed injection when letter coincidentally appears in other body words)
  const monogram = extractMonogramLetter(v);
  if (monogram && typeWord === 'Μενταγιόν') {
    const bodyL = body.toLowerCase();
    const expectedPattern = `μονόγραμμα ${monogram}`.toLowerCase();
    if (!bodyL.includes('μονόγραμμα')) {
      body = body ? `μονόγραμμα ${monogram} ${body}`.trim() : `μονόγραμμα ${monogram}`;
    } else if (!bodyL.includes(expectedPattern)) {
      body = body.replace(/μονόγραμμα(?![\p{L}\p{N}])/iu, `μονόγραμμα ${monogram}`);
    }
  }

  // Σχήμα option → plural motif
  for (const opt of v.selectedOptions || []) {
    const optName = (opt.name || '').toLowerCase();
    const optVal = (opt.value || '').trim();
    if (optName === 'σχήμα' && optVal.toLowerCase().startsWith('ζευγάρι ')) {
      const pluralMotif = optVal.slice(8).trim().toLowerCase(); // "Ζευγάρι " is 8 chars
      const sgToken = pluralMotif.replace(/α$/, 'ο');
      if (body.toLowerCase().includes(sgToken)) {
        body = body.replace(wordRegex(sgToken), pluralMotif);
      }
    }
  }

  // X finish: strip pre-existing μαύρ adjective from body
  // v3.5.1: broadened character class to \p{L}+ for plural masculine (μαύροι/μαύρους/μαύρων)
  if (finish === 'X') {
    body = body.replace(wordPatternRegex('μαύρ\\p{L}+'), '').replace(/\s+/g, ' ').trim();
  }

  // cuff → ear cuff normalization (unicode-aware, EARRINGS ONLY)
  // v3.5.1: gated to earring types — bracelet "cuff" is a different style (open-cuff bangle)
  if (typeWord === 'Σκουλαρίκι' || typeWord === 'Σκουλαρίκια') {
    body = body.replace(wordRegex('cuff'), 'ear cuff');
    body = body.replace(/(?<![\p{L}\p{N}])ear\s+ear cuff(?![\p{L}\p{N}])/giu, 'ear cuff');
    body = body.replace(wordRegex('cuffs'), 'ear cuffs');
    body = body.replace(/(?<![\p{L}\p{N}])ear\s+ear\s+cuffs(?![\p{L}\p{N}])/giu, 'ear cuffs');
    body = body.replace(/\s+/g, ' ').trim();
  }

  // "από <material>" → "με <material>" at start of body (only)
  body = body.replace(/^από\s+(στριφτό|πλεκτό|κεχριμπάρι|πέτρες|καρφιά|χάντρες|σύρμα)/i, 'με $1');

  // Build parts
  const parts = [typeWord];
  if (gender === 'male') parts.push(genderForm(typeWord));
  if (body) parts.push(body);
  if (side) parts.push(side);
  parts.push(handcraftedForm(typeWord));
  if (finish === 'X') parts.push(blackForm(typeWord));
  if (finish === 'G') parts.push('από επιχρυσωμένο ασήμι 925');
  else if (finish === 'R') parts.push('από ροζ επιχρυσωμένο ασήμι 925');
  else if (finish === 'O') parts.push('από οξειδωμένο ασήμι 925');
  else parts.push('από ασήμι 925');

  // Gem (inject before "χειροποίητο")
  if (gem) {
    const newParts = [];
    for (const p of parts) {
      if (p === handcraftedForm(typeWord)) newParts.push(`με ${gem}`);
      newParts.push(p);
    }
    parts.length = 0;
    parts.push(...newParts);
  }

  // Ring size
  if (typeWord === 'Δαχτυλίδι') {
    const rs = extractRingSize(v);
    if (rs && rs.toLowerCase() !== 'default title') parts.push(`μέγεθος ${rs}`);
  }

  // Bracelet length
  if (typeWord === 'Βραχιόλι') {
    const bl = extractBraceletLength(v);
    if (bl) parts.push(bl);
  }

  // Chain info for pendant family
  // v3.5.1: removed Βραχιόλι — bracelet length is already emitted via extractBraceletLength,
  // and adding "αλυσίδα <length>" produces double-cm duplication
  if (['Μενταγιόν', 'Κολιέ', 'Τσόκερ', 'Σετ κοσμημάτων'].includes(typeWord)) {
    const { chainType: ct, chainLength: cl } = extractChainInfo(v);
    let chainStr = null;
    if (ct && cl) {
      const ctClean = ct.toLowerCase().trim();
      chainStr = ctClean.startsWith('αλυσίδα') ? `${ctClean} ${cl}` : `αλυσίδα ${ctClean} ${cl}`;
    } else if (cl) chainStr = `αλυσίδα ${cl}`;
    else if (ct) {
      const ctClean = ct.toLowerCase().trim();
      chainStr = ctClean.startsWith('αλυσίδα') ? ctClean : `αλυσίδα ${ctClean}`;
    }
    if (chainStr) parts.push(chainStr.replace(/\s+/g, ' '));
  }

  let title = parts.filter(Boolean).join(' ');
  title = title.replace(/\s+/g, ' ').trim();
  return title;
}

module.exports = { buildSkroutzTitle };
