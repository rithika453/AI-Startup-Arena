// Compares two evaluations of the same idea (before and after evidence).
// Input:  v1 (older evaluation), v2 (newer evaluation)
// Output: comparison object, or null if either evaluation is missing.

function round1(n) {
  return Math.round(n * 10) / 10;
}

// Turn the nested agents -> weaknesses structure into one flat list
function flattenWeaknesses(evaluation) {
  const list = [];
  for (const agent of evaluation.agents || []) {
    for (const w of agent.weaknesses || []) {
      list.push({
        id: w.id,
        agent: agent.agent,
        text: w.text,
        severity: w.severity || "medium",
      });
    }
  }
  return list;
}

function normalize(text) {
  return String(text || "").toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();
}

// Same weakness if the id matches, or the agent and the wording match
function isSame(a, b) {
  if (a.id && b.id && a.id === b.id) return true;
  return a.agent === b.agent && normalize(a.text) === normalize(b.text);
}

function compareEvaluations(v1, v2) {
  if (!v1 || !v2) return null;

  const before = flattenWeaknesses(v1);
  const after = flattenWeaknesses(v2);

  const weaknessesResolved = before.filter(a => !after.some(b => isSame(a, b)));
  const newWeaknesses = after.filter(b => !before.some(a => isSame(a, b)));
  const weaknessesRemaining = after.filter(b => before.some(a => isSame(a, b)));

  const perAgent = (v1.agents || []).map(a => {
    const match = (v2.agents || []).find(x => x.agent === a.agent);
    const afterScore = match ? match.score : a.score;
    return {
      agent: a.agent,
      before: a.score,
      after: afterScore,
      delta: round1(afterScore - a.score),
    };
  });

  const scoreDelta = round1((v2.overallScore || 0) - (v1.overallScore || 0));

  return {
    versionBefore: v1.version,
    versionAfter: v2.version,
    scoreBefore: v1.overallScore,
    scoreAfter: v2.overallScore,
    scoreDelta,
    verdictBefore: v1.verdict,
    verdictAfter: v2.verdict,
    verdictChanged: v1.verdict !== v2.verdict,
    perAgent,
    weaknessesResolved,
    weaknessesRemaining,
    newWeaknesses,
  };
}

module.exports = { compareEvaluations, flattenWeaknesses };
