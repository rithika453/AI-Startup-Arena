'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { runTeamMatching, analyzeIdea, registerDomain, mergeScoringConfig, demoCandidates } = require('../src');
const { normalizeList } = require('../src/lib/normalize');
const { scoreCandidateForRole, prepareCandidate } = require('../src/agents/candidateMatchingAgent');
const { loadSkillMatcher, localCalculateMatch } = require('../src/legacy/skillMatchingAdapter');

const IDEAS = {
  agri: 'A marketplace connecting farmers directly with buyers to sell fresh produce, with delivery logistics',
  aiSaas: 'An AI-powered SaaS platform that automates customer support using LLM chatbots for e-commerce businesses',
  bottle: 'A smart reusable water bottle that tracks hydration, manufactured and sold to fitness consumers',
  agency: 'A digital marketing agency helping small local restaurants grow with social media management and SEO services',
  telemed: 'A mobile app for telemedicine consultations between rural patients and doctors',
};
const roleIds = (r) => r.requirements.map((x) => x.roleId);
const roleResult = (r, id) => r.matching.byRole.find((x) => x.roleId === id);

test('normalisation: case-insensitive, trimmed, de-duplicated, aliased', () => {
  assert.deepEqual(normalizeList(['Python', ' python ', 'PYTHON', 'JS', 'javascript', '', null, 5, 'UI/UX Design']), ['python', 'javascript', 'ui/ux']);
  assert.deepEqual(normalizeList('nope'), []);
});

test('legacy matcher is reused (not modified) and behaves like the original', () => {
  const m = loadSkillMatcher();
  assert.equal(m.source, 'legacy', `expected legacy matcher, got ${m.source}: ${m.reason}`);
  const args = [['Python', 'python', 'SQL', 'React'], ['sql', 'REACT']];
  assert.deepEqual(m.calculateMatch(...args), { score: 67, matchedSkills: ['sql', 'react'], missingSkills: ['python'] });
  assert.deepEqual(m.calculateMatch(...args), localCalculateMatch(...args));
  assert.equal(m.calculateMatch([], ['x']).score, 0);
});

test('classification: domain + business type across domains', () => {
  const cases = [
    ['agri', 'agriculture', 'marketplace'],
    ['aiSaas', 'ai_software', 'saas'],
    ['bottle', 'consumer_products', 'physical_product'],
    ['agency', 'marketing_services', 'service'],
    ['telemed', 'healthcare', 'mobile_app'],
  ];
  for (const [k, domain, type] of cases) {
    const a = analyzeIdea({ idea: IDEAS[k] });
    assert.equal(a.ok, true, k);
    assert.equal(a.domainAnalysis.primary.id, domain, `${k} domain`);
    assert.equal(a.businessModel.primary.id, type, `${k} type`);
  }
  assert.equal(analyzeIdea({ idea: IDEAS.agri }).domainAnalysis.subdomain.id, 'farm_to_market');
});

test('role generation is startup-specific (not the same roles for every idea)', () => {
  const sets = Object.fromEntries(Object.entries(IDEAS).map(([k, idea]) => [k, roleIds(analyzeIdea({ idea }))]));
  assert.ok(sets.agri.includes('domain_expert_agriculture') && sets.agri.includes('supply_chain_expert') && sets.agri.includes('web_developer'));
  assert.ok(['ai_ml_engineer', 'software_developer', 'cloud_specialist', 'product_manager', 'business_development', 'customer_support'].every((r) => sets.aiSaas.includes(r)));
  assert.ok(['product_designer', 'manufacturing_expert', 'quality_control', 'finance_expert', 'sales_distribution'].every((r) => sets.bottle.includes(r)));
  assert.ok(!sets.bottle.includes('cloud_specialist') && !sets.bottle.includes('software_developer'), 'physical product should not need cloud/software roles');
  assert.ok(!sets.agency.includes('software_developer') && sets.agency.includes('business_development'), 'service business has no developer roles');
  assert.ok(sets.telemed.includes('mobile_developer') && sets.telemed.includes('legal_compliance'));
  const joined = new Set(Object.values(sets).map((s) => s.join(',')));
  assert.equal(joined.size, Object.keys(IDEAS).length, 'every idea gets a distinct role set');
});

test('matching handles technical AND non-technical candidates', () => {
  const agri = runTeamMatching({ idea: IDEAS.agri });
  assert.equal(roleResult(agri, 'domain_expert_agriculture').candidates[0].name, 'Karthik Subramanian'); // non-technical domain expert
  assert.equal(roleResult(agri, 'supply_chain_expert').candidates[0].name, 'Imran Sheikh');
  assert.equal(roleResult(agri, 'marketing_specialist').candidates[0].name, 'Sneha Pillai');
  assert.equal(roleResult(agri, 'web_developer').candidates[0].name, 'Priya Raman'); // technical
  const ai = runTeamMatching({ idea: IDEAS.aiSaas });
  assert.equal(roleResult(ai, 'ai_ml_engineer').candidates[0].name, 'Aarav Menon');
  assert.equal(roleResult(ai, 'cloud_specialist').candidates[0].name, 'Sanjay Kumar');
  const bottle = runTeamMatching({ idea: IDEAS.bottle });
  assert.equal(roleResult(bottle, 'product_designer').candidates[0].name, 'Nisha Fernandes');
  assert.equal(roleResult(bottle, 'manufacturing_expert').candidates[0].name, 'Lakshmi Narayanan');
  const agency = runTeamMatching({ idea: IDEAS.agency });
  assert.equal(roleResult(agency, 'domain_expert_marketing_services').candidates[0].name, 'Zoya Ahmed');
});

test('ranking: sorted by score, ranks sequential, explanations and caution present', () => {
  const r = runTeamMatching({ idea: IDEAS.aiSaas });
  for (const role of r.matching.byRole) {
    const scores = role.candidates.map((c) => c.score);
    assert.deepEqual(scores, [...scores].sort((a, b) => b - a), role.roleId);
    role.candidates.forEach((c, i) => {
      assert.equal(c.rank, i + 1);
      assert.ok(c.explanation.summary.includes(c.name));
      assert.match(c.explanation.caution, /does not guarantee/);
      assert.ok(Array.isArray(c.matchedRequirements) && Array.isArray(c.missingRequirements));
    });
  }
  const overall = r.matching.overall.map((o) => o.score);
  assert.deepEqual(overall, [...overall].sort((a, b) => b - a));
});

test('score calculation is exact and transparent (hand-computed)', () => {
  const { config } = mergeScoringConfig({ weights: { expertise: 100, preferredRole: 0, industry: 0, interests: 0, availability: 0, projects: 0 }, expertiseSaturation: 1 });
  const { candidate } = prepareCandidate({ id: 'T1', name: 'Test', technicalSkills: ['SQL', 'sql', 'Excel'] });
  const req = { roleId: 'data_analyst', title: 'Data analyst', requiredExpertise: ['sql', 'excel', 'data analytics', 'python'], aliases: [] };
  const s = scoreCandidateForRole(candidate, req, null, config);
  assert.equal(s.score, 50); // 2 of 4 required, saturation 1 -> 0.5 * 100
  assert.deepEqual(s.matchedRequirements, ['sql', 'excel']);
  assert.deepEqual(s.missingRequirements, ['data analytics', 'python']);
  assert.equal(s.breakdown.expertise.points, 50);
  // default weights: expertise 45 saturates at 50% -> full 45, availability unknown 0.3*10 = 3 => 48 total
  const d = scoreCandidateForRole(candidate, req, null, mergeScoringConfig().config);
  assert.equal(d.score, 48);
});

test('scoring config is configurable and validated', () => {
  const base = runTeamMatching({ idea: IDEAS.bottle });
  const strict = runTeamMatching({ idea: IDEAS.bottle, scoringConfig: { minimumScore: 90 } });
  const n = (r) => r.matching.byRole.reduce((a, x) => a + x.candidates.length, 0);
  assert.ok(n(strict) < n(base));
  const bad = runTeamMatching({ idea: IDEAS.bottle, scoringConfig: { weights: { expertise: -5, bogus: 1 }, minimumScore: 'x' } });
  assert.equal(bad.ok, true);
  assert.ok(bad.warnings.some((w) => /Invalid weights.expertise/.test(w)) && bad.warnings.some((w) => /Unknown weights key/.test(w)));
  const zero = mergeScoringConfig({ weights: { expertise: 0, preferredRole: 0, industry: 0, interests: 0, availability: 0, projects: 0 } });
  assert.ok(Object.values(zero.config.weights).reduce((a, b) => a + b, 0) > 0);
});

test('missing-role detection', () => {
  const t = runTeamMatching({ idea: IDEAS.telemed });
  const missing = t.missingRoles.find((m) => m.roleId === 'mobile_developer');
  assert.ok(missing && missing.important && /No suitable candidate/.test(missing.suggestion));
  assert.equal(roleResult(t, 'mobile_developer').coverage, 'none');
  const food = runTeamMatching({ idea: 'A cloud kitchen selling healthy packaged meals and snacks to office workers' });
  assert.equal(food.domainAnalysis.primary.id, 'food');
  assert.ok(food.missingRoles.some((m) => m.roleId === 'domain_expert_food'), 'no food-science expert in demo pool');
});

test('founder skills reduce gaps and missing-role noise', () => {
  const without = analyzeIdea({ idea: IDEAS.telemed });
  const withSkills = analyzeIdea({ idea: IDEAS.telemed, founderSkills: ['Flutter', 'Kotlin', 'Android', 'iOS'] });
  assert.ok(without.skillGaps.byCategory.technical.includes('Mobile app developer'));
  assert.ok(!withSkills.skillGaps.byCategory.technical.includes('Mobile app developer'));
  const r = runTeamMatching({ idea: IDEAS.telemed, founderSkills: ['Flutter', 'Kotlin', 'Android', 'iOS'] });
  assert.ok(!r.missingRoles.some((m) => m.roleId === 'mobile_developer'));
});

test('unavailable candidates are never recommended; availability alone cannot qualify', () => {
  const r = runTeamMatching({ idea: IDEAS.aiSaas });
  assert.ok(!roleResult(r, 'ai_ml_engineer').candidates.some((c) => c.name === 'Kabir Singh'));
  const cands = [{ id: 'X1', name: 'Only Free', technicalSkills: ['Gardening'], availability: 'Full-time', interests: ['AI'], industries: ['ai_software'] }];
  const out = runTeamMatching({ idea: IDEAS.aiSaas, candidates: cands });
  assert.ok(out.matching.byRole.every((x) => x.candidates.length === 0));
});

test('new domains can be registered without touching engine code', () => {
  registerDomain({ id: 'space_tech', name: 'Space Technology', roleLabel: 'Space', keywords: ['satellite', 'orbit', 'rocket', 'space launch'], domainExpertise: ['aerospace engineering', 'orbital mechanics'] });
  const r = runTeamMatching({ idea: 'We build low-cost satellite imaging for small orbit missions' });
  assert.equal(r.domainAnalysis.primary.id, 'space_tech');
  assert.ok(roleIds(r).includes('domain_expert_space_tech'));
  assert.ok(r.missingRoles.some((m) => m.roleId === 'domain_expert_space_tech'));
  assert.throws(() => registerDomain({ id: 'space_tech', name: 'dup', keywords: ['x'] }));
});

test('invalid and empty input is handled safely', () => {
  for (const bad of [undefined, null, '', '   ', 42, {}, [], 'hi', '\u0000\u0001\u0002', 'x'.repeat(2001)]) {
    const r = runTeamMatching({ idea: bad });
    assert.equal(r.ok, false, JSON.stringify(bad)?.slice(0, 20));
    assert.ok(r.errors.length > 0);
  }
  assert.equal(runTeamMatching().ok, false);
  assert.equal(runTeamMatching(null).ok, false);
  assert.equal(runTeamMatching({ idea: IDEAS.agri, candidates: 'nope' }).ok, false);
  // unclassifiable idea: succeeds with low confidence and generic roles, never throws
  const vague = runTeamMatching({ idea: 'Something amazing that everyone will love someday' });
  assert.equal(vague.ok, true);
  assert.equal(vague.domainAnalysis.classified, false);
  assert.ok(vague.warnings.some((w) => /could not be classified|No known domain/.test(w)));
  // bad candidates are skipped with warnings
  const messy = runTeamMatching({ idea: IDEAS.agri, candidates: [null, 'str', { id: 'A' }, { name: 'No id' }, { id: 'D1', name: 'Dup' }, { id: 'D1', name: 'Dup2' }, ...demoCandidates.slice(0, 3)] });
  assert.equal(messy.ok, true);
  assert.ok(messy.warnings.filter((w) => /Skipped/.test(w)).length >= 5);
  assert.equal(runTeamMatching({ idea: IDEAS.agri, candidates: [] }).ok, true);
  assert.ok(runTeamMatching({ idea: IDEAS.agri, candidates: [] }).warnings.some((w) => /No valid candidates/.test(w)));
});

test('output is JSON-serialisable and labels itself as rule-based demo', () => {
  const r = runTeamMatching({ idea: IDEAS.agri });
  assert.doesNotThrow(() => JSON.parse(JSON.stringify(r)));
  assert.equal(r.engine.aiModelInUse, false);
  assert.match(r.candidateSource, /DEMO/);
});

test('agents are injectable (future AI agents can replace rule-based ones)', () => {
  const fake = { name: 'fake-domain', kind: 'test', run: () => ({ classified: false, primary: null, secondary: [], subdomain: null, targetCustomers: { text: null, source: 'x' }, problemSolved: { text: null, source: 'x' }, notes: [] }) };
  const a = analyzeIdea({ idea: IDEAS.agri }, { agents: { domain: fake } });
  assert.equal(a.domainAnalysis.classified, false);
  assert.ok(a.engine.agents.some((x) => x.name === 'fake-domain'));
});
