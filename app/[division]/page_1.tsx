import { notFound } from "next/navigation";
import {
  getDivisions,
  getStandards,
  getStores,
  getWeeks,
  recentWeeks,
  rollingByStore,
  weeklyTotals,
  seriesByStore,
  windowLabels,
  isActual,
} from "@/lib/airtable";
import {
  BreakevenTable,
  DivisionNav,
  Masthead,
  RollingTable,
  Standards,
  WeeklyColumns,
  WeeklyBreakout,
  WeeklyTable,
  money,
  pct,
  signedMoney,
  signedPct,
} from "@/components/ui";

export const revalidate = 3600;

// Pre-render known divisions when Airtable is reachable at build time.
// If it isn't, return nothing and let pages render on demand rather than
// failing the whole deploy.
export async function generateStaticParams() {
  try {
    const divisions = await getDivisions();
    return divisions
      .filter((d) => d.storeCount > 0)
      .map((d) => ({ division: d.slug }));
  } catch {
    return [];
  }
}

const WINDOW = 4;

export default async function DivisionPage({
  params,
}: {
  params: { division: string };
}) {
  const [divisions, allStores, allWeeks, standards] = await Promise.all([
    getDivisions(),
    getStores(),
    getWeeks(),
    getStandards(),
  ]);

  const division = divisions.find((d) => d.slug === params.division);
  if (!division) notFound();

  const stores = allStores
    .filter((s) => s.divisionId === division.id)
    .sort((a, b) => b.monthlyBreakeven - a.monthlyBreakeven);

  const storeIds = new Set(stores.map((s) => s.id));
  const weeks = allWeeks.filter(
    (w) => w.divisionId === division.id || (w.storeId && storeIds.has(w.storeId))
  );

  const window = recentWeeks(weeks, WINDOW);
  const rolling = rollingByStore(weeks, window);
  const series = seriesByStore(weeks, window, stores);
  const labels = windowLabels(weeks, window);
  const totals = weeklyTotals(weeks);
  const hasActuals = weeks.some(isActual);

  // Division-level rollup across the window.
  //
  // `net` is every store's sales and is what the division actually sold.
  // `comparable` is only the stores that also have a prior-year figure, and is
  // the numerator for the year-over-year ratio. Mixing the two overstates
  // growth whenever a store opened mid-year: a new store adds to this year and
  // to nothing last year. Colonie Center (opened 2026) turned New York's
  // two-week comparable-store decline of -18.63% into -2.18%, and flipped one
  // week from -0.58% to +13.72%.
  const sum = rolling.reduce(
    (a, r) => ({
      net: a.net + r.netSales,
      comparable: a.comparable + r.comparableNetSales,
      target: a.target + r.target,
      prior: a.prior + r.priorYear,
    }),
    { net: 0, comparable: 0, target: 0, prior: 0 }
  );
  const yoyPct = sum.prior
    ? ((sum.comparable - sum.prior) / sum.prior) * 100
    : null;
  const vsTarget = sum.net - sum.target;

  // Stores left out of the ratio because they have no prior-year figure.
  const excludedFromYoY = rolling
    .filter((r) => !r.hasPriorYear)
    .map((r) => r.store)
    .sort();

  const weekLabel = totals[0]?.weekLabel;

  return (
    <>
      <Masthead period={weekLabel ? `Latest week · ${weekLabel}` : undefined} />
      <DivisionNav divisions={divisions} current={division.slug} />

      <main className="wrap">
        <div className="headline">
          {hasActuals && yoyPct !== null ? (
            <h1>
              Revenue is{" "}
              <span className={yoyPct < 0 ? "down" : "up"}>
                {signedPct(yoyPct)}
              </span>{" "}
              against the same weeks last year
            </h1>
          ) : (
            <h1>{division.name}</h1>
          )}

          <p className="headline-sub">
            {division.legalEntity} · {division.storeCount} stores ·{" "}
            {hasActuals
              ? `${window.length} week${window.length === 1 ? "" : "s"} of actual sales`
              : `Cost model from ${division.dataPeriod}`}
            . Store targets cover each store&rsquo;s own costs; corporate
            overhead is counted separately below.
          </p>

          {hasActuals && yoyPct !== null && excludedFromYoY.length ? (
            <p className="headline-sub">
              Comparable stores only. {excludedFromYoY.join(", ")}{" "}
              {excludedFromYoY.length === 1 ? "has" : "have"} no prior-year
              figure for these weeks and {excludedFromYoY.length === 1 ? "is" : "are"}{" "}
              excluded from the year-over-year change; {money(sum.net)} of net
              sales includes {excludedFromYoY.length === 1 ? "it" : "them"}.
            </p>
          ) : null}

          {hasActuals ? (
            <div className="figures">
              <div>
                <div className="figure-label">Net sales, rolling window</div>
                <div className="figure-value">{money(sum.net)}</div>
              </div>
              <div>
                <div className="figure-label">Breakeven for those weeks</div>
                <div className="figure-value">{money(sum.target)}</div>
              </div>
              <div>
                <div className="figure-label">Over / short</div>
                <div
                  className={`figure-value ${vsTarget >= 0 ? "over" : "under"}`}
                >
                  {signedMoney(vsTarget)}
                </div>
              </div>
              <div>
                <div className="figure-label">
                  Same weeks last year
                  {excludedFromYoY.length ? " (comparable stores)" : ""}
                </div>
                <div className="figure-value">
                  {sum.prior ? money(sum.prior) : "—"}
                </div>
              </div>
            </div>
          ) : null}
        </div>

        {hasActuals ? (
          <section>
            <div className="sec-head">
              <h2>Net sales by week</h2>
              <p>
                Each store&rsquo;s last {window.length} week
                {window.length === 1 ? "" : "s"}, newest column darkest. The
                gold rule in each group is that store&rsquo;s weekly
                breakeven, so a column below the rule missed its number.
              </p>
            </div>
            <WeeklyColumns series={series} weeks={labels} />
          </section>
        ) : null}

        {hasActuals ? (
          <section>
            <div className="sec-head">
              <h2>Week by week, store by store</h2>
              <p>
                Net sales and units for every store in the window. Red marks a
                week that came in under that store&rsquo;s breakeven.
              </p>
            </div>
            <WeeklyBreakout series={series} weeks={labels} />
          </section>
        ) : null}

        {hasActuals ? (
          <section>
            <div className="sec-head">
              <h2>Against the same weeks last year</h2>
              <p>
                Rolling {window.length}-week totals per store, compared with
                the same calendar weeks a year ago.
              </p>
            </div>
            <RollingTable rows={rolling} weeks={window.length} />
          </section>
        ) : null}

        {totals.length > 1 ? (
          <section>
            <div className="sec-head">
              <h2>Division totals by week</h2>
              <p>Every week loaded, newest first.</p>
            </div>
            <WeeklyTable rows={totals} />
          </section>
        ) : null}

        <section>
          <div className="sec-head">
            <h2>How each breakeven is built</h2>
            <p>
              Breakeven is monthly fixed cost divided by contribution margin.
              Lower it by cutting fixed cost, or by cutting a variable rate.
            </p>
          </div>
          <BreakevenTable stores={stores} />
        </section>

        <section>
          <div className="sec-head">
            <h2>Corporate overhead sits on top</h2>
            <p>
              Store targets cover store costs only. Before {division.name}{" "}
              breaks even as a whole, the group has to clear this as well.
            </p>
          </div>
          <div className="figures">
            <div>
              <div className="figure-label">Overhead per month</div>
              <div className="figure-value">
                {money(division.corporateOverhead)}
              </div>
            </div>
            <div>
              <div className="figure-label">Blended contribution margin</div>
              <div className="figure-value">{pct(division.blendedMargin)}</div>
            </div>
            <div>
              <div className="figure-label">Extra sales needed, monthly</div>
              <div className="figure-value">{money(division.extraMonthly)}</div>
            </div>
            <div>
              <div className="figure-label">Extra sales needed, weekly</div>
              <div className="figure-value">{money(division.extraWeekly)}</div>
            </div>
          </div>
        </section>

        <section>
          <div className="sec-head">
            <h2>Cost standards</h2>
            <p>
              Targets set from the 17-store benchmark. Half the stores already
              beat each one, so they are achievable rather than aspirational.
            </p>
          </div>
          <Standards rows={standards} />
        </section>

        <div className="provenance">
          <strong>Where these numbers come from.</strong> Weekly sales are Erply
          POS net sales. Prior-year comparisons are QuickBooks total income for
          the same calendar week. Cost rates and breakeven targets are derived
          from the {division.dataPeriod} profit and loss by class, and change
          only when the cost model is refreshed. Page data refreshes hourly.
        </div>
      </main>
    </>
  );
}
