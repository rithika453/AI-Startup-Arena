'use strict';
/**
 * Role catalogue. Each role has the expertise terms (technical OR business OR domain)
 * a candidate is compared against. Add roles with registerRole() - no other file changes.
 * Domain-expert roles are generated per domain by buildDomainExpertRole().
 */
const { normalizeList, normalizeTerm } = require('../lib/normalize');

const roles = new Map();

function registerRole(def, { replace = false } = {}) {
  if (!def || typeof def.id !== 'string' || !def.id.trim()) throw new Error('Role needs an id');
  if (typeof def.title !== 'string' || !def.title.trim()) throw new Error(`Role ${def.id} needs a title`);
  if (!['technical', 'business', 'domain'].includes(def.category)) throw new Error(`Role ${def.id} has invalid category`);
  const expertise = normalizeList(def.expertise);
  if (expertise.length === 0) throw new Error(`Role ${def.id} needs expertise terms`);
  if (roles.has(def.id) && !replace) throw new Error(`Role ${def.id} already registered`);
  roles.set(def.id, {
    id: def.id,
    title: def.title,
    category: def.category,
    expertise,
    aliases: normalizeList([def.title, def.id.replace(/_/g, ' '), ...(def.aliases || [])]),
  });
}

function getRole(id) { return roles.get(id) || null; }
function listRoles() { return [...roles.values()]; }

function buildDomainExpertRole(domain) {
  return {
    id: `domain_expert_${domain.id}`,
    title: `${domain.roleLabel} domain expert`,
    category: 'domain',
    expertise: domain.domainExpertise,
    aliases: normalizeList([`${domain.roleLabel} expert`, `${domain.name} expert`, `${domain.roleLabel} advisor`]),
  };
}
// Domain-expert roles are materialised on demand (see requirement generation) so new domains work automatically.
function materializeDomainExpert(domain) {
  const def = buildDomainExpertRole(domain);
  const normalized = {
    ...def,
    expertise: normalizeList(def.expertise),
    aliases: normalizeList([def.title, ...def.aliases]),
  };
  return normalized;
}

const BUILTIN = [
  { id: 'ai_ml_engineer', title: 'AI/ML engineer', category: 'technical', aliases: ['ml engineer', 'ai engineer', 'machine learning engineer', 'data scientist'],
    expertise: ['machine learning', 'python', 'deep learning', 'nlp', 'tensorflow', 'pytorch', 'data science'] },
  { id: 'software_developer', title: 'Software developer', category: 'technical', aliases: ['backend developer', 'full stack developer', 'software engineer'],
    expertise: ['javascript', 'node.js', 'python', 'java', 'sql', 'api design', 'backend development'] },
  { id: 'web_developer', title: 'Web developer', category: 'technical', aliases: ['frontend developer', 'full stack developer', 'web development'],
    expertise: ['react', 'javascript', 'html', 'css', 'node.js', 'web development'] },
  { id: 'mobile_developer', title: 'Mobile app developer', category: 'technical', aliases: ['android developer', 'ios developer', 'flutter developer'],
    expertise: ['flutter', 'react native', 'android', 'ios', 'kotlin', 'swift', 'mobile development'] },
  { id: 'cloud_specialist', title: 'Cloud specialist', category: 'technical', aliases: ['devops engineer', 'cloud engineer'],
    expertise: ['aws', 'azure', 'gcp', 'docker', 'kubernetes', 'devops', 'cloud'] },
  { id: 'data_analyst', title: 'Data analyst', category: 'technical', aliases: ['analytics specialist', 'business analyst'],
    expertise: ['sql', 'excel', 'data analytics', 'python', 'tableau', 'power bi'] },
  { id: 'ui_ux_designer', title: 'UI/UX designer', category: 'technical', aliases: ['product designer (digital)', 'ux designer', 'ui designer'],
    expertise: ['ui/ux', 'figma', 'wireframing', 'user research', 'prototyping'] },
  { id: 'product_manager', title: 'Product manager', category: 'business', aliases: ['product owner'],
    expertise: ['product management', 'roadmapping', 'agile', 'user research', 'mvp'] },
  { id: 'product_designer', title: 'Product designer', category: 'technical', aliases: ['industrial designer', 'physical product designer'],
    expertise: ['product design', 'cad', 'prototyping', 'industrial design', 'ergonomics'] },
  { id: 'manufacturing_expert', title: 'Manufacturing expert', category: 'domain', aliases: ['production manager', 'manufacturing engineer'],
    expertise: ['manufacturing', 'production planning', 'lean', 'supplier management', 'process engineering'] },
  { id: 'quality_control', title: 'Quality-control specialist', category: 'domain', aliases: ['quality specialist', 'qc specialist', 'quality assurance specialist'],
    expertise: ['quality control', 'quality assurance', 'iso 9001', 'inspection', 'testing standards'] },
  { id: 'finance_expert', title: 'Finance expert', category: 'business', aliases: ['cfo', 'finance lead', 'financial analyst'],
    expertise: ['financial modeling', 'budgeting', 'accounting', 'fundraising', 'unit economics'] },
  { id: 'sales_distribution', title: 'Sales / distribution specialist', category: 'business', aliases: ['sales specialist', 'distribution specialist', 'sales manager'],
    expertise: ['sales', 'distribution', 'retail partnerships', 'b2b sales', 'channel management'] },
  { id: 'marketing_specialist', title: 'Marketing specialist', category: 'business', aliases: ['growth marketer', 'digital marketer', 'marketing manager'],
    expertise: ['digital marketing', 'seo', 'branding', 'content marketing', 'social media'] },
  { id: 'business_development', title: 'Business development specialist', category: 'business', aliases: ['bd specialist', 'partnerships manager', 'business developer'],
    expertise: ['business development', 'partnerships', 'b2b sales', 'negotiation', 'market research'] },
  { id: 'customer_support', title: 'Customer-support specialist', category: 'business', aliases: ['customer success', 'support lead', 'customer success manager'],
    expertise: ['customer support', 'customer success', 'crm', 'helpdesk'] },
  { id: 'supply_chain_expert', title: 'Supply-chain expert', category: 'domain', aliases: ['logistics expert', 'operations manager'],
    expertise: ['supply chain', 'logistics', 'warehousing', 'procurement', 'inventory management'] },
  { id: 'legal_compliance', title: 'Legal / compliance advisor', category: 'business', aliases: ['compliance officer', 'legal advisor', 'regulatory advisor'],
    expertise: ['regulatory compliance', 'contracts', 'data privacy', 'ip law'] },
];
BUILTIN.forEach((r) => registerRole(r));

module.exports = { registerRole, getRole, listRoles, materializeDomainExpert, normalizeTerm };
