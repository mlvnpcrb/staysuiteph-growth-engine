import Link from "next/link";
export default function NotFound() {
  return (
    <main className="page">
      <h1>Page not found</h1>
      <p className="my-5">This workspace section does not exist.</p>
      <Link href="/dashboard/overview" className="text-teal-700 underline">
        Return to overview
      </Link>
    </main>
  );
}
