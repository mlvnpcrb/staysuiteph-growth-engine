import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@staysuite/types";
import { campaignJobSchema, type CampaignCommand } from "@staysuite/validation";
export function campaignRepository(
  client: SupabaseClient<Database>,
  userId: string,
) {
  return {
    async list() {
      const result = await client
        .from("campaign_jobs")
        .select("*")
        .eq("user_id", userId)
        .order("updated_at", { ascending: false })
        .limit(100);
      if (result.error) throw result.error;
      return result.data;
    },
    async command(input: CampaignCommand) {
      const payload: Json = JSON.parse(JSON.stringify(input.payload));
      const result = await client.rpc("campaign_command", {
        p_id: input.id,
        p_revision: input.revision,
        p_command: input.command,
        p_payload: payload,
      });
      if (result.error) throw result.error;
      const job = campaignJobSchema.parse(result.data);
      if (job.user_id !== userId) throw new Error("Campaign owner mismatch");
      return job;
    },
  };
}
