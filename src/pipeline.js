'use strict';
/**
 * Pipeline: orchestrates the five agents. Every agent is injectable via `opts.agents`,
 * so a future AI/API-backed agent can replace a rule-based one without touching this file's callers.
 * Nothing here sends messages or adds anyone to a team.
 */
const defaultAgents = {
  domain: require('./agents/domainAnalysisAgent'),
  businessModel: require('./agents/businessModelAgent'),
  requirements: require('./agents/requirementGenerationAgent'),
  matching: require('./agents/candidateMatchingAgent'),
  explanation: require('./agents/matchExplanationAgent'),
};
const demoCandidates = require('./data/demoCandidates');
const { mergeScoringConfig } = require('./config/scoring');

const MIN_IDEA_LENGTH = 15;
const MAX_IDEA_LENGTH = 2000;

function validateIdea(idea) {
  if (typeof idea !== 'string') return 'The startup idea must be text.';
  const cleaned = idea.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim();
  if (!cleaned) return 'Please enter a startup idea.';
  if (cleaned.length < MIN_IDEA_LENGTH || cleaned.split(/\s+/).length < 3) return `Please describe the idea in a little more detail (at least 3 words / ${MIN_IDEA_LENGTH} characters).`;
  if (cleaned.length > MAX_IDEA_LENGTH) return `The idea is too long (max ${MAX_IDEA_LENGTH} characters).`;
  return null;
}
const cleanIdea = (idea) => idea.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();

function engineInfo(agents) {
  return {
    type: 'rule-based',
    aiModelInUse: false,
    note: 'Analysis, matching and explanations come from deterministic rules and demo data. No AI model or multi-agent runtime is running; agent modules are structured so AI-backed versions can be plugged in later.',
    agents: Object.entries(agents).map(([slot, a]) => ({ slot, name: a.name, kind: a.kind })),
  };
}

/** Steps 1-3: domain, business model, requirements. No candidates needed. */
function analyzeIdea(input, opts = {}) {
  const { idea, founderSkills } = input && typeof input === 'object' ? input : {};
  const agents = { ...defaultAgents, ...(opts.agents || {}) };
  const err = validateIdea(idea);
  if (err) return { ok: false, errors: [err] };
  const text = cleanIdea(idea);
  const domainAnalysis = agents.domain.run({ idea: text });
  const businessModel = agents.businessModel.run({ idea: text, domainId: domainAnalysis.primary && domainAnalysis.primary.id });
  const requirementSet = agents.requirements.run({
    idea: text, domainAnalysis, businessModel,
    founderSkills: Array.isArray(founderSkills) ? founderSkills : [],
  });
  const warnings = [...(domainAnalysis.notes || []), ...(businessModel.notes || []), ...(requirementSet.notes || [])];
  return { ok: true, idea: text, domainAnalysis, businessModel, requirements: requirementSet.requirements, skillGaps: requirementSet.skillGaps, warnings, engine: engineInfo(agents) };
}

/** Full pipeline: analysis + candidate matching + explanations. */
function runTeamMatching(input, opts = {}) {
  const { idea, founderSkills, candidates, scoringConfig } = input && typeof input === 'object' ? input : {};
  const agents = { ...defaultAgents, ...(opts.agents || {}) };
  const analysis = analyzeIdea({ idea, founderSkills }, opts);
  if (!analysis.ok) return analysis;

  if (candidates !== undefined && !Array.isArray(candidates)) return { ok: false, errors: ['candidates must be an array of candidate profiles.'] };
  const pool = candidates === undefined ? demoCandidates : candidates;
  const usingDemo = candidates === undefined;
  const { config, warnings: cfgWarnings } = mergeScoringConfig(scoringConfig);

  const matching = agents.matching.run({
    requirements: analysis.requirements,
    domainAnalysis: analysis.domainAnalysis,
    candidates: pool,
    config,
    skillMatcher: opts.skillMatcher,
  });

  for (const role of matching.byRole) {
    const req = analysis.requirements.find((r) => r.roleId === role.roleId);
    role.candidates = role.candidates.map((m) => ({ ...m, explanation: agents.explanation.run({ match: m, requirement: req }) }));
  }

  return {
    ok: true,
    ...analysis,
    matching,
    missingRoles: matching.missingRoles,
    candidateSource: usingDemo ? 'DEMO profiles (fictional sample data)' : 'Caller-supplied candidates',
    warnings: [...analysis.warnings, ...cfgWarnings, ...matching.warnings],
    disclaimers: [
      'Match scores are heuristic and do not guarantee a candidate is suitable.',
      'Nothing is added to your team or sent to anyone automatically; collaboration requests are simulated in this prototype.',
      usingDemo ? 'Candidates shown are fictional demo profiles.' : 'Candidates were supplied by the calling application.',
    ],
  };
}

module.exports = { analyzeIdea, runTeamMatching, validateIdea, defaultAgents, MIN_IDEA_LENGTH, MAX_IDEA_LENGTH };
