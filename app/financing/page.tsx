import {
  getDivisions,
  getFinancing,
  latestByProvider,
} from "@/lib/airtable";
import {
  DivisionNav,
  FINANCING_SLUG,
  FinancingComparison,
  FinancingHistory,
  FinancingNotes,
  Masthead,
  money,
  pct,
} from "@/components/ui";

export const revalidate = 3600;

/**
 * Patient financing: Affirm, Snap Finance, and CareCredit compared.
 *
 * Rows come from a hand-maintained "Financing" table in Airtable -- one row
 * per provider per statement period -- not a live transaction feed. See
 * getFinancing() in lib/airtable.ts. Each provider's period length differs
 * (Affirm's own exports run many months at a flat rate; Snap and CareCredit
 * are pulled roughly monthly), so the headline uses the most recent row per
 * provider and the periods are labelled rather than assumed equal.
 */
export default async function FinancingPage() {
  let divisions: Awaited<ReturnType<typeof getDivisions>>;
  let financing: Awaited<ReturnType<typeof getFinancing>>;
  try {
    [divisions, financing] = await Promise.all([
      getDivisions(),
      getFinancing(),
    ]);
  } catch {
    return (
      <>
        <Masthead />
        <main className="wrap" style={{ paddingTop: "3rem" }}>
          <div className="notice">
            <h2>Airtable is unreachable</h2>
            <p>
              The base could not be read. Check <code>AIRTABLE_TOKEN</code>{" "}
              and <code>AIRTABLE_BASE_ID</code> in the Vercel project
              settings. This page retries on the next revalidation.
            </p>
          </div>
        </main>
      </>
    );
  }

  if (!financing.length) {
    return (
      <>
        <Masthead />
        <DivisionNav divisions={divisions} current={FINANCING_SLUG} />
        <main className="wrap" style={{ paddingTop: "3rem" }}>
          <div className="notice">
            <h2>No financing periods loaded yet</h2>
            <p>
              Add a row to the <code>Financing</code> table in Airtable for
              each provider — Affirm, Snap Finance, CareCredit — with the
              period it covers, then reload.
            </p>
          </div>
        </main>
      </>
    );
  }

  const latest = latestByProvider(financing);
  const highestRate = latest.reduce(
    (a, r) => (r.effectiveRate !== null && r.effectiveRate > (a?.effectiveRate ?? -1) ? r : a),
    latest[0]
  );
  const totalVolume = latest.reduce((a, r) => a + r.grossVolume, 0);
  const knownFeeVolume = latest
    .filter((r) => r.merchantFees !== null)
    .reduce((a, r) => a + r.grossVolume, 0);
  const missingFeeProviders = latest
    .filter((r) => r.merchantFees === null)
    .map((r) => r.provider);

  return (
    <>
      <Masthead />
      <DivisionNav divisions={divisions} current={FINANCING_SLUG} />

      <main className="wrap">
        <div className="headline">
          <h1>Patient financing across three providers</h1>
          <p className="headline-sub">
            Most recent statement period on file for each of{" "}
            {latest.length} provider{latest.length === 1 ? "" : "s"} —
            Affirm, Snap Finance, and CareCredit. Periods differ in length
            between providers; each is labelled rather than assumed equal.
          </p>

          {missingFeeProviders.length ? (
            <p className="headline-sub">
              No merchant fee figure on file for{" "}
              {missingFeeProviders.join(", ")} — effective rate shows as “—”
              until a statement with fee data is loaded.
            </p>
          ) : null}

          <div className="figures">
            <div>
              <div className="figure-label">Total volume, latest periods</div>
              <div className="figure-value">{money(totalVolume)}</div>
            </div>
            <div>
              <div className="figure-label">Highest effective rate</div>
              <div className="figure-value">
                {highestRate?.effectiveRate != null
                  ? `${highestRate.provider} · ${pct(highestRate.effectiveRate, 2)}`
                  : "—"}
              </div>
            </div>
            <div>
              <div className="figure-label">Volume with a known fee rate</div>
              <div className="figure-value">
                {totalVolume ? pct((knownFeeVolume / totalVolume) * 100) : "—"}
              </div>
            </div>
          </div>
        </div>

        <section>
          <div className="sec-head">
            <h2>Provider comparison — latest period</h2>
            <p>
              One row per provider, its most recent statement period. Refund
              rate and effective rate are both computed on gross volume, so
              they read on the same basis across providers.
            </p>
          </div>
          <FinancingComparison rows={latest} />
        </section>

        {financing.length > latest.length ? (
          <section>
            <div className="sec-head">
              <h2>All periods on record</h2>
              <p>Every period loaded for every provider, most recent first.</p>
            </div>
            <FinancingHistory rows={financing} />
          </section>
        ) : null}

        <section>
          <div className="sec-head">
            <h2>Notes and caveats</h2>
            <p>
              Anomalies, methodology notes, and data-quality flags entered
              alongside each period in Airtable.
            </p>
          </div>
          <FinancingNotes rows={financing} />
        </section>

        <div className="provenance">
          <strong>Where these numbers come from.</strong> Each row is entered
          by hand from that provider's own export or merchant statement — see
          the <code>Financing</code> table in Airtable. Gross volume, refunds,
          and transaction counts come from transaction-level exports where
          available; merchant fees and effective rate come from the
          provider's settlement statement when one has been loaded, and show
          as “—” otherwise rather than being estimated. Page data refreshes
          hourly.
        </div>
      </main>
    </>
  );
}
