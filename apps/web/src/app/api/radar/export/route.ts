import { createRadarExportHandlers } from "@staysuite/backend";
import { supabaseServer } from "@/lib/supabase";
import { environment } from "@/lib/env";
export const runtime = "nodejs";
const handlers = createRadarExportHandlers({
  configured: () => environment().configured,
  client: () => supabaseServer(),
});
export const GET = (request: Request) => handlers.GET(request);
