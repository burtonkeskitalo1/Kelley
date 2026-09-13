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
 * Percent fields arrive either as 0-100 (63.52) or as decimal fractions
 * (0.6352), depending on whether the column is a plain number or Airtable's
 * native Percent type. Deciding per value is unsafe — a genuine 1.1% bonus
 * rate and a 110% attainment are indistinguishable in isolation — so the
 * scale is decided once per table from the largest sample value. Real cost
 * ratios and margins always exceed 1.5 when expressed as percentages.
 */
const scale = (v: number | null, k: number): number | null =>
  v === null ? null : v * k;

function percentScale(samples: (number | null)[]): 1 | 100 {
  const max = samples.reduce<number>(
    (m, v) => (v === null || Number.isNaN(v) ? m : Math.max(m, Math.abs(v))),
    0
  );
  return max > 0 && max <= 1.5 ? 100 : 1;
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
  const k = percentScale(
    recs.map((r) =>
      num(pick(r.fields, ...pctNames("Blended Contribution Margin")))
    )
  );
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
        blendedMargin: scale(
          num(pick(r.fields, ...pctNames("Blended Contribution Margin"))),
          k
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

  // Contribution margin is the sentinel: always well above 1.5 as a percent.
  const k = percentScale(
    recs.map((r) =>
      num(pick(r.fields, ...pctNames("Contribution Margin")))
    )
  );

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
          cogs: scale(num(pick(f, ...pctNames("COGS"))), k) ?? 0,
          card: scale(num(pick(f, ...pctNames("Card Fees"))), k) ?? 0,
          adFund: scale(num(pick(f, ...pctNames("Ad Fund"))), k) ?? 0,
          royalty: scale(num(pick(f, ...pctNames("Royalty"))), k) ?? 0,
          payroll: scale(num(pick(f, ...pctNames("Payroll"))), k) ?? 0,
          bonus: scale(num(pick(f, ...pctNames("Bonus"))), k) ?? 0,
        },
        totalVariable: scale(num(pick(f, ...pctNames("Total Variable"))), k) ?? 0,
        contributionMargin:
          scale(num(pick(f, ...pctNames("Contribution Margin"))), k) ?? 0,
        monthlyFixed: num(f["Monthly Fixed Cost"]) ?? 0,
        weeklyFixed: num(f["Weekly Fixed Cost"]) ?? 0,
        monthlyBreakeven: num(f["Monthly Breakeven"]) ?? 0,
        weeklyBreakeven: num(f["Weekly Breakeven"]) ?? 0,
        fixedPctOfSales:
          scale(
            num(pick(f, "Fixed % of Sales (%)", "Fixed % of Sales")),
            k
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

  // Variance swings widest, so it is the most reliable sentinel here.
  const k = percentScale(
    recs.map((r) => num(pick(r.fields, ...pctNames("Variance"))))
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
        discountPct: scale(num(pick(f, ...pctNames("Discount"))), k),
        avgTicket: num(f["Avg Ticket"]),
        weeklyBreakeven: num(f["Weekly Breakeven"]),
        variance: num(f["Variance $"]),
        variancePct: scale(num(pick(f, ...pctNames("Variance"))), k),
        priorYear: num(f["Prior Year Same Week"]),
        yoy: num(f["YoY $"]),
        yoyPct: scale(num(pick(f, ...pctNames("YoY"))), k),
      };
    })
    .filter((w) => w.weekEnding)
    .sort((a, b) => b.weekEnding.localeCompare(a.weekEnding));
}

export async function getStandards(): Promise<Standard[]> {
  const recs = await fetchTable(TABLES.standards);
  const k = percentScale(
    recs.map((r) =>
      num(pick(r.fields, "Target % of Revenue (%)", "Target % of Revenue"))
    )
  );
  return recs
    .map((r) => ({
      category: r.fields["Cost Category"] ?? "",
      type: r.fields["Cost Type"] ?? "",
      target:
        scale(
          num(
            pick(r.fields, "Target % of Revenue (%)", "Target % of Revenue")
          ),
          k
        ) ?? 0,
      canChange: r.fields["Management Can Change"] ?? "",
      notes: r.fields["Notes"] ?? "",
    }))
    .filter((s) => s.category);
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
  yoyPct: number | null;
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
      return {
        weekEnding,
        weekLabel: rows[0]?.weekLabel ?? weekEnding,
        netSales,
        target: rows.reduce((s, r) => s + (r.weeklyBreakeven ?? 0), 0),
        priorYear,
        yoyPct: priorYear ? ((netSales - priorYear) / priorYear) * 100 : null,
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
