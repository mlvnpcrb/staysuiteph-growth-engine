import { groupCollectionSchema, type GroupCollection } from "@staysuite/validation";

export const BATCH_LIMIT = 100;
export const DRAFT_TTL_MS = 4 * 60 * 60 * 1000;

/** Inputs have crossed the collection schema boundary; never replace prior choices. */
export function appendCollection(
  previous: GroupCollection | null,
  incoming: GroupCollection,
  selected: ReadonlySet<string>,
) {
  const groups = [...(previous?.groups ?? [])];
  const seen = new Set(groups.map((group) => group.url));
  const nextSelected = new Set(selected);
  let added = 0;
  let overflow = 0;
  for (const group of incoming.groups) {
    if (seen.has(group.url)) continue;
    seen.add(group.url);
    if (groups.length >= BATCH_LIMIT) {
      overflow++;
      continue;
    }
    groups.push(group);
    nextSelected.add(group.url);
    added++;
  }
  return {
    collection: { ...incoming, groups },
    selected: nextSelected,
    added,
    overflow,
  };
}

export function restoreCollectionDraft(value: unknown, origin: string, now = Date.now()) {
  if (!value || typeof value !== "object") return null;
  if (!("origin" in value) || value.origin !== origin ||
      !("saved_at" in value) || typeof value.saved_at !== "number" ||
      value.saved_at > now || now - value.saved_at >= DRAFT_TTL_MS ||
      !("collection" in value) || !("selected" in value) || !Array.isArray(value.selected)) return null;
  const parsed = groupCollectionSchema.safeParse(value.collection);
  if (!parsed.success) return null;
  const choices: unknown[] = value.selected;
  const selected = new Set(parsed.data.groups.filter(group => choices.includes(group.url)).map(group => group.url));
  return { collection: parsed.data, selected };
}
