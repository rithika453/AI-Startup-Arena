// Single entry point for Member 5's work.
// M2 imports everything from here:
//   const { generateTasks, compareEvaluations } = require("../services/validation");

const { generateTasks } = require("./taskGenerator");
const { validateEvidence } = require("./evidenceValidator");
const { compareEvaluations } = require("./compareEngine");
const { buildReceipt } = require("./receiptBuilder");
const { findContradictions } = require("./contradictionFinder");
const { expiryStatus, expiryReport, computeExpiresAt } = require("./expiryMonitor");
const { syncTasks, addManualTask, updateTask, canAccessStartup, unresolvedTasks } = require("./taskTracker");

module.exports = {
  generateTasks,
  validateEvidence,
  compareEvaluations,
  buildReceipt,
  findContradictions,
  expiryStatus,
  expiryReport,
  computeExpiresAt,
  syncTasks,
  addManualTask,
  updateTask,
  canAccessStartup,
  unresolvedTasks,
};
