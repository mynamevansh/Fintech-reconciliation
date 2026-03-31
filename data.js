/**
 * data.js
 * -------
 * Mock dataset generator for the fintech reconciliation system.
 * Simulates platform transactions and bank settlements with
 * deliberate edge cases: late settlement, rounding difference,
 * duplicate entry, and refund without original.
 */

// ─── Helper ──────────────────────────────────────────────────────────────────

/** Round to N decimal places (avoids JS float noise). */
const round = (val, dp) => Math.round(val * 10 ** dp) / 10 ** dp;

/**
 * Platform stores 3 decimal precision.
 * Bank stores 2 decimal precision (standard currency rounding).
 * This intentional gap is where rounding mismatches originate.
 */
const toPlatformAmount = (n) => round(n, 3);
const toBankAmount     = (n) => round(n, 2);

// ─── Platform Transactions ────────────────────────────────────────────────────
// Recorded at transaction time. Amounts have 3 decimal precision.

const transactions = [
  // ✅ Normal transactions (will settle correctly)
  { id: "TXN-001", date: "2024-03-01", amount: toPlatformAmount(1500.00),  description: "Card payment – merchant A" },
  { id: "TXN-002", date: "2024-03-03", amount: toPlatformAmount(299.99),   description: "Card payment – merchant B" },
  { id: "TXN-003", date: "2024-03-05", amount: toPlatformAmount(750.50),   description: "Card payment – merchant C" },
  { id: "TXN-004", date: "2024-03-07", amount: toPlatformAmount(4200.00),  description: "Wire transfer – corporate" },
  { id: "TXN-005", date: "2024-03-10", amount: toPlatformAmount(85.00),    description: "Card payment – merchant D" },
  { id: "TXN-006", date: "2024-03-12", amount: toPlatformAmount(620.00),   description: "Card payment – merchant E" },

  // 🔴 Edge case 1 – Rounding mismatch source
  // Platform records 3 dp; bank will round to 2 dp.
  // Individually looks fine, but totals diverge when summed.
  { id: "TXN-007", date: "2024-03-14", amount: toPlatformAmount(199.995),  description: "Subscription fee (rounding bait)" },

  // 🔴 Edge case 2 – Late settlement source
  // This March transaction will settle in April (crosses month boundary).
  { id: "TXN-008", date: "2024-03-28", amount: toPlatformAmount(3100.00),  description: "Large wire – settles late" },

  // ✅ Normal refund – original transaction present
  { id: "TXN-009", date: "2024-03-15", amount: toPlatformAmount(750.50),   description: "Card payment – merchant F" },
  { id: "TXN-010", date: "2024-03-16", amount: toPlatformAmount(-750.50),  description: "Refund for TXN-009",
    originalTransactionId: "TXN-009" },

  // 🔴 Edge case 3 – Refund without original
  // The refund references TXN-999 which does not exist in the platform dataset.
  { id: "TXN-011", date: "2024-03-18", amount: toPlatformAmount(-430.00),  description: "Refund – orphaned (no original)",
    originalTransactionId: "TXN-999" },
];

// ─── Bank Settlements ─────────────────────────────────────────────────────────
// Batched and delayed. Amounts rounded to 2 decimal places by the bank.

const settlements = [
  // ✅ Normal settlements matching TXN-001 … TXN-006
  { id: "TXN-001", settlementDate: "2024-03-02", amount: toBankAmount(1500.00),  batchId: "BATCH-A" },
  { id: "TXN-002", settlementDate: "2024-03-05", amount: toBankAmount(299.99),   batchId: "BATCH-A" },
  { id: "TXN-003", settlementDate: "2024-03-07", amount: toBankAmount(750.50),   batchId: "BATCH-A" },
  { id: "TXN-004", settlementDate: "2024-03-09", amount: toBankAmount(4200.00),  batchId: "BATCH-B" },
  { id: "TXN-005", settlementDate: "2024-03-12", amount: toBankAmount(85.00),    batchId: "BATCH-B" },
  { id: "TXN-006", settlementDate: "2024-03-14", amount: toBankAmount(620.00),   batchId: "BATCH-B" },

  // 🔴 Edge case 1 – Rounding difference
  // TXN-007 platform amount is 199.995; bank rounds to 200.00.
  // Difference of 0.005 is invisible per-record but shows up in total sum.
  { id: "TXN-007", settlementDate: "2024-03-16", amount: toBankAmount(199.995),  batchId: "BATCH-C" },

  // 🔴 Edge case 2 – Late settlement
  // TXN-008 transacted in March, settled in April (next month).
  { id: "TXN-008", settlementDate: "2024-04-02", amount: toBankAmount(3100.00),  batchId: "BATCH-D" },

  // 🔴 Edge case 3 – Duplicate settlement entry
  // TXN-009 appears twice in the bank file (bank processing error / retry).
  { id: "TXN-009", settlementDate: "2024-03-17", amount: toBankAmount(750.50),   batchId: "BATCH-C" },
  { id: "TXN-009", settlementDate: "2024-03-17", amount: toBankAmount(750.50),   batchId: "BATCH-C" }, // ← duplicate

  // ✅ Normal settlement for the valid refund
  { id: "TXN-010", settlementDate: "2024-03-18", amount: toBankAmount(-750.50),  batchId: "BATCH-C" },

  // ✅ Settlement for the orphaned refund (settlement present, but original txn missing)
  { id: "TXN-011", settlementDate: "2024-03-20", amount: toBankAmount(-430.00),  batchId: "BATCH-C" },

  // 🔴 Edge case implicit – TXN-008 is in April, so it will appear as a missing
  //    settlement when we reconcile March (month-boundary gap).
  //    No separate record needed; handled by the engine's date filtering.
];

module.exports = { transactions, settlements };
