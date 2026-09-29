import type { ReturnsPoint, ReturnsTrendData } from "@/lib/airtable";

/*
 * Returns trend: where the money that came back went, week by week.
 *
 * One plot, one measure. A stacked column per week, refunds over exchanges,
 * so the column height is total returns and the split inside it is what those
 * returns cost. Part-to-whole over time is the stacked bar's one honest job,
 * and both parts are in the same unit, so a single axis carries them.
 *
 * Rate is a second measure and never shares the axis: each week's refund and
 * exchange share of gross is printed under its column instead, and the
 * per-store rates live in the table below.
 *
 * Exchanges are blue and refunds red throughout, and both are direct-labelled,
 * so the reader never depends on hover or on telling two similar colours
 * apart. The figures are also in the weekly table below.
 */

const REFUND = "#B3423A";
const EXCHANGE = "#2a78d6";

const money0 = (n: number) =>
  n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });

const money2 = (n: number) =>
  n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const shortMoney = (n: number) =>
  n >= 1000 ? `$${Math.round(n / 1000)}k` : `$${Math.round(n)}`;

function niceCeiling(n: number): number {
  if (n <= 0) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(n)));
  return Math.ceil(n / (mag / 2)) * (mag / 2);
}

export function ReturnsTrend({ data }: { data: ReturnsTrendData }) {
  const { group, missingWeeks } = data;
  if (group.length < 2) return null;

  const first = group[0];
  const last = group[group.length - 1];
  const dRefunds = last.refunds - first.refunds;
  const dRefundPts = last.refundPct - first.refundPct;
  const dExchanges = last.exchanges - first.exchanges;
  const dExchangePts = last.exchangePct - first.exchangePct;

  return (
    <div className="returns-trend">
      <ul className="rt-legend">
        <li>
          <span className="rt-key" style={{ background: REFUND }} aria-hidden />
          Refunds &mdash; cash back
        </li>
        <li>
          <span
            className="rt-key"
            style={{ background: EXCHANGE }}
            aria-hidden
          />
          Exchanges &mdash; product swapped
        </li>
      </ul>

      <ReturnsColumns points={group} />

      <dl className="rt-deltas">
        <div>
          <dt>{`Refunds, ${first.weekLabel} → ${last.weekLabel}`}</dt>
          <dd className={dRefunds <= 0 ? "over" : "under"}>
            {dRefunds <= 0 ? "−" : "+"}
            {money2(Math.abs(dRefunds))}
            <span>
              {dRefundPts <= 0 ? "−" : "+"}
              {Math.abs(dRefundPts).toFixed(2)} pts of gross
            </span>
          </dd>
        </div>
        <div>
          <dt>Exchanges, same weeks</dt>
          <dd className="neutral">
            {dExchanges <= 0 ? "−" : "+"}
            {money2(Math.abs(dExchanges))}
            <span>
              {dExchangePts <= 0 ? "−" : "+"}
              {Math.abs(dExchangePts).toFixed(2)} pts of gross
            </span>
          </dd>
        </div>
      </dl>

      {missingWeeks.length ? (
        <p className="rt-note">
          {`${missingWeeks.map((w) => w.weekLabel).join(", ")} ${
            missingWeeks.length === 1 ? "is in" : "are in"
          } the sales window but carr${
            missingWeeks.length === 1 ? "ies" : "y"
          } no returns figures yet, so the returns trend is shorter than the sales trend above. Loading the invoice-level export for ${
            missingWeeks.length === 1 ? "that week" : "those weeks"
          } extends this chart.`}
        </p>
      ) : null}
    </div>
  );
}

/* Dollars: refunds stacked on exchanges, one column per week. */
function ReturnsColumns({ points }: { points: ReturnsPoint[] }) {
  const W = 880;
  const H = 320;
  const TOP = 30;
  const BOTTOM = 86;
  const LEFT = 76;
  const RIGHT = 24;
  const plotW = W - LEFT - RIGHT;
  const plotH = H - TOP - BOTTOM;
  const max = niceCeiling(
    Math.max(...points.map((p) => p.refunds + p.exchanges), 1)
  );
  const band = plotW / points.length;
  const barW = Math.min(96, band * 0.5);
  const y = (v: number) => TOP + plotH - (v / max) * plotH;
  const cx = (i: number) => LEFT + band * i + band / 2;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);

  return (
    <figure className="chart rt-columns">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        preserveAspectRatio="xMidYMid meet"
        aria-label={`Returns by week. ${points
          .map(
            (p) =>
              `${p.weekLabel}: refunds ${money0(p.refunds)}, exchanges ${money0(
                p.exchanges
              )}`
          )
          .join(". ")}.`}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line
              className="grid"
              x1={LEFT}
              x2={LEFT + plotW}
              y1={y(t)}
              y2={y(t)}
            />
            <text className="tick" x={LEFT - 12} y={y(t) + 4}>
              {shortMoney(t)}
            </text>
          </g>
        ))}

        {points.map((p, i) => {
          const hEx = (p.exchanges / max) * plotH;
          const hRf = (p.refunds / max) * plotH;
          const x = cx(i) - barW / 2;
          // 2px surface gap between the two segments, so the boundary reads
          // without relying on the colour change alone.
          const yEx = TOP + plotH - hEx;
          const yRf = yEx - hRf - 2;
          return (
            <g key={p.weekEnding}>
              <rect
                x={x}
                y={yEx}
                width={barW}
                height={Math.max(hEx, 1)}
                fill={EXCHANGE}
                rx={0}
              >
                <title>{`${p.weekLabel}: exchanges ${money2(
                  p.exchanges
                )} (${p.exchangePct.toFixed(2)}% of gross)`}</title>
              </rect>
              <rect
                x={x}
                y={yRf}
                width={barW}
                height={Math.max(hRf, 1)}
                fill={REFUND}
                rx={4}
              >
                <title>{`${p.weekLabel}: refunds ${money2(
                  p.refunds
                )} (${p.refundPct.toFixed(2)}% of gross)`}</title>
              </rect>

              <text className="rt-seg" x={cx(i)} y={yEx + hEx / 2 + 4} fill="#fff">
                {money0(p.exchanges)}
              </text>
              <text className="rt-seg" x={cx(i)} y={yRf + hRf / 2 + 4} fill="#fff">
                {money0(p.refunds)}
              </text>

              <text className="rt-total" x={cx(i)} y={yRf - 10}>
                {money0(p.refunds + p.exchanges)}
              </text>

              <text className="tick xtick" x={cx(i)} y={H - 58}>
                {p.weekLabel.replace(/,\s*\d{4}$/, "")}
              </text>
              <text className="rt-axis-rate" x={cx(i)} y={H - 36}>
                refunds {p.refundPct.toFixed(2)}% of gross
              </text>
              <text className="rt-axis-rate" x={cx(i)} y={H - 18}>
                exchanges {p.exchangePct.toFixed(2)}%
              </text>
            </g>
          );
        })}

        <line
          className="axis"
          x1={LEFT}
          x2={LEFT + plotW}
          y1={y(0)}
          y2={y(0)}
        />
      </svg>
      <figcaption>
        Total returns by week, split into the part that came back as cash and
        the part replaced by another purchase. Column height is every dollar
        returned; only the red part left the business.
      </figcaption>
    </figure>
  );
}
