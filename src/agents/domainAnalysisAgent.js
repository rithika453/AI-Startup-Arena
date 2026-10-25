'use strict';
/**
 * Domain Analysis Agent (RULE-BASED - keyword scoring, no AI model).
 * Contract: run({ idea }) -> domain analysis. A future LLM-backed agent can replace this
 * module as long as it returns the same shape.
 */
const { listDomains } = require('../domains/registry');
const { countKeywordHits, round } = require('../lib/normalize');

const PROBLEM_RE = /\b(solv(?:e|es|ing)|address(?:es|ing)?|fix(?:es|ing)?|reduc(?:e|es|ing)|help(?:s|ing)?|enabl(?:e|es|ing)|tackl(?:e|es|ing))\s+(.{10,140}?)(?=[.;!?]|$)/i;
const CUSTOMER_RE = /\b(?:for|helping|serving|targeting)\s+((?:small |local |rural |urban |mid-sized )?[a-z][a-z\- ]{3,50}?)(?=\s+(?:to|by|with|who|that|using|in)\b|[.,;!?]|$)/i;

function run({ idea }) {
  const text = String(idea || '').toLowerCase();
  const scored = listDomains()
    .map((d) => {
      const { score, hits } = countKeywordHits(text, d.keywords, d.weight);
      return { domain: d, score, hits };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) {
    return {
      agent: 'domain-analysis (rule-based)',
      classified: false,
      primary: null,
      secondary: [],
      subdomain: null,
      targetCustomers: { text: null, source: 'unknown' },
      problemSolved: { text: null, source: 'unknown' },
      signals: [],
      confidence: 0,
      notes: ['No known domain keywords found. Add more detail about the industry, customers and product.'],
    };
  }

  const top = scored[0];
  const total = scored.reduce((s, x) => s + x.score, 0);
  const confidence = round((top.score / total) * Math.min(1, top.score / 3), 2);

  const sub = top.domain.subdomains
    .map((s) => ({ s, ...countKeywordHits(text, s.keywords) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)[0];

  const customerMatch = String(idea).match(CUSTOMER_RE);
  const problemMatch = String(idea).match(PROBLEM_RE);

  return {
    agent: 'domain-analysis (rule-based)',
    classified: true,
    primary: { id: top.domain.id, name: top.domain.name, score: round(top.score, 2) },
    secondary: scored.slice(1, 3).map((x) => ({ id: x.domain.id, name: x.domain.name, score: round(x.score, 2) })),
    subdomain: sub ? { id: sub.s.id, name: sub.s.name } : null,
    targetCustomers: customerMatch
      ? { text: customerMatch[1].trim(), source: 'idea' }
      : { text: top.domain.targetCustomers.join('; '), source: 'domain-default (inferred, please confirm)' },
    problemSolved: problemMatch
      ? { text: `${problemMatch[1].toLowerCase()} ${problemMatch[2].trim()}`, source: 'idea' }
      : { text: top.domain.typicalProblem, source: 'domain-default (inferred, please confirm)' },
    signals: top.hits,
    confidence,
    notes: confidence < 0.4 ? ['Low confidence: the idea matches this domain weakly or several domains equally.'] : [],
  };
}

module.exports = { name: 'domain-analysis', kind: 'rule-based', run };
