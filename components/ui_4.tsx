import { Fragment } from "react";
import Link from "next/link";
import SortableTable, {
  type Column,
  type Row,
} from "./SortableTable";
import type {
  Division,
  DivisionRollup,
  FinancingRow,
  FinancingStoreRow,
  DivisionSeries,
  GroupTotal,
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

/** Slug for the group-wide tab; it lives at "/" rather than "/<division>". */
export const CONSOLIDATED_SLUG = "consolidated";

/** Slug for the trend tab, at "/trend". */
export const TREND_SLUG = "trend";

/** Slug for the patient-financing tab, at "/financing". */
export const FINANCING_SLUG = "financing";

export function DivisionNav({
  divisions,
  current,
}: {
  divisions: Division[];
  current?: string;
}) {
  const onConsolidated = current === CONSOLIDATED_SLUG;
  const onFinancing = current === FINANCING_SLUG;
  const onTrend = current === TREND_SLUG;
  return (
    <nav className="divnav" aria-label="Divisions">
      <div className="wrap">
        <ul>
          <li>
            <Link
              href="/"
              className={onConsolidated ? "current" : undefined}
              aria-current={onConsolidated ? "page" : undefined}
            >
              Consolidated
            </Link>
          </li>
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
          <li>
            <Link
              href="/trend"
              className={onTrend ? "current" : undefined}
              aria-current={onTrend ? "page" : undefined}
            >
              Trend
            </Link>
          </li>
          <li>
            <Link
              href="/financing"
              className={onFinancing ? "current" : undefined}
              aria-current={onFinancing ? "page" : undefined}
            >
              Financing
            </Link>
          </li>
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
      comparable: a.comparable + r.comparableNetSales,
      target: a.target + r.target,
      units: a.units + r.units,
      priorYear: a.priorYear + r.priorYear,
    }),
    { netSales: 0, comparable: 0, target: 0, units: 0, priorYear: 0 }
  );
  const tVar = t.netSales - t.target;
  // Same-store: a store with no prior year sits on neither side of the ratio.
  const tYoy = t.priorYear
    ? ((t.comparable - t.priorYear) / t.priorYear) * 100
    : null;
  const anyExcluded = rows.some((r) => !r.hasPriorYear);

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
            <th scope="col">{anyExcluded ? "vs LY (same store)" : "vs last year"}</th>
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
            <td>{anyExcluded ? "All stores (YoY same-store)" : "All stores"}</td>
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
/* Net sales per store per week. Sortable on every column; the column set
   grows sideways as weeks are added. */

export function WeeklyBreakout({
  series,
  weeks,
}: {
  series: StoreSeries[];
  weeks: { weekEnding: string; weekLabel: string }[];
}) {
  const columns: Column[] = [
    { key: "store", label: "Store", format: "text" },
    ...weeks.flatMap((w): Column[] => [
      { key: `u_${w.weekEnding}`, label: "Units", format: "int", group: w.weekLabel },
      { key: `s_${w.weekEnding}`, label: "Net sales", format: "money", group: w.weekLabel },
    ]),
    { key: "breakeven", label: "Weekly breakeven", format: "money" },
    { key: "total", label: "Window total", format: "money" },
    { key: "variance", label: "Over / short", format: "signedMoney" },
    { key: "attainment", label: "Attainment", format: "pct" },
  ];

  const rows: Row[] = series.map((s) => {
    const values: Row["values"] = { store: s.store };
    const tones: NonNullable<Row["tones"]> = {};
    for (const w of weeks) {
      const p = s.points.find((x) => x.weekEnding === w.weekEnding);
      values[`u_${w.weekEnding}`] = p?.units ?? null;
      values[`s_${w.weekEnding}`] = p ? p.netSales : null;
      tones[`s_${w.weekEnding}`] = p
        ? p.netSales < p.breakeven
          ? "under"
          : "over"
        : null;
    }
    values.breakeven = s.breakeven;
    values.total = s.total;
    values.variance = s.variance;
    values.attainment = s.attainment;
    tones.variance = s.variance >= 0 ? "over" : "under";
    tones.attainment = s.variance >= 0 ? "over" : "under";
    return { id: s.store, values, tones };
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

  const totalValues: Row["values"] = { store: "All stores" };
  for (const w of weeks) {
    const pts = series
      .map((s) => s.points.find((p) => p.weekEnding === w.weekEnding))
      .filter(Boolean) as { netSales: number; units: number | null }[];
    totalValues[`u_${w.weekEnding}`] = pts.reduce(
      (a, p) => a + (p.units ?? 0),
      0
    );
    totalValues[`s_${w.weekEnding}`] = pts.reduce((a, p) => a + p.netSales, 0);
  }
  totalValues.breakeven = grand.be;
  totalValues.total = grand.total;
  totalValues.variance = gVar;
  totalValues.attainment = grand.target
    ? (grand.total / grand.target) * 100
    : 0;

  const totalRow: Row = {
    id: "total",
    values: totalValues,
    tones: {
      variance: gVar >= 0 ? "over" : "under",
      attainment: gVar >= 0 ? "over" : "under",
    },
  };

  return (
    <SortableTable
      columns={columns}
      rows={rows}
      totalRow={totalRow}
      defaultSort="total"
      defaultDir="desc"
    />
  );
}

/* ---------------- week-by-week ---------------- */

export function WeeklyTable({ rows }: { rows: WeekTotal[] }) {
  const anyExcluded = rows.some((r) => r.excludedStores.length > 0);
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th scope="col">Week</th>
            <th scope="col">Net sales</th>
            <th scope="col">Breakeven</th>
            <th scope="col">Over / short</th>
            {anyExcluded ? (
              <th scope="col">Same-store sales</th>
            ) : null}
            <th scope="col">Same week last year</th>
            <th scope="col">
              {anyExcluded ? "vs LY (same store)" : "vs last year"}
            </th>
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
                {anyExcluded ? (
                  <td
                    title={
                      w.excludedStores.length
                        ? `Excludes ${w.excludedStores.join(", ")}`
                        : undefined
                    }
                  >
                    {money(w.comparableNetSales)}
                  </td>
                ) : null}
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
  const columns: Column[] = [
    { key: "store", label: "Store", format: "text" },
    { key: "cogs", label: "COGS", format: "pct1" },
    { key: "card", label: "Card", format: "pct1" },
    { key: "adFund", label: "Ad fund", format: "pct1" },
    { key: "royalty", label: "Royalty", format: "pct1" },
    { key: "payroll", label: "Payroll", format: "pct1" },
    { key: "bonus", label: "Bonus", format: "pct1" },
    { key: "variable", label: "Variable", format: "pct1" },
    { key: "margin", label: "Margin", format: "pct1" },
    { key: "monthlyFixed", label: "Monthly fixed", format: "money" },
    { key: "monthlyBe", label: "Monthly breakeven", format: "money" },
    { key: "weeklyBe", label: "Weekly breakeven", format: "money" },
  ];

  const rows: Row[] = stores.map((s) => ({
    id: s.id,
    values: {
      store: s.name,
      cogs: s.rates.cogs,
      card: s.rates.card,
      adFund: s.rates.adFund,
      royalty: s.rates.royalty,
      payroll: s.rates.payroll,
      bonus: s.rates.bonus,
      variable: s.totalVariable,
      margin: s.contributionMargin,
      monthlyFixed: s.monthlyFixed,
      monthlyBe: s.monthlyBreakeven,
      weeklyBe: s.weeklyBreakeven,
    },
  }));

  return (
    <SortableTable
      columns={columns}
      rows={rows}
      defaultSort="monthlyBe"
      defaultDir="desc"
    />
  );
}

/* ---------------- cost standards ---------------- */

/* ---------------- consolidated: division rollup ---------------- */

/**
 * One row per division for the group view. Net sales is every store; the
 * same-store column is the subset that also has a prior year, so a division
 * carrying a new store shows the honest comparable figure and names the
 * store that was left out.
 */
export function ConsolidatedTable({
  rows,
  total,
}: {
  rows: DivisionRollup[];
  total: GroupTotal;
}) {
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th scope="col">Division</th>
            <th scope="col">Stores</th>
            <th scope="col">Units</th>
            <th scope="col">Net sales</th>
            <th scope="col">Breakeven</th>
            <th scope="col">Over / short</th>
            <th scope="col">Same-store sales</th>
            <th scope="col">Same weeks last year</th>
            <th scope="col">Same-store change</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.divisionId}>
              <td>
                <Link href={`/${r.slug}`}>{r.division}</Link>
              </td>
              <td>{r.storesReporting}</td>
              <td>{r.units.toLocaleString("en-US")}</td>
              <td>{money(r.netSales)}</td>
              <td>{money(r.target)}</td>
              <td className={r.variance >= 0 ? "over" : "under"}>
                {signedMoney(r.variance)}
              </td>
              <td
                title={
                  r.excludedStores.length
                    ? `Excludes ${r.excludedStores.join(", ")}`
                    : undefined
                }
              >
                {r.priorYear ? money(r.comparableNetSales) : "—"}
              </td>
              <td>{r.priorYear ? money(r.priorYear) : "—"}</td>
              <td
                className={
                  r.sameStorePct === null
                    ? undefined
                    : r.sameStorePct >= 0
                      ? "over"
                      : "under"
                }
              >
                {signedPct(r.sameStorePct)}
              </td>
            </tr>
          ))}
          <tr className="total">
            <td>Kelley Group</td>
            <td>{rows.reduce((a, r) => a + r.storesReporting, 0)}</td>
            <td>{total.units.toLocaleString("en-US")}</td>
            <td>{money(total.netSales)}</td>
            <td>{money(total.target)}</td>
            <td className={total.variance >= 0 ? "over" : "under"}>
              {signedMoney(total.variance)}
            </td>
            <td>{money(total.comparableNetSales)}</td>
            <td>{total.priorYear ? money(total.priorYear) : "—"}</td>
            <td
              className={
                total.sameStorePct === null
                  ? undefined
                  : total.sameStorePct >= 0
                    ? "over"
                    : "under"
              }
            >
              {signedPct(total.sameStorePct)}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

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

/* ---------------- patient financing ---------------- */
/*
 * Affirm, Snap Finance, and CareCredit compared on the same footing.
 * Rows come from getFinancing() -- one hand-entered row per provider per
 * statement period, not raw transactions. merchantFees/effectiveRate are
 * null rather than zero when a provider's export doesn't expose a fee
 * figure (CareCredit's transaction-level exports don't; its monthly
 * merchant statement does), and every table below renders that as "—"
 * rather than guessing.
 */

const financingColumns: Column[] = [
  { key: "provider", label: "Provider", format: "text" },
  { key: "period", label: "Period", format: "text", sortable: false },
  { key: "transactions", label: "Transactions", format: "int" },
  { key: "grossVolume", label: "Gross volume", format: "money" },
  { key: "refunds", label: "Refunds $", format: "money" },
  { key: "refundRate", label: "Refund rate", format: "pct1" },
  { key: "netVolume", label: "Net volume", format: "money" },
  { key: "merchantFees", label: "Merchant fees", format: "money" },
  { key: "effectiveRate", label: "Effective rate", format: "pct1" },
  { key: "avgTicket", label: "Avg ticket", format: "money" },
];

function periodLabel(r: FinancingRow) {
  const start = r.periodStart
    ? new Date(r.periodStart).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      })
    : null;
  const end = r.periodEnd
    ? new Date(r.periodEnd).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : r.periodEnd;
  return start ? `${start} - ${end}` : end ?? "—";
}

function financingRowValues(r: FinancingRow): Row {
  const refundRate = r.grossVolume ? (r.refunds / r.grossVolume) * 100 : 0;
  return {
    id: r.id,
    values: {
      provider: r.provider,
      period: periodLabel(r),
      transactions: r.transactions,
      grossVolume: r.grossVolume,
      refunds: r.refunds,
      refundRate,
      netVolume: r.netVolume,
      merchantFees: r.merchantFees,
      effectiveRate: r.effectiveRate,
      avgTicket: r.avgTicket,
    },
    tones: {},
  };
}

/** Headline comparison: the most recent period per provider, side by side. */
export function FinancingComparison({ rows }: { rows: FinancingRow[] }) {
  const tableRows = rows.map(financingRowValues);
  return (
    <SortableTable
      columns={financingColumns}
      rows={tableRows}
      defaultSort="grossVolume"
      defaultDir="desc"
    />
  );
}

/** Every period on record for every provider, most recent first. */
export function FinancingHistory({ rows }: { rows: FinancingRow[] }) {
  const tableRows = rows.map(financingRowValues);
  // No defaultSort: getFinancing() already returns rows newest Period End
  // first, and SortableTable preserves the given order when no sort key is
  // set. Sorting on "period" instead would order by the formatted label
  // string -- "Jul 31 - Aug 30" sorts above "Aug 18 - Sep 14" because "J"
  // beats "A" -- which is alphabetical by month name, not chronological.
  return <SortableTable columns={financingColumns} rows={tableRows} />;
}

/* ---------------- financing, by store ---------------- */
/*
 * The store-level decomposition of one provider's period. Rendered one
 * provider at a time so the total row is meaningful: these rows sum to that
 * provider's row in the comparison table above.
 *
 * A store with no rows for a provider simply does not appear -- absence here
 * means the provider reported no activity for it in the window, not zero
 * sales. Rows labelled "Unmapped" are real volume whose provider-side
 * identifier has not been tied to a store yet; they are shown rather than
 * hidden so the column still totals.
 */

const financingStoreColumns: Column[] = [
  { key: "store", label: "Store", format: "text" },
  { key: "transactions", label: "Transactions", format: "int" },
  { key: "grossVolume", label: "Gross volume", format: "money" },
  { key: "refunds", label: "Refunds $", format: "money" },
  { key: "refundCount", label: "Refunds #", format: "int" },
  { key: "netVolume", label: "Net volume", format: "money" },
  { key: "merchantFees", label: "Merchant fees", format: "money" },
  { key: "effectiveRate", label: "Effective rate", format: "pct1" },
];

function financingStoreValues(r: FinancingStoreRow): Row {
  return {
    id: r.id,
    values: {
      store: r.store,
      transactions: r.transactions,
      grossVolume: r.grossVolume,
      refunds: r.refunds,
      refundCount: r.refundCount,
      netVolume: r.netVolume,
      merchantFees: r.merchantFees,
      effectiveRate: r.effectiveRate,
    },
    tones: { netVolume: r.netVolume < 0 ? "under" : null },
  };
}

export function FinancingByStore({ rows }: { rows: FinancingStoreRow[] }) {
  if (!rows.length) return null;
  const tableRows = rows.map(financingStoreValues);
  const sum = rows.reduce(
    (a, r) => ({
      transactions: a.transactions + r.transactions,
      grossVolume: a.grossVolume + r.grossVolume,
      refunds: a.refunds + r.refunds,
      refundCount: a.refundCount + r.refundCount,
      netVolume: a.netVolume + r.netVolume,
      merchantFees: a.merchantFees + r.merchantFees,
    }),
    {
      transactions: 0,
      grossVolume: 0,
      refunds: 0,
      refundCount: 0,
      netVolume: 0,
      merchantFees: 0,
    }
  );
  const totalRow: Row = {
    id: "total",
    values: {
      store: "All stores",
      ...sum,
      // Derived from the summed figures, not averaged across the store rows --
      // an unweighted average of store rates would overweight small stores.
      effectiveRate: sum.grossVolume
        ? (sum.merchantFees / sum.grossVolume) * 100
        : null,
    },
    tones: {},
  };
  return (
    <SortableTable
      columns={financingStoreColumns}
      rows={tableRows}
      totalRow={totalRow}
      defaultSort="grossVolume"
      defaultDir="desc"
    />
  );
}

/* ---------------- trend ---------------- */
/*
 * The chart itself lives in components/TrendChart.tsx because its hover
 * readout needs client state; it is re-exported here so pages keep importing
 * everything from one place. The legend and the table stay server-rendered.
 *
 * Five divisions, so five categorical hues in fixed slot order -- the hue
 * follows the division, never its current rank, so the colours do not
 * reshuffle when a division's sales change or a week is added.
 *
 * Three of these five hues sit below 3:1 contrast on the white card, so the
 * palette's relief rule applies: every series is directly labelled at its last
 * point AND repeated in the table below, so no value is reachable by colour
 * alone.
 */

export { TrendChart } from "./TrendChart";
export type { TrendFooter } from "./TrendChart";

const SERIES_HUES = [
  "#2a78d6", // 1 blue
  "#eb6834", // 2 orange
  "#1baf7a", // 3 aqua
  "#eda100", // 4 yellow
  "#e87ba4", // 5 magenta
] as const;

/** Hue by division id, fixed on first sight and stable thereafter. */
function hueMap(rows: DivisionSeries[]): Map<string, string> {
  return new Map(
    rows.map((r, i) => [r.divisionId, SERIES_HUES[i % SERIES_HUES.length]])
  );
}

export function TrendLegend({ rows }: { rows: DivisionSeries[] }) {
  const hues = hueMap(rows);
  return (
    <ul className="legend">
      {rows.map((r) => (
        <li key={r.divisionId}>
          <span
            className="swatch"
            style={{ background: hues.get(r.divisionId) }}
            aria-hidden="true"
          />
          {r.division}
        </li>
      ))}
    </ul>
  );
}

/** The table twin: every plotted value, readable without colour. */
export function TrendTable({ rows }: { rows: DivisionSeries[] }) {
  if (!rows.length) return null;
  const weeks = rows[0].points;
  const columns: Column[] = [
    { key: "division", label: "Division", format: "text" },
    ...weeks.map((p) => ({
      key: p.weekEnding,
      label: p.weekLabel.replace(/,\s*\d{4}$/, ""),
      format: "money" as const,
    })),
    { key: "total", label: "Window total", format: "money" },
    { key: "changePct", label: "First to last", format: "signedPct" },
  ];

  const tableRows: Row[] = rows.map((r) => ({
    id: r.divisionId,
    values: {
      division: r.division,
      ...Object.fromEntries(r.points.map((p) => [p.weekEnding, p.netSales])),
      total: r.total,
      changePct: r.changePct,
    },
    tones: {
      changePct:
        r.changePct === null ? null : r.changePct < 0 ? "under" : "over",
    },
  }));

  const totalRow: Row = {
    id: "total",
    values: {
      division: "All divisions",
      ...Object.fromEntries(
        weeks.map((p) => {
          const vals = rows
            .map((r) => r.points.find((q) => q.weekEnding === p.weekEnding))
            .map((q) => q?.netSales)
            .filter((v): v is number => v !== null && v !== undefined);
          return [p.weekEnding, vals.length ? vals.reduce((a, b) => a + b, 0) : null];
        })
      ),
      total: rows.reduce((a, r) => a + r.total, 0),
      // Group change is recomputed from the group's own first and last weeks,
      // not averaged across divisions -- an unweighted average of five
      // percentages would let Florida move the group as much as Boston.
      changePct: (() => {
        const sumAt = (we: string) => {
          const vals = rows
            .map((r) => r.points.find((q) => q.weekEnding === we)?.netSales)
            .filter((v): v is number => v !== null && v !== undefined);
          return vals.length ? vals.reduce((a, b) => a + b, 0) : null;
        };
        const first = sumAt(weeks[0].weekEnding);
        const last = sumAt(weeks[weeks.length - 1].weekEnding);
        return first !== null && last !== null && first !== 0
          ? ((last - first) / first) * 100
          : null;
      })(),
    },
    tones: {},
  };

  return (
    <SortableTable columns={columns} rows={tableRows} totalRow={totalRow} />
  );
}
