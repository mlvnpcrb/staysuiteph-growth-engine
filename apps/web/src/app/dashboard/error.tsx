"use client";
import { Button } from "@staysuite/ui";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div className="page">
      <h1>We couldn’t load this workspace.</h1>
      <p className="muted my-4">Check your connection, then try again.</p>
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
