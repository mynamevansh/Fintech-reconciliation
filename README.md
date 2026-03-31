# 💳 Fintech Reconciliation Engine

A backend system that compares platform transactions with bank settlements and identifies mismatches with root cause analysis.

---

## 🧠 Problem

At month-end, platform transactions and bank settlements should match.  
However, due to delays, rounding errors, duplicates, and invalid data — they often don’t.

This system detects and explains those mismatches.

---

## ⚙️ How It Works

1. Takes transaction data and settlement data
2. Matches them using transaction IDs
3. Detects:
   - Missing Settlements
   - Extra Settlements
   - Late Settlements
   - Duplicate Entries
   - Rounding Differences
   - Refunds without original transaction
4. Generates a reconciliation report

---

## 🚀 Run the Project

```bash
npm install
npm start
```

*(Note: `npm start` runs `node index.js`)*

---

## 📊 Sample Output

Running the test suite on the combined dataset yields the following robust JSON report that catches every single edge case dynamically:

```json
{
  "summary": {
    "targetMonth": "2024-03",
    "totalTransactions": 10325.485,
    "totalSettlements": 7225.49,
    "difference": 3099.995,
    "issueBreakdown": {
      "missingSettlement": 0,
      "extraSettlement": 0,
      "lateSettlement": 1,
      "duplicate": 1,
      "rounding": 1,
      "invalidRefund": 1
    }
  },
  "issues": [
    {
      "type": "DUPLICATE_ENTRY",
      "id": "TXN-009",
      "severity": "MEDIUM",
      "description": "Settlement ID \"TXN-009\" appears more than once (indices 8 and 9)."
    },
    {
      "type": "LATE_SETTLEMENT",
      "id": "TXN-008",
      "severity": "MEDIUM",
      "description": "Transaction \"TXN-008\" dated 2024-03-28 (month: 2024-03) was settled on 2024-04-02 (month: 2024-04). Crosses month boundary – excluded from 2024-03 reconciliation."
    },
    {
      "type": "ROUNDING_DIFFERENCE",
      "id": "TXN-007",
      "severity": "LOW",
      "description": "Transaction \"TXN-007\" – platform amount 199.995 vs bank amount 200 (diff: 0.005). Within rounding tolerance but will accumulate in total sum."
    },
    {
      "type": "REFUND_WITHOUT_ORIGINAL",
      "id": "TXN-011",
      "severity": "HIGH",
      "description": "Refund \"TXN-011\" references originalTransactionId \"TXN-999\", but that transaction does not exist in the platform dataset. Possible data loss, fraud, or cross-system refund."
    }
  ]
}
```
