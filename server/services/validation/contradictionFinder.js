// Finds places where new findings contradict earlier claims.
// Simple, rule-based, and returned as a dated list (a timeline for M1 to show).
//
// Rule 1: an agent's earlier STRENGTH is gone in v2 AND the same agent has a NEW weakness
//         (the old claim no longer holds).
// Rule 2: evidence text contains negative words ("failed", "declined", "nobody"...)
//         next to a weakness the founder was trying to fix.

const { flattenWeaknesses } = require("./compareEngine");

const NEGATIVE_PHRASES = [
  "no one", "nobody", "failed", "declined", "lower than", "not interested",
  "refused", "rejected", "no signups", "zero", "dropped", "lost",
];

function normalize(text) {
  return String(text || "").toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();
}

function toIso(d) {
  return new Date(d).toISOString();
}

function findContradictions(v1, v2, evidenceList = [], date = new Date()) {
  if (!v1 || !v2) return [];

  const results = [];
  const v2Date = v2.createdAt || date;

  // ---- Rule 1: earlier strength dropped + new weakness in the same agent ----
  const weaknessesBefore = flattenWeaknesses(v1);
  const weaknessesAfter = flattenWeaknesses(v2);
  const newWeaknesses = weaknessesAfter.filter(
    b => !weaknessesBefore.some(a => a.id === b.id)
  );

  for (const agentBefore of v1.agents || []) {
    const agentAfter = (v2.agents || []).find(x => x.agent === agentBefore.agent);
    const keptStrengths = new Set((agentAfter ? agentAfter.strengths : []).map(normalize));
    const droppedStrengths = (agentBefore.strengths || []).filter(
      s => !keptStrengths.has(normalize(s))
    );
    const newForAgent = newWeaknesses.filter(w => w.agent === agentBefore.agent);

    if (droppedStrengths.length > 0 && newForAgent.length > 0) {
      for (const claim of droppedStrengths) {
        for (const w of newForAgent) {
          results.push({
            date: toIso(v2Date),
            type: "claim_reversed",
            agent: agentBefore.agent,
            oldClaim: claim,
            newFinding: w.text,
            evidenceId: null,
          });
        }
      }
    }
  }

  // ---- Rule 2: negative evidence against an earlier claim ----
  for (const e of evidenceList) {
    if (e.validation && e.validation.status === "rejected") continue;

    const text = normalize(e.content);
    const hit = NEGATIVE_PHRASES.find(p => text.includes(p));
    if (!hit) continue;

    const weakness = weaknessesBefore.find(w => w.id === e.weaknessId);
    const agentBefore = weakness
      ? (v1.agents || []).find(a => a.agent === weakness.agent)
      : null;
    const oldClaim =
      (agentBefore && agentBefore.strengths && agentBefore.strengths[0]) ||
      (weakness ? `Assumption behind: ${weakness.text}` : "Earlier assumption");

    results.push({
      date: toIso(e.createdAt || date),
      type: "evidence_contradicts",
      agent: weakness ? weakness.agent : null,
      oldClaim,
      newFinding: e.content,
      evidenceId: e._id,
    });
  }

  // Oldest first, like a timeline
  return results.sort((a, b) => new Date(a.date) - new Date(b.date));
}

module.exports = { findContradictions };
