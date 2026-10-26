// Run with:  node server\services\validation\test.js
const { generateTasks } = require("./taskGenerator");
const { validateEvidence } = require("./evidenceValidator");
const { compareEvaluations } = require("./compareEngine");
const { buildReceipt } = require("./receiptBuilder");
const v1 = require("./samples/sample-v1.json");
const v2 = require("./samples/sample-v2.json");
const evidenceList = require("./samples/sample-evidence.json");

// ---------- Test 1: task generator ----------
const tasks = generateTasks(v1);
console.log("=== TASKS ===");
console.log("Number of tasks:", tasks.length);
console.table(tasks.map(t => ({
  weaknessId: t.weaknessId,
  agent: t.agent,
  priority: t.priority,
  title: t.title,
})));

// ---------- Test 2: evidence validator ----------
console.log("\n=== EVIDENCE VALIDATION ===");
const rows = evidenceList.map(e => {
  const task = tasks.find(t => t.weaknessId === e.weaknessId);
  const r = validateEvidence(e, task);
  return {
    id: e._id,
    type: e.type,
    status: r.status,
    confidence: r.confidence,
    reasons: r.reasons.join("; ") || "-",
  };
});
console.table(rows);

// ---------- Test 3: comparison engine ----------
console.log("\n=== COMPARISON v1 vs v2 ===");
const c = compareEvaluations(v1, v2);
console.log("Score:", c.scoreBefore, "->", c.scoreAfter, "(change:", c.scoreDelta + ")");
console.log("Verdict:", c.verdictBefore, "->", c.verdictAfter, "| changed:", c.verdictChanged);
console.log("\nPer agent:");
console.table(c.perAgent);
console.log("Resolved weaknesses:", c.weaknessesResolved.map(w => w.id + " " + w.text));
console.log("Still remaining:   ", c.weaknessesRemaining.map(w => w.id));
console.log("New weaknesses:    ", c.newWeaknesses.map(w => w.id + " " + w.text));

// Edge case: missing v2 must not crash
console.log("\nMissing v2 returns:", compareEvaluations(v1, null));

// ---------- Test 4: decision change receipt ----------
console.log("\n=== DECISION CHANGE RECEIPT ===");
const receipt = buildReceipt(c, evidenceList, tasks);
console.log(JSON.stringify(receipt, null, 2));

// Edge cases
console.log("\n=== RECEIPT EDGE CASES ===");
const noEvidence = buildReceipt(c, [], tasks);
console.log("No evidence note:", noEvidence.note);
const same = buildReceipt(compareEvaluations(v1, v1), evidenceList, tasks);
console.log("Same version headline:", same.headline, "| score change:", same.scoreChange);
console.log("Null comparison returns:", buildReceipt(null, evidenceList, tasks));
