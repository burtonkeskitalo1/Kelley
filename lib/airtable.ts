// Airtable data layer.
//
// Table names must match the base exactly, spaces included.
// Linked-record fields ("Division" on Stores, "Store"/"Division" on Weekly Sales)
// come back from the API as arrays of record IDs, not names, so everything is
// resolved through id -> name maps built here.

const TOKEN = process.env.AIRTABLE_TOKEN;
const BASE = process.env.AIRTABLE_BASE_ID;

const TABLES = {
  divisions: "Divisions",
  stores: "Stores",
  weekly: "Weekly Sales",
  standards: "Cost Standards",
  financing: "Financing",
  financingByStore: "Financing by Store",
} as const;

type Rec = { id: string; fields: Record<string, any> };

async function fetchTable(table: string): Promise<Rec[]> {
  if (!TOKEN || !BASE) {
    throw new Error(
      "Missing AIRTABLE_TOKEN or AIRTABLE_BASE_ID. Set both in .env.local (local) " +
        "or in Vercel project settings (deployed)."
    );
  }

  const out: Rec[] = [];
  let offset: string | undefined;

  do {
    const url = new URL(
      `https://api.airtable.com/v0/${BASE}/${encodeURIComponent(table)}`
    );
    url.searchParams.set("pageSize", "100");
    if (offset) url.searchParams.set("offset", offset);

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${TOKEN}` },
      next: { revalidate: 3600 },
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(
        `Airtable ${table} -> ${res.status}. ${body.slice(0, 300)}`
      );
    }

    const json = await res.json();
    out.push(...json.records);
    offset = json.offset;
  } while (offset);

  return out;
}

const num = (v: any): number | null =>
  v === undefined || v === null || v === "" ? null : Number(v);

/** Linked-record cells are arrays of record ids; take the first. */
const linkId = (v: any): string | null =>
  Array.isArray(v) && v.length && typeof v[0] === "string" && v[0].startsWith("rec")
    ? v[0]
    : null;

/** Plain-text or single-select cells carry the name instead of an id. */
const linkText = (v: any): string | null => {
  if (typeof v === "string") return v;
  if (Array.isArray(v) && v.length && typeof v[0] === "string") return v[0];
  return null;
};

/**
 * Read the first field that exists, trying each spelling in turn.
 * The CSV imports went through two naming rounds ("COGS %" then "COGS (%)"),
 * and Airtable may hold either, so every lookup accepts both.
 */
function pick(fields: Record<string, any>, ...names: string[]): any {
  for (const n of names) {
    if (fields[n] !== undefined && fields[n] !== null && fields[n] !== "") {
      return fields[n];
    }
  }
  return undefined;
}

/** Try "<base> (%)" and "<base> %" and the bare name. */
const pctNames = (base: string) => [`${base} (%)`, `${base} %`, base];

/**
 * Percent convention.
 *
 * The base stores every percentage as a DECIMAL FRACTION: 0.1063 means
 * 10.63%, 0.6528 means 65.28%, -0.4409 means -44.09%. Components want
 * 0-100, so each percent field is multiplied by 100 on the way out.
 *
 * This used to be inferred per table by sampling the largest value and
 * assuming decimals if it was <= 1.5. That is unsafe: the scale for a whole
 * table hinged on one row. A single week more than 150% above breakeven --
 * Cincinnati already reached 109% on 2026-09-12, and Avon's first loaded
 * week computes to 148% -- pushed the maximum past the threshold and
 * silently rendered EVERY discount, variance and YoY figure in the table
 * 100x too small, with no error. The convention is now declared, not
 * guessed, so one outlier row can no longer rescale its neighbours.
 *
 * If the convention in Airtable ever changes, change PERCENT_STORED_AS
 * here -- do not reintroduce sniffing.
 */
const PERCENT_STORED_AS: "fraction" | "percent" = "fraction";
const PERCENT_FACTOR = PERCENT_STORED_AS === "fraction" ? 100 : 1;

/**
 * Values outside this band are almost certainly on the wrong scale: as a
 * fraction, |v| > 3 means over 300%, which no cost ratio, margin, discount
 * or variance in this data legitimately reaches. Flag rather than correct --
 * guessing is what caused the original bug -- so a bad cell shows up in the
 * Vercel logs and can be fixed at the source in Airtable.
 */
const PERCENT_SANITY_LIMIT = 3;
const warned = new Set<string>();

function pct(field: string, v: number | null): number | null {
  if (v === null || Number.isNaN(v)) return null;
  if (Math.abs(v) > PERCENT_SANITY_LIMIT && !warned.has(field)) {
    warned.add(field);
    console.warn(
      `[airtable] "${field}" = ${v} is outside the expected ` +
        `${PERCENT_STORED_AS} range. Expected a decimal fraction ` +
        `(0.1063 for 10.63%). Check this column in Airtable.`
    );
  }
  return v * PERCENT_FACTOR;
}

export type Division = {
  id: string;
  name: string;
  code: string;
  legalEntity: string;
  storeCount: number;
  dataPeriod: string;
  corporateOverhead: number | null;
  blendedMargin: number | null;
  extraMonthly: number | null;
  extraWeekly: number | null;
  status: string;
  slug: string;
};

export type Store = {
  id: string;
  name: string;
  divisionId: string | null;
  divisionName: string;
  storeNumber: string;
  location: string;
  monthlySales: number;
  weeklySales: number;
  rates: {
    cogs: number;
    card: number;
    adFund: number;
    royalty: number;
    payroll: number;
    bonus: number;
  };
  totalVariable: number;
  contributionMargin: number;
  monthlyFixed: number;
  weeklyFixed: number;
  monthlyBreakeven: number;
  weeklyBreakeven: number;
  fixedPctOfSales: number;
};

export type WeekRow = {
  id: string;
  weekEnding: string;
  weekLabel: string;
  storeId: string | null;
  storeName: string;
  divisionId: string | null;
  source: string;
  units: number | null;
  netSales: number;
  discountPct: number | null;
  avgTicket: number | null;
  weeklyBreakeven: number | null;
  variance: number | null;
  variancePct: number | null;
  priorYear: number | null;
  yoy: number | null;
  yoyPct: number | null;
};

export type Standard = {
  category: string;
  type: string;
  target: number;
  canChange: string;
  notes: string;
};

export const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

export async function getDivisions(): Promise<Division[]> {
  const recs = await fetchTable(TABLES.divisions);
  return recs
    .map((r) => {
      const name = r.fields["Division"] ?? "";
      return {
        id: r.id,
        name,
        code: r.fields["Entity Code"] ?? "",
        legalEntity: r.fields["Legal Entity"] ?? "",
        storeCount: num(r.fields["Store Count"]) ?? 0,
        dataPeriod: r.fields["Data Period"] ?? "",
        corporateOverhead: num(r.fields["Corporate Overhead (Monthly)"]),
        blendedMargin: pct(
          "Blended Contribution Margin",
          num(pick(r.fields, ...pctNames("Blended Contribution Margin")))
        ),
        extraMonthly: num(r.fields["Extra Monthly Sales Needed"]),
        extraWeekly: num(r.fields["Extra Weekly Sales Needed"]),
        status: r.fields["Status"] ?? "",
        slug: slugify(name),
      };
    })
    .filter((d) => d.name)
    .sort((a, b) => b.storeCount - a.storeCount);
}

export async function getStores(): Promise<Store[]> {
  const [recs, divisions] = await Promise.all([
    fetchTable(TABLES.stores),
    getDivisions(),
  ]);
  const divName = new Map(divisions.map((d) => [d.id, d.name]));
  const divIdByName = new Map(divisions.map((d) => [d.name, d.id]));

  return recs
    .map((r) => {
      const f = r.fields;
      // The Division column may be a linked record (ids) or plain text/select
      // (names), depending on how the import was finished. Accept either.
      const dText = linkText(f["Division"]);
      const dId = linkId(f["Division"]) ?? (dText ? divIdByName.get(dText) ?? null : null);
      return {
        id: r.id,
        name: f["Store"] ?? "",
        divisionId: dId,
        divisionName: (dId && divName.get(dId)) || dText || "",
        storeNumber: String(f["Store Number"] ?? ""),
        location: f["Location"] ?? "",
        monthlySales: num(f["Monthly Sales (YTD avg)"]) ?? 0,
        weeklySales: num(f["Weekly Sales (YTD avg)"]) ?? 0,
        rates: {
          cogs: pct("COGS %", num(pick(f, ...pctNames("COGS")))) ?? 0,
          card: pct("Card Fees %", num(pick(f, ...pctNames("Card Fees")))) ?? 0,
          adFund: pct("Ad Fund %", num(pick(f, ...pctNames("Ad Fund")))) ?? 0,
          royalty: pct("Royalty %", num(pick(f, ...pctNames("Royalty")))) ?? 0,
          payroll: pct("Payroll %", num(pick(f, ...pctNames("Payroll")))) ?? 0,
          bonus: pct("Bonus %", num(pick(f, ...pctNames("Bonus")))) ?? 0,
        },
        totalVariable:
          pct("Total Variable %", num(pick(f, ...pctNames("Total Variable")))) ?? 0,
        contributionMargin:
          pct(
            "Contribution Margin %",
            num(pick(f, ...pctNames("Contribution Margin")))
          ) ?? 0,
        monthlyFixed: num(f["Monthly Fixed Cost"]) ?? 0,
        weeklyFixed: num(f["Weekly Fixed Cost"]) ?? 0,
        monthlyBreakeven: num(f["Monthly Breakeven"]) ?? 0,
        weeklyBreakeven: num(f["Weekly Breakeven"]) ?? 0,
        fixedPctOfSales:
          pct(
            "Fixed % of Sales",
            num(pick(f, "Fixed % of Sales (%)", "Fixed % of Sales"))
          ) ?? 0,
      };
    })
    .filter((s) => s.name);
}

export async function getWeeks(): Promise<WeekRow[]> {
  const [recs, stores, divisions] = await Promise.all([
    fetchTable(TABLES.weekly),
    getStores(),
    getDivisions(),
  ]);
  const storeName = new Map(stores.map((s) => [s.id, s.name]));
  const storeIdByName = new Map(stores.map((s) => [s.name, s.id]));
  const divIdByName = new Map(divisions.map((d) => [d.name, d.id]));
  // A weekly row may name its store but not its division; fall back to the
  // division that store belongs to.
  const divByStoreName = new Map(
    stores.map((s) => [s.name, s.divisionId])
  );

  return recs
    .map((r) => {
      const f = r.fields;
      const sText = linkText(f["Store"]);
      const sId =
        linkId(f["Store"]) ?? (sText ? storeIdByName.get(sText) ?? null : null);
      const resolvedStoreName = (sId && storeName.get(sId)) || sText || "";
      const dText = linkText(f["Division"]);
      const dId =
        linkId(f["Division"]) ??
        (dText ? divIdByName.get(dText) ?? null : null) ??
        divByStoreName.get(resolvedStoreName) ??
        null;
      return {
        id: r.id,
        weekEnding: String(f["Week Ending"] ?? ""),
        weekLabel: f["Week Label"] ?? "",
        storeId: sId,
        storeName: resolvedStoreName,
        divisionId: dId,
        source: f["Source"] ?? "",
        units: num(f["Units"]),
        netSales: num(f["Net Sales"]) ?? 0,
        discountPct: pct("Discount %", num(pick(f, ...pctNames("Discount")))),
        avgTicket: num(f["Avg Ticket"]),
        weeklyBreakeven: num(f["Weekly Breakeven"]),
        variance: num(f["Variance $"]),
        variancePct: pct("Variance %", num(pick(f, ...pctNames("Variance")))),
        priorYear: num(f["Prior Year Same Week"]),
        yoy: num(f["YoY $"]),
        yoyPct: pct("YoY %", num(pick(f, ...pctNames("YoY")))),
      };
    })
    .filter((w) => w.weekEnding)
    .sort((a, b) => b.weekEnding.localeCompare(a.weekEnding));
}

export async function getStandards(): Promise<Standard[]> {
  const recs = await fetchTable(TABLES.standards);
  return recs
    .map((r) => ({
      category: r.fields["Cost Category"] ?? "",
      type: r.fields["Cost Type"] ?? "",
      target:
        pct(
          "Target % of Revenue",
          num(pick(r.fields, "Target % of Revenue (%)", "Target % of Revenue"))
        ) ?? 0,
      canChange: r.fields["Management Can Change"] ?? "",
      notes: r.fields["Notes"] ?? "",
    }))
    .filter((s) => s.category);
}

/* ------------------------------------------------------------------ */
/* Patient financing (Affirm / Snap / CareCredit)                      */
/* ------------------------------------------------------------------ */

/**
 * One row per provider per reporting period, hand-entered from each
 * provider's own settlement/statement export -- not raw transactions.
 * Periods legitimately differ in length between providers (Affirm's own
 * exports run many months at a flat rate; Snap and CareCredit are pulled
 * roughly monthly), so this is a curated rollup in the same spirit as
 * Divisions, not a live transaction feed. Add a new row each time you pull
 * a fresh statement; the page always uses the most recent row per provider
 * for the headline comparison and lists every row underneath for history.
 */
export type FinancingRow = {
  id: string;
  provider: string;
  periodStart: string;
  periodEnd: string;
  transactions: number;
  grossVolume: number;
  refunds: number;
  refundCount: number | null;
  netVolume: number;
  /** Null when the provider's export/statement doesn't expose a fee figure. */
  merchantFees: number | null;
  /** 0-100, null when merchantFees is unknown. */
  effectiveRate: number | null;
  avgTicket: number | null;
  notes: string;
};

export async function getFinancing(): Promise<FinancingRow[]> {
  const recs = await fetchTable(TABLES.financing);
  return recs
    .map((r) => {
      const f = r.fields;
      const grossVolume = num(f["Gross Volume"]) ?? 0;
      const refunds = num(f["Refunds $"]) ?? 0;
      const merchantFees = num(f["Merchant Fees"]);
      // Effective Rate can be entered directly in Airtable, or left blank
      // and derived here from fees/volume when both are known.
      const enteredRate = pct(
        "Effective Rate",
        num(pick(f, ...pctNames("Effective Rate")))
      );
      const effectiveRate =
        enteredRate ?? (merchantFees !== null && grossVolume ? (merchantFees / grossVolume) * 100 : null);
      return {
        id: r.id,
        provider: f["Provider"] ?? "",
        periodStart: String(f["Period Start"] ?? ""),
        periodEnd: String(f["Period End"] ?? ""),
        transactions: num(f["Transactions"]) ?? 0,
        grossVolume,
        refunds,
        refundCount: num(f["Refund Count"]),
        netVolume: num(f["Net Volume"]) ?? grossVolume - refunds,
        merchantFees,
        effectiveRate,
        avgTicket: num(f["Avg Ticket"]),
        notes: f["Notes"] ?? "",
      };
    })
    .filter((r) => r.provider && r.periodEnd)
    .sort((a, b) => b.periodEnd.localeCompare(a.periodEnd));
}

/**
 * One row per provider per store for a single reporting window, loaded from
 * the "Financing by Store" table. This is the store-level decomposition of
 * the Financing rows above: for a given period, each provider's store rows
 * sum to that provider's Financing row, which is the integrity check worth
 * running whenever a new window is loaded.
 *
 * `store` is the resolved store name. It is read from the "Store Label" text
 * column rather than the linked "Store" record, because a provider
 * identifier that has not yet been resolved to a store still needs to carry
 * its volume -- those rows are labelled "Unmapped <digits>" and have no
 * link. Dropping them would silently understate the provider total.
 */
export type FinancingStoreRow = {
  id: string;
  provider: string;
  store: string;
  /** Provider-side identifier the row was aggregated on. Audit trail. */
  sourceKey: string;
  periodStart: string;
  periodEnd: string;
  transactions: number;
  grossVolume: number;
  refunds: number;
  refundCount: number;
  netVolume: number;
  merchantFees: number;
  /** 0-100. Fees over gross volume, on the same basis as FinancingRow. */
  effectiveRate: number | null;
};

export async function getFinancingByStore(): Promise<FinancingStoreRow[]> {
  const recs = await fetchTable(TABLES.financingByStore);
  return recs
    .map((r) => {
      const f = r.fields;
      const grossVolume = num(f["Gross Volume"]) ?? 0;
      const refunds = num(f["Refunds $"]) ?? 0;
      const merchantFees = num(f["Merchant Fees"]) ?? 0;
      return {
        id: r.id,
        provider: f["Provider"] ?? "",
        store: f["Store Label"] ?? "",
        sourceKey: f["Source Key"] ?? "",
        periodStart: String(f["Period Start"] ?? ""),
        periodEnd: String(f["Period End"] ?? ""),
        transactions: num(f["Transactions"]) ?? 0,
        grossVolume,
        refunds,
        refundCount: num(f["Refund Count"]) ?? 0,
        netVolume: num(f["Net Volume"]) ?? grossVolume - refunds - merchantFees,
        merchantFees,
        effectiveRate: grossVolume ? (merchantFees / grossVolume) * 100 : null,
      };
    })
    .filter((r) => r.provider && r.store)
    .sort(
      (a, b) =>
        b.periodEnd.localeCompare(a.periodEnd) ||
        a.provider.localeCompare(b.provider) ||
        b.grossVolume - a.grossVolume
    );
}

/** Store rows for one provider, newest window only. */
export function storeRowsFor(
  rows: FinancingStoreRow[],
  provider: string
): FinancingStoreRow[] {
  const forProvider = rows.filter((r) => r.provider === provider);
  if (!forProvider.length) return [];
  // rows arrive newest-period-first, so the first row's period is the one to
  // show. Mixing windows in one table would make the column totals meaningless.
  const latest = forProvider[0].periodEnd;
  return forProvider.filter((r) => r.periodEnd === latest);
}

/** The most recent row for each provider, for the headline comparison. */
export function latestByProvider(rows: FinancingRow[]): FinancingRow[] {
  const byProvider = new Map<string, FinancingRow>();
  for (const r of rows) {
    // rows arrive newest-period-first (see getFinancing's sort), so the
    // first row seen for a provider is its latest.
    if (!byProvider.has(r.provider)) byProvider.set(r.provider, r);
  }
  return Array.from(byProvider.values());
}

/* ------------------------------------------------------------------ */
/* Rollups                                                             */
/* ------------------------------------------------------------------ */

/** Actuals only. The QBO rows are prior-year reference, not current sales. */
export const isActual = (w: WeekRow) => w.source === "Erply POS";

/** The N most recent week-ending dates that have actuals. */
export function recentWeeks(weeks: WeekRow[], n = 4): string[] {
  return Array.from(new Set(weeks.filter(isActual).map((w) => w.weekEnding)))
    .sort((a, b) => b.localeCompare(a))
    .slice(0, n);
}

export type RollingStore = {
  store: string;
  weeks: number;
  netSales: number;
  target: number;
  variance: number;
  variancePct: number;
  units: number;
  priorYear: number;
  yoyPct: number | null;
  /**
   * True when this store has prior-year figures for the window, so it can sit
   * on both sides of a year-over-year comparison.
   */
  hasPriorYear: boolean;
  /**
   * netSales when hasPriorYear, otherwise 0. Summing this instead of netSales
   * gives a comparable-store ("like for like") numerator: a store that opened
   * mid-year contributes to neither side of the ratio rather than to the
   * current side only, which would overstate growth. Colonie Center opened in
   * 2026 and Avon on 2026-04-01; including their sales against a prior year
   * that does not contain them turned a -18.63% NY decline into -2.18%.
   */
  comparableNetSales: number;
};

/** Rolling window per store: sales, target, and prior-year, summed. */
export function rollingByStore(
  weeks: WeekRow[],
  windowWeeks: string[]
): RollingStore[] {
  const inWindow = weeks.filter(
    (w) => isActual(w) && windowWeeks.includes(w.weekEnding)
  );

  const byStore = new Map<string, WeekRow[]>();
  for (const w of inWindow) {
    const list = byStore.get(w.storeName) ?? [];
    list.push(w);
    byStore.set(w.storeName, list);
  }

  return Array.from(byStore.entries())
    .map(([store, rows]) => {
      const netSales = rows.reduce((s, r) => s + r.netSales, 0);
      const target = rows.reduce((s, r) => s + (r.weeklyBreakeven ?? 0), 0);
      const units = rows.reduce((s, r) => s + (r.units ?? 0), 0);
      const priorYear = rows.reduce((s, r) => s + (r.priorYear ?? 0), 0);
      const hasPriorYear = priorYear > 0;
      return {
        store,
        weeks: rows.length,
        netSales,
        target,
        variance: netSales - target,
        variancePct: target ? ((netSales - target) / target) * 100 : 0,
        units,
        priorYear,
        yoyPct: priorYear ? ((netSales - priorYear) / priorYear) * 100 : null,
        hasPriorYear,
        comparableNetSales: hasPriorYear ? netSales : 0,
      };
    })
    .sort((a, b) => b.variancePct - a.variancePct);
}

export type WeekTotal = {
  weekEnding: string;
  weekLabel: string;
  netSales: number;
  target: number;
  priorYear: number;
  /**
   * Comparable-store: computed from stores that have a prior-year figure for
   * this week, on both sides. A store with no prior year is left out of the
   * ratio entirely rather than inflating the numerator.
   */
  yoyPct: number | null;
  /** Sales of the stores that carry a prior-year figure for this week. */
  comparableNetSales: number;
  /** Stores excluded from yoyPct because they have no prior-year figure. */
  excludedStores: string[];
};

/** Division totals per week, newest first. */
export function weeklyTotals(weeks: WeekRow[]): WeekTotal[] {
  const byWeek = new Map<string, WeekRow[]>();
  for (const w of weeks.filter(isActual)) {
    const list = byWeek.get(w.weekEnding) ?? [];
    list.push(w);
    byWeek.set(w.weekEnding, list);
  }

  return Array.from(byWeek.entries())
    .map(([weekEnding, rows]) => {
      const netSales = rows.reduce((s, r) => s + r.netSales, 0);
      const priorYear = rows.reduce((s, r) => s + (r.priorYear ?? 0), 0);
      const comparable = rows.filter((r) => (r.priorYear ?? 0) > 0);
      const comparableNetSales = comparable.reduce((s, r) => s + r.netSales, 0);
      const excludedStores = Array.from(
        new Set(
          rows
            .filter((r) => !((r.priorYear ?? 0) > 0) && r.storeName)
            .map((r) => r.storeName)
        )
      ).sort();
      return {
        weekEnding,
        weekLabel: rows[0]?.weekLabel ?? weekEnding,
        netSales,
        target: rows.reduce((s, r) => s + (r.weeklyBreakeven ?? 0), 0),
        priorYear,
        yoyPct: priorYear
          ? ((comparableNetSales - priorYear) / priorYear) * 100
          : null,
        comparableNetSales,
        excludedStores,
      };
    })
    .sort((a, b) => b.weekEnding.localeCompare(a.weekEnding));
}

export type StoreWeek = {
  weekEnding: string;
  weekLabel: string;
  netSales: number;
  units: number | null;
  breakeven: number;
  attainment: number | null;
};

export type StoreSeries = {
  store: string;
  breakeven: number;
  points: StoreWeek[];
  total: number;
  target: number;
  variance: number;
  attainment: number;
};

/**
 * Per-store weekly series across the window, oldest week first.
 * Weeks with no row for a store are omitted rather than zero-filled, so a
 * store that opened mid-window is not shown as having missed.
 */
export function seriesByStore(
  weeks: WeekRow[],
  windowWeeks: string[],
  stores: Store[]
): StoreSeries[] {
  const ordered = [...windowWeeks].sort();
  const beByStore = new Map(stores.map((s) => [s.name, s.weeklyBreakeven]));

  const byStore = new Map<string, WeekRow[]>();
  for (const w of weeks) {
    if (!isActual(w) || !ordered.includes(w.weekEnding)) continue;
    const list = byStore.get(w.storeName) ?? [];
    list.push(w);
    byStore.set(w.storeName, list);
  }

  return Array.from(byStore.entries())
    .map(([store, rows]) => {
      const breakeven =
        beByStore.get(store) ?? rows[0]?.weeklyBreakeven ?? 0;

      const points: StoreWeek[] = ordered
        .map((we) => rows.find((r) => r.weekEnding === we))
        .filter((r): r is WeekRow => Boolean(r))
        .map((r) => {
          const be = r.weeklyBreakeven ?? breakeven;
          return {
            weekEnding: r.weekEnding,
            weekLabel: r.weekLabel,
            netSales: r.netSales,
            units: r.units,
            breakeven: be,
            attainment: be ? (r.netSales / be) * 100 : null,
          };
        });

      const total = points.reduce((s, p) => s + p.netSales, 0);
      const target = points.reduce((s, p) => s + p.breakeven, 0);

      return {
        store,
        breakeven,
        points,
        total,
        target,
        variance: total - target,
        attainment: target ? (total / target) * 100 : 0,
      };
    })
    .sort((a, b) => b.total - a.total);
}

/* ------------------------------------------------------------------ */
/* Consolidated (group) rollup                                         */
/* ------------------------------------------------------------------ */

export type DivisionRollup = {
  divisionId: string;
  division: string;
  slug: string;
  /** Stores with actual sales in the window, not the division's store count. */
  storesReporting: number;
  units: number;
  netSales: number;
  /** Sales of the stores that also have a prior-year figure. */
  comparableNetSales: number;
  priorYear: number;
  /** Same-store change: comparable sales against prior year, or null. */
  sameStorePct: number | null;
  target: number;
  variance: number;
  variancePct: number;
  /** Stores left out of sameStorePct because they have no prior year. */
  excludedStores: string[];
};

/**
 * One row per division across the window, for the consolidated view.
 *
 * Same-store is computed per store, not per row: a store counts only when it
 * has prior-year sales somewhere in the window, and then contributes to both
 * sides. New stores land in netSales and in excludedStores, never in the
 * ratio -- see the note on comparableNetSales in RollingStore.
 */
export function consolidatedByDivision(
  weeks: WeekRow[],
  windowWeeks: string[],
  divisions: Division[]
): DivisionRollup[] {
  const inWindow = weeks.filter((w) => windowWeeks.includes(w.weekEnding));

  // Prior-year rows are tagged QBO P&L and excluded from actuals, so the
  // comparison figure rides on the actual row's own Prior Year Same Week cell.
  const priorByStore = new Map<string, number>();
  for (const w of inWindow) {
    if (!isActual(w) || !w.storeName) continue;
    priorByStore.set(
      w.storeName,
      (priorByStore.get(w.storeName) ?? 0) + (w.priorYear ?? 0)
    );
  }

  const byDivision = new Map<string, WeekRow[]>();
  for (const w of inWindow) {
    if (!isActual(w) || !w.divisionId) continue;
    const list = byDivision.get(w.divisionId) ?? [];
    list.push(w);
    byDivision.set(w.divisionId, list);
  }

  return divisions
    .map((d) => {
      const rows = byDivision.get(d.id) ?? [];
      const storeNames = Array.from(
        new Set(rows.map((r) => r.storeName).filter(Boolean))
      );
      const comparableNames = storeNames.filter(
        (s) => (priorByStore.get(s) ?? 0) > 0
      );
      const comparable = new Set(comparableNames);

      const netSales = rows.reduce((s, r) => s + r.netSales, 0);
      const comparableNetSales = rows
        .filter((r) => comparable.has(r.storeName))
        .reduce((s, r) => s + r.netSales, 0);
      const priorYear = rows.reduce((s, r) => s + (r.priorYear ?? 0), 0);
      const target = rows.reduce((s, r) => s + (r.weeklyBreakeven ?? 0), 0);
      const units = rows.reduce((s, r) => s + (r.units ?? 0), 0);

      return {
        divisionId: d.id,
        division: d.name,
        slug: d.slug,
        storesReporting: storeNames.length,
        units,
        netSales,
        comparableNetSales,
        priorYear,
        sameStorePct: priorYear
          ? ((comparableNetSales - priorYear) / priorYear) * 100
          : null,
        target,
        variance: netSales - target,
        variancePct: target ? ((netSales - target) / target) * 100 : 0,
        excludedStores: storeNames
          .filter((s) => !comparable.has(s))
          .sort(),
      };
    })
    .filter((r) => r.storesReporting > 0)
    .sort((a, b) => b.netSales - a.netSales);
}

export type GroupTotal = {
  units: number;
  netSales: number;
  comparableNetSales: number;
  priorYear: number;
  sameStorePct: number | null;
  target: number;
  variance: number;
  variancePct: number;
  excludedStores: string[];
};

/** Group totals across every division in a consolidated rollup. */
export function groupTotal(rows: DivisionRollup[]): GroupTotal {
  const t = rows.reduce(
    (a, r) => ({
      units: a.units + r.units,
      netSales: a.netSales + r.netSales,
      comparableNetSales: a.comparableNetSales + r.comparableNetSales,
      priorYear: a.priorYear + r.priorYear,
      target: a.target + r.target,
    }),
    { units: 0, netSales: 0, comparableNetSales: 0, priorYear: 0, target: 0 }
  );
  return {
    ...t,
    sameStorePct: t.priorYear
      ? ((t.comparableNetSales - t.priorYear) / t.priorYear) * 100
      : null,
    variance: t.netSales - t.target,
    variancePct: t.target ? ((t.netSales - t.target) / t.target) * 100 : 0,
    excludedStores: Array.from(
      new Set(rows.flatMap((r) => r.excludedStores))
    ).sort(),
  };
}

/** Ordered oldest-first labels for the window, for chart legends and headers. */
export function windowLabels(
  weeks: WeekRow[],
  windowWeeks: string[]
): { weekEnding: string; weekLabel: string }[] {
  return [...windowWeeks]
    .sort()
    .map((we) => ({
      weekEnding: we,
      weekLabel:
        weeks.find((w) => w.weekEnding === we)?.weekLabel ?? we,
    }));
}
