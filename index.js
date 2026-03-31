/**
 * index.js
 * --------
 * Test runner for the fintech reconciliation system.
 * Executes 5 test scenarios and prints structured JSON results.
 *
 * Scenarios:
 *   1. Happy path  – All transactions match cleanly.
 *   2. Late settlement – One transaction crosses the month boundary.
 *   3. Duplicate entry – Same settlement ID appears twice.
 *   4. Rounding mismatch – Platform 3 dp vs bank 2 dp causes total drift.
 *   5. Refund without original – Orphaned refund references a missing txn.
 *   6. Combined / full dataset – All edge cases at once (uses data.js).
 */

"use strict";

const { reconcile }                 = require("./reconcile");
const { transactions, settlements } = require("./data");

// ─── Pretty Printer ───────────────────────────────────────────────────────────

function printResult(label, result) {
  console.log("\n" + "═".repeat(70));
  console.log(`  TEST: ${label}`);
  console.log("═".repeat(70));
  console.log(JSON.stringify(result, null, 2));
}

// ─── Test 1: Happy Path ───────────────────────────────────────────────────────
// All transactions have matching settlements in the same month.
// Expected: no issues, difference = 0.

function testHappyPath() {
  const txns = [
    { id: "T-001", date: "2024-03-01", amount: 100.000, description: "Payment A" },
    { id: "T-002", date: "2024-03-02", amount: 250.000, description: "Payment B" },
    { id: "T-003", date: "2024-03-03", amount: 75.500,  description: "Payment C" },
  ];
  const setls = [
    { id: "T-001", settlementDate: "2024-03-02", amount: 100.00, batchId: "B1" },
    { id: "T-002", settlementDate: "2024-03-03", amount: 250.00, batchId: "B1" },
    { id: "T-003", settlementDate: "2024-03-04", amount: 75.50,  batchId: "B1" },
  ];
  return reconcile(txns, setls, "2024-03");
}

// ─── Test 2: Late Settlement ──────────────────────────────────────────────────
// T-003 was transacted in March but settled in April.
// Expected: LATE_SETTLEMENT issue for T-003, and it appears in MISSING_SETTLEMENT
// because no in-month settlement exists for it.

function testLateSettlement() {
  const txns = [
    { id: "T-001", date: "2024-03-10", amount: 500.000, description: "Normal" },
    { id: "T-002", date: "2024-03-28", amount: 1200.000, description: "Late settler" },
  ];
  const setls = [
    { id: "T-001", settlementDate: "2024-03-12", amount: 500.00,  batchId: "B1" },
    { id: "T-002", settlementDate: "2024-04-01", amount: 1200.00, batchId: "B2" }, // ← April
  ];
  return reconcile(txns, setls, "2024-03");
}

// ─── Test 3: Duplicate Settlement ────────────────────────────────────────────
// T-002 settlement appears twice in the bank file.
// Expected: DUPLICATE_ENTRY issue for T-002 in settlements.

function testDuplicateSettlement() {
  const txns = [
    { id: "T-001", date: "2024-03-01", amount: 300.000, description: "Normal" },
    { id: "T-002", date: "2024-03-02", amount: 800.000, description: "Will be duped" },
  ];
  const setls = [
    { id: "T-001", settlementDate: "2024-03-03", amount: 300.00, batchId: "B1" },
    { id: "T-002", settlementDate: "2024-03-03", amount: 800.00, batchId: "B1" },
    { id: "T-002", settlementDate: "2024-03-03", amount: 800.00, batchId: "B1" }, // ← duplicate
  ];
  return reconcile(txns, setls, "2024-03");
}

// ─── Test 4: Rounding Mismatch ────────────────────────────────────────────────
// Platform stores 199.995 (3 dp); bank rounds to 200.00 (2 dp).
// Per-record diff = 0.005 (within epsilon but accumulates).
// Expected: ROUNDING_DIFFERENCE issue, and summary.difference ≠ 0.

function testRoundingMismatch() {
  const txns = [
    { id: "T-001", date: "2024-03-01", amount: 199.995, description: "Rounding bait" },
    { id: "T-002", date: "2024-03-02", amount: 50.005,  description: "Rounding bait 2" },
  ];
  const setls = [
    { id: "T-001", settlementDate: "2024-03-02", amount: 200.00, batchId: "B1" }, // bank rounds 199.995 → 200.00
    { id: "T-002", settlementDate: "2024-03-03", amount: 50.01,  batchId: "B1" }, // bank rounds 50.005 → 50.01
  ];
  return reconcile(txns, setls, "2024-03");
}

// ─── Test 5: Refund Without Original ─────────────────────────────────────────
// A refund references an originalTransactionId that does not exist.
// Expected: REFUND_WITHOUT_ORIGINAL issue.

function testRefundWithoutOriginal() {
  const txns = [
    { id: "T-001", date: "2024-03-01", amount: 600.000, description: "Payment" },
    {
      id: "T-002", date: "2024-03-05", amount: -600.000,
      description: "Refund – no original",
      originalTransactionId: "T-GHOST", // ← does not exist
    },
  ];
  const setls = [
    { id: "T-001", settlementDate: "2024-03-02", amount: 600.00,  batchId: "B1" },
    { id: "T-002", settlementDate: "2024-03-06", amount: -600.00, batchId: "B1" },
  ];
  return reconcile(txns, setls, "2024-03");
}

// ─── Test 6: Full Combined Dataset (data.js) ─────────────────────────────────
// Uses the realistic mock data from data.js.
// Expects ALL four edge-case types to be detected simultaneously.

function testFullDataset() {
  return reconcile(transactions, settlements, "2024-03");
}

// ─── Run All Tests ────────────────────────────────────────────────────────────

console.log("\n╔══════════════════════════════════════════════════════════════════════╗");
console.log("║        FINTECH RECONCILIATION SYSTEM – TEST RUN                     ║");
console.log("╚══════════════════════════════════════════════════════════════════════╝");

printResult("1 – Happy Path (no issues expected)",              testHappyPath());
printResult("2 – Late Settlement",                              testLateSettlement());
printResult("3 – Duplicate Settlement Entry",                   testDuplicateSettlement());
printResult("4 – Rounding Mismatch (3dp vs 2dp)",              testRoundingMismatch());
printResult("5 – Refund Without Original Transaction",          testRefundWithoutOriginal());
printResult("6 – Combined Full Dataset (all edge cases)",       testFullDataset());

console.log("\n" + "═".repeat(70));
console.log("  All tests complete.");
console.log("═".repeat(70) + "\n");
