// Checks one piece of evidence against the task it belongs to.
// Input:  evidence { type, content, ... }  and  task { title, action }
// Output: { status: "valid" | "weak" | "rejected", reasons: [...], confidence: 0..1 }

const STOP_WORDS = new Set([
  "this", "that", "with", "from", "have", "will", "about", "their", "they",
  "were", "been", "your", "what", "when", "which", "there", "would", "could",
]);

// Very simple word cleaner: lowercase, remove endings like s / ed / ing
function stem(word) {
  return word.replace(/(ing|ed|es|s)$/, "");
}

function keywords(text) {
  return (String(text).toLowerCase().match(/[a-z]+/g) || [])
    .filter(w => w.length > 3 && !STOP_WORDS.has(w))
    .map(stem);
}

// Share of the task's keywords that also appear in the evidence (0 to 1)
function keywordOverlap(evidenceText, taskText) {
  const taskWords = [...new Set(keywords(taskText))];
  if (taskWords.length === 0) return 1;
  const evidenceWords = new Set(keywords(evidenceText));
  const matched = taskWords.filter(w => evidenceWords.has(w)).length;
  return matched / taskWords.length;
}

function result(status, reasons, confidence) {
  return { status, reasons, confidence: Math.round(confidence * 100) / 100 };
}

function validateEvidence(evidence, task) {
  const type = evidence && evidence.type;
  const text = String((evidence && evidence.content) || "").trim();

  // Hard rejections
  if (!text && type !== "file") {
    return result("rejected", ["Evidence is empty"], 0.1);
  }
  if (type === "link" && !/^https?:\/\/\S+\.\S+/.test(text)) {
    return result("rejected", ["Not a valid link (must start with http:// or https://)"], 0.1);
  }

  const problems = [];

  // Text evidence needs some substance
  const tooShort = type === "text" && text.length < 40;
  if (tooShort) problems.push("Too short to be convincing");

  // Relevance check only for text that is long enough to judge
  if (type === "text" && !tooShort && task) {
    const overlap = keywordOverlap(text, `${task.title} ${task.action}`);
    if (overlap < 0.1) problems.push("Not relevant to the task");
  }

  // Numbers (interviews held, signups, revenue) make evidence measurable
  const hasNumbers = /\d/.test(text);
  if (!hasNumbers && type !== "file") problems.push("No numbers or measurable result");

  // Decide status
  let status;
  if (problems.length === 0) status = "valid";
  else if (problems.length === 1) status = "weak";
  else status = "rejected";

  const confidence = Math.max(0.1, 1 - problems.length * 0.3);
  return result(status, problems, confidence);
}

module.exports = { validateEvidence, keywordOverlap };
