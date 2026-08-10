/**
 * Skroutz XML Feed Title Builder v3.5.6 (2026-05-15, afternoon)
 *
 * Authoritative spec: C:\Users\bill\Ανεβασμα listing Jewelry\XML-FEED-TITLE-STRUCTURE-SPEC.md (v2)
 *
 * v3.5.6 patches (2) — code review hardening before Skroutz ticket reply:
 *   1. Unified "Επιμετάλλωση:" label for all finishes (was "Φινίρισμα:" for Sterling Silver).
 *      If Skroutz catalog parser keys on the exact "Επιμετάλλωση:" label string, the SS
 *      row was previously invisible to the parser. Now SS row reads:
 *        "Επιμετάλλωση: Καμία (Ασήμι 925 χωρίς επιμετάλλωση)"
 *      which the parser will catch by label regardless of value.
 *   2. Terminology alignment: SS row no longer says "Λευκό Ασήμι 925" — that contradicted
 *      the <color>Ασήμι</color> XML tag we emit elsewhere.
 *
 *   NOT addressed in this patch (deferred pending Skroutz ticket reply):
 *   - "Σετ από N" prefix in Skroutz title (B2 review item) — redundant with v3.5.5
 *     structured block "Πλήθος Τεμαχίων: Σετ από N" if the cluster engine parses labels.
 *     If the engine does NOT parse labels, adding Σετ από N to title won't help either
 *     (Skroutz strips quantity from cluster titles by design per 2026-05-12 reply).
 *
 * v3.5.5 patch (1) — Skroutz cluster engine signal improvement per support reply 2026-05-15:
 *   1. NEW buildStructuredAttributes() helper exports a multi-line structured block
 *      with 5-6 labeled key:value pairs (Τύπος Προϊόντος, Υλικό, Επιμετάλλωση,
 *      Πλήθος Τεμαχίων, Φύλο, Πλευρά) intended to be PREPENDED to each <description>.
 *      Skroutz feedspec exposes no custom tags for jewelry attributes, so the cluster
 *      engine parses these labels from description text. Fixes the "Μονό Σκουλαρίκι"
 *      cluster auto-title issue by giving the engine an explicit "Πλήθος Τεμαχίων:
 *      Ζευγάρι (2 τεμάχια)" / "Σετ από N" signal.
 *      Also re-exports detectJewelryType, detectGender, extractSide, getFinishForVariant
 *      for testing / future reuse by other feed builders (BestPrice etc.).
 *
 * v3.5.4 patches (4) — found by post-deploy parallel grammar + cosmetic audit:
 *   1. inflectBodyAdjectives() — body style/shape adjectives now agree in number/gender
 *      with the resolved typeWord. Fixes "Σκουλαρίκι ανόμοια" → "Σκουλαρίκι ανόμοιο",
 *      "Σκουλαρίκια ear cuff τοξωτό" → "...τοξωτά", "Σκουλαρίκι ανδρικό τρίγωνα" → "...τρίγωνο".
 *      Gem-phrase guard: skips adjective IMMEDIATELY before an inner gem/material noun
 *      ("σφυρήλατη αλυσίδα", "κρεμαστό ζιρκόν") so those stay correct.
 *   2. "&" in composite gem-color subaxis values (Μωβ & Ρουμπινί) now normalized to "και"
 *      BEFORE GEM_COLOR_MAP lookup — was leaking literal "&" into 5+5 gem phrases.
 *   3. extractBraceletLength now recognizes "Μήκος αλυσίδας" axis name — fixes 55
 *      bracelet entries that previously collided (11 groups of 2-7 duplicate titles)
 *      because length info never reached the title.
 *   4. Generic mid-sentence Title-Case → lowercase pass in cleanBody — catches Shopify
 *      capitalized motifs not in LOWERCASE_FIRST set (Άγγελος, Στριφτές, Φίδι, Ρόμβους,
 *      Λάπις, Mother, Pearl). Preserves single-letter monograms (Α/Β/Γ) and ALL-CAPS
 *      tokens (XS, S, M, L). Brand allowlist via PRESERVE_CAPS (currently: Box).
 *
 * v3.5.3 patches (2) — discovered during BestPrice v3.0 ultra-review:
 *   1. Removed hardcoded "Box" body strip — was leaving orphan prepositions ("γάντι του"
 *      with object stripped). "Box" can legitimately be part of a motif name; trust the
 *      Shopify source title.
 *   2. stripWords now accent-insensitive — also strips un-toned variants (e.g. catalog
 *      typo "Δαχτυλιδι" without τόνος) to prevent type-word body leak duplication.
 *
 * v3.5.2 cosmetic patches (3):
 *   1. CORD_TYPE_PATTERNS: τεχνόδερμα/δερμάτινο/δέρμα/κορδόνι get "κορδόνι" prefix
 *      instead of "αλυσίδα" (154 entries) — spec §2.13 line 256 "δερμάτινο κορδόνι"
 *   2. Gem-phrase injection BEFORE side when side present (8 ear-cuff entries) — spec §4.4
 *   3. "και" connector instead of "με" when body already ends with "με <X>" (55 entries
 *      — generalizes beyond πέτρα to ζιρκόν/μαργαριτάρι/σμάλτο)
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
 * v3.5.3: accent-insensitive — strips both toned and un-toned variants of each word
 * (handles Shopify catalog typos like "Δαχτυλιδι" without τόνος).
 */
function stripGreekAccents(s) {
  return s ? s.normalize('NFD').replace(/\p{M}/gu, '') : s;
}

function stripWords(text, words) {
  for (const w of words) {
    text = text.replace(wordRegex(w), '');
    // Also strip the unaccented variant if it differs (Shopify typo guard)
    const wPlain = stripGreekAccents(w);
    if (wPlain && wPlain !== w) {
      text = text.replace(wordRegex(wPlain), '');
    }
  }
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
    const [valRaw, subName] = subAxisColor;
    // v3.5.4: normalize "&" to "και" for composite gem-color values (e.g. "Μωβ & Ρουμπινί")
    // so the resulting gem phrase reads "μωβ και ρουμπινί ζιρκόν" instead of "μωβ & ρουμπινί ζιρκόν".
    const val = valRaw.replace(/\s*&\s*/g, ' και ');
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
  // v3.5.7: plural head-words used by quantity sets ("Σετ από N <type>")
  'σκουλαρίκια': ['n', 'pl'], 'δαχτυλίδια': ['n', 'pl'],
  'βραχιόλια': ['n', 'pl'], 'μενταγιόν': ['n', 'pl'],
  'κολιέ': ['n', 'pl'], 'τσόκερ': ['n', 'pl'],
};

// v3.5.7 (2026-07-24): plural head-word for quantity sets. Only neuter types are mapped —
// a feminine type (Καρφίτσα) falls back to the singular, i.e. today's behaviour, so this
// can never regress a type whose plural agreement is not modelled.
const TYPE_PLURAL = {
  'Σκουλαρίκι': 'σκουλαρίκια', 'Σκουλαρίκια': 'σκουλαρίκια',
  'Δαχτυλίδι': 'δαχτυλίδια', 'Βραχιόλι': 'βραχιόλια',
  'Μενταγιόν': 'μενταγιόν', 'Κολιέ': 'κολιέ', 'Τσόκερ': 'τσόκερ',
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
// BODY ADJECTIVE INFLECTION (v3.5.4)
// ============================================
// Style/shape adjectives must agree with the resolved typeWord in number/gender.
// Shopify product titles are usually authored in one fixed form (singular or plural
// neuter), but per-variant the type word can resolve to a different number/gender
// (e.g. Σκουλαρίκι vs Σκουλαρίκια; Καρφίτσα = feminine sg). Without inflection, the
// body adjective passes through and grates: "Σκουλαρίκι ανόμοια", "Σκουλαρίκια τοξωτό".

// Lookup table: lowercase form → { n_sg, n_pl, f_sg, f_pl }
const ADJ_INFLECTION = (() => {
  // Each row: [n_sg, n_pl, f_sg, f_pl]
  const groups = [
    ['ανόμοιο',       'ανόμοια',       'ανόμοιη',       'ανόμοιες'],
    ['όμοιο',         'όμοια',         'όμοια',         'όμοιες'],
    ['ασύμμετρο',     'ασύμμετρα',     'ασύμμετρη',     'ασύμμετρες'],
    ['σφυρήλατο',     'σφυρήλατα',     'σφυρήλατη',     'σφυρήλατες'],
    ['σφυρηλατημένο', 'σφυρηλατημένα', 'σφυρηλατημένη', 'σφυρηλατημένες'],
    ['πλεκτό',        'πλεκτά',        'πλεκτή',        'πλεκτές'],
    ['τοξωτό',        'τοξωτά',        'τοξωτή',        'τοξωτές'],
    ['στρόγγυλο',     'στρόγγυλα',     'στρόγγυλη',     'στρόγγυλες'],
    ['τρίγωνο',       'τρίγωνα',       'τρίγωνη',       'τρίγωνες'],
    ['τετράγωνο',     'τετράγωνα',     'τετράγωνη',     'τετράγωνες'],
    ['τριγωνικό',     'τριγωνικά',     'τριγωνική',     'τριγωνικές'],
    ['μικρό',         'μικρά',         'μικρή',         'μικρές'],
    ['μεγάλο',        'μεγάλα',        'μεγάλη',        'μεγάλες'],
    ['κρυφό',         'κρυφά',         'κρυφή',         'κρυφές'],
    ['μινιμαλιστικό', 'μινιμαλιστικά', 'μινιμαλιστική', 'μινιμαλιστικές'],
    ['κλασικό',       'κλασικά',       'κλασική',       'κλασικές'],
    ['κλασσικό',      'κλασσικά',      'κλασσική',      'κλασσικές'],
    ['μοντέρνο',      'μοντέρνα',      'μοντέρνη',      'μοντέρνες'],
    ['βυζαντινό',     'βυζαντινά',     'βυζαντινή',     'βυζαντινές'],
    ['γοτθικό',       'γοτθικά',       'γοτθική',       'γοτθικές'],
    ['τυλιχτό',       'τυλιχτά',       'τυλιχτή',       'τυλιχτές'],
    ['δίχρωμο',       'δίχρωμα',       'δίχρωμη',       'δίχρωμες'],
    ['καρφωτό',       'καρφωτά',       'καρφωτή',       'καρφωτές'],
    ['κρεμαστό',      'κρεμαστά',      'κρεμαστή',      'κρεμαστές'],
    ['διπλό',         'διπλά',         'διπλή',         'διπλές'],
    ['τριπλό',        'τριπλά',        'τριπλή',        'τριπλές'],
    ['στριφτό',       'στριφτά',       'στριφτή',       'στριφτές'],
  ];
  const map = {};
  for (const [n_sg, n_pl, f_sg, f_pl] of groups) {
    const byKey = { n_sg, n_pl, f_sg, f_pl };
    for (const form of [n_sg, n_pl, f_sg, f_pl]) {
      map[form.toLowerCase()] = byKey;
    }
  }
  return map;
})();

// Gem/material/structural/motif nouns. An adjective IMMEDIATELY before one of these
// describes that noun, not the head — so we skip inflection (preserve agreement).
const INNER_NOUN = new Set([
  // Stones / gems
  'πέτρα', 'πέτρες', 'πέτρας',
  'ζιρκόν', 'ζιργκόν',
  'μαργαριτάρι', 'μαργαριτάρια', 'μαργαριταριού',
  'τοπάζι', 'τοπάζια',
  'σμαράγδι', 'σμαράγδια',
  'ρουμπίνι', 'ρουμπίνια',
  'λάπις',
  'σκαθάρι', 'σκαθάρια',
  // Materials / structural
  'αλυσίδα', 'αλυσίδες', 'αλυσίδας',
  'κορδόνι', 'κορδόνια',
  'σύρμα', 'σύρματα',
  'σμάλτο',
  'καρδιά', 'καρδιές',
  'καμπύλη', 'καμπύλες',
  'ραβδώσεις',
  'φύλλα',
  'κλαδιά',
  'καρφιά',
  'χάντρες',
  'βέργες',
  'γραμμές',
  'σπείρες',
  // Motif nouns (plural) — adjective immediately before them describes them
  'λιβελούλες', 'μαργαρίτες', 'πεταλούδες', 'βιολέτες',
  'άγκυρες', 'μπίλιες', 'γρανάζια', 'εξοχές',
]);

function inflectBodyAdjectives(body, typeWord) {
  if (!body) return body;
  const g = TYPE_GRAMMAR[typeWord] || ['n', 'sg'];
  const [gender, number] = g;
  const targetKey = `${gender}_${number}`;

  const tokens = body.split(/\s+/);
  if (tokens.length === 0) return body;

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    const tokL = tok.toLowerCase();

    const lookup = ADJ_INFLECTION[tokL];
    if (!lookup) continue;

    const correct = lookup[targetKey];
    if (!correct || correct === tokL) continue;

    // Gem-phrase guard: if the NEXT token is an inner gem/material noun,
    // the adjective describes that noun (e.g. "σφυρήλατη αλυσίδα", "κρεμαστό ζιρκόν",
    // "μπλε πέτρα"), so leave it alone. This is the single most important guard —
    // ~135 false positives in the audit fell into this category.
    if (i + 1 < tokens.length) {
      const next = tokens[i + 1].toLowerCase();
      if (INNER_NOUN.has(next)) continue;
    }

    // Preserve original case (Title-Case input → Title-Case output)
    const isCap = /^[\p{Lu}]/u.test(tok);
    tokens[i] = isCap ? correct[0].toUpperCase() + correct.slice(1) : correct;
  }

  return tokens.join(' ');
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
  // Strip "&", "Minimal Bold" marketing fluff
  body = body.replace(/\s*&\s*/g, ' ');
  // v3.5.3 fix: removed "Box" strip — "Box" can be PART of a motif name (e.g. "γάντι του Box")
  // Stripping it leaves orphan prepositions ("γάντι του" without object). Keep verbatim from
  // Shopify product title — if it's marketing fluff, fix the Shopify source instead.
  // D.J. similarly retained verbatim (per PY prototype decision).
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
    // v3.5.4: generic mid-sentence Title-Case → lowercase pass. Catches Shopify-source
    // capitalized motifs not in LOWERCASE_FIRST (Άγγελος, Στριφτές, Φίδι, Ρόμβους, Λάπις,
    // Mother, Pearl, Λιβελούλα). Preserves single-letter monograms (Α/Β/Γ) and ALL-CAPS
    // tokens (XS, S, M, L) via the strict /^[Lu][Ll]+$/u pattern. Brand allowlist below.
    const PRESERVE_CAPS = new Set(['Box']);
    const words2 = body.split(/\s+/);
    for (let i = 0; i < words2.length; i++) {
      const w = words2[i];
      if (PRESERVE_CAPS.has(w)) continue;
      if (/^[\p{Lu}][\p{Ll}]+$/u.test(w)) {
        words2[i] = w[0].toLowerCase() + w.slice(1);
      }
    }
    body = words2.join(' ');
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
    // v3.5.4: added 'μήκος' (covers "Μήκος" and "Μήκος αλυσίδας") — was the missing axis
    // name for 55 bracelet variants (11 collision groups) where length never reached title.
    if ((name.includes('νούμερο') || name.includes('μέγεθος') ||
         name.includes('περίμετρος') || name.includes('μήκος'))
        && val.toLowerCase().includes('cm')) {
      const m = val.match(/(\d+(?:[-–]\d+)?)\s*cm/i);
      if (m) return m[0].replace(/\s/g, '');
    }
  }
  return null;
}

// ΒΗΜΑ Β πιλότος (2026-08-06): το μέγεθος του μενταγιόν στον τίτλο.
// ΠΑΓΩΜΕΝΗ λευκή λίστα — η αλλαγή ΔΕΝ μπορεί να διαρρεύσει σε άλλο προϊόν.
const PSIZE_PILOT_PRODUCTS = new Set(['4376372379683']); // Κρεμαστό μενταγιόν "κασέτα"

// Επιστρέφει ΜΟΝΟ το επίθετο μεγέθους — ποτέ ολόκληρη την τιμή της επιλογής
// («Μικρή Κασέτα»), αλλιώς ο τίτλος θα έλεγε «μικρή κασέτα κασέτα».
function extractPendantSizeToken(variant) {
  for (const opt of variant.selectedOptions || []) {
    const name = (opt.name || '').toLowerCase();
    if (!name.includes('μικρ') || !name.includes('μεγάλ')) continue;
    const val = (opt.value || '').trim().toLowerCase();
    if (val.includes('και τα δύο')) return 'μικρή και μεγάλη';
    if (val.startsWith('μικρ')) return 'μικρή';
    if (val.startsWith('μεγάλ') || val.startsWith('μεγαλ')) return 'μεγάλη';
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

// v3.5.2: chain types that are CORDS (κορδόνι), not chains (αλυσίδα).
// Spec §2.13 line 256 references "δερμάτινο κορδόνι" — leather/faux-leather strands are cords.
// When the Shopify variant chain type matches one of these, prefix with "κορδόνι" instead of "αλυσίδα".
const CORD_TYPE_PATTERNS = [
  /τεχν[όο]δερμα/i,
  /δερμ[άα]τιν[οαη]/i,
  /^δ[έε]ρμα(?:\s|$)/i,
  /^κορδ[όο]νι/i,
];

function isCordType(ctClean) {
  if (!ctClean) return false;
  return CORD_TYPE_PATTERNS.some((re) => re.test(ctClean));
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
  // v3.5.4: inflect body adjectives to agree with typeWord number/gender.
  // Must come AFTER cleanBody (lowercased tokens) and BEFORE motif/monogram/gem injection
  // so that downstream pieces see the already-agreeing forms.
  body = inflectBodyAdjectives(body, typeWord);

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

  // ΒΗΜΑ Β πιλότος: το μέγεθος μπαίνει ΕΠΙΘΕΜΑ στο body — «κασέτα μικρή», όχι «μικρή κασέτα».
  // Επιλογή του Bill 06/08 από δύο πραγματικά υποψήφια strings.
  // Fail-closed: εκτός λευκής λίστας ή με kill-switch ⇒ καμία αλλαγή.
  if (process.env.SKROUTZ_NO_PSIZE !== '1' && PSIZE_PILOT_PRODUCTS.has(String((product && product.id) || ''))) {
    const psizeTok = extractPendantSizeToken(v);
    if (psizeTok && body && !body.toLowerCase().includes(psizeTok)) {
      body = (body + ' ' + psizeTok).trim();
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

  // v3.5.7 (2026-07-24): a QUANTITY SET must say so in the TITLE.
  // v3.5.1 stripped "Σετ από N" because the structured block already carries
  // «Πλήθος Τεμαχίων: Σετ από N». That premise is disproven: Skroutz has told us the
  // <description> has ZERO clustering impact (the same reason our «Ζευγάρι (2 τεμάχια)»
  // still renders as «Μονό»), so the customer-facing title was advertising e.g. a set of
  // 4 rings as a single ring. We restore the prefix and switch the head word to its
  // plural so the Greek agrees. Only the exact label "Σετ από N" triggers this —
  // «Ζευγάρι…», «Μονό…» and «Σετ Κοσμημάτων…» are untouched.
  const piecesInfo = detectPiecesCount({ product, typeWord });
  const qtySet = /^Σετ από (\d+)$/.exec((piecesInfo && piecesInfo.label) || '');
  const setPrefix = qtySet ? `Σετ από ${qtySet[1]}` : null;
  const headWord = setPrefix ? (TYPE_PLURAL[typeWord] || typeWord) : typeWord;

  // Build parts
  const parts = setPrefix ? [setPrefix, headWord] : [headWord];
  if (gender === 'male') parts.push(genderForm(headWord));
  if (body) parts.push(body);
  if (side) parts.push(side);
  parts.push(handcraftedForm(headWord));
  if (finish === 'X') parts.push(blackForm(headWord));
  if (finish === 'G') parts.push('από επιχρυσωμένο ασήμι 925');
  else if (finish === 'R') parts.push('από ροζ επιχρυσωμένο ασήμι 925');
  else if (finish === 'O') parts.push('από οξειδωμένο ασήμι 925');
  else parts.push('από ασήμι 925');

  // Gem injection
  // v3.5.2:
  //   (a) inject BEFORE side when present (spec §4.4 example: gem-phrase before "αριστερό/δεξί αυτί")
  //       Old logic injected before χειροποίητο unconditionally → wrong for 8 ear-cuff entries.
  //   (b) when body already ends with "με <something>" phrase, connect gem with "και" instead of "με"
  //       to avoid double "με X με Y πέτρα" awkward grammar (32 affected entries).
  if (gem) {
    // Cover multi-word "με X" phrases at end of body (up to 5 trailing words — handles cases like "με mother of pearl")
    const bodyEndsWithMe = /(?<![\p{L}\p{N}])με\s+\p{L}+(?:\s+\p{L}+){0,4}\s*$/iu.test(body);
    const gemPhrase = bodyEndsWithMe ? `και ${gem}` : `με ${gem}`;
    // v3.5.7 fix: match the token ACTUALLY emitted into parts. For a quantity set the head
    // word is the plural, so parts carries handcraftedForm(headWord); comparing against the
    // singular form made the gem phrase silently disappear (e.g. «με μαύρη πέτρα» on ring sets).
    const handcraftedTok = handcraftedForm(headWord);
    const newParts = [];
    let injected = false;
    for (const p of parts) {
      if (!injected) {
        if (side && p === side) {
          newParts.push(gemPhrase);
          injected = true;
        } else if (!side && p === handcraftedTok) {
          newParts.push(gemPhrase);
          injected = true;
        }
      }
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
  // v3.5.2: cord-type detection — τεχνόδερμα/δερμάτινο/δέρμα/κορδόνι get "κορδόνι" prefix instead of "αλυσίδα"
  if (['Μενταγιόν', 'Κολιέ', 'Τσόκερ', 'Σετ κοσμημάτων'].includes(typeWord)) {
    const { chainType: ct, chainLength: cl } = extractChainInfo(v);
    let chainStr = null;
    const prefixFor = (ctClean) => {
      if (ctClean.startsWith('αλυσίδα') || ctClean.startsWith('κορδόνι')) return '';
      return isCordType(ctClean) ? 'κορδόνι ' : 'αλυσίδα ';
    };
    if (ct && cl) {
      const ctClean = ct.toLowerCase().trim();
      chainStr = `${prefixFor(ctClean)}${ctClean} ${cl}`;
    } else if (cl) chainStr = `αλυσίδα ${cl}`;
    else if (ct) {
      const ctClean = ct.toLowerCase().trim();
      chainStr = `${prefixFor(ctClean)}${ctClean}`;
    }
    if (chainStr) parts.push(chainStr.replace(/\s+/g, ' ').trim());
  }

  let title = parts.filter(Boolean).join(' ');
  title = title.replace(/\s+/g, ' ').trim();
  return title;
}

// ============================================
// STRUCTURED ATTRIBUTES BLOCK (v3.5.5)
// ============================================
// Skroutz feedspec does NOT support custom tags for jewelry attributes
// (material, plating, clasp type, pieces count). The catalog engine parses
// these from the <description> free-form field by label.
//
// Per Skroutz support 2026-05-15: "Το cluster title δεν δημιουργείται
// αποκλειστικά από το title string, αλλά κυρίως από τα structured attributes".
//
// We prepend a canonical block to each description with the 4-5 attributes
// that the cluster engine looks for, so cluster matching produces correct
// "Σκουλαρίκια / Ζευγάρι / Γυναικείο / Ροζ Επιχρύσωση" instead of
// auto-generated "Μονό Σκουλαρίκι Καρφωτό από Ασήμι Επιχρυσωμένο με Πέτρες MPN".

const PLATING_LABELS = {
  S: null,                                  // No plating — Λευκό Ασήμι 925
  G: 'Επιχρύσωση (Yellow Gold)',
  R: 'Επιχρύσωση Ροζ (Rose Gold)',
  O: 'Οξείδωση (Antiqued Silver)',
  X: 'Επιροδίωση Μαύρη (Black Rhodium)',
};

const GENDER_LABELS = {
  male: 'Ανδρικό',
  female: 'Γυναικείο',
  unisex: 'Unisex',
};

// Number-word → digit (for "Σετ από δύο/τρία/τέσσερα..." parsing)
const GREEK_NUMBER_WORDS = {
  'δύο': 2, 'δυο': 2, 'τρία': 3, 'τρια': 3, 'τέσσερα': 4, 'τεσσερα': 4,
  'πέντε': 5, 'πεντε': 5, 'έξι': 6, 'εξι': 6, 'επτά': 7, 'επτα': 7,
  'οκτώ': 8, 'οκτω': 8, 'εννέα': 9, 'εννεα': 9, 'δέκα': 10, 'δεκα': 10,
};

function detectPiecesCount({ product, typeWord }) {
  const title = (product.title || '').toLowerCase();
  // 1. Explicit "Σετ από N" prefix
  const setDigit = title.match(/^σετ\s+από\s+(\d+)/i);
  if (setDigit) return { count: parseInt(setDigit[1], 10), label: `Σετ από ${setDigit[1]}` };
  const setWord = title.match(/^σετ\s+από\s+([\p{L}]+)/iu);
  if (setWord && GREEK_NUMBER_WORDS[setWord[1].toLowerCase()]) {
    const n = GREEK_NUMBER_WORDS[setWord[1].toLowerCase()];
    return { count: n, label: `Σετ από ${n}` };
  }
  // 2. Leading quantity word "Δύο σκουλαρίκια..." / "Τρία δαχτυλίδια..."
  const leadWord = title.match(/^([\p{L}]+)\s/u);
  if (leadWord && GREEK_NUMBER_WORDS[leadWord[1].toLowerCase()]) {
    const n = GREEK_NUMBER_WORDS[leadWord[1].toLowerCase()];
    return { count: n, label: `Σετ από ${n}` };
  }
  // 3. Pair types
  if (typeWord === 'Σκουλαρίκια' || typeWord === 'Στέφανα γάμου') {
    return { count: 2, label: 'Ζευγάρι (2 τεμάχια)' };
  }
  // 4. Single earring (Μονό variant)
  if (typeWord === 'Σκουλαρίκι') {
    return { count: 1, label: 'Μονό (1 τεμάχιο)' };
  }
  // 5. Σετ κοσμημάτων: multi-piece set (2+) — keep undetermined
  if (typeWord === 'Σετ κοσμημάτων') {
    return { count: 2, label: 'Σετ Κοσμημάτων (2+ τεμάχια)' };
  }
  // 6. Everything else: single piece
  return { count: 1, label: '1 τεμάχιο' };
}

/**
 * Build structured-attribute block to prepend to <description>.
 * Returns multi-line string with labeled key:value pairs that Skroutz
 * catalog engine parses for cluster generation.
 */
function buildStructuredAttributes({ product, variant, skroutzCategory }) {
  const v = { ...variant };
  if (!v.selectedOptions && v.selected_options) v.selectedOptions = v.selected_options;

  const typeWord = detectJewelryType(product, v, skroutzCategory);
  const gender = detectGender(product, v, skroutzCategory);
  const side = extractSide(v);
  const { finish } = getFinishForVariant(product, v);
  const pieces = detectPiecesCount({ product, typeWord });

  const lines = ['Χαρακτηριστικά Προϊόντος'];

  // 1. Τύπος Προϊόντος (helps cluster engine map to correct category attribute)
  lines.push(`Τύπος Προϊόντος: ${typeWord}`);

  // 2. Υλικό (always Sterling Silver 925 for EMMANUELA)
  lines.push('Υλικό: Ασήμι 925 (Sterling Silver 925)');

  // 3. Επιμετάλλωση — ALWAYS use the same label so a label-keyed parser finds
  // the row regardless of finish. For Sterling Silver (no plating), value is
  // "Καμία" so the row exists but signals "no plating" semantically.
  // v3.5.6 fix (B6+M5): was "Φινίρισμα: Λευκό Ασήμι 925 (χωρίς επιμετάλλωση)"
  // — different label + different terminology from <color>Ασήμι</color>.
  // Now: unified "Επιμετάλλωση:" label, value matches the <color> field.
  if (PLATING_LABELS[finish]) {
    lines.push(`Επιμετάλλωση: ${PLATING_LABELS[finish]}`);
  } else {
    lines.push('Επιμετάλλωση: Καμία (Ασήμι 925 χωρίς επιμετάλλωση)');
  }

  // 4. Πλήθος Τεμαχίων (KEY ATTRIBUTE — fixes "Μονό Σκουλαρίκι" cluster issue)
  lines.push(`Πλήθος Τεμαχίων: ${pieces.label}`);

  // 5. Φύλο
  lines.push(`Φύλο: ${GENDER_LABELS[gender] || 'Unisex'}`);

  // 6. Πλευρά (only for single earrings)
  if (side) {
    lines.push(`Πλευρά: ${side === 'αριστερό αυτί' ? 'Αριστερό αυτί' : 'Δεξί αυτί'}`);
  }

  return lines.join('\n');
}

module.exports = {
  buildSkroutzTitle,
  buildStructuredAttributes,
  // Re-export internals for skroutz-feed-gr.js usage / testing
  detectJewelryType,
  detectGender,
  extractSide,
  getFinishForVariant,
  detectPiecesCount,
};
