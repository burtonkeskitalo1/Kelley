import { redirect } from "next/navigation";
import { getDivisions } from "@/lib/airtable";
import { Masthead } from "@/components/ui";

// Resolved per request: this only picks the first division with data and
// forwards to it, so there is nothing worth prerendering.
export const dynamic = "force-dynamic";

export default async function Home() {
  const divisions = await getDivisions();
  const first = divisions.find((d) => d.storeCount > 0);

  if (first) redirect(`/${first.slug}`);

  return (
    <>
      <Masthead />
      <main className="wrap" style={{ paddingTop: "3rem" }}>
        <div className="notice">
          <h2>No division data yet</h2>
          <p>
            The base is reachable but no division has stores loaded. Import the
            Stores table, then reload.
          </p>
        </div>
      </main>
    </>
  );
}
