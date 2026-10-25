'use strict';
// Founder UI for the Team Matching module. Builds DOM with textContent only (no innerHTML) to avoid XSS.
const EXAMPLES = [
  ['Agri marketplace', 'A marketplace connecting farmers directly with buyers to sell fresh produce, with delivery logistics'],
  ['AI SaaS', 'An AI-powered SaaS platform that automates customer support using LLM chatbots for e-commerce businesses'],
  ['Physical product', 'A smart reusable water bottle that tracks hydration, manufactured and sold to fitness consumers'],
  ['Service business', 'A digital marketing agency helping small local restaurants grow with social media management and SEO services'],
  ['Telemedicine app', 'A mobile app for telemedicine consultations between rural patients and doctors'],
];
const $ = (id) => document.getElementById(id);
let result = null;
let decisions = {};
let pendingRequest = null;

function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== false) el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid !== null && kid !== undefined && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  return el;
}
const pill = (text, cls = '') => h('span', { class: `pill ${cls}` }, text);

async function api(path, method = 'GET', body) {
  const res = await fetch(path, { method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({ ok: false, error: 'Unexpected server response.' }));
  if (!res.ok || data.ok === false) throw new Error(data.error || (data.errors || []).join(' ') || 'Request failed.');
  return data;
}
function showError(msg) { const e = $('error'); e.textContent = msg || ''; e.hidden = !msg; }

async function analyze() {
  showError('');
  const btn = $('analyze'); btn.disabled = true;
  try {
    const founderSkills = $('founderSkills').value.split(',').map((s) => s.trim()).filter(Boolean);
    result = await api('/api/match', 'POST', { idea: $('idea').value, founderSkills });
    decisions = {};
    $('results').hidden = false;
    renderAll();
    await refreshRequests();
    $('step-analysis').scrollIntoView({ behavior: 'smooth' });
  } catch (e) { showError(e.message); $('results').hidden = true; }
  finally { btn.disabled = false; }
}

function renderAll() { renderAnalysis(); renderRoles(); renderCandidates(); }

function renderAnalysis() {
  const d = result.domainAnalysis, b = result.businessModel;
  const rows = [];
  rows.push(h('dt', {}, 'Primary domain'), h('dd', {}, d.classified ? `${d.primary.name} (confidence ${Math.round(d.confidence * 100)}%)` : 'Not detected'));
  if (d.subdomain) rows.push(h('dt', {}, 'Subdomain'), h('dd', {}, d.subdomain.name));
  if (d.secondary && d.secondary.length) rows.push(h('dt', {}, 'Other domains mentioned'), h('dd', {}, d.secondary.map((s) => s.name).join(', ')));
  rows.push(h('dt', {}, 'Business type'), h('dd', {}, b.label + (b.isCombination ? ' (combination)' : '')));
  rows.push(h('dt', {}, 'Target customers'), h('dd', {}, `${d.targetCustomers.text || 'Unknown'} `, pill(d.targetCustomers.source)));
  rows.push(h('dt', {}, 'Problem being solved'), h('dd', {}, `${d.problemSolved.text || 'Unknown'} `, pill(d.problemSolved.source)));
  const g = result.skillGaps.byCategory;
  rows.push(h('dt', {}, 'Skill gaps (roles you still need)'), h('dd', {},
    ['technical', 'business', 'domain'].map((k) => g[k].length ? h('div', {}, `${k[0].toUpperCase() + k.slice(1)}: ${g[k].join(', ')}`) : null)));
  const box = $('analysis'); box.replaceChildren(h('dl', {}, rows));
  (result.warnings || []).forEach((w) => box.append(h('p', { class: 'hint' }, `Note: ${w}`)));
  box.append(h('p', { class: 'hint' }, `Engine: ${result.engine.note}`));
}

function renderRoles() {
  $('roles').replaceChildren(...result.requirements.map((r) => h('div', { class: 'role' },
    h('h4', {}, r.title), pill(r.priority, r.priority), pill(r.category),
    r.coveredByFounder ? pill('covered by you', 'match') : null,
    h('div', { class: 'hint' }, r.reasons.join('; ')),
    h('div', {}, r.requiredExpertise.map((t) => pill(t))))));
}

function renderCandidates() {
  $('disclaimers').textContent = result.disclaimers.join(' ');
  const missing = $('missing');
  missing.replaceChildren(...result.missingRoles.map((m) => h('div', { class: 'alert' },
    h('strong', {}, `${m.important ? 'Important role' : 'Role'} with no suitable candidate: ${m.title}. `), m.suggestion)));
  const wrap = $('candidates');
  wrap.replaceChildren(...result.matching.byRole.map((role) => h('div', {},
    h('h3', {}, `${role.title} `, pill(role.priority, role.priority), pill(`${role.coverage} coverage`)),
    role.candidates.length ? role.candidates.map((c) => candidateCard(role, c)) : h('p', { class: 'hint' }, role.coveredByFounder ? 'You already cover this role.' : 'No suitable candidate in the demo pool.'))));
}

function candidateCard(role, c) {
  const key = `${c.candidateId}|${role.roleId}`;
  const state = decisions[key];
  const e = c.explanation;
  const bd = Object.entries(c.breakdown);
  return h('div', { class: `cand ${state || ''}` },
    h('div', {}, h('strong', {}, `#${c.rank} ${c.name}`), ' ', pill('DEMO profile', ''), pill(c.availability), state ? pill(state === 'accepted' ? 'accepted by you' : 'ignored', state === 'accepted' ? 'match' : '') : null),
    h('div', {}, `Match score ${c.score}/100`), h('div', { class: 'bar', role: 'img', 'aria-label': `score ${c.score} of 100` }, h('span', { style: `width:${Math.min(100, c.score)}%` })),
    h('div', {}, c.matchedRequirements.map((t) => pill(t, 'match')), c.missingRequirements.map((t) => pill(t, 'miss'))),
    h('p', {}, e.summary),
    h('details', {}, h('summary', {}, 'Why this score'),
      h('ul', {}, e.strengths.map((s) => h('li', {}, s))),
      e.gaps.length ? h('ul', {}, e.gaps.map((s) => h('li', {}, `Gap: ${s}`))) : null,
      h('table', {}, h('tr', {}, h('th', {}, 'Factor'), h('th', {}, 'Points'), h('th', {}, 'Detail')),
        bd.map(([k, v]) => h('tr', {}, h('td', {}, k), h('td', {}, `${v.points}/${v.weight}`), h('td', {}, v.detail)))),
      h('p', { class: 'hint' }, e.caution)),
    h('div', { class: 'row wrap' },
      h('button', { onclick: () => showProfile(c.candidateId) }, 'View profile'),
      h('button', { onclick: () => decide(c, role, 'accepted'), disabled: state === 'accepted' }, 'Accept suggestion'),
      h('button', { onclick: () => decide(c, role, 'ignored'), disabled: state === 'ignored' }, 'Ignore'),
      h('button', { class: 'primary', disabled: state !== 'accepted', title: state === 'accepted' ? '' : 'Accept the suggestion first', onclick: () => openRequest(c, role) }, 'Send collaboration request (simulated)')));
}

async function decide(c, role, decision) {
  try {
    await api('/api/decisions', 'POST', { candidateId: c.candidateId, roleId: role.roleId, decision });
    decisions[`${c.candidateId}|${role.roleId}`] = decision;
    renderCandidates();
  } catch (e) { showError(e.message); }
}

async function showProfile(id) {
  try {
    const { candidate: p } = await api(`/api/candidates/${encodeURIComponent(id)}`);
    const list = (a) => (a && a.length ? a.join(', ') : 'None listed');
    $('profileBody').replaceChildren(h('h3', {}, `${p.name} `, pill('DEMO profile - fictional')),
      h('dl', {},
        h('dt', {}, 'Technical skills'), h('dd', {}, list(p.technicalSkills)),
        h('dt', {}, 'Business & domain expertise'), h('dd', {}, list(p.businessExpertise)),
        h('dt', {}, 'Industry experience'), h('dd', {}, list(p.industries)),
        h('dt', {}, 'Interests'), h('dd', {}, list(p.interests)),
        h('dt', {}, 'Preferred roles'), h('dd', {}, list(p.preferredRoles)),
        h('dt', {}, 'Availability'), h('dd', {}, p.availability || 'Not specified'),
        h('dt', {}, 'Relevant projects'), h('dd', {}, (p.projects || []).map((x) => h('div', {}, `${x.title}: ${x.summary}`)))));
    $('profile').showModal();
  } catch (e) { showError(e.message); }
}

function openRequest(c, role) {
  pendingRequest = { candidateId: c.candidateId, roleId: role.roleId };
  $('reqTitle').textContent = `Request ${c.name} as ${role.title}`;
  $('reqMessage').value = `Hi ${c.name.split(' ')[0]}, I'm building a startup and your background looks like a strong fit for the ${role.title} role. Would you be open to a short chat about collaborating?`;
  $('reqConfirm').checked = false; $('reqError').hidden = true;
  $('requestDialog').showModal();
}

async function submitRequest(ev) {
  ev.preventDefault();
  try {
    await api('/api/requests', 'POST', { ...pendingRequest, message: $('reqMessage').value, confirm: $('reqConfirm').checked });
    $('requestDialog').close();
    await refreshRequests();
    $('step-requests').scrollIntoView({ behavior: 'smooth' });
  } catch (e) { $('reqError').textContent = e.message; $('reqError').hidden = false; }
}

async function refreshRequests() {
  const [{ requests, summary }, { team }] = await Promise.all([api('/api/requests'), api('/api/team')]);
  const box = $('requests');
  if (!requests.length) box.replaceChildren(h('p', { class: 'hint' }, 'No requests yet. Accept a suggestion, then create a simulated request.'));
  else box.replaceChildren(
    h('p', { class: 'hint' }, `Pending ${summary.pending} - Accepted ${summary.accepted} - Rejected ${summary.rejected}. Candidate replies below are simulated for the demo.`),
    h('table', {}, h('tr', {}, ['ID', 'Candidate', 'Role', 'Status', 'Actions'].map((t) => h('th', {}, t))),
      requests.map((r) => h('tr', {},
        h('td', {}, r.id), h('td', {}, r.candidateName), h('td', {}, r.roleTitle), h('td', {}, pill(r.status, r.status)),
        h('td', {},
          r.status === 'Pending' ? [h('button', { onclick: () => simulate(r.id, 'accepted') }, 'Demo: candidate accepts'), ' ', h('button', { onclick: () => simulate(r.id, 'rejected') }, 'Demo: candidate declines')] : null,
          r.status === 'Accepted' && !team.some((t) => t.requestId === r.id) ? h('button', { class: 'primary', onclick: () => addToTeam(r.id) }, 'Add to my team') : null)))));
  $('team').replaceChildren(team.length ? h('ul', {}, team.map((t) => h('li', {}, `${t.name} - ${t.roleTitle}`))) : h('p', { class: 'hint' }, 'No one on your team yet. Candidates are only added when you choose.'));
}
async function simulate(id, outcome) { try { await api(`/api/requests/${id}/simulate-response`, 'POST', { outcome }); await refreshRequests(); } catch (e) { showError(e.message); } }
async function addToTeam(id) { try { await api(`/api/requests/${id}/add-to-team`, 'POST'); await refreshRequests(); } catch (e) { showError(e.message); } }

async function resetAll() {
  await api('/api/session/reset', 'POST');
  result = null; decisions = {}; $('results').hidden = true; $('idea').value = ''; $('founderSkills').value = ''; showError('');
}

$('examples').replaceChildren(...EXAMPLES.map(([label, text]) => h('button', { type: 'button', onclick: () => { $('idea').value = text; } }, label)));
$('analyze').addEventListener('click', analyze);
$('reset').addEventListener('click', resetAll);
$('requestForm').addEventListener('submit', submitRequest);
$('reqCancel').addEventListener('click', () => $('requestDialog').close());
