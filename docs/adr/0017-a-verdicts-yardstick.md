# A verdict's yardstick

A decision's verdict (ADR-0011) states its advantage with what the owner needs to judge its size:
the advantage without its sign as a share of the amount, the whole months from the decision's date
to the horizon, and whether it is a near tie. The server computes all three, since the frontend does
no arithmetic on decimal values (ADR-0003), and returns them with every compared verdict.

A verdict is a near tie when its advantage, without its sign, is under 1% of the amount, judged on
the exact figures rather than on the rounded share. A near tie still has a leader, the option its
advantage favours, but the screens name it as practically the same rather than as a win, so a
R$ 40 difference over two years on R$ 10.000 doesn't read with the confidence of R$ 800.

The share is rounded half up to four places, enough for the one decimal of a percent the screens
show. A month of the horizon counts once its day of the month is reached, so 12/11/2026 to
01/01/2032 is 61 months.

## Considered Options

- **Deriving the yardstick in the browser:** rejected. It is division on decimal money, which
  ADR-0003 keeps in the server, and the near-tie threshold is a rule of the comparison, which
  belongs with the code that compares.
- **A threshold on the advantage per year, or on an annualised rate:** not adopted for now. A share
  of the amount is what the screens state next to the figure, so the owner can check the rule
  against what they read. A per-year measure can replace it if owners find long horizons misjudged.
- **A fixed amount, such as R$ 100:** rejected. It would call R$ 90 on R$ 500 a tie and R$ 110 on
  R$ 500.000 a win.
