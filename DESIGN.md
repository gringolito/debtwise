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
  right), under a faint soft-accent wash top left. It and graphite glass are the only gradients.
- The sidebar is glass too: white at 75% with a 28px blur and a hairline at 6% black on its right.
- The phone's tab bar and its settings button float as glass capsules: white at 72% with a 24px
  blur, a white rim at 90% and a soft lift shadow, so the page reads under them.
- Sheets and popovers keep the whisper-soft sheet shadow (`0 8px 24px rgba(0,0,0,0.08)`).
- No floating pills, badge dots, stock illustrations or emoji, except the phone's tab bar, which is
  Liquid Glass's own navigation, and the graphite glass icon below.

Graphite is the signature: primary buttons are near-black, like a premium card, and so are the
tiles that carry the app's few icons and illustrations. A screen's hero icon is graphite glass, the
way Liquid Glass draws an app icon: a 96px squircle with a diagonal gradient from `#222224` to
`#151517` at 92–96%, a top-left sheen, a white rim at 18%, a deep shadow, a soft-accent glow on its
floor and a 1px rim light along its top edge that fades in from white to the soft accent. No card
is graphite: a near-black block on a light page reads as an advertisement, so the main information
of a screen sits on the canvas itself. Any card that shows a colored result (a green gain, a red
loss, a caution note) is a white panel. Graphite never fills cards, the sidebar, summary panels or
page backgrounds.

## Color: Orvalho

The accent is **Orvalho**, a sea-green (verde-água) like sea glass: fresh, reassuring, collaborative.

- The canvas is the gradient above; panels white glass, text `#1D1D1F`. The accent appears only in
  its accent roles below and the faint top-left wash.
- Secondary text is `#636366` on white and `#A1A1A2` on graphite, which keeps AA on the canvas's
  bluest corner and on a segmented control's grey track. Calm comes from restraint, not from faint
  text. `#AEAEB2` (tertiary) marks what is placeholder, disabled or set back: placeholders, a unit
  beside an empty field, disabled states, a checklist step still to do and the 404 figure. Text the
  owner has to read is secondary grey or darker.
- **Primary buttons are graphite** with white text, 12px radius, 44px tall. One primary button per
  screen.
- Accent roles:
  - `#26705F` (strong) only for text-weight uses: links, the selected navigation label and icon,
    text buttons, tags and the focus ring.
  - `#3E8E7C` (mark) for marks that have to be seen at 3:1: selected borders, progress bars,
    toggles, the checked radio, the underline of an editable value or a selected tab, and the chart
    lines below.
  - `#82C7B7` (soft) only for decoration: glows, the celebration's ring and ripples, an icon on a
    graphite tile.
  - `#E8F5F1` (tint) for selected card backgrounds, the selected navigation item, highlighted rows
    and tags.
- Controls that have to be found before they are used, an empty radio ring and a switch's off
  track, are `#8E8E93`, at 3:1.
- Focus: every focusable element shows a 2px solid ring in the strong accent, 2px off its edge, on
  keyboard focus only. A row of an inset grouped list draws it inside its edge.
- Charts read their time and value axes, with no fill under a line, since panels carry no
  gradients. The mortgage series is graphite, the investment series `#3E8E7C` at 2.5px, and
  projections dashed `#8E8E93`. A dotted strong-accent line marks today; its label sits above the
  plot on the side of the line with more room, clear of the value axis. A hollow ring marks an
  event on a line. A stacked installment puts amortization in `#3E8E7C`, interest in light grey
  `#C7C7CC` and insurance and fees in mid grey `#8E8E93`, so what pays the home off stands out from
  its cost. Projected values in a table read in secondary grey.
- Green `#1E7A36` marks money the owner gains and red `#D70015` money lost and destructive actions,
  both only on white, and the accent is never used for either. A difference between two options is
  neither: it is stated in the text colour, since prepaying winning is no loss. Orange `#A84A00`
  marks what needs the owner's attention: stale market data, a figure that drifted from the
  bank's, an imported value to confirm. A status shown as a pair, such as a data source's freshness
  dot, is green when it is fine and orange when it is not.

## Typography

Three roles. Body text takes the system font first, so Apple devices render SF Pro, as Wallet and
Stocks do, with Inter where there is none; tabular numerals everywhere. Headings, every `h1` to `h6`
and a dialog's title, take the heading font, which is the body font until a heading face is chosen.
The wordmark is lettering rather than text: "Debtwise" outlined from Inter Semibold at Title 2 with
tight tracking, so the brand keeps its shape whatever fonts the app uses. Large Title 34 bold for
page titles, Title 2 22 semibold for sections, Headline 17 semibold, Body 17, Callout 15 for
explanations, Footnote 13 for metadata and Caption 11 medium for the tab bar's labels alone. Key
figures use a 56px semibold hero figure when a screen has one figure alone; figures sharing a row,
such as summary panels, use Large Title at semibold weight. On a phone the hero figure scales with
the screen, `clamp(34px, 11.4vw, 48px)`, and Large Title figures inside panels step down to 28px,
while page titles keep 34px. A key figure never wraps: "novembro de 2056" stays on one line, and its
panel stacks instead. These eight sizes are the whole scale.

## Layout and components

- Desktop canvas 1280px. From 900px, a left glass sidebar 240px with only the logo, the Debtwise
  symbol at 32px beside "Debtwise" in Title 2 (no subtitle, no badge), and the destinations with
  thin line icons, settings pinned at the bottom. The current item, including on its sub-pages, has
  the tint background and the strong accent label and icon; the others are Callout in secondary
  grey. No top bar, no footer.
- Under 900px the sidebar gives way to a floating tab bar 12px off the bottom and the sides, above
  the home indicator: one glass capsule with the destinations as icons over Caption labels,
  shortened where the name doesn't fit (the full name is what a screen reader hears), and settings
  as its own 60px round glass button beside it, the way iOS pairs a tab bar with an accessory. The
  current tab has the tint and the strong accent. Pages leave room under them for the bar.
- Content column max 880px, centered, 40px top margin; 24px top and 16px sides on a phone. 8px
  grid; 16px inside rows, 24px between groups, 40px between sections.
- Phones, under 600px, are a first-class surface, and no page scrolls sideways. Panels of figures
  stack into one column with hairlines between them; page headers wrap with their actions under
  the title; a segmented control that heads a section or panel spans the width with 44px
  segments; every small link, icon button and in-row control has a 44px touch area.
- A page opens with its Large Title, an optional Callout line in secondary grey under it, and its
  actions on the title's right. A sub-page has a back link in the strong accent naming its parent
  ("‹ Investimentos") above the title. A settings-style page that edits many values at once has a
  plain "Cancelar" and the graphite "Salvar" on the title's right; "Salvar" sends everything and
  goes back, "Cancelar" and the back link discard the changes.
- Key figures sit in a white summary panel, each column as wide as its figure, so none wraps; when
  the column is too narrow for them side by side, the panel stacks them.
- Inset grouped lists: glass 12px-radius panels, 52px rows with inset hairlines, label left, value
  right, chevron for drill-in. Section headers are Footnote uppercase in secondary grey.
- Editable values inside sentences are underlined in the accent mark.
- Values the owner types in place sit right-aligned on their row as borderless inputs 144px wide,
  with the unit ("R$", "meses", "% ao mês") beside them, in tertiary grey while the field is empty,
  so "R$ 0,00" reads as one placeholder, and secondary grey once it has a value. Money shows its
  cents ("480.000,00") whenever it isn't being typed. Dates are typed as dd/mm/aaaa whatever the
  browser's language, digits only on a numeric keyboard, with a calendar button on the right that
  opens the system's date picker; a date that doesn't exist, such as 31/02, reads "Essa data não
  existe." before anything is sent. A field that fails a check says what to type in red Footnote
  under its label, focus moves to the first one, and each message goes away as soon as its field
  changes. A value the server rejected turns red and its message, in Portuguese, sits under the
  row's label in red Footnote; a whole list the server rejected carries its message in red
  Footnote under the list. A rejection the screen has no words for reads "Valor inválido.".
- Segmented controls for two- or three-way choices: a translucent grey track with the selected
  segment raised in white. A destination split into sections switches them with a segmented
  control at the top of the page. Large selectable cards with a small schematic chart for
  conceptual choices like SAC vs Price; a selected card has the accent-mark border, the tint
  background and a check in an accent-mark disc.
- A tab strip picks one of several peers inside a panel: tabs as tall as their content over a
  hairline, scrolling sideways inside the panel when they don't fit. The open tab's label is in the
  text colour, underlined in the accent mark, which grows in when picked; the others are in
  secondary grey.
- Buttons: graphite primary; plain text buttons in secondary grey ("Cancelar", "Voltar", "Mudar
  valor"); links and text actions in the strong accent, except a destructive one beside them, such
  as "Excluir" next to "Editar", which is red text.
- A tag is strong-accent Footnote on the tint, used sparingly.
- A strong-accent info icon beside a figure opens, on hover or focus, a graphite tooltip with what
  is behind it. A projected value opens, on tap or focus, a popover with its period.
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
  A sheet previews before saving what the server computes for the typed values, in a tinted row.
  Under 600px a sheet, and a confirmation, is a bottom sheet: full width, its top corners rounded,
  sliding up from the bottom edge, and scrolling inside when it is taller than the screen.
- Step-by-step flows follow the Setup Assistant pattern: full-screen, no sidebar, a thin
  accent-mark progress bar on the top edge, the wordmark top left, "Passo N de M" once in Footnote
  grey at the top right, a centered 560px column, a Large Title that asks a question, one sentence
  of context, the inputs, a graphite "Continuar" and a plain "Voltar" that keeps what was typed.
  The last step reviews what was entered, each row a drill-in to the step that asked for it.
- Loading shows skeletons: blocks the shape of the content, in graphite at 5% so they read on both
  the canvas and white panels, pulsing gently. While the app starts, the navigation is already
  there, with the first page's skeleton in it.
- Confirmations of a deletion: a centered 400px white panel with the sheet shadow over the page
  dimmed and blurred as for a modal sheet, its content centered: the Headline question ("Excluir
  financiamento?"), one Callout sentence in secondary grey on what goes and what stays, then two
  full-width buttons stacked, the action in solid red with white text and "Cancelar" in graphite
  text on the canvas gray. The deletion that takes the most with it, the mortgage's, also shows a
  red "!" in a red-tint disc above the question.
- A celebration follows a new record that improves the owner's position. It takes the place of the
  sheet that recorded it, in the same 520px frame and without animation, so the modal reads as one
  whose content changes; its content is centered. The motion is in its 160px icon over the Title 2
  that says what happened: a check that pops in on a tint disc and draws its soft-accent ring and
  strong-accent tick, or the action's own accent icon, which pops in and twists. Then, under a
  Footnote uppercase lead such as "Você economizou", the action's main figure as a hero figure,
  green when it is money gained, with what it measures in Callout grey under it; the other figures
  as rows of a white grouped list; and a full-width graphite "Continuar". A figure that reads a
  projection carries a grey Title 2 asterisk raised beside it, or after its row's name so the
  figures keep their right edge, and "* Baseado na projeção atual." closes the panel, right-aligned
  in Footnote grey. Totals across records belong on a summary screen, not here. A milestone, such as
  a mortgage paid off, also ripples soft-accent rings out of its icon. When the device asks for
  reduced motion, the icon stands still and fully drawn. After a correction, such as an edited or
  deleted record, the same panel informs instead: no icon, the figures as before → after where they
  changed, and "Entendi".
- A screen that fails to load shows a white error panel in place of its content: a cloud-off icon
  in a grey circle, a Headline saying what could not load, "Verifique sua conexão. Seus dados
  estão salvos." in Callout, and a graphite "Tentar novamente" that retries the failed request.
- Unknown addresses open a full-screen page without the sidebar: the wordmark top left, "404" as a
  hero figure in tertiary grey, "Esta página não existe", "O endereço pode ter mudado." and a
  graphite "Voltar ao início".
- Market data freshness is shown next to what it affects: a Footnote directly under the figure that
  reads it, in caution orange with a clock icon, naming each source that is not fresh with the date
  of its last update, then an "Atualizar" text action where a refresh is offered.
- Checklists are inset grouped lists: a step still to do is an empty tertiary circle and a
  chevron; a done step has an accent check, its label struck through in secondary grey and
  "Concluído" as its value. A done step is not green: green stays for money gained and the status
  pairs listed under Color.

## Voice

Direct, warm, second person ("você"), one sentence per explanation, deeper detail behind "Saiba
mais". Use the domain words: financiamento, prestação, amortização extraordinária, saldo devedor,
projeção, decisão. Avoid dívida, simulação, previsão. Results are conditional ("Na projeção
atual…"). Server state and refresh mechanics appear only in settings and in the stale-data notes.

Money in prose never carries a sign: say which option is worth more and the projected difference in
its favour ("Diferença a favor de investir: R$ 814,22", "R$ 814,22 de diferença a favor", "R$ 120,10
a menos"), and what is owed as "Você deve R$ …", never as a negative amount. That difference is in
net worth, the cash held and the bond's net value less what is owed, so prose never words it as
debt owed or cash held. A difference under 1% of the amount is named as what it is, practically
the same, rather than as a win.

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
