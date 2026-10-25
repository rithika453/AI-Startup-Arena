# Integration guide - Team Matching module

How the main AI Startup Arena app can connect to this module once the other members' modules are ready. Nothing here requires changes to other members' files.

## 1. Copy-in and dependencies

- Place the `team-matching/` folder at the repo root, **next to** `skill-matching/`. The adapter resolves `../../../skill-matching/skillMatching.js` from `src/legacy/`; override with `TEAM_MATCHING_LEGACY_PATH=/abs/path/skillMatching.js` if the layout differs. If the file is missing the module falls back to an identical local implementation (`skillMatcherSource: "fallback"` in results).
- Runtime dependencies: **none** (Node >= 18 built-ins only). CommonJS (`require`).
- Do **not** edit `skill-matching/skillMatching.js`. It is only read. (If you later want to `require` it directly, add `module.exports = { calculateMatch }` guarded by `if (require.main === module)` around the demo code - optional, not needed by this module.)

## 2. In-process API (recommended)

```js
const tm = require('./team-matching/src');

// Steps 1-3 only (no candidates needed)
const analysis = tm.analyzeIdea({ idea, founderSkills });

// Full pipeline
const result = tm.runTeamMatching({
  idea,                 // string, 15-2000 chars, required
  founderSkills,        // string[] optional - roles you already cover are not flagged as gaps
  candidates,           // optional array of candidate profiles; omit to use DEMO profiles
  scoringConfig,        // optional overrides, see src/config/scoring.js
});
if (!result.ok) { /* result.errors: string[] - show to the founder */ }

// Founder actions (one store per founder session; swap for a DB-backed class with the same methods)
const store = new tm.CollaborationStore();          // optional { founderId, startupId } defaults
store.setSuggestions(result, { founderId, startupId }); // context optional; defaults FOUNDER-DEMO / STARTUP-DEMO
store.decide(candidateId, roleId, 'accepted' | 'ignored');
store.sendRequest({ candidateId, roleId, message?, confirm: true, founderId?, startupId? }); // SIMULATED Pending request; message optional (10-1000 chars)
store.simulateCandidateResponse(requestId, 'accepted' | 'rejected');  // DEMO ONLY - replace with real replies
store.addToTeam(requestId);                                           // founder action, Accepted requests only
store.listRequests(status?, { candidateId?, startupId?, founderId? }); // status: Pending|Accepted|Rejected|all (case-insensitive)
store.getRequest(requestId), store.hasActiveRequest(candidateId, roleId), store.getTeam(), store.summary();
```

Request record: `id, founderId, startupId, candidateId, candidateName, roleId, roleTitle, message, messageIsDefault, status, simulated, createdAt, updatedAt, respondedAt, responseSimulated?, history[{status, at, by}]`.
IDs must be strings of up to 64 letters, digits, `-`, `_`, `.` or `:`. One Pending/Accepted request is allowed per founder + startup + candidate + role; a Rejected request may be re-sent.

`StoreError` has a `.code`: `MISSING_FIELD, INVALID_ID, INVALID_STATUS, NOT_SUGGESTED, NOT_ACCEPTED, CONSENT_REQUIRED, INVALID_MESSAGE, DUPLICATE_REQUEST, REQUEST_EXISTS, INVALID_TRANSITION, INVALID_DECISION, INVALID_OUTCOME, NOT_FOUND, ALREADY_IN_TEAM, INVALID_RESULT`.

### Input: candidate profile

```json
{ "id": "C001", "name": "string", "technicalSkills": ["string"], "businessExpertise": ["string"],
  "industries": ["agriculture"], "interests": ["string"], "preferredRoles": ["string"],
  "availability": "Full-time | Part-time | Weekends | Unavailable",
  "projects": [{ "title": "", "summary": "", "tags": ["string"] }] }
```

`id` and `name` are required; invalid/duplicate candidates are skipped with a warning (never thrown). `industries` should use domain ids (see `listDomains()`) or domain names. All text is matched case-insensitively and de-duplicated.

### Output: `runTeamMatching()` (when `ok: true`)

| Field | Content |
|---|---|
| `idea` | cleaned idea text |
| `domainAnalysis` | `{ classified, primary{id,name,score}, secondary[], subdomain, targetCustomers{text,source}, problemSolved{text,source}, confidence, signals[], notes[] }` |
| `businessModel` | `{ classified, primary{id,label}, types[], isCombination, label, signals, notes[] }` |
| `requirements[]` | `{ roleId, title, category: technical|business|domain, priority: critical|high|medium, requiredExpertise[], reasons[], founderCoverage, coveredByFounder }` |
| `skillGaps` | `{ byCategory{technical,business,domain}, missingExpertise[], founderSkillsProvided }` |
| `matching.byRole[]` | `{ roleId, title, priority, coverage: strong|partial|none, candidates[] }`; each candidate: `{ rank, candidateId, name, score, availability, matchedRequirements[], missingRequirements[], breakdown{expertise,preferredRole,industry,interests,availability,projects -> {weight,fraction,points,detail}}, explanation{summary,strengths[],gaps[],caution} }` |
| `matching.overall[]` | each suitable candidate once, with their best role and score |
| `missingRoles[]` | `{ roleId, title, priority, important, requiredExpertise[], suggestion }` for roles with no suitable candidate |
| `warnings[]`, `disclaimers[]` | show to the founder |
| `candidateSource`, `engine` | `engine.aiModelInUse` is `false` for this version |

On failure: `{ ok: false, errors: string[] }`. Core functions do not throw on bad input.

## 3. HTTP API (if the main app prefers a service)

`npm start` (env `PORT`). JSON in/out. Errors: `{ ok:false, error, code? }` with 400 (bad input), 404, 409 (conflict/invalid transition), 413 (body > 100 KB).

| Method + path | Body | Notes |
|---|---|---|
| `POST /api/analyze` | `{ idea, founderSkills? }` | steps 1-3 |
| `POST /api/match` | `{ idea, founderSkills?, scoringConfig?, founderId?, startupId? }` | full result; also registers suggestions in the session store. Uses the DEMO pool. |
| `GET /api/candidates`, `/api/candidates/:id` | | DEMO profiles |
| `POST /api/decisions` / `GET /api/decisions` | `{ candidateId, roleId, decision }` | accepted / ignored |
| `POST /api/requests` | `{ candidateId, roleId, message?, confirm: true, founderId?, startupId? }` | simulated; 201; response includes a `message` |
| `GET /api/requests` (filters: `status`, `candidateId`, `startupId`, `founderId`) | | history + `summary`, `count`, `context`; bad status gives 400 `INVALID_STATUS` |
| `GET /api/requests/:id` | | one request with its history; 404 if unknown |
| `POST /api/requests/:id/simulate-response` | `{ outcome }` | DEMO only |
| `POST /api/requests/:id/add-to-team`, `GET /api/team` | | founder action |
| `POST /api/session/reset`, `GET /api/health`, `GET /api/domains` | | |

The HTTP server has **no authentication** and one session per process; put it behind the main app's auth/session layer before real use.

## 4. Connection points to replace later

| Seam | Today | Replace with |
|---|---|---|
| Candidate pool | `src/data/demoCandidates.js` | Pass `candidates` from the main app's user/profile store (map fields to the schema above). |
| Collaboration persistence + messaging | in-memory `CollaborationStore`, simulated replies | A DB-backed class with the same methods; real notifications that require the candidate's own consent to respond. Keep the founder-consent checks (`confirm`, accepted-first). |
| Agents | rule-based modules in `src/agents/` | AI/API-backed agents with the same `run()` contract, passed via `runTeamMatching(input, { agents: { domain, businessModel, requirements, matching, explanation } })`. Set `engine.aiModelInUse` only when that is true. |
| Scoring | `src/config/scoring.js` defaults | `scoringConfig` per request or admin settings. |
| Domains / roles | built-in registries | `registerDomain()` / `registerRole()` at startup, e.g. from a CMS. |

## 5. Things the main app must keep doing

- Show the `disclaimers` and label demo profiles / simulated actions until real data and messaging exist.
- Never auto-add a candidate or send a real message without the founder's explicit action and the candidate's consent.
- Treat match scores as decision support only.
- Candidate profiles are personal data once real: add access control, consent for being listed, and retention rules in the main app.

## 6. Verifying after integration

```bash
cd team-matching && npm test      # module still green in the merged tree
```
