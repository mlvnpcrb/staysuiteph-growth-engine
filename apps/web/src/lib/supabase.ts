import "server-only";
import { cookies } from "next/headers";
import { serverDatabase } from "@staysuite/database";
import { environment } from "./env";
export async function supabaseServer() {
  const { url, key } = environment();
  if (!url || !key) throw new Error("Supabase is not configured");
  const store = await cookies();
  return serverDatabase(url, key, {
    getAll: () => store.getAll(),
    setAll: (values) => {
      try {
        for (const { name, value, options } of values)
          store.set(name, value, options);
      } catch {
        /* Server Components cannot write cookies; proxy refreshes sessions. */
      }
    },
  });
}
