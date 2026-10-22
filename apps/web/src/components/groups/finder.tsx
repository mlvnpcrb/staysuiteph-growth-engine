"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Compass, ExternalLink, Search, Sparkles } from "lucide-react";
import { Button } from "@staysuite/ui";
import {
  addGroupSchema,
  searchGroupsSchema,
  discoveryLinks,
  assessGroup,
} from "@staysuite/validation";
import type { GroupSearch } from "@staysuite/types";
import { groupRequest } from "./use-groups";
import { CollectionImport } from "./collection-import";
type Candidate = ReturnType<typeof addGroupSchema.parse>;
export function GroupFinder() {
  const [search, setSearch] = useState<GroupSearch>({
    destination: "",
    accommodation: "Condo",
    audience: "Guests",
  });
  const [submitted, setSubmitted] = useState<GroupSearch | null>(null);
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const params = Object.fromEntries(
      new URLSearchParams(window.location.search),
    );
    const parsed = searchGroupsSchema.safeParse(params);
    if (parsed.success) {
      setSearch(parsed.data);
      setSubmitted(parsed.data);
    }
  }, []);
  const links = submitted ? discoveryLinks(submitted) : null;
  const assessment = candidate ? assessGroup(candidate, candidate) : null;
  return (
    <div className="page group-workspace">
      <div className="page-heading">
        <div>
          <span className="eyebrow">Find your next community</span>
          <h1>Group Finder</h1>
          <p className="muted">
            Start with a place. Build a shortlist worth getting to know.
          </p>
        </div>
        <Link className="welcome-link" href="/dashboard/my-groups">
          View My Groups
        </Link>
      </div>
      <section className="panel finder-search">
        <div className="flex items-center gap-3">
          <Compass size={25} />
          <h2>Where are you hosting?</h2>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const parsed = searchGroupsSchema.safeParse(search);
            if (!parsed.success) {
              setError("Enter a destination with at least two characters.");
              return;
            }
            setSubmitted(parsed.data);
            setCandidate(null);
            setMessage("");
            setError("");
            window.history.replaceState(
              null,
              "",
              `?${new URLSearchParams(parsed.data)}`,
            );
          }}
        >
          <div className="finder-fields">
            <label>
              Destination
              <input
                name="destination"
                placeholder="e.g. Cebu City"
                value={search.destination}
                onChange={(e) =>
                  setSearch({ ...search, destination: e.target.value })
                }
                minLength={2}
                maxLength={100}
                required
              />
            </label>
            <label>
              Accommodation
              <select
                value={search.accommodation}
                onChange={(e) =>
                  setSearch({
                    ...search,
                    accommodation: e.target
                      .value as GroupSearch["accommodation"],
                  })
                }
              >
                {[
                  "Condo",
                  "Apartment",
                  "Hotel",
                  "Resort",
                  "Vacation rental",
                ].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
            <label>
              Target audience
              <select
                value={search.audience}
                onChange={(e) =>
                  setSearch({
                    ...search,
                    audience: e.target.value as GroupSearch["audience"],
                  })
                }
              >
                <option>Guests</option>
                <option>Hosts</option>
              </select>
            </label>
          </div>
          <Button type="submit">
            <Search size={17} />
            Find search ideas
          </Button>
        </form>
      </section>
      {links && (
        <section className="panel discovery-panel">
          <span className="subtle-badge">Search-assisted discovery</span>
          <h2>Explore real communities</h2>
          <p className="muted">
            Automatic search is not connected. Open these searches, then bring
            back a group link you want to assess.
          </p>
          <p className="search-query">{links.query}</p>
          <div className="group-actions">
            <Button asChild>
              <a
                href={links.facebook}
                target="_blank"
                rel="noopener noreferrer"
              >
                Search Facebook Groups <ExternalLink size={16} />
              </a>
            </Button>
            <Button asChild variant="outline">
              <a href={links.web} target="_blank" rel="noopener noreferrer">
                Search the web <ExternalLink size={16} />
              </a>
            </Button>
          </div>
          <p className="muted text-sm">
            Search engines may show incomplete or old information. No groups
            have been discovered or verified automatically.
          </p>
        </section>
      )}
      <CollectionImport search={search} />
      <div className="finder-columns">
        <section className="panel">
          <h2>Add a group to assess</h2>
          <p className="muted">
            Use a real Facebook Group link. Details you enter stay marked as
            user-supplied.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setMessage("");
              setError("");
              const form = new FormData(e.currentTarget);
              const parsed = addGroupSchema.safeParse({
                ...search,
                url: form.get("url"),
                title: form.get("title"),
                evidence: form.get("evidence"),
              });
              if (!parsed.success) {
                setError(
                  parsed.error.issues[0]?.message ?? "Check the details.",
                );
                return;
              }
              setCandidate(parsed.data);
            }}
          >
            <label>
              Facebook Group URL
              <input
                name="url"
                type="url"
                placeholder="https://www.facebook.com/groups/…"
                required
                maxLength={500}
              />
            </label>
            <label>
              Group name
              <input
                name="title"
                required
                minLength={2}
                maxLength={160}
                placeholder="Name shown on Facebook"
              />
            </label>
            <label>
              Description or evidence
              <textarea
                name="evidence"
                rows={4}
                maxLength={2000}
                placeholder="Paste a description you can personally see. Do not include member details."
              />
            </label>
            <p className="muted text-sm">
              Destination, accommodation and audience above guide the
              assessment. Facebook content is never fetched by StaySuite.
            </p>
            <Button type="submit" variant="outline">
              <Sparkles size={16} />
              Assess this group
            </Button>
          </form>
        </section>
        <section className="panel assessment-panel" aria-live="polite">
          {candidate && assessment ? (
            <>
              <span className="subtle-badge">
                Rule-based assessment · AI not connected
              </span>
              <h2>{candidate.title}</h2>
              <a
                className="group-source"
                href={candidate.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                Open original group <ExternalLink size={15} />
              </a>
              <div className="assessment-score">
                <strong>
                  {assessment.score}
                  <small>/100</small>
                </strong>
                <span>
                  Text relevance
                  <br />
                  <b>{assessment.confidence} confidence</b>
                </span>
              </div>
              <ul className="evidence-list">
                {assessment.reasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
              {candidate.evidence && (
                <blockquote className="group-evidence">
                  {candidate.evidence}
                </blockquote>
              )}
              <h3>What is still unknown?</h3>
              <ul className="muted text-sm evidence-list">
                {assessment.unknowns.map((v) => (
                  <li key={v}>{v}</li>
                ))}
              </ul>
              <div className="group-actions">
                <Button
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    setError("");
                    setMessage("");
                    try {
                      const result = await groupRequest("POST", candidate);
                      setMessage(
                        result.duplicate
                          ? "This group is already in your shortlist."
                          : "Group saved to My Groups.",
                      );
                    } catch (e) {
                      setError(
                        e instanceof Error
                          ? e.message
                          : "Could not save this group.",
                      );
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  {busy ? "Saving…" : "Save to My Groups"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setCandidate(null);
                    setMessage("Candidate dismissed.");
                  }}
                >
                  Dismiss
                </Button>
              </div>
            </>
          ) : (
            <div className="assessment-empty">
              <Sparkles size={30} />
              <h2>A little context goes a long way</h2>
              <p className="muted">
                Add a group and its description to see evidence-based relevance,
                confidence and next review steps. No groups or statistics are
                invented.
              </p>
            </div>
          )}
        </section>
      </div>
      {error && (
        <p role="alert" className="group-error">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="group-success">
          {message} <Link href="/dashboard/my-groups">Open My Groups</Link>
        </p>
      )}
    </div>
  );
}
