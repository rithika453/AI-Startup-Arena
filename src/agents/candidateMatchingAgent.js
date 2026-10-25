'use strict';
/**
 * Candidate Matching Agent (RULE-BASED, configurable scoring - see config/scoring.js).
 * For every required role, scores every valid candidate, keeps the suitable ones, ranks them
 * and reports roles with no suitable candidate. Expertise matching reuses the existing
 * skill-matching/skillMatching.js `calculateMatch` through the legacy adapter.
 *
 * The score is a transparent heuristic, NOT a guarantee that a person is right for a role.
 */
const { normalizeList, anyOverlap, round } = require('../lib/normalize');
const { getDomain } = require('../domains/registry');
const { loadSkillMatcher } = require('../legacy/skillMatchingAdapter');

let defaultMatcher = null;
function getDefaultMatcher() {
  if (!defaultMatcher) defaultMatcher = loadSkillMatcher();
  return defaultMatcher;
}

/** Validate/clean a candidate. Returns { candidate } or { error }. */
function prepareCandidate(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { error: 'not an object' };
  const id = typeof raw.id === 'string' || typeof raw.id === 'number' ? String(raw.id).trim() : '';
  const name = typeof raw.name === 'string' ? raw.name.trim() : '';
  if (!id) return { error: 'missing id' };
  if (!name) return { error: `candidate ${id}: missing name` };
  const technical = normalizeList(raw.technicalSkills);
  const business = normalizeList(raw.businessExpertise);
  return {
    candidate: {
      id, name,
      technicalSkills: technical,
      businessExpertise: business,
      expertise: normalizeList([...technical, ...business]),
      industries: normalizeList(raw.industries),
      interests: normalizeList(raw.interests),
      preferredRoles: normalizeList(raw.preferredRoles),
      availability: typeof raw.availability === 'string' ? raw.availability.trim() : '',
      projects: Array.isArray(raw.projects) ? raw.projects.filter((p) => p && typeof p === 'object').map((p) => ({
        title: String(p.title || ''), summary: String(p.summary || ''), tags: normalizeList(p.tags),
      })) : [],
    },
  };
}

function availabilityFactor(availability, cfg) {
  const key = String(availability || '').toLowerCase().trim();
  if (!key) return { factor: cfg.unknownAvailabilityFactor, note: 'availability not specified' };
  if (key in cfg.availabilityFactors) return { factor: cfg.availabilityFactors[key], note: availability };
  return { factor: cfg.unknownAvailabilityFactor, note: `unrecognised availability "${availability}"` };
}

/** Score one candidate for one requirement. Exported for direct unit testing. */
function scoreCandidateForRole(candidate, requirement, domain, cfg, matcher = getDefaultMatcher()) {
  const w = cfg.weights;
  const required = requirement.requiredExpertise;
  const m = matcher.calculateMatch(required, candidate.expertise);
  const fraction = required.length ? m.matchedSkills.length / required.length : 0;
  const expertiseFrac = Math.min(1, fraction / cfg.expertiseSaturation);

  const roleNames = normalizeList([requirement.title, ...(requirement.aliases || [])]);
  const prefHits = anyOverlap(candidate.preferredRoles, roleNames).filter((p) => roleNames.includes(p));
  const preferredFrac = prefHits.length ? 1 : 0;

  const domainTerms = domain ? normalizeList([domain.id, domain.name, domain.roleLabel]) : [];
  const industryHits = anyOverlap(candidate.industries, domainTerms);
  const industryFrac = industryHits.length ? 1 : 0;

  const interestTargets = normalizeList([...(domain ? [domain.id, domain.name, domain.roleLabel, ...domain.keywords] : []), ...required]);
  const interestHits = anyOverlap(candidate.interests, interestTargets);
  const interestFrac = interestHits.length ? 1 : 0;

  const av = availabilityFactor(candidate.availability, cfg);

  const roleProjectHits = [];
  const domainProjectHits = [];
  for (const proj of candidate.projects) {
    roleProjectHits.push(...anyOverlap(proj.tags, required));
    if (domain) domainProjectHits.push(...anyOverlap(proj.tags, normalizeList([domain.id, domain.roleLabel, ...domain.keywords])));
  }
  const projectFrac = roleProjectHits.length ? 1 : domainProjectHits.length ? 0.5 : 0;

  const part = (key, frac, detail) => ({ weight: w[key], fraction: round(frac, 2), points: round(w[key] * frac, 2), detail });
  const breakdown = {
    expertise: part('expertise', expertiseFrac, `${m.matchedSkills.length}/${required.length} required expertise terms matched (full marks at ${Math.round(cfg.expertiseSaturation * 100)}%)`),
    preferredRole: part('preferredRole', preferredFrac, preferredFrac ? 'role is in the candidate\'s preferred roles' : 'role not in preferred roles'),
    industry: part('industry', industryFrac, industryFrac ? `experience in ${industryHits.join(', ')}` : 'no experience listed in this domain'),
    interests: part('interests', interestFrac, interestFrac ? `interest overlap: ${[...new Set(interestHits)].join(', ')}` : 'no interest overlap'),
    availability: part('availability', av.factor, av.note),
    projects: part('projects', projectFrac, projectFrac === 1 ? `project overlap: ${[...new Set(roleProjectHits)].join(', ')}` : projectFrac ? 'project in same domain' : 'no relevant project'),
  };
  const totalWeight = Object.values(w).reduce((a, b) => a + b, 0);
  const earned = Object.values(breakdown).reduce((a, b) => a + b.points, 0);
  const score = round((earned / totalWeight) * 100, 1);

  const suitable = score >= cfg.minimumScore
    && m.matchedSkills.length >= cfg.minimumExpertiseMatches
    && av.factor > 0
    && String(candidate.availability).toLowerCase() !== 'unavailable';

  return {
    candidateId: candidate.id,
    name: candidate.name,
    roleId: requirement.roleId,
    score,
    suitable,
    availability: candidate.availability || 'Not specified',
    matchedRequirements: m.matchedSkills,
    missingRequirements: m.missingSkills,
    breakdown,
  };
}

function run({ requirements, domainAnalysis, candidates, config, skillMatcher }) {
  const cfg = config;
  const matcher = skillMatcher || getDefaultMatcher();
  const warnings = [];
  const valid = [];
  const seen = new Set();
  (Array.isArray(candidates) ? candidates : []).forEach((raw, i) => {
    const { candidate, error } = prepareCandidate(raw);
    if (error) { warnings.push(`Skipped invalid candidate at index ${i}: ${error}.`); return; }
    if (seen.has(candidate.id)) { warnings.push(`Skipped duplicate candidate id ${candidate.id}.`); return; }
    seen.add(candidate.id);
    valid.push(candidate);
  });
  if (valid.length === 0) warnings.push('No valid candidates available to match.');

  const domain = domainAnalysis && domainAnalysis.classified ? getDomain(domainAnalysis.primary.id) : null;
  const byRole = [];
  const best = new Map(); // candidateId -> best fit

  for (const req of requirements) {
    const scored = valid.map((c) => scoreCandidateForRole(c, req, domain, cfg, matcher));
    const suitable = scored
      .filter((s) => s.suitable)
      .sort((a, b) => b.score - a.score || b.matchedRequirements.length - a.matchedRequirements.length || a.name.localeCompare(b.name));
    const top = suitable.slice(0, cfg.topCandidatesPerRole).map((s, i) => ({ ...s, rank: i + 1 }));
    top.forEach((s) => {
      const cur = best.get(s.candidateId);
      if (!cur || s.score > cur.score) best.set(s.candidateId, { candidateId: s.candidateId, name: s.name, bestRoleId: req.roleId, bestRoleTitle: req.title, score: s.score });
    });
    const topScore = top.length ? top[0].score : 0;
    byRole.push({
      roleId: req.roleId,
      title: req.title,
      priority: req.priority,
      category: req.category,
      coveredByFounder: req.coveredByFounder,
      candidatesConsidered: valid.length,
      candidates: top,
      coverage: top.length === 0 ? 'none' : topScore >= 60 ? 'strong' : 'partial',
    });
  }

  const missingRoles = byRole
    .filter((r) => r.candidates.length === 0 && !r.coveredByFounder)
    .map((r) => {
      const req = requirements.find((x) => x.roleId === r.roleId);
      return {
        roleId: r.roleId,
        title: r.title,
        priority: r.priority,
        important: cfg.importantPriorities.includes(r.priority),
        requiredExpertise: req.requiredExpertise,
        suggestion: `No suitable candidate in the current pool for "${r.title}". Consider recruiting externally, an advisor, or a contractor with: ${req.requiredExpertise.slice(0, 4).join(', ')}.`,
      };
    });

  const overall = [...best.values()].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name)).map((x, i) => ({ ...x, rank: i + 1 }));

  return {
    agent: 'candidate-matching (rule-based)',
    skillMatcherSource: matcher.source || 'custom',
    byRole,
    overall,
    missingRoles,
    candidatePoolSize: valid.length,
    warnings,
    scoringConfig: cfg,
  };
}

module.exports = { name: 'candidate-matching', kind: 'rule-based', run, scoreCandidateForRole, prepareCandidate };
