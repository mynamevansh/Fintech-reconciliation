const round = (val, dp) => Math.round(val * 10 ** dp) / 10 ** dp;
const toPlatformAmount = (n) => round(n, 3);
const toBankAmount     = (n) => round(n, 2);
const transactions = [
  { id: "TXN-001", date: "2024-03-01", amount: toPlatformAmount(1500.00),  description: "Card payment – merchant A" },
  { id: "TXN-002", date: "2024-03-03", amount: toPlatformAmount(299.99),   description: "Card payment – merchant B" },
  { id: "TXN-003", date: "2024-03-05", amount: toPlatformAmount(750.50),   description: "Card payment – merchant C" },
  { id: "TXN-004", date: "2024-03-07", amount: toPlatformAmount(4200.00),  description: "Wire transfer – corporate" },
  { id: "TXN-005", date: "2024-03-10", amount: toPlatformAmount(85.00),    description: "Card payment – merchant D" },
  { id: "TXN-006", date: "2024-03-12", amount: toPlatformAmount(620.00),   description: "Card payment – merchant E" },
  { id: "TXN-007", date: "2024-03-14", amount: toPlatformAmount(199.995),  description: "Subscription fee (rounding bait)" },
  { id: "TXN-008", date: "2024-03-28", amount: toPlatformAmount(3100.00),  description: "Large wire – settles late" },
  { id: "TXN-009", date: "2024-03-15", amount: toPlatformAmount(750.50),   description: "Card payment – merchant F" },
  { id: "TXN-010", date: "2024-03-16", amount: toPlatformAmount(-750.50),  description: "Refund for TXN-009",
    originalTransactionId: "TXN-009" },
  { id: "TXN-011", date: "2024-03-18", amount: toPlatformAmount(-430.00),  description: "Refund – orphaned (no original)",
    originalTransactionId: "TXN-999" },
];
const settlements = [
  { id: "TXN-001", settlementDate: "2024-03-02", amount: toBankAmount(1500.00),  batchId: "BATCH-A" },
  { id: "TXN-002", settlementDate: "2024-03-05", amount: toBankAmount(299.99),   batchId: "BATCH-A" },
  { id: "TXN-003", settlementDate: "2024-03-07", amount: toBankAmount(750.50),   batchId: "BATCH-A" },
  { id: "TXN-004", settlementDate: "2024-03-09", amount: toBankAmount(4200.00),  batchId: "BATCH-B" },
  { id: "TXN-005", settlementDate: "2024-03-12", amount: toBankAmount(85.00),    batchId: "BATCH-B" },
  { id: "TXN-006", settlementDate: "2024-03-14", amount: toBankAmount(620.00),   batchId: "BATCH-B" },
  { id: "TXN-007", settlementDate: "2024-03-16", amount: toBankAmount(199.995),  batchId: "BATCH-C" },
  { id: "TXN-008", settlementDate: "2024-04-02", amount: toBankAmount(3100.00),  batchId: "BATCH-D" },
  { id: "TXN-009", settlementDate: "2024-03-17", amount: toBankAmount(750.50),   batchId: "BATCH-C" },
  { id: "TXN-009", settlementDate: "2024-03-17", amount: toBankAmount(750.50),   batchId: "BATCH-C" }, 
  { id: "TXN-010", settlementDate: "2024-03-18", amount: toBankAmount(-750.50),  batchId: "BATCH-C" },
  { id: "TXN-011", settlementDate: "2024-03-20", amount: toBankAmount(-430.00),  batchId: "BATCH-C" },
];
module.exports = { transactions, settlements };
