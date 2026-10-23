import type { SavedGroup } from "@staysuite/types";
import { categorizeGroupName } from "./group-categories";
import { rankGroupMarketing } from "./group-marketing";
/** Topic triage only: names are not evidence of reach, activity or permission. */
export function assessPostingPriority(group: SavedGroup, now = Date.now()) {
  const report = rankGroupMarketing(group, now);
  const categories = categorizeGroupName(group.title);
  const text = ` ${group.title.normalize("NFKC").toLocaleLowerCase("en").replace(/[^\p{L}\p{N}]+/gu, " ")} `;
  const host = categories.some(c => c.id === "hosts") || /\b(?:hosts?|owners?)\b/.test(text) && /\b(?:airbnb|transient|condo)\b/.test(text);
  const stay = categories.some(c => ["staycation", "airbnb", "resorts"].includes(c.id)) || /\b(?:homestay|homestays|accommodations?|lodging)\b/.test(text);
  const mixed = /\b(?:buy|sell|sale|installment|assume|long term|monthly)\b/.test(text);
  const adjacent = categories.some(c => ["travel", "property"].includes(c.id)) || /\b(?:houses?|rooms?) for rent\b/.test(text);
  if (report.readiness === "blocked") return { priority: 0, label: "Do not shortlist for posting", reason: "Marked not suitable or promotional content recorded as prohibited.", basis: "Saved rule review and marketing evidence" };
  if (host) return { priority: 2, label: "Consider for host referrals", reason: "The name suggests a host or owner community. Review for partnerships rather than assuming guests are looking to book.", basis: "Group name only · low confidence" };
  if (stay && !mixed) return { priority: 4, label: "Review first for accommodation posts", reason: "The name explicitly mentions short stays or accommodation. Check that the destination matches your offer before posting.", basis: "Group name only · low confidence" };
  if (stay || adjacent) return { priority: 1, label: "Check the audience first", reason: "The name suggests travel, property or mixed rental interests. Short-stay booking intent is unconfirmed.", basis: "Group name only · low confidence" };
  return { priority: 0, label: "No clear accommodation match", reason: "The saved name provides no clear accommodation signal. Review the group before adding it to a posting shortlist.", basis: "Group name only · low confidence" };
}
