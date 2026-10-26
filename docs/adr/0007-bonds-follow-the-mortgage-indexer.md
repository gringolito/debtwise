# Bonds follow the mortgage's indexer

A decision offers only the bonds that follow the same index as the mortgage. A bond on another
index turns every comparison into a bet on the gap between two indexes, which is the risk ADR-0001
refused. A bond on the same index cancels most of that risk when it is held to maturity, so the
margin left to compare is the bond's rate against the contract rate.

- **IPCA:** Tesouro IPCA+ (NTN-B Principal) and Tesouro IPCA+ com Juros Semestrais (NTN-B).
- **TR, poupança yield or none:** Tesouro Prefixado (LTN) and Tesouro Prefixado com Juros
  Semestrais (NTN-F). No treasury bond follows TR or the poupança yield, and a fixed-rate contract
  has no index to match.

The rule only limits what a decision offers. Lots of any of the four bonds can be recorded, valued
and checked for an early sale, because the owner holds them whatever the mortgage's indexer is.

Matching on IPCA still leaves three gaps, and comparisons model them instead of assuming them away:

- **Tax.** Income tax falls on the bond's whole nominal gain, the IPCA correction included, while
  the avoided cost is never taxed. Higher IPCA grows both scenarios, but part of the bond's
  correction goes to tax, so the advantage still drops a little as IPCA rises. Over 10 years at 15%
  tax against IPCA + 5%, IPCA at 3% or at 7% moves the break-even rate of an NTN-B Principal by a
  quarter of a point, and an LTN's by four and a half points.
- **Timing.** The mortgage corrects by the IPCA of the second month before each anniversary
  (ADR-0006). An NTN-B's value takes the previous month's IPCA on each 15th and a projection of the
  current month between them. The two differ by about one month of IPCA at each end of a
  comparison, and a longer horizon doesn't shrink that.
- **Selling early.** The match holds at maturity. Before it, an NTN-B's market value moves with real
  rates, by a lot on long maturities. The early sale check measures that risk, and the match does
  nothing to remove it.

## Considered Options

- **Only nominal bonds for every mortgage (ADR-0001):** rejected. Against an IPCA mortgage, an LTN
  carries the whole IPCA risk.
- **Every bond for every mortgage:** rejected. Each mismatch is the same bet on two indexes.
- **Tesouro Selic for TR or poupança-indexed mortgages:** rejected. The poupança yield follows
  Selic only while Selic is at or below 8.5% a year. Above that it is TR plus 0.5% a month, and TR
  moves little with Selic, so Tesouro Selic would be a bet on Selic rather than a match.
- **Tesouro RendA+ and Educa+:** rejected. They pay out in monthly installments for years after a
  conversion date set for retirement or school, so they have no single maturity to set a horizon.
- **Poupança and CDI-linked private credit (CDB, LCI, LCA):** still rejected, as in ADR-0001.
  Poupança funds residential mortgages and so pays less than a mortgage costs, and private credit
  adds credit risk over sovereign debt.

## Consequences

- IPCA needs a projection. An IPCA mortgage's future months need one anyway.
- Valuing an NTN-B needs its VNA, which Tesouro computes from IBGE's IPCA index numbers. The monthly
  variations in SGS 433 are rounded to two places and drift from it by a few cents.
- Changing the mortgage's indexer changes the bonds a decision offers.
