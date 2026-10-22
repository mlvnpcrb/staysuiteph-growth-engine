import { NextRequest, NextResponse } from "next/server";
import { tokenDatabase } from "@staysuite/database";
import { bearerToken } from "@staysuite/validation";
import { environment } from "@/lib/env";
export async function GET(request: NextRequest) {
  const headers = { "Cache-Control": "private, no-store" };
  const token = bearerToken(request.headers.get("authorization"));
  if (!token)
    return NextResponse.json(
      { error: "unauthorized" },
      { status: 401, headers },
    );
  const { url, key } = environment();
  if (!url || !key)
    return NextResponse.json(
      { error: "backend_not_configured" },
      { status: 503, headers },
    );
  const client = tokenDatabase(url, key, token);
  const {
    data: { user },
    error,
  } = await client.auth.getUser(token);
  if (error || !user)
    return NextResponse.json(
      { error: "unauthorized" },
      { status: 401, headers },
    );
  return NextResponse.json(
    {
      userId: user.id,
      serverTime: new Date().toISOString(),
      integration: "not_connected",
    },
    { headers },
  );
}
