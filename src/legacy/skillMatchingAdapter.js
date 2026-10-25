'use strict';
/**
 * Reuses the existing skill-matching/skillMatching.js WITHOUT modifying it.
 *
 * That file is a plain script: it has no exports and prints demo output when run.
 * We therefore load its source inside an isolated vm context (console silenced) and
 * pick `calculateMatch` out of the context. If the file cannot be found or loaded we
 * fall back to a local implementation with identical behaviour and report
 * `source: 'fallback'` so callers/tests can see which one is in use.
 *
 * Override the location with TEAM_MATCHING_LEGACY_PATH.
 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const DEFAULT_PATH = path.resolve(__dirname, '../../skill-matching/skillMatching.js');

function localCalculateMatch(requiredSkills, candidateSkills) {
  const required = [...new Set(requiredSkills.map((s) => s.toLowerCase()))];
  const available = new Set(candidateSkills.map((s) => s.toLowerCase()));
  const matchedSkills = required.filter((s) => available.has(s));
  const missingSkills = required.filter((s) => !available.has(s));
  const score = required.length === 0 ? 0 : Math.round((matchedSkills.length / required.length) * 100);
  return { score, matchedSkills, missingSkills };
}

function loadSkillMatcher(filePath = process.env.TEAM_MATCHING_LEGACY_PATH || DEFAULT_PATH) {
  try {
    const source = fs.readFileSync(filePath, 'utf8');
    const sandbox = { console: { log() {}, error() {}, warn() {} } };
    vm.createContext(sandbox);
    vm.runInContext(source, sandbox, { filename: filePath, timeout: 1000 });
    if (typeof sandbox.calculateMatch !== 'function') throw new Error('calculateMatch not found');
    const legacyFn = sandbox.calculateMatch;
    // Results are created inside the vm realm; copy them into main-realm objects so
    // instanceof / strict-equality checks in callers behave normally.
    const calculateMatch = (required, available) => {
      const r = legacyFn([...required], [...available]);
      return { score: r.score, matchedSkills: [...r.matchedSkills], missingSkills: [...r.missingSkills] };
    };
    return { calculateMatch, source: 'legacy', path: filePath };
  } catch (err) {
    return { calculateMatch: localCalculateMatch, source: 'fallback', path: null, reason: err.message };
  }
}

module.exports = { loadSkillMatcher, localCalculateMatch, DEFAULT_PATH };
