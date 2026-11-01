import Link from "next/link";
import { Compass, Users, ArrowRight } from "lucide-react";
import { Button } from "@staysuite/ui";
import { SavedOverview } from "./groups/saved-overview";

export function Overview() {
  return (
    <div className="page growth-overview">
      <div className="page-heading">
        <div>
          <h1>Make room for growth.</h1>
          <p className="muted">Your groups, outstanding reviews, and next steps.</p>
        </div>
        <Button asChild>
          <Link href="/dashboard/group-finder"><Compass size={17} /> Find groups</Link>
        </Button>
      </div>
      <SavedOverview />
      <section className="growth-start panel" aria-labelledby="growth-start-title">
        <div className="growth-start-icon"><Users size={26} /></div>
        <div>
          <h2 id="growth-start-title">Build a shortlist that fits your stay</h2>
          <p className="muted">Find a community, save its link, then record the rules you personally reviewed.</p>
        </div>
        <Link className="growth-text-link" href="/dashboard/group-finder">Find your next group <ArrowRight size={17} /></Link>
      </section>
      <details className="growth-availability">
        <summary>What’s available in this workspace?</summary>
        <p>Search-assisted discovery, saved groups, personal rule reviews, and user-reported marketing evidence. Automatic discovery, AI generation, campaigns, and publishing are not connected.</p>
        <p>A personal rule review does not establish permission to publish.</p>
      </details>
    </div>
  );
}
