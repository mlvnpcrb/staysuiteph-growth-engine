export default function Loading() {
  return (
    <div className="page" role="status" aria-label="Loading workspace">
      <div className="skeleton h-10 w-64" />
      <div className="mt-6 grid gap-5 sm:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="skeleton h-36" />
        ))}
      </div>
      <div className="skeleton mt-6 h-80" />
      <span className="sr-only">Loading workspace…</span>
    </div>
  );
}
