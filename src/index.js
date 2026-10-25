'use strict';
/** Public entry point of the Team Matching module (what the main app should require). */
const { analyzeIdea, runTeamMatching, validateIdea } = require('./pipeline');
const { CollaborationStore, StoreError, STATUS } = require('./collaboration/collaborationStore');
const { registerDomain, listDomains, getDomain } = require('./domains/registry');
const { registerRole, listRoles } = require('./roles/registry');
const { DEFAULT_SCORING, mergeScoringConfig } = require('./config/scoring');
const demoCandidates = require('./data/demoCandidates');

module.exports = {
  analyzeIdea, runTeamMatching, validateIdea,
  CollaborationStore, StoreError, STATUS,
  registerDomain, listDomains, getDomain, registerRole, listRoles,
  DEFAULT_SCORING, mergeScoringConfig, demoCandidates,
};
