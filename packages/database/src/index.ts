import { createClient } from "@supabase/supabase-js";
import {
  createBrowserClient,
  createServerClient,
  type CookieMethodsServer,
} from "@supabase/ssr";
import { publicEnvironmentSchema } from "@staysuite/validation";
import type { Database } from "@staysuite/types";
export function browserDatabase(url: string, key: string) {
  const env = publicEnvironmentSchema.parse({ url, key });
  return createBrowserClient<Database>(env.url, env.key);
}
export function serverDatabase(
  url: string,
  key: string,
  cookies: CookieMethodsServer,
) {
  const env = publicEnvironmentSchema.parse({ url, key });
  return createServerClient<Database>(env.url, env.key, { cookies });
}
export function tokenDatabase(url: string, key: string, token: string) {
  const env = publicEnvironmentSchema.parse({ url, key });
  return createClient<Database>(env.url, env.key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
