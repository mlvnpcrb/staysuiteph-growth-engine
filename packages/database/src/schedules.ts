import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@staysuite/types";
export function scheduleRepository(
  client: SupabaseClient<Database>,
  userId: string,
) {
  return {
    async list(campaignId?: string) {
      let query = client
        .from("campaign_schedules")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(200);
      if (campaignId) query = query.eq("campaign_id", campaignId);
      const result = await query;
      if (result.error) throw result.error;
      return result.data;
    },
    async runs() {
      const result = await client
        .from("campaign_schedule_runs")
        .select("*")
        .eq("user_id", userId)
        .order("scheduled_at", { ascending: false })
        .limit(100);
      if (result.error) throw result.error;
      return result.data;
    },
    async command(
      id: string,
      revision: number,
      operation: string,
      payload: Json,
    ) {
      const result = await client.rpc("schedule_command", {
        p_id: id,
        p_revision: revision,
        p_operation: operation,
        p_payload: payload,
      });
      if (result.error) throw result.error;
      return result.data;
    },
  };
}
