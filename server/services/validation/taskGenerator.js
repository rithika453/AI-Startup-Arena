// Turns every weakness in an evaluation into an action task.
// Input:  evaluation JSON (see samples/sample-v1.json)
// Output: array of task objects, most important first.

const ACTION_TEMPLATES = {
  market: "Interview 5 target customers and record their answers",
  finance: "Build a 12-month cost and revenue sheet with assumptions",
  marketing: "Run a landing page test and capture the signup count",
  risk: "Document the risk and write one mitigation step",
};

const DEFAULT_ACTION = "Collect evidence that addresses this weakness";
const PRIORITY = { high: 1, medium: 2, low: 3 };

function generateTasks(evaluation) {
  if (!evaluation || !Array.isArray(evaluation.agents)) return [];

  const tasks = [];

  for (const agent of evaluation.agents) {
    for (const weakness of agent.weaknesses || []) {
      tasks.push({
        weaknessId: weakness.id,
        agent: agent.agent,
        title: weakness.text,
        action: ACTION_TEMPLATES[agent.agent] || DEFAULT_ACTION,
        severity: weakness.severity || "medium",
        priority: PRIORITY[weakness.severity] || 2,
        expectedEvidence: "link | text | file",
        status: "todo",
      });
    }
  }

  // High priority first
  return tasks.sort((a, b) => a.priority - b.priority);
}

module.exports = { generateTasks };
