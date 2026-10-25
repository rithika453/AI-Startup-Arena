'use strict';
/**
 * Domain registry. A domain is pure data: keywords for detection, optional subdomains,
 * typical customers/problem, domain-expertise terms, and extra roles it tends to need.
 * Add a new domain at runtime (or in builtin.js) with registerDomain(); no engine code changes.
 */
const { normalizeList } = require('../lib/normalize');

const domains = new Map();

function registerDomain(def, { replace = false } = {}) {
  if (!def || typeof def.id !== 'string' || !/^[a-z0-9_]+$/.test(def.id)) throw new Error('Domain id must match [a-z0-9_]+');
  if (typeof def.name !== 'string' || !def.name.trim()) throw new Error(`Domain ${def.id} needs a name`);
  const keywords = [...new Set((def.keywords || []).filter((k) => typeof k === 'string' && k.trim()).map((k) => k.toLowerCase().trim()))];
  if (keywords.length === 0) throw new Error(`Domain ${def.id} needs keywords`);
  if (domains.has(def.id) && !replace) throw new Error(`Domain ${def.id} already registered`);
  domains.set(def.id, {
    id: def.id,
    name: def.name,
    roleLabel: def.roleLabel || def.name,
    keywords,
    weight: typeof def.weight === 'number' && def.weight > 0 ? def.weight : 1,
    subdomains: (def.subdomains || []).map((s) => ({
      id: s.id, name: s.name, keywords: (s.keywords || []).map((k) => k.toLowerCase()),
    })),
    targetCustomers: def.targetCustomers || [],
    typicalProblem: def.typicalProblem || '',
    domainExpertise: normalizeList(def.domainExpertise || []),
    includeDomainExpert: def.includeDomainExpert !== false,
    extraRoles: def.extraRoles || [], // [{ roleId, priority }]
    complianceSensitive: Boolean(def.complianceSensitive),
    impliedBusinessTypes: def.impliedBusinessTypes || [],
  });
}

function getDomain(id) { return domains.get(id) || null; }
function listDomains() { return [...domains.values()]; }

require('./builtin').forEach((d) => registerDomain(d));

module.exports = { registerDomain, getDomain, listDomains };
