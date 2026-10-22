import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Emit fixed diagnostic categories, never arbitrary log lines or environment values.
export function startupSummary(log) {
  const messages = [];
  if (/public\.ecr\.aws[^\r\n]{0,180}Forbidden/i.test(log))
    messages.push("Container registry public.ecr.aws returned Forbidden.");
  if (/too many requests|toomanyrequests|pull rate limit/i.test(log))
    messages.push("Container registry rate limit reached.");
  if (/manifest unknown|manifest[^\r\n]{0,80}not found/i.test(log))
    messages.push("A container image manifest was unavailable.");
  if (
    /cannot connect to the Docker daemon|permission denied[^\r\n]{0,100}docker\.sock/i.test(
      log,
    )
  )
    messages.push("Docker daemon access failed.");
  if (/failed to pull docker image/i.test(log))
    messages.push("Supabase could not pull a required Docker image.");
  if (/unhealthy|not ready|timed? ?out/i.test(log))
    messages.push("A local service did not become healthy before timeout.");
  if (/address already in use|port[^\r\n]{0,60}already allocated/i.test(log))
    messages.push("A required local port is already in use.");
  if (/SQLSTATE/i.test(log))
    messages.push(
      "Database initialization reported a SQL error; inspect the authorized log.",
    );
  return (
    messages.join(" | ") ||
    "Supabase startup failed; inspect the authorized job log for details."
  );
}
export function errorAnnotation(message) {
  return `::error title=Supabase startup failed::${message.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A")}`;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.error(
    errorAnnotation(startupSummary(readFileSync(process.argv[2], "utf8"))),
  );
}
