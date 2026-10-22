import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, SavedGroup, MarketingEvidence } from "@staysuite/types";
export function groupRepository(
  client: SupabaseClient<Database>,
  userId: string,
) {
  return {
    async duplicates(identities: string[]) {
      const result = await client
        .from("saved_groups")
        .select("identity")
        .eq("user_id", userId)
        .in("identity", identities);
      if (result.error) throw result.error;
      return result.data.map((row) => row.identity);
    },
    async find(id: string) {
      const result = await client
        .from("saved_groups")
        .select("*")
        .eq("id", id)
        .eq("user_id", userId)
        .maybeSingle();
      if (result.error) throw result.error;
      return result.data;
    },
    async list() {
      const now = new Date();
      const cutoff = new Date(now.getTime() - 30 * 86400000).toISOString();
      const [result, reviewed, unsuitable] = await Promise.all([
        client
          .from("saved_groups")
          .select("*", { count: "exact" })
          .eq("user_id", userId)
          .order("updated_at", { ascending: false })
          .limit(500),
        client
          .from("saved_groups")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId)
          .eq("review_status", "reviewed")
          .gte("last_reviewed_at", cutoff)
          .lte("last_reviewed_at", now.toISOString()),
        client
          .from("saved_groups")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId)
          .eq("review_status", "not_suitable"),
      ]);
      for (const response of [result, reviewed, unsuitable])
        if (response.error) throw response.error;
      const total = result.count ?? 0;
      const reviewedCount = reviewed.count ?? 0;
      return {
        groups: result.data ?? [],
        stats: {
          total,
          reviewed: reviewedCount,
          needsReview: Math.max(
            0,
            total - reviewedCount - (unsuitable.count ?? 0),
          ),
        },
      };
    },
    async save(
      input: Omit<
        Database["public"]["Tables"]["saved_groups"]["Insert"],
        "user_id"
      >,
    ) {
      const result = await client
        .from("saved_groups")
        .upsert(
          { ...input, user_id: userId },
          { onConflict: "user_id,identity", ignoreDuplicates: true },
        )
        .select("*")
        .maybeSingle();
      if (result.error) throw result.error;
      if (result.data) return { group: result.data, duplicate: false };
      const existing = await client
        .from("saved_groups")
        .select("*")
        .eq("user_id", userId)
        .eq("identity", input.identity)
        .single();
      if (existing.error) throw existing.error;
      return { group: existing.data, duplicate: true };
    },
    async update(
      id: string,
      input: Pick<
        SavedGroup,
        "notes" | "review_status" | "rule_evidence" | "last_reviewed_at"
      > & {
        destination?: string | undefined;
        accommodation?: string | undefined;
        audience?: string | undefined;
      },
    ) {
      const result = await client
        .from("saved_groups")
        .update(input)
        .eq("id", id)
        .eq("user_id", userId)
        .select("*")
        .maybeSingle();
      if (result.error) throw result.error;
      return result.data;
    },
    async updateMarketing(id: string, evidence: MarketingEvidence) {
      const result = await client
        .from("saved_groups")
        .update({ marketing_evidence: evidence })
        .eq("id", id)
        .eq("user_id", userId)
        .select("*")
        .maybeSingle();
      if (result.error) throw result.error;
      return result.data;
    },
    async remove(id: string) {
      const result = await client
        .from("saved_groups")
        .delete()
        .eq("id", id)
        .eq("user_id", userId)
        .select("id");
      if (result.error) throw result.error;
      return result.data.length > 0;
    },
  };
}
