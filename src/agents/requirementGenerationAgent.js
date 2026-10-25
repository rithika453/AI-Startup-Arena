'use strict';
/**
 * Requirement Generation Agent (RULE-BASED).
 * Turns domain + business model + idea signals into startup-specific role requirements.
 * Different ideas produce different role sets: roles come from (a) the domain,
 * (b) each detected business type, (c) signals in the idea text (AI, analytics), (d) compliance sensitivity.
 */
const { getDomain } = require('../domains/registry');
const { getRole, materializeDomainExpert } = require('../roles/registry');
const { normalizeList } = require('../lib/normalize');
const { round } = require('../lib/normalize');

const RANK = { critical: 3, high: 2, medium: 1 };

const TYPE_ROLES = {
  marketplace: [['product_manager', 'high'], ['web_developer', 'high'], ['ui_ux_designer', 'medium'], ['marketing_specialist', 'high']],
  saas: [['software_developer', 'high'], ['cloud_specialist', 'high'], ['product_manager', 'high'], ['business_development', 'medium'], ['customer_support', 'medium']],
  mobile_app: [['mobile_developer', 'critical'], ['ui_ux_designer', 'high'], ['product_manager', 'medium']],
  website: [['web_developer', 'high'], ['ui_ux_designer', 'medium'], ['marketing_specialist', 'medium']],
  digital_product: [['software_developer', 'high'], ['product_manager', 'medium'], ['ui_ux_designer', 'medium'], ['marketing_specialist', 'medium']],
  physical_product: [['product_designer', 'critical'], ['manufacturing_expert', 'critical'], ['quality_control', 'high'], ['finance_expert', 'high'], ['sales_distribution', 'high']],
  service: [['business_development', 'high'], ['marketing_specialist', 'high'], ['finance_expert', 'medium'], ['customer_support', 'medium']],
};
const WHY = {
  marketplace: 'Marketplace model needs both sides acquired and a working platform',
  saas: 'SaaS model needs a built, hosted and supported product',
  mobile_app: 'Mobile app is the delivery channel',
  website: 'Website is a delivery channel',
  digital_product: 'Digital product must be built and designed',
  physical_product: 'Physical product must be designed, made, quality-checked and sold',
  service: 'Service business depends on winning and serving clients',
};
const AI_RE = /\b(ai|artificial intelligence|machine learning|ml|llm|computer vision|nlp|recommendation engine|predictive|predicts?)\b/i;
const DATA_RE = /\b(analytics|dashboards?|insights|data-driven|reports?)\b/i;

function run({ idea, domainAnalysis, businessModel, founderSkills = [] }) {
  const reqs = new Map();
  const add = (role, priority, reason) => {
    if (!role) return;
    const cur = reqs.get(role.id);
    if (!cur) {
      reqs.set(role.id, { role, priority, reasons: [reason] });
    } else {
      if (RANK[priority] > RANK[cur.priority]) cur.priority = priority;
      if (!cur.reasons.includes(reason)) cur.reasons.push(reason);
    }
  };

  const domain = domainAnalysis.classified ? getDomain(domainAnalysis.primary.id) : null;
  const typeIds = businessModel.classified ? businessModel.types.map((t) => t.id) : [];
  const text = String(idea || '');

  if (domain && domain.includeDomainExpert) {
    add(materializeDomainExpert(domain), 'critical', `Idea is in ${domain.name}; domain knowledge is needed to validate the problem and customers`);
  }
  if (domain) {
    for (const { roleId, priority } of domain.extraRoles) {
      add(getRole(roleId), priority, `Typical need in ${domain.name}`);
    }
    if (domain.complianceSensitive) add(getRole('legal_compliance'), 'high', `${domain.name} is regulation-sensitive`);
  }
  for (const typeId of typeIds) {
    for (const [roleId, priority] of TYPE_ROLES[typeId] || []) add(getRole(roleId), priority, WHY[typeId]);
  }
  if (AI_RE.test(text)) {
    const critical = typeIds.includes('saas');
    add(getRole('ai_ml_engineer'), critical ? 'critical' : 'high', 'Idea relies on AI / machine-learning capability');
  }
  if (DATA_RE.test(text)) add(getRole('data_analyst'), 'medium', 'Idea mentions analytics / dashboards / insights');

  let notes = [];
  if (reqs.size === 0) {
    notes.push('Idea could not be classified, so only generic founding-team roles are suggested. Add detail to get startup-specific roles.');
    for (const [id, pr] of [['product_manager', 'high'], ['business_development', 'medium'], ['marketing_specialist', 'medium']]) add(getRole(id), pr, 'Generic founding-team role (idea not classified)');
  }

  const founder = normalizeList(founderSkills);
  const requirements = [...reqs.values()]
    .sort((a, b) => RANK[b.priority] - RANK[a.priority])
    .map(({ role, priority, reasons }) => {
      const covered = role.expertise.filter((t) => founder.includes(t));
      const coverage = round(covered.length / role.expertise.length, 2);
      return {
        roleId: role.id,
        title: role.title,
        category: role.category,
        priority,
        requiredExpertise: role.expertise,
        aliases: role.aliases,
        reasons,
        founderCoverage: coverage,
        coveredByFounder: coverage >= 0.5,
      };
    });

  const gaps = requirements.filter((r) => !r.coveredByFounder);
  return {
    agent: 'requirement-generation (rule-based)',
    requirements,
    skillGaps: {
      byCategory: {
        technical: gaps.filter((r) => r.category === 'technical').map((r) => r.title),
        business: gaps.filter((r) => r.category === 'business').map((r) => r.title),
        domain: gaps.filter((r) => r.category === 'domain').map((r) => r.title),
      },
      missingExpertise: [...new Set(gaps.flatMap((r) => r.requiredExpertise.filter((t) => !founder.includes(t))))],
      founderSkillsProvided: founder.length > 0,
    },
    notes,
  };
}

module.exports = { name: 'requirement-generation', kind: 'rule-based', run };
