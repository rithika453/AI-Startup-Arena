// Run from the server/services/validation folder:  node taskTracker.test.js
const assert = require("assert");
const { syncTasks, addManualTask, updateTask, canAccessStartup, unresolvedTasks } = require("./taskTracker");

const evaluation = { agents: [
  { agent: "market", weaknesses: [{ id: "w1", text: "No proof of customer demand", severity: "high" }] },
  { agent: "finance", weaknesses: [{ id: "w2", text: "No revenue model defined", severity: "medium" }] },
  { agent: "marketing", weaknesses: [{ id: "w3", text: "No acquisition channel tested", severity: "medium" }] },
  { agent: "risk", weaknesses: [{ id: "w4", text: "Strong competitors already exist", severity: "high" }] },
]};
const ctx = { startupId: "idea1", userId: "userA" };

// 1. creates 4 tasks
let r = syncTasks([], evaluation, ctx);
assert.strictEqual(r.created.length, 4);
assert.strictEqual(r.created[0].priority, "High");
assert.strictEqual(r.created[0].status, "Pending");
assert.strictEqual(r.created[0].relatedWeakness, "No proof of customer demand");

// 2. running again creates no duplicates
let r2 = syncTasks(r.tasks, evaluation, ctx);
assert.strictEqual(r2.created.length, 0);
assert.strictEqual(r2.skipped, 4);

// 3. status + deadline update
let t = updateTask(r.tasks[0], { status: "In Progress", deadline: "2026-11-05" });
assert.ok(t.ok); assert.strictEqual(t.task.status, "In Progress");
assert.ok(t.task.deadline.startsWith("2026-11-05"));
assert.strictEqual(updateTask(r.tasks[0], { status: "Done" }).ok, false);
assert.strictEqual(updateTask(r.tasks[0], { deadline: "not a date" }).ok, false);

// 4. completing does NOT resolve the weakness
let done = updateTask(r.tasks[0], { status: "Completed" }).task;
assert.strictEqual(done.weaknessResolved, false);
assert.strictEqual(updateTask(done, { weaknessResolved: true }).ok, false);          // needs a note
assert.strictEqual(updateTask(r.tasks[1], { weaknessResolved: true, resolutionNote: "x" }).ok, false); // not completed
let resolved = updateTask(done, { weaknessResolved: true, resolutionNote: "Survey of 12 customers uploaded" });
assert.ok(resolved.ok && resolved.task.weaknessResolved === true);

// 5. after resolution, a new task for the same weakness is allowed again
const all = r.tasks.map((x) => (x.id === done.id ? resolved.task : x));
assert.strictEqual(syncTasks(all, evaluation, ctx).created.length, 1);
assert.strictEqual(unresolvedTasks(all).length, 3);

// 6. manual task + duplicate check + validation
assert.strictEqual(addManualTask(all, { title: "x" }, ctx).ok, false);
const m = addManualTask(all, { title: "Call 5 users", relatedWeakness: "Unverified pricing" }, ctx);
assert.ok(m.ok);
assert.strictEqual(addManualTask([...all, m.task], { title: "Again", relatedWeakness: "Unverified pricing" }, ctx).ok, false);

// 7. access control
assert.strictEqual(canAccessStartup("userA", "userA"), true);
assert.strictEqual(canAccessStartup("userA", "userB"), false);

// 8. empty / bad input
assert.strictEqual(syncTasks([], null, ctx).created.length, 0);

console.log("All Feature 3 tests passed");
