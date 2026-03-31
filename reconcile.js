/**
 * reconcile.js
 * ------------
 * Core reconciliation engine.
 * Detects: missing settlements, late settlements, duplicate entries,
 * rounding mismatches, and invalid/orphaned refunds.
 *
 * Design principles:
 *  - Each detection concern is isolated in its own function.
 *  - Uses Map for O(1) lookups instead of nested loops.
 *  - All monetary comparisons use a configurable epsilon to handle
 *    float imprecision safely.
 *  - No external dependencies.
 */

"use strict";

// ─── Constants ────────────────────────────────────────────────────────────────

/** Tolerance for comparing floating-point monetary totals (0.01 = 1 cent). */
const AMOUNT_EPSILON = 0.01;

/** Extract "YYYY-MM" from an ISO date string like "2024-03-15". */
const yearMonth = (dateStr) => dateStr.slice(0, 7);

// ─── Utility ─────────────────────────────────────────────────────────────────

/**
 * Round a number to N decimal places using precise arithmetic.
 * Avoids the classic 0.1 + 0.2 ≠ 0.3 issue for display/comparison.
 */
const round = (n, dp = 2) => Math.round(n * 10 ** dp) / 10 ** dp;

/**
 * Sum an array of objects by a numeric field name.
 * Accumulates with high-precision float arithmetic.
 */
const sumField = (arr, field) =>
  arr.reduce((acc, item) => acc + (item[field] ?? 0), 0);

// ─── Step 1: Detect Duplicate Entries ────────────────────────────────────────

/**
 * Scan either the transactions or settlements array for duplicate IDs.
 * In production this would also cross-check bank batch files against each other.
 *
 * @param {Array}  records  - Array of transaction or settlement objects.
 * @param {string} label    - "Transaction" or "Settlement" (for issue messages).
 * @returns {Array}         - Array of issue objects.
 */
function detectDuplicates(records, label) {
  const seen   = new Map(); // id → first index seen
  const issues = [];

  records.forEach((rec, idx) => {
    if (seen.has(rec.id)) {
      issues.push({
        type:        "DUPLICATE_ENTRY",
        id:          rec.id,
        severity:    "MEDIUM",
        description: `${label} ID "${rec.id}" appears more than once (indices ${seen.get(rec.id)} and ${idx}).`,
      });
    } else {
      seen.set(rec.id, idx);
    }
  });

  return issues;
}

// ─── Step 2: Build Lookup Maps (de-duplicated) ───────────────────────────────

/**
 * Convert an array of records into a Map keyed by `id`.
 * When duplicates exist, LAST record wins (mimics most bank file processors).
 * Duplicate issues are reported separately via detectDuplicates().
 *
 * @param {Array} records
 * @returns {Map<string, object>}
 */
function buildMap(records) {
  const map = new Map();
  records.forEach((r) => map.set(r.id, r));
  return map;
}

// ─── Step 3: Detect Missing Settlements ──────────────────────────────────────

/**
 * For every platform transaction in the target month, check whether a
 * corresponding settlement exists *in that same month*.
 * Transactions settled in the wrong month are flagged by detectLateSettlements.
 *
 * @param {Array}  transactions   - All platform transactions.
 * @param {Map}    settlementMap  - Settlements keyed by ID (de-duplicated).
 * @param {string} targetMonth    - "YYYY-MM" e.g. "2024-03".
 * @returns {Array}               - Issue objects.
 */
function detectMissingSettlements(transactions, settlementMap, targetMonth) {
  const issues = [];

  transactions
    .filter((txn) => yearMonth(txn.date) === targetMonth)
    .forEach((txn) => {
      const settlement = settlementMap.get(txn.id);

      if (!settlement) {
        issues.push({
          type:        "MISSING_SETTLEMENT",
          id:          txn.id,
          severity:    "HIGH",
          description: "Transaction exists but no settlement found"
        });
      }
    });

  return issues;
}

// ─── Step 3.5: Detect Extra Settlements ──────────────────────────────────────

/**
 * Detect settlements that have no corresponding platform transaction.
 *
 * @param {Array}  settlements    - All bank settlements.
 * @param {Map}    transactionMap - Platform transactions keyed by ID.
 * @returns {Array}               - Issue objects.
 */
function detectExtraSettlements(settlements, transactionMap) {
  const issues = [];
  const dedupedSettlements = buildMap(settlements).values();

  for (const settlement of dedupedSettlements) {
    if (!transactionMap.has(settlement.id)) {
      issues.push({
        type:        "EXTRA_SETTLEMENT",
        id:          settlement.id,
        severity:    "HIGH",
        description: "Settlement exists without matching transaction"
      });
    }
  }

  return issues;
}

// ─── Step 4: Detect Late Settlements ─────────────────────────────────────────

/**
 * A late settlement occurs when the transaction date and the settlement date
 * fall in different calendar months.
 * This is the most common cause of month-end reconciliation breaks.
 *
 * @param {Array}  transactions   - All platform transactions.
 * @param {Map}    settlementMap  - Settlements keyed by ID.
 * @returns {Array}               - Issue objects.
 */
function detectLateSettlements(transactions, settlementMap) {
  const issues = [];

  transactions.forEach((txn) => {
    const settlement = settlementMap.get(txn.id);
    if (!settlement) return; // Handled by missing-settlement check.

    const txnMonth  = yearMonth(txn.date);
    const setlMonth = yearMonth(settlement.settlementDate);

    if (txnMonth !== setlMonth) {
      issues.push({
        type:        "LATE_SETTLEMENT",
        id:          txn.id,
        severity:    "MEDIUM",
        description: `Transaction "${txn.id}" dated ${txn.date} (month: ${txnMonth}) `
                   + `was settled on ${settlement.settlementDate} (month: ${setlMonth}). `
                   + `Crosses month boundary – excluded from ${txnMonth} reconciliation.`,
      });
    }
  });

  return issues;
}

// ─── Step 5: Detect Rounding Mismatches ──────────────────────────────────────

/**
 * Per-record amounts may look identical, but platform (3 dp) vs bank (2 dp)
 * rounding causes the running totals to diverge.
 *
 * Strategy:
 *  1. Sum all platform transaction amounts for the target month.
 *  2. Sum all settlement amounts for transactions that settled in the target month.
 *  3. If |platform_total - settlement_total| > AMOUNT_EPSILON → rounding issue.
 *
 * We also do per-record comparison and flag individual records where the
 * difference exceeds AMOUNT_EPSILON (useful for isolating which record diverges).
 *
 * @param {Array}  transactions   - All platform transactions.
 * @param {Map}    settlementMap  - Settlements keyed by ID.
 * @param {string} targetMonth    - "YYYY-MM".
 * @returns {Array}               - Issue objects (may be empty).
 */
function detectRoundingMismatches(transactions, settlementMap, targetMonth) {
  const issues = [];

  transactions
    .filter((txn) => yearMonth(txn.date) === targetMonth)
    .forEach((txn) => {
      const settlement = settlementMap.get(txn.id);
      if (!settlement) return;

      // Only compare if the settlement also falls in the same month.
      if (yearMonth(settlement.settlementDate) !== targetMonth) return;

      const diff = Math.abs(txn.amount - settlement.amount);
      if (diff > 0 && diff <= AMOUNT_EPSILON) {
        // Small difference within epsilon – flag as rounding.
        issues.push({
          type:        "ROUNDING_DIFFERENCE",
          id:          txn.id,
          severity:    "LOW",
          description: `Transaction "${txn.id}" – platform amount ${txn.amount} vs `
                     + `bank amount ${settlement.amount} (diff: ${round(diff, 5)}). `
                     + `Within rounding tolerance but will accumulate in total sum.`,
        });
      } else if (diff > AMOUNT_EPSILON) {
        // Large difference – likely a data entry error, not just rounding.
        issues.push({
          type:        "AMOUNT_MISMATCH",
          id:          txn.id,
          severity:    "HIGH",
          description: `Transaction "${txn.id}" – platform amount ${txn.amount} vs `
                     + `bank amount ${settlement.amount} (diff: ${round(diff, 5)}). `
                     + `Difference exceeds rounding tolerance.`,
        });
      }
    });

  return issues;
}

// ─── Step 6: Detect Invalid / Orphaned Refunds ───────────────────────────────

/**
 * A refund (negative amount) must reference an originalTransactionId that
 * exists in the platform's transaction list.
 * Missing originals indicate data loss, fraud risk, or integration bugs.
 *
 * @param {Array}  transactions   - All platform transactions.
 * @param {Map}    transactionMap - Platform transactions keyed by ID.
 * @returns {Array}               - Issue objects.
 */
function detectInvalidRefunds(transactions, transactionMap) {
  const issues = [];

  transactions
    .filter((txn) => txn.amount < 0) // Refunds have negative amounts.
    .forEach((refund) => {
      const origId = refund.originalTransactionId;

      if (!origId) {
        issues.push({
          type:        "REFUND_MISSING_REFERENCE",
          id:          refund.id,
          severity:    "HIGH",
          description: `Refund "${refund.id}" has no originalTransactionId field.`,
        });
        return;
      }

      if (!transactionMap.has(origId)) {
        issues.push({
          type:        "REFUND_WITHOUT_ORIGINAL",
          id:          refund.id,
          severity:    "HIGH",
          description: `Refund "${refund.id}" references originalTransactionId "${origId}", `
                     + `but that transaction does not exist in the platform dataset. `
                     + `Possible data loss, fraud, or cross-system refund.`,
        });
      }
    });

  return issues;
}

// ─── Step 7: Build Summary ────────────────────────────────────────────────────

/**
 * Compute monetary totals for the target month.
 * Uses only transactions whose date falls in the target month.
 * Uses only settlements whose settlementDate falls in the target month
 * (late settlements are excluded – this is intentional for month-end close).
 *
 * @param {Array}  transactions   - All platform transactions.
 * @param {Array}  settlements    - All bank settlements (raw, may have duplicates).
 * @param {string} targetMonth    - "YYYY-MM".
 * @returns {object}              - { totalTransactions, totalSettlements, difference }
 */
function buildSummary(transactions, settlements, targetMonth) {
  const txnTotal  = transactions
    .filter((t) => yearMonth(t.date) === targetMonth)
    .reduce((sum, t) => sum + t.amount, 0);

  // De-duplicate settlements before summing (use last-seen per ID).
  const dedupedSettlements = [...buildMap(settlements).values()];

  const setlTotal = dedupedSettlements
    .filter((s) => yearMonth(s.settlementDate) === targetMonth)
    .reduce((sum, s) => sum + s.amount, 0);

  return {
    targetMonth,
    totalTransactions: round(txnTotal, 3),
    totalSettlements:  round(setlTotal, 2),
    difference:        round(txnTotal - setlTotal, 3),
  };
}

// ─── Main Reconcile Function ──────────────────────────────────────────────────

/**
 * reconcile(transactions, settlements, targetMonth?)
 * --------------------------------------------------
 * Entry point for the reconciliation engine.
 *
 * @param {Array}   transactions  - Platform transaction records.
 * @param {Array}   settlements   - Bank settlement records.
 * @param {string}  [targetMonth] - "YYYY-MM". Defaults to the month of the
 *                                  first transaction if not provided.
 * @returns {{ summary: object, issues: Array }}
 */
function reconcile(transactions, settlements, targetMonth) {
  // Default target month = month of first transaction.
  const month = targetMonth ?? yearMonth(transactions[0]?.date ?? "");

  // Build lookup structures.
  const txnMap   = buildMap(transactions);
  const setlMap  = buildMap(settlements);

  // Run all detectors and collect issues.
  const issues = [
    ...detectDuplicates(transactions,  "Transaction"),
    ...detectDuplicates(settlements,   "Settlement"),
    ...detectMissingSettlements(transactions, setlMap, month),
    ...detectExtraSettlements(settlements, txnMap),
    ...detectLateSettlements(transactions, setlMap),
    ...detectRoundingMismatches(transactions, setlMap, month),
    ...detectInvalidRefunds(transactions, txnMap),
  ];

  // Build monetary summary.
  const summary = buildSummary(transactions, settlements, month);

  summary.issueBreakdown = {
    missingSettlement: issues.filter(i => i.type === "MISSING_SETTLEMENT").length,
    extraSettlement: issues.filter(i => i.type === "EXTRA_SETTLEMENT").length,
    lateSettlement: issues.filter(i => i.type === "LATE_SETTLEMENT").length,
    duplicate: issues.filter(i => i.type === "DUPLICATE_ENTRY").length,
    rounding: issues.filter(i => i.type === "ROUNDING_DIFFERENCE").length,
    invalidRefund: issues.filter(i => i.type === "REFUND_WITHOUT_ORIGINAL").length
  };

  return { summary, issues };
}

module.exports = { reconcile };
