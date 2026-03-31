"use strict";
const AMOUNT_EPSILON = 0.01;
const yearMonth = (dateStr) => dateStr.slice(0, 7);
const round = (n, dp = 2) => Math.round(n * 10 ** dp) / 10 ** dp;
const sumField = (arr, field) =>
  arr.reduce((acc, item) => acc + (item[field] ?? 0), 0);
function detectDuplicates(records, label) {
  const seen   = new Map(); 
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
function buildMap(records) {
  const map = new Map();
  records.forEach((r) => map.set(r.id, r));
  return map;
}
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
function detectLateSettlements(transactions, settlementMap) {
  const issues = [];
  transactions.forEach((txn) => {
    const settlement = settlementMap.get(txn.id);
    if (!settlement) return; 
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
function detectRoundingMismatches(transactions, settlementMap, targetMonth) {
  const issues = [];
  transactions
    .filter((txn) => yearMonth(txn.date) === targetMonth)
    .forEach((txn) => {
      const settlement = settlementMap.get(txn.id);
      if (!settlement) return;
      if (yearMonth(settlement.settlementDate) !== targetMonth) return;
      const diff = Math.abs(txn.amount - settlement.amount);
      if (diff > 0 && diff <= AMOUNT_EPSILON) {
        issues.push({
          type:        "ROUNDING_DIFFERENCE",
          id:          txn.id,
          severity:    "LOW",
          description: `Transaction "${txn.id}" – platform amount ${txn.amount} vs `
                     + `bank amount ${settlement.amount} (diff: ${round(diff, 5)}). `
                     + `Within rounding tolerance but will accumulate in total sum.`,
        });
      } else if (diff > AMOUNT_EPSILON) {
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
function detectInvalidRefunds(transactions, transactionMap) {
  const issues = [];
  transactions
    .filter((txn) => txn.amount < 0) 
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
function buildSummary(transactions, settlements, targetMonth) {
  const txnTotal  = transactions
    .filter((t) => yearMonth(t.date) === targetMonth)
    .reduce((sum, t) => sum + t.amount, 0);
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
function reconcile(transactions, settlements, targetMonth) {
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
