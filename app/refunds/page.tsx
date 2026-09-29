import Link from "next/link";
import {
  getDivisions,
  getWeeks,
  groupTotal,
  consolidatedByDivision,
  isActual,
  recentWeeks,
  returnsTrend,
  rollingByStore,
  weeklyTotals,
} from "@/lib/airtable";
import {
  DivisionNav,
  Masthead,
  REFUNDS_SLUG,
  RefundBand,
  RefundStoreTable,
  ReturnsTrend,
} from "@/components/ui";

export const revalidate = 3600;

const WINDOW = 4;

/**
 * Returns: refunds and exchanges, on their own tab.
 *
 * The sales tabs answer "did we sell enough." This one answers "how much of
 * it came back, and how much of that cost us money." They are kept apart on
 * purpose -- mixing returns columns into the sales tables made both harder to
 * read, and refunds deserve to be looked at as their own problem.
 *
 * Gross sales less exchanges less refunds equals net sales, per store and per
 * week, so every figure here reconciles to the sales tabs rather than
 * restating them. Weeks without the invoice-level returns export loaded are
 * absent rather than shown as zero.
 */
export default async function RefundsPage() {
  let divisions: Awaited<ReturnType<typeof getDivisions>>;
  let weeks: Awaited<ReturnType<typeof getWeeks>>;
  try {
    [divisions, weeks] = await Promise.all([getDivisions(), getWeeks()]);
  } catch {
    return (
      <>
        <Masthead />
        <main className="wrap" style={{ paddingTop: "3rem" }}>
          <div className="notice">
            <h2>Airtable is unreachable</h2>
            <p>
              The base could not be read. Check <code>AIRTABLE_TOKEN</code> and{" "}
              <code>AIRTABLE_BASE_ID</code> in the Vercel project settings. This
              page retries on the next revalidation.
            </p>
          </div>
        </main>
      </>
    );
  }

  const window = recentWeeks(weeks, WINDOW);
  const totals = weeklyTotals(weeks);
  const inWindow = totals.filter((t) => window.includes(t.weekEnding));
  const rolling = rollingByStore(weeks, window, divisions);
  const total = groupTotal(consolidatedByDivision(weeks, window, divisions));
  const returns = returnsTrend(weeks, window, divisions);
  const weekLabel = totals[0]?.weekLabel;

  const groupRate =
    total.grossSales && total.refunds !== null
      ? (total.refunds / total.grossSales) * 100
      : null;

  const hasReturns = weeks.some((w) => isActual(w) && w.grossSales !== null);

  if (!hasReturns) {
    return (
      <>
        <Masthead />
        <DivisionNav divisions={divisions} current={REFUNDS_SLUG} />
        <main className="wrap" style={{ paddingTop: "3rem" }}>
          <div className="notice">
            <h2>No returns loaded yet</h2>
            <p>
              Weekly sales are in the base, but no week carries the
              invoice-level returns split. Load Gross Sales, Exchanges and
              Refunds against Weekly Sales and this tab fills in.
            </p>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <Masthead period={weekLabel ? `Latest week · ${weekLabel}` : undefined} />
      <DivisionNav divisions={divisions} current={REFUNDS_SLUG} />

      <main className="wrap">
        <RefundBand
          latest={inWindow[0]}
          prior={inWindow[1]}
          windowRefunds={total.refunds ?? 0}
          windowGross={total.grossSales ?? 0}
          windowExchanges={total.exchanges ?? 0}
          stores={rolling}
        />

        <section>
          <div className="sec-head">
            <h2>Returns trend</h2>
            <p>
              Every dollar that came back, week by week, split into the part
              replaced by another purchase and the part that left as cash. The
              split is what matters: exchanges keep the sale, refunds do not.
              Each week's refund and exchange share of gross sales is printed
              under its column.
            </p>
          </div>
          <ReturnsTrend data={returns} />
        </section>

        <section>
          <div className="sec-head">
            <h2>Every store</h2>
            <p>
              All {rolling.length} stores over the rolling window, sorted by
              refund rate. Click any heading to re-sort. Gross sales less
              exchanges less refunds equals net sales, so each row reconciles
              to the same store on the sales tabs. Refund rates above the group
              rate are marked.
            </p>
          </div>
          <RefundStoreTable rows={rolling} groupRate={groupRate} />
        </section>

        <p className="footnote">
          Sales, breakeven and year-over-year live on{" "}
          <Link href="/">Consolidated</Link> and the division tabs; patient
          financing is on <Link href="/financing">Financing</Link>.
        </p>
      </main>
    </>
  );
}
