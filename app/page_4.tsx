import Link from "next/link";
import {
  consolidatedByDivision,
  getDivisions,
  getWeeks,
  groupTotal,
  isActual,
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
  WeeklyTable,
  money,
  signedMoney,
  signedPct,
} from "@/components/ui";

export const revalidate = 3600;

const WINDOW = 4;

/**
 * Consolidated view: the whole Kelley Group across every division.
 *
 * The number this page leads with is SAME-STORE change. Stores with no
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
  const belowTarget = rolling.filter((r) => r.variance < 0).length;

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
        <div className="headline">
          {total.sameStorePct !== null ? (
            <h1>
              Same-store sales are{" "}
              <span className={total.sameStorePct < 0 ? "down" : "up"}>
                {signedPct(total.sameStorePct)}
              </span>{" "}
              against the same weeks last year
            </h1>
          ) : (
            <h1>Kelley Group Performance</h1>
          )}

          <p className="headline-sub">
            All divisions · {storesReporting} stores reporting ·{" "}
            {window.length} week{window.length === 1 ? "" : "s"} of actual
            sales. Store targets cover each store&rsquo;s own costs; corporate
            overhead is counted separately on each division tab.
          </p>

          {total.excludedStores.length ? (
            <p className="headline-sub">
              Same-store excludes {total.excludedStores.join(", ")} —{" "}
              {total.excludedStores.length === 1 ? "it has" : "they have"} no
              prior-year sales for these weeks.{" "}
              {money(total.netSales - total.comparableNetSales)} of net sales
              sits outside the comparison.
            </p>
          ) : null}

          <div className="figures">
            <div>
              <div className="figure-label">Net sales, all stores</div>
              <div className="figure-value">{money(total.netSales)}</div>
            </div>
            <div>
              <div className="figure-label">Same-store sales</div>
              <div className="figure-value">
                {money(total.comparableNetSales)}
              </div>
            </div>
            <div>
              <div className="figure-label">Same weeks last year</div>
              <div className="figure-value">
                {total.priorYear ? money(total.priorYear) : "—"}
              </div>
            </div>
            <div>
              <div className="figure-label">Breakeven for those weeks</div>
              <div className="figure-value">{money(total.target)}</div>
            </div>
            <div>
              <div className="figure-label">Over / short</div>
              <div
                className={`figure-value ${
                  total.variance >= 0 ? "over" : "under"
                }`}
              >
                {signedMoney(total.variance)}
              </div>
            </div>
            <div>
              <div className="figure-label">Stores under target</div>
              <div className="figure-value">
                {belowTarget} of {rolling.length}
              </div>
            </div>
          </div>
        </div>

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
