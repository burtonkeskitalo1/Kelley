import Link from "next/link";
import {
  consolidatedByDivision,
  getDivisions,
  getWeeks,
  groupTotal,
  isActual,
  divisionSeries,
  recentWeeks,
  rollingByStore,
  weeklyTotals,
} from "@/lib/airtable";
import {
  CONSOLIDATED_SLUG,
  ConsolidatedTable,
  DivisionNav,
  Masthead,
  RollingTable,
  TrendChart,
  TrendLegend,
  WeeklyTable,
} from "@/components/ui";

export const revalidate = 3600;

const WINDOW = 4;

/**
 * Consolidated view: the whole Kelley Group across every division.
 *
 * The page leads with the trend chart rather than a headline figure: three
 * weeks of every division on one axis says more at a glance than a single
 * percentage, and the week totals and breakeven gap ride under its axis.
 * The same-store numbers that used to head this page are all still here --
 * the By division table carries same-store sales, prior year and the
 * same-store percentage per division and for the group.
 *
 * Same-store remains the honest comparison. Stores with no
 * prior-year figure -- Colonie Center (opened 2026), Avon (2026-04-01), and
 * all three OH/KY stores -- contribute to net sales but to neither side of
 * the comparison, so growth is not flattered by new locations. Every figure
 * that mixes the two is labelled.
 */
export default async function ConsolidatedPage() {
  // This page prerenders at build time. If Airtable is unreachable then, the
  // deploy must still succeed and the page render on demand later -- the same
  // guarantee generateStaticParams() gives the division routes. Without this
  // guard an Airtable outage during a Vercel build fails the whole deploy.
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

  const hasActuals = weeks.some(isActual);
  const window = recentWeeks(weeks, WINDOW);
  const byDivision = consolidatedByDivision(weeks, window, divisions);
  const total = groupTotal(byDivision);
  const rolling = rollingByStore(weeks, window);
  const totals = weeklyTotals(weeks);
  const weekLabel = totals[0]?.weekLabel;

  const storesReporting = byDivision.reduce(
    (a, r) => a + r.storesReporting,
    0
  );
  const series = divisionSeries(weeks, window, divisions);
  const footers = totals
    .filter((t) => window.includes(t.weekEnding))
    .map((t) => ({
      weekEnding: t.weekEnding,
      netSales: t.netSales,
      target: t.target,
    }));

  if (!hasActuals) {
    return (
      <>
        <Masthead />
        <DivisionNav divisions={divisions} current={CONSOLIDATED_SLUG} />
        <main className="wrap" style={{ paddingTop: "3rem" }}>
          <div className="notice">
            <h2>No sales loaded yet</h2>
            <p>
              Divisions and cost models are in place, but no weekly rows are
              tagged <code>Erply POS</code>. Append actuals to Weekly Sales and
              reload.
            </p>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <Masthead period={weekLabel ? `Latest week · ${weekLabel}` : undefined} />
      <DivisionNav divisions={divisions} current={CONSOLIDATED_SLUG} />

      <main className="wrap">
        <section className="lede">
          <div className="sec-head">
            <h2>Sales trend by division</h2>
            <p>
              All divisions · {storesReporting} stores reporting ·{" "}
              {window.length} week{window.length === 1 ? "" : "s"} of actual
              sales. Under each week: total net sales, the combined breakeven
              those stores had to clear, and the gap between the two. Hover or
              tab to a week for every division&rsquo;s figure.
            </p>
          </div>
          <TrendLegend rows={series} />
          <TrendChart rows={series} footers={footers} />
        </section>

        <section>
          <div className="sec-head">
            <h2>By division</h2>
            <p>
              Net sales is every store. Same-store is the subset that also has
              a prior-year figure, on both sides of the comparison, so a
              division carrying a new store is not credited with growth it did
              not earn. Division names link through to the full view.
            </p>
          </div>
          <ConsolidatedTable rows={byDivision} total={total} />
        </section>

        <section>
          <div className="sec-head">
            <h2>Every store, rolling window</h2>
            <p>
              All {rolling.length} stores across the group, ranked by how far
              each sits from its own breakeven. A store with no prior year
              shows no year-over-year figure rather than a misleading one.
            </p>
          </div>
          <RollingTable rows={rolling} weeks={window.length} />
        </section>

        <section>
          <div className="sec-head">
            <h2>Group totals by week</h2>
            <p>Every week loaded, newest first, across all divisions.</p>
          </div>
          <WeeklyTable rows={totals} />
        </section>

        <p className="footnote">
          Division detail, breakeven build-up, corporate overhead and cost
          standards live on each division tab:{" "}
          {divisions
            .filter((d) => d.storeCount > 0)
            .map((d, i, arr) => (
              <span key={d.id}>
                <Link href={`/${d.slug}`}>{d.name}</Link>
                {i < arr.length - 1 ? ", " : "."}
              </span>
            ))}
        </p>
      </main>
    </>
  );
}
