import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@staysuite/types";
export function automationFlowRepository(client: SupabaseClient<Database>) {
  return {
    async prepare(payload: Json) {
      const result = await client.rpc("automation_prepare_template", {
        p_payload: payload,
      });
      if (result.error) throw result.error;
      return result.data;
    },
    async snapshot(id: string | null = null, history = false) {
      const result = await client.rpc("automation_flow_snapshot", {
        p_id: id,
        p_history: history,
      });
      if (result.error) throw result.error;
      return result.data;
    },
    async command(
      id: string,
      revision: number,
      operation: string,
      payload: Json,
    ) {
      const result = await client.rpc("automation_flow_command", {
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
