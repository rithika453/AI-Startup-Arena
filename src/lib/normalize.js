'use strict';
/**
 * Text/skill normalisation helpers.
 * Everything that is compared (skills, roles, interests, industries) goes through
 * normalizeTerm so matching is case-insensitive, whitespace-insensitive and alias-aware.
 */

const ALIASES = {
  js: 'javascript',
  reactjs: 'react',
  'react.js': 'react',
  node: 'node.js',
  nodejs: 'node.js',
  ml: 'machine learning',
  'ai/ml': 'machine learning',
  postgres: 'postgresql',
  ux: 'ui/ux',
  ui: 'ui/ux',
  'ui/ux design': 'ui/ux',
  'ux design': 'ui/ux',
  'ui design': 'ui/ux',
  k8s: 'kubernetes',
  qa: 'quality assurance',
  'e-commerce': 'ecommerce',
  'agri tech': 'agritech',
  'agri-tech': 'agritech',
};

function normalizeTerm(value) {
  if (typeof value !== 'string') return '';
  const t = value
    .toLowerCase()
    .replace(/[\s_]+/g, ' ')
    .replace(/^[^a-z0-9]+/, '')
    .replace(/[^a-z0-9+#]+$/, '')
    .trim();
  return ALIASES[t] || t;
}

/** Normalises, drops empty/non-string entries and removes duplicates (order preserved). */
function normalizeList(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  const seen = new Set();
  for (const item of list) {
    const t = normalizeTerm(item);
    if (t && !seen.has(t)) {
      seen.add(t);
      out.push(t);
    }
  }
  return out;
}

/** Two terms overlap if equal, or one contains the other as whole words (min length 3). */
function termsOverlap(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.length < 3 || b.length < 3) return false;
  const re = (x) => new RegExp(`(^|[^a-z0-9])${x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^a-z0-9])`);
  return re(a).test(b) || re(b).test(a);
}

function anyOverlap(listA, listB) {
  return listA.filter((a) => listB.some((b) => termsOverlap(a, b)));
}

/** Escape a string for use inside a RegExp. */
function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Count keyword hits in text. Each keyword counts once; multi-word keywords weigh more
 * (number of words). Short keywords (<=3 chars, e.g. "ai") need whole-word matches;
 * longer ones match as word prefixes so "farmers" hits "farmer".
 */
function countKeywordHits(text, keywords, weight = 1) {
  const hits = [];
  let score = 0;
  for (const kw of keywords || []) {
    const k = String(kw).toLowerCase();
    const body = escapeRegExp(k);
    const re = k.length <= 3
      ? new RegExp(`(?<![a-z0-9])${body}(?![a-z0-9])`)
      : new RegExp(`(?<![a-z0-9])${body}`);
    if (re.test(text)) {
      hits.push(k);
      score += k.split(/\s+/).length * weight;
    }
  }
  return { score, hits };
}

function round(n, digits = 1) {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

module.exports = { normalizeTerm, normalizeList, termsOverlap, anyOverlap, countKeywordHits, escapeRegExp, round };
