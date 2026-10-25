'use strict';
/**
 * Configurable scoring. Every number that influences a match score lives here.
 *
 * Score = sum(weight_i * fraction_i) / sum(weights) * 100, where fraction_i is in [0,1]:
 *  - expertise:     matched required expertise / required, saturating at `expertiseSaturation`
 *                   (0.5 => matching half of a role's expertise terms earns full expertise points)
 *  - preferredRole: 1 if the candidate lists this role (or an alias) as preferred
 *  - industry:      1 if the candidate has experience in the startup's domain
 *  - interests:     1 if a candidate interest overlaps the domain or the role's expertise
 *  - availability:  factor from `availabilityFactors`
 *  - projects:      1 if a past project overlaps the role's expertise, 0.5 if only the domain
 *
 * A candidate is only "suitable" for a role when score >= minimumScore AND at least
 * `minimumExpertiseMatches` required expertise terms match AND they are available.
 * This stops availability/interests alone from producing a recommendation.
 */

const DEFAULT_SCORING = Object.freeze({
  weights: Object.freeze({ expertise: 45, preferredRole: 15, industry: 15, interests: 10, availability: 10, projects: 5 }),
  expertiseSaturation: 0.5,
  availabilityFactors: Object.freeze({ 'full-time': 1, 'part-time': 0.6, weekends: 0.3, unavailable: 0 }),
  unknownAvailabilityFactor: 0.3,
  priorityWeights: Object.freeze({ critical: 3, high: 2, medium: 1 }),
  minimumScore: 40,
  minimumExpertiseMatches: 1,
  topCandidatesPerRole: 3,
  importantPriorities: Object.freeze(['critical', 'high']),
});

const isNum = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0;

/** Merge user overrides over defaults; invalid values are ignored and reported in warnings. */
function mergeScoringConfig(overrides) {
  const warnings = [];
  const cfg = {
    weights: { ...DEFAULT_SCORING.weights },
    expertiseSaturation: DEFAULT_SCORING.expertiseSaturation,
    availabilityFactors: { ...DEFAULT_SCORING.availabilityFactors },
    unknownAvailabilityFactor: DEFAULT_SCORING.unknownAvailabilityFactor,
    priorityWeights: { ...DEFAULT_SCORING.priorityWeights },
    minimumScore: DEFAULT_SCORING.minimumScore,
    minimumExpertiseMatches: DEFAULT_SCORING.minimumExpertiseMatches,
    topCandidatesPerRole: DEFAULT_SCORING.topCandidatesPerRole,
    importantPriorities: [...DEFAULT_SCORING.importantPriorities],
  };
  if (overrides === undefined || overrides === null) return { config: cfg, warnings };
  if (typeof overrides !== 'object' || Array.isArray(overrides)) {
    warnings.push('Scoring config ignored: expected an object.');
    return { config: cfg, warnings };
  }
  for (const [group, defaults] of [['weights', cfg.weights], ['availabilityFactors', cfg.availabilityFactors], ['priorityWeights', cfg.priorityWeights]]) {
    if (overrides[group] === undefined) continue;
    for (const [k, v] of Object.entries(overrides[group] || {})) {
      if (!(k in defaults)) warnings.push(`Unknown ${group} key "${k}" ignored.`);
      else if (!isNum(v)) warnings.push(`Invalid ${group}.${k} ignored (must be a number >= 0).`);
      else defaults[k] = v;
    }
  }
  for (const key of ['expertiseSaturation', 'unknownAvailabilityFactor', 'minimumScore', 'minimumExpertiseMatches', 'topCandidatesPerRole']) {
    if (overrides[key] === undefined) continue;
    if (!isNum(overrides[key])) warnings.push(`Invalid ${key} ignored.`);
    else cfg[key] = overrides[key];
  }
  if (cfg.expertiseSaturation <= 0 || cfg.expertiseSaturation > 1) {
    warnings.push('expertiseSaturation must be in (0, 1]; default restored.');
    cfg.expertiseSaturation = DEFAULT_SCORING.expertiseSaturation;
  }
  if (Array.isArray(overrides.importantPriorities)) {
    cfg.importantPriorities = overrides.importantPriorities.filter((p) => p in cfg.priorityWeights);
  }
  const total = Object.values(cfg.weights).reduce((a, b) => a + b, 0);
  if (total <= 0) {
    warnings.push('All scoring weights are zero; default weights restored.');
    cfg.weights = { ...DEFAULT_SCORING.weights };
  }
  return { config: cfg, warnings };
}

module.exports = { DEFAULT_SCORING, mergeScoringConfig };
