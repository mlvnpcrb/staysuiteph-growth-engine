import type {
  GroupSearch,
  SavedGroup,
  GroupAssessment,
} from "@staysuite/types";
export function discoveryLinks(search: GroupSearch) {
  const query = `${search.destination} ${search.accommodation} ${search.audience === "Guests" ? "accommodation staycation rentals" : "accommodation hosts property owners"}`;
  return {
    query,
    facebook: `https://www.facebook.com/search/groups/?q=${encodeURIComponent(query)}`,
    web: `https://www.google.com/search?q=${encodeURIComponent("site:facebook.com/groups/ " + query)}`,
  };
}
export function assessGroup(
  group: { title: string; evidence: string },
  search: GroupSearch,
): GroupAssessment {
  const text = `${group.title} ${group.evidence}`.toLocaleLowerCase();
  const location = text.includes(search.destination.toLocaleLowerCase());
  const accommodation = text.includes(search.accommodation.toLocaleLowerCase());
  const words =
    search.audience === "Hosts"
      ? ["host", "owner", "landlord"]
      : ["rental", "staycation", "accommodation", "travel", "guest"];
  const audience = words.some((word) => text.includes(word));
  const reasons = [
    location
      ? `Supplied text mentions ${search.destination}.`
      : "Destination fit is not established by the supplied text.",
    accommodation
      ? `Supplied text mentions ${search.accommodation.toLowerCase()}.`
      : "Accommodation type needs personal review.",
    audience
      ? "Supplied text contains a relevant audience keyword."
      : "Audience fit needs personal review.",
  ];
  return {
    mode: "rule_based",
    score: (location ? 45 : 0) + (accommodation ? 25 : 0) + (audience ? 30 : 0),
    confidence: group.evidence && location ? "medium" : "low",
    reasons,
    unknowns: [
      "Text is user-supplied and has not been independently verified.",
      "Member count, activity, access and current posting permissions are unknown.",
      "Relevance does not establish permission to publish.",
    ],
  };
}
export function effectiveReview(
  group: Pick<
    SavedGroup,
    "review_status" | "last_reviewed_at" | "rule_evidence"
  >,
  now = Date.now(),
) {
  if (group.review_status === "not_suitable") return "not_suitable";
  return group.review_status === "reviewed" &&
    group.rule_evidence.trim() &&
    group.last_reviewed_at &&
    now - new Date(group.last_reviewed_at).getTime() >= 0 &&
    now - new Date(group.last_reviewed_at).getTime() < 30 * 86400000
    ? "reviewed"
    : "review_required";
}
export function groupOverview(groups: SavedGroup[], now = Date.now()) {
  return {
    total: groups.length,
    reviewed: groups.filter((g) => effectiveReview(g, now) === "reviewed")
      .length,
    needsReview: groups.filter(
      (g) => effectiveReview(g, now) === "review_required",
    ).length,
    recent: [...groups]
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
      .slice(0, 5),
  };
}
