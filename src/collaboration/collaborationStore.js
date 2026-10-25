'use strict';
/**
 * Founder-controlled collaboration workflow (SIMULATED, in-memory only).
 *
 * Rules enforced here:
 *  - Only candidates actually suggested for a role can be accepted/ignored.
 *  - A request can only be created for a pair the founder ACCEPTED, with explicit `confirm: true`
 *    and a non-empty message. No message is ever sent anywhere - requests are demo records.
 *  - Status flow: Pending -> Accepted | Rejected. The candidate's response is SIMULATED
 *    (simulateCandidateResponse) because there is no real messaging yet.
 *  - A candidate joins the team only through the founder's explicit addToTeam() on an Accepted request.
 * Persistence/messaging can replace this class later; keep the method names as the integration seam.
 */
class StoreError extends Error {
  constructor(code, message) { super(message); this.name = 'StoreError'; this.code = code; }
}

const STATUS = Object.freeze({ PENDING: 'Pending', ACCEPTED: 'Accepted', REJECTED: 'Rejected' });
const key = (candidateId, roleId) => `${candidateId}|${roleId}`;

class CollaborationStore {
  constructor({ now = () => new Date().toISOString() } = {}) {
    this.now = now;
    this.reset();
  }

  reset() {
    this.suggestions = new Map(); // key -> { candidateId, name, roleId, roleTitle, score }
    this.decisions = new Map();   // key -> 'accepted' | 'ignored'
    this.requests = [];
    this.team = [];
    this.counter = 0;
  }

  /** Register the suggestions from a runTeamMatching() result. Replaces earlier suggestions. */
  setSuggestions(result) {
    if (!result || !result.ok || !result.matching) throw new StoreError('INVALID_RESULT', 'Expected a successful matching result.');
    this.suggestions = new Map();
    for (const role of result.matching.byRole) {
      for (const c of role.candidates) {
        this.suggestions.set(key(c.candidateId, role.roleId), { candidateId: c.candidateId, name: c.name, roleId: role.roleId, roleTitle: role.title, score: c.score });
      }
    }
    // drop decisions for pairs that are no longer suggested and have no request
    for (const k of [...this.decisions.keys()]) {
      if (!this.suggestions.has(k) && !this.requests.some((r) => key(r.candidateId, r.roleId) === k)) this.decisions.delete(k);
    }
    return this.suggestions.size;
  }

  _suggestion(candidateId, roleId) {
    const s = this.suggestions.get(key(candidateId, roleId));
    if (!s) throw new StoreError('NOT_SUGGESTED', 'That candidate has not been suggested for that role.');
    return s;
  }

  _activeRequest(candidateId, roleId) {
    return this.requests.find((r) => r.candidateId === candidateId && r.roleId === roleId && r.status !== STATUS.REJECTED);
  }

  decide(candidateId, roleId, decision) {
    if (!['accepted', 'ignored'].includes(decision)) throw new StoreError('INVALID_DECISION', 'Decision must be "accepted" or "ignored".');
    this._suggestion(candidateId, roleId);
    if (decision === 'ignored' && this._activeRequest(candidateId, roleId)) {
      throw new StoreError('REQUEST_EXISTS', 'A request already exists for this suggestion; it cannot be ignored now.');
    }
    this.decisions.set(key(candidateId, roleId), decision);
    return { candidateId, roleId, decision };
  }

  getDecisions() {
    return [...this.decisions.entries()].map(([k, decision]) => {
      const [candidateId, roleId] = k.split('|');
      return { candidateId, roleId, decision };
    });
  }

  sendRequest({ candidateId, roleId, message, confirm } = {}) {
    const s = this._suggestion(candidateId, roleId);
    if (this.decisions.get(key(candidateId, roleId)) !== 'accepted') throw new StoreError('NOT_ACCEPTED', 'Accept the suggestion before sending a collaboration request.');
    if (confirm !== true) throw new StoreError('CONSENT_REQUIRED', 'Explicit founder confirmation is required to create a request.');
    const text = typeof message === 'string' ? message.trim() : '';
    if (text.length < 10) throw new StoreError('INVALID_MESSAGE', 'Write a message of at least 10 characters.');
    if (text.length > 1000) throw new StoreError('INVALID_MESSAGE', 'Message is too long (max 1000 characters).');
    if (this._activeRequest(candidateId, roleId)) throw new StoreError('DUPLICATE_REQUEST', 'A pending or accepted request already exists for this candidate and role.');
    const at = this.now();
    const req = {
      id: `REQ-${String(++this.counter).padStart(3, '0')}`,
      candidateId, candidateName: s.name, roleId, roleTitle: s.roleTitle,
      message: text, status: STATUS.PENDING, simulated: true,
      createdAt: at, history: [{ status: STATUS.PENDING, at, by: 'founder' }],
    };
    this.requests.push(req);
    return req;
  }

  _get(requestId) {
    const r = this.requests.find((x) => x.id === requestId);
    if (!r) throw new StoreError('NOT_FOUND', `Request ${requestId} not found.`);
    return r;
  }

  /** DEMO ONLY: stands in for the candidate's reply until real messaging exists. */
  simulateCandidateResponse(requestId, outcome) {
    if (!['accepted', 'rejected'].includes(outcome)) throw new StoreError('INVALID_OUTCOME', 'Outcome must be "accepted" or "rejected".');
    const r = this._get(requestId);
    if (r.status !== STATUS.PENDING) throw new StoreError('INVALID_TRANSITION', `Only Pending requests can change status (current: ${r.status}).`);
    r.status = outcome === 'accepted' ? STATUS.ACCEPTED : STATUS.REJECTED;
    r.history.push({ status: r.status, at: this.now(), by: 'simulated-candidate' });
    return r;
  }

  addToTeam(requestId) {
    const r = this._get(requestId);
    if (r.status !== STATUS.ACCEPTED) throw new StoreError('INVALID_TRANSITION', 'Only Accepted requests can be added to the team.');
    if (this.team.some((t) => t.requestId === requestId)) throw new StoreError('ALREADY_IN_TEAM', 'Already on the team.');
    const member = { requestId, candidateId: r.candidateId, name: r.candidateName, roleId: r.roleId, roleTitle: r.roleTitle, addedAt: this.now() };
    this.team.push(member);
    return member;
  }

  listRequests(status) { return status ? this.requests.filter((r) => r.status === status) : [...this.requests]; }
  getTeam() { return [...this.team]; }
  summary() {
    return { pending: this.listRequests(STATUS.PENDING).length, accepted: this.listRequests(STATUS.ACCEPTED).length, rejected: this.listRequests(STATUS.REJECTED).length, team: this.team.length };
  }
}

module.exports = { CollaborationStore, StoreError, STATUS };
