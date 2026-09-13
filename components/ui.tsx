import { Fragment } from "react";
import Link from "next/link";
import type {
  Division,
  RollingStore,
  Standard,
  Store,
  StoreSeries,
  WeekTotal,
} from "@/lib/airtable";

/* ---------------- formatting ---------------- */

export const money = (n: number | null, dp = 0) =>
  n === null || Number.isNaN(n)
    ? "—"
    : n.toLocaleString("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: dp,
        maximumFractionDigits: dp,
      });

export const signedMoney = (n: number | null) =>
  n === null ? "—" : (n >= 0 ? "+" : "−") + money(Math.abs(n)).replace("$", "$");

export const pct = (n: number | null, dp = 1) =>
  n === null || Number.isNaN(n) ? "—" : `${n.toFixed(dp)}%`;

export const signedPct = (n: number | null, dp = 1) =>
  n === null ? "—" : `${n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(dp)}%`;

/* ---------------- masthead + nav ---------------- */

export function Masthead({ period }: { period?: string }) {
  return (
    <header className="masthead">
      <div className="wrap masthead-inner">
        <div className="wordmark">Kelley Group Performance</div>
        {period ? <div className="masthead-meta">{period}</div> : null}
      </div>
    </header>
  );
}

export function DivisionNav({
  divisions,
  current,
}: {
  divisions: Division[];
  current?: string;
}) {
  return (
    <nav className="divnav" aria-label="Divisions">
      <div className="wrap">
        <ul>
          {divisions.map((d) => {
            const active = d.slug === current;
            const hasData = d.storeCount > 0;
            return (
              <li key={d.id}>
                {hasData ? (
                  <Link
                    href={`/${d.slug}`}
                    className={active ? "current" : undefined}
                    aria-current={active ? "page" : undefined}
                  >
                    {d.name}
                  </Link>
                ) : (
                  <span className="disabled" title="No data loaded yet">
                    {d.name}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}

/* ---------------- weekly columns ---------------- */
/*
 * Net sales by week, one group per store, newest week darkest.
 * Each group carries its own gold breakeven rule, so stores of very
 * different sizes can sit on one shared dollar axis and still be read
 * against their own target.
 */

const WEEK_SHADES = ["var(--w1)", "var(--w2)", "var(--w3)", "var(--w4)"];

/** Shade a week by its position in the window; newest is always darkest. */
function shadeFor(index: number, count: number) {
  const offset = WEEK_SHADES.length - count;
  return WEEK_SHADES[Math.max(0, offset + index)] ?? "var(--w4)";
}

/** Round up to a readable axis top and pick tick values under it. */
function axisTicks(max: number) {
  const step =
    max > 120000 ? 40000 : max > 60000 ? 20000 : max > 24000 ? 10000 : 5000;
  const top = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = step; v < top; v += step) ticks.push(v);
  return { top, ticks };
}

const short = (n: number) =>
  n >= 1000 ? `$${Math.round(n / 1000)}k` : `$${n}`;

export function WeeklyColumns({
  series,
  weeks,
}: {
  series: StoreSeries[];
  weeks: { weekEnding: string; weekLabel: string }[];
}) {
  const peak = Math.max(
    ...series.flatMap((s) => [...s.points.map((p) => p.netSales), s.breakeven]),
    1
  );
  const { top, ticks } = axisTicks(peak);
  const h = (v: number) => `${Math.min((v / top) * 100, 100)}%`;

  return (
    <div className="chart">
      <div className="chart-inner">
        <div className="plot">
          <div className="yaxis">
            {ticks.map((t) => (
              <div
                key={t}
                className="ytick"
                style={{ bottom: h(t) }}
              >
                {short(t)}
              </div>
            ))}
          </div>

          {ticks.map((t) => (
            <div key={t} className="ygrid" style={{ bottom: h(t) }} />
          ))}

          {series.map((s) => (
            <div className="cgroup" key={s.store}>
              <div className="cbe" style={{ bottom: h(s.breakeven) }} />
              {s.points.map((p, i) => (
                <div
                  key={p.weekEnding}
                  className="cbar"
                  style={{
                    height: h(p.netSales),
                    background: shadeFor(i, s.points.length),
                  }}
                  title={`${s.store} · ${p.weekLabel} · ${money(
                    p.netSales
                  )} · ${
                    p.attainment === null ? "" : Math.round(p.attainment) + "%"
                  } of breakeven`}
                />
              ))}
            </div>
          ))}
        </div>

        <div className="xlabels">
          {series.map((s) => (
            <div className="xlab" key={s.store}>
              <b>{s.store}</b>
              {Math.round(s.attainment)}%
            </div>
          ))}
        </div>
      </div>

      <div className="legend">
        {weeks.map((w, i) => (
          <span key={w.weekEnding}>
            <span
              className="sw"
              style={{ background: shadeFor(i, weeks.length) }}
            />
            {w.weekLabel}
          </span>
        ))}
        <span>
          <span className="sw rule" />
          weekly breakeven
        </span>
      </div>
    </div>
  );
}

/* ---------------- rolling table ---------------- */

export function RollingTable({
  rows,
  weeks,
}: {
  rows: RollingStore[];
  weeks: number;
}) {
  const t = rows.reduce(
    (a, r) => ({
      netSales: a.netSales + r.netSales,
      target: a.target + r.target,
      units: a.units + r.units,
      priorYear: a.priorYear + r.priorYear,
    }),
    { netSales: 0, target: 0, units: 0, priorYear: 0 }
  );
  const tVar = t.netSales - t.target;
  const tYoy = t.priorYear
    ? ((t.netSales - t.priorYear) / t.priorYear) * 100
    : null;

  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th scope="col">Store</th>
            <th scope="col">Units</th>
            <th scope="col">Net sales</th>
            <th scope="col">Breakeven</th>
            <th scope="col">Over / short</th>
            <th scope="col">vs target</th>
            <th scope="col">Last year</th>
            <th scope="col">vs last year</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.store}>
              <td>{r.store}</td>
              <td>{r.units.toLocaleString("en-US")}</td>
              <td>{money(r.netSales)}</td>
              <td>{money(r.target)}</td>
              <td className={r.variance >= 0 ? "over" : "under"}>
                {signedMoney(r.variance)}
              </td>
              <td className={r.variance >= 0 ? "over" : "under"}>
                {signedPct(r.variancePct)}
              </td>
              <td>{r.priorYear ? money(r.priorYear) : "—"}</td>
              <td className={(r.yoyPct ?? 0) >= 0 ? "over" : "under"}>
                {signedPct(r.yoyPct)}
              </td>
            </tr>
          ))}
          <tr className="total">
            <td>All stores</td>
            <td>{t.units.toLocaleString("en-US")}</td>
            <td>{money(t.netSales)}</td>
            <td>{money(t.target)}</td>
            <td className={tVar >= 0 ? "over" : "under"}>
              {signedMoney(tVar)}
            </td>
            <td className={tVar >= 0 ? "over" : "under"}>
              {signedPct(t.target ? (tVar / t.target) * 100 : 0)}
            </td>
            <td>{t.priorYear ? money(t.priorYear) : "—"}</td>
            <td className={(tYoy ?? 0) >= 0 ? "over" : "under"}>
              {signedPct(tYoy)}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/* ---------------- weekly breakout ---------------- */
/* Net sales per store per week, one column pair per week. Grows sideways
   as weeks are added rather than needing a new layout. */

export function WeeklyBreakout({
  series,
  weeks,
}: {
  series: StoreSeries[];
  weeks: { weekEnding: string; weekLabel: string }[];
}) {
  const totalsByWeek = weeks.map((w) => {
    const pts = series
      .map((s) => s.points.find((p) => p.weekEnding === w.weekEnding))
      .filter(Boolean) as { netSales: number; units: number | null }[];
    return {
      netSales: pts.reduce((a, p) => a + p.netSales, 0),
      units: pts.reduce((a, p) => a + (p.units ?? 0), 0),
    };
  });

  const grand = series.reduce(
    (a, s) => ({
      total: a.total + s.total,
      target: a.target + s.target,
      be: a.be + s.breakeven,
    }),
    { total: 0, target: 0, be: 0 }
  );
  const gVar = grand.total - grand.target;

  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th scope="col">Store</th>
            {weeks.map((w) => (
              <th key={w.weekEnding} scope="col" colSpan={2}>
                {w.weekLabel}
              </th>
            ))}
            <th scope="col">Weekly breakeven</th>
            <th scope="col">Window total</th>
            <th scope="col">Over / short</th>
            <th scope="col">Attainment</th>
          </tr>
          <tr>
            <th scope="col" />
            {weeks.map((w) => (
              <Fragment key={w.weekEnding}>
                <th scope="col">Units</th>
                <th scope="col">Net sales</th>
              </Fragment>
            ))}
            <th scope="col" />
            <th scope="col" />
            <th scope="col" />
            <th scope="col" />
          </tr>
        </thead>
        <tbody>
          {series.map((s) => (
            <tr key={s.store}>
              <td>{s.store}</td>
              {weeks.map((w) => {
                const p = s.points.find((x) => x.weekEnding === w.weekEnding);
                const missed = p ? p.netSales < p.breakeven : false;
                return (
                  <Fragment key={w.weekEnding}>
                    <td>{p?.units?.toLocaleString("en-US") ?? "—"}</td>
                    <td className={p ? (missed ? "under" : "over") : undefined}>
                      {p ? money(p.netSales) : "—"}
                    </td>
                  </Fragment>
                );
              })}
              <td>{money(s.breakeven)}</td>
              <td>{money(s.total)}</td>
              <td className={s.variance >= 0 ? "over" : "under"}>
                {signedMoney(s.variance)}
              </td>
              <td className={s.variance >= 0 ? "over" : "under"}>
                {Math.round(s.attainment)}%
              </td>
            </tr>
          ))}
          <tr className="total">
            <td>All stores</td>
            {totalsByWeek.map((t, i) => (
              <Fragment key={weeks[i].weekEnding}>
                <td>{t.units.toLocaleString("en-US")}</td>
                <td>{money(t.netSales)}</td>
              </Fragment>
            ))}
            <td>{money(grand.be)}</td>
            <td>{money(grand.total)}</td>
            <td className={gVar >= 0 ? "over" : "under"}>
              {signedMoney(gVar)}
            </td>
            <td className={gVar >= 0 ? "over" : "under"}>
              {grand.target ? Math.round((grand.total / grand.target) * 100) : 0}%
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/* ---------------- week-by-week ---------------- */

export function WeeklyTable({ rows }: { rows: WeekTotal[] }) {
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th scope="col">Week</th>
            <th scope="col">Net sales</th>
            <th scope="col">Breakeven</th>
            <th scope="col">Over / short</th>
            <th scope="col">Same week last year</th>
            <th scope="col">vs last year</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((w) => {
            const v = w.netSales - w.target;
            return (
              <tr key={w.weekEnding}>
                <td>{w.weekLabel}</td>
                <td>{money(w.netSales)}</td>
                <td>{money(w.target)}</td>
                <td className={v >= 0 ? "over" : "under"}>
                  {signedMoney(v)}
                </td>
                <td>{w.priorYear ? money(w.priorYear) : "—"}</td>
                <td className={(w.yoyPct ?? 0) >= 0 ? "over" : "under"}>
                  {signedPct(w.yoyPct)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ---------------- breakeven build-up ---------------- */

export function BreakevenTable({ stores }: { stores: Store[] }) {
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th scope="col">Store</th>
            <th scope="col">COGS</th>
            <th scope="col">Card</th>
            <th scope="col">Ad fund</th>
            <th scope="col">Royalty</th>
            <th scope="col">Payroll</th>
            <th scope="col">Bonus</th>
            <th scope="col">Variable</th>
            <th scope="col">Margin</th>
            <th scope="col">Monthly fixed</th>
            <th scope="col">Monthly breakeven</th>
            <th scope="col">Weekly breakeven</th>
          </tr>
        </thead>
        <tbody>
          {stores.map((s) => (
            <tr key={s.id}>
              <td>{s.name}</td>
              <td>{pct(s.rates.cogs)}</td>
              <td>{pct(s.rates.card)}</td>
              <td>{pct(s.rates.adFund)}</td>
              <td>{pct(s.rates.royalty)}</td>
              <td>{pct(s.rates.payroll)}</td>
              <td>{pct(s.rates.bonus)}</td>
              <td>{pct(s.totalVariable)}</td>
              <td>{pct(s.contributionMargin)}</td>
              <td>{money(s.monthlyFixed)}</td>
              <td>{money(s.monthlyBreakeven)}</td>
              <td>{money(s.weeklyBreakeven)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---------------- cost standards ---------------- */

export function Standards({ rows }: { rows: Standard[] }) {
  return (
    <div className="standards">
      <div className="std-row head">
        <div>Cost category</div>
        <div className="std-target">Target</div>
        <div className="std-can">Can we change it</div>
        <div className="std-note">Notes</div>
      </div>
      {rows.map((r) => (
        <div className="std-row" key={r.category}>
          <div>{r.category}</div>
          <div className="std-target">{pct(r.target)}</div>
          <div className="std-can">{r.canChange}</div>
          <div className="std-note">{r.notes}</div>
        </div>
      ))}
    </div>
  );
}
