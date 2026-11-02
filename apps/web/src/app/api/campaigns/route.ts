import { createCampaignsHandlers } from "@staysuite/backend";
import { supabaseServer } from "@/lib/supabase";
import { environment } from "@/lib/env";
export const runtime = "nodejs";
const handlers = createCampaignsHandlers({
  configured: () => environment().configured,
  client: () => supabaseServer(),
});
export const GET = (request: Request) => handlers.GET(request);
export const POST = (request: Request) => handlers.POST(request);
export const DELETE = (request: Request) => handlers.DELETE(request);
