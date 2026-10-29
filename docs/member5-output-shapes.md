# Member 5: Output Shapes

All functions are exported from `server/services/validation/index.js`.
They are pure functions: JSON in, JSON out. No database or network calls.

```js
const V = require("../services/validation");
```

| Function | Used by | Purpose |
|---|---|---|
| `generateTasks(evaluation)` | M2 saves, M1 task tracker | Weakness to action tasks |
| `validateEvidence(evidence, task)` | M2, M3 stores result | valid / weak / rejected |
| `compareEvaluations(v1, v2)` | M1 Compare page, M3 DecisionHistory | Before/after |
| `buildReceipt(comparison, evidenceList, tasks)` | M1 receipt card | Why the verdict changed |
| `findContradictions(v1, v2, evidenceList)` | M1 timeline | Dated contradiction list |
| `expiryReport(evidenceList)` | M1 badges, M6 readiness | fresh / expiring / expired |
| `computeExpiresAt(type)` | M2/M3 when saving evidence | Expiry date for new evidence |

## 1. generateTasks(evaluation)

Input: an Evaluation with `agents[].weaknesses[]` (each weakness needs a stable `id`).
Returns an array, high priority first (priority 1 = high, 2 = medium, 3 = low).
M2/M3 should add `idea` and `evaluation` ids before saving.

First item of the result:
```json
{
  "weaknessId": "w1",
  "agent": "market",
  "title": "No proof of customer demand",
  "action": "Interview 5 target customers and record their answers",
  "severity": "high",
  "priority": 1,
  "expectedEvidence": "link | text | file",
  "status": "todo"
}
```

## 2. validateEvidence(evidence, task)

Input: evidence `{ type: "text" | "link" | "file", content }` and its task `{ title, action }`.
Result for a good text item:
```json
{
  "status": "valid",
  "reasons": [],
  "confidence": 1
}
```

Result for an invalid link:
```json
{
  "status": "rejected",
  "reasons": [
    "Not a valid link (must start with http:// or https://)"
  ],
  "confidence": 0.1
}
```

Rules: **valid** = no problems, **weak** = exactly one problem, **rejected** = empty, invalid link, or two or more problems.
M3: store this object as `Evidence.validation`.

## 3. compareEvaluations(v1, v2)

Returns `null` if either version is missing.
```json
{
  "versionBefore": 1,
  "versionAfter": 2,
  "scoreBefore": 5.2,
  "scoreAfter": 6.5,
  "scoreDelta": 1.3,
  "verdictBefore": "Risky",
  "verdictAfter": "Promising",
  "verdictChanged": true,
  "perAgent": [
    {
      "agent": "market",
      "before": 5,
      "after": 7,
      "delta": 2
    },
    {
      "agent": "finance",
      "before": 6,
      "after": 6,
      "delta": 0
    },
    {
      "agent": "marketing",
      "before": 5,
      "after": 7,
      "delta": 2
    },
    {
      "agent": "risk",
      "before": 5,
      "after": 6,
      "delta": 1
    }
  ],
  "weaknessesResolved": [
    {
      "id": "w1",
      "agent": "market",
      "text": "No proof of customer demand",
      "severity": "high"
    }
  ],
  "weaknessesRemaining": [
    {
      "id": "w2",
      "agent": "finance",
      "text": "No revenue model defined",
      "severity": "medium"
    },
    {
      "id": "w3",
      "agent": "marketing",
      "text": "No acquisition channel tested",
      "severity": "medium"
    },
    {
      "id": "w4",
      "agent": "risk",
      "text": "Strong competitors already exist",
      "severity": "high"
    }
  ],
  "newWeaknesses": [
    {
      "id": "w6",
      "agent": "market",
      "text": "Demand limited to a niche segment",
      "severity": "medium"
    },
    {
      "id": "w5",
      "agent": "finance",
      "text": "Pricing not validated with customers",
      "severity": "low"
    }
  ]
}
```

## 4. buildReceipt(comparison, evidenceList, tasks)

Returns `null` if the comparison is null. `note` is set when no evidence was submitted.
Rejected evidence is never used as proof.
```json
{
  "headline": "Verdict changed: Risky → Promising",
  "scoreChange": "+1.3",
  "scoreBefore": 5.2,
  "scoreAfter": 6.5,
  "because": [
    {
      "weaknessId": "w1",
      "weakness": "No proof of customer demand",
      "agent": "market",
      "evidenceId": "e1",
      "evidenceStatus": "valid",
      "effect": "\"No proof of customer demand\" was resolved by submitted evidence"
    }
  ],
  "unresolved": [
    "No revenue model defined",
    "No acquisition channel tested",
    "Strong competitors already exist",
    "Demand limited to a niche segment",
    "Pricing not validated with customers"
  ],
  "newIssues": [
    "Demand limited to a niche segment",
    "Pricing not validated with customers"
  ],
  "evidenceSummary": {
    "total": 5,
    "valid": 2,
    "weak": 1,
    "rejected": 2
  },
  "note": null,
  "date": "2026-10-26T00:00:00.000Z"
}
```

## 5. findContradictions(v1, v2, evidenceList)

Returns a list sorted oldest first (empty list if v2 is missing).
`type` is `claim_reversed` or `evidence_contradicts`.
```json
[
  {
    "date": "2026-10-26T00:00:00.000Z",
    "type": "claim_reversed",
    "agent": "market",
    "oldClaim": "Large target audience",
    "newFinding": "Demand limited to a niche segment",
    "evidenceId": null
  }
]
```

## 6. expiryReport(evidenceList)

`status`: fresh (green), expiring (amber, 14 days or fewer left), expired (red).
M6: use `usableCount` (non-expired evidence) for the readiness score.
```json
{
  "items": [
    {
      "evidenceId": "e1",
      "status": "fresh",
      "daysLeft": 49
    },
    {
      "evidenceId": "e2",
      "status": "expired",
      "daysLeft": -25
    },
    {
      "evidenceId": "e3",
      "status": "fresh",
      "daysLeft": 52
    },
    {
      "evidenceId": "e4",
      "status": "fresh",
      "daysLeft": 84
    },
    {
      "evidenceId": "e5",
      "status": "expiring",
      "daysLeft": 7
    }
  ],
  "fresh": 3,
  "expiring": 1,
  "expired": 1,
  "usableCount": 4
}
```

## 7. computeExpiresAt(type)

Returns an ISO date string: text = 60 days, link = 90 days, file = 90 days.
```json
"2026-12-25T00:00:00.000Z"
```

## Field names the team must match

- Evaluation: `overallScore`, `verdict`, `version`, `agents[].agent`, `agents[].score`, `agents[].strengths[]`, `agents[].weaknesses[] { id, text, severity }`
- Weakness `id` values must stay the same between v1 and v2 (M4)
- Evidence: `_id`, `type`, `content`, `weaknessId` (or `task`), `createdAt`, `expiresAt`, `validation { status, reasons, confidence }` (M3)
- Task: `weaknessId`, `title`, `action`, `priority`, `status`
