# DFI on the appraisal value corrected by TR

On a TR-indexed mortgage, DFI is charged on the appraisal value corrected by TR. The appraisal value
is corrected once a month, on each installment's due date from the second installment's on, by the
TR of the months between due dates that end by it, rounded to centavos. The first installment
leaves it as signed. The pro rata die updates of the balance (ADR-0006) don't apply to it: clause
6.2's update is of the balance, and with the appraisal value updated along with it on the #37
contract, the rates fitted in #70 miss Caixa's insurance by up to R$ 0.08 (#74). A month whose
value is missing corrects nothing. A projected TR corrects it, as it does the balance (ADR-0009).
MIP stays on the corrected outstanding balance. Each premium is charged at the rate in force on
the installment's due date.

The #37 contract's clause 4.6 sets both premiums: "o prêmio Morte e Invalidez Permanente (MIP)
calculado sobre o saldo devedor atualizado na forma do item 6 e o prêmio Danos Físicos ao Imóvel
(DFI) sobre o valor da garantia atualizada pelo índice de atualização aplicável aos depósitos de
poupança". With DFI on the appraisal value as signed, the insurance DebtWise charged drifted from
Caixa's by up to R$ 0.50 by the 6th installment, past #51's 0.001% tolerance. With the clause's
rule, the best-fit rates reproduce Caixa's insurance on installments 1 to 6 within R$ 0.02 (#70).

IPCA-indexed mortgages and mortgages without an indexer charge DFI on the appraisal value as
signed. The clause names the poupança index, and no IPCA contract has been checked.

## Considered Options

- **The appraisal value as signed:** replaced. It doesn't follow the clause and misses Caixa's
  insurance by up to R$ 0.50 by the 6th installment.
- **Correcting the appraisal value a month after the balance:** rejected. It misses Caixa's
  insurance by up to R$ 0.056, against R$ 0.014 when both are corrected together.
- **Correcting the appraisal value by IPCA on IPCA-indexed mortgages:** not taken. The clause
  found is specific to the poupança index.
