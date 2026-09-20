"use client";

import { useState } from "react";
import type { DivisionSeries } from "@/lib/airtable";

/*
 * Net sales by division across the rolling window, with a crosshair readout.
 *
 * The hover layer follows the crosshair convention rather than per-line
 * hovering: the reader aims at a WEEK, not at a 2px stroke, and the readout
 * then lists every division at that week. Landing on a particular line is
 * never required, which matters here because five lines converge inside a few
 * thousand dollars at the right-hand edge.
 *
 * Everything the tooltip shows is also on the page without it -- each line is
 * directly labelled, the week totals sit under the axis, and the table below
 * carries every value. The tooltip enhances; it never gates.
 */

export type TrendFooter = {
  weekEnding: string;
  netSales: number;
  target: number;
};

const SERIES_HUES = [
  "#2a78d6", // 1 blue
  "#eb6834", // 2 orange
  "#1baf7a", // 3 aqua
  "#eda100", // 4 yellow
  "#e87ba4", // 5 magenta
] as const;

const CHART = {
  w: 900,
  h: 408,
  top: 24,
  right: 132,
  bottom: 116,
  left: 76,
};

function niceCeiling(n: number): number {
  if (n <= 0) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(n)));
  return Math.ceil(n / (mag / 2)) * (mag / 2);
}

const shortMoney = (n: number) =>
  n >= 1000 ? `$${Math.round(n / 1000)}k` : `$${Math.round(n)}`;

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

export function TrendChart({
  rows,
  footers = [],
}: {
  rows: DivisionSeries[];
  footers?: TrendFooter[];
}) {
  const [active, setActive] = useState<number | null>(null);

  if (!rows.length) return null;

  const hues = new Map(
    rows.map((r, i) => [r.divisionId, SERIES_HUES[i % SERIES_HUES.length]])
  );
  const footerByWeek = new Map(footers.map((f) => [f.weekEnding, f]));
  const weeks = rows[0].points;
  const n = weeks.length;

  const max = niceCeiling(
    Math.max(...rows.flatMap((r) => r.points.map((p) => p.netSales ?? 0)), 1)
  );
  const plotW = CHART.w - CHART.left - CHART.right;
  const plotH = CHART.h - CHART.top - CHART.bottom;
  const x = (i: number) =>
    n === 1 ? CHART.left + plotW / 2 : CHART.left + (i / (n - 1)) * plotW;
  const y = (v: number) => CHART.top + plotH - (v / max) * plotH;

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);

  // Labels at the right edge, pushed apart where two divisions finish the
  // window within a few thousand dollars of each other.
  const LABEL_GAP = 15;
  const drawn = rows
    .map((r) => ({
      r,
      hue: hues.get(r.divisionId)!,
      pts: r.points
        .map((p, i) => ({ p, i }))
        .filter(({ p }) => p.netSales !== null),
    }))
    .filter(({ pts }) => pts.length > 0)
    .map(({ r, hue, pts }) => ({
      r,
      hue,
      pts,
      d: pts
        .map(
          ({ p, i }, k) =>
            `${k === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(
              p.netSales as number
            ).toFixed(1)}`
        )
        .join(" "),
      endY: y(pts[pts.length - 1].p.netSales as number),
    }))
    .sort((a, b) => a.endY - b.endY)
    .map((row, i, all) => {
      let labelY = row.endY;
      if (i > 0) {
        const prev =
          (all[i - 1] as { labelY?: number }).labelY ?? all[i - 1].endY;
        if (labelY - prev < LABEL_GAP) labelY = prev + LABEL_GAP;
      }
      (row as { labelY?: number }).labelY = labelY;
      return { ...row, labelY };
    });

  const activeWeek = active === null ? null : weeks[active];
  const activeFooter = activeWeek
    ? footerByWeek.get(activeWeek.weekEnding) ?? null
    : null;
  // Readout on the right for early weeks, on the left for the last one, so it
  // never runs off the card.
  const flip = active !== null && active > n - 1.5;

  return (
    <figure className="chart">
      <div className="chart-plot">
        <svg
          viewBox={`0 0 ${CHART.w} ${CHART.h}`}
          role="img"
          aria-label={`Net sales by division across ${n} week${
            n === 1 ? "" : "s"
          }, with consolidated sales and breakeven under each week. The same figures appear in the table below.`}
          preserveAspectRatio="xMidYMid meet"
        >
          {ticks.map((t) => (
            <g key={t}>
              <line
                className="grid"
                x1={CHART.left}
                x2={CHART.left + plotW}
                y1={y(t)}
                y2={y(t)}
              />
              <text className="tick" x={CHART.left - 12} y={y(t) + 4}>
                {shortMoney(t)}
              </text>
            </g>
          ))}

          {active !== null ? (
            <line
              className="crosshair"
              x1={x(active)}
              x2={x(active)}
              y1={CHART.top}
              y2={CHART.top + plotH}
            />
          ) : null}

          {weeks.map((p, i) => {
            const f = footerByWeek.get(p.weekEnding);
            return (
              <g key={p.weekEnding}>
                <text
                  className={`tick xtick${active === i ? " on" : ""}`}
                  x={x(i)}
                  y={CHART.h - 84}
                >
                  {p.weekLabel.replace(/,\s*\d{4}$/, "")}
                </text>
                {f ? (
                  <>
                    {/* The total stays in neutral ink: the gap line below
                        carries the over/under status, so colouring both would
                        double-encode the same fact. */}
                    <text className="xtotal" x={x(i)} y={CHART.h - 62}>
                      {money0(f.netSales)}
                    </text>
                    <text className="xbreakeven" x={x(i)} y={CHART.h - 43}>
                      {f.target
                        ? `breakeven ${money0(f.target)}`
                        : "breakeven —"}
                    </text>
                    {f.target ? (
                      <text
                        className={`xgap ${
                          f.netSales < f.target ? "under" : "over"
                        }`}
                        x={x(i)}
                        y={CHART.h - 21}
                      >
                        {`${f.netSales < f.target ? "−" : "+"}${money0(
                          Math.abs(f.netSales - f.target)
                        )}  (${(
                          ((f.netSales - f.target) / f.target) *
                          100
                        ).toFixed(1)}%)`}
                      </text>
                    ) : null}
                  </>
                ) : null}
              </g>
            );
          })}

          {drawn.map(({ r, hue, d, pts, labelY }) => (
            <g
              key={r.divisionId}
              className={
                active === null ? undefined : "series dim-when-inactive"
              }
            >
              <path className="series-line" d={d} stroke={hue} />
              {pts.map(({ p, i }) => (
                <circle
                  key={p.weekEnding}
                  className={`series-dot${active === i ? " on" : ""}`}
                  cx={x(i)}
                  cy={y(p.netSales as number)}
                  r={active === i ? 6.5 : 5}
                  fill={hue}
                />
              ))}
              <text
                className="series-label"
                x={x(pts[pts.length - 1].i) + 14}
                y={labelY + 4}
                fill={hue}
              >
                {r.division.replace(/^Good Feet\s*/, "")}
              </text>
            </g>
          ))}

          <line
            className="axis"
            x1={CHART.left}
            x2={CHART.left + plotW}
            y1={y(0)}
            y2={y(0)}
          />

          {/* Hit zones: one full-height column per week, so the pointer only
              has to be nearest the week, never on a line. Each is focusable so
              keyboard users get the same readout as hover. */}
          {weeks.map((p, i) => {
            const half = n === 1 ? plotW / 2 : plotW / (n - 1) / 2;
            const left = Math.max(CHART.left - 8, x(i) - half);
            const right = Math.min(CHART.left + plotW + 8, x(i) + half);
            return (
              <rect
                key={`hit-${p.weekEnding}`}
                className="hitzone"
                x={left}
                y={CHART.top}
                width={right - left}
                height={plotH}
                tabIndex={0}
                role="button"
                aria-label={`Show net sales for ${p.weekLabel}`}
                onMouseEnter={() => setActive(i)}
                onFocus={() => setActive(i)}
                onMouseLeave={() => setActive(null)}
                onBlur={() => setActive(null)}
              />
            );
          })}
        </svg>

        {activeWeek ? (
          <div
            className={`chart-tip${flip ? " flip" : ""}`}
            style={{ left: `${(x(active as number) / CHART.w) * 100}%` }}
            role="status"
          >
            <div className="tip-head">{activeWeek.weekLabel}</div>
            <ul>
              {rows.map((r) => {
                const pt = r.points.find(
                  (q) => q.weekEnding === activeWeek.weekEnding
                );
                return (
                  <li key={r.divisionId}>
                    <span
                      className="tip-key"
                      style={{ background: hues.get(r.divisionId) }}
                      aria-hidden="true"
                    />
                    <span className="tip-val">
                      {pt && pt.netSales !== null ? money2(pt.netSales) : "—"}
                    </span>
                    <span className="tip-name">
                      {r.division.replace(/^Good Feet\s*/, "")}
                    </span>
                  </li>
                );
              })}
            </ul>
            {activeFooter ? (
              <div className="tip-foot">
                <div>
                  <span className="tip-val">
                    {money2(activeFooter.netSales)}
                  </span>
                  <span className="tip-name">all divisions</span>
                </div>
                {activeFooter.target ? (
                  <div
                    className={
                      activeFooter.netSales < activeFooter.target
                        ? "under"
                        : "over"
                    }
                  >
                    <span className="tip-val">
                      {activeFooter.netSales < activeFooter.target ? "−" : "+"}
                      {money2(
                        Math.abs(activeFooter.netSales - activeFooter.target)
                      )}
                    </span>
                    <span className="tip-name">vs breakeven</span>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <figcaption>
        Net sales by division, oldest week first. Labels at the right name each
        line. Under each week: total net sales for all divisions, the combined
        breakeven those stores had to clear, and the gap between the two. Hover
        or tab to a week for every division&rsquo;s figure; exact values are
        also in the table below.
      </figcaption>
    </figure>
  );
}
