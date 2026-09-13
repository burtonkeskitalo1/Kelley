"use client";

import { Fragment, useMemo, useState } from "react";

/*
 * Sortable table.
 *
 * Everything crossing the server/client boundary has to be serialisable, so
 * the server precomputes each cell's value and its tone (over/under) and this
 * component only handles ordering and formatting. No functions are passed in.
 */

export type ColFormat =
  | "money"
  | "signedMoney"
  /** Whole percent, e.g. 162%. */
  | "pct"
  /** One decimal place, e.g. 51.4%. Used where small rate differences matter. */
  | "pct1"
  | "signedPct"
  | "int"
  | "text";

export type Column = {
  key: string;
  label: string;
  format: ColFormat;
  /** Optional header group, e.g. a week that spans Units + Net sales. */
  group?: string;
  /** Columns are sortable unless explicitly disabled. */
  sortable?: boolean;
};

export type Row = {
  id: string;
  values: Record<string, number | string | null>;
  tones?: Record<string, "over" | "under" | null>;
};

type Dir = "asc" | "desc";

const money = (n: number) =>
  n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });

function render(v: number | string | null, f: ColFormat) {
  if (v === null || v === undefined || v === "") return "—";
  if (f === "text") return String(v);
  const n = Number(v);
  if (Number.isNaN(n)) return String(v);
  switch (f) {
    case "money":
      return money(n);
    case "signedMoney":
      return (n >= 0 ? "+" : "−") + money(Math.abs(n));
    case "pct":
      return `${n.toFixed(0)}%`;
    case "pct1":
      return `${n.toFixed(1)}%`;
    case "signedPct":
      return `${n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(1)}%`;
    case "int":
      return n.toLocaleString("en-US");
    default:
      return String(v);
  }
}

export default function SortableTable({
  columns,
  rows,
  totalRow,
  defaultSort,
  defaultDir = "desc",
}: {
  columns: Column[];
  rows: Row[];
  totalRow?: Row;
  defaultSort?: string;
  defaultDir?: Dir;
}) {
  const [sortKey, setSortKey] = useState<string | null>(defaultSort ?? null);
  const [dir, setDir] = useState<Dir>(defaultDir);

  const sorted = useMemo(() => {
    if (!sortKey) return rows;
    const out = [...rows];
    out.sort((a, b) => {
      const av = a.values[sortKey];
      const bv = b.values[sortKey];
      // Blanks always sink, whichever direction is active.
      if (av === null || av === undefined) return 1;
      if (bv === null || bv === undefined) return -1;
      const cmp =
        typeof av === "number" && typeof bv === "number"
          ? av - bv
          : String(av).localeCompare(String(bv));
      return dir === "asc" ? cmp : -cmp;
    });
    return out;
  }, [rows, sortKey, dir]);

  function toggle(key: string) {
    if (key === sortKey) {
      setDir(dir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      // Text sorts read best A→Z; numbers read best biggest-first.
      const col = columns.find((c) => c.key === key);
      setDir(col?.format === "text" ? "asc" : "desc");
    }
  }

  const grouped = columns.some((c) => c.group);
  const groups: { label: string; span: number }[] = [];
  if (grouped) {
    for (const c of columns) {
      const label = c.group ?? "";
      const last = groups[groups.length - 1];
      if (last && last.label === label) last.span += 1;
      else groups.push({ label, span: 1 });
    }
  }

  return (
    <div className="table-scroll">
      <table>
        <thead>
          {grouped ? (
            <tr className="grouprow">
              {groups.map((g, i) => (
                <th key={`${g.label}-${i}`} colSpan={g.span} scope="colgroup">
                  {g.label}
                </th>
              ))}
            </tr>
          ) : null}
          <tr>
            {columns.map((c) => {
              const active = c.key === sortKey;
              const canSort = c.sortable !== false;
              return (
                <th key={c.key} scope="col" aria-sort={
                  active ? (dir === "asc" ? "ascending" : "descending") : "none"
                }>
                  {canSort ? (
                    <button
                      type="button"
                      className={`sortbtn${active ? " active" : ""}`}
                      onClick={() => toggle(c.key)}
                      title={`Sort by ${c.label}`}
                    >
                      <span>{c.label}</span>
                      <span className="arrow" aria-hidden="true">
                        {active ? (dir === "asc" ? "↑" : "↓") : "↕"}
                      </span>
                    </button>
                  ) : (
                    c.label
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={r.id}>
              {columns.map((c) => (
                <td key={c.key} className={r.tones?.[c.key] ?? undefined}>
                  {render(r.values[c.key], c.format)}
                </td>
              ))}
            </tr>
          ))}
          {totalRow ? (
            <tr className="total">
              {columns.map((c) => (
                <td key={c.key} className={totalRow.tones?.[c.key] ?? undefined}>
                  {render(totalRow.values[c.key], c.format)}
                </td>
              ))}
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
