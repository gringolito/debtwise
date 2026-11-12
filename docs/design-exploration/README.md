# DebtWise UI exploration — November 2026

This report evaluates DebtWise's current interface against its homeowner persona and core workflows. It also documents the prototypes built to test alternatives and recommends a direction. The prototypes run in the real React app behind a development-only variant switch: **A** is the current design, **B** is the proposed direction "Orvalho nítido", and **C** is B with an alternative Decidir verdict. Nothing here replaces the current design or `DESIGN.md`.

## Recommendation in one paragraph

Keep Liquid Glass and Orvalho. Spend the next iteration on three things the current design gets objectively wrong, and one it could do much better:

- **No phone layout.** Every route overflows at 390px. The fix is a floating glass tab bar and stacked panels.
- **Focus and small-text contrast below WCAG.** Fix it with a 2px strong-accent ring and three token changes.
- **Onboarding finds mistakes five screens late.** Add per-step checks, errors that clear as you type, and no default index.
- **Decidir states a difference without its scale and charts what both options share.** Make the verdict carry its yardstick (share of the amount, horizon, the rate at which it ties), and chart the difference itself.

The column ledger (C) is clearer than today's "Ver cenários" but weaker than B as the verdict, so it belongs behind "Ver cenários".

| # | Opportunity | Kind | Expected benefit | Effort | Verdict |
|---|---|---|---|---|---|
| 1 | Phone layout with a Liquid Glass tab bar | Objective defect | Every route usable on a phone | M | **Adopt** |
| 2 | Focus ring and contrast tokens | Objective (WCAG 2.4.7, 1.4.3, 1.4.11) | Keyboard and low-vision users can see focus and read gains | S | **Adopt** |
| 3 | Onboarding: per-step checks, clearing errors, no default index, review drill-in | Objective defects + one hypothesis | Mistakes found on the step where they're made; fewer silently wrong projections | S–M | **Adopt** |
| 4 | Decidir: verdict with yardstick and a difference chart (B) | Hypothesis, strong evidence | The owner can tell a near-tie from a win and see when investing pulls ahead | M | **Adopt after a short validation** |
| 5 | Decidir: two-column ledger (C) | Hypothesis | Shows where the money is in each option | M | **Revise:** move it behind "Ver cenários" |
| 6 | Início: near-tie framing on the answer card | Hypothesis | No winner illustration on a 0,4% difference | S | **Adopt with #4** |
| 7 | Investimentos: early-sale signal surfaced, unsigned wording | Objective (contrast) + hypothesis | The most actionable fact on the page is no longer its smallest text | S | **Adopt** |
| 8 | Shell skeleton while the app starts | Objective (blank screen) | No blank canvas on a slow start | S | **Adopt** |
| 9 | System font first (SF Pro on Apple devices) | Hypothesis | Closer to a first-party Apple app | S | **Validate** on Windows/Android before adopting |
| 10 | Round two (P9): one-line key figures, pt-BR date field, values that hug their units, cents, quieter scenario tables | Objective (owner-reported) | Dates in the owner's format, figures that don't wrap, tables that read in one line per row | S–M | **Adopt** (date field and tooltip need the production work in P9) |

## How the evidence was gathered

- **App under test:** this branch's frontend (Vite dev) and Go API on a scratch copy of the dev database, with real Tesouro Direto quotes from a Tesouro Indireto API instance (26 comparable bonds, quoted 11/11/2026 18:00).
- **Data:** the mortgage was set up through the onboarding with the DESIGN.md sample: R$ 480.000, 420 months from 15/03/2023, SAC, TR, 9,50% efetiva, appraisal R$ 650.000, MIP 0,025%, DFI 0,008%, fee R$ 25. On top of it: a R$ 20.000 prepayment, a statement (R$ 456.300 on 15/10/2026) and 4 lots imported from a CSV (one row with an unrecognised bond name).
- **Viewports:** desktop 1280×860 (DPR 1.25) and phone 390×844 (DPR 2, touch), plus 1000×800 for the band between.
- **States:** empty (fresh onboarding, empty Extratos and Investimentos), loading (API delayed 6 s), load failure (schedule and decision requests aborted), stale market data (status and verdict responses intercepted), long values, keyboard only.
- **Tools:** axe-core 4.14 (WCAG 2.0/2.1/2.2 A/AA + best practices) on 14 routes and the prepayment sheet, and Lighthouse 13.6 on 5 routes × 2 form factors. Contrast is computed from token values composited on the glass panel (white at 72% over `#F5F5F7` = `#FCFCFD`), cross-checked against Lighthouse and against pixels sampled from screenshots. Also a keyboard walk with focus-ring crops, and click counts per task.
- **Limits:** Lighthouse performance ran against the Vite dev server (unminified modules), so its performance scores are not used. No user testing was done; claims about understanding are labelled **hypothesis**. axe and Lighthouse could not judge contrast on the glass panels ("background could not be determined", 30 nodes on Início), and they don't detect missing focus indicators or responsive breakage. Both gave the current design an accessibility score of 96–100 while the manual checks below found real failures.

Screenshots live in `shots/`. `before-*` is the current design; `after-*` is the prototypes, with the same data, viewport and state unless noted.

## Findings in the current design

Objective issues are things measured or reproduced. Hypotheses need user testing before they count.

### Objective issues

**1. There is no phone layout. Every route overflows horizontally at 390px.** The 240px sidebar stays, so the content gets 150px and spills sideways. Measured `scrollWidth` at a 390px viewport:

| Route | scrollWidth |
|---|---|
| Início | 713 |
| Financiamento | 986 |
| Investimentos | 864 |
| Venda antecipada | 682 |
| Lot detail | 1060 |
| Decidir | 639 |
| Mercado | 860 |
| Títulos | 1032 |
| Index (TR) | 734 |
| Ajustes | 576 |
| Contrato | 645 |
| Importar | 521 |

The damage goes beyond scrolling. Figures clip ("R$ 436.94…" on Início), and Financiamento's key figures run into each other ("R$ 436.944,75R$ 4.717,70"). See `before-m-inicio.jpg`, `before-m-financiamento.jpg`, `before-m-titulos.jpg` and `before-m-lot.jpg`. A homeowner checking a figure at the bank counter or on the couch can't.

**2. Keyboard focus is nearly invisible, and missing in places.**
- The focus ring is the soft accent at 50%. Sampled from rendered pixels it is **1.34:1** against the glass panel, where WCAG 1.4.11 asks 3:1 for the indicator (`before-focus-nav-item.jpg`).
- Início's "Atividade recente" rows show **no** focus indicator at all (`outline: none`, no shadow; `before-focus-activity-row.jpg`).
- There is no skip link, so every page starts with 6 sidebar stops.

**3. Small text below AA.** Lighthouse and manual checks agree:
- Gains in `#248A3D` on glass are **4.28:1** (AA asks 4.5:1 for text under 18.66px). This is the 13px "Vender e amortizar renderia + R$ 1.314,60" on Compras.
- Unselected segmented-control labels `#6E6E73` sit on the translucent grey track at **4.22–4.49:1**: Saldo/Prestação/Composição, Prestações/Amortizações/Extratos, the effect control.
- Non-text marks fail 3:1:

  | Mark | Contrast |
  |---|---|
  | Soft-accent selected borders | 1.94:1 on white, 1.74:1 on tint |
  | Progress fill | 1.55:1 against its track |
  | Dashed projection line | 2.21:1 |
  | Switch off-track | 1.68:1 |
  | Empty radio rings (onboarding step 3, once nothing is preselected) | 1.26:1 |

**4. Onboarding finds empty fields five screens late, says "Valor inválido." for them, and keeps errors after they're fixed.**
- Steps 1–5 all advance with every field empty. The server first rejects at the review. You land back on step 1 under "Confira os campos destacados." with "Valor inválido." under each field: 5 clicks and 5 screens after the mistake (`before-onboarding-1-bounced-after-review.jpg`).
- The message doesn't say the field is empty or what to type.
- After typing valid values, every "Valor inválido." stays red until the next submit (`before-onboarding-1-stale-errors-after-fix.jpg`).
- **Bug:** `InsuranceStep` asks for MIP/DFI errors under the form's names (`mipRates[0].rate`), but the API reports `mip_rates[0].rate`, so a rejected MIP or DFI rate is never marked. In the bounced walk only "Valor de avaliação" was flagged on step 5, although MIP and DFI were empty too.

**5. Decidir's break-even rate prints six decimals: "Empata com amortizar se a taxa cair para 13,986635%."** `formatRate` allows up to 6 fraction digits (`lib/format.ts`). Tesouro quotes two.

**6. Decidir's chart shows nothing the verdict doesn't.** "Patrimônio ao longo do tempo" plots both net worths, which are about −R$ 427.000 rising to −R$ 380.000 because the mortgage dominates. The difference being decided is R$ 814 (0,2% of the plotted range), so the two lines overlap end to end (`before-decidir-result-10k.jpg`). The value axis is hidden, so the chart can't be read for amounts either.

**7. The app shows a blank canvas while it starts.** `MortgageGate` renders an empty `Loading` div until `/api/mortgage` answers: no sidebar and no skeleton (`before-loading-inicio.jpg`). On a slow connection this looks broken.

**8. One failed request blanks all of Início.** With the schedule and decision requests failing (after about 7 s of retries), the whole page becomes one error panel, although the mortgage, statements, prepayments and lots had loaded (`before-error-inicio.jpg`).

**9. Long values wrap or truncate.**
- Financiamento's "Quitação prevista" breaks to two lines at the 1280px design width once a prepayment moves it to "novembro de 2056" (`before-financiamento-statement-after.jpg`).
- Importar truncates "Tesouro Prefixado com Jur…" in its bond picker (`before-importar-review.jpg`).
- The onboarding review's "Hoje (nov/2026)" label clips at the chart's left edge with a 2024 contract (seen in `after-onb-review-B.jpg`; the chart is unchanged by the prototype).

**10. axe, serious: label-content-name-mismatch** on Mercado's index rows (×6) and Contrato's rows (×4). Their accessible names leave out visible text, so voice-control users can't say what they see.

**11. Smaller inconsistencies.**
- The prepayment sheet's date defaults to today, but the statement sheet's date starts empty.
- Sheets open with focus on "Cancelar" instead of the first field.
- Decidir opened from the sidebar starts at "R$ 0,00" with nothing below, while Início has already compared R$ 10.000 (`before-decidir-initial.jpg`).

### Hypotheses (need validation)

**H1. The verdict gives no sense of scale, so near-ties read as wins.**
- Início's graphite card says "Amortizar/Investir … rende mais" with a "Melhor opção" pill and an illustration of the winner.
- With today's quotes, the R$ 10.000 comparison against Prefixado 2029 differs by **R$ 39,64 over two years, 0,4% of the amount**, and it's stated with the same visual confidence as R$ 814 (8,1%) on Prefixado 2032.
- The tie rate, the yardstick that tells how fragile the verdict is, sits in a grey Footnote with six decimals.

**H2. Green for "investir" and red for "amortizar" reads as good versus bad.**
- In Decidir the hero advantage is green when investing wins and red when prepaying does.
- Prepaying winning isn't a loss for the owner; red there tells a homeowner the responsible choice was a mistake. This works against the "lower anxiety" signal.

**H3. The prepayment celebration and Decidir disagree in scale.**
- Recording R$ 20.000 says "Você economizou **R$ 95.775,63**" in juros, seguros e taxas: nominal money summed over 30 years (`before-financiamento-prepayment-celebration.jpg`).
- On the same day, Decidir says investing R$ 10.000 instead would end only R$ 814 ahead.
- Both are true, but side by side they imply prepaying "returns" almost 5× while barely losing to a bond. Not prototyped: this needs a product decision on the measure (for example, a present-value figure, or "R$ X a menos de juros até a quitação" next to the comparison).

**H4. The index correction is hidden where the owner would look for it.**
- In Prestações the balance drops by less than the amortization column says, because the TR correction is only in the expanded row.
- In our data, installment 44 showed R$ 1.211,77 of amortization against a balance drop of R$ 495,66.
- A "Correção" column, or a "saldo reduz R$ X" line, would explain the gap (`before-financiamento-desktop.jpg`).

**H5. Mercado reports values without saying what they mean for the mortgage.**
- "TR 0,1691% ao mês, de 10/11/2026 a 10/12/2026" is accurate, but the owner's question is what it adds to their balance this month. The server already knows that: it is the installment's correction.
- Selic meta reads "13,75% ao ano em 09/12/2026", a date in the future, for "the latest value" (`before-mercado-indices.jpg`, `before-mercado-index-selic-meta.jpg`).

**H6. Preselected defaults on consequential choices.** Onboarding preselects "Nenhum" as the balance correction (`before-onboarding-3-correction-desktop.jpg`). The step's own text says TR is common for Caixa and SFH contracts, so a user who skims gets silently wrong projections. (SAC is also preselected; its risk is similar but smaller, and the step frames it as "find it in your contract".)

**H7. Statement drift is jargon.**
- "R$ 177,11 · acima do arredondamento" doesn't say whether that's a problem.
- What happens next is only in the tab description ("A partir de cada extrato, o DebtWise usa o saldo do banco").

## Design direction for the prototypes: "Orvalho nítido"

Planned with the `frontend-design` process (plan → review against the brief → build → screenshot critique).

- **Kept, fixed by the brief:** Liquid Glass panels over the soft canvas, the graphite card, the first-party Apple character, and Orvalho as the accent.
- **Color:** only the values that fail are changed, all in a scoped token set (`frontend/src/prototypes/tokens.css`, active under `html[data-proto]`):

  | Token | Current | Proposed | Why |
  |---|---|---|---|
  | `--positive` (gains) | `#248A3D` (4.28:1 on glass) | `#1E7A36` (5.26:1) | AA for 13–15px gains |
  | `--accent-soft` for non-text marks (selected borders, progress, toggles) | `#82C7B7` (1.94:1) | `#3E8E7C` (3.91:1) | 1.4.11 |
  | `--ring` / focus | soft accent at 50% (1.34:1 measured) | `#2A7A6A`, 2px solid, 2px offset (4.99:1 measured) | 1.4.11 / 2.4.7 |
  | `--muted-foreground` | `#6E6E73` (4.22:1 on the segmented track) | `#636366` (4.98:1) | AA on grey tracks |
  | `--chart-projection` | `#AEAEB2` (2.21:1) | `#8E8E93` (3.26:1) | projections stay set back but visible |

  `#82C7B7` stays for decorative tints and glows only.
- **Type:** `system-ui` first, so Apple devices render SF Pro (what Wallet and Stocks use) and others fall back to Inter. The seven-size scale is unchanged; hero figures step down on phones.
- **Layout:** the glass sidebar from 900px up; below that, an iOS 26-style floating Liquid Glass tab bar with the five destinations and Ajustes as its own round glass button.
- **Principles:**
  1. The phone is a first-class surface.
  2. Every money figure carries its yardstick: horizon, share of the amount, distance to the tie.
  3. Chart what differs, not what both options share.
  4. A near-tie must not look like a win.
  5. One bold moment per screen: here, Decidir's difference chart.
- **Review against the brief:**
  - My first plan filled the area above the chart's zero line in green, since it is signed money. I revised it: a large green fill turns a calm comparison into a P&L ticker. The fill is now a flat 16% Orvalho tint above zero and a 6% graphite tint below.
  - I also removed the "Melhor opção" pill instead of restyling it ("take one accessory off").
  - The tab bar contradicts DESIGN.md's "no floating pills". It is kept deliberately: it is the canonical Liquid Glass navigation on iOS 26, and the brief fixes the Apple character.

## Prototypes, compared with the current design

Run them with `mise run local:up` and open any page with `?variant=A`, `?variant=B` or `?variant=C`. The choice is kept for the browser tab and the parameter is then removed from the address. Switch with the yellow bar or Shift+←/→. The plain arrow keys are left to the segmented controls and radios, which use them.

### P1. Phone layout and Liquid Glass tab bar (B, C)

**What changes:**
- **Navigation:** under 900px the sidebar gives way to a floating Liquid Glass tab bar (Início, Financiamento, Investimentos, Decidir, Mercado), with Ajustes as its own round glass button. This is how iOS 26 pairs a tab bar with an accessory button. From 900px up the sidebar stays as today.
- **Panels:** two- and three-figure panels stack. The Início panels stack under 720px; Financiamento's key figures and the lot values stack under 1160px, so "novembro de 2056" never wraps.
- **Headers and figures:** page headers wrap with their actions under the title. Hero figures scale (`clamp(34px, 11.4vw, 48px)`).
- **Tables:**
  - Prestações, Descontos and Cupons scroll *inside* their glass panel, with the first column pinned.
  - Títulos reflows into a grid: Vencimento folds under the name, and Compra and Venda stay side by side.
  - Importar's preview becomes one card per row under its column labels.
- **Segmented controls** span the width with 44px segments.
- **Mercado's index rows** drop the sparkline under 600px.
- **Sheets** become bottom sheets.
- **Small links and icon buttons** get a 44px hit area.

| Route at 390×844 | A scrollWidth | B scrollWidth |
|---|---|---|
| Início | 713 | 390 |
| Financiamento | 986 | 390 |
| Investimentos | 864 | 390 |
| Venda antecipada | 682 | 390 |
| Lot detail | 1060 | 390 |
| Decidir (compared) | 639 | 390 |
| Mercado | 860 | 390 |
| Títulos | 1032 | 390 |
| Index (TR) | 734 | 390 |
| Ajustes | 576 | 390 |
| Contrato | 645 | 390 |
| Importar (with a file) | 521 | 390 |

Also checked with no page overflow:
- Amortizações, Extratos, a lot with Cupons, "Ver cenários" expanded;
- the Adicionar compra, Registrar extrato and rate-change sheets;
- widths 600, 768, 900, 1000 and 1100.

Lighthouse accessibility on phone goes from 97 to 100 on Financiamento and from 96 to 100 on Investimentos, with color-contrast now passing.

Screenshots: `after-mobile-*.jpg` vs `before-m-*.jpg`, and `after-w1000-*.jpg` for the band between. In full-page captures the fixed tab bar appears mid-page; on screen it stays at the bottom.

**Critique:**
- The tab bar labels are 11px (iOS uses 10pt) and are abbreviated: "Financ.", "Invest.". The links carry the full names as their accessible names, but the abbreviations are a hypothesis to test with users. Shortening the destination names would fix it at the source.
- Prestações still needs a sideways scroll on a phone to read Juros and Amortização. A phone-specific installment row (the amount, and the balance after it, with a tap to see the rest) would be better. It needs new copy and was left out.
- "Ver venda antecipada" in Compras is a 29px inline link.

**Adopting:**
- The shell (`ProtoShell.tsx`, `shell.css`) and the rules in `mobile.css` move into the components as Tailwind responsive classes; the hook classes go.
- DESIGN.md gains a phone section.
- Effort: M. Most of it is the tables.

### P2. Focus and contrast tokens (B, C)

The same focus points before and after (`before-focus-*.jpg`, `after-focus-*-B.jpg`):

| Check | A | B |
|---|---|---|
| Sidebar focus ring, sampled pixels | 1.34:1 | 4.99:1 |
| Início activity row | no indicator | 2px ring |
| Segmented control focus | faint mint ring | 2px ring |
| Gains text on glass (Compras, Venda antecipada) | 4.28:1 | 5.20–5.30:1 (sampled) |
| Unselected segment labels on the track | 4.22–4.49:1 | 4.98–5.30:1 |
| Selected border / progress fill | 1.94:1 / 1.55:1 | 3.91:1 / 3.12:1 |
| axe violations (7 routes + Decidir C) | Mercado label mismatch ×6 | the same; prototypes add none (the dev-only switcher trips "region") |

**Tradeoff:** the stronger ring and line color are more visible in screenshots. The calm is kept because the ring only appears on keyboard focus (`:focus-visible`), and `#3E8E7C` is still Orvalho, one step darker. **Adopting** means changing four token values and the base `outline-ring/50` rule in `index.css`. Effort: S.

### P3. Onboarding that catches mistakes on the step (B, C)

What changes in B: each step checks what the browser can know (required, complete dates, positive numbers, whole months, first installment after the contract date) before advancing. Messages name the field and the fix, for example "Informe a data do contrato." and "O prazo é em meses, como 420.". Focus moves to the first problem, and a field's error clears the moment it changes. Step 3 starts with nothing selected ("Escolha como o saldo é corrigido."). Each review row is a drill-in to its own step and returns to the review. The server stays the final authority; its rejections use the same clearing behavior, and the MIP/DFI lookup is fixed in B.

| Task: first mistake → seeing it (all of step 1 left empty) | A | B |
|---|---|---|
| "Continuar" clicks | 5 | 1 |
| Screens passed | 5 | 0 |
| Message | "Valor inválido." ×4 under "Confira os campos destacados." | a specific sentence per field, focus on the first |
| After fixing a field | error stays until the next submit | error clears on change |
| Changing one term at the review | "Editar" → step 1, then Continuar ×5 | tap its row → its step → Continuar returns to the review |

Screenshots: `before-onboarding-6-review-desktop.jpg` vs `after-onb-review-B.jpg`, plus `after-onb-step1-empty-B.jpg`, `after-onb-step1-fixing-B.jpg`, `after-onb-step3-B.jpg` and `after-onb-step1-errors-B-390.jpg`.

**Critique:**
- With no default on step 3, the empty radio rings (1.26:1) become the step's main affordance and are hard to see. Adopting this needs the ring at `#8E8E93` (3.26:1) or darker.
- SAC stays preselected (see H6).
- "Voltar" stays linear after a drill-in, because jumping straight back to the review would show new terms beside an old schedule.

**Adopting:** client-side checks duplicate a subset of server rules. Keep them to presence and format (the prototype's `ProtoOnboardingChecks.ts`) and leave business rules to the server. The MIP/DFI lookup fix is a one-line bug fix worth taking independently. Effort: S–M.

### P4. Decidir: the verdict with its yardstick, and the difference over time (B)

What changes:
- The verdict and the chart become one panel.
- The headline says who comes out ahead, or "dá praticamente no mesmo" when the difference is under 1% of the amount.
- The hero figure is the unsigned amount in ink, not green or red (H2). Under it is its yardstick: "a mais até 01/01/2032, ou 8,1% dos R$ 10.000,00 em 5 anos e 1 mês."
- The tie reads both rates rounded the way Tesouro quotes them: "Empata com amortizar se a taxa cair de 15,07% para 13,99%."
- The chart plots **investing minus prepaying** around a zero line and marks where the leader takes over: "Investir passa à frente em nov. de 2028".
- The stale-data note sits inside the panel under the figure it qualifies.
- "Outros títulos" lists unsigned "R$ 344,03 a mais".

| Same decision (R$ 10.000, reduzir o prazo, Prefixado 2032) | A (`before-decidir-result-10k.jpg`, `after-decidir-A-same-state.jpg`) | B (`after-decidir-B.jpg`) |
|---|---|---|
| Is the difference big? | not stated; the reader divides R$ 814,22 by R$ 10.000 and estimates the horizon | "8,1% … em 5 anos e 1 mês" |
| How fragile is it? | "13,986635%" in grey Footnote | "cair de 15,07% para 13,99%" in Callout beside an info icon |
| What does the chart show? | two overlapping lines; the gap is 0,2% of the range | the gap itself; investing trails until nov. 2028, then leads to R$ 814 |
| Near-tie (Prefixado 2029: R$ 39,64) | "Investir rende mais", green "+ R$ 39,64" | "…dá praticamente no mesmo", "0,4% … Na prática, um empate." (`after-decidir-B-neartie.jpg`); the chart shows investing behind until redemption day |

**Critique and risks:**
- **Derived figures.** The yardsticks (share of the amount, months to maturity, the gap series, the crossover) are computed in the browser from the server's figures. DESIGN.md keeps arithmetic on index values in the server, and these are display arithmetic on decision results, but adopting it properly means the API returns `advantage_share`, `horizon_months` and a `difference` series per verdict.
- **The 1% near-tie threshold is a product choice.** It needs validation; it may belong to the amount, the horizon, or an annualised rate.
- **The interim gap depends on the server's scenario model.** Before maturity, the invest scenario values the bond as the API's cash flows do. Whether "passa à frente em nov. de 2028" is fair to show before redemption needs confirming against `GLOSSARY.md` and ADR-0007's model. If the bond isn't marked to market in between, the copy should say "no vencimento" instead.
- **Ticks below zero are absolute ("R$ 129").** The caption says "abaixo, amortizar", but some readers may still expect a sign.
- **Stale note moved inside the panel.** In the first build, the taller panel pushed the stale-data note about 400px below the figure (`before-stale-decidir-verdict-A.jpg` vs the fixed `after-stale-decidir-verdict-B.jpg`); it now sits inside the panel.

**Verdict:** adopt after a 5-user test of two tasks ("Is it worth investing these R$ 10.000?" and "What would make prepaying better?") against A. Effort: M (UI) + S (API fields).

### P5. Decidir as two columns (C)

What changes: the verdict panel shows "Se amortizar" and "Se investir" side by side at the horizon. Each column leads with its outcome, "No fim, você deve R$ …", as a large figure. The two parts that produce it, the saldo devedor and the bond's net money, sit under a hairline in Footnote grey. The difference closes the panel as a Title 2 ("Investir termina com R$ 324,84 a mais") over its yardstick in Callout.

In a first pass, the parts were Title 2 and the outcome was a smaller Headline at the bottom of each column, so the eye landed on the inputs first. The owner pointed out that the outcome and the difference are what the panel is for. They now carry the weight (`after-decidir-C.jpg`, `after-decidir-C-390.jpg`).

**Critique:**
- It makes the abstract "advantage" concrete. Investing leaves a R$ 17.915 larger balance but R$ 18.729 in hand. That is the clearest explanation of *why* in any variant.
- Even with the outcome first, it asks the reader to subtract two six-digit figures to see the difference. The closing line does it for them, but it says nothing about *when*.
- It loses to B as the verdict, but it beats today's "Ver cenários", which opens two lists of every cash flow.

**Revise:** keep B's panel and make C's columns the content of "Ver cenários" (replacing Detalhes' four rows plus the scenarios list).

### P6. Início's answer card (B)

The same headline logic as P4. The detail line carries the yardstick ("R$ 814,22 a mais até 01/01/2032, 8,1% do valor em 5 anos e 1 mês."). The eyebrow is in sentence case instead of uppercase. The "Melhor opção" pill is gone, and the winner illustration shows only for a clear winner, so a near-tie reads as one (`after-inicio-B.jpg` vs `before-inicio-desktop.jpg`).

**Tradeoff:** the card loses some delight for clear wins without the pill. The illustration alone still marks the winner. Adopt with P4.

### P7. Investimentos: the sale signal where it can be seen (B)

What changes:
- **Compras:** a quiet line under the market value, "3 compras renderiam mais vendidas para amortizar. Ver venda antecipada", then **one** list of lots in place of a group per bond. Each lot's sale hint is Callout-size with a leading glyph: "Vender e amortizar rende R$ 1.314,60 a mais" (gain in the new green, 5.2:1) or "Manter até o vencimento".
- **Venda antecipada:** signed "+ R$ 5.277,53 vender" / "− R$ 57,54 manter" become "Vender rende R$ 5.277,53 a mais" and "Manter rende R$ 57,54 a mais" (no red, since holding isn't a loss), each with its horizon ("até 15/05/2045").

| | A (`before-investimentos-compras.jpg`, `before-investimentos-venda-antecipada.jpg`) | B |
|---|---|---|
| Lots needing action, said in one place on Compras | no (only on Início's panel) | yes |
| Sale hint size / contrast | 13px, 4.28:1 | 15px, 5.2:1 |
| Headers for 4 lots | 4 group headers | 1 list |
| Signed amounts on Venda antecipada | `+`/`−`, red for holding | words, no red |
| Horizon shown | no | yes |

**Rejected while building:**
- Sorting Compras by sale gain: Venda antecipada already ranks the lots, and reshuffling an inventory as quotes move is disorienting.
- A green total in the signal line: it would compete with the hero.

Screenshots: `after-inv-compras-B.jpg`, `after-inv-venda-B.jpg` and the 390px versions. Effort: S.

### P8. The shell while the app starts (B)

`MortgageGate` renders the shell with Início's skeleton instead of an empty div. The sidebar or tab bar is visible from the first frame, so a slow start reads as loading, not broken. Effort: S. Partial failure on Início (finding 8) is not prototyped. The recommended direction is a per-panel error state: keep what loaded, and put "Tentar novamente" on the panel that failed.

### P9. Round two: quirks the owner reported (B)

These came from the owner's review of the first round. Each is fixed in B and compared with A in the same state.

| Quirk | Cause | B | Measured |
|---|---|---|---|
| Financiamento's "Quitação prevista" wraps ("novembro de / 2056") | three equal `1fr` columns of 253px, while the month needs 290px | columns are as wide as their figure (`minmax(max-content, 1fr)`) and never wrap. The panel stacks only when the content column is narrower than 840px (a container query instead of the 1160px viewport breakpoint) | figure height 82px → 41px at 1280px; the full month is kept, nothing abbreviated (`before-q-keyfigures-A.jpg`, `after-q-keyfigures-B.jpg`) |
| "Ver cenários" shows "−R$ 380.743,46" | the net worth is signed, and the mortgage makes it negative | "No fim: Você deve R$ 380.743,46", then the balance. The few reais held uninvested ("Caixa retido", R$ 0,28–1,09 here) are left out as noise | negative amounts on the panel: 2 → 0 |
| The index cell repeats "Projetado", the period and the method on every row | `IndexCell` shows everything a reading has | the value alone ("TR 0,1617%"), grey when projected. One plain sentence above the table: "Taxa TR projetada pela média dos últimos 12 meses a partir de 15/11/2026. Os valores projetados aparecem em cinza." The tooltip says the same for one reading: "…no período de 15/11/2026 a 15/12/2026." | row height 74px → 38px; columns 21 → 18 (columns empty for the whole scenario are dropped); table width 2325px → 1805px (`before-q-cenarios-A.jpg`, `after-q-cenarios-B.jpg`) |
| Dates read "04/15/2023" | `<input type="date">` writes dates in the **browser's** language, whatever the page's language. An English system shows mm/dd/yyyy | a dd/mm/aaaa text field with a numeric keyboard and a calendar button that still opens the native picker | the same in every browser language (`after-q-contrato-B.jpg`) |
| Money without cents ("480.000") | the form keeps what the API sends or the owner types | money fields show two places when not being edited and complete them on focus and blur ("480.000,00") | — |
| The change sheet's hint wraps | long hint beside a 144px input | the hint is "Para calcular a taxa.", since the label already names the amount | hint 2 lines → 1 line at 1280px and 390px (`before-q-changesheet-A.jpg`, `after-q-changesheet-B.jpg`) |

**Checked by hand:**
- Typing "01052023" gives 01/05/2023, and the row updates on "Concluir".
- The change sheet keeps its current actions.
- The page's "Cancelar" discards the edit; the server's MIP rates were unchanged afterwards.
- The tooltip opens on keyboard focus.
- Contrato stays at scrollWidth 390 on a phone.

**Tradeoffs and open points:**
- **Removing a change:** two alternatives were tried and dropped. A red trash icon in the header beside "Cancelar" put two actions there and made the least common one the loudest. A grey trash icon beside "Concluir" was quieter but no clearer than the labelled button. The sheet keeps today's "Cancelar" in the header and the labelled "Remover mudança" under "Concluir".
- **Touch:** Radix tooltips don't open on touch, so a phone can't see a projected reading's period. A tap-to-open popover is the fix if this is adopted. The method is still stated above the table.
- **Date field:** the prototype selects the whole date on focus and starts over when typed past; editing one digit in the middle isn't handled. A production version should validate impossible dates (31/02) in the browser, not only on the server.
- **Content-sized inputs, tried and reverted:** sizing each input to its text put "R$" next to the amount, but it shrank the click and focus target to a few characters. Wrapping the units in a larger focusable field fixed the target, but it left the caret outside the visible ring and gave the units different colors from their values. Inputs keep today's fixed 144px field with the units beside it. The only change kept is that units are placeholder grey while the field is empty, so "R$ 0,00" reads as one placeholder (`after-q-lotsheet-B.jpg`).
- **Typography:** the owner preferred the system font (SF Pro on Apple) over Inter but isn't sure it's the best. This matches recommendation 9's "validate": a short side-by-side of SF Pro, Inter Display/Inter Tight and one humanist alternative on the hero figures and tables would settle it.

## What would change in DESIGN.md

The specification itself isn't edited here. If the recommendations are adopted, these parts change:

- **Materiality:** "No floating pills…" needs an exception for the phone tab bar. The "Melhor opção" pill on Início goes.
- **Color: Orvalho:**
  - The soft accent `#82C7B7` moves from "selected borders, progress bars, toggles" to decorative tints only; those marks take `#3E8E7C`.
  - Positive becomes `#1E7A36`, projection lines `#8E8E93`, and secondary text `#6E6E73` → `#636366`.
  - Add a focus rule: a 2px strong-accent ring, 2px offset, on every focusable element.
  - "Signed money is the only place for gain/loss colors" gains a line: a verdict's difference is not signed money and stays in ink.
- **Typography:** "Inter as the SF Pro stand-in" becomes "system font first (SF Pro on Apple), Inter elsewhere", if P9 validates. Add the phone step-down for hero figures.
- **Layout and components:**
  - "Desktop canvas 1280px. Left glass sidebar 240px…" gains the phone layout: the tab bar under 900px, single-column panels, and tables that scroll inside their panel. Modal sheets become bottom sheets on phones.
  - Decidir is renamed **Comparar** and moves to second place, right under Início, since comparing is the app's main action: Início, Comparar, Financiamento, Investimentos; a hairline; Mercado; Ajustes pinned (`after-nav-comparar-B.jpg`, `after-nav-comparar-B-390.jpg`). Every mention of "Decidir" in DESIGN.md, GLOSSARY.md and the copy follows, including "as comparações em Decidir" under Projeções. The prototype keeps the `/decidir` address; a real rename would move it to `/comparar` with a redirect.
  - The canvas becomes a diagonal gradient from an Orvalho-tinted grey (`#E3EFEA`, top left) through neutral `#EEF0F3` to a blue-tinted grey (`#E3E9F3`, bottom right), fixed to the viewport, with the soft-accent wash kept top left. It replaces the flat `#F5F5F7` and its three radial washes. A first pass (`#EEF4F1` → `#EEF1F6`) was too faint to notice. At this strength the blue end pulled accent links to 4.21:1 and caution text to 4.26:1, so both text tokens go one step darker: accent `#26705F` (4.83:1 at the bluest, 5.89:1 on white) and caution `#A84A00` (4.72:1). Secondary grey stays at 4.91:1 or more. Glass panels separate from the canvas at 1.10–1.16:1, against 1.06:1 before (`before-canvas-A.jpg`, `after-canvas-B.jpg`, `after-canvas-comparar-B.jpg`, `after-canvas-mercado-B.jpg`, `after-canvas-B-390.jpg`).
  - "Loading shows skeletons" extends to app start.
  - The error-panel rule becomes per panel where the rest loaded.
- **Onboarding:** add per-step checks and clearing errors. Step 3 has no default. Review rows drill into their step (replacing "Editar … goes back to step 1").
- **Decidir:**
  - The verdict paragraph changes: the headline names the leader or the near-tie, the hero is unsigned ink, and the yardstick and two-rate tie sentence follow.
  - "Patrimônio ao longo do tempo" is replaced by "Diferença ao longo do tempo".
  - "Ver cenários" becomes the two-column ledger. Rates are rounded to two places.
- **Investimentos:** Compras is one list with Callout sale hints and a summary line. Venda antecipada uses words instead of signs and shows the horizon.
- **Layout and components (round two):**
  - Key figures size their columns to the figure and never wrap.
  - Dates are typed as dd/mm/aaaa regardless of the browser's language.
  - Money shows two decimal places.
  - A projected index reads grey with its period and method on demand.
  - Horizons read in words, never as negative amounts.
- **Voice:** add "near-ties are named as such" and "no signed amounts in prose".

## Not pursued, and why

- **A dark palette:** out of scope; the brief fixes the light Liquid Glass canvas.
- **Replacing Orvalho or the graphite card:** nothing measured argues for it; the failures were in specific values, which the token changes fix.
- **Restructuring navigation beyond the phone:** the six destinations are distinct and the sidebar works at desktop widths. Mercado and Ajustes being secondary is already expressed by the separator and the pinned position.
- **Fixing H3–H5 visually:** they need product decisions first (which measure the celebration reports, whether the API exposes correction per month to Mercado).

## Files

The prototype code is all development-only and marked `PROTOTYPE, throwaway`:
- `frontend/src/prototypes/`: the variant store, switcher, scoped tokens, shell, and the per-page prototype components and CSS.
- **Branches gated on `usePrototypeVariant()`** in existing components: `AppShell`, `MortgageGate`, `Dashboard`, `patterns/FieldRows` (every `InputRow`), `contract/ChangeSheet`, `decision/Comparison`, `decision/OtherBonds`, `investments/Purchases`, `investments/EarlySales`, and `onboarding/Onboarding`, `ReviewStep` and `IndexerStep`.
- **Inert `proto-*` hook classes** (and `data-label` on Importar's cells) in: `SegmentedControl`, `KeyFigures`, `LotFigures`, `Mortgage`, `EarlySalePanel`, `Sparkline`, `Indexes`, `Bonds` and `ImportPreview`.
- **CSS:** `main.tsx` imports the prototype stylesheets. Every rule is scoped under `html[data-proto]` except the switcher's own.

Variant A renders the same components with the same classes, plus the inert hooks, and the existing frontend suite passes unchanged (24 files, 397 tests). The switcher and variants are off in production builds (`import.meta.env.DEV`).
