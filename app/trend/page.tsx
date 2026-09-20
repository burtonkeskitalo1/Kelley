import {
  divisionSeries,
  getDivisions,
  getWeeks,
  recentWeeks,
  weeklyTotals,
} from "@/lib/airtable";
import {
  DivisionNav,
  Masthead,
  TREND_SLUG,
  TrendChart,
  TrendLegend,
  TrendTable,
  money,
  pct,
} from "@/components/ui";

export const revalidate = 3600;

/** Same rolling window as the consolidated and division pages. */
const WINDOW = 4;

/**
 * Sales trend by division across the rolling window.
 *
 * One line per division, net sales, on a single shared axis -- never a second
 * y-scale. Divisions differ in size by an order of magnitude (Boston runs
 * roughly seven times Florida), and that gap is part of what the chart is
 * for; indexing every line to 100 at the first week would hide it.
 */
export default async function TrendPage() {
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
              <code>AIRTABLE_BASE_ID</code> in the Vercel project settings.
              This page retries on the next revalidation.
            </p>
          </div>
        </main>
      </>
    );
  }

  const window = recentWeeks(weeks, WINDOW);
  const series = divisionSeries(weeks, window, divisions);
  // Group sales and breakeven per week, for the band under the x-axis. Target
  // is the sum of the weekly breakeven on the stores that actually reported
  // that week, so it moves with the store count rather than being a constant.
  const footers = weeklyTotals(weeks)
    .filter((t) => window.includes(t.weekEnding))
    .map((t) => ({
      weekEnding: t.weekEnding,
      netSales: t.netSales,
      target: t.target,
    }));

  if (!series.length) {
    return (
      <>
        <Masthead />
        <DivisionNav divisions={divisions} current={TREND_SLUG} />
        <main className="wrap" style={{ paddingTop: "3rem" }}>
          <div className="notice">
            <h2>No weeks loaded yet</h2>
            <p>
              Add weekly rows to <code>Weekly Sales</code> with Source set to{" "}
              <code>Erply POS</code>, then reload.
            </p>
          </div>
        </main>
      </>
    );
  }

  const weekCount = series[0].points.length;
  const groupByWeek = series[0].points.map((p) => {
    const vals = series
      .map((s) => s.points.find((q) => q.weekEnding === p.weekEnding)?.netSales)
      .filter((v): v is number => v !== null && v !== undefined);
    return { weekEnding: p.weekEnding, label: p.weekLabel, total: vals.reduce((a, b) => a + b, 0) };
  });
  const firstTotal = groupByWeek[0]?.total ?? 0;
  const lastTotal = groupByWeek[groupByWeek.length - 1]?.total ?? 0;
  const groupChange =
    firstTotal !== 0 ? ((lastTotal - firstTotal) / firstTotal) * 100 : null;
  const best = [...series].sort(
    (a, b) => (b.changePct ?? -Infinity) - (a.changePct ?? -Infinity)
  )[0];
  const worst = [...series].sort(
    (a, b) => (a.changePct ?? Infinity) - (b.changePct ?? Infinity)
  )[0];

  return (
    <>
      <Masthead />
      <DivisionNav divisions={divisions} current={TREND_SLUG} />

      <main className="wrap">
        <div className="headline">
          <h1>Sales trend by division</h1>
          <p className="headline-sub">
            Net sales for each division over the last {weekCount} week
            {weekCount === 1 ? "" : "s"} on record, {groupByWeek[0]?.label} through{" "}
            {groupByWeek[groupByWeek.length - 1]?.label}. Actual POS sales only;
            prior-year reference rows are excluded.
          </p>

          <div className="figures">
            <div>
              <div className="figure-label">Latest week, all divisions</div>
              <div className="figure-value">{money(lastTotal)}</div>
            </div>
            <div>
              <div className="figure-label">
                First week to last, all divisions
              </div>
              <div className="figure-value">
                {groupChange === null ? "—" : pct(groupChange, 1)}
              </div>
            </div>
            <div>
              <div className="figure-label">Widest swing</div>
              <div className="figure-value">
                {best && worst && best.changePct !== null && worst.changePct !== null
                  ? `${best.division.replace(/^Good Feet\s*/, "")} ${pct(
                      best.changePct,
                      1
                    )} · ${worst.division.replace(/^Good Feet\s*/, "")} ${pct(
                      worst.changePct,
                      1
                    )}`
                  : "—"}
              </div>
            </div>
          </div>
        </div>

        <section>
          <div className="sec-head">
            <h2>Net sales by week</h2>
            <p>
              One line per division on a single scale, so the divisions are
              comparable in size as well as direction.
            </p>
          </div>
          <TrendLegend rows={series} />
          <TrendChart rows={series} footers={footers} />
        </section>

        <section>
          <div className="sec-head">
            <h2>The same figures</h2>
            <p>
              Every plotted value, plus each division&rsquo;s total across the
              window and its change from the first week to the last.
            </p>
          </div>
          <TrendTable rows={series} />
        </section>

        <div className="provenance">
          <strong>Where these numbers come from.</strong> Net sales on the{" "}
          <code>Weekly Sales</code> table in Airtable, rows sourced{" "}
          <code>Erply POS</code>, summed by division for each week in the
          rolling window. A week with no rows for a division breaks that
          division&rsquo;s line rather than plotting zero. This is total sales,
          not same-store: new stores are included here, unlike the year-over-year
          figures on the consolidated tab. Page data refreshes hourly.
        </div>
      </main>
    </>
  );
}
