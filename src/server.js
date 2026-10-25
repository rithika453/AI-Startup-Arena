'use strict';
/**
 * Standalone HTTP server: JSON API + static founder UI. Node built-ins only (no framework).
 * One in-memory CollaborationStore per server process = one founder session (prototype).
 *
 *   GET  /api/health
 *   GET  /api/candidates, /api/candidates/:id        (DEMO profiles)
 *   GET  /api/domains
 *   POST /api/analyze          { idea, founderSkills? }
 *   POST /api/match            { idea, founderSkills?, scoringConfig? }
 *   POST /api/decisions        { candidateId, roleId, decision: "accepted"|"ignored" }
 *   GET  /api/decisions
 *   POST /api/requests         { candidateId, roleId, message, confirm: true }   (SIMULATED)
 *   GET  /api/requests
 *   POST /api/requests/:id/simulate-response   { outcome: "accepted"|"rejected" } (DEMO ONLY)
 *   POST /api/requests/:id/add-to-team
 *   GET  /api/team
 *   POST /api/session/reset
 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { runTeamMatching, analyzeIdea } = require('./pipeline');
const { CollaborationStore, StoreError } = require('./collaboration/collaborationStore');
const { listDomains } = require('./domains/registry');
const demoCandidates = require('./data/demoCandidates');

const UI_DIR = path.resolve(__dirname, '../ui');
const STATIC = { '/': 'index.html', '/index.html': 'index.html', '/app.js': 'app.js', '/styles.css': 'styles.css' };
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
const MAX_BODY = 100 * 1024;
const HTTP_FOR = { NOT_FOUND: 404, NOT_SUGGESTED: 404, DUPLICATE_REQUEST: 409, INVALID_TRANSITION: 409, REQUEST_EXISTS: 409, ALREADY_IN_TEAM: 409 };

function send(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(data);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    let tooLarge = false;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { tooLarge = true; chunks.length = 0; return; } // keep draining, discard, reply 413 at the end
      chunks.push(c);
    });
    req.on('end', () => {
      if (tooLarge) return reject(Object.assign(new Error('Request body too large.'), { status: 413 }));
      if (size === 0) return resolve({});
      try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('shape');
        resolve(parsed);
      } catch { reject(Object.assign(new Error('Body must be a valid JSON object.'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}

function createServer({ store = new CollaborationStore() } = {}) {
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      const p = url.pathname;

      if (req.method === 'GET' && STATIC[p]) {
        const file = path.join(UI_DIR, STATIC[p]);
        const body = fs.readFileSync(file);
        res.writeHead(200, { 'Content-Type': MIME[path.extname(file)], 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
        return res.end(body);
      }

      if (req.method === 'GET' && p === '/api/health') return send(res, 200, { ok: true, module: 'team-matching', engine: 'rule-based', demoData: true });
      if (req.method === 'GET' && p === '/api/domains') return send(res, 200, { ok: true, domains: listDomains().map((d) => ({ id: d.id, name: d.name })) });
      if (req.method === 'GET' && p === '/api/candidates') return send(res, 200, { ok: true, demo: true, candidates: demoCandidates });
      let m = p.match(/^\/api\/candidates\/([^/]+)$/);
      if (req.method === 'GET' && m) {
        const c = demoCandidates.find((x) => x.id === decodeURIComponent(m[1]));
        return c ? send(res, 200, { ok: true, demo: true, candidate: c }) : send(res, 404, { ok: false, error: 'Candidate not found.' });
      }

      if (req.method === 'POST' && p === '/api/analyze') {
        const body = await readJson(req);
        const r = analyzeIdea(body);
        return send(res, r.ok ? 200 : 400, r);
      }
      if (req.method === 'POST' && p === '/api/match') {
        const body = await readJson(req);
        // The API always uses the demo pool; caller-supplied pools are for in-process integration.
        const r = runTeamMatching({ idea: body.idea, founderSkills: body.founderSkills, scoringConfig: body.scoringConfig });
        if (!r.ok) return send(res, 400, r);
        store.setSuggestions(r);
        return send(res, 200, r);
      }

      if (req.method === 'GET' && p === '/api/decisions') return send(res, 200, { ok: true, decisions: store.getDecisions() });
      if (req.method === 'POST' && p === '/api/decisions') {
        const b = await readJson(req);
        return send(res, 200, { ok: true, decision: store.decide(b.candidateId, b.roleId, b.decision) });
      }
      if (req.method === 'GET' && p === '/api/requests') return send(res, 200, { ok: true, simulated: true, requests: store.listRequests(url.searchParams.get('status') || undefined), summary: store.summary() });
      if (req.method === 'POST' && p === '/api/requests') {
        const b = await readJson(req);
        return send(res, 201, { ok: true, simulated: true, request: store.sendRequest(b) });
      }
      m = p.match(/^\/api\/requests\/([^/]+)\/(simulate-response|add-to-team)$/);
      if (req.method === 'POST' && m) {
        const id = decodeURIComponent(m[1]);
        if (m[2] === 'simulate-response') {
          const b = await readJson(req);
          return send(res, 200, { ok: true, simulated: true, request: store.simulateCandidateResponse(id, b.outcome) });
        }
        return send(res, 200, { ok: true, member: store.addToTeam(id) });
      }
      if (req.method === 'GET' && p === '/api/team') return send(res, 200, { ok: true, team: store.getTeam() });
      if (req.method === 'POST' && p === '/api/session/reset') { store.reset(); return send(res, 200, { ok: true }); }

      return send(res, 404, { ok: false, error: 'Not found.' });
    } catch (err) {
      if (err instanceof StoreError) return send(res, HTTP_FOR[err.code] || 400, { ok: false, code: err.code, error: err.message });
      if (err && err.status) return send(res, err.status, { ok: false, error: err.message });
      console.error(err);
      return send(res, 500, { ok: false, error: 'Internal error.' });
    }
  });
}

if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  createServer().listen(port, '127.0.0.1', () => {
    console.log(`Team Matching (DEMO, rule-based) running at http://localhost:${port}`);
  });
}

module.exports = { createServer };
