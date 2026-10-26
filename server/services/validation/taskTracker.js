// Feature 3 - Weakness-to-Action Task Tracker (plain JS, no database needed).
// Builds on taskGenerator.js (does not change it). M2 can save the returned tasks
// to the database and call these functions again when the user edits a task.
//
//   const { syncTasks, updateTask, addManualTask, canAccessStartup } = require("../services/validation");

const crypto = require("crypto");
const { generateTasks } = require("./taskGenerator");

const STATUSES = ["Pending", "In Progress", "Completed"];
const PRIORITIES = ["Low", "Medium", "High"];
const SEVERITY_TO_PRIORITY = { high: "High", medium: "Medium", low: "Low" };

// An issue is "open" until the founder confirms the weakness is resolved.
// (Completing the task alone does NOT close it.)
const isOpen = (t) => !t.weaknessResolved;
const keyOf = (startupId, weaknessId, text) => `${startupId}::${weaknessId || String(text).trim().toLowerCase()}`;

// Creates tasks from an AI evaluation. Skips weaknesses that already have an open task.
// existingTasks: tasks already saved for this startup (pass [] the first time)
// returns { tasks (all, old + new), created, skipped }
function syncTasks(existingTasks, evaluation, { startupId, userId, now = new Date() }) {
  if (!startupId || !userId) throw new Error("startupId and userId are required");
  const existing = Array.isArray(existingTasks) ? existingTasks : [];
  const openKeys = new Set(existing.filter(isOpen).map((t) => keyOf(t.startupId, t.weaknessId, t.relatedWeakness)));

  const created = [];
  let skipped = 0;

  for (const g of generateTasks(evaluation)) {
    const k = keyOf(startupId, g.weaknessId, g.title);
    if (openKeys.has(k)) { skipped++; continue; }
    openKeys.add(k);
    created.push({
      id: crypto.randomUUID(),
      startupId,
      title: g.action,                 // what to do
      description: `Expected evidence: ${g.expectedEvidence}`,
      relatedWeakness: g.title,        // "why this task?"
      weaknessId: g.weaknessId || null,
      agent: g.agent,
      priority: SEVERITY_TO_PRIORITY[g.severity] || "Medium",
      status: "Pending",
      deadline: null,
      weaknessResolved: false,
      resolutionNote: "",
      source: "auto",
      createdBy: userId,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });
  }
  return { tasks: [...existing, ...created], created, skipped };
}

// Founder adds their own task. Returns { ok, task } or { ok:false, error }
function addManualTask(existingTasks, input, { startupId, userId, now = new Date() }) {
  const { title, description = "", relatedWeakness, priority = "Medium", deadline = null } = input || {};
  if (!title || !String(title).trim()) return { ok: false, error: "Title is required" };
  if (!relatedWeakness || !String(relatedWeakness).trim()) return { ok: false, error: "Related weakness is required" };
  if (!PRIORITIES.includes(priority)) return { ok: false, error: "Invalid priority" };
  if (deadline && isNaN(Date.parse(deadline))) return { ok: false, error: "Invalid deadline" };

  const dup = (existingTasks || []).some(
    (t) => isOpen(t) && keyOf(t.startupId, t.weaknessId, t.relatedWeakness) === keyOf(startupId, null, relatedWeakness)
  );
  if (dup) return { ok: false, error: "An open task for this weakness already exists" };

  return {
    ok: true,
    task: {
      id: crypto.randomUUID(), startupId, title: String(title).trim(), description,
      relatedWeakness: String(relatedWeakness).trim(), weaknessId: null, agent: null,
      priority, status: "Pending", deadline: deadline || null, weaknessResolved: false,
      resolutionNote: "", source: "manual", createdBy: userId,
      createdAt: now.toISOString(), updatedAt: now.toISOString(),
    },
  };
}

// Update status / deadline / priority / weakness resolution. Returns { ok, task } or { ok:false, error }
function updateTask(task, patch, now = new Date()) {
  if (!task) return { ok: false, error: "Task not found" };
  const next = { ...task };
  const { status, deadline, priority, weaknessResolved, resolutionNote } = patch || {};

  if (status !== undefined) {
    if (!STATUSES.includes(status)) return { ok: false, error: "Invalid status" };
    next.status = status; // never touches weaknessResolved
  }
  if (priority !== undefined) {
    if (!PRIORITIES.includes(priority)) return { ok: false, error: "Invalid priority" };
    next.priority = priority;
  }
  if (deadline !== undefined) {
    if (deadline && isNaN(Date.parse(deadline))) return { ok: false, error: "Invalid deadline" };
    next.deadline = deadline || null;
  }
  if (weaknessResolved !== undefined) {
    if (weaknessResolved === true) {
      if (next.status !== "Completed") return { ok: false, error: "Complete the task first" };
      if (!resolutionNote || !String(resolutionNote).trim())
        return { ok: false, error: "Explain what evidence or confirmation resolves this weakness" };
      next.resolutionNote = String(resolutionNote).trim();
    }
    next.weaknessResolved = !!weaknessResolved;
  }
  next.updatedAt = now.toISOString();
  return { ok: true, task: next };
}

// Only the startup's owner may see or change its tasks.
function canAccessStartup(startupOwnerId, currentUserId) {
  return !!startupOwnerId && !!currentUserId && String(startupOwnerId) === String(currentUserId);
}

// Open tasks the weakness-based comparison/receipt can use ("remaining unresolved weaknesses")
const unresolvedTasks = (tasks) => (tasks || []).filter(isOpen);

module.exports = { syncTasks, addManualTask, updateTask, canAccessStartup, unresolvedTasks };
