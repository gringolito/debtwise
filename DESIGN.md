---
name: DebtWise · Orvalho nítido
colors:
  background: '#EFF1F4'
  surface: '#FFFFFF'
  on-surface: '#1D1D1F'
  on-surface-secondary: '#636366'
  on-surface-tertiary: '#AEAEB2'
  separator: '#E5E5EA'
  control: '#8E8E93'
  primary: '#1D1D1F'
  on-primary: '#FFFFFF'
  primary-hover: '#2C2C2E'
  on-primary-secondary: '#A1A1A2'
  accent: '#26705F'
  accent-mark: '#3E8E7C'
  accent-soft: '#82C7B7'
  accent-tint: '#E8F5F1'
  focus: '#26705F'
  positive: '#1E7A36'
  caution: '#A84A00'
  caution-tint: '#FFF4E5'
  critical: '#D70015'
  chart-mortgage: '#1D1D1F'
  chart-investment: '#3E8E7C'
  chart-projection: '#8E8E93'
  chart-amortization: '#3E8E7C'
  chart-interest: '#C7C7CC'
  chart-charges: '#8E8E93'
typography:
  large-title: { fontFamily: system-ui, fontSize: 34px, fontWeight: '700', lineHeight: 41px, letterSpacing: '-0.022em' }
  title-2: { fontFamily: system-ui, fontSize: 22px, fontWeight: '600', lineHeight: 28px, letterSpacing: '-0.017em' }
  headline: { fontFamily: system-ui, fontSize: 17px, fontWeight: '600', lineHeight: 22px, letterSpacing: '-0.01em' }
  body: { fontFamily: system-ui, fontSize: 17px, fontWeight: '400', lineHeight: 24px, letterSpacing: '-0.01em' }
  callout: { fontFamily: system-ui, fontSize: 15px, fontWeight: '400', lineHeight: 21px }
  footnote: { fontFamily: system-ui, fontSize: 13px, fontWeight: '400', lineHeight: 18px }
  caption: { fontFamily: system-ui, fontSize: 11px, fontWeight: '500', lineHeight: 13px, letterSpacing: '-0.01em' }
  hero-figure: { fontFamily: system-ui, fontSize: 56px, fontWeight: '600', lineHeight: 60px, letterSpacing: '-0.03em' }
  hero-figure-phone: { fontFamily: system-ui, fontSize: 'clamp(34px, 11.4vw, 48px)', fontWeight: '600', lineHeight: '1.1', letterSpacing: '-0.03em' }
breakpoints:
  phone: below 600px
  sidebar: from 900px
spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 40px
  xxl: 64px
roundness: 12px
---

# DebtWise design system

DebtWise helps a Brazilian homeowner understand their mortgage and decide, month by month, whether
spare money is better spent prepaying the mortgage or invested in Tesouro Direto bonds. The
interface language is Brazilian Portuguese; money is BRL (`R$ 1.234,56`), dates are
`12 de mar. de 2027` in prose and `12/03/2027` in tables.

## Signals

Tranquility, trust and partnership. DebtWise is a calm companion that explains and guides; it
reports, and the owner decides. Every visual choice should lower anxiety about a 35-year commitment.

## Materiality and mental model

The feel of a first-party Apple app (Wallet, Apple Card, Stocks, System Settings) in Liquid Glass.
One idea per screen. Frosted glass panels over a soft canvas; hierarchy comes from typography and
whitespace. Hairline separators for structure inside panels.

- Glass panels are white at 72% with a 24px backdrop blur, a white rim at 85% instead of a grey
  border, an inset white highlight along the top and a near-invisible drop shadow
  (`0 10px 30px -5px rgba(0,0,0,0.04)`). Every panel on a page is glass; panels inside a modal sheet
  or dialog, and selectable cards, stay plain white.
- The canvas is a diagonal gradient, fixed to the viewport, from a faint Orvalho-tinted grey
  (`#EEF4F1`, top left) through a neutral `#EFF1F4` to a blue-tinted grey (`#E3E9F3`, bottom
  right), under a faint soft-accent wash top left. It and the graphite card are the only gradients.
- The sidebar is glass too: white at 75% with a 28px blur and a hairline at 6% black on its right.
- The phone's tab bar and its Ajustes button float as glass capsules: white at 72% with a 24px
  blur, a white rim at 90% and a soft lift shadow, so the page reads under them.
- Sheets and popovers keep the whisper-soft sheet shadow (`0 8px 24px rgba(0,0,0,0.08)`).
- No floating pills, badge dots, stock illustrations or emoji, except the phone's tab bar, which is
  Liquid Glass's own navigation, and Início's answer card as described there.

Graphite is the signature: primary buttons and at most one card per screen are near-black, like a
premium card. The graphite card is glass as well: a diagonal gradient from `#222224` to `#151517`
at 92–96%, a white rim at 18%, a deep shadow and a 1px rim light along its top edge that fades in
from white to the soft accent. A graphite surface carries only white and grey text, such as the
Início hero that states the current suggestion. Any card that shows a colored result (a green gain,
a red loss, a caution note) is a white panel instead, such as the verdict on Comparar. Graphite never
fills the sidebar, summary panels or page backgrounds.

## Color: Orvalho

The accent is **Orvalho**, a sea-green (verde-água) like sea glass: fresh, reassuring, collaborative.

- The canvas is the gradient above; panels white glass, text `#1D1D1F`. The accent appears only in
  its accent roles below and the faint top-left wash.
- Secondary text is `#636366` on white and `#A1A1A2` on graphite, which keeps AA on the canvas's
  bluest corner and on a segmented control's grey track. Calm comes from restraint, not from faint
  text. `#AEAEB2` (tertiary) marks what is placeholder, disabled or set back: placeholders, a unit
  beside an empty field, disabled states, a checklist step still to do and the 404 figure. Text the
  owner has to read is secondary grey or darker.
- **Primary buttons are graphite** with white text, 12px radius, 44px tall. On a graphite card the
  button inverts to white with graphite text, lifted by a soft shadow and a white inner highlight.
  One primary button per screen.
- Accent roles:
  - `#26705F` (strong) only for text-weight uses: links, the selected navigation label and icon,
    text buttons, and the focus ring.
  - `#3E8E7C` (mark) for marks that have to be seen at 3:1: selected borders, progress bars,
    toggles, the checked radio, the underline of an editable value and the chart lines below.
  - `#82C7B7` (soft) only for decoration: glows, the celebration's ring and ripples, the icon on the
    welcome's graphite tile.
  - `#E8F5F1` (tint) for selected card backgrounds, the selected navigation item and highlighted
    rows.
- Controls that have to be found before they are used, an empty radio ring and a switch's off
  track, are `#8E8E93`, at 3:1.
- Focus: every focusable element shows a 2px solid ring in the strong accent, 2px off its edge, on
  keyboard focus only; inside the graphite card the ring is white. A row of an inset grouped list
  draws it inside its edge.
- Charts: the mortgage ("Amortizar") series is graphite, the investment ("Investir") series is
  `#3E8E7C` at 2.5px, projections are dashed `#8E8E93`. A dotted strong-accent line marks today;
  its label sits above the plot on the side of the line with more room, clear of the value axis.
  Financiamento's "Composição" stacks amortization in `#3E8E7C`, interest in light grey `#C7C7CC`
  and insurance and fee in mid grey `#8E8E93`, so what pays the home off stands out from its cost.
- Green `#1E7A36` marks money the owner gains and red `#D70015` money lost and destructive actions,
  both only on white, and the accent is never used for either. A comparison's difference between
  two options is neither: Comparar's verdict and Início's answer state it in the text colour, since
  prepaying winning is no loss. Orange `#A84A00` only for stale market data. The three exceptions
  are a statement's difference on Financiamento, green with a check when it is within rounding and
  orange with a dot when it is drift, an imported row whose bond name wasn't recognised, flagged in
  orange, and the freshness dot of each market data source on Ajustes, green when fresh and orange
  otherwise.

## Typography

Three roles. Body text takes the system font first, so Apple devices render SF Pro, as Wallet and
Stocks do, with Inter where there is none; tabular numerals everywhere. Headings, every `h1` to `h6`
and a dialog's title, take the heading font, which is the body font until a heading face is chosen.
The wordmark is lettering rather than text: "Debtwise" outlined from Inter Semibold at Title 2 with
tight tracking, so the brand keeps its shape whatever fonts the app uses. Large Title 34 bold for
page titles, Title 2 22 semibold for sections, Headline 17 semibold, Body 17, Callout 15 for
explanations, Footnote 13 for metadata and Caption 11 medium for the tab bar's labels alone. Key
figures use a 56px semibold hero figure when a screen has one figure alone; figures sharing a row,
such as the Início summary panels, use Large Title at semibold weight. On a phone the hero figure
scales with the screen, `clamp(34px, 11.4vw, 48px)`, and Large Title figures inside panels step
down to 28px, while page titles keep 34px. A key figure never wraps: "novembro de 2056" stays on one
line, and its panel stacks instead. These eight sizes are the whole scale.

## Layout and components

- Desktop canvas 1280px. From 900px, a left glass sidebar 240px with only the logo, the Debtwise
  symbol at 32px beside "Debtwise" in Title 2 (no subtitle, no badge), and these items with thin
  line icons: Início, Comparar, Financiamento, Investimentos; a hairline; Mercado; and Ajustes
  pinned at the bottom. Comparar sits right under Início, since comparing is the app's main
  action. The current item, including on its sub-pages, has the tint background and the strong
  accent label and icon; the others are Callout in secondary grey. No top bar, no footer.
- Under 900px the sidebar gives way to a floating tab bar 12px off the bottom and the sides, above
  the home indicator: one glass capsule with Início, Comparar, Financiamento, Investimentos and
  Mercado as icons over Caption labels ("Financ.", "Invest." where the name doesn't fit; the full
  name is what a screen reader hears), and Ajustes as its own 60px round glass button beside it,
  the way iOS pairs a tab bar with an accessory. The current tab has the tint and the strong
  accent. Pages leave room under them for the bar.
- Content column max 880px, centered, 40px top margin; 24px top and 16px sides on a phone. 8px
  grid; 16px inside rows, 24px between groups, 40px between sections.
- Phones, under 600px, are a first-class surface, and no page scrolls sideways. Panels of figures
  stack into one column with hairlines between them; page headers wrap with their actions under
  the title; a segmented control that heads a section or panel spans the width with 44px
  segments; every small link, icon button and in-row control has a 44px touch area.
- Inset grouped lists: glass 12px-radius panels, 52px rows with inset hairlines, label left, value
  right, chevron for drill-in. Section headers are Footnote uppercase in secondary grey.
- Editable values inside sentences are underlined in the accent mark.
- Values the owner types in place sit right-aligned on their row as borderless inputs 144px wide,
  with the unit ("R$", "meses", "% ao mês") beside them, in tertiary grey while the field is empty,
  so "R$ 0,00" reads as one placeholder, and secondary grey once it has a value. Money shows its
  cents ("480.000,00") whenever it isn't being typed. Dates are typed as dd/mm/aaaa whatever the
  browser's language, digits only on a numeric keyboard, with a calendar button on the right that
  opens the system's date picker; a date that doesn't exist, such as 31/02, reads "Essa data não
  existe." before anything is sent. A value the server rejected turns red and its message, in
  Portuguese, sits under the row's label in red Footnote; a whole list the server rejected carries
  its message in red Footnote under the list. A rejection the screen has no words for reads "Valor
  inválido.".
- Segmented controls for two- or three-way choices: a translucent grey track with the selected
  segment raised in white. A destination split into sections, such as Mercado (Índices,
  Títulos) and Investimentos (Compras, Venda antecipada), switches them with a segmented control
  at the top of the page. Large selectable cards with a small schematic chart for conceptual
  choices like SAC vs Price; a selected card has the accent-mark border, the tint background and a
  check in an accent-mark disc.
- Buttons: graphite primary; white on a graphite card; plain text buttons in secondary grey
  ("Cancelar", "Voltar", "Mudar valor"); links and text actions in the strong accent, except a
  destructive one beside them, such as "Excluir" next to "Editar", which is red text.
- Tables of figures sit on the same white panel as an inset grouped list: Footnote uppercase
  column headers in secondary grey, 52px rows with hairlines, labels left and figures right. When a
  table is wider than its panel, as on a phone, it scrolls sideways inside the panel with its first
  column pinned, and the page itself stays still.
- An empty destination shows, centered, the destination's icon on an accent-tint tile, a Title 2
  that says nothing is there yet, one Callout sentence on why to add it, the graphite button that
  adds it and any other way in as an accent text action.
- Modal sheets for recording something over a page: a centered 520px white panel with the sheet
  shadow over the page dimmed by graphite at 30% and blurred. The title (Title 2) sits left and a
  plain "Cancelar" right; the content is inset grouped lists; the primary button spans the width.
  Under 600px a sheet, and a confirmation, is a bottom sheet: full width, its top corners rounded,
  sliding up from the bottom edge, and scrolling inside when it is taller than the screen.
- Loading shows skeletons: blocks the shape of the content, in graphite at 5% so they read on both
  the canvas and white panels, pulsing gently. While the app starts, the sidebar or tab bar is
  already there, with Início's skeleton in the page.
- Confirmations of a deletion: a centered 400px white panel with the sheet shadow over the page
  dimmed and blurred as for a modal sheet, its content centered: the Headline question ("Excluir
  financiamento?"), one Callout sentence in secondary grey on what goes and what stays, then two
  full-width buttons stacked, the action in solid red with white text and "Cancelar" in graphite
  text on the canvas gray. Deleting the mortgage, the deletion that takes the most with it, also
  shows a red "!" in a red-tint disc above the question.
- A celebration follows a new record that improves the owner's position. It takes the place of the
  sheet that recorded it, in the same 520px frame and without animation, so the modal reads as one
  whose content changes; its content is centered. The motion is in its 160px icon over the Title 2
  that says what happened: a check that pops in on a tint disc and draws its soft-accent ring and
  strong-accent tick, or the action's own accent icon, which pops in and twists. Then, under a
  Footnote uppercase lead such as "Você economizou", the action's main figure as a hero figure,
  green when it is money gained, with a grey Title 2 asterisk raised beside it and what it measures
  in Callout grey under it; the other figures as rows of a white grouped list; a full-width
  graphite "Continuar"; and under it, right-aligned in Footnote grey, "* Baseado na projeção
  atual.", since the figures are the current projection's. Totals across records belong on a
  summary screen, not here. A milestone, such as a mortgage paid off, also ripples
  soft-accent rings out of its icon. When the device asks for reduced motion, the icon stands still
  and fully drawn. After a correction, such as an edited or deleted prepayment, the same panel
  informs instead: no icon, the figures as before → after where they changed, and "Entendi".
- A screen that fails to load shows a white error panel in place of its content: a cloud-off icon
  in a grey circle, a Headline saying what could not load, "Verifique sua conexão. Seus dados
  estão salvos." in Callout, and a graphite "Tentar novamente" that retries the failed request.
- Unknown addresses open a full-screen page without the sidebar: the wordmark top left, "404" as a
  hero figure in tertiary grey, "Esta página não existe", "O endereço pode ter mudado." and a
  graphite "Voltar ao início".
- Market data freshness is shown next to what it affects: on Início and Comparar, a Footnote
  directly under the answer or verdict card, in caution orange with a clock icon, naming each
  source the answer reads that is not fresh with the date of its last update, then an
  "Atualizar" text action.
- Checklists, such as Início's "Próximos passos", are inset grouped lists: a step still to do is an
  empty tertiary circle and a chevron; a done step has an accent check, its label struck through in
  secondary grey and "Concluído" as its value. A done step is not green: green stays for money
  gained and the exceptions listed under Color.

## Início

The Large Title "Início" over the weekday and date in Callout grey ("Domingo, 8 de novembro"),
then:

- The answer card, the screen's one graphite card, for R$ 10.000,00 prepaid today to shorten the
  term: a glowing soft-accent dot before "Na projeção atual, para R$ 10.000,00 hoje" in Footnote
  grey, in sentence case, then the verdict as a Title 2, the same headline as Comparar's ("Investir
  em Tesouro Prefixado 2032 rende mais", "Amortizar rende mais que Tesouro Prefixado 2029", or "…
  dá praticamente no mesmo" for a near tie), and a Callout line that states its yardstick, the
  difference in semibold white: "R$ 814,22 a mais até 01/01/2032, 8,1% do valor em 5 anos e 1
  mês." A near tie reads "R$ 39,64 de diferença até …", and no difference at all "Nenhuma diferença
  até 01/01/2032.". A white "Ver comparação" opens Comparar with the amount and compares at once; a
  plain "Mudar valor" opens it with the amount to change. On its right, only when one option
  clearly wins, a 160px glass illustration of it, a rising bar chart for investing or a house with
  a downward arrow for prepaying; a near tie shows none, and neither does a phone. With no verdict
  to state, the card reads "Amortizar ou investir? Veja a comparação." with "Comparar agora". The
  stale-data note sits under the card.
- Two white summary panels side by side, stacked on a phone, each titled in Footnote uppercase
  grey, with its figure in Large Title semibold under a Callout label and a hairline drill-in row at
  the bottom:
  - Financiamento: "Saldo devedor", "Quitação prevista em março de 2058", an accent-mark progress
    bar over "N% pago", and the next installment ("Próxima prestação · 15/11 · R$ 4.809,89")
    opening Financiamento.
  - Investimentos: "Valor de mercado líquido", the counts ("3 compras · 2 títulos"), a Footnote
    when lots without a market value were left out of the total, and the early sale summary
    ("Venda antecipada · 1 vale a pena agora") opening Venda antecipada. With no lot, the panel
    holds the investments icon on an accent-tint tile, one Callout sentence and an accent
    "Adicionar compra".
- "Próximos passos": set up the mortgage, record the bank's latest statement, add the Tesouro
  purchases, each marked done from what is recorded. The checklist goes away once all three are.
- "Atividade recente": the latest three statements and prepayments, newest first, as an inset
  grouped list opening Financiamento. A statement has an accent check on the tint and its
  difference; a prepayment has a clock on grey and its amount on the right. Hidden while there is
  none.

## Financiamento

Three key figures in a white summary panel (Saldo devedor, Prestação atual, Quitação prevista), the
balance chart with a Saldo, Prestação and Composição segmented control, then Prestações,
Amortizações and Extratos in a segmented control with the page's one primary button on its right
("Registrar amortização", or "Registrar extrato" on Extratos). Each key figure's column is as wide
as its figure, so none wraps; when the content column is too narrow for three side by side, the
panel stacks them.

- The chart reads its year and value axes, with no fill under the line, since panels carry no
  gradients. A hollow ring marks each installment a prepayment followed.
- Prestações shows six rows around the current installment, which has the tint background and an
  "Atual" label in the strong accent and starts expanded; a row's chevron expands its correction,
  rate, insurance and fee as columns, each a Footnote label over its value. A strong-accent info
  icon beside the correction and the rate opens, on hover or focus, a graphite tooltip with the
  index readings behind them and their periods. "Ver todas as N prestações" shows every row.
- Amortizações shows the total prepaid and the months the term shrank in a summary panel above an
  inset grouped list, newest first, each row drilling into the sheet that edits or deletes it.
- Extratos compares the bank's balance with the calculated one, newest first.
- The sheets preview before saving: the new payoff month or installment for a prepayment, the
  calculated balance and the difference for a statement.
- Recording a prepayment replaces its sheet with a celebration of the money it saves. A prepayment
  that shortens the term also shows the months it took off and the new payoff month; one that
  lowers the installment shows the installment before → after. One that pays the mortgage off is a
  milestone, "Financiamento quitado!", with the money and the months saved. Saving an edit informs
  of the payoff month, or the installment, and the prepayment's money saved, before → after;
  deleting one informs of the payoff month, the current installment and the money all prepayments
  save.

## Onboarding

Setup Assistant pattern: a welcome screen, then six steps. While no mortgage is registered, every
page of the app opens it in place of the page (unknown addresses still show the 404); once one
is, it is unreachable. Full-screen, no sidebar, a thin accent-mark progress bar on the top edge,
the wordmark top left, "Passo N de 6" once in footnote grey at the top right, a centered 560px
column, a Large Title that asks a question, one sentence of context, the inputs, a graphite
"Continuar" and a plain "Voltar" that keeps what was typed.

Each step checks what it can before it goes on: that every field it needs is filled and well
formed, such as a complete date, an amount over zero, the term in whole months and a first
installment after the contract date. A field that fails says what to type in red Footnote under
its label ("Informe a data do contrato.", "O prazo é em meses, como 420."), focus moves to the
first one, and each message goes away as soon as its field changes. The business rules stay with
the server, which still answers at the review.

- Boas-vindas (unnumbered): the graphite tile with the house icon, three inset rows of what
  DebtWise does, and a graphite "Configurar meu financiamento".
1. O contrato: data do contrato, valor financiado, prazo, primeira prestação, typed in place in an
   inset grouped list; the term also reads in years
2. Sistema de amortização: SAC ou Price as two selectable cards with a schematic of the
   installments, framed as "find it in your contract", not as advice
3. Correção do saldo: TR, IPCA ou nenhum as selectable rows, with a tint note on why it matters.
   Nothing is chosen until the owner chooses, since a wrong index silently skews every projection.
4. Juros do contrato: the annual rate as a hero figure underlined in the accent mark, a segmented
   Efetiva/Nominal, a toggle for the poupança part, and "Adicionar mudança" for each later rate
   change, which opens its own group
5. Seguros e taxas: valor de avaliação, MIP, DFI, taxa de administração (left empty, it is none),
   with a text button that opens what each insurance charged on the first installment and derives
   its rate from it
6. Revisão: a white panel with the payoff month and the current installment (the first one while
   none is due) over the balance curve, graphite up to today and dashed after it, then the informed
   terms, each row a drill-in to the step that asked for it; "Continuar" there returns to the
   review with its schedule computed again, while "Voltar" keeps walking back step by step.
   "Concluir" saves and opens Início, with a celebration over it, which follows no sheet and
   appears with the page, without animation: "Financiamento configurado!" under the check, the
   payoff month as the one row, which carries no asterisk since it follows from the contract, and
   "Próximo passo: registre uma amortização ou um investimento." Editing the terms later celebrates
   nothing.

The review shows the schedule the server computes for the typed terms before anything is saved.
When the server rejects the terms, on the review or on "Concluir", the owner goes back to the
first step that asks for a rejected field, with "Confira os campos destacados." above it and each
rejected field marked.

## Contrato

The contract opens from Financiamento as a settings page: a "Financiamento" back link in the strong
accent above the Large Title "Contrato", with a plain "Cancelar" and the graphite "Salvar" on the
title's right. "Salvar" sends every term at once and returns to Financiamento; "Cancelar" and the
back link discard what was changed. The sections are inset grouped lists:

- Contrato: data do contrato, valor financiado, prazo, primeira prestação and valor de avaliação,
  typed in place.
- Cálculo: the amortization system (SAC, Price) and the balance correction (TR, IPCA, Nenhum) as
  segmented controls on their rows.
- Juros do contrato, Seguros (MIP and DFI together, MIP first) and Taxas: one drill-in row per
  dated change, named by where it starts ("MIP a partir de 15/03/2023") with its value on the
  right, in date order, and an accent "Adicionar mudança" text action under the list. A contract
  rate as registered also reads what it equals in the other basis, as the server converted it
  ("12,00 % ao ano · nominal · equivale a 12,68% efetiva"). The equivalent goes away once the
  rate or its basis is changed, until it is saved, since only the server converts rates.

A change opens in a modal sheet: its start date, its value and, for a contract rate, the basis as a
segmented control and the poupança part as a toggle. A new insurance change picks MIP or DFI first.
The change in force at the first installment also offers what the insurance charged on it, with
the hint "Para calcular a taxa.", which derives the rate. "Concluir" keeps the change on the page
until "Salvar"; an existing change also has "Remover mudança" in the destructive style under
"Concluir", while the header keeps "Cancelar" alone. A Footnote under the lists says each change
holds from its date until the next one.

## Investimentos

A lot is a "compra". Investimentos opens on Compras; once a lot is recorded, the page title carries
"Importar planilha" as an accent text action and a graphite "Adicionar compra", and a segmented
control switches Compras and Venda antecipada. With no lot, the page shows only its empty state.

- Compras: a white panel titled "Valor de mercado" with the net total as a hero figure, "Líquido, se
  vender tudo hoje" in Callout under it and, when any lot would do better sold, one quiet Callout
  line in secondary grey, "2 compras renderiam mais vendidas para amortizar.", with an accent "Ver
  venda antecipada"; then, under a hairline, the gross total, then IR, IOF and Custódia each with
  what it takes off it. Then every lot in one inset grouped list, the bonds maturing first leading.
  Each lot is a row with the bond's name in Headline and its net Market Value, or why it has none,
  on the first line; "Compra em" its date with its rate in Callout grey under it; then, at Callout
  size behind a glyph, what its early sale check favours: a rising arrow in green and "Vender e
  amortizar rende R$ 1.314,60 a mais" with the amount green, or a calendar clock in grey and "Manter
  até o vencimento".
- A lot's detail: an accent "‹ Investimentos" back link, the bond's name as the Large Title with
  "Editar" and a red "Excluir", one line on the purchase, then the net Market, Accrual and Maturity
  Values side by side in one white panel. Under it, a white panel on the early sale with its own
  Reduzir prazo / Reduzir prestação segmented control: a Title 2 verdict, one sentence on how much
  more the better option renders, the amount green only when selling wins, and what the comparison
  assumes in Footnote. Then the Descontos table (gross, income tax, custody fee, IOF and net of each
  value) and the Cupons table for coupon bonds, each scrolling inside its panel on a phone, and the
  date of the values and any projection they read, centered in Footnote.
- Venda antecipada: one sentence on what is compared beside the effect's segmented control, then
  every lot in one inset grouped list, the lots most worth selling first. Each row says in words
  which option renders more and until when: "Vender rende R$ 5.277,53 a mais" with the amount in
  green, or "Manter rende R$ 57,54 a mais" in the text colour, since holding is no loss, over "até
  15/05/2045" in grey. On a phone the outcome moves under the bond's name.
- Adicionar compra and Editar compra are sheets: the bond picked from those Tesouro Direto quotes
  ("Outro título" types any other), the purchase date, rate, unit price and quantity typed in
  place, a Footnote on where to find them, and a tinted "Valor investido" row with what the
  server computes for them, before saving.
- Adding a lot replaces its sheet with a celebration, "Compra registrada!": "Você vai ganhar" over
  the gain at maturity, net of taxes and custody, as the hero figure; "Valor investido" and
  "Líquido no vencimento" as rows; and one line on how the lot compares with prepaying the same
  amount on its purchase date to shorten the term, by the bond's maturity. A lot whose values wait
  on the IPCA shows only the amount invested, and one that pays back no more than it cost shows no
  gain. Saving an edit informs of the net at maturity and the advantage over prepaying, before →
  after. Deleting a lot shows no notice, since its confirmation already names what goes. Only
  figures that read a projected index carry the asterisk: a Prefixado's gain is fixed, its
  comparison with a TR mortgage is not. In a row the asterisk follows the row's name, so the
  figures keep their right edge. No figure carries a sign: the notice's row reads "Vantagem sobre
  amortizar" while investing wins, "Desvantagem sobre amortizar" while prepaying does, and
  "Comparado a amortizar" with "R$ X a mais" or "R$ X a menos" when the edit turned it around.
- Importar planilha: the file's name and row count with "Trocar arquivo", then every row in a
  table, each value editable in place; on a phone each row is a card, its bond picker on top and
  the four values in two columns under their own labels. A row whose bond name wasn't recognised is
  tinted caution-tint with an orange bar on its edge, its bond picker holds the suggested bond, and
  an orange note asks to confirm it. A recorded import opens one celebration over the page, titled
  with how many purchases it brought in ("3 compras importadas!"): "Você vai receber" over the net
  Maturity Value of the purchases that have values, in the text color since it isn't a gain, and a
  "Valor investido" row with what they all cost. The figure carries the asterisk and the footnote
  only when a purchase follows a projected index, such as the IPCA; prefixed bonds alone need
  neither. A Callout note counts the purchases awaiting the IPCA, left out of the projection; when
  none has values the figure is "Você investiu" with no asterisk. "Continuar" opens Investimentos.

## Comparar

The Large Title "Comparar" with "Amortizar ou investir? Compare usando o mesmo dinheiro." under it,
then a white panel with the question as a sentence and the graphite "Comparar" on its right: "Se
eu tiver R$ 10.000,00 hoje para reduzir o prazo". The amount, the date and the effect are
editable values: the amount is typed in place with its thousands grouped, "hoje" opens a date
field typed as dd/mm/aaaa and reads "em 15/12/2026" once a date is chosen, and the effect
("reduzir o prazo", "reduzir a prestação") is a select. A value the server rejected turns red and
its message sits under the sentence in red Footnote. Arriving from Início fills in the amount and,
from "Ver comparação", compares it at once.

- The verdict is a white panel for the bond of the highest advantage that shows where the money is
  on its maturity in each option. Its Title 2 headline names the option that ends with more,
  "Investir em Tesouro Prefixado 2032 rende mais" or "Amortizar rende mais que Tesouro Prefixado
  2029", or, when the difference is a near tie, under 1% of the amount, "Investir em … ou amortizar
  dá praticamente no mesmo"; under it, "Onde está o dinheiro em 01/01/2032, em cada opção." in
  Callout grey. Two columns follow, "Se amortizar" over "R$ 10.000,00 hoje" and "Se investir" over
  the bond, side by side and stacked on a phone. Each opens with what the owner ends with, "No fim,
  você deve" (or "você tem") in Callout grey over the amount in Large Title semibold, and under a
  hairline the two parts that produce it in Footnote grey: "Saldo devedor" and "Dinheiro do
  título, líquido" ("Nenhum" when prepaying). The column that ends ahead, unless it is a near tie,
  has the accent-mark border and the tint. Under a last hairline the difference closes the panel
  in Title 2, in the text colour, "Investir termina com R$ 814,22 a mais", over its yardstick in
  Callout grey, "8,1% dos R$ 10.000,00 em 5 anos e 1 mês.", which adds "Na prática, um empate." for
  a near tie. No amount carries a sign.
- Detalhes: an inset grouped list with today's rate, the bond's price, the quantity bought and the
  cost prepaying avoids, the rate at which both options tie in Footnote under it ("Empata com
  amortizar se a taxa cair para 13,99%."), then "Ver cenários", which opens both scenarios' figures
  on the horizon and every cash flow. Rates read with at most two places, the way Tesouro quotes
  them.
- Ver cenários: each scenario opens with "No fim" and "Você deve R$ 380.743,46", then the saldo
  devedor; no amount is negative, and the few reais left uninvested are left out. Its cash flows
  are a table that scrolls inside its panel, without the columns that are empty for the whole
  scenario. A projected index reads as its value in grey ("TR 0,1617%"), with one plain sentence
  per index above the table ("Taxa TR projetada pela média dos últimos 12 meses a partir de
  15/11/2026.") and "Os valores projetados aparecem em cinza."; tapping or focusing a projected
  value opens a popover with its own period ("…no período de 15/11/2026 a 15/12/2026.").
- Outros títulos: an inset grouped list of the other bonds ranked by their advantage, each row with
  the bond's name, its rate in secondary grey, how it compares in the text colour ("R$ 344,03 a
  mais", "R$ 120,10 a menos") and a chevron; picking one puts it in the verdict. A bond with no
  comparison follows with why in a few words as its value ("Valor pequeno demais", "Aguardando o
  IPCA") and no chevron, and under its name one Footnote sentence on why and the same fix as an
  accent text action as the panel below.
- A Footnote centered at the bottom names the projections the verdict reads and closes with "O
  DebtWise compara; a decisão é sua."
- With no bond to compare, a centered white panel replaces the results: an info icon on a grey
  tile, a Title 2 that names why, one Callout sentence and the fix as an accent text action. A too
  small amount offers "Usar" the least amount that buys any bond, and compares it; a missing IPCA
  points to the IPCA projections in Mercado; no bond on offer for the mortgage's indexer points to
  the bonds on offer.

## Mercado

The Large Title "Mercado" over the Índices and Títulos segmented control. Under it, one Callout line
in secondary grey says where the section's data comes from and the day it was last updated, and a
caution Footnote with a clock icon names each source shown that is not fresh, with the day of its
last update ("Selic diária de 04/11.") or "indisponível". Mercado has no refresh action; updating
market data lives in Ajustes.

- Índices: one inset grouped list with a drill-in row per index the server publishes. A row has the
  index's name and a one-line Callout on what it is, a 120px sparkline of the year up to its latest
  value, graphite, and the year after it, dashed `#8E8E93`, then the latest value with its unit
  ("0,1683% ao mês") over its month or date in Footnote grey. On a phone the sparkline is left out
  so the name and the value keep their room. The mortgage's indexer carries a small "Seu
  financiamento" tag, strong-accent Footnote on the tint, the one tag in the app, and its line
  reads "Corrige o saldo do seu financiamento".
- An index's page: an accent "‹ Mercado" back link, the index's name as the Large Title and one
  Callout sentence on it, then the latest value as a hero figure with its month or date in a white
  panel. The panel shows that one figure: a 12-month total would be arithmetic on index values,
  which the frontend leaves to the server. Under it, "Histórico e projeção" on a white panel with a
  1 ano / 5 anos / 10 anos segmented control: the published values over that many years and the
  projection over half as many ahead, with the chart conventions of Financiamento. TR and the
  poupança yield are drawn by the months from the 1st to the 1st, as their daily periods zigzag.
  Last, under a "Projeção" header, the method the index is projected by as one drill-in row with a
  line on what it assumes, opening Ajustes, where the method is chosen; a Footnote says the
  projection changes the future balance and the result of the comparisons. The poupança yield's
  section says what its projection derives from, linking TR and Selic meta.
- Títulos: the bonds a decision compares with the mortgage (ADR-0007) that Tesouro sells today under
  "Comparáveis com seu financiamento", then "Comparáveis fora de oferta" and "Outros títulos", each
  one collapsed row naming its bonds ("Tesouro IPCA+ e outros · 3 títulos") that opens their table.
  Each table has the bond, its maturity in grey, and a Compra and a Venda column, each with the rate
  over the unit price in Footnote grey; the off-offer table has no Compra column, and a bond
  Tesouro doesn't sell reads "Fora de oferta" under Compra in Outros títulos. On a phone, where the
  prices are the point, nothing scrolls out of sight: the maturity folds under the bond's name and
  Compra and Venda keep their columns.

## Ajustes

The Large Title "Ajustes" over inset grouped lists:

- Financiamento: "Contrato", whose value sums the contract up ("R$ 480.000,00 · SAC · TR"), opens
  Contrato; "Extratos do banco", whose value counts them ("3 registrados"), opens Financiamento on
  Extratos.
- Dados de mercado: one row per source, "Índices (Banco Central)", "Expectativas (Focus)" and
  "Preços dos títulos (Tesouro Direto)", with its last update in Footnote grey ("Atualizado hoje
  às 08:00", "Atualizado em 01/11/2026", or "Nunca atualizado") and its freshness dot. The indexes
  share a row, which reads as the least fresh of them with the update of the one updated longest
  ago. Under the list, "Atualizar agora" as an accent text action on the left and "O DebtWise
  atualiza tudo automaticamente todos os dias." in Footnote grey on the right; while a refresh
  runs, a spinner and "Atualizando…" in secondary grey take the action's place.
- Projeções: one drill-in row per index that offers a choice of projection methods, with the
  method as its value ("Média dos últimos 12 meses"). A row opens a modal sheet titled with the
  index, listing the methods as selectable rows with a line on what each assumes; picking one saves
  it and closes the sheet. A Footnote under the list says the projection changes the future
  balance and the result of the comparisons.
- Sobre: "Código-fonte", opening the repository. The mockup's "Versão" row is left out until the
  server reports its version, and its "Aparência" section with "Tema" until a dark palette is
  designed.
- Last, "Excluir financiamento" as a full-width row in red text alone in its panel, which asks for
  confirmation, deletes the mortgage with its prepayments and statements, keeps the lots, and
  opens the onboarding.

## Voice

Direct, warm, second person ("você"), one sentence per explanation, deeper detail behind "Saiba
mais". Use the domain words: financiamento, prestação, amortização extraordinária, saldo devedor,
projeção, decisão. Avoid dívida, simulação, previsão. Results are conditional ("Na projeção
atual…"). Server state and refresh mechanics appear only on Ajustes and in the stale-data notes.

Money in prose never carries a sign: say which option ends with more and by how much ("Investir
termina com R$ 814,22 a mais", "Manter rende R$ 57,54 a mais", "R$ 120,10 a menos"), and what is
owed as "Você deve R$ …", never as a negative amount. A difference under 1% of the amount is named
as what it is, practically the same, rather than as a win.

## Sample data for mockups

R$ 480.000,00 over 420 months from 15/03/2023, SAC, TR, 9,50 % ao ano efetiva, appraisal
R$ 650.000,00. Today is sexta-feira, 6 de novembro de 2026.

## Tokens in the frontend

`frontend/src/index.css` declares these tokens and removes Tailwind's default palette, type scale,
radii and breakpoints, so a class outside them generates no CSS and the `shadcn` lint rules reject
it. Colors keep shadcn's names where shadcn has the role.

A color is set only in shadcn's variables, which are the theme for everything built on shadcn, and
in the roles shadcn has no variable for (tertiary text, control, positive, caution). Everything else
derives from them, so any theme, such as a dark palette or one tried in
[tweakcn](https://tweakcn.com), reaches every surface:

- The primary's hover and on-primary-secondary are a lighter `--primary` and a mix of
  `--primary-foreground` into it; the primary card's gradient is lighter and darker `--primary`.
- The accent mark, soft and tint keep their lightness and take their hue and chroma from
  `--accent`.
- Glass panels and the tab bar are `--card` at partial opacity, the sidebar `--sidebar` with a
  `--sidebar-border` hairline, and the opaque panel fill `--card` over `--background`.
- The canvas runs from a tint of the accent tint through `--background` to a darker, bluer
  `--background`.
- The chart roles name shadcn's `--chart-1` (mortgage), `--chart-2` (investment, amortization),
  `--chart-3` (projection, charges) and `--chart-4` (interest).
- Body text is `--font-sans` and headings `--font-heading`, which reads `--font-serif`, one of the
  three fonts a shadcn theme defines, so the theme sets the heading face too. It holds the body
  font until a heading face is chosen.

| Token | Utility |
| --- | --- |
| background (canvas) | `bg-background`; the gradient is the body's |
| surface | `bg-card`, `bg-popover` |
| on-surface | `text-foreground` |
| on-surface-secondary | `text-muted-foreground` |
| on-surface-tertiary | `text-tertiary-foreground` |
| separator | `border-border`, `border-input` |
| control | `border-control`, `bg-control` |
| primary, on-primary | `bg-primary`, `text-primary-foreground` |
| secondary, on-secondary (the button under a confirmation) | `bg-secondary`, `text-secondary-foreground` |
| primary-hover | `hover:bg-primary-hover` |
| on-primary-secondary | `text-primary-muted-foreground` |
| accent, accent-mark, accent-soft, accent-tint | `text-accent`, `accent-mark`, `accent-soft`, `accent-tint` |
| focus | `--ring`, the outline every `:focus-visible` element draws; `--primary-foreground` inside `glass-primary` |
| positive, caution, caution-tint | `text-positive`, `text-caution`, `bg-caution-tint` |
| critical | `text-destructive` |
| chart-mortgage, chart-investment, chart-projection | `var(--chart-mortgage)` and so on |
| typography | `text-large-title`, `text-title-2`, `text-headline`, `text-body`, `text-callout`, `text-footnote`, `text-caption`, `text-hero-figure` (which scales on a phone); `font-sans` for the body and `font-heading` for headings |
| breakpoints | `sm` 600px (phones are below it), `md` 900px (the sidebar) |
| roundness | `rounded-lg` |
| spacing xs, sm, md, lg, xl, xxl | Tailwind's 4px steps 1, 2, 4, 6, 10, 16 |
| content column | `max-w-content` |
| sheet shadow | `shadow-sheet` |
| glass | `glass`, `glass-primary`, `glass-sidebar`, `glass-bar` |

There is no dark palette yet, so the tokens have no `.dark` values.
