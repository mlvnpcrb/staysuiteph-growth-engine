import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@staysuite/types";
export type BackendServices = {
  configured: () => boolean;
  client: () => Promise<SupabaseClient<Database>>;
};
