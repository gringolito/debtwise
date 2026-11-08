---
name: DebtWise · Orvalho
colors:
  background: '#F5F7F6'
  surface: '#FFFFFF'
  on-surface: '#1D1D1F'
  on-surface-secondary: '#6E6E73'
  on-surface-tertiary: '#AEAEB2'
  separator: '#E5E5EA'
  graphite: '#1D1D1F'
  graphite-raised: '#2C2C2E'
  on-graphite: '#FFFFFF'
  on-graphite-secondary: '#A1A1A6'
  primary: '#1D1D1F'
  on-primary: '#FFFFFF'
  accent: '#2A7A6A'
  accent-soft: '#82C7B7'
  accent-tint: '#E8F5F1'
  positive: '#248A3D'
  caution: '#B25000'
  caution-tint: '#FFF4E5'
  critical: '#D70015'
  chart-mortgage: '#1D1D1F'
  chart-investment: '#4E9E8C'
  chart-projection: '#AEAEB2'
typography:
  large-title: { fontFamily: Inter, fontSize: 34px, fontWeight: '700', lineHeight: 41px, letterSpacing: '-0.022em' }
  title-2: { fontFamily: Inter, fontSize: 22px, fontWeight: '600', lineHeight: 28px, letterSpacing: '-0.017em' }
  headline: { fontFamily: Inter, fontSize: 17px, fontWeight: '600', lineHeight: 22px, letterSpacing: '-0.01em' }
  body: { fontFamily: Inter, fontSize: 17px, fontWeight: '400', lineHeight: 24px, letterSpacing: '-0.01em' }
  callout: { fontFamily: Inter, fontSize: 15px, fontWeight: '400', lineHeight: 21px }
  footnote: { fontFamily: Inter, fontSize: 13px, fontWeight: '400', lineHeight: 18px }
  hero-figure: { fontFamily: Inter, fontSize: 56px, fontWeight: '600', lineHeight: 60px, letterSpacing: '-0.03em' }
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

The feel of a first-party Apple app (Wallet, Apple Card, Stocks, System Settings). One idea per
screen. White panels over a soft canvas; hierarchy comes from typography and whitespace. No
gradients, no floating pills, no badge dots, no stock illustrations, no emoji. Hairline separators
for structure; whisper-soft shadows (`0 8px 24px rgba(0,0,0,0.08)`) only for sheets and popovers.

Graphite is the signature: primary buttons and at most one card per screen are near-black
`#1D1D1F`, like a premium card. A graphite surface carries only white and grey text, such as the
Início hero that states the current suggestion. Any card that shows a colored result (a green gain,
a red loss, a caution note) is a white panel instead, such as the verdict on Decidir. Graphite never
fills the sidebar, summary panels or page backgrounds.

## Color: Orvalho

The accent is **Orvalho**, a sea-green (verde-água) like sea glass: fresh, reassuring, collaborative.

- Canvas `#F5F7F6`, panels `#FFFFFF`, text `#1D1D1F`.
- Secondary text is `#6E6E73` on white and `#A1A1A6` on graphite. Calm comes from restraint, not
  from faint text. `#AEAEB2` is only for placeholders and disabled states.
- **Primary buttons are graphite** with white text, 12px radius, 44px tall. On a graphite card the
  button inverts to white with graphite text. One primary button per screen.
- Accent roles:
  - `#82C7B7` (soft) for selected borders, progress bars, toggles and icon fills.
  - `#E8F5F1` (tint) for selected card backgrounds, the selected sidebar item and highlighted rows.
  - `#2A7A6A` (strong) only for text-weight uses: links, the selected sidebar label and icon, text
    buttons.
- Charts: the mortgage ("Amortizar") series is graphite, the investment ("Investir") series is
  `#4E9E8C` at 2.5px, projections are dashed `#AEAEB2`.
- Signed money is the only place for gain/loss colors, and the accent is never used for it: green
  `#248A3D` for gains, red `#D70015` for losses and destructive actions, both only on white. Orange
  `#B25000` only for stale market data and for an imported row whose bond name wasn't recognised.

## Typography

Inter as the SF Pro stand-in for everything, including large figures, with tabular numerals. Large
Title 34 bold for page titles, Title 2 22 semibold for sections, Headline 17 semibold, Body 17,
Callout 15 for explanations, Footnote 13 for metadata. Key figures use a 56px semibold hero figure
when a screen has one figure alone; figures sharing a row, such as the Início summary panels, use
Large Title at semibold weight. The wordmark is Title 2. These seven sizes are the whole scale.

## Layout and components

- Desktop canvas 1280px. Left sidebar 240px on the canvas color, separated by a hairline, with only
  the "DebtWise" wordmark (no subtitle, no badge) and these items with thin line icons: Início,
  Financiamento, Investimentos, Decidir; a hairline; Mercado; and Ajustes pinned at the bottom.
  The current item, including on its sub-pages, has the tint background and the strong accent
  label and icon; the others are Callout in secondary grey. No top bar, no footer.
- Content column max 880px, centered, 40px top margin. 8px grid; 16px inside rows, 24px between
  groups, 40px between sections.
- Inset grouped lists: white 12px-radius panels, 52px rows with inset hairlines, label left, value
  right, chevron for drill-in. Section headers are Footnote uppercase in secondary grey.
- Editable values inside sentences are underlined in the soft accent.
- Segmented controls for two- or three-way choices: a translucent grey track with the selected
  segment raised in white. A destination split into sections, such as Mercado (Índices,
  Títulos) and Investimentos (Compras, Venda antecipada), switches them with a segmented control
  at the top of the page. Large selectable cards with a small schematic chart for conceptual
  choices like SAC vs Price.
- Buttons: graphite primary; white on a graphite card; plain text buttons in secondary grey
  ("Cancelar", "Voltar", "Mudar valor"); links and text actions in the strong accent, except a
  destructive one beside them, such as "Excluir" next to "Editar", which is red text.
- Tables of figures sit on the same white panel as an inset grouped list: Footnote uppercase
  column headers in secondary grey, 52px rows with hairlines, labels left and figures right.
- An empty destination shows, centered, the destination's icon on an accent-tint tile, a Title 2
  that says nothing is there yet, one Callout sentence on why to add it, the graphite button that
  adds it and any other way in as an accent text action.
- Modal sheets for recording something over a page: a centered 520px white panel with the sheet
  shadow over the page dimmed by graphite at 30% and blurred. The title (Title 2) sits left and a
  plain "Cancelar" right; the content is inset grouped lists; the primary button spans the width.
- Loading shows skeletons: blocks the shape of the content, in graphite at 5% so they read on both
  the canvas and white panels, pulsing gently.
- A screen that fails to load shows a white error panel in place of its content: a cloud-off icon
  in a grey circle, a Headline saying what could not load, "Verifique sua conexão. Seus dados
  estão salvos." in Callout, and a graphite "Tentar novamente" that retries the failed request.
- Unknown addresses open a full-screen page without the sidebar: the wordmark top left, "404" as a
  hero figure in tertiary grey, "Esta página não existe", "O endereço pode ter mudado." and a
  graphite "Voltar ao início".
- Market data freshness is shown next to what it affects: on Início, a Footnote directly under the
  answer card, in caution orange with a clock icon, naming each source the answer reads that is
  not fresh with the date of its last update, then an "Atualizar" text action.
- Checklists, such as Início's "Próximos passos", are inset grouped lists: a step still to do is an
  empty tertiary circle and a chevron; a done step has an accent check, its label struck through in
  secondary grey and "Concluído" as its value. Green stays reserved for signed money.

## Onboarding

Setup Assistant pattern: a welcome screen, then six steps. While no mortgage is registered, every
page of the app opens it in place of the page (unknown addresses still show the 404); once one
is, it is unreachable. Full-screen, no sidebar, a thin soft-accent progress bar on the top edge,
the wordmark top left, "Passo N de 6" once in footnote grey at the top right, a centered 560px
column, a Large Title that asks a question, one sentence of context, the inputs, a graphite
"Continuar" and a plain "Voltar" that keeps what was typed.

- Boas-vindas (unnumbered): the graphite tile with the house icon, three inset rows of what
  DebtWise does, and a graphite "Configurar meu financiamento".
1. O contrato: data do contrato, valor financiado, prazo, primeira prestação, typed in place in an
   inset grouped list; the term also reads in years
2. Sistema de amortização: SAC ou Price as two selectable cards with a schematic of the
   installments, framed as "find it in your contract", not as advice
3. Correção do saldo: TR, IPCA ou nenhum as selectable rows, with a tint note on why it matters
4. Juros do contrato: the annual rate as a hero figure underlined in the soft accent, a segmented
   Efetiva/Nominal, a toggle for the poupança part, and "Adicionar mudança" for each later rate
   change, which opens its own group
5. Seguros e taxas: valor de avaliação, MIP, DFI, taxa de administração (left empty, it is none),
   with a text button that opens what each insurance charged on the first installment and derives
   its rate from it
6. Revisão: a white panel with the payoff month and the current installment (the first one while
   none is due) over the balance curve, graphite up to today and dashed after it, then the informed
   terms with "Editar", which goes back to step 1. "Concluir" saves and opens Início.

The review shows the schedule the server computes for the typed terms before anything is saved.
When the server rejects the terms, on the review or on "Concluir", the owner goes back to the
first step that asks for a rejected field, with "Confira os campos destacados." above it and each
rejected field marked.

## Investimentos

A lot is a "compra". Investimentos opens on Compras; once a lot is recorded, the page title carries
"Importar planilha" as an accent text action and a graphite "Adicionar compra", and a segmented
control switches Compras and Venda antecipada. With no lot, the page shows only its empty state.

- Compras: a white panel with "Valor de mercado líquido" as a hero figure and the gross total in
  Callout under it, then a group per bond, the bonds maturing first leading, under a Headline with
  the bond's name. Each lot is a row with "Compra em" its date, its rate in Callout, what its early
  sale check favours in Footnote ("Manter até o vencimento", or "Vender e amortizar renderia" and
  the gain in green), and its net Market Value, or why it has none, as the value.
- A lot's detail: an accent "‹ Investimentos" back link, the bond's name as the Large Title with
  "Editar" and a red "Excluir", one line on the purchase, then the net Market, Accrual and Maturity
  Values side by side in one white panel. Under it, a white panel on the early sale with its own
  Reduzir prazo / Reduzir prestação segmented control: a Title 2 verdict, one sentence with the
  difference in green or red, and what the comparison assumes in Footnote. Then the Descontos table
  (gross, income tax, custody fee, IOF and net of each value), the Cupons table for coupon bonds,
  and the date of the values and any projection they read, centered in Footnote.
- Venda antecipada: one sentence on what is compared beside the effect's segmented control, then
  every lot in one inset grouped list, the lots most worth selling first. Each row shows what
  selling gains over holding, signed, green when positive and red when negative, and "vender" or
  "manter".
- Adicionar compra and Editar compra are sheets: the bond picked from those Tesouro Direto quotes
  ("Outro título" types any other), the purchase date, rate, unit price and quantity typed in
  place, a Footnote on where to find them, and a tinted "Valor investido" row with what the
  server computes for them, before saving.
- Importar planilha: the file's name and row count with "Trocar arquivo", then every row in a
  table, each value editable in place. A row whose bond name wasn't recognised is tinted
  caution-tint with an orange bar on its edge, its bond picker holds the suggested bond, and an
  orange note asks to confirm it.

## Voice

Direct, warm, second person ("você"), one sentence per explanation, deeper detail behind "Saiba
mais". Use the domain words: financiamento, prestação, amortização extraordinária, saldo devedor,
projeção, decisão. Avoid dívida, simulação, previsão. Results are conditional ("Na projeção
atual…"). Never expose server state or refresh mechanics.

## Sample data for mockups

R$ 480.000,00 over 420 months from 15/03/2023, SAC, TR, 9,50 % ao ano efetiva, appraisal
R$ 650.000,00. Today is sexta-feira, 6 de novembro de 2026.

## Tokens in the frontend

`frontend/src/index.css` declares these tokens and removes Tailwind's default palette, type scale
and radii, so a class outside them generates no CSS and the `shadcn` lint rules reject it.
Colors keep shadcn's names where shadcn has the role:

| Token | Utility |
| --- | --- |
| background (canvas) | `bg-background` |
| surface | `bg-card`, `bg-popover` |
| on-surface | `text-foreground` |
| on-surface-secondary | `text-muted-foreground` |
| on-surface-tertiary | `text-tertiary-foreground` |
| separator | `border-border`, `border-input` |
| primary, on-primary | `bg-primary`, `text-primary-foreground` |
| graphite, graphite-raised | `bg-graphite`, `bg-graphite-raised` |
| on-graphite, on-graphite-secondary | `text-graphite-foreground`, `text-graphite-muted-foreground` |
| accent, accent-soft, accent-tint | `text-accent`, `accent-soft`, `accent-tint` (`ring` is soft) |
| positive, caution, caution-tint | `text-positive`, `text-caution`, `bg-caution-tint` |
| critical | `text-destructive` |
| chart-mortgage, chart-investment, chart-projection | `var(--chart-mortgage)` and so on |
| typography | `text-large-title`, `text-title-2`, `text-headline`, `text-body`, `text-callout`, `text-footnote`, `text-hero-figure` |
| roundness | `rounded-lg` |
| spacing xs, sm, md, lg, xl, xxl | Tailwind's 4px steps 1, 2, 4, 6, 10, 16 |
| content column | `max-w-content` |
| sheet shadow | `shadow-sheet` |

There is no dark palette yet, so the tokens have no `.dark` values.
