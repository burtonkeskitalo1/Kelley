# Kelley Group Performance

Executive dashboard. One tab per division, reading from the Airtable base.

## Setup

```bash
npm install
cp .env.example .env.local     # fill in both values
npm run dev                    # http://localhost:3000
```

Two environment variables:

| Variable | Value |
|---|---|
| `AIRTABLE_TOKEN` | Personal access token, **read-only** (`data.records:read`), scoped to this base only |
| `AIRTABLE_BASE_ID` | From the base URL: `airtable.com/appXXXXXXXXXXXXXX/...` |

Do not reuse the write-scoped token from the import step. The dashboard only reads.

## Deploying

Push to GitHub, import the repo in Vercel, add the same two environment variables
in project settings, deploy.

**Access control is not optional here.** This is division-level P&L going to
ownership. Vercel's preview-deployment password is not real protection. Use one of:

- Vercel Pro with SSO / Deployment Protection, or
- Auth.js with your Google Workspace domain restricted to company email

Do not leave this on a public URL.

## How it reads the base

Table names must match exactly, spaces included: `Divisions`, `Stores`,
`Weekly Sales`, `Cost Standards`. If you rename a table in Airtable, update
`TABLES` in `lib/airtable.ts`.

Percent fields are stored as **decimal fractions**: `0.6352` means 63.52%,
`0.1063` means 10.63%, `-0.4409` means -44.09%. `lib/airtable.ts` multiplies by
100 on the way out; components receive 0–100. Currency fields are plain numbers.

This convention is declared once, in `PERCENT_STORED_AS` at the top of
`lib/airtable.ts` — it is not inferred from the data. Earlier versions guessed
the scale per table by sampling the largest value and assuming fractions if it
was ≤ 1.5. That made one row decide the scale for every other row: a single
week more than 150% above breakeven flipped the whole `Weekly Sales` table and
rendered every discount, variance and YoY figure 100× too small, silently.
Cincinnati reached 109% on 2026-09-12 and Avon's first loaded week computes to
148%, so the margin was thin. **Do not reintroduce scale sniffing.**

Enter new percent values as fractions. A value beyond ±3 (i.e. ±300%) is logged
as a warning naming the field, and is a sign someone typed `10.63` where
`0.1063` belongs — fix it in Airtable rather than in code.

`Store` and `Division` on Stores and Weekly Sales are linked-record fields, so
the API returns record IDs. `lib/airtable.ts` resolves those to names; no
component deals with IDs.

## Tabs

`/` is the **Consolidated** tab and is the first tab in the nav. It is the
whole group: same-store change in the headline, one row per division, every
store ranked against its own breakeven, and group totals by week. Division
names link through to their own tab.

`/<division>` is a single division, unchanged.

The root route used to redirect to the first division with data; it now renders
the consolidated view instead.

## What the page shows

1. **Headline** — year-over-year revenue change across the rolling window. This
   leads because it is the number that is moving.
2. **Net sales by week** — one column group per store, one column per week in
   the trailing window, newest darkest. Each group carries its own gold
   breakeven rule, so stores of very different sizes read on one shared
   dollar axis against their own target.
3. **Week by week, store by store** — net sales and units per store per week.
   Adding a week adds a column pair; no layout change needed.
4. **Against the same weeks last year** — rolling totals with prior-year
   comparison.
5. **Division totals by week** — every week loaded, newest first.
6. **Breakeven build-up** — the variable rates and fixed cost behind each
   store's target.
7. **Corporate overhead** — what the group must clear on top of store targets.
8. **Cost standards** — the target operating model.

### Rolling window

Set by `WINDOW` in `app/[division]/page.tsx`, default 4 weeks. The chart's
colour ramp (`--w1` to `--w4` in `globals.css`) holds four shades; if you raise
`WINDOW` past 4, add shades to `WEEK_SHADES` in `components/ui.tsx` to match. It uses the most
recent weeks that actually have data, so it works with two weeks loaded and
becomes a true 4-week window as more arrive.

Store-level weeks swing more than ±50% — Natick went 30 to 68 units in
consecutive weeks. Single weeks are noise; the window is the number worth
judging on. That is why no view defaults to one week.

### Sources

Rows tagged `Erply POS` are current actuals. Rows tagged `QBO P&L` are
prior-year reference only and are excluded from every total — see `isActual()`
in `lib/airtable.ts`. Keep that field populated on new rows or prior-year
figures will be double-counted as current sales.

### Year-over-year is comparable-store

The headline ratio uses only stores that have a prior-year figure for the
window, on **both** sides. A store that opened mid-year is dropped from the
ratio rather than counted on the current side alone — its sales still appear
in net sales, and the headline says which stores were excluded.

This matters. Colonie Center opened in 2026 and Avon opened 2026-04-01. Counting
Colonie's sales against a 2025 that does not contain it reported New York's
two-week change as **-2.18%** when the comparable-store figure is **-18.63%**,
and turned the week ending 2026-09-05 from **-0.58%** into **+13.72%**.

`rollingByStore()` carries `hasPriorYear` and `comparableNetSales` per store;
`weeklyTotals()` carries `comparableNetSales` and `excludedStores` per week;
`consolidatedByDivision()` and `groupTotal()` do the same at division and group
level for the consolidated tab. Sum `comparableNetSales` for any YoY numerator,
`netSales` for revenue. Every table that mixes the two labels the column.

Prior-year coverage today: NE 11/11 stores, NY 5/6 (Colonie Center opened 2026),
IN 2/3 (Avon opened 2026-04-01), FL 2/2, OH/KY 0/3 — all three OH/KY stores are
new, so that division shows no YoY at all.

## Adding a week

Append rows to `Weekly Sales` in Airtable with `Source` = `Erply POS`. The site
picks them up on the next hourly revalidation. No redeploy.

Breakeven targets in `Stores` change only when the cost model is refreshed from
a new YTD P&L — quarterly is sensible, not weekly.

`Data Period Months` on a store must be the months that store actually traded,
not the months the P&L covers. Avon opened 2026-04-01, so its Jan–Aug column is
5 months of activity, not 8. Dividing by 8 understated its monthly fixed cost by
roughly 9,400 and put its weekly breakeven at 6,049.11 instead of 9,678.57.

## Adding a division

Load its stores and weekly rows against the existing division record. The tab
becomes a live link automatically once `Store Count` is above zero; until then
it renders greyed out.

## Brand palette

Tokens are at the top of `app/globals.css`, sampled from goodfeet.com:
navy `#27556F`, gold `#E29735`, light `#D7E9F4`, pale `#E3F0F7`. Gold is
reserved for the breakeven marker and nothing else, so it always means the
same thing. Red and green appear only on variance figures, never as large
fills.

## Notes

- Data revalidates hourly (`revalidate = 3600`), well inside Airtable's
  5 requests/second limit.
- If Airtable is unreachable at build time the deploy still succeeds; pages
  render on demand instead.
- `robots` is set to `noindex, nofollow`.
