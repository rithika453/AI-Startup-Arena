// Run with:  node server\services\validation\test.js
const { generateTasks } = require("./taskGenerator");
const { validateEvidence } = require("./evidenceValidator");
const v1 = require("./samples/sample-v1.json");
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
