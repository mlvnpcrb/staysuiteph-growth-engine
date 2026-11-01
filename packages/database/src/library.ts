import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@staysuite/types";
export function libraryRepository(client: SupabaseClient<Database>) {
  return {
    async snapshot() {
      const result = await client.rpc("library_snapshot", {});
      if (result.error) throw result.error;
      return result.data;
    },
    async command(
      id: string,
      revision: number,
      operation: string,
      payload: Json,
    ) {
      const result = await client.rpc("library_command", {
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
