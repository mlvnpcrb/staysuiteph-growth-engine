import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@staysuite/types";
import type { RadarQuery } from "@staysuite/validation";
export function radarRepository(
  client: SupabaseClient<Database>,
  userId: string,
) {
  return {
    async settings(scope: string) {
      const result = await client
        .from("radar_settings")
        .select("*")
        .eq("user_id", userId)
        .eq("scope", scope)
        .maybeSingle();
      if (result.error) throw result.error;
      return result.data;
    },
    async leads(
      query: RadarQuery,
      cursor?: { at: string; id: string },
      before?: string,
    ) {
      let request = client
        .from("radar_leads")
        .select("*")
        .eq("user_id", userId)
        .eq("scope", query.scope)
        .is("deleted_at", null)
        .order("discovered_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(101);
      if (before) request = request.lte("discovered_at", before);
      if (query.status === "unread" || query.status === "read")
        request = request.eq("is_read", query.status === "read");
      if (query.status === "starred") request = request.eq("is_starred", true);
      if (query.stage) request = request.eq("stage", query.stage);
      if (query.keyword)
        request = request.contains("matched_keywords", [query.keyword]);
      if (query.search) {
        const term = query.search.replace(/[\\%_]/g, "\\$&");
        request = request.or(
          `author.ilike.${JSON.stringify("%" + term + "%")},text.ilike.${JSON.stringify("%" + term + "%")}`,
        );
      }
      if (cursor)
        request = request.or(
          `discovered_at.lt.${cursor.at},and(discovered_at.eq.${cursor.at},id.lt.${cursor.id})`,
        );
      const result = await request;
      if (result.error) throw result.error;
      return result.data;
    },
    async command(
      scope: string,
      revision: number,
      operation: string,
      payload: Json,
    ) {
      const result = await client.rpc("radar_command", {
        p_scope: scope,
        p_revision: revision,
        p_operation: operation,
        p_payload: payload,
      });
      if (result.error) throw result.error;
      return result.data;
    },
  };
}
