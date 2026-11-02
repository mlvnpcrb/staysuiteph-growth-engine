import type { ComponentProps } from "react";
import type { ComposeEngineOpen } from "@staysuite/validation";
type SuiteRuntime = {
  request: typeof fetch;
  href: (href: string) => string;
  engine: (
    operation: "status" | "open",
    input?: ComposeEngineOpen,
  ) => Promise<unknown>;
};
let runtime: SuiteRuntime | null = null;
/** Installed only by the packaged extension; the website keeps its normal transport. */
export function installSuiteRuntime(value: SuiteRuntime) {
  runtime = value;
}
export const isNativeSuite = () => runtime !== null;
export const suiteFetch: typeof fetch = (input, init) =>
  runtime ? runtime.request(input, init) : fetch(input, init);
export function nativeEngineRequest(
  operation: "status" | "open",
  input?: ComposeEngineOpen,
) {
  return runtime?.engine(operation, input);
}
export function SuiteLink({ href = "", ...props }: ComponentProps<"a">) {
  return (
    <a
      {...props}
      href={
        runtime && href.startsWith("/dashboard/") ? runtime.href(href) : href
      }
    />
  );
}
export function SuiteImage({
  unoptimized: _unoptimized,
  ...props
}: ComponentProps<"img"> & { unoptimized?: boolean }) {
  void _unoptimized;
  return <img {...props} />;
}
