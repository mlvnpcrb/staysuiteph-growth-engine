import { createPublisherHandlers } from "@staysuite/backend";
import { supabaseServer } from "@/lib/supabase";
import { environment } from "@/lib/env";
export const runtime = "nodejs";
const handlers = createPublisherHandlers({
  configured: () => environment().configured,
  client: () => supabaseServer(),
});
export const GET = (request?: Request) => handlers.GET(request);
