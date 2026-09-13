import Link from "next/link";
import { Masthead } from "@/components/ui";

export default function NotFound() {
  return (
    <>
      <Masthead />
      <main className="wrap" style={{ paddingTop: "3rem" }}>
        <div className="notice">
          <h2>No such division</h2>
          <p>That division either does not exist or has no data loaded yet.</p>
          <p>
            <Link href="/" style={{ textDecoration: "underline" }}>
              Back to the dashboard
            </Link>
          </p>
        </div>
      </main>
    </>
  );
}
