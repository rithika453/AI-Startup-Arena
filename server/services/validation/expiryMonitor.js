// Marks evidence as fresh, expiring or expired based on its expiry date.
// Expired evidence should NOT count toward the investor-readiness score.

const DAY_MS = 24 * 60 * 60 * 1000;

// How long evidence stays trustworthy, by type
const TTL_DAYS = { link: 90, text: 60, file: 90 };

// Warn when fewer than this many days are left
const EXPIRING_SOON_DAYS = 14;

// Use this when saving new evidence, so M3 can store expiresAt
function computeExpiresAt(type, from = new Date()) {
  const days = TTL_DAYS[type] || 60;
  return new Date(new Date(from).getTime() + days * DAY_MS).toISOString();
}

// Status of ONE evidence item: "fresh" | "expiring" | "expired"
function expiryStatus(evidence, now = new Date()) {
  let expiresAt = evidence && evidence.expiresAt;

  // No expiry saved: work it out from the creation date
  if (!expiresAt && evidence && evidence.createdAt) {
    expiresAt = computeExpiresAt(evidence.type, evidence.createdAt);
  }
  if (!expiresAt) return { status: "fresh", daysLeft: null };

  const daysLeft = Math.ceil((new Date(expiresAt) - new Date(now)) / DAY_MS);

  let status = "fresh";
  if (daysLeft < 0) status = "expired";
  else if (daysLeft <= EXPIRING_SOON_DAYS) status = "expiring";

  return { status, daysLeft };
}

// Report for a whole list of evidence
function expiryReport(evidenceList = [], now = new Date()) {
  const items = evidenceList.map(e => ({
    evidenceId: e._id,
    ...expiryStatus(e, now),
  }));

  const count = s => items.filter(i => i.status === s).length;

  return {
    items,
    fresh: count("fresh"),
    expiring: count("expiring"),
    expired: count("expired"),
    usableCount: items.length - count("expired"), // for M6's readiness score
  };
}

module.exports = { expiryStatus, expiryReport, computeExpiresAt, TTL_DAYS };
