// Builds the "Decision Change Receipt": a readable summary of WHY the verdict changed.
// Input:  comparison (from compareEngine), evidenceList, tasks (optional)
// Output: receipt object, or null if there is no comparison.

const { validateEvidence } = require("./evidenceValidator");

function signed(n) {
  return (n > 0 ? "+" : "") + n;
}

// Find the task an evidence item belongs to (by weaknessId or by task id)
function findTask(evidence, tasks) {
  return tasks.find(
    t => (evidence.weaknessId && t.weaknessId === evidence.weaknessId) ||
         (evidence.task && (t._id === evidence.task || t.id === evidence.task))
  );
}

function weaknessIdOf(evidence, tasks) {
  if (evidence.weaknessId) return evidence.weaknessId;
  const task = findTask(evidence, tasks);
  return task ? task.weaknessId : null;
}

function buildReceipt(comparison, evidenceList = [], tasks = [], date = new Date()) {
  if (!comparison) return null;

  // Make sure every evidence item has a validation result
  const checked = evidenceList.map(e => ({
    evidence: e,
    weaknessId: weaknessIdOf(e, tasks),
    validation: e.validation || validateEvidence(e, findTask(e, tasks)),
  }));

  // Rejected evidence never counts
  const usable = checked.filter(c => c.validation.status !== "rejected");

  const evidenceSummary = {
    total: checked.length,
    valid: checked.filter(c => c.validation.status === "valid").length,
    weak: checked.filter(c => c.validation.status === "weak").length,
    rejected: checked.filter(c => c.validation.status === "rejected").length,
  };

  // Which usable evidence explains each resolved weakness?
  const because = comparison.weaknessesResolved.map(w => {
    const proof = usable.find(c => c.weaknessId === w.id);
    return {
      weaknessId: w.id,
      weakness: w.text,
      agent: w.agent,
      evidenceId: proof ? proof.evidence._id : null,
      evidenceStatus: proof ? proof.validation.status : null,
      effect: proof
        ? `"${w.text}" was resolved by submitted evidence`
        : `"${w.text}" was resolved at re-evaluation (no linked evidence)`,
    };
  });

  const unresolved = [
    ...comparison.weaknessesRemaining.map(w => w.text),
    ...comparison.newWeaknesses.map(w => w.text),
  ];

  const headline = comparison.verdictChanged
    ? `Verdict changed: ${comparison.verdictBefore} → ${comparison.verdictAfter}`
    : `Verdict unchanged: ${comparison.verdictAfter}`;

  return {
    headline,
    scoreChange: signed(comparison.scoreDelta),
    scoreBefore: comparison.scoreBefore,
    scoreAfter: comparison.scoreAfter,
    because,
    unresolved,
    newIssues: comparison.newWeaknesses.map(w => w.text),
    evidenceSummary,
    note: evidenceList.length === 0 ? "No new evidence was submitted" : null,
    date: new Date(date).toISOString(),
  };
}

module.exports = { buildReceipt };
