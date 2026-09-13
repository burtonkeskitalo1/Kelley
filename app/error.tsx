"use client";

export default function Error({ error }: { error: Error }) {
  return (
    <main className="wrap" style={{ paddingTop: "3rem" }}>
      <div className="notice">
        <h2>This page could not load its data</h2>
        <p>{error.message}</p>
        <p>
          Check that <code>AIRTABLE_TOKEN</code> and{" "}
          <code>AIRTABLE_BASE_ID</code> are set, that the token has{" "}
          <code>data.records:read</code> on this base, and that the tables are
          named <code>Divisions</code>, <code>Stores</code>,{" "}
          <code>Weekly Sales</code> and <code>Cost Standards</code>.
        </p>
      </div>
    </main>
  );
}
