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
