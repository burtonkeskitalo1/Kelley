// Temporary diagnostic endpoint: visit /api/diag
//
// Reports why the Airtable connection is failing without ever returning the
// token. Delete this file once the dashboard is working.

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const EXPECTED = ["Divisions", "Stores", "Weekly Sales", "Cost Standards"];

export async function GET() {
  const token = process.env.AIRTABLE_TOKEN;
  const base = process.env.AIRTABLE_BASE_ID;

  const out: Record<string, unknown> = {
    tokenPresent: Boolean(token),
    tokenLooksRight: token ? token.startsWith("pat") : false,
    tokenLength: token ? token.length : 0,
    basePresent: Boolean(base),
    baseLooksRight: base ? base.startsWith("app") : false,
    baseValue: base ?? null, // base IDs are not secret
  };

  if (!token || !base) {
    out.verdict =
      "Environment variables are missing from this deployment. Add them in " +
      "Vercel project settings, then REDEPLOY — env vars only apply to " +
      "deployments created after they are added.";
    return NextResponse.json(out, { status: 200 });
  }

  // 1. Can we authenticate and see the base schema?
  try {
    const res = await fetch(
      `https://api.airtable.com/v0/meta/bases/${base}/tables`,
      { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }
    );
    out.schemaStatus = res.status;

    if (res.ok) {
      const json = await res.json();
      const names: string[] = (json.tables ?? []).map((t: any) => t.name);
      out.tablesFound = names;
      out.missingTables = EXPECTED.filter((n) => !names.includes(n));
      out.extraTables = names.filter((n) => !EXPECTED.includes(n));
    } else {
      out.schemaError = (await res.text()).slice(0, 300);
      out.schemaNote =
        "403 here usually means the token lacks schema.bases:read, which is " +
        "fine — the record check below is what matters.";
    }
  } catch (e: any) {
    out.schemaError = String(e?.message ?? e);
  }

  // 2. Can we actually read records from each table?
  const reads: Record<string, string> = {};
  for (const table of EXPECTED) {
    try {
      const res = await fetch(
        `https://api.airtable.com/v0/${base}/${encodeURIComponent(
          table
        )}?maxRecords=1`,
        { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }
      );
      if (res.ok) {
        const json = await res.json();
        reads[table] = `OK (${json.records?.length ?? 0} record sampled)`;
      } else {
        const body = (await res.text()).slice(0, 200);
        reads[table] = `${res.status} ${body}`;
      }
    } catch (e: any) {
      reads[table] = `fetch failed: ${String(e?.message ?? e)}`;
    }
  }
  out.tableReads = reads;

  const allOk = Object.values(reads).every((v) => v.startsWith("OK"));
  out.verdict = allOk
    ? "Airtable is reachable and all four tables read correctly. If the " +
      "dashboard still errors, the problem is downstream of the fetch."
    : "At least one table could not be read. A 401 means a bad or revoked " +
      "token. A 403 means the token is not scoped to this base or lacks " +
      "data.records:read. A 404 means the base ID is wrong or a table name " +
      "does not match exactly, spaces included.";

  return NextResponse.json(out, { status: 200 });
}
