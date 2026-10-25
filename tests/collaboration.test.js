'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { runTeamMatching, CollaborationStore, STATUS } = require('../src');

const IDEA = 'A marketplace connecting farmers directly with buyers to sell fresh produce, with delivery logistics';
const fresh = () => {
  const store = new CollaborationStore({ now: () => '2026-01-01T00:00:00.000Z' });
  store.setSuggestions(runTeamMatching({ idea: IDEA }));
  return store;
};
const pair = { candidateId: 'C003', roleId: 'domain_expert_agriculture' };
const MSG = 'Hello, would you like to collaborate on this startup?';
const code = (fn) => { try { fn(); } catch (e) { return e.code; } return null; };

test('full workflow: accept -> request (Pending) -> Accepted -> team, all founder-driven', () => {
  const s = fresh();
  assert.equal(s.getTeam().length, 0, 'nobody is added automatically');
  s.decide(pair.candidateId, pair.roleId, 'accepted');
  const req = s.sendRequest({ ...pair, message: MSG, confirm: true });
  assert.equal(req.status, STATUS.PENDING);
  assert.equal(req.simulated, true);
  assert.equal(s.getTeam().length, 0, 'a pending request does not add to team');
  s.simulateCandidateResponse(req.id, 'accepted');
  assert.equal(s.listRequests(STATUS.ACCEPTED).length, 1);
  assert.equal(s.getTeam().length, 0, 'acceptance alone does not add to team');
  s.addToTeam(req.id);
  assert.equal(s.getTeam()[0].name, 'Karthik Subramanian');
  assert.deepEqual(s.summary(), { pending: 0, accepted: 1, rejected: 0, team: 1 });
  assert.deepEqual(req.history.map((h) => h.status), ['Pending', 'Accepted']);
});

test('rejected requests are tracked and cannot join the team', () => {
  const s = fresh();
  s.decide(pair.candidateId, pair.roleId, 'accepted');
  const req = s.sendRequest({ ...pair, message: MSG, confirm: true });
  s.simulateCandidateResponse(req.id, 'rejected');
  assert.equal(req.status, STATUS.REJECTED);
  assert.equal(code(() => s.addToTeam(req.id)), 'INVALID_TRANSITION');
  assert.equal(code(() => s.simulateCandidateResponse(req.id, 'accepted')), 'INVALID_TRANSITION', 'final states are final');
  // after a rejection the founder may try again
  assert.doesNotThrow(() => s.sendRequest({ ...pair, message: MSG, confirm: true }));
});

test('guards: consent, acceptance, message, duplicates, unknown ids', () => {
  const s = fresh();
  assert.equal(code(() => s.sendRequest({ ...pair, message: MSG, confirm: true })), 'NOT_ACCEPTED');
  s.decide(pair.candidateId, pair.roleId, 'accepted');
  assert.equal(code(() => s.sendRequest({ ...pair, message: MSG })), 'CONSENT_REQUIRED');
  assert.equal(code(() => s.sendRequest({ ...pair, message: MSG, confirm: 'true' })), 'CONSENT_REQUIRED');
  assert.equal(code(() => s.sendRequest({ ...pair, message: '  ', confirm: true })), 'INVALID_MESSAGE');
  assert.equal(code(() => s.sendRequest({ ...pair, message: 'x'.repeat(1001), confirm: true })), 'INVALID_MESSAGE');
  s.sendRequest({ ...pair, message: MSG, confirm: true });
  assert.equal(code(() => s.sendRequest({ ...pair, message: MSG, confirm: true })), 'DUPLICATE_REQUEST');
  assert.equal(code(() => s.decide(pair.candidateId, pair.roleId, 'ignored')), 'REQUEST_EXISTS');
  assert.equal(code(() => s.decide('NOPE', pair.roleId, 'accepted')), 'NOT_SUGGESTED');
  assert.equal(code(() => s.decide(pair.candidateId, pair.roleId, 'maybe')), 'INVALID_DECISION');
  assert.equal(code(() => s.simulateCandidateResponse('REQ-999', 'accepted')), 'NOT_FOUND');
  assert.equal(code(() => s.simulateCandidateResponse('REQ-001', 'whatever')), 'INVALID_OUTCOME');
  assert.equal(code(() => s.sendRequest()), 'NOT_SUGGESTED');
});

test('ignoring a suggestion is recorded and blocks requests until re-accepted', () => {
  const s = fresh();
  s.decide(pair.candidateId, pair.roleId, 'ignored');
  assert.deepEqual(s.getDecisions(), [{ ...pair, decision: 'ignored' }]);
  assert.equal(code(() => s.sendRequest({ ...pair, message: MSG, confirm: true })), 'NOT_ACCEPTED');
  s.decide(pair.candidateId, pair.roleId, 'accepted');
  assert.doesNotThrow(() => s.sendRequest({ ...pair, message: MSG, confirm: true }));
});

test('invalid suggestion payload and reset', () => {
  const s = new CollaborationStore();
  assert.throws(() => s.setSuggestions({ ok: false }));
  assert.throws(() => s.setSuggestions(null));
  const s2 = fresh();
  s2.decide(pair.candidateId, pair.roleId, 'accepted');
  s2.reset();
  assert.deepEqual(s2.getDecisions(), []);
  assert.equal(s2.listRequests().length, 0);
});
