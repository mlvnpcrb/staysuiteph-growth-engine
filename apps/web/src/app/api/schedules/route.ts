import { createSchedulesHandlers } from "@staysuite/backend";
import { supabaseServer } from "@/lib/supabase";
import { environment } from "@/lib/env";
export const runtime = "nodejs";
const handlers = createSchedulesHandlers({
  configured: () => environment().configured,
  client: () => supabaseServer(),
});
export const GET = (request: Request) => handlers.GET(request);
export const POST = (request: Request) => handlers.POST(request);
