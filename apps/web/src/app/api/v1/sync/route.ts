import { NextResponse } from "next/server";
import { tokenDatabase } from "@staysuite/database";
import { bearerToken } from "@staysuite/validation";
import { environment } from "@/lib/env";
export async function GET(request: Request) {
  const headers = { "Cache-Control": "private, no-store" };
  const failure = (status: number, error: string) =>
    NextResponse.json(
      { error },
      {
        status,
        headers:
          status === 401
            ? { ...headers, "WWW-Authenticate": 'Bearer realm="staysuite"' }
            : headers,
      },
    );
  const token = bearerToken(request.headers.get("authorization"));
  if (!token) return failure(401, "unauthorized");
  const { url, key } = environment();
  if (!url || !key) return failure(503, "backend_not_configured");
  try {
    const client = tokenDatabase(url, key, token);
    const {
      data: { user },
      error,
    } = await client.auth.getUser(token);
    if (error && (error.status === 0 || (error.status ?? 0) >= 500))
      return failure(503, "backend_unavailable");
    if (error || !user) return failure(401, "unauthorized");
    return NextResponse.json(
      {
        userId: user.id,
        serverTime: new Date().toISOString(),
        integration: "not_connected",
      },
      { headers },
    );
  } catch {
    // Fail closed without exposing backend details or request credentials.
    return failure(503, "backend_unavailable");
  }
}
