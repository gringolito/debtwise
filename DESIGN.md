---
name: DebtWise
colors:
  background: '#F4F7F8'
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
  accent: '#0B6E80'
  accent-soft: '#5DB3C2'
  accent-tint: '#E6F3F6'
  positive: '#248A3D'
  caution: '#B25000'
  caution-tint: '#FFF4E5'
  critical: '#D70015'
  chart-mortgage: '#1D1D1F'
  chart-investment: '#5DB3C2'
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

> **Provisional palette.** The accent is still being chosen between Névoa (washed lavender
> `#A9A3E3`), Lagoa (turquoise `#5DB3C2`) and Orvalho (sea-green `#82C7B7`). The tokens below use
> Lagoa as a placeholder; everything else is settled.

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

Graphite surfaces are the signature: the hero answer card on Início, the verdict on Decidir and the
app icon are near-black `#1D1D1F` with white text and secondary text `#A1A1A6`, like a premium card.
They appear at most once per screen.

## Color

- Canvas `#F4F7F8`, panels `#FFFFFF`, text `#1D1D1F`, secondary `#6E6E73`, separators `#E5E5EA`.
- **Primary buttons are graphite** with white text, 12px radius, 44px tall. On a graphite card the
  button inverts to white with graphite text. One primary button per screen.
- Accent (turquoise to petrol blue, like still deep water: calm and trustworthy):
  - `#5DB3C2` (soft) for selected borders, progress bars, the investment series in charts,
    toggles, and icon fills.
  - `#E6F3F6` (tint) for selected card backgrounds and highlighted rows.
  - `#0B6E80` (strong) only for text-weight uses that need contrast: links, the selected
    sidebar item's label and icon, text buttons.
- Charts: the mortgage ("Amortizar") series is graphite, the investment ("Investir") series is the
  soft accent, projections are dashed `#AEAEB2`.
- Signed money: green `#248A3D` for gains, red `#D70015` for losses and destructive actions. Orange
  `#B25000` only for stale market data. Never use the accent for gain/loss.

## Typography

Inter as the SF Pro stand-in for everything, including large figures, with tabular numerals. Never a
monospace font. Large Title 34 bold for page titles, Title 2 22 semibold for sections, Headline 17
semibold, Body 17, Callout 15 for explanations, Footnote 13 for metadata. Key figures use a 56px
semibold hero figure.

## Layout

- Desktop canvas 1280px. Left sidebar 240px, light and quiet, with only the "DebtWise" wordmark
  (no subtitle, no badge) and destinations with thin line icons: Início, Financiamento,
  Investimentos, Decidir; a quieter Mercado item; Ajustes at the bottom. No top bar, no footer.
- Content column max 880px, centered, 40px top margin. 8px grid; 16px inside rows, 24px between
  groups, 40px between sections.
- Inset grouped lists: white 12px-radius panels, 52px rows with inset hairlines, label left, value
  right in secondary grey, chevron for drill-in.
- Segmented controls for two- or three-way choices; large selectable cards with a small schematic
  chart for conceptual choices like SAC vs Price.

## Onboarding

Setup Assistant pattern: full-screen, no sidebar, a thin accent progress bar on the top edge,
"Passo N de 6" in footnote grey, a centered 560px column, a Large Title that asks a question, one
sentence of context, the inputs, a graphite "Continuar" and a plain "Voltar". Steps:

1. Boas-vindas
2. O contrato: data do contrato, valor financiado, prazo, primeira prestação
3. Como as prestações são calculadas: SAC ou Price
4. Correção do saldo: TR, IPCA ou prefixado
5. Juros do contrato: taxa anual, efetiva/nominal, parcela poupança opcional, mudanças de taxa
6. Seguros e taxas: valor de avaliação, MIP, DFI, taxa de administração, with a helper that
   derives a rate from the first installment
7. Revisão: summary, payoff date and balance curve

## Voice

Direct, warm, second person ("você"), one sentence per explanation, deeper detail behind "Saiba
mais". Use the domain words: financiamento, prestação, amortização extraordinária, saldo devedor,
projeção, decisão. Avoid dívida, simulação, previsão. Never expose server state or refresh mechanics.

## Domain constraints for mockups

Bonds compared in Decidir follow the mortgage indexer: a TR or fixed-rate mortgage compares against
Tesouro Prefixado and Tesouro IPCA+ only. Sample data: R$ 480.000,00 over 420 months from 15/03/2023,
SAC, TR, 9,50 % ao ano efetiva; today is November 2026.
