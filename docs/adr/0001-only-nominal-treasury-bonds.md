---
status: superseded by ADR-0007
---

# Only nominal treasury bonds compete with a prepayment

DebtWise compares a prepayment only against Tesouro Prefixado (LTN) and Tesouro Prefixado com Juros
Semestrais (NTN-F). Inflation-linked bonds carry IPCA volatility that can wipe out the margin over
the mortgage cost, so the risk is not worth it. Poupança funds residential mortgages and so always
pays less than a mortgage costs. CDI-linked private credit (CDB, LCI, LCA) adds credit risk over
sovereign debt.

## Consequences

IPCA and CDI series are not needed to value investments. They are loaded only if a mortgage indexer
or another feature uses them.
