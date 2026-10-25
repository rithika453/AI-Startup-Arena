'use strict';
/**
 * Business Model Classification Agent (RULE-BASED - regex signals, no AI model).
 * Contract: run({ idea, domainId }) -> business model. A startup can be a combination.
 */
const { BUSINESS_TYPES, TIE_ORDER } = require('../data/businessTypes');
const { getDomain } = require('../domains/registry');

function run({ idea, domainId }) {
  const text = String(idea || '').toLowerCase();
  const scores = {};
  const signals = {};
  for (const [id, def] of Object.entries(BUSINESS_TYPES)) {
    let s = 0;
    for (const [src, w] of def.patterns) {
      const m = text.match(new RegExp(src));
      if (m) { s += w; (signals[id] = signals[id] || []).push(m[0].trim()); }
    }
    scores[id] = s;
  }
  const domain = domainId ? getDomain(domainId) : null;
  for (const implied of (domain && domain.impliedBusinessTypes) || []) {
    scores[implied] = (scores[implied] || 0) + 1;
    (signals[implied] = signals[implied] || []).push(`implied by domain: ${domain.name}`);
  }

  const ranked = TIE_ORDER
    .map((id) => ({ id, label: BUSINESS_TYPES[id].label, score: scores[id] || 0 }))
    .filter((t) => t.score > 0)
    .sort((a, b) => b.score - a.score || TIE_ORDER.indexOf(a.id) - TIE_ORDER.indexOf(b.id));

  if (ranked.length === 0) {
    return { agent: 'business-model (rule-based)', classified: false, primary: null, types: [], isCombination: false, label: 'Unclassified', signals: {}, notes: ['No business-model signals found. Say whether you sell a product, a service, software, or run a marketplace.'] };
  }
  const top = ranked[0];
  // Include any type that is strong in its own right (>=2) and at least half as strong as the top one.
  let types = ranked.filter((t) => t.score >= 2 && t.score >= top.score / 2);
  if (types.length === 0) types = [top];
  // A weak generic "app"/"software" mention should not turn a clear model into a combination of noise.
  return {
    agent: 'business-model (rule-based)',
    classified: true,
    primary: { id: top.id, label: top.label },
    types: types.map((t) => ({ id: t.id, label: t.label, score: t.score })),
    isCombination: types.length > 1,
    label: types.map((t) => t.label).join(' + '),
    signals,
    notes: [],
  };
}

module.exports = { name: 'business-model', kind: 'rule-based', run };
