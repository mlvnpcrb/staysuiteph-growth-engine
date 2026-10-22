import { test } from "node:test";
import assert from "node:assert/strict";
import {
  startupSummary,
  errorAnnotation,
} from "../../scripts/report-supabase-start.mjs";
test("startup diagnostics never publish credential families or connection strings", () => {
  const log =
    "postgres Error Get https://public.ecr.aws/v2/: Forbidden\nError JWT eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.c2lnbmF0dXJl\nfailed key sb_secret_fixture123\nError postgres://postgres:fixture-password@localhost/db\nError password=fixture-password access_token=fixture-token";
  const summary = startupSummary(log);
  for (const secret of [
    "eyJhbGciOiJIUzI1NiJ9",
    "sb_secret_fixture123",
    "fixture-password",
    "fixture-token",
  ])
    assert.equal(summary.includes(secret), false);
  assert.match(summary, /registry.*Forbidden/);
});
test("startup diagnostics retain actionable errors and cap output", () => {
  assert.match(
    startupSummary(
      "Downloading\npostgres Error Get https://public.ecr.aws/v2/: Forbidden",
    ),
    /public\.ecr\.aws.*Forbidden/,
  );
  assert.ok(startupSummary("Error " + "x".repeat(5000)).length <= 2500);
});
test("annotation content cannot create another workflow command line", () => {
  const annotation = errorAnnotation("failed%\n::notice::unexpected");
  assert.equal(annotation.includes("\n"), false);
  assert.match(annotation, /%25%0A/);
});
