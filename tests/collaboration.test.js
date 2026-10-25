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
  assert.equal(code(() => s.sendRequest({ ...pair, message: 'too short', confirm: true })), 'INVALID_MESSAGE');
  assert.equal(code(() => s.sendRequest({ ...pair, message: 12345, confirm: true })), 'INVALID_MESSAGE');
  assert.equal(code(() => s.sendRequest({ ...pair, message: 'x'.repeat(1001), confirm: true })), 'INVALID_MESSAGE');
  s.sendRequest({ ...pair, message: MSG, confirm: true });
  assert.equal(code(() => s.sendRequest({ ...pair, message: MSG, confirm: true })), 'DUPLICATE_REQUEST');
  assert.equal(code(() => s.decide(pair.candidateId, pair.roleId, 'ignored')), 'REQUEST_EXISTS');
  assert.equal(code(() => s.decide('NOPE', pair.roleId, 'accepted')), 'NOT_SUGGESTED');
  assert.equal(code(() => s.decide(pair.candidateId, pair.roleId, 'maybe')), 'INVALID_DECISION');
  assert.equal(code(() => s.simulateCandidateResponse('REQ-999', 'accepted')), 'NOT_FOUND');
  assert.equal(code(() => s.simulateCandidateResponse('REQ-001', 'whatever')), 'INVALID_OUTCOME');
  assert.equal(code(() => s.sendRequest()), 'MISSING_FIELD');
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

test('request record has founder, candidate, startup, role, status and timestamps', () => {
  const s = fresh();
  s.decide(pair.candidateId, pair.roleId, 'accepted');
  const req = s.sendRequest({ ...pair, message: MSG, confirm: true });
  assert.match(req.id, /^REQ-\d{3}$/);
  assert.equal(req.founderId, 'FOUNDER-DEMO');
  assert.equal(req.startupId, 'STARTUP-DEMO');
  assert.equal(req.candidateId, pair.candidateId);
  assert.equal(req.status, 'Pending');
  assert.equal(req.createdAt, '2026-01-01T00:00:00.000Z');
  assert.equal(req.updatedAt, req.createdAt);
  assert.equal(req.respondedAt, null);
  assert.equal(req.simulated, true);
  s.simulateCandidateResponse(req.id, 'accepted');
  assert.equal(req.responseSimulated, true);
  assert.equal(req.respondedAt, '2026-01-01T00:00:00.000Z');
});

test('message is optional: blank uses a default, short or non-text is rejected', () => {
  const s = fresh();
  s.decide(pair.candidateId, pair.roleId, 'accepted');
  const req = s.sendRequest({ ...pair, confirm: true });
  assert.equal(req.messageIsDefault, true);
  assert.match(req.message, /collaborate on my startup/);
  s.simulateCandidateResponse(req.id, 'rejected');
  const req2 = s.sendRequest({ ...pair, message: '   ', confirm: true });
  assert.equal(req2.messageIsDefault, true);
});

test('custom founderId / startupId are stored and validated', () => {
  const s = fresh();
  s.decide(pair.candidateId, pair.roleId, 'accepted');
  const req = s.sendRequest({ ...pair, message: MSG, confirm: true, founderId: 'F-100', startupId: 'S-200' });
  assert.equal(req.founderId, 'F-100');
  assert.equal(req.startupId, 'S-200');
  assert.equal(code(() => s.sendRequest({ ...pair, message: MSG, confirm: true, founderId: 'bad id!' })), 'INVALID_ID');
  assert.equal(code(() => s.sendRequest({ ...pair, message: MSG, confirm: true, startupId: 42 })), 'INVALID_ID');
  const s2 = new CollaborationStore();
  assert.throws(() => s2.setSuggestions(runTeamMatching({ idea: IDEA }), { founderId: '../etc' }), /founderId/);
});

test('duplicate check is per founder + startup + candidate + role', () => {
  const s = fresh();
  s.decide(pair.candidateId, pair.roleId, 'accepted');
  s.sendRequest({ ...pair, message: MSG, confirm: true, startupId: 'S-1' });
  assert.equal(code(() => s.sendRequest({ ...pair, message: MSG, confirm: true, startupId: 'S-1' })), 'DUPLICATE_REQUEST');
  assert.doesNotThrow(() => s.sendRequest({ ...pair, message: MSG, confirm: true, startupId: 'S-2' }), 'different startup is allowed');
  assert.doesNotThrow(() => s.sendRequest({ ...pair, message: MSG, confirm: true, founderId: 'F-2', startupId: 'S-1' }), 'different founder is allowed');
  assert.equal(s.hasActiveRequest(pair.candidateId, pair.roleId), false, 'default founder/startup has none');
});

test('IDs are validated with clear codes', () => {
  const s = fresh();
  assert.equal(code(() => s.decide('', pair.roleId, 'accepted')), 'MISSING_FIELD');
  assert.equal(code(() => s.decide(undefined, pair.roleId, 'accepted')), 'MISSING_FIELD');
  assert.equal(code(() => s.decide({}, pair.roleId, 'accepted')), 'INVALID_ID');
  assert.equal(code(() => s.decide('C003|x', pair.roleId, 'accepted')), 'INVALID_ID');
  assert.equal(code(() => s.decide('a'.repeat(65), pair.roleId, 'accepted')), 'INVALID_ID');
  assert.equal(code(() => s.getRequest('REQ 1')), 'INVALID_ID');
  assert.equal(code(() => s.getRequest()), 'MISSING_FIELD');
  assert.equal(code(() => s.getRequest('REQ-404')), 'NOT_FOUND');
});

test('status filters: Pending / Accepted / Rejected / all, case-insensitive, invalid rejected', () => {
  const s = fresh();
  s.decide(pair.candidateId, pair.roleId, 'accepted');
  const a = s.sendRequest({ ...pair, message: MSG, confirm: true });
  // a second suggested pair so we can hold requests in different statuses
  const second = [...s.suggestions.values()].find((x) => !(x.candidateId === pair.candidateId && x.roleId === pair.roleId));
  assert.ok(second, 'demo data should suggest at least two pairs');
  s.decide(second.candidateId, second.roleId, 'accepted');
  const b = s.sendRequest({ candidateId: second.candidateId, roleId: second.roleId, message: MSG, confirm: true });
  s.simulateCandidateResponse(a.id, 'accepted');
  assert.deepEqual(s.listRequests('Pending').map((r) => r.id), [b.id]);
  assert.deepEqual(s.listRequests('accepted').map((r) => r.id), [a.id]);
  assert.deepEqual(s.listRequests(' REJECTED ').map((r) => r.id), []);
  assert.equal(s.listRequests('all').length, 2);
  assert.equal(s.listRequests().length, 2);
  assert.equal(s.listRequests('').length, 2);
  assert.equal(code(() => s.listRequests('Done')), 'INVALID_STATUS');
  assert.deepEqual(s.listRequests(undefined, { candidateId: second.candidateId }).map((r) => r.id), [b.id]);
});

test('invalid transitions: no change after a final status; candidates cannot be added early', () => {
  const s = fresh();
  s.decide(pair.candidateId, pair.roleId, 'accepted');
  const req = s.sendRequest({ ...pair, message: MSG, confirm: true });
  assert.equal(code(() => s.addToTeam(req.id)), 'INVALID_TRANSITION', 'Pending cannot join');
  s.simulateCandidateResponse(req.id, 'accepted');
  assert.equal(code(() => s.simulateCandidateResponse(req.id, 'rejected')), 'INVALID_TRANSITION', 'Accepted is final');
  assert.equal(req.status, 'Accepted');
  s.addToTeam(req.id);
  assert.equal(code(() => s.addToTeam(req.id)), 'ALREADY_IN_TEAM');
  assert.equal(code(() => s.decide(pair.candidateId, pair.roleId, 'ignored')), 'REQUEST_EXISTS');
});

test('founder can remove a member from the team and add them again', () => {
  const s = fresh();
  s.decide(pair.candidateId, pair.roleId, 'accepted');
  const req = s.sendRequest({ ...pair, message: MSG, confirm: true });
  assert.equal(code(() => s.removeFromTeam(req.id)), 'NOT_IN_TEAM');
  s.simulateCandidateResponse(req.id, 'accepted');
  s.addToTeam(req.id);
  const gone = s.removeFromTeam(req.id);
  assert.equal(gone.name, 'Karthik Subramanian');
  assert.equal(s.getTeam().length, 0);
  assert.equal(req.status, 'Accepted');
  assert.equal(req.history.at(-1).note, 'Removed from team');
  assert.equal(code(() => s.removeFromTeam(req.id)), 'NOT_IN_TEAM');
  assert.equal(code(() => s.removeFromTeam('REQ-404')), 'NOT_FOUND');
  assert.doesNotThrow(() => s.addToTeam(req.id));
});

test('team activity log records the whole story in order, oldest first', () => {
  const s = fresh();
  s.decide(pair.candidateId, pair.roleId, 'accepted');
  const req = s.sendRequest({ ...pair, message: MSG, confirm: true });
  s.simulateCandidateResponse(req.id, 'rejected');
  const req2 = s.sendRequest({ ...pair, message: MSG, confirm: true });
  s.simulateCandidateResponse(req2.id, 'accepted');
  s.addToTeam(req2.id);
  s.removeFromTeam(req2.id);
  s.addToTeam(req2.id);
  assert.deepEqual(s.getActivity().map((a) => a.type), [
    'request_sent', 'candidate_declined', 'request_sent', 'candidate_accepted', 'added_to_team', 'removed_from_team', 'added_to_team',
  ]);
  const replies = s.getActivity().filter((a) => a.type.startsWith('candidate_'));
  assert.ok(replies.every((a) => a.simulated === true && a.by === 'simulated-candidate'));
  assert.ok(s.getActivity().filter((a) => !a.type.startsWith('candidate_')).every((a) => a.simulated === false && a.by === 'founder'));
  s.getActivity()[0].text = 'tampered';
  assert.notEqual(s.getActivity()[0].text, 'tampered');
  s.reset();
  assert.deepEqual(s.getActivity(), []);
});
