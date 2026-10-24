# Decimal arithmetic for money and rates

All money, rates, prices and index values in the backend use arbitrary-precision decimals from
`cockroachdb/apd`, wrapped in our own `decimal` package. Floating point is never used for them.
Treasury pricing truncates and rounds at fixed decimal places, and a verdict has to reproduce bank
statements and Tesouro prices to the cent. Binary floats can't represent those values exactly. The
wrapper fixes one precision context and the project's rounding and truncation rules in a single
place, and keeps `apd`'s mutable, context-passing API out of domain code.

## Consequences

The API carries these values as decimal strings. The frontend formats them and never does
arithmetic on them.
