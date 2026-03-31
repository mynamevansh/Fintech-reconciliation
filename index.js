"use strict";
const { reconcile } = require("./reconcile");
const { transactions, settlements } = require("./data");
function printResult(label, result) {
  console.log("\n" + "═".repeat(70));
  console.log(`  TEST: ${label}`);
  console.log("═".repeat(70));
  console.log(JSON.stringify(result, null, 2));
}
function testHappyPath() {
  const txns = [
    { id: "T-001", date: "2024-03-01", amount: 100.000, description: "Payment A" },
    { id: "T-002", date: "2024-03-02", amount: 250.000, description: "Payment B" },
    { id: "T-003", date: "2024-03-03", amount: 75.500, description: "Payment C" },
  ];
  const setls = [
    { id: "T-001", settlementDate: "2024-03-02", amount: 100.00, batchId: "B1" },
    { id: "T-002", settlementDate: "2024-03-03", amount: 250.00, batchId: "B1" },
    { id: "T-003", settlementDate: "2024-03-04", amount: 75.50, batchId: "B1" },
  ];
  return reconcile(txns, setls, "2024-03");
}
function testLateSettlement() {
  const txns = [
    { id: "T-001", date: "2024-03-10", amount: 500.000, description: "Normal" },
    { id: "T-002", date: "2024-03-28", amount: 1200.000, description: "Late settler" },
  ];
  const setls = [
    { id: "T-001", settlementDate: "2024-03-12", amount: 500.00, batchId: "B1" },
    { id: "T-002", settlementDate: "2024-04-01", amount: 1200.00, batchId: "B2" },
  ];
  return reconcile(txns, setls, "2024-03");
}
function testDuplicateSettlement() {
  const txns = [
    { id: "T-001", date: "2024-03-01", amount: 300.000, description: "Normal" },
    { id: "T-002", date: "2024-03-02", amount: 800.000, description: "Will be duped" },
  ];
  const setls = [
    { id: "T-001", settlementDate: "2024-03-03", amount: 300.00, batchId: "B1" },
    { id: "T-002", settlementDate: "2024-03-03", amount: 800.00, batchId: "B1" },
    { id: "T-002", settlementDate: "2024-03-03", amount: 800.00, batchId: "B1" },
  ];
  return reconcile(txns, setls, "2024-03");
}
function testRoundingMismatch() {
  const txns = [
    { id: "T-001", date: "2024-03-01", amount: 199.995, description: "Rounding bait" },
    { id: "T-002", date: "2024-03-02", amount: 50.005, description: "Rounding bait 2" },
  ];
  const setls = [
    { id: "T-001", settlementDate: "2024-03-02", amount: 200.00, batchId: "B1" },
    { id: "T-002", settlementDate: "2024-03-03", amount: 50.01, batchId: "B1" },
  ];
  return reconcile(txns, setls, "2024-03");
}
function testRefundWithoutOriginal() {
  const txns = [
    { id: "T-001", date: "2024-03-01", amount: 600.000, description: "Payment" },
    {
      id: "T-002", date: "2024-03-05", amount: -600.000,
      description: "Refund – no original",
      originalTransactionId: "T-GHOST",
    },
  ];
  const setls = [
    { id: "T-001", settlementDate: "2024-03-02", amount: 600.00, batchId: "B1" },
    { id: "T-002", settlementDate: "2024-03-06", amount: -600.00, batchId: "B1" },
  ];
  return reconcile(txns, setls, "2024-03");
}
function testFullDataset() {
  return reconcile(transactions, settlements, "2024-03");
}
console.log("\n╔══════════════════════════════════════════════════════════════════════╗");
console.log("║        FINTECH RECONCILIATION SYSTEM – TEST RUN                     ║");
console.log("╚══════════════════════════════════════════════════════════════════════╝");
printResult("1 – Happy Path (no issues expected)", testHappyPath());
printResult("2 – Late Settlement", testLateSettlement());
printResult("3 – Duplicate Settlement Entry", testDuplicateSettlement());
printResult("4 – Rounding Mismatch (3dp vs 2dp)", testRoundingMismatch());
printResult("5 – Refund Without Original Transaction", testRefundWithoutOriginal());
printResult("6 – Combined Full Dataset (all edge cases)", testFullDataset());

console.log("\n" + "═".repeat(70));
console.log("  All tests complete.");
console.log("═".repeat(70) + "\n");


const express = require("express");
const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.send("Fintech Reconciliation API is running 🚀");
});

app.get("/reconcile", (req, res) => {
  res.json(testFullDataset());
});

app.listen(PORT, () => {
  console.log(`Server is successfully listening on port ${PORT}`);
  console.log(`Ready for Render deployment!`);
});

