import { createFlowPrepareHandlers } from "@staysuite/backend";
import { supabaseServer } from "@/lib/supabase";
import { environment } from "@/lib/env";
export const runtime = "nodejs";
const handlers = createFlowPrepareHandlers({
  configured: () => environment().configured,
  client: () => supabaseServer(),
});
export const POST = (request: Request) => handlers.POST(request);
