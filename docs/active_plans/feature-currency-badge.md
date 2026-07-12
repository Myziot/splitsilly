# Feature Plan: Prominent currency badge with symbol/emoji

**Project:** split_silly (port 3002)  **Date:** 2026-07-10  **Status:** IMPLEMENTING

## Request
Make the 3-letter currency code more prominent + nicer color. If there's an emoji or
ASCII symbol for the currency, show it too.

## Design
New reusable component `packages/client/src/components/CurrencyBadge.tsx`:
- Maps currency code -> { symbol/emoji, color }.
  - USD $ 💵, EUR € 💶, GBP £ 💷, JPY ¥ 💴, PLN zł, CAD C$, AUD A$, CHF Fr,
    CNY ¥, INR ₹, MXN $, BRL R$, SEK kr, NOK kr, NZD NZ$.
- Renders a small colored pill: symbol + code, e.g. "💵 USD" on a tinted bg.
- Unknown codes: neutral gray pill with the code.

## Usage
- Groups.tsx group card: replace plain `{group.currency}` with <CurrencyBadge code={group.currency} />.
- GroupDetail.tsx top nav: replace plain `{currentGroup?.currency}` with <CurrencyBadge .../>.

## Verification
- Rebuild client; confirm bundle contains pill classes + symbols.
- Log to neonlin.
