# Team Matching (AI Startup Arena - Member 6)

A standalone, startup-aware team-matching module. A founder enters a startup idea; the module detects the domain and business type, generates the roles and expertise that *this* startup needs, ranks matching candidates with transparent scores and explanations, flags roles nobody in the pool can fill, and lets the founder accept/ignore suggestions and create **simulated** collaboration requests.

## Honest status

- **Rule-based, not AI.** Domain/business-type detection, role generation, scoring and explanations are deterministic rules over data files. No AI model, API call or multi-agent runtime is running. The five "agents" are plain modules with a stable `run()` contract, ready to be swapped for AI-backed ones later. The UI and API say so.
- **Demo data.** The 20 candidate profiles in `src/data/demoCandidates.js` are fictional.
- **Simulated requests.** Nothing is sent to anyone. Candidate replies are simulated for the demo. State is in memory (lost on restart).
- **Scores are heuristics**, not a guarantee of suitability.
- No git commits or pushes have been made for this work.

## Run it

Requires Node 18+ (developed on Node 22). No dependencies, no `npm install` needed.

```bash
cd team-matching
npm test                 # 22 tests
npm start                # UI + API at http://localhost:3000   (PORT=4000 npm start to change)
npm run demo             # CLI demo with the default sample idea
node src/cli.js "A mobile app for telemedicine consultations between rural patients and doctors"
node docs/generate-sample-results.js   # regenerates docs/SAMPLE_RESULTS.md
```

## Layout and purpose of each file

| Path | Purpose |
|---|---|
| `src/index.js` | Public entry point for the main app (see `docs/INTEGRATION.md`). |
| `src/pipeline.js` | Orchestrates the five agents; `analyzeIdea()` (idea -> domain, type, roles) and `runTeamMatching()` (adds matching + explanations). Agents are injectable. |
| `src/agents/domainAnalysisAgent.js` | Domain + subdomain, target customers, problem (rule-based keyword scoring). |
| `src/agents/businessModelAgent.js` | Business type(s): physical product, digital product, service, SaaS, marketplace, mobile app, website, or a combination. |
| `src/agents/requirementGenerationAgent.js` | Startup-specific roles/expertise from domain + business type + idea signals (AI, analytics) + compliance sensitivity; skill gaps vs founder's own skills. |
| `src/agents/candidateMatchingAgent.js` | Scores and ranks candidates per role; missing-role detection; validates/dedupes candidates. |
| `src/agents/matchExplanationAgent.js` | Template-based strengths/gaps/caution text per match. |
| `src/domains/registry.js`, `builtin.js` | Domain registry (12 built-in domains) + `registerDomain()` to add one without touching engine code. |
| `src/roles/registry.js` | Role catalogue + `registerRole()`; domain-expert roles are generated per domain. |
| `src/data/businessTypes.js` | Business-type signal patterns. |
| `src/data/demoCandidates.js` | 20 fictional candidates (technical, business and domain experts; one unavailable). |
| `src/config/scoring.js` | All scoring weights/thresholds, with validation. |
| `src/lib/normalize.js` | Case-insensitive, de-duplicating, alias-aware normalisation and keyword counting. |
| `src/legacy/skillMatchingAdapter.js` | Reuses the existing `skill-matching/skillMatching.js` `calculateMatch` **without modifying it** (loads it in a `vm` sandbox; falls back to an identical local copy and reports `source: "fallback"`). |
| `src/collaboration/collaborationStore.js` | Founder-controlled accept/ignore -> request -> Pending/Accepted/Rejected -> add to team (in memory, simulated). |
| `src/server.js` | Node `http` server: JSON API + static UI. |
| `ui/index.html`, `app.js`, `styles.css` | Founder UI (no framework, no build step, DOM built with `textContent`). |
| `src/cli.js` | Terminal demo. |
| `tests/*.test.js` | `node:test` suites: matching, collaboration, HTTP API. |
| `docs/INTEGRATION.md`, `docs/SAMPLE_RESULTS.md` | Integration guide; generated sample output. |

## How the score works

`score = sum(weight_i x fraction_i) / sum(weights) x 100`, weights configurable in `src/config/scoring.js`:

| Factor | Default weight | Fraction |
|---|---|---|
| Expertise match | 45 | matched / required expertise terms, full marks at 50% matched |
| Preferred role | 15 | 1 if the role (or an alias) is in the candidate's preferred roles |
| Industry experience | 15 | 1 if the candidate has experience in the startup's domain |
| Interests | 10 | 1 if an interest overlaps the domain or role expertise |
| Availability | 10 | full-time 1, part-time 0.6, weekends 0.3, unavailable 0 |
| Project experience | 5 | 1 role-relevant project, 0.5 same-domain project |

A candidate is only **suitable** for a role if score >= 40 **and** at least one required expertise term matches **and** they are available - so availability or interests alone never produce a recommendation. Every breakdown is returned and shown in the UI under "Why this score".

## Adding a domain

```js
const { registerDomain } = require('./src');
registerDomain({
  id: 'space_tech', name: 'Space Technology', roleLabel: 'Space',
  keywords: ['satellite', 'orbit', 'rocket'],
  domainExpertise: ['aerospace engineering', 'orbital mechanics'],
  // optional: subdomains, targetCustomers, typicalProblem, extraRoles, complianceSensitive, impliedBusinessTypes
});
```

A domain-expert role ("Space domain expert") is generated automatically. For a permanent domain, add the object to `src/domains/builtin.js`.

## Known limitations

- Keyword rules can misclassify unusual wording; the UI labels inferred customers/problem as "inferred, please confirm", and low-confidence/unclassified ideas get a warning and only generic roles.
- Matching is on exact normalised terms plus a small alias list ("JS" = "javascript"); it does not understand synonyms beyond that.
- One in-memory founder session per server process; no auth, persistence or real messaging.
- The UI was written and syntax-checked but not exercised in a real browser during development; API and logic are covered by automated tests.
