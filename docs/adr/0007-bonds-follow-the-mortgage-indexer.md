# Bonds follow the mortgage's indexer

A decision offers only the bonds that follow the same index as the mortgage. A bond on another
index turns every comparison into a bet on the gap between two indexes, which is the risk ADR-0001
refused. A bond on the same index cancels most of that risk when it is held to maturity, so the
margin left to compare is the bond's rate against the contract rate.

- **IPCA:** Tesouro IPCA+ (NTN-B Principal) and Tesouro IPCA+ com Juros Semestrais (NTN-B).
- **TR or none:** Tesouro Prefixado (LTN) and Tesouro Prefixado com Juros Semestrais (NTN-F). No
  treasury bond follows TR, and a fixed-rate contract has no index to match. A TR mortgage whose
  contract rate adds the poupança yield's additional part (ADR-0012) is offered the same bonds.

The rule only limits what a decision offers. Lots of any of the four bonds can be recorded, valued
and checked for an early sale, because the owner holds them whatever the mortgage's indexer is.

## Considered Options

- **Only nominal bonds for every mortgage (ADR-0001):** rejected. Against an IPCA mortgage, an LTN
  carries the whole IPCA risk.
- **Every bond for every mortgage:** rejected. Each mismatch is the same bet on two indexes.
- **Tesouro Selic for TR mortgages whose rate adds the poupança yield's additional part:**
  rejected. The part follows Selic only while Selic is at or below 8.5% a year. Above that it is
  0.5% a month, and TR moves little with Selic, so Tesouro Selic would be a bet on Selic rather than
  a match.
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
