'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('../src/server');

async function withServer(fn) {
  const server = createServer();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (path, method = 'GET', body, raw) => {
    const res = await fetch(base + path, { method, headers: body || raw ? { 'Content-Type': 'application/json' } : undefined, body: raw || (body ? JSON.stringify(body) : undefined) });
    const text = await res.text();
    let json = null; try { json = JSON.parse(text); } catch { /* html/static */ }
    return { status: res.status, json, text };
  };
  try { await fn(call); } finally { await new Promise((r) => server.close(r)); }
}

test('API: end-to-end founder flow over HTTP', async () => {
  await withServer(async (call) => {
    assert.equal((await call('/api/health')).json.engine, 'rule-based');
    const ui = await call('/');
    assert.equal(ui.status, 200); assert.match(ui.text, /DEMO candidate profiles/);
    assert.equal((await call('/app.js')).status, 200);
    assert.equal((await call('/../package.json')).status, 404);

    const m = await call('/api/match', 'POST', { idea: 'A marketplace connecting farmers directly with buyers to sell fresh produce' });
    assert.equal(m.status, 200); assert.equal(m.json.domainAnalysis.primary.id, 'agriculture');
    const body = { candidateId: 'C003', roleId: 'domain_expert_agriculture' };

    assert.equal((await call('/api/requests', 'POST', { ...body, message: 'Hello there, join us?', confirm: true })).status, 400, 'must accept first');
    assert.equal((await call('/api/decisions', 'POST', { ...body, decision: 'accepted' })).status, 200);
    assert.equal((await call('/api/requests', 'POST', { ...body, message: 'Hello there, join us?' })).status, 400, 'needs consent');
    const created = await call('/api/requests', 'POST', { ...body, message: 'Hello there, join us?', confirm: true });
    assert.equal(created.status, 201); assert.equal(created.json.request.status, 'Pending'); assert.equal(created.json.simulated, true);
    assert.equal((await call('/api/requests', 'POST', { ...body, message: 'Hello there, join us?', confirm: true })).status, 409);
    const id = created.json.request.id;
    assert.equal((await call(`/api/requests/${id}/add-to-team`, 'POST')).status, 409, 'cannot add while pending');
    assert.equal((await call(`/api/requests/${id}/simulate-response`, 'POST', { outcome: 'accepted' })).json.request.status, 'Accepted');
    assert.equal((await call(`/api/requests/${id}/add-to-team`, 'POST')).status, 200);
    assert.equal((await call('/api/team')).json.team.length, 1);
    assert.equal((await call('/api/requests')).json.summary.accepted, 1);
    assert.equal((await call('/api/session/reset', 'POST')).status, 200);
    assert.equal((await call('/api/team')).json.team.length, 0);
  });
});

test('API: invalid input returns clean 4xx errors', async () => {
  await withServer(async (call) => {
    assert.equal((await call('/api/match', 'POST', { idea: '' })).status, 400);
    assert.equal((await call('/api/match', 'POST', { idea: 123 })).status, 400);
    assert.equal((await call('/api/match', 'POST', {})).status, 400);
    assert.equal((await call('/api/match', 'POST', undefined, '{not json')).status, 400);
    assert.equal((await call('/api/match', 'POST', undefined, '[1,2]')).status, 400);
    assert.equal((await call('/api/match', 'POST', { idea: 'x'.repeat(200 * 1024) })).status, 413);
    assert.equal((await call('/api/candidates/NOPE')).status, 404);
    assert.equal((await call('/api/nothing')).status, 404);
    assert.equal((await call('/api/decisions', 'POST', { candidateId: 'C003', roleId: 'x', decision: 'accepted' })).status, 404);
  });
});

test('API: request fields, optional message, filters, single lookup and success messages', async () => {
  await withServer(async (call) => {
    await call('/api/match', 'POST', { idea: 'A marketplace connecting farmers directly with buyers to sell fresh produce', founderId: 'F-1', startupId: 'S-1' });
    const body = { candidateId: 'C003', roleId: 'domain_expert_agriculture' };
    const acc = await call('/api/decisions', 'POST', { ...body, decision: 'accepted' });
    assert.equal(acc.status, 200); assert.ok(acc.json.message);

    // message is optional
    const created = await call('/api/requests', 'POST', { ...body, confirm: true });
    assert.equal(created.status, 201);
    const r = created.json.request;
    assert.equal(r.founderId, 'F-1'); assert.equal(r.startupId, 'S-1'); assert.equal(r.status, 'Pending');
    assert.ok(r.createdAt && r.updatedAt); assert.equal(r.respondedAt, null);
    assert.match(created.json.message, /Nothing was sent/);

    // validation errors
    assert.equal((await call('/api/requests', 'POST', { roleId: body.roleId, confirm: true })).status, 400, 'missing candidateId');
    assert.equal((await call('/api/requests', 'POST', { candidateId: 'bad id!', roleId: body.roleId, confirm: true })).status, 400, 'invalid id');
    assert.equal((await call('/api/requests', 'POST', { ...body, message: 'short', confirm: true })).status, 400, 'short message');

    // filters
    assert.equal((await call('/api/requests?status=Pending')).json.count, 1);
    assert.equal((await call('/api/requests?status=pending')).json.count, 1, 'case-insensitive');
    assert.equal((await call('/api/requests?status=Accepted')).json.count, 0);
    assert.equal((await call('/api/requests?status=all')).json.count, 1);
    const bad = await call('/api/requests?status=Done');
    assert.equal(bad.status, 400); assert.equal(bad.json.code, 'INVALID_STATUS');

    // single request + simulated response + invalid transition
    assert.equal((await call(`/api/requests/${r.id}`)).json.request.id, r.id);
    assert.equal((await call('/api/requests/REQ-999')).status, 404);
    const rej = await call(`/api/requests/${r.id}/simulate-response`, 'POST', { outcome: 'rejected' });
    assert.equal(rej.status, 200); assert.match(rej.json.message, /SIMULATED/); assert.equal(rej.json.request.responseSimulated, true);
    assert.equal((await call(`/api/requests/${r.id}/simulate-response`, 'POST', { outcome: 'accepted' })).status, 409, 'final status cannot change');
    assert.equal((await call('/api/requests?status=Rejected')).json.count, 1);
    assert.equal((await call(`/api/requests/${r.id}/simulate-response`, 'POST', { outcome: 'maybe' })).status, 400);
  });
});

test('API: remove a member from the team', async () => {
  await withServer(async (call) => {
    await call('/api/match', 'POST', { idea: 'A marketplace connecting farmers directly with buyers to sell fresh produce' });
    const body = { candidateId: 'C003', roleId: 'domain_expert_agriculture' };
    await call('/api/decisions', 'POST', { ...body, decision: 'accepted' });
    const created = await call('/api/requests', 'POST', { ...body, confirm: true });
    const id = created.json.request.id;
    assert.equal((await call(`/api/requests/${id}/remove-from-team`, 'POST')).status, 409);
    await call(`/api/requests/${id}/simulate-response`, 'POST', { outcome: 'accepted' });
    await call(`/api/requests/${id}/add-to-team`, 'POST');
    const removed = await call(`/api/requests/${id}/remove-from-team`, 'POST');
    assert.equal(removed.status, 200);
    assert.match(removed.json.message, /removed/);
    assert.equal((await call('/api/team')).json.team.length, 0);
  });
});

test('API: team activity log', async () => {
  await withServer(async (call) => {
    await call('/api/match', 'POST', { idea: 'A marketplace connecting farmers directly with buyers to sell fresh produce' });
    const body = { candidateId: 'C003', roleId: 'domain_expert_agriculture' };
    await call('/api/decisions', 'POST', { ...body, decision: 'accepted' });
    const created = await call('/api/requests', 'POST', { ...body, confirm: true });
    const id = created.json.request.id;
    await call(`/api/requests/${id}/simulate-response`, 'POST', { outcome: 'accepted' });
    await call(`/api/requests/${id}/add-to-team`, 'POST');
    await call(`/api/requests/${id}/remove-from-team`, 'POST');
    const response = await call('/api/team/activity');
    assert.equal(response.status, 200);
    assert.equal(response.json.simulated, true);
    assert.deepEqual(response.json.activity.map((a) => a.type), ['request_sent', 'candidate_accepted', 'added_to_team', 'removed_from_team']);
    await call('/api/session/reset', 'POST');
    assert.deepEqual((await call('/api/team/activity')).json.activity, []);
  });
});
