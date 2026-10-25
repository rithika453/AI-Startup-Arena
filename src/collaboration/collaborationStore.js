'use strict';
/**
 * Founder-controlled collaboration workflow (SIMULATED, in-memory only).
 *
 * Rules enforced here:
 *  - Only candidates actually suggested for a role can be accepted/ignored.
 *  - A request can only be created for a pair the founder ACCEPTED, with explicit `confirm: true`.
 *    The message is optional (a default text is used when it is left blank); if given it must be
 *    10-1000 characters. No message is ever sent anywhere - requests are demo records.
 *  - Every request carries: id, founderId, candidateId, startupId, roleId, message, status,
 *    createdAt, updatedAt, respondedAt and a status history.
 *  - Status flow: Pending -> Accepted | Rejected (final). The candidate's response is SIMULATED
 *    (simulateCandidateResponse) because there is no real messaging yet.
 *  - Only one Pending/Accepted request may exist per founder + startup + candidate + role.
 *    After a Rejected request the founder may try again.
 *  - A candidate joins the team only through the founder's explicit addToTeam() on an Accepted request.
 *  - All IDs are validated (string, letters/digits/_ . : -, max 64 chars).
 * Persistence/messaging can replace this class later; keep the method names as the integration seam.
 */
class StoreError extends Error {
  constructor(code, message) { super(message); this.name = 'StoreError'; this.code = code; }
}

const STATUS = Object.freeze({ PENDING: 'Pending', ACCEPTED: 'Accepted', REJECTED: 'Rejected' });
const DEFAULT_FOUNDER_ID = 'FOUNDER-DEMO';
const DEFAULT_STARTUP_ID = 'STARTUP-DEMO';
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$/;
const MIN_MESSAGE = 10;
const MAX_MESSAGE = 1000;
const key = (candidateId, roleId) => `${candidateId}|${roleId}`;

/** Validate an ID. Missing -> MISSING_FIELD, wrong type/format -> INVALID_ID. */
function checkId(value, field) {
  if (value === undefined || value === null || value === '') throw new StoreError('MISSING_FIELD', `${field} is required.`);
  if (typeof value !== 'string' || !ID_RE.test(value)) {
    throw new StoreError('INVALID_ID', `${field} is not valid. Use up to 64 letters, digits, "-", "_", "." or ":".`);
  }
  return value;
}

/** Accepts "pending", "Pending", " PENDING " etc. Empty / "all" means no filter (returns undefined). */
function normalizeStatus(status) {
  if (status === undefined || status === null) return undefined;
  const s = String(status).trim().toLowerCase();
  if (s === '' || s === 'all') return undefined;
  const found = Object.values(STATUS).find((v) => v.toLowerCase() === s);
  if (!found) throw new StoreError('INVALID_STATUS', `Status must be one of: ${Object.values(STATUS).join(', ')} (or "all").`);
  return found;
}

class CollaborationStore {
  constructor({ now = () => new Date().toISOString(), founderId = DEFAULT_FOUNDER_ID, startupId = DEFAULT_STARTUP_ID } = {}) {
    this.now = now;
    this.defaults = { founderId: checkId(founderId, 'founderId'), startupId: checkId(startupId, 'startupId') };
    this.reset();
  }

  reset() {
    this.suggestions = new Map(); // key -> { candidateId, name, roleId, roleTitle, score }
    this.decisions = new Map();   // key -> 'accepted' | 'ignored'
    this.requests = [];
    this.team = [];
    this.activity = []; // chronological team activity log (oldest first)
    this.counter = 0;
    this.context = { ...this.defaults }; // current founder + startup (project)
  }

  _log(type, text, r, by, simulated = false) {
    this.activity.push({ at: this.now(), type, text, requestId: r.id, candidateId: r.candidateId, candidateName: r.candidateName, roleTitle: r.roleTitle, by, simulated });
  }

  getContext() { return { ...this.context }; }

  /**
   * Register the suggestions from a runTeamMatching() result. Replaces earlier suggestions.
   * Optional `context` = { founderId, startupId } sets who/what the following requests belong to.
   */
  setSuggestions(result, context = {}) {
    if (!result || !result.ok || !result.matching) throw new StoreError('INVALID_RESULT', 'Expected a successful matching result.');
    const ctx = {
      founderId: context.founderId === undefined ? this.context.founderId : checkId(context.founderId, 'founderId'),
      startupId: context.startupId === undefined ? this.context.startupId : checkId(context.startupId, 'startupId'),
    };
    this.context = ctx;
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

  /** A Pending or Accepted request for the same founder + startup + candidate + role. */
  _activeRequest(candidateId, roleId, founderId = this.context.founderId, startupId = this.context.startupId) {
    return this.requests.find((r) => r.founderId === founderId && r.startupId === startupId
      && r.candidateId === candidateId && r.roleId === roleId && r.status !== STATUS.REJECTED);
  }

  /** True if the current founder/startup already has a Pending or Accepted request for this pair (used by the UI). */
  hasActiveRequest(candidateId, roleId) { return Boolean(this._activeRequest(candidateId, roleId)); }

  decide(candidateId, roleId, decision) {
    checkId(candidateId, 'candidateId'); checkId(roleId, 'roleId');
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

  /**
   * Create a SIMULATED collaboration request (status Pending).
   * { candidateId, roleId, message?, confirm: true, founderId?, startupId? }
   * founderId/startupId default to the current session context.
   */
  sendRequest({ candidateId, roleId, message, confirm, founderId, startupId } = {}) {
    checkId(candidateId, 'candidateId'); checkId(roleId, 'roleId');
    const fid = founderId === undefined ? this.context.founderId : checkId(founderId, 'founderId');
    const sid = startupId === undefined ? this.context.startupId : checkId(startupId, 'startupId');
    const s = this._suggestion(candidateId, roleId);
    if (this.decisions.get(key(candidateId, roleId)) !== 'accepted') throw new StoreError('NOT_ACCEPTED', 'Accept the suggestion before sending a collaboration request.');
    if (confirm !== true) throw new StoreError('CONSENT_REQUIRED', 'Explicit founder confirmation is required to create a request.');

    let text; let messageIsDefault = false;
    if (message === undefined || message === null || (typeof message === 'string' && message.trim() === '')) {
      text = `Hello, I would like to invite you to collaborate on my startup as ${s.roleTitle}.`;
      messageIsDefault = true;
    } else if (typeof message !== 'string') {
      throw new StoreError('INVALID_MESSAGE', 'Message must be text.');
    } else {
      text = message.trim();
      if (text.length < MIN_MESSAGE) throw new StoreError('INVALID_MESSAGE', `Message must be at least ${MIN_MESSAGE} characters, or leave it blank to use the default message.`);
      if (text.length > MAX_MESSAGE) throw new StoreError('INVALID_MESSAGE', `Message is too long (max ${MAX_MESSAGE} characters).`);
    }

    if (this._activeRequest(candidateId, roleId, fid, sid)) throw new StoreError('DUPLICATE_REQUEST', 'A pending or accepted request already exists for this candidate and role.');
    const at = this.now();
    const req = {
      id: `REQ-${String(++this.counter).padStart(3, '0')}`,
      founderId: fid, startupId: sid,
      candidateId, candidateName: s.name, roleId, roleTitle: s.roleTitle,
      message: text, messageIsDefault, status: STATUS.PENDING, simulated: true,
      createdAt: at, updatedAt: at, respondedAt: null,
      history: [{ status: STATUS.PENDING, at, by: 'founder' }],
    };
    this.requests.push(req);
    this._log('request_sent', `Request sent to ${req.candidateName} (${req.roleTitle})`, req, 'founder');
    return req;
  }

  getRequest(requestId) {
    checkId(requestId, 'requestId');
    const r = this.requests.find((x) => x.id === requestId);
    if (!r) throw new StoreError('NOT_FOUND', `Request ${requestId} not found.`);
    return r;
  }

  /** DEMO ONLY: stands in for the candidate's reply until real messaging exists. */
  simulateCandidateResponse(requestId, outcome) {
    if (!['accepted', 'rejected'].includes(outcome)) throw new StoreError('INVALID_OUTCOME', 'Outcome must be "accepted" or "rejected".');
    const r = this.getRequest(requestId);
    if (r.status !== STATUS.PENDING) throw new StoreError('INVALID_TRANSITION', `Only Pending requests can change status (current: ${r.status}).`);
    const at = this.now();
    r.status = outcome === 'accepted' ? STATUS.ACCEPTED : STATUS.REJECTED;
    r.updatedAt = at; r.respondedAt = at; r.responseSimulated = true;
    r.history.push({ status: r.status, at, by: 'simulated-candidate' });
    this._log(r.status === STATUS.ACCEPTED ? 'candidate_accepted' : 'candidate_declined', `${r.candidateName} ${r.status === STATUS.ACCEPTED ? 'accepted' : 'declined'} the request`, r, 'simulated-candidate', true);
    return r;
  }

  addToTeam(requestId) {
    const r = this.getRequest(requestId);
    if (r.status !== STATUS.ACCEPTED) throw new StoreError('INVALID_TRANSITION', 'Only Accepted requests can be added to the team.');
    if (this.team.some((t) => t.requestId === requestId)) throw new StoreError('ALREADY_IN_TEAM', 'Already on the team.');
    const member = { requestId, candidateId: r.candidateId, name: r.candidateName, roleId: r.roleId, roleTitle: r.roleTitle, addedAt: this.now() };
    this.team.push(member);
    this._log('added_to_team', `${member.name} added to team as ${member.roleTitle}`, r, 'founder');
    return member;
  }

  removeFromTeam(requestId) {
    const r = this.getRequest(requestId);
    const i = this.team.findIndex((t) => t.requestId === requestId);
    if (i === -1) throw new StoreError('NOT_IN_TEAM', 'That person is not on your team.');
    const [member] = this.team.splice(i, 1);
    const at = this.now();
    r.updatedAt = at;
    r.history.push({ status: r.status, at, by: 'founder', note: 'Removed from team' });
    this._log('removed_from_team', `${member.name} removed from team`, r, 'founder');
    return member;
  }

  /**
   * Request history. `status` = Pending | Accepted | Rejected | "all" (case-insensitive).
   * `filters` may add { candidateId, startupId, founderId }. Newest first is left to the caller; order = creation order.
   */
  listRequests(status, filters = {}) {
    const wanted = normalizeStatus(status);
    for (const f of ['candidateId', 'startupId', 'founderId']) if (filters[f] !== undefined) checkId(filters[f], f);
    return this.requests.filter((r) => (!wanted || r.status === wanted)
      && (filters.candidateId === undefined || r.candidateId === filters.candidateId)
      && (filters.startupId === undefined || r.startupId === filters.startupId)
      && (filters.founderId === undefined || r.founderId === filters.founderId));
  }
  getTeam() { return [...this.team]; }
  /** Team activity log, oldest first. */
  getActivity() { return this.activity.map((a) => ({ ...a })); }
  summary() {
    const count = (s) => this.requests.filter((r) => r.status === s).length;
    return { pending: count(STATUS.PENDING), accepted: count(STATUS.ACCEPTED), rejected: count(STATUS.REJECTED), team: this.team.length };
  }
}

module.exports = { CollaborationStore, StoreError, STATUS };
